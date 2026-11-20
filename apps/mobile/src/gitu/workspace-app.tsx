import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, ScrollView, Text, useColorScheme, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, Card, colors, ErrorNotice, Field, Mascot, s } from '../ui';
import { isLocalServer, workspaceNavigation, workspaceServerUrl, type ConnectionMode } from './server-address';
import { WORKSPACE_COMPAT_JS, WORKSPACE_LOADED_JS } from './workspace-runtime';
import { nativePushAction, pushPreferences } from './workspace-push';
import { pushBridgeScript, pushTarget, type PushTarget } from './push-protocol';
import { parseConnectLink } from './connect-link';

const initialAddress = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8321';
const savedServerFile = FileSystem.documentDirectory && FileSystem.documentDirectory + 'workspace-server.txt';
const savedThemeFile = FileSystem.documentDirectory && FileSystem.documentDirectory + 'workspace-theme.txt';
const DARK_CANVAS = '#111112';
type LoadFailure = { title: string; detail: string };
function loadFailure(description: string): LoadFailure {
  const code = String(description || '');
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/i.test(code)) {
    return {
      title: "You're offline",
      detail: 'This phone cannot reach your workspace. Agent Gitu keeps running on its server; reconnect and try again.',
    };
  }
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_CONNECTION_RESET/i.test(code)) {
    return {
      title: "Can't reach your workspace",
      detail: 'The server did not answer. Check that it is running and that this phone is on the right network.',
    };
  }
  return {
    title: "Can't load your workspace",
    detail: 'The page did not load. Check the server address and your network, then try again.',
  };
}
function initialMode(): ConnectionMode {
  try {
    return isLocalServer(new URL(initialAddress).hostname) ? 'local' : 'remote';
  } catch {
    return 'local';
  }
}

export default function WorkspaceApp() {
  const pushRequested = useRef(false);
  const lastNotification = useRef('');
  const [notificationTarget, setNotificationTarget] = useState<PushTarget>();
  const [server, setServer] = useState<string>();
  const [restoring, setRestoring] = useState(true);
  const [mode, setMode] = useState<ConnectionMode>(initialMode);
  const [localAddress, setLocalAddress] = useState(initialMode() === 'local' ? initialAddress : 'http://10.0.2.2:8321');
  const [remoteAddress, setRemoteAddress] = useState(initialMode() === 'remote' ? initialAddress : '');
  const [error, setError] = useState('');
  const scheme = useColorScheme();
  const [workspaceTheme, setWorkspaceTheme] = useState<'light' | 'dark'>();
  // The WebView covers the screen, but its native background is visible during
  // keyboard resizes and page loads. Keep it on the workspace canvas instead of
  // a fixed light color so dark mode never flashes white.
  const theme = workspaceTheme ?? (scheme === 'dark' ? 'dark' : 'light');
  const workspaceCanvas = theme === 'dark' ? DARK_CANVAS : colors.canvas;
  // The root view is what shows through while the keyboard resizes the WebView.
  // Keep it on the workspace canvas as well, not just the React tree's views.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(server ? workspaceCanvas : colors.canvas).catch(() => {});
  }, [server, workspaceCanvas]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (savedServerFile) {
        try {
          const saved = await FileSystem.readAsStringAsync(savedServerFile);
          const savedMode = isLocalServer(new URL(saved).hostname) ? 'local' : 'remote';
          const normalized = workspaceServerUrl(saved, savedMode);
          if (!cancelled && !pushRequested.current) {
            setMode(savedMode);
            (savedMode === 'local' ? setLocalAddress : setRemoteAddress)(normalized);
            setServer(normalized);
          }
        } catch { /* First launch or an invalid preference opens connection settings. */ }
      }
      if (savedThemeFile) {
        try {
          const savedTheme = (await FileSystem.readAsStringAsync(savedThemeFile)).trim();
          if (!cancelled && (savedTheme === 'light' || savedTheme === 'dark')) setWorkspaceTheme(savedTheme);
        } catch { /* First launch follows the system theme. */ }
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => { cancelled = true; };
  }, []);
  // Onboarding QR: agentgitu://connect?server=… fills the address, but the
  // user still confirms it. Never switch a workspace that is already open.
  useEffect(() => {
    const apply = (raw: string | null) => {
      if (server) return;
      const link = parseConnectLink(raw);
      if (!link) return;
      setMode(link.mode);
      (link.mode === 'local' ? setLocalAddress : setRemoteAddress)(link.server);
      setError('');
    };
    void Linking.getInitialURL().then(apply).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => apply(url));
    return () => subscription.remove();
  }, [server]);
  useEffect(() => {
    let cancelled = false;
    const receive = async (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (lastNotification.current === id) return;
      lastNotification.current = id;
      const saved = await pushPreferences();
      const target = pushTarget(response.notification.request.content.data, saved.workspaces);
      if (!target || cancelled) return;
      const nextMode = isLocalServer(new URL(target.server).hostname) ? 'local' : 'remote';
      const normalized = workspaceServerUrl(target.server, nextMode);
      pushRequested.current = true;
      setMode(nextMode);
      (nextMode === 'local' ? setLocalAddress : setRemoteAddress)(normalized);
      setServer(normalized);
      setNotificationTarget(target);
      await Notifications.clearLastNotificationResponseAsync();
    };
    const listener = Notifications.addNotificationResponseReceivedListener(response => { void receive(response).catch(() => {}); });
    void Notifications.getLastNotificationResponseAsync().then(response => response && receive(response)).catch(() => {});
    return () => { cancelled = true; listener.remove(); };
  }, []);
  const address = mode === 'local' ? localAddress : remoteAddress;
  const open = () => {
    try {
      const normalized = workspaceServerUrl(address, mode);
      setServer(normalized);
      if (savedServerFile) void FileSystem.writeAsStringAsync(savedServerFile, normalized).catch(() => {});
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check your server address.');
    }
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" hidden={!!server} />
      {/* The full-screen workspace must not reserve the hidden status bar's top inset. */}
      <SafeAreaView
        edges={server ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}
        style={{ flex: 1, backgroundColor: server ? workspaceCanvas : colors.canvas }}
      >
        {restoring ? <ActivityIndicator color={colors.blueDark} style={{ flex: 1 }} /> : server ? (
          <Workspace
            key={server}
            server={server}
            close={() => setServer(undefined)}
            target={notificationTarget}
            opened={() => setNotificationTarget(undefined)}
            theme={theme}
            onTheme={setWorkspaceTheme}
          />
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <View style={{ width: '100%', maxWidth: 440, gap: 22 }}>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <Mascot size={80} />
                  <Text style={[s.title, { fontSize: 30 }]}>Your Gitu workspace</Text>
                  <Text style={[s.muted, { textAlign: 'center' }]}>The same chats, projects, teams, and settings on your phone.</Text>
                </View>
                <Card>
                  <View style={[s.row, { gap: 10, marginBottom: 20, flexWrap: 'wrap' }]}>
                    <Button
                      primary={mode === 'local'}
                      onPress={() => {
                        setMode('local');
                        setError('');
                      }}
                    >
                      Local network
                    </Button>
                    <Button
                      primary={mode === 'remote'}
                      onPress={() => {
                        setMode('remote');
                        setError('');
                      }}
                    >
                      Remote server
                    </Button>
                  </View>
                  <Field
                    label="Server address"
                    value={address}
                    onChangeText={mode === 'local' ? setLocalAddress : setRemoteAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder={mode === 'local' ? 'http://192.168.1.10:8321' : 'https://gitu.example.com'}
                    onSubmitEditing={open}
                  />
                  <Text style={[s.small, { marginTop: -8, marginBottom: 16 }]}>
                    On your computer, scan the QR code on Gitu&apos;s setup screen with this phone&apos;s camera to fill in the address.
                  </Text>
                  <ErrorNotice error={error} />
                  <Button primary disabled={!address.trim()} onPress={open}>
                    Open workspace
                  </Button>
                  <Text style={[s.muted, { marginTop: 18 }]}>
                    {mode === 'local'
                      ? 'Connect to the same Wi-Fi as your Gitu computer. Use its private IP address. The emulator uses 10.0.2.2.'
                      : 'Enter your hosted Gitu HTTPS address. Sign in with the account registered on that server.'}
                  </Text>
                  <Text style={[s.small, { marginTop: 12 }]}>
                    {mode === 'local'
                      ? 'Phone access starts with the Gitu desktop app. HTTP sends passwords and workspace data unencrypted; use only trusted Wi-Fi, or use HTTPS.'
                      : 'Your server’s certificate must be trusted by Android.'}
                  </Text>
                </Card>
                <Text style={[s.small, { textAlign: 'center' }]}>
                  Sign in inside your workspace. Create the first account on the Gitu computer. Tasks keep running on the server when you leave.
                </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Workspace({
  server,
  close,
  target,
  opened,
  theme,
  onTheme,
}: {
  server: string;
  close: () => void;
  target?: PushTarget;
  opened: () => void;
  theme: 'light' | 'dark';
  onTheme: (theme: 'light' | 'dark') => void;
}) {
  const background = theme === 'dark' ? DARK_CANVAS : colors.canvas;
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<LoadFailure>();
  const [reloadKey, setReloadKey] = useState(0);
  const [showRootBack, setShowRootBack] = useState(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const backPending = useRef(false);
  const [source] = useState({ uri: server + '/' });
  const [bridgeNonce] = useState(() => {
    const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  });
  const bridgeScript = pushBridgeScript(bridgeNonce);
  // The web workspace owns the theme. Report it (and every change) so the
  // native background, status bar and resize gutters follow the same canvas.
  const themeBridgeScript = `(function(){function report(){try{var t=document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gitu-theme',nonce:${JSON.stringify(bridgeNonce)},theme:t}));}catch(e){}}report();if(!window.__gituThemeBridge){window.__gituThemeBridge=true;if(window.MutationObserver)new MutationObserver(report).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}})();true;`;
  const currentUrl = useRef(source.uri);
  const openNotification = () => {
    if (target?.server !== server) return;
    const payload = JSON.stringify(target).replace(/</g, '\\u003c');
    web.current?.injectJavaScript(`if (window.gituOpenPushTarget) { Promise.resolve(window.gituOpenPushTarget(${payload})).then(function () { window.ReactNativeWebView.postMessage(JSON.stringify({type:'gitu-push-opened',nonce:${JSON.stringify(bridgeNonce)},targetId:${JSON.stringify(target.targetId)}})); }).catch(function () {}); } true;`);
  };
  useEffect(openNotification, [target, server]);
  useEffect(() => {
    const sync = () => web.current?.injectJavaScript('if(window.gituAndroidPush)window.gituAndroidPush.sync().catch(function(){}); true;');
    const state = AppState.addEventListener('change', next => { if (next === 'active') sync(); });
    const rotation = Notifications.addPushTokenListener(token => {
      if (token.type === 'android' && typeof token.data === 'string') web.current?.injectJavaScript(`if(window.gituAndroidPush)window.gituAndroidPush.refresh(${JSON.stringify(token.data)}).catch(function(){}); true;`);
    });
    return () => { state.remove(); rotation.remove(); };
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // The failure screen owns the whole workspace; Back must not open the
      // panel of a WebView that is not mounted.
      if (failure) return true;
      if (showRootBack) { setShowRootBack(false); return true; }
      backPending.current = true;
      if (backTimer.current) clearTimeout(backTimer.current);
      web.current?.injectJavaScript(`(function(){var handled=false;try{handled=!!(window.gituAndroidBack&&window.gituAndroidBack());}catch(e){}if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gitu-back-result',nonce:${JSON.stringify(bridgeNonce)},handled:handled}));})();true;`);
      backTimer.current = setTimeout(() => {
        if (!backPending.current) return;
        backPending.current = false;
        if (canGoBack) web.current?.goBack(); else setShowRootBack(true);
      }, 300);
      return true;
    });
    return () => {
      subscription.remove();
      backPending.current = false;
      if (backTimer.current) clearTimeout(backTimer.current);
    };
  }, [canGoBack, close, showRootBack, bridgeNonce, failure]);
  const openExternal = (url: string) => {
    if (workspaceNavigation(url, server) === 'external') void Linking.openURL(url).catch(() => setError('Could not open this link in your browser.'));
  };
  const navigateWorkspace = (url: string) => {
    if (workspaceNavigation(url, server) === 'workspace') web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
  };
  if (failure) {
    return (
      <WorkspaceFailure
        theme={theme}
        title={failure.title}
        detail={failure.detail}
        address={server}
        onRetry={() => {
          setFailure(undefined);
          setReloadKey((value) => value + 1);
        }}
        onSettings={close}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      {!!error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorNotice error={error} />
        </View>
      )}
      <WebView
        key={reloadKey}
        ref={web}
        source={source}
        injectedJavaScriptBeforeContentLoaded={WORKSPACE_COMPAT_JS}
        injectedJavaScript={WORKSPACE_LOADED_JS + bridgeScript}
        style={{ flex: 1, backgroundColor: background }}
        originWhitelist={['*']}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onShouldStartLoadWithRequest={(request) => {
          const action = workspaceNavigation(request.url, server, request.isTopFrame !== false);
          if (action === 'workspace') return true;
          if (request.isTopFrame !== false) openExternal(request.url);
          return false;
        }}
        onOpenWindow={({ nativeEvent }) => {
          if (workspaceNavigation(nativeEvent.targetUrl, server) === 'workspace') navigateWorkspace(nativeEvent.targetUrl);
          else openExternal(nativeEvent.targetUrl);
        }}
        onNavigationStateChange={(state) => { currentUrl.current = state.url; setCanGoBack(state.canGoBack); }}
        onMessage={({ nativeEvent }) => {
          if (workspaceNavigation(nativeEvent.url, server) !== 'workspace') return;
          try {
            if (nativeEvent.data.length > 8192) return;
            const message = JSON.parse(nativeEvent.data);
            if (message.nonce !== bridgeNonce) return;
            if (message.type === 'gitu-theme') {
              const next = message.theme === 'light' ? 'light' : 'dark';
              onTheme(next);
              if (savedThemeFile) void FileSystem.writeAsStringAsync(savedThemeFile, next).catch(() => {});
              return;
            }
            if (message.type === 'gitu-push-opened') { if (message.targetId === target?.targetId) opened(); return; }
            if (message.type === 'gitu-logout') {
              setShowRootBack(false); close(); opened();
              if (savedServerFile) void FileSystem.deleteAsync(savedServerFile, { idempotent: true }).catch(() => {});
              return;
            }
            if (message.type === 'gitu-back-result') {
              backPending.current = false;
              if (backTimer.current) clearTimeout(backTimer.current);
              if (message.handled !== true) { if (canGoBack) web.current?.goBack(); else setShowRootBack(true); }
              return;
            }
            if (message.type !== 'gitu-push' || typeof message.id !== 'string' || !/^[\w-]{1,100}$/.test(message.id) || typeof message.action !== 'string') return;
            const reply = (result?: Record<string, unknown>, error?: string) => {
              if (workspaceNavigation(currentUrl.current, server) === 'workspace') web.current?.injectJavaScript(`if(window.__gituPushReply)window.__gituPushReply(${JSON.stringify({ id: message.id, result, error }).replace(/</g, '\\u003c')}); true;`);
            };
            void nativePushAction(server, message.action, message.payload ?? {}).then(result => reply(result)).catch(failure => reply(undefined, failure instanceof Error ? failure.message : 'Could not configure notifications.'));
          } catch { /* Ignore messages from unrelated page widgets. */ }
        }}
        onLoadEnd={() => {
          web.current?.injectJavaScript(themeBridgeScript + bridgeScript + 'if(window.gituAndroidPush)window.gituAndroidPush.sync().catch(function(){}); true;');
          openNotification();
        }}
        onLoadStart={() => setError('')}
        onError={({ nativeEvent }) => setFailure(loadFailure(nativeEvent.description))}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.url === source.uri || nativeEvent.url === server + '/auth') {
            setFailure({
              title: `Server returned HTTP ${nativeEvent.statusCode}`,
              detail: 'The workspace server answered with an error. Check the server or try another address.',
            });
          }
        }}
        onRenderProcessGone={() => {
          setFailure({
            title: 'The workspace stopped responding',
            detail: 'Its background page ended. Try again to reload the workspace.',
          });
        }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator color={theme === 'dark' ? '#f1f1f1' : colors.blueDark} style={{ position: 'absolute', alignSelf: 'center', top: 40 }} />}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        // Keep the last successfully loaded workspace page available when the
        // server cannot be reached. The UI has its own local conversation cache.
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        applicationNameForUserAgent="AgentGituMobile"
        mediaPlaybackRequiresUserAction={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        saveFormDataDisabled
      />
      {showRootBack && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,24,0.56)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Card style={{ width: '100%', maxWidth: 380, padding: 22, gap: 14, elevation: 16 }}>
            <Text style={[s.title, { fontSize: 20 }]}>Workspace</Text>
            <Text style={s.muted}>You’re at the start of Gitu. Stay here, reconnect to a server, or reload the workspace.</Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              <Button primary onPress={() => setShowRootBack(false)}>Stay in Gitu</Button>
              <Button onPress={() => { setShowRootBack(false); close(); }}>Connection settings</Button>
              <Button onPress={() => { setShowRootBack(false); web.current?.reload(); }}>Reload workspace</Button>
            </View>
          </Card>
        </View>
      )}
    </View>
  );
}

function WorkspaceFailure({
  theme,
  title,
  detail,
  address,
  onRetry,
  onSettings,
}: {
  theme: 'light' | 'dark';
  title: string;
  detail: string;
  address: string;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const background = theme === 'dark' ? DARK_CANVAS : colors.canvas;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 20 }}
    >
      <Mascot size={78} />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={[s.title, { textAlign: 'center' }]}>{title}</Text>
        <Text style={[s.muted, { textAlign: 'center', maxWidth: 380 }]}>{detail}</Text>
      </View>
      <Card style={{ width: '100%', maxWidth: 430, gap: 8 }}>
        <Text style={s.label}>Workspace</Text>
        <Text selectable style={[s.text, { fontSize: 13 }]}>
          {address}
        </Text>
        <Text style={s.small}>Work keeps running on the server. This screen only shows the connection.</Text>
      </Card>
      <View style={{ width: '100%', maxWidth: 430, gap: 10 }}>
        <Button primary onPress={onRetry}>
          Try again
        </Button>
        <Button onPress={onSettings}>Connection settings</Button>
      </View>
    </ScrollView>
  );
}
