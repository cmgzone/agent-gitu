export interface CoworkAvatar {
  color?: string;
  shape?: string;
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
  keywords?: string;
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
  getWorkspaceSettingItems(): WorkspaceSettingItem[];
  syncCodingPermissions?(): Promise<unknown>;
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
