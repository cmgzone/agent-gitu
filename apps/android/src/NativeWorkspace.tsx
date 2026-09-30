import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Connection } from './connection';
import { AgentApi } from './api';
import { FormSheet, type FormSpec } from './forms';
import { Avatar, Body, Button, colors, Icon, styles } from './ui';
import { Chats, RunChat, TaskDetails } from './chats';
import { Team, AgentProfile, CoworkChat } from './team';
import { Workspace, Files, Git, Browser, Library, Settings, Models, Integrations } from './workspace';

export interface Route { screen: string; id?: string; path?: string; agentId?: string; threadId?: string; title?: string }
export interface MobileServices {
  api: AgentApi; go: (route: Route) => void; form: (spec: FormSpec) => void;
  menu: (title: string, items: { title: string; onPress: () => void }[]) => void;
  act: (action: () => Promise<unknown>, done?: () => void) => Promise<boolean>;
  project: string; setProject: (path: string) => void;
  model?: { provider: string; model: string }; setModel: (model: { provider: string; model: string }) => void;
  manageConnections: () => void;
}
const tabs = [{ id: 'chats', title: 'Chats', icon: 'chat' }, { id: 'team', title: 'Team', icon: 'team' }, { id: 'workspace', title: 'Workspace', icon: 'folder' }, { id: 'settings', title: 'Settings', icon: 'settings' }];
export default function NativeWorkspace({ connection, manageConnections }: { connection: Connection; manageConnections: () => void }) {
  const api = useMemo(() => new AgentApi(connection), [connection]);
  const [stack, setStack] = useState<Route[]>([{ screen: 'chats' }]), [tab, setTab] = useState('chats');
  const [form, setForm] = useState<FormSpec>(), [menu, setMenu] = useState<{ title: string; items: { title: string; onPress: () => void }[] }>();
  const [busy, setBusy] = useState(false), [project, setProject] = useState('');
  const [model, setModel] = useState<{ provider: string; model: string }>();
  const route = stack[stack.length - 1];
  const back = () => setStack(old => old.length > 1 ? old.slice(0, -1) : old);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) { setStack(old => old.slice(0, -1)); return true; }
      if (tab !== 'chats') { setTab('chats'); setStack([{ screen: 'chats' }]); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [stack.length, tab]);
  const services: MobileServices = {
    api, project, setProject, model, setModel, manageConnections,
    go: next => setStack(old => [...old, next]), form: setForm, menu: (title, items) => setMenu({ title, items }),
    act: async (action, done) => {
      if (busy) return false;
      setBusy(true);
      try { await action(); done?.(); return true; }
      catch (error) { Alert.alert('Action needs attention', error instanceof Error ? error.message : 'Please try again.'); return false; }
      finally { setBusy(false); }
    },
  };
  const chat = ['chat', 'cowork'].includes(route.screen);
  let content;
  switch (route.screen) {
    case 'chats': content = <Chats services={services} />; break;
    case 'chat': content = <RunChat key={route.id} services={services} id={route.id!} />; break;
    case 'task': content = <TaskDetails services={services} route={route} />; break;
    case 'team': content = <Team services={services} />; break;
    case 'agent': content = <AgentProfile services={services} id={route.id!} />; break;
    case 'cowork': content = <CoworkChat key={`${route.id}:${route.threadId || 'main'}`} services={services} route={route} />; break;
    case 'workspace': content = <Workspace services={services} />; break;
    case 'files': content = <Files key={`${route.path}:${route.id || ''}`} services={services} route={route} />; break;
    case 'git': content = <Git services={services} />; break;
    case 'browser': content = <Browser services={services} />; break;
    case 'schedules': case 'skills': case 'mcp': content = <Library key={route.screen} services={services} kind={route.screen} />; break;
    case 'models': content = <Models services={services} />; break;
    case 'integrations': content = <Integrations services={services} />; break;
    default: content = <Settings services={services} />;
  }
  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}>{stack.length > 1 && <Pressable accessibilityLabel="Go back" style={styles.iconButton} onPress={back}><Icon name="back" /></Pressable>}
      {!chat && <><Avatar size={34} /><Text style={[styles.heading, { flex: 1 }]}>{route.title || tabs.find(item => item.id === route.screen)?.title || route.screen.charAt(0).toUpperCase() + route.screen.slice(1)}</Text></>}
      {chat && <View style={{ flex: 1 }} />}{busy && <ActivityIndicator color={colors.accent} />}
    </View>
    <View style={{ flex: 1 }}>{content}</View>
    {!chat && <View style={{ flexDirection: 'row', paddingTop: 9, paddingBottom: 5, backgroundColor: '#19171c' }}>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.title} onPress={() => { setTab(item.id); setStack([{ screen: item.id }]); }} style={{ flex: 1, alignItems: 'center', gap: 5, minHeight: 52 }}><Icon name={item.icon} color={tab === item.id ? colors.accent : colors.muted} /><Text style={{ fontSize: 11, color: tab === item.id ? colors.accent : colors.muted }}>{item.title}</Text></Pressable>)}</View>}
    {form && <FormSheet key={form.title} spec={form} close={() => setForm(undefined)} />}
    <Modal visible={Boolean(menu)} animationType="slide" transparent onRequestClose={() => setMenu(undefined)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}><SafeAreaView style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Body><Text style={styles.heading}>{menu?.title}</Text>{menu?.items.map((item, i) => <Button key={i} title={item.title} onPress={() => { setMenu(undefined); item.onPress(); }} />)}<Button title="Close" onPress={() => setMenu(undefined)} /></Body></SafeAreaView></View></Modal>
  </KeyboardAvoidingView>;
}
