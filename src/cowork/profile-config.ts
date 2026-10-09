/** Profile preferences share the agent configuration and never grant tool permissions. */
export interface AgentRole { id: string; name: string; responsibilities: string }
export interface AgentPersonality { traits: string[]; communicationStyle: string; proactivity: 'reactive' | 'suggest' }
export interface AgentProfileSettings { description?: string; roles?: AgentRole[]; primaryRoleId?: string; personality?: AgentPersonality }

const text = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function sanitizeAgentProfile(input: AgentProfileSettings, previous?: AgentProfileSettings): AgentProfileSettings {
  const roles = input.roles === undefined ? previous?.roles ?? [] : (Array.isArray(input.roles) ? input.roles : []).slice(0, 8).flatMap((role, index) => {
    if (!role || typeof role !== 'object') return [];
    const name = text(role.name, 60);
    if (!name) return [];
    const id = /^[\w-]{1,80}$/.test(String(role.id ?? '')) ? String(role.id) : `role-${index + 1}`;
    return [{ id, name, responsibilities: text(role.responsibilities, 1000) }];
  }).filter((role, index, all) => all.findIndex(other => other.id === role.id) === index);
  const selected = input.primaryRoleId === undefined ? previous?.primaryRoleId : text(input.primaryRoleId, 80);
  const personality = input.personality === undefined ? previous?.personality : {
    traits: [...new Set((Array.isArray(input.personality?.traits) ? input.personality.traits : []).map(trait => text(trait, 40)).filter(Boolean))].slice(0, 10),
    communicationStyle: text(input.personality?.communicationStyle, 500),
    proactivity: input.personality?.proactivity === 'suggest' ? 'suggest' as const : 'reactive' as const,
  };
  return {
    description: input.description === undefined ? previous?.description ?? '' : text(input.description, 600), roles,
    primaryRoleId: roles.some(role => role.id === selected) ? selected : roles[0]?.id,
    ...(personality ? { personality } : {}),
  };
}

export function agentProfileInstructions(profile: AgentProfileSettings): string {
  const roles = profile.roles ?? [], personality = profile.personality;
  return [
    roles.length ? 'Assigned responsibilities (roles of this agent, not independent agents):\n' + roles.map(role => `- ${role.name}${role.id === profile.primaryRoleId ? ' (primary)' : ''}: ${role.responsibilities || 'Follow the user’s task and existing instructions.'}`).join('\n') : '',
    personality?.traits.length ? 'Personality preferences: ' + personality.traits.join(', ') + '.' : '',
    personality?.communicationStyle ? 'Communication style: ' + personality.communicationStyle : '',
    personality?.proactivity === 'suggest' ? 'Offer useful next steps when relevant. Suggestions do not authorize new tasks, tool permissions, external actions, or schedules.' : '',
  ].filter(Boolean).join('\n');
}
