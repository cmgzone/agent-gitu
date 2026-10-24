/** Profile preferences share the agent configuration and never grant tool permissions. */
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
export interface AgentProfileSettings {
  description?: string;
  roles?: AgentRole[];
  primaryRoleId?: string;
  personality?: AgentPersonality;
}

const text = (value: unknown, _max: number): string => (typeof value === 'string' ? value.trim() : '');

export function sanitizeAgentProfile(input: AgentProfileSettings, previous?: AgentProfileSettings): AgentProfileSettings {
  const roles =
    input.roles === undefined
      ? (previous?.roles ?? [])
      : (Array.isArray(input.roles) ? input.roles : [])
          .flatMap((role, index) => {
            if (!role || typeof role !== 'object') return [];
            const name = text(role.name, 60);
            if (!name) return [];
            const id = /^[\w-]+$/.test(String(role.id ?? '')) ? String(role.id) : `role-${index + 1}`;
            return [{ id, name, responsibilities: text(role.responsibilities, 1000) }];
          })
          .filter((role, index, all) => all.findIndex((other) => other.id === role.id) === index);
  const selected = input.primaryRoleId === undefined ? previous?.primaryRoleId : text(input.primaryRoleId, 80);
  const personality =
    input.personality === undefined
      ? previous?.personality
      : {
          traits: [...new Set((Array.isArray(input.personality?.traits) ? input.personality.traits : []).map((trait) => text(trait, 40)).filter(Boolean))],
          communicationStyle: text(input.personality?.communicationStyle, 500),
          proactivity:
            input.personality?.proactivity === 'proactive' ? ('proactive' as const) : input.personality?.proactivity === 'suggest' ? ('suggest' as const) : ('reactive' as const),
        };
  return {
    description: input.description === undefined ? (previous?.description ?? '') : text(input.description, 600),
    roles,
    primaryRoleId: roles.some((role) => role.id === selected) ? selected : roles[0]?.id,
    ...(personality ? { personality } : {}),
  };
}

export function agentProfileInstructions(profile: AgentProfileSettings): string {
  const roles = profile.roles ?? [],
    personality = profile.personality;
  return [
    roles.length
      ? 'Assigned responsibilities (roles of this agent, not independent agents):\n' +
        roles
          .map((role) => `- ${role.name}${role.id === profile.primaryRoleId ? ' (primary)' : ''}: ${role.responsibilities || 'Follow the user’s task and existing instructions.'}`)
          .join('\n')
      : '',
    personality?.traits.length ? 'Personality preferences: ' + personality.traits.join(', ') + '.' : '',
    personality?.communicationStyle ? 'Communication style: ' + personality.communicationStyle : '',
    personality?.proactivity === 'proactive'
      ? 'PROACTIVITY: Be an attentive personal assistant. Keep the user informed about important changes, deadlines, blockers and decisions. Use verified app and task evidence to prioritize what matters and propose a concrete next step. Follow through on authorized internal work, coordinate coding through Main Agent Gitu and remain available while it runs. Never repeat unchanged or dismissed suggestions. Respect quiet hours and background limits. Missing permissions or credentials require a clear request to the user; proactivity does not grant external writes, purchases, destructive actions or additional access. Be concise and warm; do not create busywork or claim monitoring that is not running.'
      : personality?.proactivity === 'suggest'
        ? 'PROACTIVITY: Finish the requested task first. Offer a useful next step only when relevant evidence is already available; do not perform extra searches or app reads just to generate suggestions. Verify offers, terms and dates before mentioning them. Do not repeat skipped recommendations. Suggestions do not authorize new tasks, tool permissions, external actions, or schedules.'
        : 'PROACTIVITY: Follow the user’s lead. Complete the requested task directly; do not expand it into unsolicited recommendations, searches, app reviews, or follow-ups.',
  ]
    .filter(Boolean)
    .join('\n');
}
