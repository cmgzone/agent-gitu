import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Switch} from '@astryxdesign/core/Switch';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  getHostBridge,
  type DesktopCloudBridge,
  type DesktopCloudInstance,
  type DesktopCloudState,
} from '../bridge';
import {
  AppIcon,
  ChevronLeft,
  Cloud,
  ExternalLink,
  Monitor,
  Plus,
  RefreshCw,
  Wallet,
} from '../components/AppIcons';

type DialogTab = 'agents' | 'buy';

function statusVariant(
  status: string,
): 'success' | 'warning' | 'accent' | 'neutral' {
  const normalized = status.toUpperCase();
  if (normalized === 'ACTIVE') return 'success';
  if (normalized === 'PROVISIONING' || normalized === 'QUEUED') return 'accent';
  if (normalized === 'SUSPENDED' || normalized === 'GRACE_PERIOD')
    return 'warning';
  return 'neutral';
}

export function CloudAgentDialog({
  isOpen,
  cloudBridge,
  onClose,
  onStatusChanged,
}: {
  isOpen: boolean;
  cloudBridge: DesktopCloudBridge | null;
  onClose: () => void;
  onStatusChanged: (next: DesktopCloudState) => void;
}) {
  const host = getHostBridge();
  const isMobile = useMediaQuery('(max-width: 640px)');

  const [tab, setTab] = useState<DialogTab>('agents');
  const [state, setState] = useState<DesktopCloudState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [switchingLocal, setSwitchingLocal] = useState(false);
  const [pendingConnectId, setPendingConnectId] = useState<string | null>(null);
  const [savingAutoConnect, setSavingAutoConnect] = useState(false);

  const [freeClaimName, setFreeClaimName] = useState('');
  const [claimingFree, setClaimingFree] = useState(false);

  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'WALLET' | 'PAYSTACK'>(
    'WALLET',
  );
  const [countryCode, setCountryCode] = useState('US');
  const [ordering, setOrdering] = useState(false);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [verifyingOrder, setVerifyingOrder] = useState(false);
  const pendingReferenceRef = useRef<string | null>(null);
  pendingReferenceRef.current = pendingReference;

  const syncRefresh = useCallback(
    async (quiet = false) => {
      if (!cloudBridge) return;
      if (!quiet) {
        setLoading(true);
        setErrorMsg('');
      }
      try {
        const next = await cloudBridge.refresh();
        setState(next);
        onStatusChanged(next);
        if (!selectedPlanId && next.plans && next.plans.length > 0) {
          const popular =
            next.plans.find(p => p.isPopular) || next.plans[0];
          if (popular) setSelectedPlanId(popular.id);
        }
      } catch (err) {
        if (!quiet) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Could not reach Pikpam Cloud right now.',
          );
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [cloudBridge, onStatusChanged, selectedPlanId],
  );

  useEffect(() => {
    if (isOpen && !pendingReferenceRef.current) {
      setTab('agents');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !cloudBridge) return;
    setErrorMsg('');
    void syncRefresh(false);
  }, [isOpen, cloudBridge, syncRefresh]);

  const handleConnect = useCallback(
    async (vpsId: string) => {
      if (!cloudBridge) return;
      setConnectingId(vpsId);
      setErrorMsg('');
      try {
        const res = await cloudBridge.connect(vpsId);
        if (!res.ok) {
          if (res.code === 'NOT_READY') {
            setPendingConnectId(vpsId);
            host?.toast(res.error || 'Still provisioning...');
          } else {
            setErrorMsg(res.error || 'Could not connect to this Cloud Agent.');
            host?.toast(
              res.error || 'Could not connect to this Cloud Agent.',
              true,
            );
          }
          return;
        }
        setPendingConnectId(null);
        onClose();
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Could not connect to this Cloud Agent.',
        );
      } finally {
        setConnectingId(null);
      }
    },
    [cloudBridge, host, onClose],
  );

  const hasProvisioning = Boolean(
    state?.instances?.some(
      inst => String(inst.status || '').toUpperCase() === 'PROVISIONING',
    ),
  );

  useEffect(() => {
    if (!isOpen || !cloudBridge || !state?.signedIn || !hasProvisioning) {
      return;
    }
    const timer = window.setInterval(() => {
      void syncRefresh(true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isOpen, cloudBridge, state?.signedIn, hasProvisioning, syncRefresh]);

  useEffect(() => {
    if (!isOpen || !pendingConnectId || !state?.instances) return;
    const ready = state.instances.find(
      inst =>
        inst.id === pendingConnectId &&
        String(inst.status || '').toUpperCase() === 'ACTIVE',
    );
    if (ready) {
      setPendingConnectId(null);
      void handleConnect(ready.id);
    }
  }, [isOpen, pendingConnectId, state?.instances, handleConnect]);

  const selectedPlan = useMemo(() => {
    const plans = state?.plans || [];
    return plans.find(p => p.id === selectedPlanId) || plans[0] || null;
  }, [state?.plans, selectedPlanId]);

  if (!cloudBridge) return null;

  const mode = state?.mode === 'cloud' ? 'cloud' : 'local';
  const activeCloudId = state?.activeCloud?.vpsId || null;
  const wallet = state?.wallet;
  const paidUsd = Number(wallet?.paidAvailableUsd ?? 0);
  const bonusCredits = Number(wallet?.bonusBalance ?? 0);
  const insufficientWalletForPlan = Boolean(
    paymentMethod === 'WALLET' &&
      selectedPlan &&
      paidUsd + 1e-6 < selectedPlan.priceUsd,
  );

  const handleSwitchLocal = async () => {
    setSwitchingLocal(true);
    setErrorMsg('');
    try {
      const res = await cloudBridge.switchToLocal();
      if (!res.ok) {
        setErrorMsg(res.error || 'Could not switch back to Local Agent.');
        return;
      }
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not switch back to Local Agent.',
      );
    } finally {
      setSwitchingLocal(false);
    }
  };

  const handleToggleAutoConnect = async (enabled: boolean) => {
    setSavingAutoConnect(true);
    try {
      const res = await cloudBridge.setAutoConnect(enabled);
      setState(prev =>
        prev
          ? {...prev, autoConnectCloud: Boolean(res.autoConnectCloud)}
          : prev,
      );
      host?.toast(
        enabled
          ? 'Desktop app will auto-connect to your Cloud Agent on launch'
          : 'Auto-connect on startup disabled',
      );
    } catch {
      host?.toast('Could not save startup preference.', true);
    } finally {
      setSavingAutoConnect(false);
    }
  };

  const handleClaimFree = async () => {
    setClaimingFree(true);
    setErrorMsg('');
    try {
      const res = await cloudBridge.claimFree({
        instanceName: freeClaimName.trim() || undefined,
      });
      if (!res.ok) {
        setErrorMsg(res.error || 'Could not claim free Cloud Agent.');
        host?.toast(res.error || 'Could not claim free Cloud Agent.', true);
        return;
      }
      if (res.state) {
        setState(res.state);
        onStatusChanged(res.state);
      }
      setFreeClaimName('');
      setTab('agents');
      host?.toast(
        'Free Cloud Agent claimed. It will connect automatically when ready.',
      );
      const newest = res.state?.instances?.[0];
      if (newest) setPendingConnectId(newest.id);
    } finally {
      setClaimingFree(false);
    }
  };

  const handleBuyCloud = async () => {
    if (!selectedPlan) return;
    setOrdering(true);
    setErrorMsg('');
    try {
      const res = await cloudBridge.buy({
        planId: selectedPlan.id,
        instanceName: instanceName.trim() || undefined,
        paymentMethod,
        countryCode: paymentMethod === 'PAYSTACK' ? countryCode : undefined,
      });
      if (!res.ok) {
        setErrorMsg(res.error || 'Cloud Agent order could not be placed.');
        host?.toast(
          res.error || 'Cloud Agent order could not be placed.',
          true,
        );
        return;
      }
      if (res.paymentMethod === 'PAYSTACK' && res.pendingPayment) {
        setPendingReference(res.reference || null);
        host?.toast(
          'Checkout opened in your browser. Verify payment once completed.',
        );
        return;
      }
      if (res.state) {
        setState(res.state);
        onStatusChanged(res.state);
      }
      setInstanceName('');
      setTab('agents');
      host?.toast(
        'Cloud Agent purchased. It will connect automatically once active.',
      );
      const newest = res.state?.instances?.[0];
      if (newest) {
        if (String(newest.status || '').toUpperCase() === 'ACTIVE') {
          void handleConnect(newest.id);
        } else {
          setPendingConnectId(newest.id);
        }
      }
    } finally {
      setOrdering(false);
    }
  };

  const handleVerifyOrder = async () => {
    if (!pendingReference) return;
    setVerifyingOrder(true);
    setErrorMsg('');
    try {
      const res = await cloudBridge.verifyOrder(pendingReference);
      if (!res.ok) {
        setErrorMsg(res.error || 'Payment is not verified yet.');
        return;
      }
      setPendingReference(null);
      if (res.state) {
        setState(res.state);
        onStatusChanged(res.state);
      }
      setTab('agents');
      host?.toast('Payment confirmed and Cloud Agent provisioning started.');
      const newest = res.state?.instances?.[0];
      if (newest) setPendingConnectId(newest.id);
    } finally {
      setVerifyingOrder(false);
    }
  };

  const handleOpenTopup = () => {
    void cloudBridge.openTopup();
    host?.toast('Opened Pikpam Wallet recharge in your browser.');
  };

  const renderInstanceRow = (inst: DesktopCloudInstance) => {
    const statusUpper = String(inst.status || '').toUpperCase();
    const isActive = statusUpper === 'ACTIVE';
    const isConnected = mode === 'cloud' && activeCloudId === inst.id;
    const isProvisioning = statusUpper === 'PROVISIONING';
    const isAutoQueued = pendingConnectId === inst.id;

    return (
      <Card
        key={inst.id}
        padding={3}
        variant={isConnected ? 'muted' : 'default'}>
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={statusVariant(statusUpper)}
                isPulsing={isProvisioning}
                label={statusUpper}
              />
              <VStack gap={0}>
                <Heading level={5}>{inst.name}</Heading>
                <Text type="supporting" color="secondary">
                  {inst.agentUrl || inst.customDomain || inst.domain || inst.plan}
                </Text>
              </VStack>
            </HStack>

            <HStack gap={2} vAlign="center">
              <Text type="code" size="sm" color="secondary">
                {isConnected ? 'CONNECTED' : statusUpper}
              </Text>
              {isConnected ? (
                <Button
                  label="Switch to Local"
                  variant="secondary"
                  size="sm"
                  isLoading={switchingLocal}
                  onClick={() => void handleSwitchLocal()}
                />
              ) : isActive ? (
                <Button
                  label="Connect"
                  variant="primary"
                  size="sm"
                  isLoading={connectingId === inst.id}
                  onClick={() => void handleConnect(inst.id)}
                />
              ) : isProvisioning ? (
                <Button
                  label={
                    isAutoQueued
                      ? 'Auto-connect queued'
                      : 'Auto-connect when ready'
                  }
                  variant={isAutoQueued ? 'secondary' : 'ghost'}
                  size="sm"
                  isDisabled={isAutoQueued}
                  onClick={() => setPendingConnectId(inst.id)}
                />
              ) : null}
            </HStack>
          </HStack>

          {inst.provisioning?.customerMessage && !isActive ? (
            <Text type="supporting" color="secondary">
              {inst.provisioning.customerMessage}
            </Text>
          ) : null}
        </VStack>
      </Card>
    );
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
            title="Local & Cloud Agent"
            subtitle="Desktop App · Automatic Pikpam Account Sync"
            onOpenChange={() => onClose()}
            endContent={
              <HStack gap={2} vAlign="center">
                <Button
                  label="Refresh"
                  variant="ghost"
                  size="sm"
                  icon={<AppIcon icon={RefreshCw} size="sm" />}
                  isLoading={loading}
                  onClick={() => void syncRefresh(false)}
                />
              </HStack>
            }
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {errorMsg ? (
                <Banner
                  status="warning"
                  title="Cloud Agent notice"
                  description={errorMsg}
                />
              ) : null}

              {!state?.signedIn ? (
                <EmptyState
                  isCompact
                  icon={<AppIcon icon={Cloud} size="lg" color="accent" />}
                  title={
                    state?.authExpired
                      ? 'Pikpam session expired'
                      : 'Connect your Pikpam account'
                  }
                  description="Sign in once with your Pikpam account so the Desktop App can discover your Cloud Agents, sign in automatically, or deploy a new Cloud VPS."
                  actions={
                    <HStack gap={2} wrap="wrap">
                      <Button
                        label="Continue with Pikpam"
                        variant="primary"
                        onClick={() => {
                          onClose();
                          host?.startOAuth();
                        }}
                      />
                      <Button
                        label="Refresh"
                        variant="secondary"
                        isLoading={loading}
                        onClick={() => void syncRefresh(false)}
                      />
                    </HStack>
                  }
                />
              ) : (
                <VStack gap={4}>
                  <Card variant="muted" padding={3}>
                    <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
                      <HStack gap={2} vAlign="center">
                        <AppIcon icon={Wallet} size="sm" color="accent" />
                        <VStack gap={0}>
                          <Text type="label" weight="semibold">
                            {state.user?.email || 'Pikpam Account Connected'}
                          </Text>
                          <Text type="supporting" color="secondary">
                            Spendable Wallet: ${paidUsd.toFixed(2)} USD · AI
                            Bonus Credits: {bonusCredits.toFixed(0)}
                          </Text>
                        </VStack>
                      </HStack>
                      <Button
                        label="Recharge wallet"
                        variant="secondary"
                        size="sm"
                        endContent={<AppIcon icon={ExternalLink} size="sm" />}
                        onClick={handleOpenTopup}
                      />
                    </HStack>
                  </Card>

                  <TabList
                    value={tab}
                    onChange={val => setTab(val as DialogTab)}
                    aria-label="Cloud Agent sections"
                    hasDivider>
                    <Tab
                      value="agents"
                      label={`My Agents (${(state.instances || []).length + 1})`}
                    />
                    <Tab value="buy" label="Buy Cloud Agent" />
                  </TabList>

                  {tab === 'agents' ? (
                    <VStack gap={3}>
                      <Switch
                        label="Auto-connect to Cloud Agent on startup"
                        description="Automatically sign in with your Pikpam account and open your Cloud Agent whenever the Desktop App launches."
                        labelPosition="start"
                        labelSpacing="spread"
                        width="100%"
                        value={Boolean(state.autoConnectCloud)}
                        isDisabled={savingAutoConnect}
                        onChange={val => void handleToggleAutoConnect(val)}
                      />

                      <Card
                        padding={3}
                        variant={mode === 'local' ? 'muted' : 'default'}>
                        <HStack
                          hAlign="between"
                          vAlign="center"
                          gap={2}
                          wrap="wrap">
                          <HStack gap={2} vAlign="center">
                            <StatusDot variant="success" label="Local" />
                            <VStack gap={0}>
                              <HStack gap={1.5} vAlign="center">
                                <AppIcon icon={Monitor} size="sm" />
                                <Heading level={5}>
                                  Local Agent (This PC)
                                </Heading>
                              </HStack>
                              <Text type="supporting" color="secondary">
                                Runs directly on this computer with local
                                folders and desktop browser access.
                              </Text>
                            </VStack>
                          </HStack>
                          {mode === 'local' ? (
                            <Text type="code" size="sm" color="accent">
                              ACTIVE
                            </Text>
                          ) : (
                            <Button
                              label="Switch to Local"
                              variant="primary"
                              size="sm"
                              isLoading={switchingLocal}
                              onClick={() => void handleSwitchLocal()}
                            />
                          )}
                        </HStack>
                      </Card>

                      <Divider />

                      <HStack hAlign="between" vAlign="center">
                        <Heading level={5}>Your Cloud Agents</Heading>
                        <Button
                          label="Buy Cloud Agent"
                          variant="secondary"
                          size="sm"
                          icon={<AppIcon icon={Plus} size="sm" />}
                          onClick={() => setTab('buy')}
                        />
                      </HStack>

                      {state.instances.length > 0 ? (
                        <VStack gap={2}>
                          {state.instances.map(renderInstanceRow)}
                        </VStack>
                      ) : (
                        <EmptyState
                          isCompact
                          icon={
                            <AppIcon icon={Cloud} size="lg" color="secondary" />
                          }
                          title="No Cloud Agents yet"
                          description="Deploy a dedicated always-on Pikpam Cloud Agent VPS and switch between Local and Cloud from this Desktop App anytime."
                          actions={
                            <Button
                              label="Get a Cloud Agent"
                              variant="primary"
                              onClick={() => setTab('buy')}
                            />
                          }
                        />
                      )}
                    </VStack>
                  ) : null}

                  {tab === 'buy' ? (
                    <VStack gap={4}>
                      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                        <Button
                          label="Back to My Agents"
                          variant="secondary"
                          size="sm"
                          icon={<AppIcon icon={ChevronLeft} size="sm" />}
                          onClick={() => setTab('agents')}
                        />
                        <Text type="supporting" color="secondary">
                          Deploy a new Cloud Agent or return to connect an existing one
                        </Text>
                      </HStack>

                      {state.freeClaim?.canClaim && state.freeClaim.plan ? (
                        <Card variant="muted" padding={4}>
                          <VStack gap={3}>
                            <HStack
                              hAlign="between"
                              vAlign="center"
                              wrap="wrap"
                              gap={2}>
                              <VStack gap={0}>
                                <Heading level={4}>
                                  Free 30-day {state.freeClaim.plan.name} Cloud
                                  Agent
                                </Heading>
                                <Text type="supporting" color="secondary">
                                  {state.freeClaim.plan.vCpus} vCPU ·{' '}
                                  {state.freeClaim.plan.ramGb} GB RAM ·{' '}
                                  {state.freeClaim.plan.storageGb} GB{' '}
                                  {state.freeClaim.plan.storageType}
                                </Text>
                              </VStack>
                              <Text type="code" size="sm" color="accent">
                                FREE TRIAL
                              </Text>
                            </HStack>

                            <HStack gap={2} wrap="wrap" vAlign="end">
                              <StackItem size="fill">
                                <TextInput
                                  label="Agent name (optional)"
                                  placeholder="my-cloud-agent"
                                  value={freeClaimName}
                                  onChange={setFreeClaimName}
                                  width="100%"
                                />
                              </StackItem>
                              <Button
                                label="Claim free Cloud Agent"
                                variant="primary"
                                isLoading={claimingFree}
                                onClick={() => void handleClaimFree()}
                              />
                            </HStack>
                          </VStack>
                        </Card>
                      ) : null}

                      <VStack gap={2}>
                        <Heading level={5}>Select a Cloud Agent plan</Heading>
                        {(state.plans || []).length === 0 ? (
                          <Banner
                            status="info"
                            title="No live Cloud plans available"
                            description="Refresh or check back once Cloud VPS plans are enabled."
                          />
                        ) : (
                          <Grid
                            columns={
                              isMobile ? 1 : {minWidth: 210, max: 3}
                            }
                            gap={3}>
                            {(state.plans || []).map(plan => {
                              const isSelected = selectedPlan?.id === plan.id;
                              return (
                                <ClickableCard
                                  key={plan.id}
                                  label={`Select ${plan.name}`}
                                  padding={3}
                                  variant={isSelected ? 'muted' : 'default'}
                                  onClick={() => setSelectedPlanId(plan.id)}>
                                  <VStack gap={1.5}>
                                    <HStack hAlign="between" vAlign="center">
                                      <Heading level={5}>{plan.name}</Heading>
                                      {isSelected ? (
                                        <StatusDot
                                          variant="success"
                                          label="Selected"
                                        />
                                      ) : null}
                                    </HStack>
                                    <Heading level={4}>
                                      ${plan.priceUsd.toFixed(2)}/mo
                                    </Heading>
                                    <Text type="supporting" color="secondary">
                                      {plan.vCpus} vCPU · {plan.ramGb} GB RAM ·{' '}
                                      {plan.storageGb} GB {plan.storageType}
                                    </Text>
                                    {plan.includedCredits > 0 ? (
                                      <Text type="supporting" color="accent">
                                        Includes {plan.includedCredits} AI
                                        credits
                                      </Text>
                                    ) : null}
                                  </VStack>
                                </ClickableCard>
                              );
                            })}
                          </Grid>
                        )}
                      </VStack>

                      {selectedPlan ? (
                        <Card padding={4}>
                          <VStack gap={3}>
                            <Grid columns={isMobile ? 1 : 2} gap={3}>
                              <TextInput
                                label="Cloud Agent hostname prefix"
                                placeholder="work-agent"
                                value={instanceName}
                                onChange={setInstanceName}
                                width="100%"
                              />
                              <Selector
                                label="Payment method"
                                value={paymentMethod}
                                onChange={val =>
                                  setPaymentMethod(val as 'WALLET' | 'PAYSTACK')
                                }
                                options={[
                                  {
                                    value: 'WALLET',
                                    label: `Pikpam Wallet ($${paidUsd.toFixed(2)} spendable)`,
                                  },
                                  {
                                    value: 'PAYSTACK',
                                    label: 'Card / M-Pesa (Paystack)',
                                  },
                                ]}
                                width="100%"
                              />
                            </Grid>

                            {paymentMethod === 'PAYSTACK' ? (
                              <Selector
                                label="Billing country"
                                value={countryCode}
                                onChange={setCountryCode}
                                options={[
                                  {value: 'US', label: 'United States / Global (USD)'},
                                  {value: 'KE', label: 'Kenya (KES / M-Pesa)'},
                                  {value: 'NG', label: 'Nigeria (NGN)'},
                                  {value: 'GH', label: 'Ghana (GHS)'},
                                  {value: 'ZA', label: 'South Africa (ZAR)'},
                                  {value: 'GB', label: 'United Kingdom (GBP)'},
                                ]}
                                width="100%"
                              />
                            ) : null}

                            {insufficientWalletForPlan ? (
                              <Banner
                                status="warning"
                                title="More wallet funds needed"
                                description={`${selectedPlan.name} costs $${selectedPlan.priceUsd.toFixed(2)} USD, while your spendable wallet has $${paidUsd.toFixed(2)} USD (AI bonus credits cannot buy servers).`}
                                endContent={
                                  <Button
                                    label="Recharge wallet"
                                    size="sm"
                                    variant="primary"
                                    onClick={handleOpenTopup}
                                  />
                                }
                              />
                            ) : null}

                            {pendingReference ? (
                              <Banner
                                status="info"
                                title="Complete checkout in browser"
                                description={`After finishing payment for reference ${pendingReference}, click Verify payment to start provisioning your Cloud Agent.`}
                                endContent={
                                  <Button
                                    label="Verify payment"
                                    size="sm"
                                    variant="primary"
                                    isLoading={verifyingOrder}
                                    onClick={() => void handleVerifyOrder()}
                                  />
                                }
                              />
                            ) : null}

                            <HStack hAlign="end" gap={2} wrap="wrap">
                              <Button
                                label="Back to My Agents"
                                variant="secondary"
                                onClick={() => setTab('agents')}
                              />
                              <Button
                                label={
                                  paymentMethod === 'WALLET'
                                    ? `Buy with Wallet ($${selectedPlan.priceUsd.toFixed(2)})`
                                    : `Continue to Checkout ($${selectedPlan.priceUsd.toFixed(2)})`
                                }
                                variant="primary"
                                isLoading={ordering}
                                isDisabled={insufficientWalletForPlan}
                                onClick={() => void handleBuyCloud()}
                              />
                            </HStack>
                          </VStack>
                        </Card>
                      ) : null}
                    </VStack>
                  ) : null}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
