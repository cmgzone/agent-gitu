import { ArrowUp, ChevronLeft, MessageCircle, Plus, RefreshCw, Square, Users } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, CheckRow, colors, ErrorNotice, Field, IconButton, s, Sheet } from '../ui';
import type { GituApi } from './client';
import { usePolling } from './hooks';
import type { TeamConversation, TeamRequest, TeamRoster, Teammate } from './types';

export function Teams({ api, selected, select }: { api: GituApi; selected?: string; select: (id?: string) => void }) {
  const load = useCallback((signal: AbortSignal) => api.teams(signal), [api]);
  const { value: roster, error: loadError, refresh } = usePolling(load, 5000);
  const [profile, setProfile] = useState<Teammate | 'new'>();
  const [newGroup, setNewGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const direct = async (agent: Teammate) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const existing = roster?.conversations.find((chat) => chat.kind === 'dm' && chat.memberIds.length === 1 && chat.memberIds[0] === agent.id);
      const chat = existing || (await api.createTeamChat([agent.id])).conversation;
      select(chat.id);
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open this conversation.');
    } finally {
      setBusy(false);
    }
  };
  const conversation = roster?.conversations.find((chat) => chat.id === selected);
  return (
    <View style={{ flex: 1 }}>
      {!!(loadError || error) && (
        <View style={{ paddingHorizontal: 22 }}>
          <ErrorNotice error={error || loadError} />
          <Button small icon={RefreshCw} onPress={refresh}>
            Retry Teams
          </Button>
        </View>
      )}
      {!roster ? (
        <ActivityIndicator style={{ margin: 24 }} color={colors.blueDark} />
      ) : selected ? (
        conversation ? (
          <TeamChat key={conversation.id} api={api} conversation={conversation} roster={roster} back={() => select(undefined)} />
        ) : (
          <View style={{ padding: 22, gap: 16 }}>
            <Text style={s.muted}>This conversation is no longer available.</Text>
            <Button onPress={() => select(undefined)}>Back to Teams</Button>
          </View>
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
          <Text style={s.title}>Meet your team</Text>
          <Text style={s.muted}>Your Cowork teammates and conversations, shared with Gitu on your computer.</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 10 }]}>
            <Button primary icon={Plus} onPress={() => setProfile('new')}>
              Add teammate
            </Button>
            <Button icon={Users} disabled={roster.agents.length < 2} onPress={() => setNewGroup(true)}>
              New group
            </Button>
          </View>
          {!roster.agents.length && (
            <Card>
              <Text style={s.muted}>Add your first teammate with a name and instructions, then start a conversation.</Text>
            </Card>
          )}
          {roster.agents.map((agent) => (
            <Card key={agent.id}>
              <View style={[s.row, { gap: 12 }]}>
                <View style={[s.iconBox, { backgroundColor: colors.lavender }]}>
                  <Users size={21} color={colors.blueDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.heading}>{agent.name}</Text>
                  <Text style={s.small}>{agent.tagline || (agent.chiefOfStaff ? 'Chief of staff' : 'Teammate')}</Text>
                </View>
              </View>
              <Text numberOfLines={3} style={[s.muted, { marginVertical: 12 }]}>
                {agent.systemPrompt}
              </Text>
              <View style={[s.row, { gap: 10, flexWrap: 'wrap' }]}>
                <Button small icon={MessageCircle} disabled={busy} onPress={() => void direct(agent)}>
                  Chat with {agent.name}
                </Button>
                <Button small onPress={() => setProfile(agent)}>
                  View profile
                </Button>
              </View>
            </Card>
          ))}
          <Text style={s.heading}>Conversations</Text>
          {!roster.conversations.length && <Text style={s.muted}>Start a direct chat or assemble a group.</Text>}
          {roster.conversations.map((chat) => (
            <Pressable key={chat.id} accessibilityRole="button" onPress={() => select(chat.id)} style={{ padding: 18, borderRadius: 18, backgroundColor: colors.sky, gap: 6 }}>
              <Text style={s.heading}>{chat.title}</Text>
              <Text style={s.small}>{chat.memberIds.map((id) => roster.agents.find((agent) => agent.id === id)?.name || 'Former teammate').join(' · ')}</Text>
              {!!chat.chiefId && <Text style={s.small}>Coordinated by {roster.agents.find((agent) => agent.id === chat.chiefId)?.name || 'Chief of staff'}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {profile && (
        <TeammateProfile
          api={api}
          agent={profile === 'new' ? undefined : profile}
          close={() => setProfile(undefined)}
          saved={() => {
            setProfile(undefined);
            refresh();
          }}
        />
      )}
      {newGroup && roster && (
        <NewGroup
          api={api}
          roster={roster}
          close={() => setNewGroup(false)}
          created={(chat) => {
            setNewGroup(false);
            select(chat.id);
            refresh();
          }}
        />
      )}
    </View>
  );
}

function TeammateProfile({ api, agent, close, saved }: { api: GituApi; agent?: Teammate; close: () => void; saved: () => void }) {
  const [name, setName] = useState(agent?.name || '');
  const [tagline, setTagline] = useState(agent?.tagline || '');
  const [prompt, setPrompt] = useState(agent?.systemPrompt || '');
  const [provider, setProvider] = useState(agent?.provider || '');
  const [model, setModel] = useState(agent?.model || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Profile edits must preserve current permissions, skills, avatar and chief status.
      const current = agent ? (await api.teams()).agents.find((item) => item.id === agent.id) : undefined;
      if (agent && !current) throw new Error('This teammate was removed. Return to Teams and refresh.');
      await api.saveTeammate({ ...current, name: name.trim(), tagline: tagline.trim(), systemPrompt: prompt.trim(), provider, model });
      saved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this teammate.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={agent ? `${agent.name}’s profile` : 'Add a teammate'} onClose={() => !busy && close()}>
      <Field label="Teammate name" value={name} onChangeText={setName} editable={!busy} />
      <Field label="Role or tagline" value={tagline} onChangeText={setTagline} editable={!busy} />
      <Field label="Instructions" multiline value={prompt} onChangeText={setPrompt} editable={!busy} placeholder="What should this teammate help with?" />
      <Field label="Provider (optional)" value={provider} onChangeText={setProvider} editable={!busy} autoCapitalize="none" placeholder="Use the server default" />
      <Field label="Model (optional)" value={model} onChangeText={setModel} editable={!busy} autoCapitalize="none" placeholder="Use the provider default" />
      <Text style={[s.small, { marginBottom: 16 }]}>
        {agent
          ? `Skills: ${agent.skills.join(', ') || 'None selected'}. Computer: ${agent.useHostComputer ? 'My computer' : 'Private workspace'}. Configure tools and permissions in desktop Cowork.`
          : 'New teammates start with file reads and chat. Configure additional tools, skills and permissions in desktop Cowork.'}
      </Text>
      <ErrorNotice error={error} />
      <Button primary busy={busy} disabled={!name.trim() || !prompt.trim()} onPress={() => void save()}>
        Save teammate
      </Button>
    </Sheet>
  );
}

function NewGroup({ api, roster, close, created }: { api: GituApi; roster: TeamRoster; close: () => void; created: (chat: TeamConversation) => void }) {
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [chief, setChief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      created((await api.createTeamChat(members, title.trim() || undefined, chief || undefined)).conversation);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create this group.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Assemble a team" subtitle="Choose at least two teammates." onClose={() => !busy && close()}>
      <Field label="Group name (optional)" value={title} onChangeText={setTitle} editable={!busy} />
      {roster.agents.map((agent) => (
        <CheckRow
          key={agent.id}
          label={agent.name}
          checked={members.includes(agent.id)}
          onPress={() => {
            if (busy) return;
            setMembers((value) => (value.includes(agent.id) ? value.filter((id) => id !== agent.id) : [...value, agent.id]));
            if (chief === agent.id) setChief('');
          }}
        />
      ))}
      {!!members.length && (
        <View style={{ gap: 6, marginVertical: 16 }}>
          <Text style={s.label}>Chief of staff</Text>
          <CheckRow label="Everyone responds" checked={!chief} onPress={() => !busy && setChief('')} />
          {roster.agents
            .filter((agent) => members.includes(agent.id))
            .map((agent) => (
              <CheckRow key={agent.id} label={agent.name} checked={chief === agent.id} onPress={() => !busy && setChief(agent.id)} />
            ))}
        </View>
      )}
      <ErrorNotice error={error} />
      <Button primary busy={busy} disabled={members.length < 2} onPress={() => void create()}>
        Create group
      </Button>
    </Sheet>
  );
}

function TeamChat({ api, conversation, roster, back }: { api: GituApi; conversation: TeamConversation; roster: TeamRoster; back: () => void }) {
  const [thread, setThread] = useState('');
  const [topics, setTopics] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ id: string; text: string; thread: string } | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const load = useCallback((signal: AbortSignal) => api.teamChat(conversation.id, thread || undefined, signal), [api, conversation.id, thread]);
  const { value: snapshot, error: pollError, refresh } = usePolling(load);
  const view = snapshot?.threadId === (thread || null) ? snapshot : undefined;
  const perform = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not send this action.');
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    perform(async () => {
      const text = draft.trim();
      if (!text) return;
      if (pending.current?.text !== text || pending.current?.thread !== thread) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        pending.current = { id: `mobile-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`, text, thread };
      }
      await api.sendTeamMessage(conversation.id, pending.current.id, text, thread || undefined);
      pending.current = undefined;
      setDraft('');
      nearBottom.current = true;
    });
  const chooseThread = (id: string) => {
    setThread(id);
    setDraft('');
    setError('');
    setTopics(false);
    nearBottom.current = true;
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[s.row, { padding: 12, gap: 8, borderBottomWidth: 1, borderColor: colors.line }]}>
        <IconButton icon={ChevronLeft} label="Back to Teams" onPress={back} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={s.heading}>
            {conversation.title}
          </Text>
          <Text numberOfLines={1} style={s.small}>
            {conversation.memberIds.map((id) => roster.agents.find((agent) => agent.id === id)?.name || 'Former teammate').join(' · ')}
          </Text>
        </View>
        <Button small disabled={busy} onPress={() => setTopics(true)}>
          {view?.threads.find((topic) => topic.id === thread)?.title || 'Main'}
        </Button>
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 90;
        }}
        onContentSizeChange={() => {
          if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        contentContainerStyle={{ padding: 22, gap: 16 }}
      >
        <ErrorNotice error={error || pollError} />
        {!!pollError && (
          <Button small icon={RefreshCw} onPress={refresh}>
            Reconnect conversation
          </Button>
        )}
        {!view && !pollError && <ActivityIndicator color={colors.blueDark} />}
        {view?.deleted && <Text style={s.muted}>This conversation was removed in Cowork.</Text>}
        {view && !view.deleted && !view.messages.length && (
          <Card>
            <Text style={s.muted}>Send a message to your team. Use @Name to address a teammate.</Text>
          </Card>
        )}
        {view?.messages.map((message) => (
          <View
            key={message.id}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              width: '94%',
              padding: 16,
              borderRadius: 18,
              backgroundColor: message.role === 'user' ? colors.sky : message.role === 'system' ? colors.lavender : colors.card,
              gap: 6,
            }}
          >
            <Text style={s.label}>{message.role === 'user' ? 'You' : message.agentName || (message.role === 'system' ? 'Team activity' : 'Teammate')}</Text>
            <Text selectable style={s.text}>
              {message.text}
            </Text>
            {!!message.artifactIds?.length && (
              <Text style={s.small}>{message.artifactIds.map((id) => view.artifacts.find((file) => file.id === id)?.name || 'Saved file').join(' · ')}</Text>
            )}
            {message.status === 'failed' && <Text style={[s.small, { color: colors.danger }]}>Delivery failed. Open Cowork on your computer to retry this saved message.</Text>}
          </View>
        ))}
        {view?.requests
          .filter((request) => request.status === 'open')
          .map((request) => (
            <TeamRequestCard
              key={request.id}
              request={request}
              agentName={roster.agents.find((agent) => agent.id === request.agentId)?.name || 'Teammate'}
              api={api}
              busy={busy}
              perform={perform}
            />
          ))}
        {view?.busy && (
          <View style={[s.row, { gap: 10 }]}>
            <ActivityIndicator size="small" color={colors.blueDark} />
            <Text style={[s.muted, { flex: 1 }]}>
              {view.working || 'Your team is working…'}
              {view.queued ? ` · ${view.queued} queued` : ''}
            </Text>
          </View>
        )}
        {view?.progresses
          .filter((progress) => progress.text)
          .map((progress, index) => (
            <Card key={progress.agentId || index}>
              <Text style={s.label}>{progress.agentName}</Text>
              <Text selectable style={s.text}>
                {progress.text}
              </Text>
            </Card>
          ))}
        {!!view?.workHistory.length && (
          <Card>
            <Text style={s.label}>Recent activity</Text>
            {view.workHistory.slice(-5).map((work) => (
              <Text key={work.id} style={[s.small, { marginTop: 8 }]}>
                {work.agentName}: {work.publicUpdate || work.tool}
                {work.ok ? '' : ' · needs attention'}
              </Text>
            ))}
          </Card>
        )}
        {view?.missions.map((mission) => (
          <Card key={mission.id}>
            <Text style={s.heading}>{mission.goal}</Text>
            <Text style={s.small}>{mission.status}</Text>
          </Card>
        ))}
      </ScrollView>
      <View style={{ padding: 14, borderTopWidth: 1, borderColor: colors.line, gap: 10 }}>
        {view?.busy && (
          <Button small icon={Square} busy={busy} onPress={() => void perform(() => api.stopTeamChat(conversation.id))}>
            Stop team
          </Button>
        )}
        <View style={[s.row, { gap: 10, alignItems: 'flex-end' }]}>
          <TextInput
            accessibilityLabel="Message your team"
            multiline
            value={draft}
            onChangeText={setDraft}
            editable={!busy && !!view && !view.deleted}
            placeholder="Message your team…"
            placeholderTextColor={colors.muted}
            style={[s.input, { flex: 1, maxHeight: 140 }]}
          />
          <Button primary icon={ArrowUp} busy={busy} disabled={!draft.trim() || !view || view.deleted} onPress={() => void send()}>
            Send
          </Button>
        </View>
      </View>
      {topics && (
        <Sheet title="Conversation topics" onClose={() => !busy && setTopics(false)}>
          <Button disabled={busy} onPress={() => chooseThread('')}>
            Main conversation
          </Button>
          {view?.threads.map((topic) => (
            <Button key={topic.id} disabled={busy} onPress={() => chooseThread(topic.id)}>
              {topic.title}
            </Button>
          ))}
          <View style={{ marginTop: 20 }}>
            <Field label="New topic" value={topicTitle} onChangeText={setTopicTitle} editable={!busy} />
            <ErrorNotice error={error} />
            <Button
              primary
              icon={Plus}
              busy={busy}
              disabled={!topicTitle.trim()}
              onPress={() =>
                void perform(async () => {
                  const result = await api.createTeamThread(conversation.id, topicTitle.trim());
                  setTopicTitle('');
                  chooseThread(result.thread.id);
                })
              }
            >
              Create topic
            </Button>
          </View>
        </Sheet>
      )}
    </KeyboardAvoidingView>
  );
}

function TeamRequestCard({
  request,
  agentName,
  api,
  busy,
  perform,
}: {
  request: TeamRequest;
  agentName: string;
  api: GituApi;
  busy: boolean;
  perform: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  return (
    <Card style={{ backgroundColor: colors.orange }}>
      <Text style={s.label}>{agentName} needs you</Text>
      <Text style={[s.heading, { marginTop: 8 }]}>{request.title}</Text>
      <Text style={[s.muted, { marginVertical: 10 }]}>{request.detail}</Text>
      {request.kind === 'credential' ? (
        <Text style={s.muted}>Open this conversation in desktop Cowork to provide the connection securely, then return here.</Text>
      ) : request.kind === 'question' ? (
        <>
          {request.options.map((option, index) => (
            <Button key={`${index}:${option}`} small disabled={busy} onPress={() => setAnswer(option)}>
              {option}
            </Button>
          ))}
          <Field label="Your answer" multiline value={answer} onChangeText={setAnswer} editable={!busy} />
          <Button primary busy={busy} disabled={!answer.trim()} onPress={() => void perform(() => api.resolveTeamRequest(request.id, 'answer', answer.trim()))}>
            Send answer
          </Button>
        </>
      ) : (
        <View style={[s.row, { gap: 10, flexWrap: 'wrap' }]}>
          <Button primary busy={busy} onPress={() => void perform(() => api.resolveTeamRequest(request.id, request.kind === 'permission' ? 'approve' : 'accept'))}>
            {request.kind === 'permission' ? 'Approve' : 'Accept'}
          </Button>
          <Button danger disabled={busy} onPress={() => void perform(() => api.resolveTeamRequest(request.id, request.kind === 'permission' ? 'deny' : 'dismiss'))}>
            {request.kind === 'permission' ? 'Deny' : 'Dismiss'}
          </Button>
        </View>
      )}
    </Card>
  );
}
