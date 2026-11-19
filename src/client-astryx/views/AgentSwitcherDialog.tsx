import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {CoworkAgent} from '../bridge';
import {AppIcon, Plus, Trash2, Users} from '../components/AppIcons';
import {PlushPortrait} from '../components/PlushPortrait';

export function AgentSwitcherDialog({
  isOpen,
  agents,
  activeAgentId,
  onClose,
  onSelect,
  onCreateAgent,
  onDeleteAgent,
  onDeleteAllAgents,
}: {
  isOpen: boolean;
  agents: CoworkAgent[];
  activeAgentId?: string;
  onClose: () => void;
  onSelect: (agentId: string) => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agent: CoworkAgent) => Promise<void>;
  onDeleteAllAgents: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [armedId, setArmedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    if (!isOpen || agents.length === 0) {
      setArmedId(null);
      setConfirmDeleteAll(false);
    }
  }, [isOpen, agents.length]);

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(agent =>
      `${agent.name} ${agent.tagline || ''}`.toLowerCase().includes(q),
    );
  }, [agents, query]);

  const armDelete = (agentId: string) => {
    setConfirmDeleteAll(false);
    setArmedId(agentId);
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = window.setTimeout(() => {
      setArmedId(current => (current === agentId ? null : current));
    }, 3000);
  };

  const handleQuickDelete = async (agent: CoworkAgent) => {
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    setDeletingId(agent.id);
    try {
      await onDeleteAgent(agent);
      setArmedId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await onDeleteAllAgents();
      setConfirmDeleteAll(false);
      setArmedId(null);
      setQuery('');
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      purpose="info"
      width={760}
      maxHeight="85dvh"
      padding={isMobile ? 4 : 5}>
      <Layout
        header={
          <DialogHeader
            hasDivider
            title="Agents"
            subtitle={`${agents.length} teammate${agents.length === 1 ? '' : 's'}`}
            onOpenChange={() => onClose()}
            endContent={
              <HStack gap={2} vAlign="center">
                {agents.length > 0 ? (
                  <Button
                    label="Delete all"
                    variant={confirmDeleteAll ? 'destructive' : 'ghost'}
                    size="sm"
                    icon={<AppIcon icon={Trash2} />}
                    isDisabled={deletingAll || deletingId !== null}
                    onClick={() => {
                      setArmedId(null);
                      setConfirmDeleteAll(prev => !prev);
                    }}
                  />
                ) : null}
                <Button
                  label="New"
                  variant="primary"
                  size="sm"
                  icon={<AppIcon icon={Plus} />}
                  isDisabled={deletingAll}
                  onClick={() => {
                    onClose();
                    onCreateAgent();
                  }}
                />
              </HStack>
            }
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {confirmDeleteAll && agents.length > 0 ? (
                <Banner
                  status="warning"
                  title={`Delete all ${agents.length} teammate${agents.length === 1 ? '' : 's'}?`}
                  description="This removes all agent profiles, DM conversations, and saved agent memories. You can create new agents anytime."
                  endContent={
                    <HStack gap={2} vAlign="center">
                      <Button
                        label="Cancel"
                        variant="secondary"
                        size="sm"
                        isDisabled={deletingAll}
                        onClick={() => setConfirmDeleteAll(false)}
                      />
                      <Button
                        label={`Delete all (${agents.length})`}
                        variant="destructive"
                        size="sm"
                        icon={<AppIcon icon={Trash2} />}
                        isLoading={deletingAll}
                        onClick={() => void handleDeleteAll()}
                      />
                    </HStack>
                  }
                />
              ) : null}

              <TextInput
                label="Search teammates"
                isLabelHidden
                enterKeyHint="search"
                startIcon="search"
                hasClear
                hasAutoFocus={!isMobile}
                placeholder="Search agents…"
                value={query}
                onChange={setQuery}
                width="100%"
              />

              {filtered.length === 0 ? (
                <EmptyState
                  isCompact
                  icon={<AppIcon icon={Users} size="lg" color="secondary" />}
                  title={
                    agents.length === 0
                      ? 'No teammates yet'
                      : 'No matching teammates'
                  }
                  description={
                    agents.length === 0
                      ? 'Create a teammate to start collaborating in Cowork.'
                      : 'Try a different name or role, or clear your search.'
                  }
                  actions={
                    agents.length === 0 ? (
                      <Button
                        label="Create teammate"
                        variant="primary"
                        onClick={() => {
                          onClose();
                          onCreateAgent();
                        }}
                      />
                    ) : (
                      <Button
                        label="Clear search"
                        variant="secondary"
                        onClick={() => setQuery('')}
                      />
                    )
                  }
                />
              ) : (
                <Grid
                  columns={isMobile ? 1 : {minWidth: 210, max: 3}}
                  gap={3}>
                  {filtered.map(agent => {
                    const isActive = agent.id === activeAgentId;
                    const isArmed = armedId === agent.id;
                    const isDeleting = deletingId === agent.id;
                    return (
                      <Card
                        key={agent.id}
                        padding={3}
                        variant={isActive ? 'muted' : 'default'}>
                        <VStack gap={3}>
                          <HStack gap={2.5} vAlign="center">
                            <StackItem size="static">
                              <PlushPortrait
                                avatar={agent.avatar}
                                name={agent.name}
                                size={42}
                              />
                            </StackItem>
                            <StackItem size="fill">
                              <VStack gap={0.5}>
                                <HStack gap={1.5} vAlign="center" wrap="wrap">
                                  <Heading level={5} maxLines={1}>
                                    {agent.name}
                                  </Heading>
                                  {isActive ? (
                                    <Badge variant="info" label="Active" />
                                  ) : null}
                                </HStack>
                                {agent.tagline ? (
                                  <Text
                                    type="supporting"
                                    color="secondary"
                                    maxLines={1}>
                                    {agent.tagline}
                                  </Text>
                                ) : null}
                              </VStack>
                            </StackItem>
                          </HStack>

                          <HStack gap={2} vAlign="center">
                            <StackItem size="fill">
                              <Button
                                label={isActive ? 'Open chat' : 'Switch'}
                                variant={isActive ? 'secondary' : 'ghost'}
                                size="sm"
                                width="100%"
                                isDisabled={deletingAll || isDeleting}
                                onClick={() => onSelect(agent.id)}
                              />
                            </StackItem>
                            <StackItem size="static">
                              {isArmed ? (
                                <Button
                                  label="Sure?"
                                  variant="destructive"
                                  size="sm"
                                  isLoading={isDeleting}
                                  isDisabled={deletingAll}
                                  onClick={() => void handleQuickDelete(agent)}
                                />
                              ) : (
                                <IconButton
                                  label={`Delete ${agent.name}`}
                                  tooltip={`Delete ${agent.name}`}
                                  variant="ghost"
                                  size="sm"
                                  isDisabled={deletingAll || deletingId !== null}
                                  icon={<AppIcon icon={Trash2} />}
                                  onClick={() => armDelete(agent.id)}
                                />
                              )}
                            </StackItem>
                          </HStack>
                        </VStack>
                      </Card>
                    );
                  })}
                </Grid>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
