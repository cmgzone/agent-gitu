import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  getHostBridge,
  type AgentRole,
  type AppSkill,
  type ConnectedAppAccount,
  type ConnectedAppsResponse,
  type CoworkAgent,
  type MemoryEntryItem,
  type MemoryExplainResponse,
} from '../bridge';
import {
  AppIcon,
  Layers,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from '../components/AppIcons';
import {PlushPortrait} from '../components/PlushPortrait';

type ProfileTab = 'personality' | 'roles' | 'skills' | 'memory' | 'connections';

function normalizeTab(section?: string): ProfileTab {
  if (
    section === 'roles' ||
    section === 'skills' ||
    section === 'memory' ||
    section === 'connections'
  ) {
    return section;
  }
  return 'personality';
}

export function AgentProfileView({
  isOpen,
  agent,
  initialSection,
  allSkills,
  onClose,
  onEditAgent,
  onAgentUpdated,
}: {
  isOpen: boolean;
  agent: CoworkAgent | null;
  initialSection?: string;
  allSkills: AppSkill[];
  onClose: () => void;
  onEditAgent: (agent: CoworkAgent) => void;
  onAgentUpdated: (agent: CoworkAgent) => void;
}) {
  const host = getHostBridge();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isCompactDesktop = useMediaQuery('(max-width: 960px)');

  const [tab, setTab] = useState<ProfileTab>(() => normalizeTab(initialSection));
  const [saving, setSaving] = useState(false);

  // Personality & Identity fields
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [communicationStyle, setCommunicationStyle] = useState('');
  const [proactivity, setProactivity] = useState<'reactive' | 'suggest' | 'proactive'>(
    'reactive',
  );
  const [traitsText, setTraitsText] = useState('');
  const [allowWrites, setAllowWrites] = useState(false);
  const [allowShell, setAllowShell] = useState(false);
  const [allowConfig, setAllowConfig] = useState(false);
  const [useHostComputer, setUseHostComputer] = useState(true);

  // Roles fields
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [primaryRoleId, setPrimaryRoleId] = useState<string>('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleResp, setNewRoleResp] = useState('');

  // Skills fields
  const [skillQuery, setSkillQuery] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Memory fields
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memories, setMemories] = useState<MemoryEntryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [memoryDetail, setMemoryDetail] = useState<MemoryExplainResponse | null>(
    null,
  );
  const [memoryDraft, setMemoryDraft] = useState('');

  // Connected apps
  const [connectedApps, setConnectedApps] = useState<ConnectedAppAccount[]>([]);
  const [appsConfigured, setAppsConfigured] = useState(true);
  const [appsLoading, setAppsLoading] = useState(false);

  useEffect(() => {
    setTab(normalizeTab(initialSection));
  }, [initialSection, agent?.id]);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name || '');
    setTagline(agent.tagline || '');
    setDescription(agent.description || '');
    setSystemPrompt(agent.systemPrompt || '');
    setCommunicationStyle(agent.personality?.communicationStyle || '');
    setProactivity(agent.personality?.proactivity || 'reactive');
    setTraitsText((agent.personality?.traits || []).join(', '));
    setAllowWrites(Boolean(agent.allowWrites));
    setAllowShell(Boolean(agent.allowShell));
    setAllowConfig(Boolean(agent.allowConfig));
    setUseHostComputer(agent.useHostComputer !== false);
    setRoles(agent.roles ? [...agent.roles] : []);
    setPrimaryRoleId(agent.primaryRoleId || agent.roles?.[0]?.id || '');
    setSelectedSkills(agent.skills ? [...agent.skills] : []);
    setSelectedMemoryId(null);
    setMemoryDetail(null);
    setMemoryDraft('');
  }, [agent]);

  const loadMemories = useCallback(
    async (q = '') => {
      if (!host || !agent) return;
      setMemoryLoading(true);
      try {
        const res = await host.api<{entries?: MemoryEntryItem[]}>(
          `/api/cowork/agents/${encodeURIComponent(agent.id)}/memory${
            q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
          }`,
        );
        setMemories(res.entries || []);
      } catch (err) {
        host.toast(
          err instanceof Error ? err.message : 'Could not load memory.',
          true,
        );
      } finally {
        setMemoryLoading(false);
      }
    },
    [agent, host],
  );

  const loadConnectedApps = useCallback(async () => {
    if (!host || !agent) return;
    setAppsLoading(true);
    try {
      const res = await host.api<ConnectedAppsResponse>(
        `/api/connected-apps?agentId=${encodeURIComponent(agent.id)}`,
      );
      setAppsConfigured(res.configured !== false);
      const merged = [
        ...(res.accounts || []),
        ...(res.mail?.accounts || []),
      ];
      setConnectedApps(merged);
    } catch {
      setConnectedApps([]);
    } finally {
      setAppsLoading(false);
    }
  }, [agent, host]);

  useEffect(() => {
    if (!isOpen || !agent) return;
    void loadMemories('');
    void loadConnectedApps();
  }, [isOpen, agent, loadMemories, loadConnectedApps]);

  const selectMemory = async (entry: MemoryEntryItem) => {
    if (!host || !agent) return;
    setSelectedMemoryId(entry.id);
    setMemoryDraft(entry.claim);
    try {
      const res = await host.api<MemoryExplainResponse>(
        `/api/cowork/agents/${encodeURIComponent(agent.id)}/memory/${encodeURIComponent(entry.id)}`,
      );
      setMemoryDetail(res);
      setMemoryDraft(res.entry?.claim ?? entry.claim);
    } catch {
      setMemoryDetail({entry, audit: []});
    }
  };

  const saveAgentPatch = async (payload: Record<string, unknown>, msg: string) => {
    if (!host || !agent || saving) return;
    setSaving(true);
    try {
      const res = await host.api<{agent: CoworkAgent}>('/api/cowork/agents', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({id: agent.id, ...payload}),
      });
      host.toast(msg);
      onAgentUpdated(res.agent);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not save changes.',
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSavePersonality = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      host?.toast('Name cannot be empty.', true);
      return;
    }
    const traits = traitsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    void saveAgentPatch(
      {
        name: cleanName,
        tagline: tagline.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        personality: {
          traits,
          communicationStyle: communicationStyle.trim(),
          proactivity,
        },
        allowWrites,
        allowShell,
        allowConfig,
        useHostComputer,
      },
      'Profile saved',
    );
  };

  const handleAddRole = () => {
    const clean = newRoleName.trim();
    if (!clean) return;
    const id =
      clean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `role-${Date.now()}`;
    const next = [
      ...roles,
      {id, name: clean, responsibilities: newRoleResp.trim()},
    ];
    setRoles(next);
    if (!primaryRoleId) setPrimaryRoleId(id);
    setNewRoleName('');
    setNewRoleResp('');
  };

  const handleSaveRoles = () => {
    void saveAgentPatch(
      {
        roles,
        primaryRoleId: roles.some(r => r.id === primaryRoleId)
          ? primaryRoleId
          : roles[0]?.id,
      },
      'Roles saved',
    );
  };

  const handleSaveSkills = () => {
    void saveAgentPatch({skills: selectedSkills}, 'Skills updated');
  };

  const handleSaveMemoryCorrection = async () => {
    if (!host || !agent || !selectedMemoryId) return;
    const expectedUpdatedAt =
      memoryDetail?.entry?.updatedAt ??
      memories.find(m => m.id === selectedMemoryId)?.updatedAt;
    try {
      await host.api(
        `/api/cowork/agents/${encodeURIComponent(agent.id)}/memory/${encodeURIComponent(selectedMemoryId)}`,
        {
          method: 'PATCH',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            claim: memoryDraft,
            ...(expectedUpdatedAt ? {expectedUpdatedAt} : {}),
          }),
        },
      );
      host.toast('Correction saved');
      setSelectedMemoryId(null);
      setMemoryDetail(null);
      void loadMemories(memoryQuery);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not update memory.',
        true,
      );
    }
  };

  const handleArchiveMemory = async (id: string) => {
    if (!host || !agent) return;
    try {
      await host.api(
        `/api/cowork/agents/${encodeURIComponent(agent.id)}/memory/${encodeURIComponent(id)}`,
        {method: 'DELETE'},
      );
      host.toast('Memory archived');
      if (selectedMemoryId === id) {
        setSelectedMemoryId(null);
        setMemoryDetail(null);
      }
      void loadMemories(memoryQuery);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not archive memory.',
        true,
      );
    }
  };

  const handleClearMemory = async () => {
    if (!host || !agent) return;
    if (!window.confirm(`Clear all stored memories for ${agent.name}?`)) return;
    try {
      await host.api(
        `/api/cowork/agents/${encodeURIComponent(agent.id)}/memory`,
        {method: 'DELETE'},
      );
      host.toast('All memories archived');
      setSelectedMemoryId(null);
      setMemoryDetail(null);
      setMemories([]);
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not clear memories.',
        true,
      );
    }
  };

  const handleDisconnectApp = async (accountId: string) => {
    if (!host || !agent) return;
    try {
      await host.api('/api/connected-apps/disconnect', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({agentId: agent.id, accountId}),
      });
      host.toast('App disconnected');
      void loadConnectedApps();
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not disconnect app.',
        true,
      );
    }
  };

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return allSkills;
    return allSkills.filter(sk =>
      `${sk.name} ${sk.description || ''}`.toLowerCase().includes(q),
    );
  }, [allSkills, skillQuery]);

  if (!isOpen || !agent) return null;

  const primaryRoleName =
    roles.find(r => r.id === primaryRoleId)?.name ||
    roles[0]?.name ||
    agent.tagline ||
    'Teammate';

  return (
    <VStack
      className="gitu-astryx-overlay"
      width="100%"
      height="100%"
      padding={0}
      aria-label={`${agent.name} profile`}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={isMobile ? 3 : 4}>
            <VStack width="100%" maxWidth={1120} gap={3}>
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <HStack gap={3} vAlign="center">
                  <PlushPortrait
                    avatar={agent.avatar}
                    name={agent.name}
                    size={isMobile ? 40 : 48}
                  />
                  <VStack gap={0.5}>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Heading level={3}>{agent.name}</Heading>
                      {agent.chiefOfStaff ? (
                        <Badge variant="info" label="Chief of Staff" />
                      ) : null}
                    </HStack>
                    <Text color="secondary">
                      {agent.tagline || 'Cowork teammate'}
                    </Text>
                  </VStack>
                </HStack>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Button
                    label="Edit setup"
                    variant="secondary"
                    size="sm"
                    icon={<AppIcon icon={Pencil} />}
                    onClick={() => onEditAgent(agent)}
                  />
                  <Button
                    label="Open chat"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      host?.openDm(agent.id);
                    }}
                  />
                  <IconButton
                    label="Close profile"
                    tooltip="Back to Cowork"
                    variant="ghost"
                    icon={<AppIcon icon={X} />}
                    onClick={onClose}
                  />
                </HStack>
              </HStack>

              <TabList
                value={tab}
                onChange={next => setTab(next as ProfileTab)}
                size="sm"
                overflow="auto"
                hasDivider={false}
                aria-label="Teammate profile sections">
                <Tab value="personality" label="Personality" />
                <Tab
                  value="roles"
                  label="Roles"
                  endContent={<Badge label={roles.length} />}
                />
                <Tab
                  value="skills"
                  label="Skills"
                  endContent={<Badge label={selectedSkills.length} />}
                />
                <Tab
                  value="memory"
                  label="Memory"
                  endContent={<Badge label={memories.length} />}
                />
                <Tab
                  value="connections"
                  label="Connections"
                  endContent={<Badge label={connectedApps.length} />}
                />
              </TabList>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={isMobile ? 3 : 4}>
            <VStack width="100%" maxWidth={1120} gap={isMobile ? 4 : 3}>
            <Grid
              columns={isMobile ? 2 : isCompactDesktop ? 2 : 4}
              gap={3}>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text color="secondary">Model &amp; provider</Text>
                  <Heading level={5} maxLines={1}>
                    {agent.model || 'Default model'}
                  </Heading>
                  <Text color="secondary" maxLines={1}>
                    {agent.provider || 'PikRouter'}
                  </Text>
                </VStack>
              </Card>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text color="secondary">Primary role</Text>
                  <Heading level={5} maxLines={1}>
                    {primaryRoleName}
                  </Heading>
                  <Text color="secondary">
                    {roles.length} configured
                  </Text>
                </VStack>
              </Card>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text color="secondary">Skills</Text>
                  <Heading level={5}>{selectedSkills.length} enabled</Heading>
                  <Text color="secondary">
                    {allSkills.length} in library
                  </Text>
                </VStack>
              </Card>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text color="secondary">Memory &amp; apps</Text>
                  <Heading level={5}>{memories.length} memories</Heading>
                  <Text color="secondary">
                    {connectedApps.length} connected apps
                  </Text>
                </VStack>
              </Card>
            </Grid>

            {tab === 'personality' ? (
              <Grid columns={isMobile ? 1 : 2} gap={4}>
                <Card padding={4}>
                  <VStack gap={3}>
                    <Heading level={4}>Identity &amp; Voice</Heading>
                    <Grid columns={isMobile ? 1 : 2} gap={3}>
                      <TextInput
                        label="Display name"
                        value={name}
                        onChange={setName}
                        isRequired
                        width="100%"
                      />
                      <TextInput
                        label="Short tagline"
                        value={tagline}
                        onChange={setTagline}
                        placeholder="e.g. Executive research partner"
                        width="100%"
                      />
                    </Grid>
                    <TextArea
                      label="Summary description"
                      value={description}
                      onChange={setDescription}
                      rows={2}
                      placeholder="Short profile overview shown across your team."
                      width="100%"
                    />
                    <TextArea
                      label="Core instructions"
                      value={systemPrompt}
                      onChange={setSystemPrompt}
                      rows={3}
                      placeholder="Describe how this teammate works, thinks, and communicates."
                      width="100%"
                    />
                  </VStack>
                </Card>

                <VStack gap={isMobile ? 4 : 3}>
                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Behavior &amp; Style</Heading>
                      <Selector
                        label="Initiative level"
                        value={proactivity}
                        onChange={v =>
                          setProactivity(
                            v === 'proactive' || v === 'suggest'
                              ? v
                              : 'reactive',
                          )
                        }
                        options={[
                          {
                            value: 'reactive',
                            label: 'On request',
                            description: 'Complete asked tasks directly',
                          },
                          {
                            value: 'suggest',
                            label: 'Helpful suggestions',
                            description: 'Offer relevant follow-ups from evidence',
                          },
                          {
                            value: 'proactive',
                            label: 'Proactive partner',
                            description: 'Track deadlines and surface key updates',
                          },
                        ]}
                        width="100%"
                      />
                      <TextInput
                        label="Communication style"
                        value={communicationStyle}
                        onChange={setCommunicationStyle}
                        placeholder="e.g. Concise bullets, warm, direct"
                        width="100%"
                      />
                      <TextInput
                        label="Traits (comma separated)"
                        value={traitsText}
                        onChange={setTraitsText}
                        placeholder="e.g. methodical, analytical, concise"
                        width="100%"
                      />
                    </VStack>
                  </Card>

                  <Card padding={4}>
                    <VStack gap={3}>
                      <Heading level={4}>Permissions &amp; Host</Heading>
                      <Switch
                        label="Create and edit files"
                        description="Allow write_file and apply_edit in workspace"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={allowWrites}
                        onChange={setAllowWrites}
                      />
                      <Switch
                        label="Run shell commands"
                        description="Allow running builds, scripts, and checks"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={allowShell}
                        onChange={setAllowShell}
                      />
                      <Switch
                        label="Manage tools &amp; skills"
                        description="Allow adding skills, MCP servers, and apps"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={allowConfig}
                        onChange={setAllowConfig}
                      />
                      <Switch
                        label="Use host computer workspace"
                        description="Operate on local workspace instead of private VM"
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={useHostComputer}
                        onChange={setUseHostComputer}
                      />
                      <HStack gap={2} hAlign="end">
                        <Button
                          label={saving ? 'Saving…' : 'Save personality'}
                          variant="primary"
                          isDisabled={saving}
                          onClick={handleSavePersonality}
                        />
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>
              </Grid>
            ) : null}

            {tab === 'roles' ? (
              <VStack gap={4}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <VStack gap={0.5}>
                    <Heading level={4}>Responsibilities &amp; Roles</Heading>
                    <Text color="secondary">
                      Define focused hats this teammate wears without duplicating agents.
                    </Text>
                  </VStack>
                  <Button
                    label={saving ? 'Saving…' : 'Save roles'}
                    variant="primary"
                    size="sm"
                    isDisabled={saving}
                    onClick={handleSaveRoles}
                  />
                </HStack>

                {roles.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<AppIcon icon={Users} size="lg" color="secondary" />}
                    title="No custom roles yet"
                    description="Add a specialized responsibility below to shape this teammate's focus."
                  />
                ) : (
                  <Grid columns={isMobile ? 1 : 2} gap={3}>
                    {roles.map((role, idx) => {
                      const isPrimary = role.id === primaryRoleId;
                      return (
                        <Card key={role.id} padding={4}>
                          <VStack gap={3}>
                            <HStack vAlign="center" hAlign="between" gap={2}>
                              <HStack gap={2} vAlign="center">
                                <Heading level={5}>{role.name}</Heading>
                                {isPrimary ? (
                                  <Badge variant="info" label="Primary" />
                                ) : null}
                              </HStack>
                              <HStack gap={1}>
                                {!isPrimary ? (
                                  <Button
                                    label="Set primary"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPrimaryRoleId(role.id)}
                                  />
                                ) : null}
                                <IconButton
                                  label={`Remove ${role.name}`}
                                  variant="ghost"
                                  size="sm"
                                  icon={<AppIcon icon={Trash2} />}
                                  onClick={() => {
                                    const next = roles.filter(r => r.id !== role.id);
                                    setRoles(next);
                                    if (isPrimary) {
                                      setPrimaryRoleId(next[0]?.id || '');
                                    }
                                  }}
                                />
                              </HStack>
                            </HStack>
                            <TextArea
                              label="Responsibilities"
                              value={role.responsibilities}
                              rows={2}
                              width="100%"
                              onChange={val =>
                                setRoles(prev =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {...item, responsibilities: val}
                                      : item,
                                  ),
                                )
                              }
                            />
                          </VStack>
                        </Card>
                      );
                    })}
                  </Grid>
                )}

                <Card padding={4}>
                  <VStack gap={3}>
                    <Heading level={5}>Add role</Heading>
                    <Grid columns={isMobile ? 1 : 2} gap={3}>
                      <TextInput
                        label="Role name"
                        value={newRoleName}
                        onChange={setNewRoleName}
                        placeholder="e.g. Research Analyst"
                        width="100%"
                      />
                      <TextInput
                        label="Responsibilities"
                        value={newRoleResp}
                        onChange={setNewRoleResp}
                        placeholder="Verify sources and synthesize citations"
                        width="100%"
                      />
                    </Grid>
                    <HStack hAlign="end">
                      <Button
                        label="Add role"
                        variant="secondary"
                        size="sm"
                        icon={<AppIcon icon={Plus} />}
                        onClick={handleAddRole}
                      />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            ) : null}

            {tab === 'skills' ? (
              <VStack gap={4}>
                <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                  <StackItem size="fill">
                    <TextInput
                      label="Filter skills"
                      isLabelHidden
                      enterKeyHint="search"
                      startIcon="search"
                      hasClear
                      placeholder="Filter available skills…"
                      value={skillQuery}
                      onChange={setSkillQuery}
                      width="100%"
                    />
                  </StackItem>
                  <Button
                    label={saving ? 'Saving…' : 'Save skills'}
                    variant="primary"
                    size="sm"
                    isDisabled={saving}
                    onClick={handleSaveSkills}
                  />
                </HStack>

                {filteredSkills.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<AppIcon icon={Sparkles} size="lg" color="secondary" />}
                    title="No skills found"
                    description="Create skills in Settings → Skills, or clear your filter."
                  />
                ) : (
                  <Grid
                    columns={isMobile ? 1 : {minWidth: 230, max: 3}}
                    gap={3}>
                    {filteredSkills.map(skill => {
                      const checked = selectedSkills.includes(skill.name);
                      return (
                        <Card key={skill.name} padding={3}>
                          <CheckboxInput
                            label={skill.name}
                            description={skill.description || 'Reusable skill'}
                            value={checked}
                            onChange={next =>
                              setSelectedSkills(prev =>
                                next
                                  ? [...new Set([...prev, skill.name])]
                                  : prev.filter(s => s !== skill.name),
                              )
                            }
                            width="100%"
                          />
                        </Card>
                      );
                    })}
                  </Grid>
                )}
              </VStack>
            ) : null}

            {tab === 'memory' ? (
              <VStack gap={4}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <StackItem size="fill">
                    <TextInput
                      label="Search memory"
                      isLabelHidden
                      type="search"
                      startIcon="search"
                      hasClear
                      placeholder="Search memories…"
                      value={memoryQuery}
                      onChange={val => {
                        setMemoryQuery(val);
                        void loadMemories(val);
                      }}
                      width="100%"
                    />
                  </StackItem>
                  <HStack gap={2}>
                    <Button
                      label="Refresh"
                      variant="secondary"
                      size="sm"
                      icon={<AppIcon icon={RefreshCw} />}
                      isLoading={memoryLoading}
                      onClick={() => void loadMemories(memoryQuery)}
                    />
                    {memories.length > 0 ? (
                      <Button
                        label="Clear all"
                        variant="destructive"
                        size="sm"
                        icon={<AppIcon icon={Trash2} />}
                        onClick={() => void handleClearMemory()}
                      />
                    ) : null}
                  </HStack>
                </HStack>

                {memories.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<AppIcon icon={Layers} size="lg" color="secondary" />}
                    title="No saved memories yet"
                    description="As you collaborate, key facts and preferences appear here for review or correction."
                  />
                ) : (
                  <Grid columns={isMobile ? 1 : 2} gap={4}>
                    <Card padding={3}>
                      <List density="balanced" hasDividers>
                        {memories.map(entry => (
                          <ListItem
                            key={entry.id}
                            label={entry.claim}
                            description={`${entry.type || 'fact'} · ${Math.round(
                              (entry.confidence ?? 0.5) * 100,
                            )}% confidence`}
                            isSelected={selectedMemoryId === entry.id}
                            onClick={() => void selectMemory(entry)}
                          />
                        ))}
                      </List>
                    </Card>

                    <Card padding={4}>
                      {!selectedMemoryId ? (
                        <EmptyState
                          isCompact
                          icon={
                            <AppIcon icon={Layers} size="lg" color="secondary" />
                          }
                          title="Select a memory"
                          description="Inspect provenance, edit inaccuracies, or archive an entry."
                        />
                      ) : (
                        <VStack gap={3}>
                          <Heading level={5}>Memory details</Heading>
                          <TextArea
                            label="Stored statement"
                            value={memoryDraft}
                            onChange={setMemoryDraft}
                            rows={4}
                            width="100%"
                          />
                          {memoryDetail?.entry?.source ? (
                            <Text color="secondary">
                              Source: {memoryDetail.entry.source}
                            </Text>
                          ) : null}
                          <HStack gap={2} hAlign="between" wrap="wrap">
                            <Button
                              label="Archive"
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                void handleArchiveMemory(selectedMemoryId)
                              }
                            />
                            <Button
                              label="Save correction"
                              variant="primary"
                              size="sm"
                              onClick={() => void handleSaveMemoryCorrection()}
                            />
                          </HStack>
                        </VStack>
                      )}
                    </Card>
                  </Grid>
                )}
              </VStack>
            ) : null}

            {tab === 'connections' ? (
              <VStack gap={4}>
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <VStack gap={0.5}>
                    <Heading level={4}>Connected Apps &amp; Mail</Heading>
                    <Text color="secondary">
                      Services authorized specifically for {agent.name}.
                    </Text>
                  </VStack>
                  <HStack gap={2}>
                    <Button
                      label="Refresh"
                      variant="secondary"
                      size="sm"
                      icon={<AppIcon icon={RefreshCw} />}
                      isLoading={appsLoading}
                      onClick={() => void loadConnectedApps()}
                    />
                    <Button
                      label="Connect apps"
                      variant="primary"
                      size="sm"
                      icon={<AppIcon icon={Link2} />}
                      onClick={() => {
                        onClose();
                        host?.openConnections(agent.id);
                      }}
                    />
                  </HStack>
                </HStack>

                {connectedApps.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<AppIcon icon={Link2} size="lg" color="secondary" />}
                    title={
                      appsConfigured
                        ? 'No apps connected to this teammate'
                        : 'App integrations need configuration'
                    }
                    description="Grant scoped access to mail, calendar, or external tools."
                    actions={
                      <Button
                        label="Open connection manager"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onClose();
                          host?.openConnections(agent.id);
                        }}
                      />
                    }
                  />
                ) : (
                  <Grid columns={isMobile ? 1 : 2} gap={3}>
                    {connectedApps.map(acc => (
                      <Card key={acc.id} padding={3}>
                        <HStack vAlign="center" hAlign="between" gap={2}>
                          <VStack gap={0.5}>
                            <Heading level={5}>{acc.toolkit}</Heading>
                            <Text color="secondary">
                              {acc.email || acc.label || acc.status || 'Active'}
                            </Text>
                          </VStack>
                          <Button
                            label="Disconnect"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDisconnectApp(acc.id)}
                          />
                        </HStack>
                      </Card>
                    ))}
                  </Grid>
                )}
              </VStack>
            ) : null}
            </VStack>
          </LayoutContent>
        }
      />
    </VStack>
  );
}
