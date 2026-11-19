import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getHostBridge} from '../bridge';
import {
  AppIcon,
  Layers,
  Moon,
  RefreshCw,
  Search,
  SETTING_ICONS,
  Settings,
  Sun,
  X,
} from '../components/AppIcons';

interface NavGroup {
  title: string;
  items: string[];
}

const NAV_GROUPS: NavGroup[] = [
  {title: 'Console', items: ['overview', 'general', 'developer']},
  {
    title: 'AI & Integrations',
    items: ['providers', 'connections', 'agents', 'skills', 'mcp'],
  },
  {
    title: 'Workspace & Safety',
    items: ['workspace', 'permissions', 'cowork', 'cron', 'files'],
  },
];

const NATIVE_SECTIONS = new Set([
  'overview',
  'general',
  'permissions',
  'cowork',
  'workspace',
  'developer',
]);

const SECTION_TITLES: Record<string, string> = {
  overview: 'Overview',
  general: 'General',
  providers: 'Providers',
  connections: 'Connections',
  agents: 'Specialist agents',
  skills: 'Skills',
  mcp: 'MCP servers',
  cron: 'Schedules',
  workspace: 'Workspace',
  permissions: 'Permissions',
  cowork: 'Cowork',
  files: 'Files & storage',
  developer: 'Developer',
  project: 'Project',
};

export function SettingsConsoleView({
  isOpen,
  section,
  themeMode,
  onSelectSection,
  onClose,
}: {
  isOpen: boolean;
  section: string;
  themeMode: 'light' | 'dark';
  onSelectSection: (sec: string) => void;
  onClose: () => void;
}) {
  const host = getHostBridge();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const legacyHostRef = useRef<HTMLDivElement | null>(null);

  const [overviewQuery, setOverviewQuery] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [effort, setEffort] = useState('medium');
  const [startMode, setStartMode] = useState<'cowork' | 'coding'>('cowork');
  const [persistent, setPersistent] = useState(true);
  const [spendCeiling, setSpendCeiling] = useState('');
  const [codingAccess, setCodingAccess] = useState<'ask' | 'full'>('ask');
  const [learnMode, setLearnMode] = useState<'reactive' | 'proactive' | 'off'>(
    'reactive',
  );
  const [consolidate, setConsolidate] = useState(true);
  const [skillApproval, setSkillApproval] = useState(false);
  const [projectsPath, setProjectsPath] = useState('');
  const [projectInfo, setProjectInfo] = useState<{
    name?: string;
    repoRoot?: string;
  }>({});
  const [savingAction, setSavingAction] = useState(false);

  const activeSection = section || 'overview';
  const isLegacySection = !NATIVE_SECTIONS.has(activeSection);

  const settingItems = useMemo(() => {
    return host?.getWorkspaceSettingItems() ?? [];
  }, [host, isOpen]);

  const loadNativeData = useCallback(async () => {
    if (!host) return;
    const state = host.getState();
    setDevMode(Boolean(state.settings?.devMode));
    setEffort(state.sel?.effort || 'medium');
    setStartMode(state.settings?.startMode === 'coding' ? 'coding' : 'cowork');
    setPersistent(state.sel?.persistent !== false);
    setSpendCeiling(
      state.sel?.spendCeilingUsd === undefined
        ? ''
        : String(state.sel.spendCeilingUsd),
    );

    try {
      const [homeRes, permRes, learnRes, projRes, onbRes] =
        await Promise.allSettled([
          host.api<{
            projectsPath?: string;
            autonomy?: {persistent?: boolean; maxCostUsd?: number};
          }>('/api/home'),
          host.api<{access?: string}>('/api/coding-permissions'),
          host.api<{
            mode?: string;
            consolidate?: boolean;
            skillApproval?: boolean;
          }>('/api/cowork/learning'),
          host.api<{name?: string; repoRoot?: string}>('/api/project'),
          host.api<{mode?: string}>('/api/onboarding'),
        ]);

      if (homeRes.status === 'fulfilled') {
        if (typeof homeRes.value.projectsPath === 'string') {
          setProjectsPath(homeRes.value.projectsPath);
        }
        if (homeRes.value.autonomy) {
          setPersistent(homeRes.value.autonomy.persistent !== false);
          setSpendCeiling(
            homeRes.value.autonomy.maxCostUsd === undefined
              ? ''
              : String(homeRes.value.autonomy.maxCostUsd),
          );
        }
      }
      if (permRes.status === 'fulfilled') {
        setCodingAccess(permRes.value.access === 'full' ? 'full' : 'ask');
      }
      if (learnRes.status === 'fulfilled') {
        const m = learnRes.value.mode;
        setLearnMode(
          m === 'proactive' || m === 'off' ? m : 'reactive',
        );
        setConsolidate(learnRes.value.consolidate !== false);
        setSkillApproval(learnRes.value.skillApproval === true);
      }
      if (projRes.status === 'fulfilled') {
        setProjectInfo(projRes.value);
      }
      if (onbRes.status === 'fulfilled') {
        setStartMode(onbRes.value.mode === 'coding' ? 'coding' : 'cowork');
      }
    } catch {
      // Partial settings panels stay usable from host state.
    }
  }, [host]);

  useEffect(() => {
    if (!isOpen) return;
    void loadNativeData();
  }, [isOpen, loadNativeData]);

  useEffect(() => {
    if (!isOpen || !host || !isLegacySection) return;
    const container = legacyHostRef.current;
    if (!container) return;
    host.setSettingSection(activeSection);
    host.renderLegacySettingsSection(activeSection, container);
  }, [isOpen, activeSection, isLegacySection, host]);

  const filteredOverviewItems = useMemo(() => {
    const q = overviewQuery.trim().toLowerCase();
    if (!q) return settingItems;
    return settingItems.filter(it =>
      `${it.title} ${it.detail} ${it.keywords || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [settingItems, overviewQuery]);

  if (!isOpen) return null;

  const state = host?.getState();
  const cowork = host?.ensureCowork();
  const projectPath = host?.effectiveProjectPath() || projectsPath || '';
  const projectLabel =
    (projectPath && host?.basename(projectPath)) ||
    projectInfo.name ||
    'Default workspace';

  const saveAutonomy = async (nextPersistent: boolean, nextCeiling: string) => {
    if (!host) return;
    const raw = nextCeiling.trim();
    try {
      const saved = await host.api<{
        persistent?: boolean;
        maxCostUsd?: number;
      }>('/api/autonomy', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          persistent: nextPersistent,
          maxCostUsd: raw === '' ? null : raw,
        }),
      });
      const st = host.getState();
      st.sel.persistent = saved.persistent !== false;
      st.sel.spendCeilingUsd =
        saved.maxCostUsd === undefined ? '' : String(saved.maxCostUsd);
      host.persist();
      setPersistent(st.sel.persistent);
      setSpendCeiling(String(st.sel.spendCeilingUsd));
      host.toast(
        `Autonomy: ${st.sel.persistent ? 'keeps going until done' : 'fail fast'}`,
      );
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not save autonomy.',
        true,
      );
    }
  };

  const saveStartMode = async (mode: 'cowork' | 'coding') => {
    setStartMode(mode);
    if (!host) return;
    const st = host.getState();
    st.settings.startMode = mode;
    host.persist();
    try {
      await host.api('/api/onboarding', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          theme: st.settings.theme,
          mode,
          model: st.sel.model || '',
        }),
      });
      host.toast(
        `Primary workspace set to ${mode === 'cowork' ? 'Cowork' : 'Coding'}`,
      );
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update workspace mode.',
        true,
      );
    }
  };

  const saveCodingPermission = async (access: 'ask' | 'full') => {
    if (!host) return;
    setSavingAction(true);
    try {
      await host.api('/api/coding-permissions', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({access}),
      });
      setCodingAccess(access);
      await host.syncCodingPermissions?.();
      host.toast(
        access === 'full'
          ? 'Coding access: Full workspace automation'
          : 'Coding access: Ask before shell & edits',
      );
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update permissions.',
        true,
      );
    } finally {
      setSavingAction(false);
    }
  };

  const saveCoworkLearning = async (patch: {
    mode?: 'reactive' | 'proactive' | 'off';
    consolidate?: boolean;
    skillApproval?: boolean;
  }) => {
    if (!host) return;
    try {
      const saved = await host.api<{
        mode?: string;
        consolidate?: boolean;
      }>('/api/cowork/learning', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(patch),
      });
      if (saved.mode === 'proactive' || saved.mode === 'off' || saved.mode === 'reactive') {
        setLearnMode(saved.mode);
      }
      if (typeof saved.consolidate === 'boolean') {
        setConsolidate(saved.consolidate);
      }
      if (typeof patch.skillApproval === 'boolean') {
        setSkillApproval(patch.skillApproval);
      }
      host.toast('Cowork learning settings saved');
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update Cowork settings.',
        true,
      );
    }
  };

  const saveWorkspaceFolder = async (nextPath: string) => {
    if (!host) return;
    setSavingAction(true);
    try {
      const res = await host.api<{projectsPath?: string}>(
        '/api/home/workspace',
        {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({projectsPath: nextPath}),
        },
      );
      setProjectsPath(res.projectsPath || '');
      host.updateProjChip();
      host.renderSidebar();
      host.toast('Workspace folder updated');
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update folder.',
        true,
      );
    } finally {
      setSavingAction(false);
    }
  };

  const sidebarNav = (
    <VStack gap={3} padding={3} height="100%">
      <Button
        label="Search console…"
        variant="secondary"
        size="sm"
        icon={<AppIcon icon={Search} />}
        width="100%"
        onClick={() => host?.openSearchOverlay()}
      />

      <StackItem size="fill">
        <VStack gap={3}>
          {NAV_GROUPS.map(group => (
            <VStack key={group.title} gap={1}>
              <Text type="supporting" color="secondary">
                {group.title}
              </Text>
              <List density="compact" hasDividers={false} edge="flush">
                {group.items.map(id => {
                  const IconComp = SETTING_ICONS[id] || Settings;
                  return (
                    <ListItem
                      key={id}
                      label={SECTION_TITLES[id] || id}
                      startContent={<AppIcon icon={IconComp} size="sm" />}
                      isSelected={activeSection === id}
                      onClick={() => onSelectSection(id)}
                    />
                  );
                })}
              </List>
            </VStack>
          ))}
        </VStack>
      </StackItem>

      <Card variant="muted" padding={3}>
        <VStack gap={1}>
          <Heading level={6}>Agent Gitu Console</Heading>
          <Text type="supporting" color="secondary">
            Pikpam Design · {themeMode === 'dark' ? 'Dark' : 'Light'}
          </Text>
          <Button
            label="Credits & billing"
            variant="ghost"
            size="sm"
            onClick={() => host?.openTopup()}
          />
        </VStack>
      </Card>
    </VStack>
  );

  return (
    <VStack
      className="gitu-astryx-overlay"
      width="100%"
      height="100%"
      padding={0}
      aria-label="Console settings">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={isMobile ? 3 : 4}>
            <HStack vAlign="center" hAlign="between" gap={2} width="100%">
              <HStack gap={2} vAlign="center">
                <AppIcon icon={Layers} size="sm" color="accent" />
                <Text color="secondary">Console</Text>
                <Text color="secondary">/</Text>
                <Heading level={5}>
                  {SECTION_TITLES[activeSection] || activeSection}
                </Heading>
              </HStack>

              <HStack gap={2} vAlign="center">
                <IconButton
                  label="Search console"
                  tooltip="Search console"
                  variant="ghost"
                  size="sm"
                  icon={<AppIcon icon={Search} />}
                  onClick={() => host?.openSearchOverlay()}
                />
                <IconButton
                  label={
                    themeMode === 'dark'
                      ? 'Switch to light theme'
                      : 'Switch to dark theme'
                  }
                  tooltip={themeMode === 'dark' ? 'Light theme' : 'Dark theme'}
                  variant="ghost"
                  size="sm"
                  icon={<AppIcon icon={themeMode === 'dark' ? Sun : Moon} />}
                  onClick={() => host?.toggleThemeMode()}
                />
                <Button
                  label={isMobile ? 'Back' : 'Back to Cowork'}
                  variant="secondary"
                  size="sm"
                  icon={<AppIcon icon={X} />}
                  onClick={onClose}
                />
              </HStack>
            </HStack>
          </LayoutHeader>
        }
        start={
          isMobile ? undefined : (
            <LayoutPanel width={248} hasDivider role="navigation" label="Settings">
              {sidebarNav}
            </LayoutPanel>
          )
        }
        content={
          <LayoutContent padding={isMobile ? 3 : 5}>
            <VStack width="100%" maxWidth={1080} gap={4}>
              {isMobile ? (
                <Selector
                  label="Section"
                  value={activeSection}
                  onChange={onSelectSection}
                  options={Object.entries(SECTION_TITLES).map(([v, l]) => ({
                    value: v,
                    label: l,
                  }))}
                  width="100%"
                />
              ) : null}

              {activeSection === 'overview' ? (
                <VStack gap={4}>
                  <Grid columns={isMobile ? 2 : 3} gap={3}>
                    <Card padding={4}>
                      <VStack gap={1}>
                        <Text color="secondary">Active workspace</Text>
                        <Heading level={4} maxLines={1}>
                          {projectLabel}
                        </Heading>
                        <Text type="supporting" color="secondary" maxLines={1}>
                          {projectPath || 'Local home workspace'}
                        </Text>
                      </VStack>
                    </Card>
                    <Card padding={4}>
                      <VStack gap={1}>
                        <Text color="secondary">Default model</Text>
                        <Heading level={4} maxLines={1}>
                          {state?.sel?.model?.split('::').pop() || 'PikRouter'}
                        </Heading>
                        <Text type="supporting" color="secondary">
                          Effort: {state?.sel?.effort || 'auto'}
                        </Text>
                      </VStack>
                    </Card>
                    <Card padding={4}>
                      <VStack gap={1}>
                        <Text color="secondary">Agent team</Text>
                        <Heading level={4}>
                          {cowork?.agents?.length ?? 0} teammates
                        </Heading>
                        <Text type="supporting" color="secondary">
                          {startMode === 'cowork'
                            ? 'Cowork launch mode'
                            : 'Coding launch mode'}
                        </Text>
                      </VStack>
                    </Card>
                  </Grid>

                  <TextInput
                    label="Filter settings"
                    isLabelHidden
                    enterKeyHint="search"
                    startIcon="search"
                    hasClear
                    placeholder="Find settings, providers, apps, permissions…"
                    value={overviewQuery}
                    onChange={setOverviewQuery}
                    width="100%"
                  />

                  <Grid
                    columns={isMobile ? 2 : {minWidth: 210, max: 3}}
                    gap={3}>
                    {filteredOverviewItems.map(item => {
                      const ItemIcon = SETTING_ICONS[item.id] || Settings;
                      return (
                        <ClickableCard
                          key={item.id}
                          label={item.title}
                          padding={4}
                          onClick={() => onSelectSection(item.id)}>
                          <VStack gap={2}>
                            <HStack gap={2} vAlign="center">
                              <AppIcon
                                icon={ItemIcon}
                                size="md"
                                color="accent"
                              />
                              <Heading level={5} maxLines={1}>
                                {item.title}
                              </Heading>
                            </HStack>
                            <Text
                              type="supporting"
                              color="secondary"
                              maxLines={2}>
                              {item.detail}
                            </Text>
                          </VStack>
                        </ClickableCard>
                      );
                    })}
                  </Grid>
                </VStack>
              ) : null}

              {activeSection === 'general' ? (
                <Grid columns={isMobile ? 1 : 2} gap={4}>
                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Appearance &amp; Defaults</Heading>
                      <Switch
                        label="Light theme"
                        description="Switch between clean light and low-glare dark surfaces"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={themeMode === 'light'}
                        onChange={() => host?.toggleThemeMode()}
                      />
                      <Selector
                        label="Primary workspace"
                        value={startMode}
                        onChange={v =>
                          void saveStartMode(v === 'coding' ? 'coding' : 'cowork')
                        }
                        options={[
                          {value: 'cowork', label: 'Cowork (Recommended)'},
                          {value: 'coding', label: 'Coding'},
                        ]}
                        width="100%"
                      />
                      <Selector
                        label="Reasoning effort"
                        value={effort}
                        onChange={v => {
                          setEffort(v);
                          const st = host?.getState();
                          if (st) {
                            st.sel.effort = v;
                            host?.persist();
                          }
                        }}
                        options={[
                          {value: 'low', label: 'Low (fastest)'},
                          {value: 'medium', label: 'Medium'},
                          {value: 'high', label: 'High'},
                          {value: 'max', label: 'Max reasoning'},
                        ]}
                        width="100%"
                      />
                      <Switch
                        label="Developer diagnostics"
                        description="Show protocol repair details and checkpoint telemetry"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={devMode}
                        onChange={val => {
                          setDevMode(val);
                          const st = host?.getState();
                          if (st) {
                            st.settings.devMode = val;
                            host?.persist();
                          }
                        }}
                      />
                    </VStack>
                  </Card>

                  <VStack gap={4}>
                    <Card padding={4}>
                      <VStack gap={3}>
                        <Heading level={4}>Autonomy &amp; Limits</Heading>
                        <Switch
                          label="Keep going until done"
                          description="Automatically recover from transient empty replies or protocol noise"
                          labelPosition="start"
                          labelSpacing="spread"
                          width="100%"
                          value={persistent}
                          onChange={next => void saveAutonomy(next, spendCeiling)}
                        />
                        <TextInput
                          label="Spend ceiling (USD per run)"
                          placeholder="No automatic limit"
                          value={spendCeiling}
                          onChange={setSpendCeiling}
                          width="100%"
                        />
                        <HStack hAlign="end">
                          <Button
                            label="Save ceiling"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void saveAutonomy(persistent, spendCeiling)
                            }
                          />
                        </HStack>
                      </VStack>
                    </Card>

                    <Card padding={4}>
                      <VStack gap={3}>
                        <HStack hAlign="between" vAlign="center">
                          <Heading level={4}>PikRouter Account</Heading>
                          <Badge variant="success" label="Active auth" />
                        </HStack>
                        <Text color="secondary">
                          Routes AI requests and unlocks cloud models across all teammates.
                        </Text>
                        <HStack gap={2} wrap="wrap">
                          <Button
                            label="Top up credits"
                            variant="primary"
                            size="sm"
                            onClick={() => host?.openTopup()}
                          />
                          <Button
                            label="Continue with Pikpam"
                            variant="secondary"
                            size="sm"
                            onClick={() => host?.startOAuth()}
                          />
                          <Button
                            label="Setup wizard"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onClose();
                              host?.openSetupWizard?.();
                            }}
                          />
                        </HStack>
                      </VStack>
                    </Card>
                  </VStack>
                </Grid>
              ) : null}

              {activeSection === 'permissions' ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={4}>Workspace Execution Permissions</Heading>
                    <Text color="secondary">
                      Control whether coding runs ask before running shell commands and file writes.
                    </Text>
                  </VStack>

                  <Grid columns={isMobile ? 1 : 2} gap={4}>
                    <ClickableCard
                      label="Ask before commands and edits"
                      padding={4}
                      variant={codingAccess === 'ask' ? 'muted' : 'default'}
                      isDisabled={savingAction}
                      onClick={() => void saveCodingPermission('ask')}>
                      <VStack gap={2}>
                        <HStack hAlign="between" vAlign="center">
                          <Heading level={5}>Ask before acting</Heading>
                          {codingAccess === 'ask' ? (
                            <Badge variant="info" label="Active" />
                          ) : null}
                        </HStack>
                        <Text color="secondary">
                          Approve shell commands and code modifications step-by-step.
                        </Text>
                      </VStack>
                    </ClickableCard>

                    <ClickableCard
                      label="Full autonomous coding access"
                      padding={4}
                      variant={codingAccess === 'full' ? 'muted' : 'default'}
                      isDisabled={savingAction}
                      onClick={() => void saveCodingPermission('full')}>
                      <VStack gap={2}>
                        <HStack hAlign="between" vAlign="center">
                          <Heading level={5}>Full automation</Heading>
                          {codingAccess === 'full' ? (
                            <Badge variant="info" label="Active" />
                          ) : null}
                        </HStack>
                        <Text color="secondary">
                          Run tests, edits, and build commands inside your project without prompts.
                        </Text>
                      </VStack>
                    </ClickableCard>
                  </Grid>
                </VStack>
              ) : null}

              {activeSection === 'cowork' ? (
                <Grid columns={isMobile ? 1 : 2} gap={4}>
                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Team Learning Loop</Heading>
                      <Selector
                        label="Learning mode"
                        value={learnMode}
                        onChange={v => {
                          const mode =
                            v === 'proactive' || v === 'off' ? v : 'reactive';
                          void saveCoworkLearning({mode});
                        }}
                        options={[
                          {
                            value: 'reactive',
                            label: 'Reactive (Default)',
                            description: 'Consolidate daily without unsolicited wakes',
                          },
                          {
                            value: 'proactive',
                            label: 'Proactive reflections',
                            description: 'Periodic team reflection sweeps',
                          },
                          {
                            value: 'off',
                            label: 'Off',
                            description: 'Disable scheduled memory sweeps',
                          },
                        ]}
                        width="100%"
                      />
                      <Switch
                        label="Consolidate shared memory"
                        description="Deduplicate and supersede stale facts nightly"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={consolidate}
                        onChange={val => void saveCoworkLearning({consolidate: val})}
                      />
                      <Switch
                        label="Require approval for agent skills"
                        description="Queue agent-authored skill writes before saving"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={skillApproval}
                        onChange={val =>
                          void saveCoworkLearning({skillApproval: val})
                        }
                      />
                    </VStack>
                  </Card>

                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Team Workspace</Heading>
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="Open Agent Switcher"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onClose();
                            const w = window as unknown as {
                              __gituAstryx?: {openSwitcher: () => void};
                            };
                            w.__gituAstryx?.openSwitcher();
                          }}
                        />
                      </HStack>
                    </VStack>
                  </Card>
                </Grid>
              ) : null}

              {activeSection === 'workspace' ? (
                <Grid columns={isMobile ? 1 : 2} gap={4}>
                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Projects Directory</Heading>
                      <TextInput
                        label="Workspace root path"
                        value={projectsPath}
                        onChange={setProjectsPath}
                        placeholder="e.g. C:\Users\Name\Documents"
                        width="100%"
                      />
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="Save path"
                          variant="primary"
                          size="sm"
                          isDisabled={savingAction}
                          onClick={() => void saveWorkspaceFolder(projectsPath)}
                        />
                        <Button
                          label="Browse folder"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onClose();
                            host?.openFolderBrowser();
                          }}
                        />
                        <Button
                          label="Reset default"
                          variant="ghost"
                          size="sm"
                          onClick={() => void saveWorkspaceFolder('')}
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  <Card padding={4}>
                    <VStack gap={2}>
                      <Heading level={4}>Active Project Guard</Heading>
                      <Heading level={5}>
                        {projectInfo.name || projectLabel}
                      </Heading>
                      <Text color="secondary">
                        {projectInfo.repoRoot || projectPath || 'No project selected'}
                      </Text>
                    </VStack>
                  </Card>
                </Grid>
              ) : null}

              {activeSection === 'developer' ? (
                <Grid columns={isMobile ? 1 : 2} gap={4}>
                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Developer Tools</Heading>
                      <Switch
                        label="Developer diagnostics"
                        description="Display telemetry checkpoints and protocol repair events"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={devMode}
                        onChange={val => {
                          setDevMode(val);
                          const st = host?.getState();
                          if (st) {
                            st.settings.devMode = val;
                            host?.persist();
                          }
                        }}
                      />
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="Reload model catalog"
                          variant="secondary"
                          size="sm"
                          icon={<AppIcon icon={RefreshCw} />}
                          onClick={() => void host?.loadModelCatalog(true)}
                        />
                        <Button
                          label="Refresh Cowork roster"
                          variant="secondary"
                          size="sm"
                          onClick={() => host?.refreshCowork(true)}
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  <Card padding={4}>
                    <VStack gap={2}>
                      <Heading level={4}>Legacy System Panels</Heading>
                      <Text color="secondary">
                        Inspect storage transfers, project locks, and raw MCP tools.
                      </Text>
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="Files & storage"
                          variant="secondary"
                          size="sm"
                          onClick={() => onSelectSection('files')}
                        />
                        <Button
                          label="MCP servers"
                          variant="secondary"
                          size="sm"
                          onClick={() => onSelectSection('mcp')}
                        />
                      </HStack>
                    </VStack>
                  </Card>
                </Grid>
              ) : null}

              {isLegacySection ? (
                <VStack
                  ref={legacyHostRef}
                  className="gitu-astryx-legacy-host"
                  width="100%"
                  gap={3}
                />
              ) : null}
            </VStack>
          </LayoutContent>
        }
      />
    </VStack>
  );
}
