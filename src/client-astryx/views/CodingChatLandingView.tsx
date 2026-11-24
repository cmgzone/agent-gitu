import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

import {HStack, Layout, LayoutContent, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatDictationButton,
  ChatSendButton,
  useChatDictation,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
} from '@astryxdesign/core/Chat';
import {
  createStaticSource,
  TypeaheadItem,
  type SearchableItem,
} from '@astryxdesign/core/Typeahead';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Token} from '@astryxdesign/core/Token';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {
  DropdownMenu,
  DropdownMenuItem,
  type DropdownMenuOption,
} from '@astryxdesign/core/DropdownMenu';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {
  AtSymbolIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  FolderIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type {CoworkAgent} from '../bridge';

export type CodingRunMode = 'agent' | 'chat' | 'fast' | 'standard';

export interface StartCodingTaskOptions {
  goal: string;
  mode?: CodingRunMode;
  effort?: string;
  review?: boolean;
  files?: Array<{name: string; type: string; dataUrl: string}>;
}

export interface CodingChatLandingViewProps {
  isCompact?: boolean;
  ownerName?: string;
  ownerEmail?: string;
  agents: CoworkAgent[];
  selectedProject: string;
  projectOptions: Array<{value: string; label: string}>;
  selectedModel: string;
  modelOptions: Array<{value: string; label: string}>;
  selectedEffort: string;
  starting: boolean;
  errorMsg: string;
  onSelectProject: (projectPath: string) => void;
  onSelectModel: (value: string) => void;
  onSelectEffort: (value: string) => void;
  onOpenFolderBrowser: () => void;
  onNewProject: () => void;
  onOpenSettings: (section?: string) => void;
  onOpenSearch: () => void;
  onStartTask: (opts: StartCodingTaskOptions) => Promise<boolean>;
}

interface MentionAux {
  description: string;
  insertValue: string;
}

const pageStyle: CSSProperties = {minHeight: '100%'};
const composerInputStyle: CSSProperties = {
  minHeight: 'calc(var(--spacing-10) * 2)',
};
const categoriesStyle: CSSProperties = {paddingInline: 'var(--spacing-2)'};
const categoryGroupStyle: CSSProperties = {
  flexWrap: 'wrap',
  maxWidth: '100%',
};

const CATEGORY_SUGGESTIONS: Record<
  string,
  Array<{heading: string; body: string; prompt: string}>
> = {
  build: [
    {
      heading: 'Implement a feature',
      body: 'Plan, edit, and verify a new capability end-to-end',
      prompt: 'Implement a new feature in this project: ',
    },
    {
      heading: 'Build an API endpoint',
      body: 'Add route handlers, validation, and integration tests',
      prompt: 'Build and test a new endpoint or handler for ',
    },
    {
      heading: 'Refactor a module',
      body: 'Clean up structure and eliminate duplication safely',
      prompt: 'Refactor and simplify ',
    },
    {
      heading: 'Write automated tests',
      body: 'Add unit or integration tests covering edge cases',
      prompt: 'Write comprehensive tests for ',
    },
  ],
  debug: [
    {
      heading: 'Diagnose failing tests',
      body: 'Trace root cause from logs or test output and fix it',
      prompt: 'Investigate and fix the failing tests in ',
    },
    {
      heading: 'Fix a runtime bug',
      body: 'Reproduce the error, patch cleanly, and verify',
      prompt: 'Find and fix the root cause of this bug: ',
    },
    {
      heading: 'Trace a build error',
      body: 'Resolve TypeScript, bundler, or dependency failures',
      prompt: 'Diagnose and resolve this build or type error: ',
    },
    {
      heading: 'Check performance bottleneck',
      body: 'Profile slow paths and reduce latency or memory use',
      prompt: 'Analyze and optimize performance in ',
    },
  ],
  review: [
    {
      heading: 'Audit recent changes',
      body: 'Check diffs for bugs, edge cases, and regressions',
      prompt: 'Review the latest changes in this repository for bugs and regressions.',
    },
    {
      heading: 'Security review',
      body: 'Inspect auth, input validation, and secret handling',
      prompt: 'Run a security review focusing on ',
    },
    {
      heading: 'Explain architecture',
      body: 'Map key files, data flow, and entry points clearly',
      prompt: 'Explain how the codebase handles ',
    },
    {
      heading: 'Verify readiness',
      body: 'Run lint, typecheck, tests, and build verification',
      prompt: 'Verify typecheck, tests, and build health across the repository.',
    },
  ],
  plan: [
    {
      heading: 'Design implementation plan',
      body: 'Break down requirements into ordered, verifiable steps',
      prompt: 'Create a step-by-step technical plan for ',
    },
    {
      heading: 'Compare approaches',
      body: 'Weigh trade-offs before editing production code',
      prompt: 'Compare implementation options in this codebase for ',
    },
    {
      heading: 'Prepare migration',
      body: 'Outline schema, API, and rollout steps safely',
      prompt: 'Plan a zero-downtime migration for ',
    },
    {
      heading: 'Scope next milestone',
      body: 'Audit open gaps and organize actionable work items',
      prompt: 'Audit the repository and outline the next milestone tasks for ',
    },
  ],
};

const CATEGORIES = [
  {key: 'build', label: 'Build', icon: CodeBracketIcon},
  {key: 'debug', label: 'Debug', icon: WrenchScrewdriverIcon},
  {key: 'review', label: 'Review', icon: MagnifyingGlassIcon},
  {key: 'plan', label: 'Plan', icon: LightBulbIcon},
] as const;

const MODE_OPTIONS = [
  {key: 'agent', label: 'Agent', icon: SparklesIcon},
  {key: 'chat', label: 'Chat', icon: ChatBubbleLeftRightIcon},
  {key: 'fast', label: 'Fast', icon: BoltIcon},
  {key: 'standard', label: 'Standard', icon: CpuChipIcon},
  {key: 'deep', label: 'Deep Effort', icon: ClockIcon},
  {key: 'review', label: 'Require Review', icon: ShieldCheckIcon},
] as const;

const TOKEN_MODES: Record<string, string> = {
  deep: '/deep',
  review: '/review',
};

const EFFORT_OPTIONS = [
  {value: 'low', label: 'Low effort'},
  {value: 'medium', label: 'Medium effort'},
  {value: 'high', label: 'High effort'},
  {value: 'max', label: 'Max effort'},
] as const;

const COMMAND_ITEMS: SearchableItem<{description: string}>[] = [
  {
    id: 'plan',
    label: 'plan',
    auxiliaryData: {description: 'Outline a step-by-step plan first'},
  },
  {
    id: 'fix',
    label: 'fix',
    auxiliaryData: {description: 'Diagnose and fix an issue'},
  },
  {
    id: 'review',
    label: 'review',
    auxiliaryData: {description: 'Require plan/code review gates'},
  },
  {
    id: 'test',
    label: 'test',
    auxiliaryData: {description: 'Write or run automated tests'},
  },
  {
    id: 'refactor',
    label: 'refactor',
    auxiliaryData: {description: 'Clean up code without changing behavior'},
  },
  {
    id: 'explain',
    label: 'explain',
    auxiliaryData: {description: 'Explain modules, symbols, or data flow'},
  },
];

const commandTrigger: ChatComposerTrigger = {
  character: '/',
  searchSource: createStaticSource(COMMAND_ITEMS),
  renderItem: item => (
    <TypeaheadItem
      item={item}
      description={(item.auxiliaryData as {description: string})?.description}
    />
  ),
  onSelect: item => ({
    value: `/${item.label}`,
    label: `/${item.label}`,
    variant: 'yellow',
  }),
};

function shortPath(raw: string | undefined): string {
  if (!raw) return 'No folder selected';
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function truncateLabel(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readFileAsDataUrl(
  file: File,
): Promise<{name: string; type: string; dataUrl: string}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error(`Could not read attachment: ${file.name}`));
        return;
      }
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl,
      });
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read attachment: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

function formatGreeting(ownerName?: string, ownerEmail?: string): string {
  const cleanName = ownerName?.trim();
  if (cleanName) return `Hi, ${cleanName}`;
  const cleanEmail = ownerEmail?.trim();
  if (cleanEmail) {
    const localPart = cleanEmail.includes('@')
      ? cleanEmail.split('@')[0]?.trim()
      : cleanEmail;
    if (localPart) return `Hi, ${localPart}`;
  }
  return 'Agent Gitu Code';
}

export function CodingChatLandingView({
  isCompact = false,
  ownerName,
  ownerEmail,
  agents,
  selectedProject,
  projectOptions,
  selectedModel,
  modelOptions,
  selectedEffort,
  starting,
  errorMsg,
  onSelectProject,
  onSelectModel,
  onSelectEffort,
  onOpenFolderBrowser,
  onNewProject,
  onOpenSettings,
  onOpenSearch,
  onStartTask,
}: CodingChatLandingViewProps) {
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<CodingRunMode>('agent');
  const [category, setCategory] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [localError, setLocalError] = useState('');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);

  const composerInputRef = useRef<ChatComposerInputHandle>(null);
  const shouldFocusComposerRef = useRef(false);
  const submittingRef = useRef(false);
  const dictation = useChatDictation({inputRef: composerInputRef});

  const activeMode =
    MODE_OPTIONS.find(opt => opt.key === mode) ?? MODE_OPTIONS[0];
  const suggestions = category ? CATEGORY_SUGGESTIONS[category] ?? null : null;
  const projectLabel = selectedProject
    ? shortPath(selectedProject)
    : 'No folder selected';

  const activeModelLabel = useMemo(() => {
    const matched = modelOptions.find(opt => opt.value === selectedModel);
    if (matched) {
      const parts = matched.label.split(' · ');
      return parts.length > 1 ? parts.slice(1).join(' · ') : matched.label;
    }
    if (selectedModel) {
      const parts = selectedModel.split('::');
      return parts.length > 1 ? parts.slice(1).join('::') : selectedModel;
    }
    return 'Select model';
  }, [modelOptions, selectedModel]);

  const mentionItems = useMemo<SearchableItem<MentionAux>[]>(() => {
    const items: SearchableItem<MentionAux>[] = [];
    const seen = new Set<string>();

    projectOptions.forEach((proj, index) => {
      const key = `project:${proj.label.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: `proj-${index}`,
        label: proj.label,
        auxiliaryData: {
          description: 'Project folder',
          insertValue: `@${proj.label}`,
        },
      });
    });

    for (const agent of agents) {
      const key = `agent:${agent.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `agent-${agent.id}`,
        label: agent.name,
        auxiliaryData: {
          description: agent.tagline?.trim() || 'Cowork agent',
          insertValue: `@${agent.name}`,
        },
      });
    }

    const fallbacks: Array<{id: string; label: string; description: string}> = [
      {id: 'workspace', label: 'workspace', description: 'Active repository'},
      {id: 'git', label: 'git', description: 'Git diff & commits'},
      {id: 'tests', label: 'tests', description: 'Test suite & verification'},
    ];
    for (const fb of fallbacks) {
      const key = `fb:${fb.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: fb.id,
        label: fb.label,
        auxiliaryData: {
          description: fb.description,
          insertValue: `@${fb.label}`,
        },
      });
    }

    return items;
  }, [agents, projectOptions]);

  const composerTriggers = useMemo<ChatComposerTrigger[]>(
    () => [
      {
        character: '@',
        searchSource: createStaticSource(mentionItems),
        hasMultiWordQuery: true,
        renderItem: item => (
          <TypeaheadItem
            item={item}
            description={(item.auxiliaryData as MentionAux | undefined)?.description}
          />
        ),
        onSelect: item => {
          const aux = item.auxiliaryData as MentionAux | undefined;
          return {
            value: aux?.insertValue || `@${item.label}`,
            label: item.label,
            variant: 'blue',
          };
        },
      },
      commandTrigger,
    ],
    [mentionItems],
  );

  const appendFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setLocalError('');
    setAttachments(prev => {
      const seen = new Set(prev.map(fileKey));
      const next = [...prev];
      for (const file of files) {
        const k = fileKey(file);
        if (!seen.has(k)) {
          seen.add(k);
          next.push(file);
        }
      }
      return next;
    });
  }, []);

  const applySuggestion = useCallback((prompt: string) => {
    const input = composerInputRef.current;
    if (!input) {
      setDraft(prompt);
      return;
    }
    input.focus();
    if (document.activeElement) {
      window.getSelection()?.selectAllChildren(document.activeElement);
    }
    input.insertText(prompt);
  }, []);

  const insertMention = useCallback((item: SearchableItem<MentionAux>) => {
    const input = composerInputRef.current;
    if (!input) return;
    input.focus();
    if (document.activeElement) {
      const sel = window.getSelection();
      sel?.selectAllChildren(document.activeElement);
      sel?.collapseToEnd();
    }
    input.insertToken({
      value: item.auxiliaryData?.insertValue || `@${item.label}`,
      label: item.label,
      variant: 'blue',
    });
  }, []);

  const insertModeToken = useCallback((label: string) => {
    composerInputRef.current?.focus();
    composerInputRef.current?.insertToken({
      value: label,
      label,
      variant: 'orange',
    });
  }, []);

  const submitDraft = useCallback(
    async (rawValue: string) => {
      if (starting || submittingRef.current) return;
      const hasDeepToken = /(^|\s)\/deep(?=\s|$)/i.test(rawValue);
      const hasReviewToken = /(^|\s)\/review(?=\s|$)/i.test(rawValue);
      const cleanedGoal = rawValue
        .replace(/(^|\s)\/deep(?=\s|$)/gi, ' ')
        .replace(/(^|\s)\/review(?=\s|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanedGoal && attachments.length === 0) return;

      submittingRef.current = true;
      setLocalError('');
      try {
        const encodedFiles =
          attachments.length > 0
            ? await Promise.all(attachments.map(readFileAsDataUrl))
            : undefined;
        const started = await onStartTask({
          goal: cleanedGoal,
          mode,
          effort: hasDeepToken ? 'max' : selectedEffort,
          review: hasReviewToken ? true : undefined,
          files: encodedFiles,
        });
        if (started) {
          setDraft('');
          setAttachments([]);
        } else {
          setDraft(rawValue);
        }
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : 'Failed to prepare attachments.',
        );
        setDraft(rawValue);
      } finally {
        submittingRef.current = false;
      }
    },
    [attachments, mode, onStartTask, selectedEffort, starting],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !draft.trim() &&
        attachments.length > 0
      ) {
        event.preventDefault();
        void submitDraft(draft);
      }
    },
    [attachments.length, draft, submitDraft],
  );

  const projectMenuItems = useMemo<DropdownMenuOption[]>(() => {
    const entries: DropdownMenuOption[] = projectOptions.map(proj => ({
      id: proj.value,
      label: proj.label,
      icon: FolderIcon,
      endContent:
        proj.value === selectedProject ? (
          <Icon icon={CheckIcon} size="sm" />
        ) : undefined,
      onClick: () => onSelectProject(proj.value),
    }));
    if (entries.length > 0) {
      entries.push({type: 'divider'});
    }
    entries.push(
      {id: 'open-folder', label: 'Open folder…', onClick: onOpenFolderBrowser},
      {id: 'new-project', label: 'New project…', onClick: onNewProject},
    );
    return entries;
  }, [onNewProject, onOpenFolderBrowser, onSelectProject, projectOptions, selectedProject]);

  const modelMenuItems = useMemo<DropdownMenuOption[]>(() => {
    const entries: DropdownMenuOption[] = modelOptions.map(opt => ({
      id: opt.value,
      label: opt.label,
      icon: CpuChipIcon,
      endContent:
        opt.value === selectedModel ? (
          <Icon icon={CheckIcon} size="sm" />
        ) : undefined,
      onClick: () => onSelectModel(opt.value),
    }));
    if (entries.length > 0) {
      entries.push({type: 'divider'});
    }
    entries.push({
      id: 'configure-providers',
      label: 'Configure providers…',
      onClick: () => onOpenSettings('providers'),
    });
    return entries;
  }, [modelOptions, onOpenSettings, onSelectModel, selectedModel]);

  const settingsMenuItems = useMemo<DropdownMenuOption[]>(
    () => [
      {
        type: 'section',
        id: 'effort-section',
        title: 'Reasoning effort',
        items: EFFORT_OPTIONS.map(opt => ({
          id: `effort-${opt.value}`,
          label: opt.label,
          endContent:
            selectedEffort === opt.value ? (
              <Icon icon={CheckIcon} size="sm" />
            ) : undefined,
          onClick: () => onSelectEffort(opt.value),
        })),
      },
      {type: 'divider'},
      {
        id: 'prefs',
        label: 'Preferences',
        onClick: () => onOpenSettings('overview'),
      },
      {
        id: 'connections',
        label: 'Connections',
        onClick: () => onOpenSettings('connections'),
      },
      {
        id: 'search-workspace',
        label: 'Search workspace',
        onClick: onOpenSearch,
      },
    ],
    [onOpenSearch, onOpenSettings, onSelectEffort, selectedEffort],
  );

  const visibleError = localError || errorMsg;
  const greeting = formatGreeting(ownerName, ownerEmail);

  return (
    <Layout
      height="fill"
      contentWidth={720}
      padding={isCompact ? 3 : 6}
      content={
        <LayoutContent>
          <VStack gap={isCompact ? 5 : 8} vAlign="center" style={pageStyle}>
            {/* Greeting */}
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Icon icon={SparklesIcon} size="md" color="accent" />
                <Text type="large" as="h2">
                  {greeting}
                </Text>
              </HStack>
              <Text type={isCompact ? 'heading-1' : 'display-2'} as="h1">
                Where should we start?
              </Text>
            </VStack>

            {/* Composer */}
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={value => void submitDraft(value)}
              isDisabled={starting}
              density={isCompact ? 'compact' : 'balanced'}
              placeholder="Ask anything or describe a coding task"
              status={
                visibleError
                  ? {type: 'error', message: visibleError}
                  : undefined
              }
              input={
                <ChatComposerInput
                  handleRef={composerInputRef}
                  triggers={composerTriggers}
                  style={composerInputStyle}
                  onFiles={appendFiles}
                  onKeyDown={handleInputKeyDown}
                />
              }
              drawer={
                attachments.length > 0 ? (
                  <ChatComposerDrawer
                    count={attachments.length}
                    label="Attachments">
                    {attachments.map(file => (
                      <Token
                        key={fileKey(file)}
                        label={file.name}
                        onRemove={() =>
                          setAttachments(prev =>
                            prev.filter(item => fileKey(item) !== fileKey(file)),
                          )
                        }
                      />
                    ))}
                  </ChatComposerDrawer>
                ) : undefined
              }
              headerActions={
                <DropdownMenu
                  button={{
                    label: 'Reference',
                    variant: 'ghost',
                    size: 'sm',
                    icon: <Icon icon={AtSymbolIcon} size="sm" />,
                    isIconOnly: true,
                  }}
                  hasChevron={false}
                  menuWidth={260}
                  menuMaxHeight={300}>
                  {mentionItems.map(item => (
                    <DropdownMenuItem
                      key={item.id}
                      label={item.label}
                      description={item.auxiliaryData?.description}
                      onClick={() => insertMention(item)}
                    />
                  ))}
                </DropdownMenu>
              }
              headerContext={
                <HStack gap={1.5} vAlign="center">
                  <StatusDot
                    variant={selectedProject ? 'success' : 'warning'}
                    label={projectLabel}
                  />
                  <DropdownMenu
                    button={{
                      label: projectLabel,
                      variant: 'ghost',
                      size: 'sm',
                      icon: <Icon icon={FolderIcon} size="sm" />,
                      children: truncateLabel(projectLabel, isCompact ? 12 : 20),
                    }}
                    alignment="end"
                    menuWidth={240}
                    menuMaxHeight={320}
                    items={projectMenuItems}
                  />
                </HStack>
              }
              footerActions={
                <>
                  <DropdownMenu
                    button={{
                      label: activeMode.label,
                      variant: 'ghost',
                      size: isCompact ? 'sm' : 'md',
                      icon: <Icon icon={activeMode.icon} size="sm" />,
                      children: activeMode.label,
                    }}
                    menuWidth={210}
                    isMenuOpen={isModeMenuOpen}
                    onOpenChange={isOpen => {
                      setIsModeMenuOpen(isOpen);
                      if (!isOpen && shouldFocusComposerRef.current) {
                        shouldFocusComposerRef.current = false;
                        setTimeout(
                          () => composerInputRef.current?.focus(),
                          50,
                        );
                      }
                    }}
                    items={MODE_OPTIONS.flatMap(opt => {
                      const item: DropdownMenuOption = {
                        id: opt.key,
                        label: opt.label,
                        icon: opt.icon,
                        endContent:
                          mode === opt.key ? (
                            <Icon icon={CheckIcon} size="sm" />
                          ) : undefined,
                        onClick: () => {
                          const tokenLabel = TOKEN_MODES[opt.key];
                          if (tokenLabel) {
                            insertModeToken(tokenLabel);
                            shouldFocusComposerRef.current = true;
                          } else {
                            setMode(opt.key as CodingRunMode);
                          }
                        },
                      };
                      return opt.key === 'deep'
                        ? [{type: 'divider' as const}, item]
                        : [item];
                    })}
                  />
                  <DropdownMenu
                    button={{
                      label: activeModelLabel,
                      variant: 'ghost',
                      size: isCompact ? 'sm' : 'md',
                      icon: <Icon icon={CpuChipIcon} size="sm" />,
                      children: truncateLabel(
                        activeModelLabel,
                        isCompact ? 6 : 16,
                      ),
                    }}
                    menuWidth={280}
                    menuMaxHeight={320}
                    items={modelMenuItems}
                  />
                  <DropdownMenu
                    button={{
                      label: 'Effort and settings',
                      variant: 'ghost',
                      size: isCompact ? 'sm' : 'md',
                      icon: <Icon icon={Cog6ToothIcon} size="sm" />,
                      isIconOnly: true,
                    }}
                    hasChevron={false}
                    menuWidth={220}
                    items={settingsMenuItems}
                  />
                </>
              }
              sendActions={<ChatDictationButton dictation={dictation} />}
              sendButton={
                attachments.length > 0 && !draft.trim() ? (
                  <ChatSendButton
                    size={isCompact ? 'sm' : 'md'}
                    isDisabled={starting}
                    onSend={() => void submitDraft(draft)}
                  />
                ) : undefined
              }
            />

            {/* Category filters + suggestion cards */}
            <VStack gap={6} style={categoriesStyle}>
              <ToggleButtonGroup
                label="Category"
                type="single"
                value={category}
                onChange={val =>
                  setCategory(Array.isArray(val) ? (val[0] ?? null) : val)
                }
                size={isCompact ? 'sm' : 'lg'}
                style={categoryGroupStyle}>
                {CATEGORIES.map(cat => (
                  <ToggleButton
                    key={cat.key}
                    value={cat.key}
                    label={cat.label}
                    icon={<Icon icon={cat.icon} size="sm" />}
                  />
                ))}
              </ToggleButtonGroup>

              {suggestions && (
                <Grid columns={{minWidth: isCompact ? 220 : 280}} gap={3}>
                  {suggestions.map(suggestion => (
                    <ClickableCard
                      key={suggestion.heading}
                      label={suggestion.heading}
                      variant="muted"
                      padding={3}
                      onClick={() => applySuggestion(suggestion.prompt)}>
                      <VStack gap={0.5}>
                        <Heading level={4}>{suggestion.heading}</Heading>
                        <Text type="body" color="secondary" size="xsm">
                          {suggestion.body}
                        </Text>
                      </VStack>
                    </ClickableCard>
                  ))}
                </Grid>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
