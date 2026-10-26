import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, KeyboardAvoidingView, Linking, ScrollView, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, Card, colors, ErrorNotice, Field, Mascot, s } from '../ui';
import { isLocalServer, workspaceNavigation, workspaceServerUrl, type ConnectionMode } from './server-address';
import { WORKSPACE_COMPAT_JS, WORKSPACE_LOADED_JS } from './workspace-runtime';
import { nativePushAction, pushPreferences } from './workspace-push';
import { pushBridgeScript, pushTarget, type PushTarget } from './push-protocol';

const initialAddress = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8321';
const savedServerFile = FileSystem.documentDirectory && FileSystem.documentDirectory + 'workspace-server.txt';
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
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!savedServerFile) return;
        const saved = await FileSystem.readAsStringAsync(savedServerFile);
        const savedMode = isLocalServer(new URL(saved).hostname) ? 'local' : 'remote';
        const normalized = workspaceServerUrl(saved, savedMode);
        if (!cancelled && !pushRequested.current) {
          setMode(savedMode);
          (savedMode === 'local' ? setLocalAddress : setRemoteAddress)(normalized);
          setServer(normalized);
        }
      } catch { /* First launch or an invalid preference opens connection settings. */ }
      finally { if (!cancelled) setRestoring(false); }
    })();
    return () => { cancelled = true; };
  }, []);
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
        style={{ flex: 1, backgroundColor: colors.canvas }}
      >
        {restoring ? <ActivityIndicator color={colors.blueDark} style={{ flex: 1 }} /> : server ? (
          <Workspace key={server} server={server} close={() => setServer(undefined)} target={notificationTarget} opened={() => setNotificationTarget(undefined)} />
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

function Workspace({ server, close, target, opened }: { server: string; close: () => void; target?: PushTarget; opened: () => void }) {
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState('');
  const [source] = useState({ uri: server + '/' });
  const [bridgeNonce] = useState(() => {
    const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  });
  const bridgeScript = pushBridgeScript(bridgeNonce);
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
      if (canGoBack) web.current?.goBack();
      else Alert.alert('Workspace', 'Connection settings and recovery', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Connection settings', onPress: close },
        { text: 'Reload', onPress: () => web.current?.reload() },
      ], { cancelable: true });
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, close]);
  const openExternal = (url: string) => {
    if (workspaceNavigation(url, server) === 'external') void Linking.openURL(url).catch(() => setError('Could not open this link in your browser.'));
  };
  const navigateWorkspace = (url: string) => {
    if (workspaceNavigation(url, server) === 'workspace') web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
  };
  return (
    <View style={{ flex: 1 }}>
      {!!error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorNotice error={error} />
          <View style={[s.row, { gap: 12, paddingBottom: 12 }]}>
            <Button primary onPress={() => web.current?.reload()}>Retry</Button>
            <Button onPress={close}>Connection settings</Button>
          </View>
        </View>
      )}
      <WebView
        ref={web}
        source={source}
        injectedJavaScriptBeforeContentLoaded={WORKSPACE_COMPAT_JS}
        injectedJavaScript={WORKSPACE_LOADED_JS + bridgeScript}
        style={{ flex: 1, backgroundColor: colors.canvas }}
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
            if (message.type === 'gitu-push-opened') { if (message.targetId === target?.targetId) opened(); return; }
            if (message.type !== 'gitu-push' || typeof message.id !== 'string' || !/^[\w-]{1,100}$/.test(message.id) || typeof message.action !== 'string') return;
            const reply = (result?: Record<string, unknown>, error?: string) => {
              if (workspaceNavigation(currentUrl.current, server) === 'workspace') web.current?.injectJavaScript(`if(window.__gituPushReply)window.__gituPushReply(${JSON.stringify({ id: message.id, result, error }).replace(/</g, '\\u003c')}); true;`);
            };
            void nativePushAction(server, message.action, message.payload ?? {}).then(result => reply(result)).catch(failure => reply(undefined, failure instanceof Error ? failure.message : 'Could not configure notifications.'));
          } catch { /* Ignore messages from unrelated page widgets. */ }
        }}
        onLoadEnd={() => {
          web.current?.injectJavaScript(bridgeScript + 'if(window.gituAndroidPush)window.gituAndroidPush.sync().catch(function(){}); true;');
          openNotification();
        }}
        onLoadStart={() => setError('')}
        onError={() => setError('Could not load your Gitu server. Check its address, network connection, and HTTPS certificate, then reload.')}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.url === source.uri || nativeEvent.url === server + '/auth') setError(`The server returned HTTP ${nativeEvent.statusCode}. Check the server and reload.`);
        }}
        onRenderProcessGone={() => {
          setError('The workspace stopped responding. Reload to reconnect.');
        }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator color={colors.blueDark} style={{ position: 'absolute', alignSelf: 'center', top: 40 }} />}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        mediaPlaybackRequiresUserAction={false}
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        saveFormDataDisabled
      />
    </View>
  );
}
