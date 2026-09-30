import { useEffect, useRef, useState } from 'react';
import { AppState, Alert, FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { MobileServices, Route } from './NativeWorkspace';
import type { Run, RunEvent, RunPage } from './api';
import { useResource } from './hooks';
import { Avatar, Badge, Body, Button, Card, colors, Empty, Icon, Loading, Prose, styles } from './ui';
import { Composer } from './Composer';
import { saveDownload } from './download';

export function ResourceError({ error, retry }: { error: string; retry: () => void }) { return error ? <Card><Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text><Button title="Try again" onPress={retry} /></Card> : null; }

export function Chats({ services: s }: { services: MobileServices }) {
  const resource = useResource<Run[]>(s.api, '/api/runs', 5000);
  const [starting, setStarting] = useState(false);
  return <View style={styles.fill}><Body><View style={styles.row}><Text style={[styles.title, { flex: 1 }]}>What shall we build?</Text><Avatar size={78} /></View><Text style={styles.muted}>Your work continues on {s.api.connection.name}.</Text><View style={styles.wrap}><Button title={s.project ? s.project.split(/[\\/]/).pop() || 'Project' : 'Choose project'} onPress={() => s.go({ screen: 'workspace' })} /><Button title={s.model?.model || 'Choose model'} onPress={() => s.go({ screen: 'models' })} /></View><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}
    {!resource.loading && !resource.data?.length && <Empty title="Start something new" detail="Describe a task below. Your existing chats will appear here." />}
    {resource.data?.map(run => <Pressable key={run.runId} onPress={() => s.go({ screen: 'chat', id: run.runId })} accessibilityRole="button"><Card><Text numberOfLines={2} style={styles.heading}>{run.goal}</Text><View style={styles.wrap}><Badge text={run.status} />{run.project && <Text style={styles.muted}>{run.project}</Text>}</View><Text style={styles.muted}>{new Date(run.startedAt).toLocaleDateString()}</Text></Card></Pressable>)}
    </Body><Composer placeholder="What would you like to create?" hint={s.model?.model || 'Agent Gitu'} busy={starting} options={() => s.menu('New chat', [{ title: 'Choose a project', onPress: () => s.go({ screen: 'workspace' }) }, { title: 'Choose a model', onPress: () => s.go({ screen: 'models' }) }])} onSend={async (goal, files) => {
      setStarting(true);
      try { const result = await s.api.request<{ runId: string }>('/api/runs', 'POST', { goal, files, mode: 'agent', autoApprove: false, review: false, ...(s.project ? { projectPath: s.project } : {}), ...s.model }); s.go({ screen: 'chat', id: result.runId }); }
      finally { setStarting(false); resource.refresh(); }
    }} /></View>;
}

export function RunChat({ services: s, id }: { services: MobileServices; id: string }) {
  const [run, setRun] = useState<Run>(), [events, setEvents] = useState<RunEvent[]>([]), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const list = useRef<FlatList<RunEvent>>(null), nearBottom = useRef(true);
  useEffect(() => {
    let live = true, pending = false, cursor = -1;
    const controller = new AbortController();
    setEvents([]); setRun(undefined);
    async function update() {
      if (!live || pending || AppState.currentState === 'background') return;
      pending = true;
      try {
        let more = true;
        while (more && live) {
          const page = await s.api.request<RunPage>(`/api/mobile/runs/${id}/events?after=${cursor}`, 'GET', undefined, controller.signal);
          if (!live) return;
          cursor = page.cursor; more = page.more;
          setRun(page.session); setError('');
          setEvents(old => { const rows = new Map(old.map(event => [event.i, event])); for (const event of page.events) rows.set(event.i, event); return [...rows.values()].sort((a, b) => a.i - b.i); });
        }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : 'Could not load this chat.'); }
      finally { pending = false; }
    }
    void update(); const timer = setInterval(() => void update(), 2200);
    const resume = AppState.addEventListener('change', state => { if (state === 'active') void update(); });
    return () => { live = false; controller.abort(); clearInterval(timer); resume.remove(); };
  }, [s.api, id, revision]);
  const refresh = () => setRevision(value => value + 1);
  const visible = events.filter(event => /^(user-msg|say|answer|assistant-msg|summary|blocked|error|warn)\s/.test(event.text));
  const latest = events.at(-1);
  const context = run?.usage?.contextTokens || 0, capacity = run?.usage?.contextWindowTokens || 0;
  const fraction = capacity ? Math.min(1, context / capacity) : 0;
  function options() {
    s.menu('Chat options', [
      { title: 'Task progress and files', onPress: () => s.go({ screen: 'task', id, title: 'Task progress' }) },
      { title: 'Tag a folder', onPress: () => s.form({ title: 'Tag folder', fields: [{ key: 'path', label: 'Folder path on your server', required: true }], save: async values => { await s.api.request(`/api/runs/${id}/folders`, 'POST', values); refresh(); } }) },
      { title: 'Change model', onPress: () => s.go({ screen: 'models' }) },
      { title: 'Stop this task', onPress: () => void s.act(() => s.api.request(`/api/runs/${id}/stop`, 'POST'), refresh) },
    ]);
  }
  return <View style={styles.fill}>
    <View style={{ alignItems: 'center', gap: 2, paddingBottom: 12 }}><Avatar size={70} /><Text style={styles.heading}>Agent Gitu</Text><Pressable onPress={options}><Text style={styles.muted}>{run?.status.replace(/_/g, ' ') || 'Connecting…'} · Details</Text></Pressable></View>
    <FlatList ref={list} data={visible} keyExtractor={event => String(event.i)} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100; }} onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
      ListHeaderComponent={<><ResourceError error={error} retry={refresh} />{run && <><Text style={styles.muted}>{run.goal}</Text><PendingRun run={run} services={s} refresh={refresh} /></>}</>}
      renderItem={({ item }) => <View style={{ backgroundColor: item.text.startsWith('user-msg') ? '#302838' : colors.card, borderRadius: 20, padding: 16, marginBottom: 12, marginLeft: item.text.startsWith('user-msg') ? 28 : 0 }}><Text style={[styles.muted, { marginBottom: 5 }]}>{item.text.startsWith('user-msg') ? 'You' : 'Agent Gitu'}</Text><Prose text={item.text.replace(/^\S+\s+/, '')} /></View>}
      ListFooterComponent={<>{run?.report?.summary && !visible.some(event => event.text.includes(run.report!.summary!)) && <Card><Text style={styles.label}>ACCOMPLISHED</Text><Prose text={run.report.summary} /></Card>}{run?.error && <Text style={{ color: colors.danger }}>{run.error}</Text>}</>}
    />
    {run?.status === 'running' && <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="spark" color={colors.accent} /><Text numberOfLines={1} style={[styles.muted, { flex: 1 }]}>{latest?.typed?.type === 'file_changed' ? `Updated ${latest.typed.path}` : 'Working on your task…'}</Text></View>}
    <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Svg width="23" height="23" viewBox="0 0 24 24"><Circle cx="12" cy="12" r="9" stroke={colors.border} strokeWidth="2" fill="none" /><Circle cx="12" cy="12" r="9" stroke={fraction > .85 ? colors.danger : colors.accent} strokeWidth="2" fill="none" strokeDasharray={`${fraction * 56.55} 56.55`} rotation="-90" origin="12,12" /></Svg><Text style={styles.muted}>{capacity ? `${Math.round(fraction * 100)}% context` : 'Context available after the first response'}{run?.usage?.costUsd !== undefined ? ` · $${run.usage.costUsd.toFixed(3)}` : ''}</Text></View>
    <Composer placeholder="Message Agent Gitu…" options={options} onSend={async (text, files) => { await s.api.request(`/api/runs/${id}/message`, 'POST', { text, files, delivery: 'steer', ...s.model, useSelectedModel: Boolean(s.model) }); }} />
  </View>;
}

export function PendingRun({ run, services: s, refresh }: { run: Run; services: MobileServices; refresh: () => void }) {
  return <View style={{ gap: 12, paddingVertical: 12 }}>{run.pendingApprovals?.map(approval => <Card key={approval.id}><Text style={styles.heading}>Permission needed</Text><Prose text={approval.summary || approval.why} /><View style={styles.wrap}><Button title="Allow once" primary onPress={() => void s.act(() => s.api.request(`/api/approvals/${approval.id}`, 'POST', { approved: true }), refresh)} /><Button title="Deny" onPress={() => void s.act(() => s.api.request(`/api/approvals/${approval.id}`, 'POST', { approved: false }), refresh)} /></View></Card>)}
    {run.pendingQuestions && <Card><Text style={styles.heading}>Your agent needs your input</Text>{run.pendingQuestions.questions.map((question, i) => <View key={i} style={{ gap: 6 }}><Text style={styles.text}>{question.question}</Text><Text style={styles.muted}>{question.options.join(' · ')}</Text></View>)}<Button title="Answer" primary onPress={() => s.form({ title: 'Answer your agent', fields: [{ key: 'answer', label: 'Your answer', multiline: true, required: true }], submit: 'Send answer', save: async values => { await s.api.request(`/api/answers/${run.pendingQuestions!.id}`, 'POST', values); refresh(); } })} /></Card>}
    {run.pendingPlanReview && <Card><Text style={styles.heading}>Review the plan</Text>{run.pendingPlanReview.steps.map((step, i) => <View key={i}><Text style={styles.text}>{i + 1}. {step.description}</Text><Text style={styles.muted}>{step.verification}</Text></View>)}<Button title="Approve plan" primary onPress={() => void s.act(() => s.api.request(`/api/plan-review/${run.pendingPlanReview!.id}`, 'POST', { approved: true }), refresh)} /><Button title="Request changes" onPress={() => s.form({ title: 'Change the plan', fields: [{ key: 'note', label: 'What should change?', multiline: true, required: true }], save: async values => { await s.api.request(`/api/plan-review/${run.pendingPlanReview!.id}`, 'POST', { approved: false, ...values }); refresh(); } })} /></Card>}
    {run.pendingConnection && <Card><Text style={styles.heading}>Connect a service</Text><Text style={styles.text}>{run.pendingConnection.requirement.label || run.pendingConnection.requirement.reason || 'Your agent needs a saved service connection.'}</Text><Button title="Save key and continue" primary onPress={() => s.form({ title: 'Connect your agent', fields: [{ key: 'label', label: 'Name' }, { key: 'baseUrl', label: 'Service address, if needed' }, { key: 'token', label: 'Access key', secret: true, required: true }], save: async values => { await s.api.request(`/api/runs/${run.runId}/connection`, 'POST', values); refresh(); } })} /></Card>}
  </View>;
}

interface Ledger { goal: string; status: string; plan: { id: string; description: string; status: string; verification?: string }[]; evidence: { id: string; kind: string; label: string; passed: boolean; stale?: boolean }[]; filesChanged: string[]; criteria: string[] }
export function TaskDetails({ services: s, route }: { services: MobileServices; route: Route }) {
  const run = useResource<Run>(s.api, `/api/runs/${route.id}`, 4000);
  const ledger = useResource<Ledger>(s.api, run.data?.taskId ? `/api/tasks/${run.data.taskId}?path=${encodeURIComponent(run.data.projectPath || '')}` : `/api/runs/${route.id}`, 4000);
  const r = run.data;
  return <Body><ResourceError error={run.error} retry={run.refresh} />{r && <><Text style={styles.title}>{r.goal}</Text><Badge text={r.status} /><PendingRun run={r} services={s} refresh={run.refresh} />{r.report?.summary && <Card><Text style={styles.heading}>Accomplished</Text><Prose text={r.report.summary} /></Card>}
    <Text style={styles.label}>PLAN</Text>{ledger.data?.plan?.map(step => <Card key={step.id}><Text style={styles.text}>{step.description}</Text><Badge text={step.status} />{step.verification && <Text style={styles.muted}>{step.verification}</Text>}</Card>)}
    <Text style={styles.label}>FILES</Text>{(ledger.data?.filesChanged || r.report?.filesChanged || []).map(file => <Button key={file} title={file} onPress={() => s.go({ screen: 'files', path: r.worktreePath || r.projectPath, id: file, title: file.split(/[\\/]/).pop() })} />)}{r.files?.map(file => <Button key={file.id} title={`Save ${file.name}`} onPress={() => void s.act(() => saveDownload(s.api, file.downloadUrl, file.name, file.mime))} />)}
    <Text style={styles.label}>TAGGED FOLDERS</Text>{r.taggedFolders?.map(folder => <Card key={folder}><Text selectable style={styles.text}>{folder}</Text><Badge text={r.writableFolders.includes(folder) ? 'Writing allowed' : 'Read only'} /><Button title={r.writableFolders.includes(folder) ? 'Make read only' : 'Allow writing'} onPress={() => Alert.alert('Folder permission', `${r.writableFolders.includes(folder) ? 'Remove' : 'Allow'} agent writes in ${folder}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => void s.act(() => s.api.request(`/api/runs/${r.runId}/folders`, 'PATCH', { path: folder, writable: !r.writableFolders.includes(folder) }), run.refresh) }])} /><Button title="Browse folder" onPress={() => s.go({ screen: 'files', path: folder })} /><Button title="Remove folder tag" danger onPress={() => void s.act(() => s.api.request(`/api/runs/${r.runId}/folders`, 'DELETE', { path: folder }), run.refresh)} /></Card>)}
    <Text style={styles.label}>VERIFICATION</Text>{ledger.data?.evidence?.slice(-12).map(check => <Card key={check.id}><Text style={styles.text}>{check.label || check.kind}</Text><Badge text={check.stale ? 'Needs a new check' : check.passed ? 'Passed' : 'Failed'} /></Card>)}
  </>}</Body>;
}
