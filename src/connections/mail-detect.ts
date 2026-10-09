/**
 * Standards-based mail server discovery.
 *
 * The preset table in mail.ts only knows the big hosted providers. Everything
 * else — Mailcow, Mail-in-a-Box, iRedMail, Stalwart, poste.io, plain
 * Postfix/Dovecot — is expected to publish its settings in one of the two
 * standard places, so we read those instead of guessing:
 *
 *   1. Thunderbird autoconfig XML (the format Mailcow and Mail-in-a-Box ship):
 *      https://autoconfig.<domain>/mail/config-v1.1.xml?emailaddress=<address>
 *      https://<domain>/.well-known/autoconfig/mail/config-v1.1.xml
 *   2. DNS SRV records (RFC 6186, updated by RFC 8314):
 *      _imaps._tcp / _imap._tcp and _submissions._tcp / _submission._tcp.
 *
 * Two deliberate constraints:
 *
 *   - Requests only ever go to hosts derived from the address the user typed
 *     (autoconfig.<domain> and <domain>), and a redirect that leaves that set is
 *     refused. The response body exists only to be parsed into the four endpoint
 *     fields; it is never shown or stored, so a discovery endpoint cannot inject
 *     anything but a reviewable server suggestion.
 *   - TLS is never bypassed for discovery, not even for a self-signed host: the
 *     document names where the password will be sent, and a MITM must not be able
 *     to answer that question. A server with a broken certificate can still be
 *     reached because the user can type its host and tick "allow self-signed".
 *
 * Mozilla's ISPDB (autoconfig.thunderbird.net) is deliberately not consulted:
 * it would leak every user's mail domain to a third party for no extra coverage.
 */

import { resolveSrv } from 'node:dns/promises';
import type { MailEndpoint } from './mail.js';

/** Where the surviving endpoints were read from. */
export type MailDiscoverySource = 'autoconfig' | 'srv' | 'mixed' | 'none';

export interface MailDiscovery {
  /** The lowercased domain that was inspected ('' when the address is unusable). */
  domain: string;
  source: MailDiscoverySource;
  /** True when at least one endpoint was found. */
  found: boolean;
  imap?: MailEndpoint;
  smtp?: MailEndpoint;
  /** Login name from the autoconfig document, when it is not the address. */
  username?: string;
  /** Provider display name from the autoconfig document. */
  provider?: string;
  /** A short, user-facing remark (OAuth2-only host, plain-HTTP lookup, …). */
  note?: string;
}

export interface MailDiscoveryDeps {
  resolveSrv?: (name: string) => Promise<{ name: string; port: number; priority: number; weight: number }[]>;
  fetchImpl?: typeof fetch;
  /** Overall budget for both lookup kinds; individual requests get less. */
  timeoutMs?: number;
}

const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const FETCH_TIMEOUT_MS = 3_000;
const OVERALL_TIMEOUT_MS = 6_000;
const MAX_XML_BYTES = 200_000;

/** The domain of an address, lowercased, or '' when there is no usable one. */
export function mailDomainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() : '';
}

/**
 * Autoconfig URLs for a domain, most authoritative first. `secureOnly` keeps the
 * http fallbacks out, which is how the first pass runs.
 */
export function autoconfigUrls(domain: string, address: string, secureOnly = false): string[] {
  const query = `?emailaddress=${encodeURIComponent(address)}`;
  const https = [
    `https://autoconfig.${domain}/mail/config-v1.1.xml${query}`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml${query}`,
  ];
  if (secureOnly) return https;
  return [...https, `http://autoconfig.${domain}/mail/config-v1.1.xml${query}`, `http://${domain}/.well-known/autoconfig/mail/config-v1.1.xml${query}`];
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/** Text of the first <name> element inside a server block, entities decoded. */
function elementText(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  const text = match ? decodeXmlEntities(match[1]!.replace(/<[^>]*>/g, ' ')).trim() : '';
  return text || undefined;
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attributes);
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim().toLowerCase() || undefined;
}

/**
 * Thunderbird `socketType` is authoritative when it is one of the documented
 * values; `TLS` is ambiguous in the wild, so it falls back to the port. 993 and
 * 465 are always implicit TLS, 143/587 always STARTTLS.
 */
function socketTypeSecure(socketType: string | undefined, port: number): boolean {
  const value = (socketType ?? '').toLowerCase();
  if (value.startsWith('ssl')) return true;
  if (value === 'starttls' || value === 'plain' || value === 'none') return false;
  return port === 993 || port === 465 || port === 995 || port === 994;
}

function autoconfigUsername(template: string | undefined, address: string): string | undefined {
  if (!template) return undefined;
  const at = address.lastIndexOf('@');
  const local = at > 0 ? address.slice(0, at) : address;
  const resolved = template.replace(/%EMAILADDRESS%/gi, address).replace(/%EMAILLOCALPART%/gi, local);
  // A leftover placeholder means we do not understand the document; the address
  // is a better default than a literal "%USERNAME%".
  return resolved.includes('%') ? undefined : resolved;
}

export interface AutoconfigResult {
  imap?: MailEndpoint;
  smtp?: MailEndpoint;
  provider?: string;
  username?: string;
  note?: string;
}

/** Parses a Thunderbird clientConfig document. Unknown or broken XML yields {}. */
export function parseAutoconfigXml(xml: string, address: string): AutoconfigResult {
  if (!xml.includes('<clientConfig')) return {};
  const result: AutoconfigResult = {};
  let oauth2 = false;
  const blocks = /<(incomingServer|outgoingServer)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of xml.matchAll(blocks)) {
    const incoming = match[1]!.toLowerCase() === 'incomingserver';
    const type = (attribute(match[2]!, 'type') ?? (incoming ? 'imap' : 'smtp')).toLowerCase();
    const block = match[3]!;
    const host = elementText(block, 'hostname')?.toLowerCase();
    const rawPort = Number(elementText(block, 'port'));
    const port = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : undefined;
    if (!host || !port || !DOMAIN_RE.test(host)) continue;
    const endpoint: MailEndpoint = { host, port, secure: socketTypeSecure(elementText(block, 'socketType'), port) };
    const authentication = elementText(block, 'authentication')?.toLowerCase();
    if (authentication?.includes('oauth')) oauth2 = true;
    if (incoming && type === 'imap' && !result.imap) {
      result.imap = endpoint;
      result.username = autoconfigUsername(elementText(block, 'username'), address);
    } else if (!incoming && type === 'smtp' && !result.smtp) {
      result.smtp = endpoint;
      result.username = result.username ?? autoconfigUsername(elementText(block, 'username'), address);
    }
  }
  result.provider = elementText(xml, 'displayName');
  if (oauth2) result.note = 'This provider expects OAuth2 sign-in, so a mailbox password may be rejected.';
  return result;
}

/** Reads at most `limit` bytes so a hostile server cannot exhaust memory. */
async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        size += value.byteLength;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, limit).toString('utf8');
}

async function fetchAutoconfig(url: string, fetchImpl: typeof fetch, timeoutMs: number, address: string): Promise<AutoconfigResult | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow', headers: { accept: 'application/xml, text/xml, */*' } });
    if (!response.ok) return undefined;
    // A redirect must not carry the lookup off the address's own domain.
    const finalUrl = new URL(response.url || url);
    if (decodeURIComponent(finalUrl.hostname).toLowerCase() !== decodeURIComponent(new URL(url).hostname).toLowerCase()) return undefined;
    const xml = await readBounded(response, MAX_XML_BYTES);
    const parsed = parseAutoconfigXml(xml, address);
    return parsed.imap || parsed.smtp ? parsed : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function srvEndpoint(
  resolve: NonNullable<MailDiscoveryDeps['resolveSrv']>,
  name: string,
  secure: boolean,
): Promise<MailEndpoint | undefined> {
  try {
    const records = await resolve(`${name}.`);
    const best = [...records]
      .filter((record) => record?.name)
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
    const host = best?.name.replace(/\.$/, '').toLowerCase() ?? '';
    if (!best || !Number.isInteger(best.port) || best.port <= 0 || best.port > 65535 || !DOMAIN_RE.test(host)) return undefined;
    return { host, port: best.port, secure };
  } catch {
    return undefined;
  }
}

/**
 * Looks for the mailbox's servers the way a mail client does. Never throws: a
 * domain that publishes nothing simply comes back with `found: false`.
 */
export async function discoverMailServers(address: string, deps: MailDiscoveryDeps = {}): Promise<MailDiscovery> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolve = deps.resolveSrv ?? resolveSrv;
  const budget = deps.timeoutMs ?? OVERALL_TIMEOUT_MS;
  const domain = mailDomainOf(address);
  const nothing: MailDiscovery = { domain, source: 'none', found: false };
  if (!domain || domain.length > 253 || IPV4_RE.test(domain) || !DOMAIN_RE.test(domain)) return nothing;

  const deadline = Date.now() + budget;
  const attempt = async (urls: string[]): Promise<AutoconfigResult | undefined> => {
    for (const url of urls) {
      const remaining = deadline - Date.now();
      if (remaining < 250) return undefined;
      const parsed = await fetchAutoconfig(url, fetchImpl, Math.min(FETCH_TIMEOUT_MS, remaining), address);
      if (parsed) return parsed;
    }
    return undefined;
  };

  let autoconfig = await attempt(autoconfigUrls(domain, address, true));
  let overPlainHttp = false;
  if (!autoconfig) {
    // Legacy hosts still serve the document over http; the user reviews what it
    // says, and the note tells them the settings arrived unencrypted.
    autoconfig = await attempt(autoconfigUrls(domain, address));
    overPlainHttp = Boolean(autoconfig);
  }

  const discovery: MailDiscovery = {
    domain,
    source: autoconfig ? 'autoconfig' : 'none',
    found: false,
    imap: autoconfig?.imap,
    smtp: autoconfig?.smtp,
    username: autoconfig?.username,
    provider: autoconfig?.provider,
    note: autoconfig?.note,
  };

  if (!discovery.imap || !discovery.smtp) {
    const [imaps, imap, submissions, submission] = await Promise.all([
      srvEndpoint(resolve, `_imaps._tcp.${domain}`, true),
      srvEndpoint(resolve, `_imap._tcp.${domain}`, false),
      srvEndpoint(resolve, `_submissions._tcp.${domain}`, true),
      srvEndpoint(resolve, `_submission._tcp.${domain}`, false),
    ]);
    const srvImap = imaps ?? imap;
    const srvSmtp = submissions ?? submission;
    if (!discovery.imap && srvImap) discovery.imap = srvImap;
    if (!discovery.smtp && srvSmtp) discovery.smtp = srvSmtp;
    const usedSrv = (srvImap && discovery.imap === srvImap) || (srvSmtp && discovery.smtp === srvSmtp);
    if (usedSrv) discovery.source = autoconfig ? 'mixed' : 'srv';
  }

  discovery.found = Boolean(discovery.imap || discovery.smtp);
  if (overPlainHttp && discovery.source !== 'none') {
    discovery.note = discovery.note ?? 'The server settings were read over plain HTTP, so check them before connecting.';
  }
  return discovery;
}
