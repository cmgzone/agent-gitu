import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useEffect, useMemo, useState } from 'react';
import {
  AppIcon,
  Bot,
  CheckCircle2,
  Circle,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  ListTodo,
  Lock,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from '../components/AppIcons';

export type InboxNotesVisibility = 'owner_only' | 'shared_readonly';
export type InboxNoteKind = 'note' | 'summary' | 'decision';
export type InboxTaskKind = 'action' | 'coding' | 'research';
export type InboxTaskStatus = 'pending_approval' | 'todo' | 'in_progress' | 'done';

export interface InboxRoomNoteRecord {
  id: string;
  roomId: string;
  kind: InboxNoteKind;
  title: string;
  content: string;
  createdByType: 'owner' | 'agent';
  createdById: string;
  createdByName: string;
  sharedToChat?: boolean;
  sharedMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxRoomTaskRecord {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  kind: InboxTaskKind;
  status: InboxTaskStatus;
  assignee?: string;
  projectPath?: string;
  requestedByType: 'owner' | 'member' | 'agent';
  requestedByName: string;
  codeRunId?: string;
  codeRunStatus?: string;
  delegationSummary?: string;
  subAgentRole?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxProjectSummary {
  name: string;
  path: string;
}

interface InboxWorkspaceDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  roomTitle: string;
  isOwner: boolean;
  messageCount: number;
  notesVisibility: InboxNotesVisibility;
  projectPath?: string | null;
  projects: InboxProjectSummary[];
  notes: InboxRoomNoteRecord[];
  tasks: InboxRoomTaskRecord[];
  loading: boolean;
  summarizing: boolean;
  delegatingTaskId: string | null;
  activeTab: 'notes' | 'tasks';
  onTabChange: (tab: 'notes' | 'tasks') => void;
  onChangeVisibility: (visibility: InboxNotesVisibility) => Promise<void>;
  onChangeProject: (projectPath: string) => Promise<void>;
  onSummarizeMeeting: () => Promise<void>;
  onAddNote: (input: { kind: InboxNoteKind; title: string; content: string }) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onShareNote: (noteId: string, opts: { text: string; includeTasks: boolean }) => Promise<void>;
  onAddTask: (input: {
    title: string;
    description?: string;
    kind: InboxTaskKind;
    assignee?: string;
  }) => Promise<void>;
  onUpdateTaskStatus: (taskId: string, status: InboxTaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDelegateTaskCode: (taskId: string) => Promise<void>;
  onDelegateTaskSubAgent: (taskId: string) => Promise<void>;
  onOpenCodeRun: (runId: string, projectPath?: string) => void;
}

function noteKindLabel(kind: InboxNoteKind): string {
  if (kind === 'summary') return 'Meeting Summary';
  if (kind === 'decision') return 'Decision';
  return 'Note';
}

function taskKindLabel(kind: InboxTaskKind): string {
  if (kind === 'coding') return 'Coding';
  if (kind === 'research') return 'Research';
  return 'Action';
}

function taskStatusDot(status: InboxTaskStatus): {
  variant: 'success' | 'warning' | 'accent' | 'neutral';
  label: string;
} {
  if (status === 'done') return { variant: 'success', label: 'Done' };
  if (status === 'in_progress') return { variant: 'accent', label: 'In progress' };
  if (status === 'pending_approval') return { variant: 'warning', label: 'Needs approval' };
  return { variant: 'neutral', label: 'To do' };
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function InboxWorkspaceDrawer({
  isOpen,
  onOpenChange,
  roomTitle,
  isOwner,
  messageCount,
  notesVisibility,
  projectPath,
  projects,
  notes,
  tasks,
  loading,
  summarizing,
  delegatingTaskId,
  activeTab,
  onTabChange,
  onChangeVisibility,
  onChangeProject,
  onSummarizeMeeting,
  onAddNote,
  onDeleteNote,
  onShareNote,
  onAddTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onDelegateTaskCode,
  onDelegateTaskSubAgent,
  onOpenCodeRun,
}: InboxWorkspaceDrawerProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteKind, setNoteKind] = useState<InboxNoteKind>('note');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskKind, setTaskKind] = useState<InboxTaskKind>('action');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const [shareTarget, setShareTarget] = useState<InboxRoomNoteRecord | null>(null);
  const [shareText, setShareText] = useState('');
  const [shareIncludeTasks, setShareIncludeTasks] = useState(true);
  const [sharing, setSharing] = useState(false);

  const pendingApprovals = useMemo(
    () => tasks.filter((t) => t.status === 'pending_approval'),
    [tasks],
  );
  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'pending_approval'),
    [tasks],
  );
  const regularTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'pending_approval'),
    [tasks],
  );

  useEffect(() => {
    if (!shareTarget) return;
    let body = `**${shareTarget.title}**\n\n${shareTarget.content}`;
    if (shareIncludeTasks && openTasks.length > 0) {
      const lines = openTasks
        .map((t) => `- [ ] ${t.title}${t.assignee ? ` (${t.assignee})` : ''}`)
        .join('\n');
      body += `\n\n**Next Steps**\n${lines}`;
    }
    setShareText(body);
  }, [shareTarget, shareIncludeTasks, openTasks]);

  const handleSaveNote = async () => {
    if (!noteContent.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await onAddNote({
        kind: noteKind,
        title: noteTitle.trim() || noteKindLabel(noteKind),
        content: noteContent.trim(),
      });
      setNoteTitle('');
      setNoteContent('');
      setComposerOpen(false);
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveTask = async () => {
    if (!taskTitle.trim() || savingTask) return;
    setSavingTask(true);
    try {
      await onAddTask({
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        kind: taskKind,
        assignee: taskAssignee.trim() || undefined,
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskAssignee('');
      setTaskFormOpen(false);
    } finally {
      setSavingTask(false);
    }
  };

  const handleConfirmShare = async () => {
    if (!shareTarget || !shareText.trim() || sharing) return;
    setSharing(true);
    try {
      await onShareNote(shareTarget.id, {
        text: shareText.trim(),
        includeTasks: false,
      });
      setShareTarget(null);
    } finally {
      setSharing(false);
    }
  };

  const projectOptions = useMemo(() => {
    const base = [{ value: '', label: 'Workspace default project' }];
    const seen = new Set<string>();
    for (const p of projects) {
      if (seen.has(p.path)) continue;
      seen.add(p.path);
      base.push({ value: p.path, label: p.name });
    }
    if (projectPath && !seen.has(projectPath)) {
      base.push({ value: projectPath, label: projectPath });
    }
    return base;
  }, [projects, projectPath]);

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        side="end"
        width={440}
        label="Room Notes and Tasks"
      >
        <Layout
          height="fill"
          header={
            <DrawerHeader
              hasDivider
              title={isOwner ? 'Notes & Tasks' : 'Meeting Notes'}
              subtitle={
                isOwner
                  ? notesVisibility === 'owner_only'
                    ? `${roomTitle} · Owner-private`
                    : `${roomTitle} · Shared read-only`
                  : `${roomTitle} · Shared by owner`
              }
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent padding={3}>
              <VStack gap={3} height="100%">
                {isOwner ? (
                  <Card padding={3}>
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center" gap={2}>
                        <HStack gap={2} vAlign="center">
                          <AppIcon
                            icon={notesVisibility === 'owner_only' ? Lock : Eye}
                            size="sm"
                            color={notesVisibility === 'owner_only' ? 'accent' : 'secondary'}
                          />
                          <Text size="sm" weight="semibold">
                            {notesVisibility === 'owner_only'
                              ? 'Owner-private by default'
                              : 'Shared read-only with room'}
                          </Text>
                        </HStack>
                      </HStack>

                      <Selector
                        label="Who can see notes & tasks"
                        value={notesVisibility}
                        options={[
                          {
                            value: 'owner_only',
                            label: 'Owner-private (guests only see what you share)',
                          },
                          {
                            value: 'shared_readonly',
                            label: 'Shared read-only (Code runs stay private)',
                          },
                        ]}
                        onChange={(val) =>
                          void onChangeVisibility(val as InboxNotesVisibility)
                        }
                      />

                      <Selector
                        label="Linked project for coding delegations"
                        value={projectPath || ''}
                        options={projectOptions}
                        onChange={(val) => void onChangeProject(String(val))}
                      />

                      <Button
                        label={
                          summarizing
                            ? 'Summarizing meeting…'
                            : 'Summarize Meeting & Save Tasks'
                        }
                        variant="primary"
                        size="sm"
                        width="100%"
                        icon={<AppIcon icon={Sparkles} size="sm" />}
                        isDisabled={summarizing || messageCount === 0}
                        onClick={() => void onSummarizeMeeting()}
                      />
                    </VStack>
                  </Card>
                ) : null}

                {isOwner && pendingApprovals.length > 0 ? (
                  <Card padding={3}>
                    <VStack gap={2}>
                      <HStack gap={2} vAlign="center">
                        <StatusDot variant="warning" label="Approval needed" />
                        <Text size="sm" weight="semibold">
                          Client Coding Proposals ({pendingApprovals.length})
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary">
                        Guests cannot run code directly. Approve to delegate privately to Code.
                      </Text>
                      {pendingApprovals.map((task) => {
                        const busy = delegatingTaskId === task.id;
                        return (
                          <Card key={task.id} padding={3}>
                            <VStack gap={2}>
                              <VStack gap={1}>
                                <Text size="sm" weight="semibold">
                                  {task.title}
                                </Text>
                                {task.description ? (
                                  <Text
                                    size="sm"
                                    color="secondary"
                                    className="gitu-inbox-note-body"
                                  >
                                    {task.description}
                                  </Text>
                                ) : null}
                                <Text type="supporting" color="secondary">
                                  Requested by {task.requestedByName}
                                </Text>
                              </VStack>
                              <HStack gap={2} wrap="wrap">
                                <Button
                                  label={busy ? 'Starting Code…' : 'Approve & Run in Code'}
                                  variant="primary"
                                  size="sm"
                                  icon={<AppIcon icon={Code2} size="xsm" />}
                                  isDisabled={busy}
                                  onClick={() => void onDelegateTaskCode(task.id)}
                                />
                                <Button
                                  label="Save as To-Do"
                                  variant="secondary"
                                  size="sm"
                                  isDisabled={busy}
                                  onClick={() => void onUpdateTaskStatus(task.id, 'todo')}
                                />
                                <Button
                                  label="Dismiss"
                                  variant="ghost"
                                  size="sm"
                                  isDisabled={busy}
                                  onClick={() => void onDeleteTask(task.id)}
                                />
                              </HStack>
                            </VStack>
                          </Card>
                        );
                      })}
                    </VStack>
                  </Card>
                ) : null}

                <HStack gap={2} width="100%">
                  <StackItem size="fill">
                    <Button
                      label={`Notes & Summaries (${notes.length})`}
                      variant={activeTab === 'notes' ? 'secondary' : 'ghost'}
                      size="sm"
                      width="100%"
                      icon={<AppIcon icon={FileText} size="xsm" />}
                      onClick={() => onTabChange('notes')}
                    />
                  </StackItem>
                  <StackItem size="fill">
                    <Button
                      label={`Tasks (${regularTasks.length})`}
                      variant={activeTab === 'tasks' ? 'secondary' : 'ghost'}
                      size="sm"
                      width="100%"
                      icon={<AppIcon icon={ListTodo} size="xsm" />}
                      onClick={() => onTabChange('tasks')}
                    />
                  </StackItem>
                </HStack>

                <Divider />

                {loading ? (
                  <Text size="sm" color="secondary">
                    Loading room workspace…
                  </Text>
                ) : activeTab === 'notes' ? (
                  <VStack gap={3}>
                    {isOwner ? (
                      composerOpen ? (
                        <Card padding={3}>
                          <VStack gap={2}>
                            <Selector
                              label="Entry type"
                              value={noteKind}
                              options={[
                                { value: 'note', label: 'Meeting Note' },
                                { value: 'decision', label: 'Key Decision' },
                                { value: 'summary', label: 'Meeting Summary' },
                              ]}
                              onChange={(val) => setNoteKind(val as InboxNoteKind)}
                            />
                            <TextInput
                              label="Title"
                              placeholder="e.g. Client requirements & timeline"
                              value={noteTitle}
                              onChange={setNoteTitle}
                            />
                            <TextArea
                              label="Notes"
                              placeholder="Capture decisions, requirements, or meeting notes…"
                              value={noteContent}
                              onChange={setNoteContent}
                              rows={4}
                              width="100%"
                            />
                            <HStack hAlign="end" gap={2}>
                              <Button
                                label="Cancel"
                                variant="ghost"
                                size="sm"
                                onClick={() => setComposerOpen(false)}
                              />
                              <Button
                                label={savingNote ? 'Saving…' : 'Save Note'}
                                variant="primary"
                                size="sm"
                                isDisabled={savingNote || !noteContent.trim()}
                                onClick={() => void handleSaveNote()}
                              />
                            </HStack>
                          </VStack>
                        </Card>
                      ) : (
                        <HStack hAlign="between" vAlign="center">
                          <Text type="supporting" color="secondary">
                            Tell an agent to take notes, or add one manually.
                          </Text>
                          <Button
                            label="Add Note"
                            variant="secondary"
                            size="sm"
                            icon={<AppIcon icon={Plus} size="xsm" />}
                            onClick={() => setComposerOpen(true)}
                          />
                        </HStack>
                      )
                    ) : null}

                    {notes.length === 0 ? (
                      <EmptyState
                        isCompact
                        title="No notes or summaries yet"
                        description={
                          isOwner
                            ? 'Ask an agent in chat to write a note, or click Summarize Meeting when your call wraps up.'
                            : 'No meeting notes have been recorded for this room yet.'
                        }
                      />
                    ) : (
                      notes.map((note) => (
                        <Card key={note.id} padding={3}>
                          <VStack gap={2}>
                            <HStack hAlign="between" vAlign="start" gap={2}>
                              <VStack gap={0}>
                                <Text size="sm" weight="semibold">
                                  {note.title}
                                </Text>
                                <Text type="supporting" color="secondary">
                                  {noteKindLabel(note.kind)} · {note.createdByName} ·{' '}
                                  {formatShortTime(note.updatedAt)}
                                </Text>
                              </VStack>
                              {note.sharedToChat ? (
                                <StatusDot variant="success" label="Shared" />
                              ) : null}
                            </HStack>

                            <Text size="sm" className="gitu-inbox-note-body">
                              {note.content}
                            </Text>

                            {isOwner ? (
                              <HStack hAlign="between" vAlign="center" gap={2}>
                                <Button
                                  label={
                                    note.sharedToChat
                                      ? 'Share Again to Chat'
                                      : 'Share Summary to Chat'
                                  }
                                  variant="secondary"
                                  size="sm"
                                  icon={<AppIcon icon={Send} size="xsm" />}
                                  onClick={() => {
                                    setShareIncludeTasks(note.kind === 'summary');
                                    setShareTarget(note);
                                  }}
                                />
                                <IconButton
                                  label="Delete note"
                                  tooltip="Delete note"
                                  variant="ghost"
                                  size="sm"
                                  icon={<AppIcon icon={Trash2} size="xsm" />}
                                  onClick={() => void onDeleteNote(note.id)}
                                />
                              </HStack>
                            ) : null}
                          </VStack>
                        </Card>
                      ))
                    )}
                  </VStack>
                ) : (
                  <VStack gap={3}>
                    {isOwner ? (
                      taskFormOpen ? (
                        <Card padding={3}>
                          <VStack gap={2}>
                            <TextInput
                              label="Task"
                              placeholder="e.g. Build client onboarding dashboard"
                              value={taskTitle}
                              onChange={setTaskTitle}
                            />
                            <TextArea
                              label="Details (optional)"
                              placeholder="Scope, requirements, or acceptance criteria…"
                              value={taskDescription}
                              onChange={setTaskDescription}
                              rows={3}
                              width="100%"
                            />
                            <HStack gap={2} width="100%">
                              <StackItem size="fill">
                                <Selector
                                  label="Kind"
                                  value={taskKind}
                                  options={[
                                    { value: 'action', label: 'Action Item' },
                                    { value: 'coding', label: 'Coding / Project' },
                                    { value: 'research', label: 'Research / Sub-Agent' },
                                  ]}
                                  onChange={(val) => setTaskKind(val as InboxTaskKind)}
                                />
                              </StackItem>
                              <StackItem size="fill">
                                <TextInput
                                  label="Assignee (optional)"
                                  placeholder="Owner / Client / Agent"
                                  value={taskAssignee}
                                  onChange={setTaskAssignee}
                                />
                              </StackItem>
                            </HStack>
                            <HStack hAlign="end" gap={2}>
                              <Button
                                label="Cancel"
                                variant="ghost"
                                size="sm"
                                onClick={() => setTaskFormOpen(false)}
                              />
                              <Button
                                label={savingTask ? 'Saving…' : 'Save Task'}
                                variant="primary"
                                size="sm"
                                isDisabled={savingTask || !taskTitle.trim()}
                                onClick={() => void handleSaveTask()}
                              />
                            </HStack>
                          </VStack>
                        </Card>
                      ) : (
                        <HStack hAlign="between" vAlign="center">
                          <Text type="supporting" color="secondary">
                            Save follow-ups or run coding tasks privately in Code.
                          </Text>
                          <Button
                            label="Add Task"
                            variant="secondary"
                            size="sm"
                            icon={<AppIcon icon={Plus} size="xsm" />}
                            onClick={() => setTaskFormOpen(true)}
                          />
                        </HStack>
                      )
                    ) : null}

                    {regularTasks.length === 0 ? (
                      <EmptyState
                        isCompact
                        title="No saved tasks yet"
                        description={
                          isOwner
                            ? 'Tasks extracted from Summarize Meeting or saved by agents will appear here.'
                            : 'No tasks have been shared in this room yet.'
                        }
                      />
                    ) : (
                      regularTasks.map((task) => {
                        const dot = taskStatusDot(task.status);
                        const busy = delegatingTaskId === task.id;
                        return (
                          <Card key={task.id} padding={3}>
                            <VStack gap={2}>
                              <HStack hAlign="between" vAlign="start" gap={2}>
                                <HStack gap={2} vAlign="start">
                                  {isOwner ? (
                                    <IconButton
                                      label={
                                        task.status === 'done'
                                          ? 'Mark task open'
                                          : 'Mark task done'
                                      }
                                      tooltip={
                                        task.status === 'done' ? 'Reopen task' : 'Mark done'
                                      }
                                      variant="ghost"
                                      size="sm"
                                      icon={
                                        <AppIcon
                                          icon={task.status === 'done' ? CheckCircle2 : Circle}
                                          size="sm"
                                          color={task.status === 'done' ? 'success' : 'secondary'}
                                        />
                                      }
                                      onClick={() =>
                                        void onUpdateTaskStatus(
                                          task.id,
                                          task.status === 'done' ? 'todo' : 'done',
                                        )
                                      }
                                    />
                                  ) : (
                                    <AppIcon
                                      icon={task.status === 'done' ? CheckCircle2 : Circle}
                                      size="sm"
                                      color={task.status === 'done' ? 'success' : 'secondary'}
                                    />
                                  )}
                                  <VStack gap={0}>
                                    <Text size="sm" weight="semibold">
                                      {task.title}
                                    </Text>
                                    <Text type="supporting" color="secondary">
                                      {taskKindLabel(task.kind)}
                                      {task.assignee ? ` · ${task.assignee}` : ''}
                                      {task.codeRunStatus ? ` · Code: ${task.codeRunStatus}` : ''}
                                    </Text>
                                  </VStack>
                                </HStack>
                                <StatusDot variant={dot.variant} label={dot.label} />
                              </HStack>

                              {task.description ? (
                                <Text
                                  size="sm"
                                  color="secondary"
                                  className="gitu-inbox-note-body"
                                >
                                  {task.description}
                                </Text>
                              ) : null}

                              {isOwner && task.delegationSummary ? (
                                <Card padding={2}>
                                  <VStack gap={1}>
                                    <Text type="supporting" color="accent" weight="semibold">
                                      {task.subAgentRole
                                        ? `Sub-agent (${task.subAgentRole}) output`
                                        : 'Delegation result'}
                                    </Text>
                                    <Text size="sm" className="gitu-inbox-note-body">
                                      {task.delegationSummary}
                                    </Text>
                                  </VStack>
                                </Card>
                              ) : null}

                              {isOwner ? (
                                <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                                  <HStack gap={2} wrap="wrap">
                                    {task.codeRunId ? (
                                      <Button
                                        label="Open in Code"
                                        variant="primary"
                                        size="sm"
                                        icon={<AppIcon icon={ExternalLink} size="xsm" />}
                                        onClick={() =>
                                          onOpenCodeRun(task.codeRunId!, task.projectPath)
                                        }
                                      />
                                    ) : (
                                      <Button
                                        label={busy ? 'Running…' : 'Run in Code'}
                                        variant={task.kind === 'coding' ? 'primary' : 'secondary'}
                                        size="sm"
                                        icon={<AppIcon icon={Code2} size="xsm" />}
                                        isDisabled={busy}
                                        onClick={() => void onDelegateTaskCode(task.id)}
                                      />
                                    )}
                                    <Button
                                      label={busy ? 'Working…' : 'Sub-Agent'}
                                      variant="ghost"
                                      size="sm"
                                      icon={<AppIcon icon={Bot} size="xsm" />}
                                      isDisabled={busy}
                                      onClick={() => void onDelegateTaskSubAgent(task.id)}
                                    />
                                  </HStack>
                                  <IconButton
                                    label="Delete task"
                                    tooltip="Delete task"
                                    variant="ghost"
                                    size="sm"
                                    icon={<AppIcon icon={Trash2} size="xsm" />}
                                    onClick={() => void onDeleteTask(task.id)}
                                  />
                                </HStack>
                              ) : null}
                            </VStack>
                          </Card>
                        );
                      })
                    )}
                  </VStack>
                )}
              </VStack>
            </LayoutContent>
          }
        />
      </Drawer>

      {/* Owner: Review & Share Summary / Note to Room Chat */}
      <Dialog
        isOpen={Boolean(shareTarget)}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        purpose="info"
        width={560}
        maxHeight="85dvh"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              hasDivider
              title="Share to Room Chat"
              onOpenChange={() => setShareTarget(null)}
            />
          }
          content={
            <VStack gap={3}>
              <Text size="sm" color="secondary">
                Review or edit what will be posted to "{roomTitle}". Private coding runs and
                internal paths are never included.
              </Text>
              {openTasks.length > 0 ? (
                <Switch
                  label={`Include open action items checklist (${openTasks.length})`}
                  value={shareIncludeTasks}
                  onChange={setShareIncludeTasks}
                />
              ) : null}
              <TextArea
                label="Message to post in chat"
                value={shareText}
                onChange={setShareText}
                rows={8}
                width="100%"
              />
              <HStack hAlign="end" gap={2}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onClick={() => setShareTarget(null)}
                />
                <Button
                  label={sharing ? 'Posting…' : 'Post to Room Chat'}
                  variant="primary"
                  icon={<AppIcon icon={Send} size="sm" />}
                  isDisabled={sharing || !shareText.trim()}
                  onClick={() => void handleConfirmShare()}
                />
              </HStack>
            </VStack>
          }
        />
      </Dialog>
    </>
  );
}
