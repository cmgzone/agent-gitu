/** Public form metadata only. Credential values must never be persisted here. */
export interface BrowserAuthCard {
  challengeId: string;
  computer: string;
  origin: string;
  url: string;
  mode: 'signin' | 'signup' | 'verify';
  expiresAt: number;
  iconUrl?: string;
  fields: { id: string; label: string; type: 'text' | 'email' | 'password' | 'tel'; required: boolean; autocomplete?: string }[];
  terms: { id: string; label: string; required: boolean; url?: string }[];
}

export function sanitizeBrowserAuth(value: unknown): BrowserAuthCard | undefined {
  try {
    const v = value as BrowserAuthCard, url = new URL(v.url), origin = new URL(v.origin);
    if (url.protocol !== 'https:' || url.username || url.password || origin.origin !== url.origin || origin.href !== origin.origin + '/' || !['signin', 'signup', 'verify'].includes(v.mode)
      || !/^[a-f0-9]{32}$/.test(v.challengeId) || !/^gitu-cowork-[a-f0-9]{24}$/.test(v.computer) || !Number.isFinite(v.expiresAt)
      || !Array.isArray(v.fields) || !v.fields.length || v.fields.length > 12 || !Array.isArray(v.terms) || v.terms.length > 8) return undefined;
    const fields = v.fields.map(f => {
      if (!/^f\d{1,2}$/.test(f.id) || !['text', 'email', 'password', 'tel'].includes(f.type) || typeof f.label !== 'string' || !f.label.trim() || f.label.length > 180) throw Error('Invalid field');
      return { id: f.id, label: f.label.trim(), type: f.type, required: f.required === true, ...(typeof f.autocomplete === 'string' && /^[a-z-]{1,40}$/.test(f.autocomplete) ? { autocomplete: f.autocomplete } : {}) };
    });
    const terms = v.terms.map(t => {
      if (!/^t\d$/.test(t.id) || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 500) throw Error('Invalid agreement');
      let link: string | undefined;
      if (t.url) { const u = new URL(t.url); if (u.protocol === 'https:' && !u.username && !u.password) link = u.href; }
      return { id: t.id, label: t.label.trim(), required: t.required === true, ...(link ? { url: link } : {}) };
    });
    if (new Set(fields.map(f => f.id)).size !== fields.length || new Set(terms.map(t => t.id)).size !== terms.length) return undefined;
    url.search = ''; url.hash = '';
    let iconUrl: string | undefined;
    if (v.iconUrl) { const icon = new URL(v.iconUrl); if (icon.origin === origin.origin && !icon.username && !icon.password) { icon.search='';icon.hash='';iconUrl=icon.href; } }
    return { challengeId: v.challengeId, computer: v.computer, origin: origin.origin, url: url.href, mode: v.mode, expiresAt: v.expiresAt, ...(iconUrl?{iconUrl}:{}), fields, terms };
  } catch { return undefined; }
}
