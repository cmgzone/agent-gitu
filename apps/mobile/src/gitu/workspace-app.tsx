import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Button, Card, colors, ErrorNotice, Field, Mascot, s } from '../ui';
import { isLocalServer, workspaceNavigation, workspaceServerUrl, type ConnectionMode } from './server-address';
import { WORKSPACE_COMPAT_JS, WORKSPACE_LOADED_JS } from './workspace-runtime';

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
        if (!cancelled) {
          setMode(savedMode);
          (savedMode === 'local' ? setLocalAddress : setRemoteAddress)(normalized);
          setServer(normalized);
        }
      } catch { /* First launch or an invalid preference opens connection settings. */ }
      finally { if (!cancelled) setRestoring(false); }
    })();
    return () => { cancelled = true; };
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
          <Workspace key={server} server={server} close={() => setServer(undefined)} />
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

function Workspace({ server, close }: { server: string; close: () => void }) {
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState('');
  const [source] = useState({ uri: server + '/' });
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
        injectedJavaScript={WORKSPACE_LOADED_JS}
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
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
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
