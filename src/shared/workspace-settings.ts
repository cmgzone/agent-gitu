export interface WorkspaceSettingDefinition {
  id: string;
  icon: string;
  title: string;
  detail: string;
  group: 'Console' | 'AI & Integrations' | 'Workspace & Safety' | 'More';
  keywords?: string;
  aliases?: string[];
  hidden?: boolean;
}

export const WORKSPACE_SETTINGS_CATALOG: WorkspaceSettingDefinition[] = [
  { id: 'overview', icon: 'layers', title: 'Overview', detail: 'Workspace overview, quick actions, and settings search', group: 'Console', keywords: 'dashboard home console' },
  { id: 'general', icon: 'gear', title: 'General', detail: 'Appearance, defaults, reasoning, account, and phone access', group: 'Console', keywords: 'theme account logout sign out phone qr' },
  { id: 'providers', icon: 'layers', title: 'Providers', detail: 'Models, API keys, and provider accounts', group: 'AI & Integrations', keywords: 'models api keys pikrouter' },
  { id: 'connections', icon: 'plug', title: 'Connections', detail: 'Apps, accounts, custom APIs, and service permissions', group: 'AI & Integrations', keywords: 'apps accounts oauth custom apis integrations', aliases: ['connected-apps', 'apps', 'accounts', 'custom-apis'] },
  { id: 'agents', icon: 'users', title: 'Specialist agents', detail: 'Coding specialists and orchestration', group: 'AI & Integrations', keywords: 'teammates specialists' },
  { id: 'skills', icon: 'bolt', title: 'Skills', detail: 'Find, create, and manage reusable skills', group: 'AI & Integrations' },
  { id: 'mcp', icon: 'plug', title: 'MCP servers', detail: 'Tools and external server connections', group: 'AI & Integrations', keywords: 'model context protocol servers' },
  { id: 'workspace', icon: 'folder', title: 'Workspace', detail: 'Project locations, files, and constraints', group: 'Workspace & Safety' },
  { id: 'cron', icon: 'clock', title: 'Schedules', detail: 'Scheduled tasks and recurring heartbeats', group: 'Workspace & Safety', keywords: 'cron heartbeat scheduled jobs' },
  { id: 'cowork', icon: 'users', title: 'Cowork', detail: 'Team preferences, learning, and skill approvals', group: 'Workspace & Safety' },
  { id: 'permissions', icon: 'shield', title: 'Permissions', detail: 'Workspace access and action approvals', group: 'Workspace & Safety' },
  { id: 'files', icon: 'folder', title: 'Files & storage', detail: 'Choose attachment size limits and manage file transfers', group: 'Workspace & Safety', hidden: true, keywords: 'uploads attachments storage' },
  { id: 'project', icon: 'search', title: 'Project', detail: 'Inspect your current project', group: 'More', hidden: true },
  { id: 'developer', icon: 'gear', title: 'Developer', detail: 'Diagnostics and development preferences', group: 'More', hidden: true, keywords: 'diagnostics debug dev mode' },
  { id: 'local-link', icon: 'link', title: 'Local PC Link', detail: 'Direct Cloud-to-Local agent link (no Pikpam relay)', group: 'More', hidden: true },
];

export function resolveWorkspaceSettingId(id: string | null | undefined): string {
  const raw = String(id || '').trim().toLowerCase();
  if (!raw) return 'overview';
  const direct = WORKSPACE_SETTINGS_CATALOG.find(item => item.id === raw);
  if (direct) return direct.id;
  const alias = WORKSPACE_SETTINGS_CATALOG.find(item => (item.aliases || []).includes(raw));
  return alias?.id || raw;
}
