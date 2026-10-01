import { ArrowDown, ArrowUp, Check, FileText, Info, Square, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, ErrorNotice, Field, IconButton, Mascot, s, Sheet } from '../ui';
import type { GituApi } from './client';
import { ProjectPicker } from './files';
import { useRun } from './hooks';
import { isRunning, needsInput, type Project, type Run, type RunEvent } from './types';

type ChatProps = { api: GituApi; runId?: string; project: string; projects: Project[]; selectProject: (path: string) => void; onStarted: (id: string) => void };
export function Chat({ api, runId, project, projects, selectProject, onStarted }: ChatProps) {
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'agent' | 'chat'>('agent');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [options, setOptions] = useState(false);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const { run, events, error: streamError } = useRun(api, runId, revision);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const [unread, setUnread] = useState(false);
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not send this action. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      if (runId) await api.message(runId, text);
      else {
        const next = await api.start(text, project, mode, provider, model);
        onStarted(next.runId);
      }
      setDraft('');
      nearBottom.current = true;
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not send your message.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false });
    else setUnread(true);
  }, [events.length]);
  const messages = events.filter((event) => /^(say |user-msg |steered\s|queued\s)/.test(event.text));
  const latest = events.filter((event) => !/^(say|user-msg|file|say-delta)\b/.test(event.text)).at(-1);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {run && (
        <View style={[s.between, { paddingHorizontal: 22, paddingVertical: 10, gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={s.heading}>
              {run.goal}
            </Text>
            <Text style={[s.small, { color: needsInput(run) ? colors.danger : colors.muted }]}>
              {needsInput(run) ? 'Needs your decision' : run.status.replaceAll('_', ' ')}
              {run.project ? ` · ${run.project}` : ''}
            </Text>
          </View>
          <IconButton icon={Info} label="Task details" onPress={() => setDetails(true)} />
        </View>
      )}
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 90;
          if (nearBottom.current) setUnread(false);
        }}
        onContentSizeChange={() => {
          if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        contentContainerStyle={{ flexGrow: 1, padding: 22, gap: 18, maxWidth: 850, width: '100%', alignSelf: 'center' }}
      >
        {!runId && (
          <View style={{ flex: 1, justifyContent: 'center', gap: 22, minHeight: 240 }}>
            <Mascot size={72} />
            <Text style={[s.title, { fontSize: 34, maxWidth: 500 }]}>What shall we work on?</Text>
            <Text style={s.muted}>Give Gitu a goal. Follow its work and review decisions as they come up.</Text>
            <View style={{ gap: 10 }}>
              {['Review this project and suggest improvements', 'Find and fix a bug, then verify the change'].map((text) => (
                <Pressable accessibilityRole="button" key={text} onPress={() => setDraft(text)} style={{ padding: 16, borderRadius: 18, backgroundColor: colors.sky }}>
                  <Text style={s.text}>{text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {!!runId && !run && !streamError && <ActivityIndicator color={colors.blueDark} />}
        {messages.map((event) => (
          <Message key={event.i} event={event} />
        ))}
        {run && <Gates key={`${run.runId}:${run.pendingQuestions?.id || ''}:${run.pendingPlanReview?.id || ''}`} run={run} busy={busy} perform={action} api={api} />}
        {run?.pendingConnection && (
          <Card>
            <Text style={s.heading}>Connection setup required</Text>
            <Text style={[s.muted, { marginTop: 8 }]}>Open this task in Gitu’s desktop interface to configure the requested connection, then return here.</Text>
          </Card>
        )}
        {run && isRunning(run) && !needsInput(run) && (
          <View style={[s.row, { gap: 10 }]}>
            <ActivityIndicator size="small" color={colors.blueDark} />
            <Text numberOfLines={3} style={[s.small, { flex: 1 }]}>
              {latest?.text || 'Gitu is working…'}
            </Text>
          </View>
        )}
        {run?.report && (
          <Card style={{ backgroundColor: colors.green }}>
            <Text style={s.heading}>Saved result</Text>
            <Text selectable style={[s.text, { marginTop: 8 }]}>
              {run.report.summary}
            </Text>
            {run.report.verification.map((item, index) => (
              <Text key={index} selectable style={[s.small, { marginTop: 8 }]}>
                {item}
              </Text>
            ))}
          </Card>
        )}
        {!!run?.files.length && (
          <Card>
            <Text style={s.heading}>Task files</Text>
            {run.files.map((file) => (
              <View key={file.id} style={[s.row, { gap: 8, marginTop: 12 }]}>
                <FileText size={18} color={colors.blueDark} />
                <Text style={s.text}>{file.name}</Text>
                <Text style={s.small}>{Math.ceil(file.size / 1024)} KB</Text>
              </View>
            ))}
          </Card>
        )}
        {!!run?.error && <ErrorNotice error={run.error} />}
        <ErrorNotice error={streamError || error} />
      </ScrollView>
      {unread && (
        <View style={{ alignItems: 'center', padding: 6 }}>
          <Button
            small
            icon={ArrowDown}
            onPress={() => {
              nearBottom.current = true;
              setUnread(false);
              scroll.current?.scrollToEnd({ animated: true });
            }}
          >
            New activity
          </Button>
        </View>
      )}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 10, borderTopWidth: 1, borderColor: colors.line }}>
        {!runId && (
          <View style={[s.between, { gap: 10 }]}>
            <ProjectPicker projects={projects} project={project} select={selectProject} />
            <Button small onPress={() => setOptions(true)}>
              {mode === 'agent' ? 'Agent' : 'Chat'}
              {model ? ` · ${model}` : ''}
            </Button>
          </View>
        )}
        <View style={[s.row, { alignItems: 'flex-end', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 26, padding: 10 }]}>
          <TextInput
            accessibilityLabel="Message Gitu"
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder={runId ? 'Reply or give Gitu direction…' : 'Describe your goal…'}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, minHeight: 42, maxHeight: 150, padding: 10, fontSize: 16, color: colors.text, textAlignVertical: 'top' }}
          />
          {run && isRunning(run) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop task"
              disabled={busy}
              onPress={() => void action(() => api.stop(runId!))}
              style={{ padding: 12, borderRadius: 22, backgroundColor: colors.orange, opacity: busy ? 0.5 : 1 }}
            >
              <Square size={19} color={colors.text} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={busy || !draft.trim() || (!runId && !project)}
            onPress={() => void send()}
            style={{ padding: 12, borderRadius: 22, backgroundColor: colors.blue, opacity: busy || !draft.trim() ? 0.5 : 1 }}
          >
            {busy ? <ActivityIndicator size="small" color={colors.text} /> : <ArrowUp size={19} color={colors.text} />}
          </Pressable>
        </View>
      </View>
      {options && (
        <Sheet title="New task options" onClose={() => setOptions(false)}>
          <View style={[s.row, { gap: 12, marginBottom: 20 }]}>
            <Button primary={mode === 'agent'} onPress={() => setMode('agent')}>
              Agent
            </Button>
            <Button primary={mode === 'chat'} onPress={() => setMode('chat')}>
              Chat
            </Button>
          </View>
          <Text style={[s.muted, { marginBottom: 20 }]}>Agent works in your project and asks you to review its plan. Chat is for conversation.</Text>
          <Field label="Provider (optional)" value={provider} onChangeText={setProvider} autoCapitalize="none" placeholder="Use server default" />
          <Field label="Model (optional)" value={model} onChangeText={setModel} autoCapitalize="none" placeholder="Use server default" />
          <Button primary onPress={() => setOptions(false)}>
            Done
          </Button>
        </Sheet>
      )}
      {details && run && (
        <Sheet title="Task details" subtitle={run.goal} onClose={() => setDetails(false)}>
          <Text selectable style={s.muted}>
            {run.worktreePath || run.projectPath || 'Gitu workspace'}
          </Text>
          <Text style={[s.small, { marginVertical: 12 }]}>
            {[run.status, run.branch, run.provider, run.model, run.usage?.costUsd !== undefined ? `$${run.usage.costUsd.toFixed(4)}` : ''].filter(Boolean).join(' · ')}
          </Text>
          <Text style={s.heading}>Activity log</Text>
          {events
            .filter((event) => !/^(say-delta|file)\b/.test(event.text))
            .map((event) => (
              <View key={event.i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>
                <Text style={s.small}>{new Date(event.t).toLocaleTimeString()}</Text>
                <Text selectable style={[s.text, { fontSize: 13 }]}>
                  {event.text}
                </Text>
              </View>
            ))}
        </Sheet>
      )}
    </KeyboardAvoidingView>
  );
}

function Message({ event }: { event: RunEvent }) {
  const user = !event.text.startsWith('say ');
  const text = event.text.replace(/^(say |user-msg |steered\s+|queued\s+)/, '');
  return (
    <View style={{ alignSelf: user ? 'flex-end' : 'stretch', maxWidth: '94%', gap: 8 }}>
      {!user && (
        <View style={[s.row, { gap: 8 }]}>
          <Mascot size={24} />
          <Text style={s.small}>Gitu</Text>
        </View>
      )}
      <View style={{ borderRadius: 22, backgroundColor: user ? colors.blue : colors.card, padding: 18 }}>
        <Text selectable style={s.text}>
          {text}
        </Text>
      </View>
    </View>
  );
}

function Gates({ api, run, busy, perform }: { api: GituApi; run: Run; busy: boolean; perform: (work: () => Promise<unknown>) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const review = run.pendingPlanReview;
  const questions = run.pendingQuestions;
  return (
    <>
      {run.pendingApprovals.map((approval) => (
        <Card key={approval.id} style={{ backgroundColor: colors.orange }}>
          <Text style={s.label}>Your approval</Text>
          <Text style={[s.heading, { marginVertical: 10 }]}>{approval.tool}</Text>
          <Text selectable style={s.text}>
            {approval.summary}
          </Text>
          <Text style={[s.muted, { marginTop: 8 }]}>{approval.why}</Text>
          <View style={[s.row, { gap: 12, marginTop: 18 }]}>
            <Button icon={Check} primary disabled={busy} onPress={() => void perform(() => api.approve(approval.id, true))}>
              Approve
            </Button>
            <Button icon={X} disabled={busy} onPress={() => void perform(() => api.approve(approval.id, false))}>
              Deny
            </Button>
          </View>
        </Card>
      ))}
      {review && (
        <Card style={{ backgroundColor: colors.lavender }}>
          <Text style={s.label}>Review the plan</Text>
          {review.criteria.map((criterion, index) => (
            <Text key={index} style={[s.text, { marginTop: 10 }]}>
              {criterion}
            </Text>
          ))}
          {review.steps.map((step, index) => (
            <View key={index} style={{ marginTop: 16 }}>
              <Text style={s.heading}>
                {index + 1}. {step.description}
              </Text>
              <Text style={s.small}>{step.verification}</Text>
            </View>
          ))}
          <Field label="Feedback (optional)" value={note} onChangeText={setNote} multiline placeholder="Any changes to the plan?" />
          <View style={[s.row, { gap: 10 }]}>
            <Button primary disabled={busy} onPress={() => void perform(() => api.review(review.id, true, note))}>
              Approve plan
            </Button>
            <Button disabled={busy} onPress={() => void perform(() => api.review(review.id, false, note))}>
              Request changes
            </Button>
          </View>
        </Card>
      )}
      {questions && (
        <Card style={{ backgroundColor: colors.sky }}>
          <Text style={s.label}>Gitu needs your input</Text>
          {questions.questions.map((question, index) => (
            <View key={index} style={{ marginTop: 16, gap: 10 }}>
              <Text style={s.heading}>{question.question}</Text>
              <View style={{ gap: 8 }}>
                {question.options.map((option) => (
                  <Button key={option} small primary={answers[index] === option} disabled={busy} onPress={() => setAnswers((value) => ({ ...value, [index]: option }))}>
                    {option}
                  </Button>
                ))}
              </View>
              <Field label="Your answer" value={answers[index] || ''} onChangeText={(value) => setAnswers((previous) => ({ ...previous, [index]: value }))} multiline />
            </View>
          ))}
          <Button
            primary
            disabled={busy || questions.questions.some((_, index) => !answers[index]?.trim())}
            onPress={() => void perform(() => api.answer(questions.id, questions.questions.map((question, index) => `${question.question}: ${answers[index]}`).join('\n')))}
          >
            Send answer
          </Button>
        </Card>
      )}
    </>
  );
}
