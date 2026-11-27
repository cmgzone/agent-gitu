export interface CoworkAvatar {
  color?: string;
  shape?: string;
  imageUrl?: string;
}

export interface AgentRole {
  id: string;
  name: string;
  responsibilities: string;
}

export interface AgentPersonality {
  traits: string[];
  communicationStyle: string;
  proactivity: 'reactive' | 'suggest' | 'proactive';
}

export interface CoworkAgent {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  systemPrompt?: string;
  avatar?: CoworkAvatar;
  provider?: string;
  model?: string;
  effort?: string;
  skills?: string[];
  roles?: AgentRole[];
  primaryRoleId?: string;
  personality?: AgentPersonality;
  allowShell?: boolean;
  allowWrites?: boolean;
  allowConfig?: boolean;
  useHostComputer?: boolean;
  cloudConnectionId?: string;
  chiefOfStaff?: boolean;
}

export interface CoworkConversation {
  id: string;
  kind: 'dm' | 'group' | string;
  memberIds: string[];
  title?: string;
}

export interface AppSkill {
  name: string;
  description?: string;
  scope?: string;
}

export interface CloudServer {
  id: string;
  label: string;
  host: string;
  hasCredential?: boolean;
}

export interface CoworkTemplate {
  label: string;
  name: string;
  tagline?: string;
  description?: string;
  shape?: string;
  color?: string;
  chiefOfStaff?: boolean;
  allowShell?: boolean;
  allowWrites?: boolean;
  allowConfig?: boolean;
  useHostComputer?: boolean;
  skills?: string[];
  prompt: string;
}

export interface ProviderModelGroup {
  id: string;
  label?: string;
  models: Array<{id: string; label?: string}>;
}

export interface WorkspaceSettingItem {
  id: string;
  title: string;
  detail: string;
  icon?: string;
  group?: string;
  keywords?: string;
  aliases?: string[];
  hidden?: boolean;
}

export interface MemoryEntryItem {
  id: string;
  type?: string;
  claim: string;
  status?: string;
  source?: string;
  confidence?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface MemoryExplainResponse {
  entry?: MemoryEntryItem;
  audit?: Array<{action?: string; at?: string; note?: string}>;
}

export interface ConnectedAppAccount {
  id: string;
  toolkit: string;
  status?: string;
  label?: string;
  email?: string;
  disabled?: boolean;
}

export interface ConnectedAppsResponse {
  configured?: boolean;
  accounts?: ConnectedAppAccount[];
  mail?: {
    accounts?: ConnectedAppAccount[];
  };
}

export interface GituHostBridge {
  getState(): {
    active?: string;
    settings: {
      theme?: string;
      startMode?: string;
      devMode?: boolean;
      [key: string]: unknown;
    };
    sel: {
      model?: string;
      effort?: string;
      persistent?: boolean;
      spendCeilingUsd?: string | number;
    };
    models: Array<{id: string; label?: string}>;
    setSection?: string;
  };
  ensureCowork(): {
    agents: CoworkAgent[];
    convs: CoworkConversation[];
    skills: AppSkill[];
    cloudServers?: CloudServer[];
    selectedAgentId?: string;
    activeConvId?: string;
    profileOpen?: boolean;
    profileAgentId?: string;
    profileSection?: string;
    learn?: {mode?: string};
  };
  api<T = unknown>(url: string, opts?: RequestInit): Promise<T>;
  toast(message: string, isError?: boolean): void;
  persist(): void;
  selectAgent?(agentId: string): void;
  openDm(agentId: string): void;
  openConv(convId: string): void;
  renderRail(): void;
  applyCharacterTheme(): void;
  renderInfo(): void;
  activeConv(): CoworkConversation | null;
  getAvatarImageUrl(shape?: string): string;
  getCharacterColor(avatar?: CoworkAvatar): string;
  getCharacterFilter?(avatar?: CoworkAvatar): string;
  getConstants(): {
    shapes: string[];
    characterNames: Record<string, string>;
    characterPalette: Array<[string, string]>;
    templates: CoworkTemplate[];
  };
  setSettingSection(section: string): void;
  renderLegacySettingsSection(section: string, target: HTMLElement): void;
  closeSettingsHost(): void;
  openSearchOverlay(): void;
  openFolderBrowser(): void;
  openSetupWizard?(): void;
  effectiveProjectPath(): string;
  basename(p: string): string;
  updateProjChip(): void;
  renderSidebar(): void;
  loadModelCatalog(force?: boolean): Promise<void>;
  catalogModelGroups(providerId?: string, query?: string): ProviderModelGroup[];
  openCloudServerModal(onSaved: (server: CloudServer) => void): void;
  openConnections(agentId?: string): void;
  openTopup(): void;
  startOAuth(): void;
  refreshCowork(force?: boolean): void;
  getThemeMode(): 'light' | 'dark';
  toggleThemeMode(): void;
  openCowork?(): void;
  openHome?(): void;
  openRun?(runId: string, opts?: { chatish?: boolean; goal?: string; mode?: string; projectPath?: string }): void;
  openWorkspaceSearch?(scope?: string, tab?: string): void;
  newProject?(): void;
  selectProject?(projectPath: string): void;
  setTheme?(choice: 'light' | 'dark' | 'system'): void;
  getWorkspaceSettingItems(): WorkspaceSettingItem[];
  syncCodingPermissions?(): Promise<unknown>;
  sendChatAction?(text: string, sourceEl?: HTMLElement | null): boolean;
  sendCoworkText?(text: string): boolean;
  onProfileClosed?(): void;
  onProfileOpened?(agentId: string, section?: string): void;
}

export function getHostBridge(): GituHostBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {__gituHost?: GituHostBridge};
  return w.__gituHost ?? null;
}

export function readDomThemeMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

export interface DesktopCloudInstance {
  id: string;
  name: string;
  plan: string;
  status: string;
  ipAddress: string | null;
  domain: string | null;
  customDomain: string | null;
  agentUrl: string | null;
  expiresAt: string | null;
  provisioning: {
    state: string;
    attentionReason: string | null;
    customerMessage: string;
  } | null;
}

export interface DesktopCloudPlan {
  id: string;
  name: string;
  vCpus: number;
  ramGb: number;
  storageGb: number;
  storageType: string;
  priceUsd: number;
  includedCredits: number;
  isPopular?: boolean;
  isActive?: boolean;
  description?: string;
}

export interface DesktopCloudFreeClaim {
  enabled: boolean;
  canClaim: boolean;
  reason?: string | null;
  plan?: {
    id: string;
    name: string;
    priceUsd: number;
    vCpus: number;
    ramGb: number;
    storageGb: number;
    storageType: string;
  } | null;
}

export interface DesktopCloudWallet {
  balance?: number;
  available?: number;
  paidBalance?: number;
  paidAvailable?: number;
  paidAvailableUsd?: number;
  bonusBalance?: number;
  bonusUsd?: number;
  usdValue?: number;
  currencyFormatted?: string;
  creditRate?: string;
}

export interface DesktopCloudState {
  signedIn?: boolean;
  authExpired?: boolean;
  mode: 'local' | 'cloud';
  activeCloud: {
    mode: 'cloud';
    vpsId: string;
    name: string;
    agentUrl: string;
    origin: string;
  } | null;
  autoConnectCloud: boolean;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  } | null;
  wallet?: DesktopCloudWallet | null;
  instances: DesktopCloudInstance[];
  plans?: DesktopCloudPlan[];
  freeClaim?: DesktopCloudFreeClaim | null;
}

export interface DesktopCloudActionResult {
  ok: boolean;
  code?: string;
  error?: string;
  mode?: 'local' | 'cloud';
  status?: string;
  paymentMethod?: 'WALLET' | 'PAYSTACK';
  pendingPayment?: boolean;
  reference?: string | null;
  authorizationUrl?: string;
  autoConnectCloud?: boolean;
  state?: DesktopCloudState;
}

export interface DesktopCloudBridge {
  status(): Promise<DesktopCloudState>;
  refresh(): Promise<DesktopCloudState>;
  connect(vpsId: string): Promise<DesktopCloudActionResult>;
  switchToLocal(): Promise<DesktopCloudActionResult>;
  claimFree(params?: {instanceName?: string}): Promise<DesktopCloudActionResult>;
  buy(params: {
    planId: string;
    instanceName?: string;
    paymentMethod: 'WALLET' | 'PAYSTACK';
    countryCode?: string;
  }): Promise<DesktopCloudActionResult>;
  verifyOrder(reference: string): Promise<DesktopCloudActionResult>;
  setAutoConnect(enabled: boolean): Promise<DesktopCloudActionResult>;
  openTopup(): Promise<DesktopCloudActionResult>;
}

export function getDesktopCloudBridge(): DesktopCloudBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    gituDesktop?: {cloudAgent?: DesktopCloudBridge};
  };
  const bridge = w.gituDesktop?.cloudAgent;
  return bridge && typeof bridge.connect === 'function' ? bridge : null;
}
