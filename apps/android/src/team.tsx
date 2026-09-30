import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { MobileServices, Route } from './NativeWorkspace';
import { type Agent, type Conversation, type CoworkSnapshot, type Message, type RequestCard, mergeMessages, messageId } from './api';
import { TaskCard } from './TaskCard';
import { WidgetCard } from './WidgetCard';
import { useStream } from './useStream';
import { LiveActivity } from './LiveActivity';
import { useResource } from './hooks';
import { Avatar, Badge, Body, Button, Card, colors, Empty, Loading, Prose, styles } from './ui';
import { Toggle } from './forms';
import { ResourceError } from './chats';
import { ChatChrome, ChatMessage } from './ChatChrome';
import { Composer } from './Composer';
import { saveDownload } from './download';

interface Roster {
  agents: Agent[];
  memoryCounts: Record<string, number>;
  availableSkills: { name: string; description: string }[];
}
const shapes = ['home-blob', 'orb', 'cube', 'diamond', 'pyramid'];
const palette = ['#8f80ff', '#ff9e7a', '#6fcbb0', '#82b5ed', '#f5bd6f', '#da94cb'];
export function Team({ services: s }: { services: MobileServices }) {
  const roster = useResource<Roster>(s.api, '/api/cowork/agents', 6000);
  const conversations = useResource<{ conversations: Conversation[] }>(s.api, '/api/cowork/conversations', 6000);
  const [selected, setSelected] = useState('');
  const [newAgent, setNewAgent] = useState<Agent>();
  const agents = roster.data?.agents || [];
  const agent = agents.find((item) => item.id === selected) || newAgent || agents[0];
  async function newChat(group = false) {
    if (!agent) return;
    const created = await s.api.request<{ conversation: Conversation }>('/api/cowork/conversations', 'POST', {
      kind: group ? 'group' : 'dm',
      memberIds: group ? roster.data?.agents.map((item) => item.id) : [agent.id],
      ...(group ? { title: 'Team workspace', chiefId: agent.id } : {}),
    });
    s.go({ screen: 'cowork', id: created.conversation.id, agentId: agent.id });
    conversations.refresh();
  }
  return (
    <Body>
      <Text style={styles.title}>Meet your team</Text>
      <Text style={styles.muted}>Select a teammate to see their conversations and topics.</Text>
      <ResourceError
        error={roster.error || conversations.error}
        retry={() => {
          roster.refresh();
          conversations.refresh();
        }}
      />
      {roster.loading && <Loading />}
      <View style={{ gap: 8 }}>
        {[...agents]
          .sort((a, b) => Number(b.id === agent?.id) - Number(a.id === agent?.id))
          .map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Select teammate ${item.name}`}
              accessibilityState={{ selected: item.id === agent?.id }}
              onPress={() => setSelected(item.id)}
              style={[styles.row, { padding: 10, borderRadius: 16, backgroundColor: item.id === agent?.id ? '#25212c' : 'transparent' }]}
            >
              <Avatar avatar={item.avatar} size={58} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.heading}>
                  {item.name}
                </Text>
                <Text numberOfLines={2} style={styles.muted}>
                  {item.tagline || 'Teammate'}
                </Text>
              </View>
              {item.id === agent?.id && <Badge text="Selected" />}
            </Pressable>
          ))}
      </View>
      {agent && (
        <>
          <View style={styles.row}>
            <Text style={[styles.heading, { flex: 1 }]}>{agent.name}’s threads</Text>
            <Button title="Profile" onPress={() => s.go({ screen: 'agent', id: agent.id })} />
          </View>
          <View style={styles.wrap}>
            <Button primary title="New chat" onPress={() => void s.act(() => newChat())} />
            <Button title="Team topic" onPress={() => void s.act(() => newChat(true))} />
          </View>
          {conversations.data?.conversations
            .filter((conv) => conv.memberIds.includes(agent.id))
            .map((conv) => (
              <Card key={conv.id}>
                <Pressable onPress={() => s.go({ screen: 'cowork', id: conv.id, agentId: agent.id })}>
                  <Text style={styles.heading}>{conv.kind === 'dm' ? 'Main' : conv.title}</Text>
                  <Text style={styles.muted}>{conv.kind === 'group' ? 'Shared team conversation' : `Chat with ${agent.name}`}</Text>
                </Pressable>
                {conv.threads?.map((thread) => (
                  <Button key={thread.id} title={thread.title} onPress={() => s.go({ screen: 'cowork', id: conv.id, agentId: agent.id, threadId: thread.id })} />
                ))}
              </Card>
            ))}
        </>
      )}
      <Button
        title="Add a teammate"
        onPress={() =>
          s.form({
            title: 'Add teammate',
            fields: [
              { key: 'name', label: 'Name', required: true },
              { key: 'tagline', label: 'Role' },
              { key: 'systemPrompt', label: 'How should this teammate help?', multiline: true, required: true },
            ],
            save: async (values) => {
              const agents = roster.data?.agents || [];
              const combinations = palette.flatMap((color) => shapes.map((shape) => ({ color, shape })));
              const avatar =
                combinations.find((choice) => !agents.some((item) => item.avatar?.color === choice.color || item.avatar?.shape === choice.shape)) ||
                combinations.find((choice) => !agents.some((item) => item.avatar?.color === choice.color && item.avatar?.shape === choice.shape)) ||
                combinations[agents.length % combinations.length];
              const created = await s.api.request<{ agent: Agent }>('/api/cowork/agents', 'POST', {
                ...values,
                avatar,
                skills: [],
                allowShell: false,
                allowWrites: false,
                allowConfig: false,
                useHostComputer: true,
                chiefOfStaff: agents.length === 0,
                ...s.model,
              });
              setNewAgent(created.agent);
              setSelected(created.agent.id);
              roster.update((old) => ({
                agents: [...(old?.agents || []).filter((item) => item.id !== created.agent.id), created.agent],
                memoryCounts: old?.memoryCounts || {},
                availableSkills: old?.availableSkills || [],
              }));
              roster.refresh();
            },
          })
        }
      />
    </Body>
  );
}

export function AgentProfile({ services: s, id }: { services: MobileServices; id: string }) {
  const roster = useResource<Roster>(s.api, '/api/cowork/agents');
  const computer = useResource<{ computer: { state: string; error?: string; workspace?: string } }>(s.api, `/api/cowork/agents/${id}/computer`, 5000);
  const agent = roster.data?.agents.find((item) => item.id === id);
  const save = async (patch: Partial<Agent>) => {
    if (agent) {
      await s.api.request('/api/cowork/agents', 'POST', { ...agent, ...patch });
      roster.refresh();
    }
  };
  return (
    <Body>
      <ResourceError error={roster.error} retry={roster.refresh} />
      {roster.loading && <Loading />}
      {agent && (
        <>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Avatar avatar={agent.avatar} size={134} />
            <Text style={styles.title}>{agent.name}</Text>
            <Text style={styles.muted}>{agent.tagline}</Text>
            {agent.chiefOfStaff && <Badge text="Chief of staff" />}
          </View>
          <Button
            title="Edit profile"
            onPress={() =>
              s.form({
                title: 'Edit teammate',
                fields: [
                  { key: 'name', label: 'Name', value: agent.name, required: true },
                  { key: 'tagline', label: 'Role', value: agent.tagline },
                  { key: 'systemPrompt', label: 'About and instructions', value: agent.systemPrompt, multiline: true },
                ],
                save,
              })
            }
          />
          <Text style={styles.label}>ABOUT</Text>
          <Card>
            <Prose text={agent.systemPrompt || 'Add instructions to tell this teammate how to help.'} />
          </Card>
          <Text style={styles.label}>CHARACTER</Text>
          <View style={styles.wrap}>
            {shapes.map((shape) => (
              <Pressable
                key={shape}
                accessibilityLabel={`Choose ${shape} character`}
                onPress={() => void s.act(() => save({ avatar: { ...agent.avatar, shape } }))}
                style={{ backgroundColor: agent.avatar.shape === shape ? '#302838' : colors.card, borderRadius: 14, padding: 5 }}
              >
                <Avatar avatar={{ color: agent.avatar.color, shape }} size={58} />
              </Pressable>
            ))}
          </View>
          <View style={styles.wrap}>
            {palette.map((color) => (
              <Pressable
                key={color}
                accessibilityLabel={`Choose character color ${color}`}
                onPress={() => void s.act(() => save({ avatar: { ...agent.avatar, color } }))}
                style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: color, borderWidth: agent.avatar.color === color ? 3 : 0, borderColor: '#fff' }}
              />
            ))}
          </View>
          <Text style={styles.label}>PERMISSIONS</Text>
          <Card>
            {(
              [
                ['allowShell', 'Run commands', 'Allows commands on the teammate’s computer.'],
                ['allowWrites', 'Write files', 'Allows the teammate to edit its workspace.'],
                ['allowConfig', 'Manage tools', 'Allows setup of skills and connected tools.'],
                ['useHostComputer', 'Use my computer', 'Work directly on the computer running Agent Gitu.'],
                ['chiefOfStaff', 'Coordinate the team', 'Assign and combine work from teammates.'],
              ] as const
            ).map(([key, title, detail]) => (
              <Toggle
                key={key}
                title={title}
                detail={detail}
                value={agent[key]}
                onChange={(value) =>
                  Alert.alert(title, `${value ? 'Allow' : 'Remove'} this permission for ${agent.name}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Confirm', onPress: () => void s.act(() => save({ [key]: value })) },
                  ])
                }
              />
            ))}
          </Card>
          <Text style={styles.label}>MODEL</Text>
          <Card>
            <Text style={styles.text}>
              {agent.provider || 'Default provider'} · {agent.model || 'Default model'}
            </Text>
            <Button title="Use chosen model" disabled={!s.model} onPress={() => void s.act(() => save(s.model || {}))} />
            <Button title="Choose a model" onPress={() => s.go({ screen: 'models' })} />
            <Button
              title={`Effort: ${agent.effort || 'default'}`}
              onPress={() =>
                s.menu(
                  'Reasoning effort',
                  ['low', 'medium', 'high', 'max'].map((effort) => ({ title: effort, onPress: () => void s.act(() => save({ effort })) })),
                )
              }
            />
          </Card>
          <Text style={styles.label}>SKILLS</Text>
          <Card>
            {roster.data?.availableSkills.map((skill) => (
              <Toggle
                key={skill.name}
                title={skill.name}
                value={agent.skills.includes(skill.name)}
                onChange={(enabled) => void s.act(() => save({ skills: enabled ? [...agent.skills, skill.name] : agent.skills.filter((name) => name !== skill.name) }))}
              />
            ))}
            {!roster.data?.availableSkills.length && <Text style={styles.muted}>Add skills in Workspace.</Text>}
          </Card>
          <Text style={styles.label}>COMPUTER & MEMORY</Text>
          <Card>
            <Button primary title="Open computer" onPress={() => s.go({ screen: 'computer', id: agent.id, title: `${agent.name}’s computer` })} />
            <Text style={styles.text}>{agent.useHostComputer ? 'My computer' : `Private desktop · ${computer.data?.computer.state || 'Checking…'}`}</Text>
            {computer.data?.computer.error && <Text style={styles.muted}>{computer.data.computer.error}</Text>}
            <Text style={styles.muted}>{roster.data?.memoryCounts[id] || 0} memories saved</Text>
            {!agent.useHostComputer && (
              <View style={styles.wrap}>
                <Button title="Start desktop" onPress={() => void s.act(() => s.api.request(`/api/cowork/agents/${id}/computer`, 'POST', { action: 'start' }), computer.refresh)} />
                <Button title="Stop desktop" onPress={() => void s.act(() => s.api.request(`/api/cowork/agents/${id}/computer`, 'POST', { action: 'stop' }), computer.refresh)} />
              </View>
            )}
            <Button
              title="Clear memory"
              danger
              onPress={() =>
                Alert.alert('Clear saved memories?', agent.name, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => void s.act(() => s.api.request(`/api/cowork/agents/${id}/memory`, 'DELETE'), roster.refresh) },
                ])
              }
            />
          </Card>
          <Button
            title="Delete teammate"
            danger
            onPress={() =>
              Alert.alert('Delete this teammate?', `Remove ${agent.name} from your team?`, [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    void s.act(
                      () => s.api.request(`/api/cowork/agents/${id}`, 'DELETE'),
                      () => s.go({ screen: 'team' }),
                    ),
                },
              ])
            }
          />
        </>
      )}
    </Body>
  );
}

export function CoworkChat({ services: s, route }: { services: MobileServices; route: Route }) {
  const base = `/api/cowork/conversations/${route.id}`;
  const roster = useResource<Roster>(s.api, '/api/cowork/agents', 6000);
  const [snapshot, setSnapshot] = useState<CoworkSnapshot>(),
    [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const pendingSend = useRef<{ fingerprint: string; id: string } | undefined>(undefined),
    list = useRef<FlatList<Message>>(null),
    nearBottom = useRef(true),
    userScrolled = useRef(false);
  const agent = roster.data?.agents.find((item) => item.id === route.agentId);
  const refresh = () => setRevision((old) => old + 1);
  const stream = useStream<CoworkSnapshot>(s.api, `${base}/stream?thread=${encodeURIComponent(route.threadId || 'main')}`, (frames) => {
    for (const next of frames) {
      setSnapshot(next);
      setMessages((old) => mergeMessages(old, next));
      if (next.roster) roster.update((old) => ({ ...old, agents: next.roster!.agents, memoryCounts: old?.memoryCounts || {}, availableSkills: old?.availableSkills || [] }));
    }
    setError('');
  });
  useEffect(() => {
    let live = true,
      pending = false,
      after = 0,
      change = 0;
    const controller = new AbortController();

    async function update() {
      if (!live || pending || stream.available.current || AppState.currentState === 'background') return;
      pending = true;
      try {
        const next = await s.api.request<CoworkSnapshot>(
          `${base}/messages?after=${after}&change=${change}&thread=${encodeURIComponent(route.threadId || 'main')}`,
          'GET',
          undefined,
          controller.signal,
        );
        if (!live || stream.available.current) return;
        after = Math.max(after, ...next.messages.map((message) => message.seq));
        change = next.messageChangeSeq;
        setSnapshot(next);
        setMessages((old) => mergeMessages(old, next));
        setError('');
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Chat unavailable.');
      } finally {
        pending = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 2000);
    const resume = AppState.addEventListener('change', (state) => {
      if (state === 'active') void update();
    });
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
      resume.remove();
    };
  }, [s.api, base, route.threadId, revision]);
  function options() {
    s.menu('Conversation', [
      ...(agent ? [{ title: `${agent.name}’s profile`, onPress: () => s.go({ screen: 'agent', id: agent.id }) }] : []),
      ...(agent ? [{ title: 'Open computer', onPress: () => s.go({ screen: 'computer', id: agent.id, title: `${agent.name}’s computer` }) }] : []),
      { title: 'Main thread', onPress: () => s.go({ ...route, threadId: undefined }) },
      ...(snapshot?.threads || []).map((thread) => ({ title: thread.title, onPress: () => s.go({ ...route, threadId: thread.id }) })),
      {
        title: 'Create a topic',
        onPress: () =>
          s.form({
            title: 'New team topic',
            fields: [
              { key: 'title', label: 'Topic name', required: true },
              { key: 'topic', label: 'What should the team accomplish?', multiline: true },
            ],
            save: async (values) => {
              const result = await s.api.request<{ thread: { id: string } }>(`${base}/threads`, 'POST', values);
              s.go({ ...route, threadId: result.thread.id });
            },
          }),
      },
      {
        title: 'Tag a folder',
        onPress: () =>
          s.form({
            title: 'Tag team folder',
            fields: [
              { key: 'path', label: 'Folder path on your server', required: true },
              { key: 'label', label: 'Folder name' },
            ],
            save: async (values) => {
              await s.api.request(`${base}/folders`, 'POST', values);
              refresh();
            },
          }),
      },
      {
        title: 'Give the team a mission',
        onPress: () =>
          s.form({
            title: 'Team mission',
            fields: [
              { key: 'goal', label: 'Goal', required: true, multiline: true },
              { key: 'criteria', label: 'What counts as done? One requirement per line', multiline: true },
            ],
            submit: 'Start mission',
            save: async (values) => {
              await s.api.request(`${base}/missions`, 'POST', { agentId: agent?.id, goal: values.goal, criteria: values.criteria.split('\n').filter(Boolean) });
              refresh();
            },
          }),
      },
      { title: 'Stop work', onPress: () => void s.act(() => s.api.request(`${base}/stop`, 'POST'), refresh) },
    ]);
  }
  const topic = snapshot?.threads.find((thread) => thread.id === route.threadId);
  function messageOptions(message: Message) {
    s.menu('Your message', [
      {
        title: 'Edit message',
        onPress: () =>
          s.form({
            title: 'Edit your message',
            fields: [{ key: 'text', label: 'Message', value: message.text, multiline: true, required: true }],
            save: async (values) => {
              await s.api.request(`${base}/messages/${message.id}`, 'PATCH', { ...values, revision: message.revision });
              refresh();
            },
          }),
      },
      ...(message.status === 'failed'
        ? [{ title: 'Retry delivery', onPress: () => void s.act(() => s.api.request(`${base}/messages/${message.id}/retry`, 'POST', { attempt: message.attempt }), refresh) }]
        : []),
      {
        title: 'Delete message',
        onPress: () =>
          Alert.alert('Delete this message?', 'This removes it from the conversation.', [
            { text: 'Keep', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void s.act(() => s.api.request(`${base}/messages/${message.id}`, 'DELETE'), refresh) },
          ]),
      },
    ]);
  }
  return (
    <View style={styles.fill}>
      <ChatChrome avatar={agent?.avatar} name={agent?.name || 'Team'} back={s.back} projects={s.openProjects} details={options} />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(message) => message.id}
        style={{ flex: 1, minHeight: 0, width: '100%' }}
        contentContainerStyle={[styles.content, { paddingTop: 84 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          userScrolled.current = true;
        }}
        onScroll={(event) => {
          if (!userScrolled.current) return;
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
        }}
        onContentSizeChange={() => {
          if (nearBottom.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={
          <>
            {topic && <Text style={[styles.muted, { marginBottom: 12 }]}>{topic.title}</Text>}
            <ResourceError error={error} retry={refresh} />
            {!snapshot && !error && <Loading />}
          </>
        }
        ListEmptyComponent={snapshot ? <Empty title="Start this conversation" detail="Tell your teammate what you want to accomplish." /> : null}
        renderItem={({ item }) => (
          <ChatMessage
            user={item.role === 'user'}
            name={item.role === 'user' ? 'You' : item.agentName || agent?.name || 'Team'}
            avatar={roster.data?.agents.find((member) => member.id === item.agentId)?.avatar || agent?.avatar}
            timestamp={item.ts}
            options={item.role === 'user' ? () => messageOptions(item) : undefined}
          >
            {item.checkpoint ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>CHECKPOINT {item.checkpoint.number}</Text>
                <Prose text={item.checkpoint.accomplished} />
                {item.checkpoint.issues && (
                  <>
                    <Text style={styles.label}>NEEDS ATTENTION</Text>
                    <Prose text={item.checkpoint.issues} />
                  </>
                )}
                {item.checkpoint.next && (
                  <>
                    <Text style={styles.label}>NEXT</Text>
                    <Prose text={item.checkpoint.next} />
                  </>
                )}
              </View>
            ) : (
              <Prose text={item.text} />
            )}
            {item.status === 'failed' && <Badge text="Message failed" />}
          </ChatMessage>
        )}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {snapshot?.requests
              .filter((request) => request.status === 'open')
              .map((request) => (
                <Request key={request.id} request={request} services={s} refresh={refresh} />
              ))}
            {snapshot?.busy &&
              (snapshot.progresses?.length ? snapshot.progresses : snapshot.progress ? [snapshot.progress] : []).map((progress) => (
                <ChatMessage key={progress.agentId} name={progress.agentName} avatar={roster.data?.agents.find((member) => member.id === progress.agentId)?.avatar}>
                  <LiveActivity
                    busy
                    reasoning={progress.reasoning}
                    label={progress.tool ? `Using ${progress.tool.replace(/_/g, ' ')}` : progress.phase === 'responding' ? 'Writing a response' : 'Thinking'}
                    tools={
                      progress.tool
                        ? [
                            {
                              id: progress.agentId,
                              title: progress.tool.replace(/_/g, ' '),
                              detail: progress.detail,
                              state: progress.toolOk === undefined ? 'running' : progress.toolOk ? 'done' : 'failed',
                            },
                          ]
                        : []
                    }
                  />
                  {progress.text && progress.text !== 'Working…' && <Prose text={progress.text} />}
                </ChatMessage>
              ))}
            <LiveActivity
              tools={(snapshot?.workHistory || []).map((work) => ({
                id: work.id,
                title: `${work.agentName} · ${work.tool.replace(/_/g, ' ')}`,
                detail: work.publicUpdate,
                state: work.ok ? 'done' : 'failed',
              }))}
            />
            {snapshot?.missions.map((mission) => (
              <Card key={mission.id}>
                <Text style={styles.heading}>{mission.goal}</Text>
                <Badge text={mission.status} />
                {mission.result && <Prose text={mission.result} />}
                {typeof mission.progress === 'string' && <Text style={styles.muted}>{mission.progress}</Text>}
              </Card>
            ))}
            <TaskCard items={snapshot?.todos || []} agents={roster.data?.agents} />
            {snapshot?.folders.map((folder) => (
              <Card key={folder.id}>
                <Text style={styles.heading}>{folder.label}</Text>
                <Text selectable style={styles.muted}>
                  {folder.path}
                </Text>
                <Button title="Remove tag" onPress={() => void s.act(() => s.api.request(`${base}/folders/${folder.id}`, 'DELETE'), refresh)} />
              </Card>
            ))}
            {snapshot?.widgets.map((widget) => (
              <WidgetCard key={widget.id} widget={widget} />
            ))}
            {snapshot?.artifacts.map((file) => (
              <Card key={file.id}>
                {file.mime.startsWith('image/') && (
                  <Image
                    accessibilityLabel={file.name}
                    source={{ uri: s.api.connection.url + `/api/cowork/artifacts/${file.id}?inline=1`, headers: { Authorization: `Bearer ${s.api.connection.key}` } }}
                    style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                )}
                <Text numberOfLines={2} style={styles.text}>
                  {file.name}
                </Text>
                <Button title="Save file" onPress={() => void s.act(() => saveDownload(s.api, `/api/cowork/artifacts/${file.id}`, file.name, file.mime))} />
              </Card>
            ))}
          </View>
        }
      />
      {snapshot?.busy && <Text style={[styles.muted, { paddingHorizontal: 20 }]}>{snapshot.working || agent?.name || 'Your team'} is working…</Text>}
      <Composer
        onModel={() => s.go({ screen: 'models' })}
        onProjects={s.openProjects}
        placeholder={`Message ${agent?.name || 'your team'}…`}
        hint={agent?.model || s.model?.model || 'Model'}
        options={options}
        onSend={async (text, files) => {
          const fingerprint = JSON.stringify([text, files.map((file) => [file.name, file.dataUrl]), route.threadId]);
          if (pendingSend.current?.fingerprint !== fingerprint) pendingSend.current = { fingerprint, id: messageId() };
          await s.api.request(`${base}/messages`, 'POST', { id: pendingSend.current.id, text, files, threadId: route.threadId || null });
          pendingSend.current = undefined;
        }}
      />
    </View>
  );
}

function Request({ request, services: s, refresh }: { request: RequestCard; services: MobileServices; refresh: () => void }) {
  const answer = async (action: string, response?: string) => {
    await s.api.request(`/api/cowork/requests/${request.id}`, 'POST', { action, response });
    refresh();
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Card>
        <Text style={styles.heading}>{request.title}</Text>
        <Prose text={request.detail} />
        {request.kind === 'permission' ? (
          <View style={styles.wrap}>
            <Button title="Allow" primary onPress={() => void s.act(() => answer('approve'))} />
            <Button title="Deny" onPress={() => void s.act(() => answer('deny'))} />
          </View>
        ) : request.kind === 'recommendation' ? (
          <View style={styles.wrap}>
            <Button title="Accept" primary onPress={() => void s.act(() => answer('accept'))} />
            <Button title="Dismiss" onPress={() => void s.act(() => answer('dismiss'))} />
          </View>
        ) : request.kind === 'credential' ? (
          <>
            <Button title="Connect service" onPress={() => s.go({ screen: 'integrations' })} />
            <Button
              title="Use saved connection"
              onPress={() =>
                s.form({
                  title: 'Share saved connection',
                  fields: [{ key: 'connectionId', label: 'Connection ID', required: true }],
                  save: async (values) => {
                    await s.api.request(`/api/cowork/requests/${request.id}`, 'POST', { action: 'provide', ...values });
                    refresh();
                  },
                })
              }
            />
          </>
        ) : (
          <>
            {request.options.map((option) => (
              <Button key={option} title={option} onPress={() => void s.act(() => answer('answer', option))} />
            ))}
            <Button
              title="Write an answer"
              primary
              onPress={() =>
                s.form({
                  title: 'Answer teammate',
                  fields: [{ key: 'response', label: 'Your answer', multiline: true, required: true }],
                  save: (values) => answer('answer', values.response),
                })
              }
            />
          </>
        )}
      </Card>
    </View>
  );
}
