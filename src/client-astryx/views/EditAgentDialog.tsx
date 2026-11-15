import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useEffect, useMemo, useState} from 'react';
import {
  getHostBridge,
  type AppSkill,
  type CloudServer,
  type CoworkAgent,
  type CoworkTemplate,
} from '../bridge';
import {AppIcon, Sparkles, Trash2} from '../components/AppIcons';
import {PlushPortrait} from '../components/PlushPortrait';

export function EditAgentDialog({
  isOpen,
  agent,
  allSkills,
  cloudServers,
  onClose,
  onSaved,
  onDeleted,
}: {
  isOpen: boolean;
  agent: CoworkAgent | null;
  allSkills: AppSkill[];
  cloudServers: CloudServer[];
  onClose: () => void;
  onSaved: (agent: CoworkAgent, isNew: boolean) => void;
  onDeleted: () => void;
}) {
  const host = getHostBridge();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const constants = host?.getConstants() ?? {
    shapes: ['dot-orb'],
    characterNames: {'dot-orb': 'Orb'},
    characterPalette: [],
    templates: [],
  };
  const isEdit = Boolean(agent?.id);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [shape, setShape] = useState('dot-orb');
  const [color, setColor] = useState('');
  const [provider, setProvider] = useState('pikrouter');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [chiefOfStaff, setChiefOfStaff] = useState(false);
  const [allowShell, setAllowShell] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [allowConfig, setAllowConfig] = useState(false);
  const [computerMode, setComputerMode] = useState<'local' | 'cloud' | 'private'>(
    'local',
  );
  const [cloudConnectionId, setCloudConnectionId] = useState('');
  const [skills, setSkills] = useState<string[]>(['browser-workflow']);
  const [saving, setSaving] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const state = host?.getState();
    const selParts = (state?.sel?.model || '').split('::');
    const hasPikrouter = (state?.models || []).some(p => p?.id === 'pikrouter');
    setName(agent?.name || '');
    setTagline(agent?.tagline || '');
    setDescription(agent?.description || '');
    setSystemPrompt(agent?.systemPrompt || '');
    setShape(agent?.avatar?.shape || 'dot-orb');
    setColor(
      agent?.avatar?.color ||
        host?.getCharacterColor(agent?.avatar) ||
        constants.characterPalette[0]?.[1] ||
        '',
    );
    setProvider(
      agent ? agent.provider || '' : hasPikrouter ? 'pikrouter' : selParts[0] || '',
    );
    setModel(agent ? agent.model || '' : selParts.slice(1).join('::'));
    setEffort(agent?.effort || '');
    setChiefOfStaff(Boolean(agent?.chiefOfStaff));
    setAllowShell(Boolean(agent?.allowShell));
    setAllowWrites(Boolean(agent?.allowWrites));
    setAllowConfig(Boolean(agent?.allowConfig));
    setComputerMode(
      agent?.cloudConnectionId
        ? 'cloud'
        : agent && agent.useHostComputer === false
          ? 'private'
          : 'local',
    );
    setCloudConnectionId(agent?.cloudConnectionId || '');
    setSkills(
      agent?.skills ? [...agent.skills] : ['browser-workflow'],
    );
    host
      ?.loadModelCatalog()
      .then(() => setCatalogTick(t => t + 1))
      .catch(() => {});
  }, [isOpen, agent]);

  const providerOptions = useMemo(() => {
    const raw = host?.getState()?.models || [];
    const pik = raw.filter(p => p?.id === 'pikrouter');
    const source = pik.length ? pik : raw;
    return [
      {value: '', label: 'Server default'},
      ...source.map(p => ({value: p.id, label: p.label || p.id})),
    ];
  }, [host, catalogTick]);

  const modelOptions = useMemo(() => {
    const groups = provider ? host?.catalogModelGroups(provider, '') || [] : [];
    const list = groups[0]?.models || [];
    const opts = [
      {value: '', label: 'Provider default'},
      ...list.map(m => ({value: m.id, label: m.label || m.id})),
    ];
    if (model && !list.some(m => m.id === model)) {
      opts.splice(1, 0, {
        value: model,
        label: `${model} (current)`,
      });
    }
    return opts;
  }, [host, provider, model, catalogTick]);

  const applyTemplate = (tpl: CoworkTemplate) => {
    setSystemPrompt(tpl.prompt || '');
    if (tpl.name && !name.trim()) setName(tpl.name);
    if (tpl.tagline) setTagline(tpl.tagline);
    if (tpl.description) setDescription(tpl.description);
    if (tpl.shape) setShape(tpl.shape);
    if (tpl.color) setColor(tpl.color);
    if (typeof tpl.allowShell === 'boolean') setAllowShell(tpl.allowShell);
    if (typeof tpl.allowWrites === 'boolean') setAllowWrites(tpl.allowWrites);
    if (typeof tpl.allowConfig === 'boolean') setAllowConfig(tpl.allowConfig);
    setChiefOfStaff(Boolean(tpl.chiefOfStaff));
    if (Array.isArray(tpl.skills)) setSkills([...tpl.skills]);
  };

  const handleCreateAllPikpam = async () => {
    if (!host || creatingTeam) return;
    const templates = constants.templates || [];
    if (!templates.length) return;
    setCreatingTeam(true);
    try {
      const existingNames = new Set(
        (host.ensureCowork().agents || []).map(a =>
          (a.name || '').trim().toLowerCase(),
        ),
      );
      let created = 0;
      for (const tpl of templates) {
        if (existingNames.has(tpl.name.trim().toLowerCase())) continue;
        await host.api('/api/cowork/agents', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            name: tpl.name,
            tagline: tpl.tagline,
            description: tpl.description,
            systemPrompt: tpl.prompt,
            avatar: {shape: tpl.shape, color: tpl.color},
            chiefOfStaff: Boolean(tpl.chiefOfStaff),
            allowShell: Boolean(tpl.allowShell),
            allowWrites: Boolean(tpl.allowWrites),
            allowConfig: Boolean(tpl.allowConfig),
            useHostComputer: tpl.useHostComputer !== false,
            skills: tpl.skills || [],
          }),
        });
        created++;
      }
      host.refreshCowork(true);
      host.toast(
        created > 0
          ? `Added ${created} Pikpam specialist${created === 1 ? '' : 's'} to your team`
          : 'All 10 Pikpam specialists are already on your team',
      );
      onClose();
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not create team',
        true,
      );
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleSave = async () => {
    if (!host) return;
    if (!name.trim()) {
      host.toast('Please enter a name for this teammate', true);
      return;
    }
    if (computerMode === 'cloud' && !cloudConnectionId) {
      host.toast('Choose a saved cloud server or add one first.', true);
      return;
    }
    setSaving(true);
    try {
      const result = await host.api<{agent: CoworkAgent; conversation?: unknown}>(
        '/api/cowork/agents',
        {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            id: isEdit ? agent?.id : undefined,
            name: name.trim(),
            avatar: {shape, color},
            tagline,
            description,
            systemPrompt,
            provider,
            model,
            effort,
            skills,
            allowShell,
            allowWrites,
            allowConfig,
            useHostComputer: computerMode === 'local',
            cloudConnectionId: computerMode === 'cloud' ? cloudConnectionId : '',
            chiefOfStaff,
          }),
        },
      );
      onSaved(result.agent, !isEdit);
      onClose();
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not save teammate',
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!host || !agent?.id) return;
    if (!window.confirm(`Delete ${agent.name}?`)) return;
    setSaving(true);
    try {
      await host.api(`/api/cowork/agents/${encodeURIComponent(agent.id)}`, {
        method: 'DELETE',
      });
      onDeleted();
      onClose();
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not delete teammate',
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      purpose="form"
      width={780}
      maxHeight="88dvh"
      padding={isMobile ? 4 : 5}>
      <Layout
        header={
          <DialogHeader
            hasDivider
            title={isEdit ? 'Edit teammate' : 'New teammate'}
            subtitle="Configure identity, model routing, and tool permissions"
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={5}>
              {!isEdit && constants.templates.length > 0 ? (
                <Section padding={4}>
                  <VStack gap={3}>
                    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                      <VStack gap={0.5}>
                        <Heading level={4}>Pikpam Ready-Made Agents</Heading>
                        <Text type="supporting" color="secondary">
                          Pick a specialist template or spin up the full team.
                        </Text>
                      </VStack>
                      <Button
                        label="Create all 10 agents"
                        variant="secondary"
                        size="sm"
                        isLoading={creatingTeam}
                        icon={<AppIcon icon={Sparkles} />}
                        onClick={() => void handleCreateAllPikpam()}
                      />
                    </HStack>
                    <Grid
                      columns={isMobile ? 2 : {minWidth: 132, max: 5}}
                      gap={2}>
                      {constants.templates.map(tpl => (
                        <ClickableCard
                          key={tpl.label}
                          label={`Use ${tpl.name} template`}
                          padding={2}
                          onClick={() => applyTemplate(tpl)}>
                          <VStack gap={0.5}>
                            <Text type="label" weight="semibold" maxLines={1}>
                              {tpl.name}
                            </Text>
                            <Text
                              type="supporting"
                              color="secondary"
                              maxLines={1}>
                              {tpl.tagline || tpl.label}
                            </Text>
                          </VStack>
                        </ClickableCard>
                      ))}
                    </Grid>
                  </VStack>
                </Section>
              ) : null}

              <VStack gap={3}>
                <Heading level={4}>Identity &amp; personality</Heading>
                <Grid columns={isMobile ? 1 : 2} gap={3}>
                  <TextInput
                    label="Display name"
                    isRequired
                    value={name}
                    onChange={setName}
                    placeholder="e.g. Atlas, Vera, Rex…"
                    width="100%"
                  />
                  <TextInput
                    label="Role / tagline"
                    value={tagline}
                    onChange={setTagline}
                    placeholder="Backend engineer"
                    width="100%"
                  />
                  <GridSpan columns={isMobile ? 1 : 2}>
                    <TextArea
                      label="Description"
                      value={description}
                      onChange={setDescription}
                      rows={2}
                      placeholder="What will this teammate help you with?"
                      width="100%"
                    />
                  </GridSpan>
                  <GridSpan columns={isMobile ? 1 : 2}>
                    <TextArea
                      label="System prompt"
                      value={systemPrompt}
                      onChange={setSystemPrompt}
                      rows={4}
                      placeholder="Who is this agent, and how does it think and answer?"
                      width="100%"
                    />
                  </GridSpan>
                </Grid>
              </VStack>

              <Section padding={4}>
                <VStack gap={3}>
                  <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                    <HStack gap={3} vAlign="center">
                      <PlushPortrait
                        avatar={{shape, color}}
                        name={name || 'Teammate'}
                        size={48}
                      />
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          {constants.characterNames[shape] || 'Character'}
                        </Text>
                        <Text type="supporting" color="secondary">
                          Plush avatar and accent highlight in Cowork
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      {constants.characterPalette.map(([label, hex]) => (
                        <button
                          key={hex}
                          type="button"
                          className="gitu-astryx-swatch"
                          style={{backgroundColor: hex}}
                          aria-label={`${label} character color`}
                          aria-pressed={color === hex}
                          title={label}
                          onClick={() => setColor(hex)}
                        />
                      ))}
                    </HStack>
                  </HStack>
                  <Grid columns={isMobile ? 3 : 6} gap={2}>
                    {constants.shapes.map(s => {
                      const selected = s === shape;
                      return (
                        <ClickableCard
                          key={s}
                          label={`Choose ${constants.characterNames[s] || s}`}
                          padding={2}
                          variant={selected ? 'muted' : 'default'}
                          onClick={() => setShape(s)}>
                          <VStack gap={1} hAlign="center">
                            <PlushPortrait
                              avatar={{
                                shape: s,
                                color: selected ? color : undefined,
                              }}
                              name={constants.characterNames[s] || s}
                              size={36}
                            />
                            <Text type="supporting" maxLines={1}>
                              {constants.characterNames[s] || s}
                            </Text>
                          </VStack>
                        </ClickableCard>
                      );
                    })}
                  </Grid>
                </VStack>
              </Section>

              <VStack gap={3}>
                <Heading level={4}>Model &amp; compute</Heading>
                <Grid columns={isMobile ? 1 : 2} gap={3}>
                  <Selector
                    label="Model provider"
                    value={provider}
                    onChange={val => {
                      setProvider(val);
                      setModel('');
                    }}
                    options={providerOptions}
                    width="100%"
                  />
                  <Selector
                    label="Model"
                    hasSearch
                    searchPlaceholder="Filter models…"
                    value={model}
                    onChange={setModel}
                    options={modelOptions}
                    width="100%"
                  />
                  <Selector
                    label="Reasoning effort"
                    value={effort}
                    onChange={setEffort}
                    options={[
                      {value: '', label: 'Default'},
                      {value: 'low', label: 'Low'},
                      {value: 'medium', label: 'Medium'},
                      {value: 'high', label: 'High'},
                      {value: 'max', label: 'Max'},
                    ]}
                    width="100%"
                  />
                  <Selector
                    label="Computer"
                    value={computerMode}
                    onChange={val =>
                      setComputerMode(val as 'local' | 'cloud' | 'private')
                    }
                    options={[
                      {value: 'local', label: 'My computer'},
                      {value: 'cloud', label: 'Cloud computer'},
                      {
                        value: 'private',
                        label: 'Private desktop on this computer',
                      },
                    ]}
                    width="100%"
                  />
                </Grid>

                {computerMode === 'cloud' ? (
                  <HStack gap={2} vAlign="end" wrap="wrap">
                    <StackItem size="fill">
                      <Selector
                        label="Cloud server"
                        value={cloudConnectionId}
                        onChange={setCloudConnectionId}
                        placeholder="Choose a server…"
                        options={cloudServers.map(s => ({
                          value: s.id,
                          label: `${s.label} · ${s.host}${!s.hasCredential ? ' (reconnect required)' : ''}`,
                          disabled: !s.hasCredential,
                        }))}
                        width="100%"
                      />
                    </StackItem>
                    <Button
                      label="Add cloud server"
                      variant="secondary"
                      onClick={() =>
                        host?.openCloudServerModal(server => {
                          setCloudConnectionId(server.id);
                        })
                      }
                    />
                  </HStack>
                ) : null}
              </VStack>

              <VStack gap={3}>
                <Heading level={4}>Permissions</Heading>
                <Grid columns={isMobile ? 1 : 2} gap={3}>
                  <Switch
                    label="Chief of staff"
                    description="Preselect in new group conversations"
                    value={chiefOfStaff}
                    onChange={setChiefOfStaff}
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                  />
                  <Switch
                    label="Allow shell commands"
                    description="Permit run_command execution"
                    value={allowShell}
                    onChange={setAllowShell}
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                  />
                  <Switch
                    label="Allow file writes"
                    description="Create and edit project files"
                    value={allowWrites}
                    onChange={setAllowWrites}
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                  />
                  <Switch
                    label="Allow tool setup"
                    description="Manage MCP servers, skills, and apps"
                    value={allowConfig}
                    onChange={setAllowConfig}
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                  />
                </Grid>
              </VStack>

              {allSkills.length > 0 ? (
                <VStack gap={3}>
                  <Heading level={4}>Shared skills</Heading>
                  <Grid columns={isMobile ? 2 : 3} gap={2}>
                    {allSkills.map(sk => {
                      const checked = skills.includes(sk.name);
                      return (
                        <CheckboxInput
                          key={sk.name}
                          label={sk.name}
                          value={checked}
                          onChange={next => {
                            setSkills(prev =>
                              next
                                ? Array.from(new Set([...prev, sk.name]))
                                : prev.filter(item => item !== sk.name),
                            );
                          }}
                        />
                      );
                    })}
                  </Grid>
                </VStack>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack hAlign="between" vAlign="center" width="100%">
              <StackItem>
                {isEdit ? (
                  <Button
                    label="Delete"
                    variant="destructive"
                    icon={<AppIcon icon={Trash2} />}
                    isDisabled={saving}
                    onClick={() => void handleDelete()}
                  />
                ) : null}
              </StackItem>
              <HStack gap={2}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  isDisabled={saving}
                  onClick={onClose}
                />
                <Button
                  label={isEdit ? 'Save changes' : 'Create teammate'}
                  variant="primary"
                  isLoading={saving}
                  onClick={() => void handleSave()}
                />
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
