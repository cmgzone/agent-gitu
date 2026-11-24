import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useCallback, useEffect, useState} from 'react';
import {getHostBridge} from '../bridge';
import {
  AppIcon,
  Check,
  Cloud,
  Folder,
  Link2,
  Monitor,
  Plus,
  RefreshCw,
  Trash2,
} from '../components/AppIcons';

interface LocalLinkPolicy {
  allowReadFiles: boolean;
  allowWrites: boolean;
  allowCommands: boolean;
  allowOpenUrl: boolean;
  allowAgentChat: boolean;
  allowedFolders: string[];
}

interface LocalLinkPeer {
  id: string;
  deviceName: string;
  online: boolean;
  createdAt: string;
  lastSeenAt?: string;
  connectedAt?: string;
  platform?: string;
  hostname?: string;
  sharedFolders?: string[];
}

interface LocalLinkClientStatus {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  cloudUrl?: string;
  peerId?: string;
  deviceName: string;
  lastConnectedAt?: string;
  lastError?: string;
  policy: LocalLinkPolicy;
  sharedFolders: string[];
}

interface LocalLinkStatusResponse {
  hub: {peers: LocalLinkPeer[]};
  client: LocalLinkClientStatus;
}

interface PairCodePayload {
  code: string;
  expiresAt: string;
  cloudUrl: string;
  bundle: string;
}

export function LocalLinkSection() {
  const host = getHostBridge();
  const isMobile = useMediaQuery('(max-width: 760px)');

  const [data, setData] = useState<LocalLinkStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [pairCode, setPairCode] = useState<PairCodePayload | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);
  const [testingPeerId, setTestingPeerId] = useState<string | null>(null);
  const [revokingPeerId, setRevokingPeerId] = useState<string | null>(null);

  const [connectInput, setConnectInput] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState('');

  const loadStatus = useCallback(
    async (quiet = false) => {
      if (!host) return;
      if (!quiet) setLoading(true);
      try {
        const res = await host.api<LocalLinkStatusResponse>(
          '/api/local-link/status',
        );
        setData(res);
        if (!quiet) setErrorMsg('');
      } catch (err) {
        if (!quiet) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Could not load Local PC Link status.',
          );
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [host],
  );

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  const handleGenerateCode = async () => {
    if (!host) return;
    setGeneratingCode(true);
    setErrorMsg('');
    setCopiedBundle(false);
    try {
      const res = await host.api<PairCodePayload & {ok?: boolean}>(
        '/api/local-link/pair-code',
        {method: 'POST', body: JSON.stringify({})},
      );
      setPairCode(res);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not generate link code.';
      setErrorMsg(msg);
      host.toast(msg, true);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyBundle = async () => {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(pairCode.bundle);
      setCopiedBundle(true);
      host?.toast('Direct link code copied');
    } catch {
      host?.toast('Select and copy the link code manually.', true);
    }
  };

  const handleTestPeer = async (peerId: string) => {
    if (!host) return;
    setTestingPeerId(peerId);
    try {
      const res = await host.api<{
        ok: boolean;
        latencyMs: number;
        output?: string;
        error?: string;
      }>('/api/local-link/test', {
        method: 'POST',
        body: JSON.stringify({peerId}),
      });
      if (res.ok) {
        host.toast(`PC responded directly in ${res.latencyMs} ms`);
      } else {
        host.toast(res.error || 'Local PC test failed.', true);
      }
      await loadStatus(true);
    } catch (err) {
      host.toast(err instanceof Error ? err.message : 'Test failed.', true);
    } finally {
      setTestingPeerId(null);
    }
  };

  const handleRevokePeer = async (peerId: string) => {
    if (!host) return;
    setRevokingPeerId(peerId);
    try {
      const res = await host.api<{hub: {peers: LocalLinkPeer[]}}>(
        `/api/local-link/peers/${encodeURIComponent(peerId)}`,
        {method: 'DELETE'},
      );
      setData(prev => (prev ? {...prev, hub: res.hub} : prev));
      host.toast('Local PC link revoked');
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not revoke link.',
        true,
      );
    } finally {
      setRevokingPeerId(null);
    }
  };

  const isBundleInput = connectInput
    .trim()
    .toLowerCase()
    .startsWith('gitu-link://');

  const handleConnect = async () => {
    if (!host) return;
    const raw = connectInput.trim();
    if (!raw) {
      setErrorMsg('Paste a gitu-link:// code or enter your Cloud Agent URL.');
      return;
    }
    setConnecting(true);
    setErrorMsg('');
    try {
      const payload = isBundleInput
        ? {
            bundle: raw,
            deviceName: deviceNameInput.trim() || undefined,
          }
        : {
            cloudUrl: raw,
            code: manualCode.trim(),
            deviceName: deviceNameInput.trim() || undefined,
          };
      const res = await host.api<{
        ok: boolean;
        error?: string;
        client: LocalLinkClientStatus;
      }>('/api/local-link/connect', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setData(prev =>
        prev
          ? {...prev, client: res.client}
          : {hub: {peers: []}, client: res.client},
      );
      setConnectInput('');
      setManualCode('');
      host.toast(
        res.client.connected
          ? 'Connected directly to Cloud Agent'
          : 'Paired with Cloud Agent (connecting...)',
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Direct connection failed.';
      setErrorMsg(msg);
      host.toast(msg, true);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!host) return;
    setDisconnecting(true);
    setErrorMsg('');
    try {
      const res = await host.api<{client: LocalLinkClientStatus}>(
        '/api/local-link/disconnect',
        {method: 'POST', body: JSON.stringify({clearConfig: true})},
      );
      setData(prev => (prev ? {...prev, client: res.client} : prev));
      host.toast('Disconnected from Cloud Agent');
    } catch (err) {
      host.toast(
        err instanceof Error ? err.message : 'Could not disconnect.',
        true,
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const patchPolicy = async (patch: Record<string, unknown>) => {
    if (!host) return;
    setSavingPolicy(true);
    setErrorMsg('');
    try {
      const res = await host.api<{client: LocalLinkClientStatus}>(
        '/api/local-link/policy',
        {method: 'PATCH', body: JSON.stringify(patch)},
      );
      setData(prev => (prev ? {...prev, client: res.client} : prev));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not update link policy.';
      setErrorMsg(msg);
      host.toast(msg, true);
    } finally {
      setSavingPolicy(false);
    }
  };

  const client = data?.client;
  const peers = data?.hub.peers ?? [];

  const handleAddFolder = async () => {
    const clean = newFolderPath.trim();
    if (!clean || !client) return;
    const nextFolders = [...client.policy.allowedFolders, clean];
    await patchPolicy({allowedFolders: nextFolders});
    setNewFolderPath('');
  };

  const handleRemoveFolder = async (folder: string) => {
    if (!client) return;
    const nextFolders = client.policy.allowedFolders.filter(f => f !== folder);
    await patchPolicy({allowedFolders: nextFolders});
  };

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
        <VStack gap={0.5}>
          <Heading level={4}>Direct Local PC Link</Heading>
          <Text color="secondary">
            Let your Cloud Agent talk directly to this PC over an outbound
            encrypted WebSocket — no Pikpam relay and no port forwarding.
          </Text>
        </VStack>
        <Button
          label="Refresh"
          variant="secondary"
          size="sm"
          icon={<AppIcon icon={RefreshCw} size="sm" />}
          isLoading={loading}
          onClick={() => void loadStatus(false)}
        />
      </HStack>

      {errorMsg ? (
        <Banner
          status="warning"
          title="Local PC Link notice"
          description={errorMsg}
        />
      ) : null}

      <Grid columns={isMobile ? 1 : 2} gap={4}>
        <Card padding={4}>
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <HStack gap={1.5} vAlign="center">
                <AppIcon icon={Cloud} size="sm" color="accent" />
                <Heading level={4}>Accept a Local PC (Cloud side)</Heading>
              </HStack>
              <Button
                label="Generate 5-minute link code"
                variant="primary"
                size="sm"
                icon={<AppIcon icon={Link2} size="sm" />}
                isLoading={generatingCode}
                onClick={() => void handleGenerateCode()}
              />
            </HStack>

            <Text color="secondary">
              Generate a one-time code on your Cloud Agent and paste it on your
              Local PC. Traffic flows directly between them.
            </Text>

            {pairCode ? (
              <Card variant="muted" padding={3}>
                <VStack gap={2}>
                  <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                    <Text type="label" weight="semibold">
                      One-time link code (expires in 5 minutes)
                    </Text>
                    <Button
                      label={copiedBundle ? 'Copied' : 'Copy link code'}
                      variant="secondary"
                      size="sm"
                      icon={
                        copiedBundle ? (
                          <AppIcon icon={Check} size="sm" />
                        ) : undefined
                      }
                      onClick={() => void handleCopyBundle()}
                    />
                  </HStack>
                  <Text type="code" size="sm">
                    {pairCode.bundle}
                  </Text>
                  <Text type="supporting" color="secondary">
                    Cloud URL: {pairCode.cloudUrl} · Code: {pairCode.code}
                  </Text>
                </VStack>
              </Card>
            ) : null}

            <Divider />

            <Heading level={5}>Linked Local PCs ({peers.length})</Heading>
            {peers.length === 0 ? (
              <EmptyState
                isCompact
                icon={<AppIcon icon={Monitor} size="md" color="secondary" />}
                title="No Local PCs linked"
                description="Generate a link code above, then paste it into Settings -> Local PC Link on your computer."
              />
            ) : (
              <VStack gap={2}>
                {peers.map(peer => (
                  <Card key={peer.id} variant="muted" padding={3}>
                    <VStack gap={2}>
                      <HStack
                        hAlign="between"
                        vAlign="center"
                        wrap="wrap"
                        gap={2}>
                        <HStack gap={2} vAlign="center">
                          <StatusDot
                            variant={peer.online ? 'success' : 'neutral'}
                            label={peer.online ? 'Online' : 'Offline'}
                          />
                          <VStack gap={0}>
                            <Heading level={5}>{peer.deviceName}</Heading>
                            <Text type="supporting" color="secondary">
                              {[peer.platform, peer.hostname]
                                .filter(Boolean)
                                .join(' · ') || peer.id}
                            </Text>
                          </VStack>
                        </HStack>

                        <HStack gap={1.5} vAlign="center">
                          <Text
                            type="code"
                            size="sm"
                            color={peer.online ? 'accent' : 'secondary'}>
                            {peer.online ? 'ONLINE' : 'OFFLINE'}
                          </Text>
                          <Button
                            label="Test"
                            variant="secondary"
                            size="sm"
                            isDisabled={!peer.online}
                            isLoading={testingPeerId === peer.id}
                            onClick={() => void handleTestPeer(peer.id)}
                          />
                          <Button
                            label="Revoke"
                            variant="ghost"
                            size="sm"
                            icon={<AppIcon icon={Trash2} size="sm" />}
                            isLoading={revokingPeerId === peer.id}
                            onClick={() => void handleRevokePeer(peer.id)}
                          />
                        </HStack>
                      </HStack>

                      {peer.sharedFolders && peer.sharedFolders.length > 0 ? (
                        <Text type="supporting" color="secondary">
                          Shared folders: {peer.sharedFolders.join(', ')}
                        </Text>
                      ) : null}
                    </VStack>
                  </Card>
                ))}
              </VStack>
            )}
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={3}>
            <HStack gap={1.5} vAlign="center">
              <AppIcon icon={Monitor} size="sm" color="accent" />
              <Heading level={4}>Connect this PC (Local side)</Heading>
            </HStack>

            {!client?.configured ? (
              <VStack gap={3}>
                <Text color="secondary">
                  Paste the link bundle generated on your Cloud Agent to open a
                  direct connection from this computer.
                </Text>

                <TextInput
                  label="Link code or Cloud Agent URL"
                  placeholder="gitu-link://v1?... or https://cloud-agent.example"
                  value={connectInput}
                  onChange={setConnectInput}
                  width="100%"
                />

                {connectInput.trim() && !isBundleInput ? (
                  <TextInput
                    label="One-time pairing code"
                    placeholder="XXXX-XXXX-..."
                    value={manualCode}
                    onChange={setManualCode}
                    width="100%"
                  />
                ) : null}

                <TextInput
                  label="PC label (optional)"
                  placeholder="Work Laptop"
                  value={deviceNameInput}
                  onChange={setDeviceNameInput}
                  width="100%"
                />

                <HStack gap={2}>
                  <Button
                    label="Connect directly"
                    variant="primary"
                    size="sm"
                    isLoading={connecting}
                    isDisabled={!connectInput.trim()}
                    onClick={() => void handleConnect()}
                  />
                </HStack>
              </VStack>
            ) : (
              <VStack gap={3}>
                <Card variant="muted" padding={3}>
                  <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                    <HStack gap={2} vAlign="center">
                      <StatusDot
                        variant={
                          client.connected
                            ? 'success'
                            : client.enabled
                              ? 'warning'
                              : 'neutral'
                        }
                        isPulsing={client.enabled && !client.connected}
                        label={
                          client.connected
                            ? 'Connected'
                            : client.enabled
                              ? 'Reconnecting'
                              : 'Paused'
                        }
                      />
                      <VStack gap={0}>
                        <Heading level={5}>
                          {client.connected
                            ? 'Connected to Cloud Agent'
                            : client.enabled
                              ? 'Connecting to Cloud Agent…'
                              : 'Direct link paused'}
                        </Heading>
                        <Text type="supporting" color="secondary">
                          {client.cloudUrl} · {client.deviceName}
                        </Text>
                      </VStack>
                    </HStack>
                    <Button
                      label="Disconnect & unlink"
                      variant="secondary"
                      size="sm"
                      isLoading={disconnecting}
                      onClick={() => void handleDisconnect()}
                    />
                  </HStack>
                </Card>

                {client.lastError ? (
                  <Banner
                    status="warning"
                    title="Connection notice"
                    description={client.lastError}
                  />
                ) : null}

                <Switch
                  label="Keep direct link active"
                  description="Maintain the outbound WebSocket to your Cloud Agent."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.enabled}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({enabled: val})}
                />

                <Divider />

                <Heading level={5}>What the Cloud Agent can do here</Heading>
                <Switch
                  label="Read & pull files from shared folders"
                  description="Fast direct list, read, search, and file pull with zero local LLM cost."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.policy.allowReadFiles}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({allowReadFiles: val})}
                />
                <Switch
                  label="Ask my Local Agent"
                  description="Allow Cloud Agent to send a prompt to your Local Agent when local reasoning is needed."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.policy.allowAgentChat}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({allowAgentChat: val})}
                />
                <Switch
                  label="Open web links on this PC"
                  description="Open http/https URLs in this computer's default browser."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.policy.allowOpenUrl}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({allowOpenUrl: val})}
                />
                <Switch
                  label="Write & drop files into shared folders"
                  description="Off by default. Lets Cloud Agent save files into your shared folders."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.policy.allowWrites}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({allowWrites: val})}
                />
                <Switch
                  label="Run local shell commands"
                  description="Off by default. Lets Cloud Agent execute bounded commands in shared folders."
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                  value={client.policy.allowCommands}
                  isDisabled={savingPolicy}
                  onChange={val => void patchPolicy({allowCommands: val})}
                />

                <Divider />

                <VStack gap={2}>
                  <HStack gap={1.5} vAlign="center">
                    <AppIcon icon={Folder} size="sm" color="secondary" />
                    <Heading level={5}>Shared local folders</Heading>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    Always shared: Agent Gitu workspace and your active selected
                    project. Private settings & credentials stay sealed.
                  </Text>

                  {client.policy.allowedFolders.length > 0 ? (
                    <VStack gap={1.5}>
                      {client.policy.allowedFolders.map(folder => (
                        <Card key={folder} variant="muted" padding={2}>
                          <HStack
                            hAlign="between"
                            vAlign="center"
                            gap={2}
                            wrap="wrap">
                            <Text type="code" size="sm">
                              {folder}
                            </Text>
                            <Button
                              label="Remove"
                              variant="ghost"
                              size="sm"
                              isDisabled={savingPolicy}
                              onClick={() => void handleRemoveFolder(folder)}
                            />
                          </HStack>
                        </Card>
                      ))}
                    </VStack>
                  ) : null}

                  <HStack gap={2} vAlign="end" wrap="wrap">
                    <StackItem size="fill">
                      <TextInput
                        label="Add folder path"
                        placeholder="C:\\Users\\me\\Documents\\Notes"
                        value={newFolderPath}
                        onChange={setNewFolderPath}
                        width="100%"
                      />
                    </StackItem>
                    <Button
                      label="Add"
                      variant="secondary"
                      size="sm"
                      icon={<AppIcon icon={Plus} size="sm" />}
                      isDisabled={savingPolicy || !newFolderPath.trim()}
                      onClick={() => void handleAddFolder()}
                    />
                  </HStack>
                </VStack>
              </VStack>
            )}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
