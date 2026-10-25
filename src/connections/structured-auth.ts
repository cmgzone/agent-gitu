/** Field definitions are public metadata. Values live only in the encrypted key vault. */
export interface CredentialField {
  id: string; label: string; secret: boolean; required: boolean;
  inputType?: 'text' | 'email' | 'password'; header?: string; prefix?: string;
}
export interface StructuredConnectionAuth {
  type: 'basic' | 'headers' | 'oauth2'; fields: CredentialField[];
  usernameField?: string; passwordField?: string; tokenPath?: string; scope?: string;
}
export function isStructuredAuth(value: { type: string } | undefined): value is StructuredConnectionAuth {
  return !!value && ['basic', 'headers', 'oauth2'].includes(value.type);
}
const validHeader = (value: string) => /^[a-z][a-z0-9-]{0,79}$/i.test(value) && !/^(?:host|cookie|set-cookie|connection|content-type|content-length|transfer-encoding|accept|origin|referer|proxy-.*|sec-.*)$/i.test(value);
export function normalizeStructuredAuth(input: unknown): StructuredConnectionAuth {
  const raw = input as StructuredConnectionAuth;
  if (!raw || !['basic', 'headers', 'oauth2'].includes(raw.type) || !Array.isArray(raw.fields) || !raw.fields.length || raw.fields.length > 12) throw Error('Define the service’s required credential fields.');
  const fields = raw.fields.map(field => {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(field.id) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 100) throw Error('Credential fields need a stable name and label.');
    if (field.header && !validHeader(field.header)) throw Error('Use a valid authentication header.');
    if (field.prefix && !/^[a-z][a-z0-9_-]{0,31}$/i.test(field.prefix)) throw Error('Use a valid authentication scheme prefix.');
    if (raw.type === 'headers' && !field.header) throw Error('Each credential needs its documented authentication header.');
    return { id: field.id, label: field.label.trim(), secret: /secret|password|token|api_?key/i.test(field.id) || field.inputType === 'password' || field.secret !== false, required: field.required !== false,
      ...(field.inputType && ['text', 'email', 'password'].includes(field.inputType) ? { inputType: field.inputType } : {}), ...(field.header ? { header: field.header } : {}), ...(field.prefix ? { prefix: field.prefix } : {}) };
  });
  if (new Set(fields.map(f => f.id)).size !== fields.length || new Set(fields.filter(f => f.header).map(f => f.header!.toLowerCase())).size !== fields.filter(f => f.header).length) throw Error('Credential field names and headers must be unique.');
  if (raw.type === 'basic' && (!fields.some(f => f.id === raw.usernameField) || !fields.some(f => f.id === raw.passwordField) || raw.usernameField === raw.passwordField)) throw Error('Choose the username and password fields for Basic authentication.');
  if (raw.type === 'oauth2' && (!fields.some(f => f.id === 'client_id') || !fields.some(f => f.id === 'client_secret') || typeof raw.tokenPath !== 'string' || !/^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(raw.tokenPath) || raw.tokenPath.split('/').includes('..') || fields.some(f => f.id === 'grant_type' || f.id === 'scope'))) throw Error('OAuth client credentials need client_id, client_secret and a documented tokenPath on this API’s HTTPS origin.');
  if (raw.scope !== undefined && (typeof raw.scope !== 'string' || raw.scope.length > 1000 || /[\x00-\x1f]/.test(raw.scope))) throw Error('Provide a valid OAuth scope.');
  return { type: raw.type, fields, ...(raw.type === 'basic' ? { usernameField: raw.usernameField, passwordField: raw.passwordField } : {}), ...(raw.type === 'oauth2' ? { tokenPath: raw.tokenPath, ...(raw.scope ? { scope: raw.scope } : {}) } : {}) };
}
export function encodeStructuredCredentials(auth: StructuredConnectionAuth, value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Complete the service credential fields.');
  const raw = value as Record<string, unknown>, values: Record<string, string> = Object.create(null);
  if (Object.keys(raw).some(key => !auth.fields.some(field => field.id === key))) throw Error('Unexpected credential field.');
  for (const field of auth.fields) {
    const item = raw[field.id] ?? '';
    if (typeof item !== 'string' || item.length > 8192 || /[\x00-\x1f\x7f]/.test(item) || field.required && !item) throw Error('Complete all required credential fields using valid values.');
    if (field.inputType === 'email' && item && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) throw Error('Enter a valid email address.');
    if (auth.type === 'basic' && field.id === auth.usernameField && item.includes(':')) throw Error('Basic authentication usernames cannot contain a colon.');
    values[field.id] = item;
  }
  const encoded = JSON.stringify(values);
  if (encoded.length > 16384) throw Error('The credential fields are too large.');
  return encoded;
}
export function structuredSecrets(auth: StructuredConnectionAuth, encoded: string): string[] {
  const values = decode(auth, encoded);
  return [encoded, ...Object.values(values).filter(Boolean), ...(auth.type === 'basic' ? [Buffer.from(values[auth.usernameField!] + ':' + values[auth.passwordField!]).toString('base64')] : [])];
}
export async function structuredAuthHeaders(auth: StructuredConnectionAuth, encoded: string, baseUrl: string, fetcher: (url: string | URL, options: RequestInit) => Promise<Response>, secrets: string[]): Promise<Record<string, string>> {
  const values = decode(auth, encoded);
  const headers: Record<string, string> = {};
  for (const field of auth.fields) if (field.header && values[field.id]) headers[field.header] = field.prefix ? field.prefix + ' ' + values[field.id] : values[field.id]!;
  if (auth.type === 'basic') headers.authorization = 'Basic ' + Buffer.from(values[auth.usernameField!] + ':' + values[auth.passwordField!]).toString('base64');
  if (auth.type === 'oauth2') {
    const origin = new URL(baseUrl);
    if (origin.protocol !== 'https:') throw Error('OAuth credential exchange requires HTTPS.');
    const body = new URLSearchParams({ grant_type: 'client_credentials', ...values, ...(auth.scope ? { scope: auth.scope } : {}) });
    const response = await fetcher(new URL(auth.tokenPath!, origin.origin), { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) { await response.body?.cancel(); throw Error('The service rejected the OAuth client credentials. Check the documented token endpoint and fields.'); }
    const text = await response.text();
    if (text.length > 65536) throw Error('The OAuth response was too large.');
    let data: { access_token?: unknown; token_type?: unknown };
    try { data = JSON.parse(text); } catch { throw Error('The OAuth response was not valid JSON.'); }
    if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 16384 || /\s/.test(data.access_token) || data.token_type && String(data.token_type).toLowerCase() !== 'bearer') throw Error('The OAuth service did not return a usable Bearer token.');
    secrets.push(data.access_token); headers.authorization = 'Bearer ' + data.access_token;
  }
  return headers;
}

function decode(auth: StructuredConnectionAuth, encoded: string): Record<string,string> {
  try { return JSON.parse(encodeStructuredCredentials(auth,JSON.parse(encoded))); }
  catch { throw Error('Update this service’s named credential fields through a secure card.'); }
}
