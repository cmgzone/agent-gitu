import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { HStack, LayoutContent, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Avatar } from '@astryxdesign/core/Avatar';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import {
  Activity,
  Bot,
  Boxes,
  Folder,
  Mail,
  Monitor,
  Moon,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { AppIcon } from '../components/AppIcons';
import { getHostBridge, type CoworkAgent } from '../bridge';
import {
  CodingChatLandingView,
  type StartCodingTaskOptions,
} from './CodingChatLandingView';

interface ManagedProject {
  path: string;
  name?: string;
}

interface CodingSessionRow {
  runId: string;
  goal?: string;
  status?: string;
  mode?: string;
  project?: string;
  projectPath?: string;
  provider?: string;
  model?: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  coworkTask?: { agentId?: string; agentName?: string };
}

type DashboardTab = 'overview' | 'projects' | 'sessions';

function shortPath(raw: string | undefined): string {
  if (!raw) return 'No project selected';
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function formatStamp(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusDotVariant(status: string | undefined): 'success' | 'accent' | 'error' | 'warning' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s === 'running' || s === 'waiting_for_model') return 'accent';
  if (s === 'completed') return 'success';
  if (s === 'failed') return 'error';
  if (s === 'blocked' || s === 'review' || s === 'stalled') return 'warning';
  return 'neutral';
}

function statusLabel(status: string | undefined): string {
  const s = (status || '').toLowerCase();
  if (s === 'running' || s === 'waiting_for_model') return 'ACTIVE';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'failed') return 'FAILED';
  if (s === 'blocked') return 'BLOCKED';
  if (s === 'review') return 'NEEDS REVIEW';
  if (s === 'aborted') return 'STOPPED';
  return (status || 'SAVED').toUpperCase();
}

export function CodeDashboardView({
  themeMode,
  agents,
  activeAgentId,
  onOpenInbox,
  onOpenSettings,
  onOpenSwitcher,
  onOpenProfile,
  onOpenCloudAgents,
  hasDesktopCloudSwitcher,
}: {
  themeMode: 'light' | 'dark';
  agents: CoworkAgent[];
  activeAgentId: string;
  onOpenInbox: () => void;
  onOpenSettings: (section?: string) => void;
  onOpenSwitcher: () => void;
  onOpenProfile: (agentId: string) => void;
  onOpenCloudAgents?: () => void;
  hasDesktopCloudSwitcher?: boolean;
}) {
  const isCompact = useMediaQuery('(max-width: 767px)');

  const [tab, setTab] = useState<DashboardTab>('overview');
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [sessions, setSessions] = useState<CodingSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [starting, setStarting] = useState(false);
  const [sessionFilter, setSessionFilter] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>(() => getHostBridge()?.effectiveProjectPath?.() || '');
  const [selectedModel, setSelectedModel] = useState<string>(() => getHostBridge()?.getState?.().sel?.model || '');
  const [selectedEffort, setSelectedEffort] = useState<string>(() => getHostBridge()?.getState?.().sel?.effort || 'medium');
  const [creditsAvailable, setCreditsAvailable] = useState<number | null>(null);
  const [ownerName, setOwnerName] = useState<string>('');
  const [ownerEmail, setOwnerEmail] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const host = getHostBridge();
  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) || agents[0] || null,
    [agents, activeAgentId],
  );

  const modelOptions = useMemo(() => {
    const rawModels = (host?.getState?.().models ?? []) as Array<{
      id?: string;
      label?: string;
      hasKey?: boolean;
      usable?: boolean;
      models?: Array<{ id: string; label?: string }>;
    }>;
    const opts: Array<{ value: string; label: string }> = [];
    for (const provider of rawModels) {
      if (!provider?.id || !Array.isArray(provider.models)) continue;
      if (provider.usable === false && provider.hasKey === false) continue;
      for (const m of provider.models) {
        opts.push({
          value: `${provider.id}::${m.id}`,
          label: `${provider.label || provider.id} · ${m.label || m.id}`,
        });
      }
    }
    if (selectedModel && !opts.some((o) => o.value === selectedModel)) {
      const parts = selectedModel.split('::');
      opts.unshift({
        value: selectedModel,
        label: parts.length > 1 ? `${parts[0]} · ${parts.slice(1).join('::')}` : selectedModel,
      });
    }
    return opts;
  }, [host, selectedModel, refreshing]);

  const loadData = useCallback(async (isRefresh = false) => {
    const bridge = getHostBridge();
    if (!bridge) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [projRes, runRes, credRes, authRes] = await Promise.allSettled([
        bridge.api<{ projects?: ManagedProject[] }>('/api/projects'),
        bridge.api<CodingSessionRow[]>('/api/runs'),
        bridge.api<{ ok?: boolean; credits?: { available?: number; balance?: number } }>('/api/pikrouter/credits'),
        bridge.api<{ account?: { email?: string; name?: string } }>('/api/auth/status'),
      ]);
      if (projRes.status === 'fulfilled' && Array.isArray(projRes.value?.projects)) {
        setProjects(projRes.value.projects);
      }
      if (runRes.status === 'fulfilled' && Array.isArray(runRes.value)) {
        const sorted = [...runRes.value].sort((a, b) =>
          String(b.updatedAt || b.finishedAt || b.startedAt || '').localeCompare(
            String(a.updatedAt || a.finishedAt || a.startedAt || ''),
          ),
        );
        setSessions(sorted);
      }
      if (credRes.status === 'fulfilled' && credRes.value?.ok && credRes.value.credits) {
        const avail = credRes.value.credits.available ?? credRes.value.credits.balance;
        if (typeof avail === 'number' && Number.isFinite(avail)) setCreditsAvailable(avail);
      }
      if (authRes.status === 'fulfilled' && authRes.value?.account) {
        setOwnerName(authRes.value.account.name || '');
        setOwnerEmail(authRes.value.account.email || authRes.value.account.name || '');
      }
      const eff = bridge.effectiveProjectPath?.() || '';
      if (eff) setSelectedProject((prev) => prev || eff);
      const sel = bridge.getState?.().sel;
      if (sel?.model) setSelectedModel((prev) => prev || sel.model || '');
      if (sel?.effort) setSelectedEffort(sel.effort);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadData(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const handleSelectProject = (projectPath: string) => {
    setSelectedProject(projectPath);
    host?.selectProject?.(projectPath);
  };

  const handleSelectModel = (value: string) => {
    setSelectedModel(value);
    const state = host?.getState?.();
    if (state?.sel) {
      state.sel.model = value;
      host?.persist?.();
    }
  };

  const handleSelectEffort = (value: string) => {
    setSelectedEffort(value);
    const state = host?.getState?.();
    if (state?.sel) {
      state.sel.effort = value;
      host?.persist?.();
    }
  };

  const handleStartTask = async (opts: StartCodingTaskOptions): Promise<boolean> => {
    const trimmed = opts.goal.trim();
    const hasFiles = Array.isArray(opts.files) && opts.files.length > 0;
    if ((!trimmed && !hasFiles) || starting) return false;
    const bridge = getHostBridge();
    if (!bridge) return false;
    if (!selectedModel) {
      setErrorMsg('Connect a model provider first in Settings → Providers.');
      onOpenSettings('providers');
      return false;
    }
    setErrorMsg('');
    setStarting(true);
    const taskMode = opts.mode || 'agent';
    try {
      const parts = selectedModel.split('::');
      const provider = parts[0] || '';
      const model = parts.slice(1).join('::');
      const projectPath = selectedProject || bridge.effectiveProjectPath?.() || undefined;
      const res = await bridge.api<{ runId: string }>('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: trimmed,
          provider,
          model,
          mode: taskMode,
          effort: opts.effort || selectedEffort || 'medium',
          ...(typeof opts.review === 'boolean' ? { review: opts.review } : {}),
          projectPath,
          ...(hasFiles ? { files: opts.files } : {}),
        }),
      });
      bridge.openRun?.(res.runId, {
        chatish: taskMode === 'chat',
        mode: taskMode,
        goal: trimmed || opts.files?.[0]?.name || 'Attached files',
        projectPath,
      });
      bridge.renderSidebar?.();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start task.';
      setErrorMsg(msg);
      bridge.toast(msg, true);
      return false;
    } finally {
      setStarting(false);
    }
  };

  const runningCount = useMemo(
    () => sessions.filter((s) => s.status === 'running' || s.status === 'waiting_for_model').length,
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      `${s.goal || ''} ${s.project || ''} ${s.status || ''} ${s.model || ''}`.toLowerCase().includes(q),
    );
  }, [sessions, sessionFilter]);

  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ value: string; label: string }> = [];
    const add = (p: string, label?: string) => {
      if (!p || seen.has(p)) return;
      seen.add(p);
      out.push({ value: p, label: label || shortPath(p) });
    };
    if (selectedProject) add(selectedProject);
    for (const p of projects) add(p.path, p.name || shortPath(p.path));
    return out;
  }, [projects, selectedProject]);

  const ModeIcon = themeMode === 'dark' ? Moon : Sun;

  const topNav = (
    <TopNav
      label="Primary navigation"
      heading={
        <TopNavHeading
          logo={<Avatar src="/brand/agent-gitu-mark.svg" name="Agent Gitu" size="sm" />}
          heading="Agent Gitu"
          subheading={isCompact ? undefined : 'Code Console'}
        />
      }
      startContent={
        <>
          <TopNavItem label="Cowork" onClick={() => host?.openCowork?.()} />
          <TopNavItem label="Code" isSelected onClick={() => setTab('overview')} />
          <TopNavItem label="Inbox" onClick={onOpenInbox} />
          <TopNavItem label="Agents" onClick={onOpenSwitcher} />
          <TopNavItem label="Groups" onClick={() => host?.openWorkspaceSearch?.('main', 'Groups')} />
          <TopNavItem label="Connections" onClick={() => onOpenSettings('connections')} />
        </>
      }
      endContent={
        <HStack gap={2} vAlign="center" wrap="nowrap">
          <DropdownMenu
            button={{
              label: `Color theme (${themeMode})`,
              variant: 'ghost',
              size: 'sm',
              isIconOnly: true,
              icon: <AppIcon icon={ModeIcon} size="sm" />,
            }}
            hasChevron={false}
            alignment="end"
            items={[
              {
                label: 'Dark (default)',
                icon: <AppIcon icon={Moon} size="sm" />,
                onClick: () => host?.setTheme?.('dark'),
              },
              {
                label: 'Light',
                icon: <AppIcon icon={Sun} size="sm" />,
                onClick: () => host?.setTheme?.('light'),
              },
              {
                label: 'System preference',
                icon: <AppIcon icon={Monitor} size="sm" />,
                onClick: () => host?.setTheme?.('system'),
              },
            ]}
          />
          {!isCompact && creditsAvailable !== null ? (
            <Button
              label={`${Math.round(creditsAvailable).toLocaleString('en-US')} cr`}
              size="sm"
              variant="secondary"
              icon={<AppIcon icon={Wallet} size="sm" />}
              onClick={() => onOpenSettings('providers')}
            />
          ) : null}
          {!isCompact ? (
            <Button
              label="Search"
              size="sm"
              variant="ghost"
              icon={<AppIcon icon={Search} size="sm" />}
              onClick={() => host?.openSearchOverlay?.()}
            />
          ) : null}
          {hasDesktopCloudSwitcher && onOpenCloudAgents ? (
            <Button
              label="Cloud Agent"
              size="sm"
              variant="secondary"
              onClick={onOpenCloudAgents}
            />
          ) : null}
          {isCompact ? (
            <Button
              label="Cowork"
              size="sm"
              variant="primary"
              icon={<AppIcon icon={Bot} size="sm" />}
              onClick={() => host?.openCowork?.()}
            />
          ) : null}
        </HStack>
      }
    />
  );

  const sideNav = (
    <SideNav
      collapsible
      footer={
        <VStack gap={1} paddingInline={2} paddingBlock={2}>
          <Text type="supporting" weight="medium" maxLines={1}>
            {ownerEmail || shortPath(selectedProject)}
          </Text>
          <Text type="supporting" color="secondary" maxLines={1}>
            {creditsAvailable !== null
              ? `Available: ${creditsAvailable.toLocaleString('en-US', { maximumFractionDigits: 2 })} credits`
              : `Project: ${shortPath(selectedProject)}`}
          </Text>
        </VStack>
      }
    >
      <SideNavSection title="Code & Tasks">
        <SideNavItem
          label="Overview"
          icon={<AppIcon icon={Activity} size="sm" />}
          isSelected={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        <SideNavItem
          label="Projects"
          icon={<AppIcon icon={Folder} size="sm" />}
          isSelected={tab === 'projects'}
          endContent={projects.length > 0 ? <Badge label={projects.length} /> : undefined}
          onClick={() => setTab('projects')}
        />
        <SideNavItem
          label="Sessions"
          icon={<AppIcon icon={Terminal} size="sm" />}
          isSelected={tab === 'sessions'}
          endContent={runningCount > 0 ? <Badge variant="info" label={runningCount} /> : undefined}
          onClick={() => setTab('sessions')}
        />
        <SideNavItem
          label="Inbox"
          icon={<AppIcon icon={Mail} size="sm" />}
          onClick={onOpenInbox}
        />
      </SideNavSection>

      <SideNavSection title="Team & AI">
        <SideNavItem
          label="Cowork Chat"
          icon={<AppIcon icon={Bot} size="sm" />}
          onClick={() => host?.openCowork?.()}
        />
        <SideNavItem
          label="AI Agents"
          icon={<AppIcon icon={Users} size="sm" />}
          endContent={agents.length > 0 ? <Badge label={agents.length} /> : undefined}
          onClick={onOpenSwitcher}
        />
        <SideNavItem
          label="Groups"
          icon={<AppIcon icon={Boxes} size="sm" />}
          onClick={() => host?.openWorkspaceSearch?.('main', 'Groups')}
        />
        <SideNavItem
          label="Connections"
          icon={<AppIcon icon={Plug} size="sm" />}
          onClick={() => onOpenSettings('connections')}
        />
      </SideNavSection>

      <SideNavSection title="Account">
        <SideNavItem
          label="Agent Profile"
          icon={<AppIcon icon={User} size="sm" />}
          onClick={() => {
            if (activeAgent) onOpenProfile(activeAgent.id);
            else onOpenSwitcher();
          }}
        />
        <SideNavItem
          label="Settings"
          icon={<AppIcon icon={Settings} size="sm" />}
          onClick={() => onOpenSettings('overview')}
        />
      </SideNavSection>
    </SideNav>
  );

  return (
    <VStack
      className="gitu-astryx-dashboard-host"
      width="100%"
      height="100%"
      padding={0}
      aria-label="Agent Gitu Code Console"
    >
      <AppShell
        variant="elevated"
        height="fill"
        contentPadding={0}
        topNav={topNav}
        sideNav={sideNav}
      >
        {tab === 'overview' ? (
          <CodingChatLandingView
            isCompact={isCompact}
            ownerName={ownerName}
            ownerEmail={ownerEmail}
            agents={agents}
            selectedProject={selectedProject}
            projectOptions={projectOptions}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            selectedEffort={selectedEffort}
            starting={starting}
            errorMsg={errorMsg}
            onSelectProject={handleSelectProject}
            onSelectModel={handleSelectModel}
            onSelectEffort={handleSelectEffort}
            onOpenFolderBrowser={() => host?.openFolderBrowser?.()}
            onNewProject={() => host?.newProject?.()}
            onOpenSettings={onOpenSettings}
            onOpenSearch={() => host?.openSearchOverlay?.()}
            onStartTask={handleStartTask}
          />
        ) : (
          <LayoutContent padding={isCompact ? 4 : 6}>
            <VStack gap={6}>
              {/* Page Header */}
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                <VStack gap={1}>
                  <Heading level={1}>Code workspace</Heading>
                  <Text type="supporting" color="secondary">
                    Autonomous coding sessions, managed repositories, and collaborative agents.
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap">
                  <Button
                    label="New Chat"
                    variant="secondary"
                    size="sm"
                    icon={<AppIcon icon={Terminal} size="sm" />}
                    onClick={() => setTab('overview')}
                  />
                  <Button
                    label={refreshing ? 'Refreshing…' : 'Refresh'}
                    variant="secondary"
                    size="sm"
                    icon={<AppIcon icon={RefreshCw} size="sm" />}
                    isDisabled={refreshing}
                    onClick={() => void loadData(true)}
                  />
                  <Button
                    label="Open Folder"
                    variant="secondary"
                    size="sm"
                    icon={<AppIcon icon={Folder} size="sm" />}
                    onClick={() => host?.openFolderBrowser?.()}
                  />
                  <Button
                    label="New Project"
                    variant="primary"
                    size="sm"
                    icon={<AppIcon icon={Plus} size="sm" />}
                    onClick={() => host?.newProject?.()}
                  />
                </HStack>
              </HStack>

              <TabList
                value={tab}
                onChange={(val) => setTab(val as DashboardTab)}
                aria-label="Code workspace tabs"
                hasDivider
              >
                <Tab value="overview" label="Overview" />
                <Tab value="projects" label={`Projects (${projects.length})`} />
                <Tab value="sessions" label={`Sessions (${sessions.length})`} />
              </TabList>

              {tab === 'projects' ? (
                <VStack gap={4}>
                  {loading && projects.length === 0 ? (
                    <Card padding={4}>
                      <Text type="supporting" color="secondary">Loading projects…</Text>
                    </Card>
                  ) : projects.length === 0 ? (
                    <Card padding={6}>
                      <EmptyState
                        isCompact
                        title="No managed projects"
                        description="Click New Project or Open Folder to add your workspace."
                      />
                    </Card>
                  ) : (
                    <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
                      {projects.map((proj) => {
                        const isCurrent = selectedProject === proj.path;
                        const projRuns = sessions.filter((s) => s.projectPath === proj.path).length;
                        return (
                          <Card key={proj.path} padding={5}>
                            <VStack gap={3}>
                              <HStack hAlign="between" vAlign="center" gap={2}>
                                <Heading level={4}>{proj.name || shortPath(proj.path)}</Heading>
                                <StatusDot
                                  variant={isCurrent ? 'success' : 'neutral'}
                                  label={isCurrent ? 'Active' : 'Ready'}
                                />
                              </HStack>
                              <Text type="code" size="sm" color="secondary" maxLines={2}>
                                {proj.path}
                              </Text>
                              <Text type="supporting" color="accent">
                                {projRuns} {projRuns === 1 ? 'session' : 'sessions'}
                              </Text>
                              <Divider />
                              <Button
                                label={isCurrent ? 'Selected project' : 'Select project'}
                                variant={isCurrent ? 'primary' : 'secondary'}
                                size="sm"
                                width="100%"
                                onClick={() => {
                                  handleSelectProject(proj.path);
                                  setTab('overview');
                                }}
                              />
                            </VStack>
                          </Card>
                        );
                      })}
                    </Grid>
                  )}
                </VStack>
              ) : (
                <VStack gap={4}>
                  <HStack gap={2} vAlign="center">
                    <StackItem size="fill">
                      <TextInput
                        label="Filter sessions"
                        isLabelHidden
                        placeholder="Filter by task goal, project, status, or model…"
                        value={sessionFilter}
                        onChange={(val) => setSessionFilter(val)}
                      />
                    </StackItem>
                  </HStack>

                  {loading && sessions.length === 0 ? (
                    <Card padding={4}>
                      <Text type="supporting" color="secondary">Loading sessions…</Text>
                    </Card>
                  ) : filteredSessions.length === 0 ? (
                    <Card padding={6}>
                      <EmptyState
                        isCompact
                        title="No matching sessions"
                        description="Start a new task in Overview or clear your search filter."
                      />
                    </Card>
                  ) : (
                    <Card padding={2}>
                      <List density="compact" hasDividers>
                        {filteredSessions.map((s) => (
                          <ListItem
                            key={s.runId}
                            label={s.goal || 'Untitled task'}
                            description={`${s.project || shortPath(s.projectPath)} · ${s.model || 'Default model'} · ${formatStamp(s.updatedAt || s.startedAt)}${s.coworkTask?.agentName ? ` · via ${s.coworkTask.agentName}` : ''}`}
                            startContent={
                              <StatusDot
                                variant={statusDotVariant(s.status)}
                                label={statusLabel(s.status)}
                              />
                            }
                            endContent={
                              <Button
                                label="Open"
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  host?.openRun?.(s.runId, {
                                    chatish: s.mode === 'chat',
                                    mode: s.mode,
                                    projectPath: s.projectPath,
                                  })
                                }
                              />
                            }
                          />
                        ))}
                      </List>
                    </Card>
                  )}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        )}
      </AppShell>
    </VStack>
  );
}
