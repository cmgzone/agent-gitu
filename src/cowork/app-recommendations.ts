export interface AppSuggestion {
  service: string;
  name: string;
  reason: string;
  logo?: string;
  /** Task-driven recommendations wake the teammate after verified sign-in. */
  resumeWork?: boolean;
}

/** Small onboarding suggestions; the agent can discover other apps as work evolves. */
export function roleAppSuggestions(role: string): AppSuggestion[] {
  const suggestions: AppSuggestion[] = [];
  const add = (service: string, name: string, reason: string) => {
    if (!suggestions.some(item => item.service === service)) suggestions.push({ service, name, reason });
  };
  if (/\b(marketing|social media|facebook|instagram|community manager)\b/i.test(role)) {
    add('facebook', 'Facebook', 'Manage the pages and posts you choose for this teammate.');
    add('instagram', 'Instagram', 'Work with your Instagram content and audience.');
  }
  if (/\b(engineer|developer|coding|github|programmer)\b/i.test(role)) add('github', 'GitHub', 'Work with repository issues, pull requests, and code reviews.');
  if (/\b(personal assistant|executive assistant|chief of staff|email|mailbox|sales|outreach)\b/i.test(role)) add('gmail', 'Gmail', 'Help with the email and follow-ups assigned to this teammate.');
  if (/\b(personal assistant|executive assistant|schedule|calendar)\b/i.test(role)) add('googlecalendar', 'Google Calendar', 'Plan meetings and manage the calendar you connect.');
  if (/\b(research|writer|writing|content|blog|documents)\b/i.test(role)) add('googledrive', 'Google Drive', 'Find and work with your documents and research files.');
  if (/\b(team coordinator|chief of staff|slack)\b/i.test(role)) add('slack', 'Slack', 'Coordinate the channels and conversations assigned to this teammate.');
  return suggestions.slice(0, 3);
}
