import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import NativeWorkspace from './src/NativeWorkspace';
import { checkConnection, connectionUrl, type Connection } from './src/connection';

const STORE = 'gitu.connections.v1';
const color = { bg: '#111111', card: '#1b1b1b', border: '#353535', text: '#f5f5f5', muted: '#a1a1a1', accent: '#9984ff' };

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [active, setActive] = useState<Connection>();
  const [restoring, setRestoring] = useState(true);
  const [settings, setSettings] = useState(false);
  const [kind, setKind] = useState<Connection['kind']>('computer');
  const [name, setName] = useState('My computer');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    (Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(STORE))
      .then((raw) => {
        if (!live || !raw) return;
        const saved = JSON.parse(raw) as { connections: Connection[]; activeUrl?: string };
        if (!Array.isArray(saved.connections)) return;
        const valid = saved.connections.filter(
          (c) => c && typeof c.key === 'string' && c.key.length >= 32 && ['computer', 'hosted'].includes(c.kind) && connectionUrl(c.url, c.kind) === c.url,
        );
        setConnections(valid);
        setActive(valid.find((c) => c.url === saved.activeUrl));
      })
      .catch(() => {})
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settings) { setSettings(false); return true; }
      return false;
    });
    return () => back.remove();
  }, [settings]);

  async function save(next: Connection[], selected?: Connection) {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(STORE, JSON.stringify({ connections: next, activeUrl: selected?.url }));
    setConnections(next);
    setActive(selected);
    setRevision((r) => r + 1);
  }

  async function connect(candidate?: Connection) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const connection = candidate ?? { name: name.trim() || (kind === 'computer' ? 'My computer' : 'Hosted agent'), kind, url: connectionUrl(url, kind), key: key.trim() };
      if (connection.key.length < 32) throw new Error('Enter the access key from your Agent Gitu server.');
      await checkConnection(connection);
      const next = [...connections.filter((c) => c.url !== connection.url), connection].slice(-4);
      await save(next, connection);
      setKey('');
      setSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach your agent. Check the address and network.');
    } finally {
      setBusy(false);
    }
  }

  async function forget(connection: Connection) {
    try {
      await save(
        connections.filter((c) => c.url !== connection.url),
        active?.url === connection.url ? undefined : active,
      );
    } catch {
      setError('Could not remove this saved connection. Please try again.');
    }
  }

  const connectionScreen = (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.connect} keyboardShouldPersistTaps="handled">
        <Image source={require('./assets/icon.png')} style={s.logo} accessibilityLabel="Agent Gitu" />
        <Text style={s.title}>Your agent, wherever you are.</Text>
        <Text style={s.subtitle}>Continue your work, talk with your team, and review progress from your phone.</Text>
        {connections.length > 0 && (
          <View style={s.saved}>
            <Text style={s.label}>YOUR CONNECTIONS</Text>
            {connections.map((c) => (
              <View key={c.url} style={s.savedRow}>
                <Pressable disabled={busy} style={s.savedName} onPress={() => void connect(c)} accessibilityRole="button">
                  <Text style={s.text}>{c.name}</Text>
                  <Text style={s.small}>
                    {c.kind === 'computer' ? 'Computer' : 'Hosted'} · {new URL(c.url).host}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    Alert.alert('Remove connection?', c.name, [
                      { text: 'Keep', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void forget(c) },
                    ])
                  }
                  accessibilityLabel={`Remove ${c.name}`}
                >
                  <Text style={s.small}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={s.segment}>
          {(['computer', 'hosted'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === option }}
              onPress={() => {
                setKind(option);
                setName(option === 'computer' ? 'My computer' : 'Hosted agent');
                setError('');
              }}
              style={[s.option, kind === option && s.optionActive]}
            >
              <Text style={s.text}>{option === 'computer' ? 'My computer' : 'Hosted server'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>CONNECTION NAME</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} editable={!busy} maxLength={60} accessibilityLabel="Connection name" />
        <Text style={s.label}>SERVER ADDRESS</Text>
        <TextInput
          style={s.input}
          value={url}
          onChangeText={setUrl}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={kind === 'computer' ? 'http://192.168.1.20:8421' : 'https://agent.example.com'}
          placeholderTextColor={color.muted}
          accessibilityLabel="Server address"
        />
        <Text style={s.small}>
          {kind === 'computer' ? 'Use your computer’s network address while both devices are on the same Wi-Fi.' : 'Enter the HTTPS address of your hosted Agent Gitu server.'}
        </Text>
        <Text style={s.label}>ACCESS KEY</Text>
        <TextInput
          style={s.input}
          value={key}
          onChangeText={setKey}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="From your Agent Gitu server"
          placeholderTextColor={color.muted}
          accessibilityLabel="Access key"
        />
        {error !== '' && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={s.button} onPress={() => void connect()}>
          {busy ? <ActivityIndicator color="#111" /> : <Text style={s.buttonText}>Connect to Agent Gitu</Text>}
        </Pressable>
        <Text style={s.small}>Your saved access keys are protected on this device. Your agent runs on the computer or server you connect to.</Text>
        {active && (
          <Pressable style={s.return} onPress={() => setSettings(false)}>
            <Text style={s.text}>Return to my agent</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden={Boolean(active)} />
      <SafeAreaView style={s.fill}>
        {restoring ? (
          <ActivityIndicator style={s.fill} color={color.accent} />
        ) : !active ? (
          connectionScreen
        ) : (
          <NativeWorkspace key={`${active.url}:${revision}`} connection={active} manageConnections={() => setSettings(true)} />
        )}
        <Modal visible={settings && Boolean(active)} animationType="slide" onRequestClose={() => setSettings(false)}>
          <SafeAreaView style={s.fill}>{connectionScreen}</SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.bg },
  connect: { flexGrow: 1, padding: 24, paddingVertical: 32, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center', justifyContent: 'center' },
  logo: { width: 80, height: 80, alignSelf: 'center', marginBottom: 10 },
  title: { color: color.text, fontSize: 29, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { color: color.muted, fontSize: 15, lineHeight: 23, marginBottom: 8 },
  text: { color: color.text, fontSize: 14 },
  small: { color: color.muted, fontSize: 12, lineHeight: 19 },
  label: { color: color.muted, fontSize: 10, letterSpacing: 1.2, marginTop: 6 },
  input: { color: color.text, backgroundColor: color.card, borderWidth: 1, borderColor: color.border, borderRadius: 12, padding: 14, fontSize: 15 },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: color.card, padding: 5, borderRadius: 13 },
  option: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 },
  optionActive: { backgroundColor: '#363039' },
  button: { backgroundColor: color.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#14111c', fontWeight: '700', fontSize: 14 },
  error: { color: '#ff9d99', lineHeight: 21 },
  saved: { gap: 10, borderWidth: 1, borderColor: color.border, borderRadius: 14, padding: 14 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  savedName: { flex: 1, gap: 3, paddingVertical: 5 },
  return: { alignItems: 'center', padding: 12 },
  connectionBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 7 },
  failure: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: color.bg },
});
