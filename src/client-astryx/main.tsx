import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './styles/astryx-host.css';

import {LayerProvider} from '@astryxdesign/core/Layer';
import {Theme} from '@astryxdesign/core/theme';
import {useCallback, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {defaultThemeSlug, themes} from '../astryx-themes';
import {
  getHostBridge,
  readDomThemeMode,
  type AppSkill,
  type CloudServer,
  type CoworkAgent,
} from './bridge';
import {AgentProfileView} from './views/AgentProfileView';
import {AgentSwitcherDialog} from './views/AgentSwitcherDialog';
import {EditAgentDialog} from './views/EditAgentDialog';
import {SettingsConsoleView} from './views/SettingsConsoleView';

export interface GituAstryxApi {
  openSwitcher(): void;
  openProfile(agentId: string, section?: string): void;
  closeProfile(): void;
  openEditAgent(agent?: CoworkAgent | null): void;
  openSettings(section?: string): void;
  closeSettings(): void;
  syncThemeMode(): void;
  handleBack(): boolean;
  refreshAgents(): void;
}

declare global {
  interface Window {
    __gituAstryx?: GituAstryxApi;
  }
}

function AstryxApp() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    readDomThemeMode(),
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileState, setProfileState] = useState<{
    open: boolean;
    agentId: string;
    section: string;
  }>({open: false, agentId: '', section: 'personality'});
  const [editState, setEditState] = useState<{
    open: boolean;
    agent: CoworkAgent | null;
  }>({open: false, agent: null});
  const [settingsState, setSettingsState] = useState<{
    open: boolean;
    section: string;
  }>({open: false, section: 'overview'});

  const [agents, setAgents] = useState<CoworkAgent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('');
  const [skills, setSkills] = useState<AppSkill[]>([]);
  const [cloudServers, setCloudServers] = useState<CloudServer[]>([]);

  const syncFromHost = useCallback(() => {
    const host = getHostBridge();
    if (!host) return;
    const cw = host.ensureCowork();
    setAgents([...(cw.agents || [])]);
    setSkills([...(cw.skills || [])]);
    setCloudServers([...(cw.cloudServers || [])]);
    const conv = host.activeConv();
    const convAgentId =
      conv && conv.kind === 'dm' ? conv.memberIds?.[0] || '' : '';
    const selectedInRoster =
      cw.selectedAgentId && cw.agents?.some(a => a.id === cw.selectedAgentId)
        ? cw.selectedAgentId
        : '';
    setActiveAgentId(selectedInRoster || convAgentId || cw.agents?.[0]?.id || '');
  }, []);

  const refreshAgentsFromServer = useCallback(() => {
    const host = getHostBridge();
    if (!host) return;
    syncFromHost();
    void host
      .api<{
        agents?: CoworkAgent[];
        availableSkills?: AppSkill[];
        cloudServers?: CloudServer[];
      }>('/api/cowork/agents')
      .then(data => {
        const cw = host.ensureCowork();
        if (Array.isArray(data.agents)) cw.agents = data.agents;
        if (Array.isArray(data.availableSkills)) cw.skills = data.availableSkills;
        if (Array.isArray(data.cloudServers)) cw.cloudServers = data.cloudServers;
        syncFromHost();
      })
      .catch(() => {});
  }, [syncFromHost]);

  const closeSettings = useCallback(() => {
    setSettingsState(prev => (prev.open ? {...prev, open: false} : prev));
    getHostBridge()?.closeSettingsHost();
  }, []);

  const closeProfile = useCallback(() => {
    setProfileState(prev => (prev.open ? {...prev, open: false} : prev));
    getHostBridge()?.onProfileClosed?.();
  }, []);

  useEffect(() => {
    const syncTheme = () => setThemeMode(readDomThemeMode());
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.__gituAstryx = {
      openSwitcher() {
        syncFromHost();
        setSwitcherOpen(true);
        refreshAgentsFromServer();
      },
      openProfile(agentId, section) {
        syncFromHost();
        const host = getHostBridge();
        const cw = host?.ensureCowork();
        const targetId =
          agentId || cw?.selectedAgentId || cw?.agents?.[0]?.id || '';
        const sec = section || 'personality';
        host?.onProfileOpened?.(targetId, sec);
        setProfileState({open: true, agentId: targetId, section: sec});
        refreshAgentsFromServer();
      },
      closeProfile,
      openEditAgent(agent) {
        syncFromHost();
        setEditState({open: true, agent: agent ?? null});
        refreshAgentsFromServer();
      },
      openSettings(section) {
        syncFromHost();
        const sec = section || 'overview';
        getHostBridge()?.setSettingSection(sec);
        setSettingsState({open: true, section: sec});
      },
      closeSettings,
      syncThemeMode: syncTheme,
      handleBack() {
        if (editState.open) {
          setEditState({open: false, agent: null});
          return true;
        }
        if (switcherOpen) {
          setSwitcherOpen(false);
          return true;
        }
        if (profileState.open) {
          closeProfile();
          return true;
        }
        if (settingsState.open) {
          closeSettings();
          return true;
        }
        return false;
      },
      refreshAgents: syncFromHost,
    };

    return () => {
      observer.disconnect();
    };
  }, [
    closeProfile,
    closeSettings,
    editState.open,
    profileState.open,
    refreshAgentsFromServer,
    settingsState.open,
    switcherOpen,
    syncFromHost,
  ]);

  useEffect(() => {
    if (!profileState.open && !settingsState.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editState.open || switcherOpen) return;
      if (profileState.open) {
        closeProfile();
      } else if (settingsState.open) {
        closeSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeProfile,
    closeSettings,
    editState.open,
    profileState.open,
    settingsState.open,
    switcherOpen,
  ]);

  const profileAgent =
    agents.find(a => a.id === profileState.agentId) || agents[0] || null;

  const hasAnyOpen =
    switcherOpen ||
    editState.open ||
    profileState.open ||
    settingsState.open;

  if (!hasAnyOpen) {
    return null;
  }

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={themeMode}>
      <LayerProvider>
        <SettingsConsoleView
          isOpen={settingsState.open}
          section={settingsState.section}
          themeMode={themeMode}
          onSelectSection={sec => {
            getHostBridge()?.setSettingSection(sec);
            setSettingsState({open: true, section: sec});
          }}
          onClose={closeSettings}
        />

        <AgentProfileView
          isOpen={profileState.open}
          agent={profileAgent}
          initialSection={profileState.section}
          allSkills={skills}
          onClose={closeProfile}
          onEditAgent={agent => setEditState({open: true, agent})}
          onAgentUpdated={saved => {
            const host = getHostBridge();
            if (host) {
              const cw = host.ensureCowork();
              cw.agents = (cw.agents || []).map(a =>
                a.id === saved.id ? saved : a,
              );
              host.applyCharacterTheme();
              host.renderRail();
              host.renderInfo();
              syncFromHost();
            }
          }}
        />

        <AgentSwitcherDialog
          isOpen={switcherOpen}
          agents={agents}
          activeAgentId={activeAgentId}
          onClose={() => setSwitcherOpen(false)}
          onSelect={agentId => {
            setSwitcherOpen(false);
            const host = getHostBridge();
            if (host?.selectAgent) host.selectAgent(agentId);
            else host?.openDm(agentId);
            syncFromHost();
          }}
          onCreateAgent={() => setEditState({open: true, agent: null})}
        />

        <EditAgentDialog
          isOpen={editState.open}
          agent={editState.agent}
          allSkills={skills}
          cloudServers={cloudServers}
          onClose={() => setEditState({open: false, agent: null})}
          onSaved={(saved, isNew) => {
            const host = getHostBridge();
            if (host) {
              const cw = host.ensureCowork();
              if (isNew) {
                cw.agents = [...(cw.agents || []), saved];
                host.refreshCowork(true);
                host.openDm(saved.id);
              } else {
                cw.agents = (cw.agents || []).map(a =>
                  a.id === saved.id ? saved : a,
                );
                host.applyCharacterTheme();
                host.renderRail();
                host.renderInfo();
              }
              syncFromHost();
            }
          }}
          onDeleted={() => {
            getHostBridge()?.refreshCowork(true);
            syncFromHost();
            if (profileState.open) closeProfile();
          }}
        />
      </LayerProvider>
    </Theme>
  );
}

function mountAstryxRoot() {
  const mountEl =
    document.getElementById('gituAstryxRoot') ||
    document.getElementById('root');
  if (!mountEl) return;
  createRoot(mountEl).render(<AstryxApp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAstryxRoot);
} else {
  mountAstryxRoot();
}
