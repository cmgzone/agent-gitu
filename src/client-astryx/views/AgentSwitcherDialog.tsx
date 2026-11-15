import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {HStack, Layout, LayoutContent, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useMemo, useState} from 'react';
import type {CoworkAgent} from '../bridge';
import {AppIcon, Plus, Users} from '../components/AppIcons';
import {PlushPortrait} from '../components/PlushPortrait';

export function AgentSwitcherDialog({
  isOpen,
  agents,
  activeAgentId,
  onClose,
  onSelect,
  onCreateAgent,
}: {
  isOpen: boolean;
  agents: CoworkAgent[];
  activeAgentId?: string;
  onClose: () => void;
  onSelect: (agentId: string) => void;
  onCreateAgent: () => void;
}) {
  const [query, setQuery] = useState('');
  const isMobile = useMediaQuery('(max-width: 640px)');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(agent =>
      `${agent.name} ${agent.tagline || ''}`.toLowerCase().includes(q),
    );
  }, [agents, query]);

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
              <Button
                label="New"
                variant="primary"
                size="sm"
                icon={<AppIcon icon={Plus} />}
                onClick={() => {
                  onClose();
                  onCreateAgent();
                }}
              />
            }
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
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
                  columns={isMobile ? 2 : {minWidth: 168, max: 4}}
                  gap={3}>
                  {filtered.map(agent => {
                    const isActive = agent.id === activeAgentId;
                    return (
                      <ClickableCard
                        key={agent.id}
                        label={`Switch to ${agent.name}`}
                        padding={3}
                        variant={isActive ? 'muted' : 'default'}
                        onClick={() => onSelect(agent.id)}>
                        <VStack gap={2} hAlign="center">
                          <PlushPortrait
                            avatar={agent.avatar}
                            name={agent.name}
                            size={48}
                          />
                          <VStack gap={0.5} hAlign="center">
                            <HStack gap={1.5} vAlign="center" wrap="wrap">
                              <Heading level={5} maxLines={1} justify="center">
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
                                maxLines={1}
                                justify="center">
                                {agent.tagline}
                              </Text>
                            ) : null}
                          </VStack>
                        </VStack>
                      </ClickableCard>
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
