import { StatusBar } from 'expo-status-bar';
import { Activity, FolderOpen, LogOut, MessageCircle, Plus, RefreshCw, Settings, Users, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, colors, ErrorNotice, Field, IconButton, Mascot, s, Sheet } from '../ui';
import { GituApi } from './client';
import { Chat } from './chat';
import { Files } from './files';
import { Teams } from './teams';
import { isRunning, needsInput, type Project, type Run } from './types';

const defaultUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : Platform.OS === 'android' ? 'http://10.0.2.2:8321' : 'http://localhost:8321');
type Section = 'chat' | 'teams' | 'activity' | 'files' | 'settings';
const navigation: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [api, setApi] = useState<GituApi>();
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {api ? <Workspace api={api} disconnect={() => { void api.disconnect().catch(() => {}); setApi(undefined); }} /> : <Connect onConnect={setApi} />}
    </SafeAreaProvider>
  );
}

function Connect({ onConnect }: { onConnect: (api: GituApi) => void }) {
  const [url, setUrl] = useState(defaultUrl);
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const client = new GituApi(url, key.trim(), password, email);
      if (Platform.OS === 'web' && client.baseUrl !== window.location.origin) throw new Error('Open /companion/ on your Gitu server to connect from the browser.');
      await client.connect();
      setKey('');
      setPassword('');
      setEmail('');
      onConnect(client);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not connect. Check your server address.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 430, gap: 22 }}>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Mascot size={80} />
              <Text style={[s.title, { fontSize: 32 }]}>Gitu, wherever you are.</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>Start work, follow progress, and review decisions from your phone.</Text>
            </View>
            <Card>
              <Field label="Server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-gitu-server" />
              <Field
                label="Access key"
                value={key}
                onChangeText={setKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="Your Gitu server access key"
                onSubmitEditing={() => !busy && void connect()}
              />
              <Field label="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Your registered email address" />
              <Field label="App password" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Your Agent Gitu password" onSubmitEditing={() => !busy && void connect()} />
              <ErrorNotice error={error} />
              <Button primary busy={busy} disabled={!key.trim() || !url.trim()} onPress={() => void connect()}>
                Connect to Gitu
              </Button>
              <Text style={[s.small, { marginTop: 16 }]}>Register your account on the Gitu computer first. Use its email and password here with your server access key. Remote sign-in requires HTTPS. Credentials stay in memory.</Text>
            </Card>
            <Text style={[s.small, { textAlign: 'center' }]}>Agent Gitu · Built on OpenMuse</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Workspace({ api, disconnect }: { api: GituApi; disconnect: () => void }) {
  const [section, setSection] = useState<Section>('chat');
  const [runs, setRuns] = useState<Run[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState('');
  const [selected, setSelected] = useState<string>();
  const [teamChat, setTeamChat] = useState<string>();
  const [threads, setThreads] = useState(false);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const [nextRuns, nextProjects] = await Promise.all([api.runs(signal), api.projects(signal)]);
      if (signal?.aborted) return;
      setRuns(nextRuns);
      setProjects(nextProjects);
      setProject((value) => value || nextProjects[0]?.path || '');
      setError('');
    },
    [api],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const poll = async () => {
      if (pending || controller.signal.aborted || AppState.currentState === 'background') return;
      clearTimeout(timer);
      pending = true;
      try {
        await refresh(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not refresh the workspace.');
      } finally {
        pending = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void poll();
      else clearTimeout(timer);
    });
    return () => {
      clearTimeout(timer);
      controller.abort();
      listener.remove();
    };
  }, [refresh]);
  const openRun = (run: Run) => {
    setSelected(run.runId);
    setProject(run.projectPath || project);
    setSection('chat');
    setThreads(false);
  };
  const attention = runs.filter(needsInput).length;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide && (
          <View style={{ width: 240, padding: 20, borderRightWidth: 1, borderColor: colors.line, gap: 22 }}>
            <View style={[s.row, { gap: 10 }]}>
              <Mascot size={36} />
              <Text style={s.heading}>Agent Gitu</Text>
            </View>
            {navigation.map((item) => (
              <NavItem key={item.id} item={item} active={section === item.id} select={setSection} count={item.id === 'activity' ? attention : 0} />
            ))}
            <Button
              icon={Plus}
              onPress={() => {
                setSelected(undefined);
                setSection('chat');
              }}
            >
              New task
            </Button>
            <Text style={s.label}>Recent tasks</Text>
            <ScrollView>
              {runs.slice(0, 20).map((run) => (
                <RunRow key={run.runId} run={run} open={() => openRun(run)} compact />
              ))}
            </ScrollView>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[s.between, { paddingHorizontal: 22, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open tasks" onPress={() => setThreads(true)} style={[s.row, { gap: 10 }]}>
              <Mascot size={32} />
              <View>
                <Text style={s.heading}>{navigation.find((item) => item.id === section)?.label}</Text>
                <Text style={s.small}>Agent Gitu</Text>
              </View>
            </Pressable>
            <View style={[s.row, { gap: 6 }]}>
              <IconButton icon={RefreshCw} label="Refresh workspace" onPress={() => void refresh().catch((error) => setError(String(error)))} />
              <IconButton
                icon={Plus}
                label="New task"
                onPress={() => {
                  setSelected(undefined);
                  setSection('chat');
                }}
              />
            </View>
          </View>
          {!!error && (
            <View style={{ paddingHorizontal: 22 }}>
              <ErrorNotice error={error} />
            </View>
          )}
          {section === 'teams' ? (
            <Teams api={api} selected={teamChat} select={setTeamChat} />
          ) : !projects.length && !error ? (
            <ActivityIndicator style={{ margin: 32 }} color={colors.blueDark} />
          ) : section === 'chat' ? (
            <Chat key={selected || 'new'} api={api} runId={selected} project={project} projects={projects} selectProject={setProject} onStarted={setSelected} />
          ) : section === 'activity' ? (
            <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
              <Text style={s.title}>Your work, in view.</Text>
              <Text style={s.muted}>Follow live tasks and return to their saved results.</Text>
              <View style={[s.row, { gap: 12 }]}>
                {[
                  { label: 'Working', value: runs.filter(isRunning).length },
                  { label: 'Needs you', value: attention },
                  { label: 'Completed', value: runs.filter((run) => run.status === 'completed').length },
                ].map((item) => (
                  <Card key={item.label} style={{ flex: 1 }}>
                    <Text style={[s.title, { fontSize: 30 }]}>{item.value}</Text>
                    <Text style={s.small}>{item.label}</Text>
                  </Card>
                ))}
              </View>
              {!runs.length && (
                <Card>
                  <Text style={s.muted}>Your tasks will appear here once you start work.</Text>
                </Card>
              )}
              {runs.map((run) => (
                <RunRow key={run.runId} run={run} open={() => openRun(run)} />
              ))}
            </ScrollView>
          ) : section === 'files' ? (
            <Files api={api} projects={projects} project={project} selectProject={setProject} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }}>
              <Text style={s.title}>Your connection</Text>
              <Card>
                <Text style={s.label}>Gitu server</Text>
                <Text selectable style={[s.text, { marginVertical: 10 }]}>
                  {api.baseUrl}
                </Text>
                <Text style={s.muted}>Your agent runs on this server. You can leave the app and return to its work later.</Text>
              </Card>
              <Card>
                <Text style={s.heading}>Built on OpenMuse</Text>
                <Text style={[s.muted, { marginTop: 10 }]}>
                  The mobile companion shares Gitu’s tasks, approvals and files. Configure model providers and other connections in Gitu’s desktop settings.
                </Text>
              </Card>
              <Button icon={LogOut} onPress={disconnect}>
                Disconnect
              </Button>
            </ScrollView>
          )}
        </View>
      </View>
      {!wide && (
        <View style={[s.row, { borderTopWidth: 1, borderColor: colors.line, padding: 8, backgroundColor: colors.card }]}>
          {navigation.map((item) => (
            <NavItem key={item.id} item={item} active={section === item.id} select={setSection} count={item.id === 'activity' ? attention : 0} compact />
          ))}
        </View>
      )}
      {threads && (
        <Sheet title="Your tasks" subtitle="Work stays saved on your Gitu server." onClose={() => setThreads(false)}>
          <Button
            icon={Plus}
            primary
            onPress={() => {
              setSelected(undefined);
              setSection('chat');
              setThreads(false);
            }}
          >
            New task
          </Button>
          {runs.map((run) => (
            <RunRow key={run.runId} run={run} open={() => openRun(run)} />
          ))}
          {!runs.length && <Text style={[s.muted, { marginTop: 20 }]}>No tasks yet.</Text>}
        </Sheet>
      )}
    </SafeAreaView>
  );
}

function NavItem({
  item,
  active,
  select,
  count,
  compact,
}: {
  item: (typeof navigation)[number];
  active: boolean;
  select: (section: Section) => void;
  count: number;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${item.label}, ${count} need attention` : item.label}
      onPress={() => select(item.id)}
      style={{
        flex: compact ? 1 : undefined,
        flexDirection: compact ? 'column' : 'row',
        gap: compact ? 4 : 12,
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        backgroundColor: active ? colors.sky : 'transparent',
      }}
    >
      <Icon size={21} color={active ? colors.blueDark : colors.muted} />
      <Text style={{ fontSize: compact ? 11 : 14, color: active ? colors.blueDark : colors.muted }}>
        {item.label}
        {count ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );
}
export function RunRow({ run, open, compact }: { run: Run; open: () => void; compact?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={open} style={{ padding: compact ? 12 : 18, marginVertical: 4, borderRadius: 18, backgroundColor: colors.card }}>
      <Text numberOfLines={2} style={s.heading}>
        {run.goal}
      </Text>
      <View style={[s.between, { marginTop: 9 }]}>
        <Text style={[s.small, { color: needsInput(run) ? colors.danger : colors.muted }]}>{needsInput(run) ? 'Needs your decision' : run.status.replaceAll('_', ' ')}</Text>
        {!compact && <Text style={s.small}>{new Date(run.startedAt).toLocaleDateString()}</Text>}
      </View>
      {!compact && run.project && <Text style={[s.small, { marginTop: 5 }]}>{run.project}</Text>}
    </Pressable>
  );
}
