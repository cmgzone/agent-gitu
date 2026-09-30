import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import type { MobileServices, Route } from './NativeWorkspace';
import type { Models as Catalog, Run } from './api';
import { useResource } from './hooks';
import { Badge, Body, Button, Card, colors, Empty, Field, Icon, Loading, Prose, styles } from './ui';
import { ResourceError } from './chats';

interface Project { name: string; repoRoot: string; error?: string }
interface Browse { path: string; parent: string; dirs: string[] }
export function Workspace({ services: s }: { services: MobileServices }) {
  const home = useResource<{ projectsPath: string; workspace: string }>(s.api, '/api/home');
  const active = useResource<Project>(s.api, '/api/project');
  const projects = useResource<Browse>(s.api, `/api/browse?path=${encodeURIComponent(home.data?.projectsPath || '')}`);
  const runs = useResource<Run[]>(s.api, '/api/runs', 6000);
  const root = s.project || active.data?.repoRoot;
  return <Body><Text style={styles.title}>Your workspace</Text><Text style={styles.muted}>Files and tools on {s.api.connection.name}.</Text><ResourceError error={home.error || active.error} retry={() => { home.refresh(); active.refresh(); }} />
    <Text style={styles.label}>PROJECTS</Text>{active.data && <Card><Text style={styles.heading}>{active.data.name}</Text><Text selectable style={styles.muted}>{active.data.repoRoot}</Text><View style={styles.wrap}><Button primary={root === active.data.repoRoot} title={root === active.data.repoRoot ? 'Selected' : 'Use project'} onPress={() => s.setProject(active.data!.repoRoot)} /><Button title="Files" onPress={() => s.go({ screen: 'files', path: active.data!.repoRoot })} /></View></Card>}
    {projects.data?.dirs.filter(path => path !== active.data?.repoRoot).map(path => <Card key={path}><Text style={styles.heading}>{path.split(/[\\/]/).pop()}</Text><View style={styles.wrap}><Button primary={root === path} title={root === path ? 'Selected' : 'Use project'} onPress={() => s.setProject(path)} /><Button title="Files" onPress={() => s.go({ screen: 'files', path })} /></View></Card>)}
    <Button title="Create project" onPress={() => s.form({ title: 'Create project', fields: [{ key: 'name', label: 'Project name', required: true }], save: async values => { await s.api.request('/api/projects', 'POST', values); projects.refresh(); } })} />
    <Text style={styles.label}>TOOLS</Text>{[
      { title: 'Files', detail: 'Read documents and edit project files', icon: 'folder', screen: 'files' },
      { title: 'Git', detail: 'Review changes, commit, and publish', icon: 'git', screen: 'git' },
      { title: 'Browser', detail: 'See and control your agent’s browser', icon: 'globe', screen: 'browser' },
      { title: 'Scheduled work', detail: 'Create and manage recurring runs', icon: 'clock', screen: 'schedules' },
      { title: 'Skills', detail: 'Manage instructions your agent can use', icon: 'spark', screen: 'skills' },
      { title: 'MCP servers', detail: 'Connect tools and services', icon: 'link', screen: 'mcp' },
    ].map(tool => <Pressable key={tool.screen} accessibilityRole="button" onPress={() => s.go({ screen: tool.screen, path: root, title: tool.title })}><Card><View style={styles.row}><Icon name={tool.icon} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.heading}>{tool.title}</Text><Text style={styles.muted}>{tool.detail}</Text></View></View></Card></Pressable>)}
    <Text style={styles.label}>TASK PROGRESS</Text>{runs.data?.slice(0, 12).map(run => <Pressable key={run.runId} onPress={() => s.go({ screen: 'task', id: run.runId, title: 'Task progress' })}><Card><Text style={styles.text}>{run.goal}</Text><Badge text={run.status} /></Card></Pressable>)}
  </Body>;
}

interface FileView { writable: boolean; root: string; path: string; entries?: { name: string; path: string; directory: boolean }[]; content?: string; revision?: string }
export function Files({ services: s, route }: { services: MobileServices; route: Route }) {
  const resource = useResource<FileView>(s.api, `/api/mobile/files?root=${encodeURIComponent(route.path || s.project)}&path=${encodeURIComponent(route.id || '')}`);
  const [editing, setEditing] = useState(false), [content, setContent] = useState('');
  const data = resource.data;
  useEffect(() => { if (data?.content !== undefined) setContent(data.content); }, [data]);
  return <Body><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}{data && <><Text selectable style={styles.muted}>{data.root}{data.path ? ` · ${data.path}` : ''}</Text>
    {data.entries ? <>{!data.entries.length && <Empty title="This folder is empty" />}{data.entries.map(entry => <Pressable key={entry.path} accessibilityRole="button" onPress={() => s.go({ screen: 'files', path: data.root, id: entry.path, title: entry.name })}><Card><View style={styles.row}><Icon name={entry.directory ? 'folder' : 'file'} /><Text style={styles.text}>{entry.name}</Text></View></Card></Pressable>)}</> : <>
      <View style={styles.wrap}><Button disabled={!data.writable} title={editing ? 'Discard edits' : data.writable ? 'Edit file' : 'Read only'} onPress={() => { if (editing) Alert.alert('Discard your edits?', 'The saved file will stay unchanged.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { setContent(data.content || ''); setEditing(false); } }]); else setEditing(true); }} />{editing && <Button primary title="Save file" onPress={() => Alert.alert('Save changes?', `Write your edits to ${data.path} on ${s.api.connection.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: () => void s.act(async () => { const saved = await s.api.request<{ revision: string }>('/api/mobile/files', 'PUT', { root: data.root, path: data.path, revision: data.revision, content, approved: true }); data.revision = saved.revision; setEditing(false); resource.refresh(); }) }])} />}</View>
      <Button title="Reload saved file" onPress={() => editing ? Alert.alert('Reload this file?', 'Your unsaved edits will be discarded.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Reload', onPress: () => { setEditing(false); resource.refresh(); } }]) : resource.refresh()} />
      {editing ? <TextInput accessibilityLabel="File contents" value={content} onChangeText={setContent} multiline autoCapitalize="none" autoCorrect={false} style={[styles.input, { minHeight: 400, fontFamily: 'monospace', fontSize: 13, textAlignVertical: 'top' }]} /> : <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 21 }}>{data.content}</Text>}
    </>}
  </>}</Body>;
}

interface GitInfo { root: string; available: boolean; branch?: string; remote?: string; ahead?: number; behind?: number; error?: string; files?: { path: string; status: string; untracked: boolean }[] }
export function Git({ services: s }: { services: MobileServices }) {
  const resource = useResource<GitInfo>(s.api, `/api/git?path=${encodeURIComponent(s.project)}`);
  const [diff, setDiff] = useState('');
  const data = resource.data;
  return <Body><Text style={styles.title}>Review your changes</Text><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}{data && <><Text selectable style={styles.muted}>{data.root}</Text>{data.available ? <><View style={styles.wrap}><Badge text={data.branch || 'Repository'} /><Badge text={`${data.ahead || 0} ahead · ${data.behind || 0} behind`} /></View>{data.remote && <Text style={styles.muted}>{data.remote}</Text>}
    {!data.files?.length && <Empty title="Everything is saved" detail="There are no uncommitted changes." />}{data.files?.map(file => <Card key={file.path}><Text style={styles.text}>{file.path}</Text><Badge text={file.untracked ? 'New file' : file.status} /><View style={styles.wrap}><Button title="View changes" onPress={() => void s.act(async () => { const result = await s.api.request<{ diff: string }>(`/api/git/diff?path=${encodeURIComponent(data.root)}&file=${encodeURIComponent(file.path)}`); setDiff(result.diff || 'No text changes to display.'); })} /><Button title="Discard" danger onPress={() => Alert.alert('Discard file changes?', file.path, [{ text: 'Keep', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => void s.act(() => s.api.request('/api/git/discard', 'POST', { path: data.root, file: file.path }), resource.refresh) }])} /></View></Card>)}
    {diff && <Card><Text style={styles.heading}>Changes</Text><Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12 }}>{diff}</Text><Button title="Close changes" onPress={() => setDiff('')} /></Card>}
    <Button primary title="Commit changes" disabled={!data.files?.length} onPress={() => s.form({ title: 'Commit changes', fields: [{ key: 'message', label: 'Describe this change', required: true }], submit: 'Commit', save: async values => { await s.api.request('/api/git/commit', 'POST', { path: data.root, ...values }); resource.refresh(); } })} />
    <Button title="Push to remote" onPress={() => Alert.alert('Publish commits?', `Push ${data.branch} to ${data.remote || 'its configured remote'}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Push', onPress: () => void s.act(() => s.api.request('/api/git/push', 'POST', { path: data.root }), resource.refresh) }])} />
  </> : <><Text style={styles.muted}>{data.error || 'This project does not have a Git repository.'}</Text><Button title="Initialize repository" onPress={() => void s.act(() => s.api.request('/api/git/init', 'POST', { path: data.root }), resource.refresh)} /></>}</>}</Body>;
}

interface BrowserState { url: string; title: string; canBack: boolean; canForward: boolean; driving?: boolean }
export function Browser({ services: s }: { services: MobileServices }) {
  const resource = useResource<{ has: boolean; state: BrowserState }>(s.api, '/api/browser', 5000);
  const [url, setUrl] = useState(''), [image, setImage] = useState(''), [size, setSize] = useState({ width: 1280, height: 720 }), [displayWidth, setDisplayWidth] = useState(0), [text, setText] = useState('');
  async function screenshot() {
    const shot = await s.api.request<{ pngBase64: string; mime?: string }>('/api/browser/screenshot', 'POST');
    const uri = `data:${shot.mime || 'image/png'};base64,${shot.pngBase64}`;
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
    setSize(dimensions); setImage(uri);
  }
  async function action(name: string, body?: unknown) { await s.api.request(`/api/browser/${name}`, 'POST', body); await screenshot(); resource.refresh(); }
  useEffect(() => { if (resource.data?.state.url && !url) setUrl(resource.data.state.url); }, [resource.data?.state.url]);
  return <Body><Text style={styles.title}>Your agent’s browser</Text><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}{resource.data && !resource.data.has ? <Empty title="Browser is not connected" detail="This server has no connected desktop browser. Connect a server with the Agent Gitu desktop browser available to use these controls." /> : resource.data && <>
    {resource.data.state.driving && <Card><Text style={styles.muted}>Your agent is using the browser. Wait for it to finish before interacting.</Text></Card>}
    <Field label="Website address" value={url} onChange={setUrl} placeholder="https://example.com" /><Button primary title="Open website" disabled={resource.data.state.driving || !url.trim()} onPress={() => void s.act(() => action('navigate', { url }))} />
    <View style={styles.wrap}><Button title="Back" disabled={!resource.data.state.canBack || resource.data.state.driving} onPress={() => void s.act(() => action('back'))} /><Button title="Forward" disabled={!resource.data.state.canForward || resource.data.state.driving} onPress={() => void s.act(() => action('forward'))} /><Button title="Refresh view" onPress={() => void s.act(screenshot)} /><Button title="Reload page" disabled={resource.data.state.driving} onPress={() => void s.act(() => action('reload'))} /></View>
    <Text style={styles.muted}>{resource.data.state.title}</Text>{image && <Pressable accessibilityLabel="Browser page. Tap to click." disabled={resource.data.state.driving || !displayWidth} onLayout={event => setDisplayWidth(event.nativeEvent.layout.width)} onPress={event => { const { locationX, locationY } = event.nativeEvent; void s.act(() => action('click', { x: Math.round(locationX * size.width / displayWidth), y: Math.round(locationY * size.width / displayWidth) })); }}><Image source={{ uri: image }} style={{ width: '100%', aspectRatio: size.width / size.height }} resizeMode="contain" /></Pressable>}
    <View style={styles.wrap}><Button title="Scroll up" disabled={resource.data.state.driving} onPress={() => void s.act(() => action('scroll', { x: size.width / 2, y: size.height / 2, deltaY: -450 }))} /><Button title="Scroll down" disabled={resource.data.state.driving} onPress={() => void s.act(() => action('scroll', { x: size.width / 2, y: size.height / 2, deltaY: 450 }))} /></View>
    <Field label="Type into the selected field" value={text} onChange={setText} /><Button title="Type text" disabled={resource.data.state.driving} onPress={() => void s.act(() => action('type', { text }))} /><Button title="Press Enter" disabled={resource.data.state.driving} onPress={() => void s.act(() => action('press', { key: 'Enter' }))} />
  </>}</Body>;
}

interface Skill { name: string; description: string; instructions: string; scope?: string }
interface Job { id: string; goal: string; every: string; lastRunAt?: string; lastRunId?: string }
interface Mcp { name: string; command: string; args: string[] }
export function Library({ services: s, kind }: { services: MobileServices; kind: string }) {
  const path = kind === 'schedules' ? '/api/cron' : `/api/${kind}`;
  const resource = useResource<{ skills?: Skill[]; jobs?: Job[]; servers?: Mcp[]; tools?: { name: string; server?: string; description?: string }[] }>(s.api, path);
  const project = useResource<Project>(s.api, '/api/project');
  function add() {
    if (kind === 'schedules') s.form({ title: 'Schedule a task', fields: [{ key: 'goal', label: 'What should your agent do?', required: true, multiline: true }, { key: 'every', label: 'Repeat every', placeholder: '30m, 2h, or 1d', required: true }], save: async values => { await s.api.request(path, 'POST', values); resource.refresh(); } });
    else if (kind === 'skills') s.form({ title: 'Create skill', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'When to use this skill', required: true }, { key: 'instructions', label: 'Instructions', multiline: true, required: true }], save: async values => { await s.api.request(path, 'POST', values); resource.refresh(); } });
    else s.form({ title: 'Connect MCP server', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'command', label: 'Command on the server', required: true }, { key: 'args', label: 'Arguments, one per line', multiline: true }], save: async values => { await s.api.request(path, 'POST', { ...values, args: values.args.split('\n').filter(Boolean) }); resource.refresh(); } });
  }
  function remove(id: string, title: string) { Alert.alert(`Remove ${title}?`, 'This changes the configuration on your agent server.', [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void s.act(() => s.api.request(`${path}/${encodeURIComponent(id)}`, 'DELETE'), resource.refresh) }]); }
  return <Body><Text style={styles.title}>{kind === 'schedules' ? 'Scheduled work' : kind === 'mcp' ? 'Connected tools' : 'Your skills'}</Text><Text style={styles.muted}>Server workspace: {project.data?.name || 'Loading…'}</Text><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}<Button primary title={kind === 'schedules' ? 'Schedule task' : kind === 'skills' ? 'Create skill' : 'Connect server'} onPress={add} />
    {resource.data?.jobs?.map(job => <Card key={job.id}><Text style={styles.heading}>{job.goal}</Text><Badge text={`Every ${job.every}`} />{job.lastRunAt && <Text style={styles.muted}>Last run {new Date(job.lastRunAt).toLocaleString()}</Text>}{job.lastRunId && <Button title="Open last run" onPress={() => s.go({ screen: 'chat', id: job.lastRunId })} />}<Button title="Remove schedule" danger onPress={() => remove(job.id, 'schedule')} /></Card>)}
    {resource.data?.skills?.map(skill => <Card key={skill.name}><Text style={styles.heading}>{skill.name}</Text><Text style={styles.muted}>{skill.description}</Text><Badge text={skill.scope || 'Project'} /><Button title="View and edit" onPress={() => s.form({ title: skill.name, fields: [{ key: 'description', label: 'Description', value: skill.description }, { key: 'instructions', label: 'Instructions', value: skill.instructions, multiline: true }], save: async values => { await s.api.request(`${path}/${encodeURIComponent(skill.name)}`, 'POST', values); resource.refresh(); } })} />{skill.scope !== 'builtin' && <Button title="Remove skill" danger onPress={() => remove(skill.name, 'skill')} />}</Card>)}
    {resource.data?.servers?.map(server => <Card key={server.name}><Text style={styles.heading}>{server.name}</Text><Text selectable style={styles.muted}>{server.command} {server.args?.join(' ')}</Text>{resource.data?.tools?.filter(tool => tool.server === server.name).map(tool => <View key={tool.name}><Text style={styles.text}>{tool.name}</Text><Text style={styles.muted}>{tool.description}</Text></View>)}<Button title="Disconnect server" danger onPress={() => remove(server.name, 'server')} /></Card>)}
    {resource.data && !(resource.data.jobs?.length || resource.data.skills?.length || resource.data.servers?.length) && <Empty title="Nothing added yet" detail="Add one using the button above." />}
  </Body>;
}

export function Models({ services: s }: { services: MobileServices }) {
  const resource = useResource<Catalog>(s.api, '/api/models');
  const [provider, setProvider] = useState(s.model?.provider || ''), [search, setSearch] = useState('');
  const selected = resource.data?.providers.find(item => item.id === provider) || resource.data?.providers.find(item => item.id === resource.data?.defaultProvider);
  return <Body><Text style={styles.title}>Choose your model</Text><Text style={styles.muted}>This selection is used for new chats and your next message.</Text><ResourceError error={resource.error} retry={resource.refresh} />{resource.loading && <Loading />}
    <View style={styles.wrap}>{resource.data?.providers.map(item => <Button key={item.id} title={`${item.label}${item.usable ? ' · connected' : ''}`} primary={item.id === selected?.id} onPress={() => { setProvider(item.id); setSearch(''); }} />)}</View>
    {selected && <><Text style={styles.heading}>{selected.label}</Text>{!selected.usable && <Text style={styles.muted}>Connect this provider in Settings before starting a chat.</Text>}<Field label="Search models" value={search} onChange={setSearch} />{selected.models.filter(model => model.id.toLowerCase().includes(search.toLowerCase())).map(model => <Pressable key={model.id} onPress={() => { s.setModel({ provider: selected.id, model: model.id }); Alert.alert('Model selected', model.id); }}><Card><Text style={styles.text}>{model.id}</Text>{s.model?.model === model.id && s.model.provider === selected.id && <Badge text="Selected" />}{model.metadata?.contextTokens && <Text style={styles.muted}>{model.metadata.contextTokens.toLocaleString()} token context</Text>}</Card></Pressable>)}</>}
  </Body>;
}

export function Settings({ services: s }: { services: MobileServices }) {
  const catalog = useResource<Catalog>(s.api, '/api/models');
  const keys = useResource<{ stored: string[] }>(s.api, '/api/keys');
  const profile = useResource<{ name?: string; about?: string; preferences?: string }>(s.api, '/api/cowork/profile');
  return <Body><Text style={styles.title}>Make Gitu yours</Text><Button title="Computer and server connections" onPress={s.manageConnections} /><Button title="Choose model" onPress={() => s.go({ screen: 'models' })} /><Button title="Connected services" onPress={() => s.go({ screen: 'integrations' })} />
    <Text style={styles.label}>YOUR PROFILE</Text><Card><Text style={styles.heading}>{profile.data?.name || 'Your profile'}</Text><Text style={styles.muted}>{profile.data?.about || 'Tell your team about yourself.'}</Text><Button title="Edit profile" onPress={() => s.form({ title: 'Your profile', fields: [{ key: 'name', label: 'Name', value: profile.data?.name }, { key: 'about', label: 'About you', value: profile.data?.about, multiline: true }, { key: 'preferences', label: 'How should your agents work?', value: profile.data?.preferences, multiline: true }], save: async values => { await s.api.request('/api/cowork/profile', 'POST', values); profile.refresh(); } })} /></Card>
    <Text style={styles.label}>MODEL PROVIDERS</Text><ResourceError error={catalog.error || keys.error} retry={() => { catalog.refresh(); keys.refresh(); }} />{catalog.loading && <Loading />}{catalog.data?.providers.map(provider => <Card key={provider.id}><Text style={styles.heading}>{provider.label}</Text><Badge text={provider.usable ? 'Connected' : 'Not connected'} />{provider.keyEnvVars?.[0] ? <><Button title="Set access key" onPress={() => s.form({ title: `Connect ${provider.label}`, fields: [{ key: 'key', label: 'Provider API key', secret: true, required: true }], save: async values => { await s.api.request('/api/keys', 'POST', { envVar: provider.keyEnvVars[0], key: values.key }); keys.refresh(); catalog.refresh(); } })} />{keys.data?.stored.includes(provider.keyEnvVars[0]) && <Button title="Remove saved key" danger onPress={() => Alert.alert('Remove provider key?', provider.label, [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', onPress: () => void s.act(() => s.api.request(`/api/keys/${provider.keyEnvVars[0]}`, 'DELETE'), () => { keys.refresh(); catalog.refresh(); }) }])} />}</> : <Text style={styles.muted}>Sign in to this provider on your Agent Gitu computer.</Text>}</Card>)}
    <Text style={styles.label}>PHONE APP</Text><Card><Text style={styles.text}>Agent Gitu · 0.2.0</Text><Text style={styles.muted}>Your phone is the control center. Agent work runs on the computer or hosted server you connect to.</Text></Card>
  </Body>;
}

interface Integration { id: string; label: string; provider: string; baseUrl: string; status?: string }
export function Integrations({ services: s }: { services: MobileServices }) {
  const resource = useResource<{ connections: Integration[] }>(s.api, '/api/connections');
  return <Body><Text style={styles.title}>Connected services</Text><Text style={styles.muted}>Credentials go directly to your agent’s secure connection store.</Text><ResourceError error={resource.error} retry={resource.refresh} /><Button primary title="Connect a service" onPress={() => s.form({ title: 'Connect service', fields: [{ key: 'label', label: 'Name', required: true }, { key: 'provider', label: 'Provider ID', placeholder: 'github, coolify, …', required: true }, { key: 'baseUrl', label: 'Service address', placeholder: 'https://api.example.com', required: true }, { key: 'token', label: 'Access token', secret: true, required: true }, { key: 'capabilities', label: 'Capabilities, one per line', multiline: true }], save: async values => { await s.api.request('/api/connections', 'POST', { ...values, capabilities: values.capabilities.split('\n').filter(Boolean) }); resource.refresh(); } })} />
    {resource.loading && <Loading />}{resource.data?.connections.map(connection => <Card key={connection.id}><Text style={styles.heading}>{connection.label}</Text><Text selectable style={styles.muted}>{connection.id}</Text><Text style={styles.muted}>{connection.baseUrl}</Text><Badge text={connection.status || connection.provider} /><Button title="Test connection" onPress={() => void s.act(async () => { const result = await s.api.request<{ status: string; message: string }>(`/api/connections/${connection.id}/test`, 'POST'); Alert.alert(result.status, result.message); resource.refresh(); })} /><Button title="Disconnect" danger onPress={() => Alert.alert('Disconnect service?', connection.label, [{ text: 'Keep', style: 'cancel' }, { text: 'Disconnect', onPress: () => void s.act(() => s.api.request(`/api/connections/${connection.id}`, 'DELETE'), resource.refresh) }])} /></Card>)}
  </Body>;
}
