import { describe, expect, it, vi } from 'vitest';
import { autoconfigUrls, discoverMailServers, mailDomainOf, parseAutoconfigXml } from '../src/connections/mail-detect.js';

/** What Mailcow, Mail-in-a-Box and Thunderbird-compatible hosts publish. */
const MAILCOW_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<clientConfig version="1.1">',
  '<emailProvider id="company.example">',
  '<domain>company.example</domain>',
  '<displayName>Company Mail</displayName>',
  '<incomingServer type="imap">',
  '<hostname>mail.company.example</hostname><port>993</port><socketType>SSL</socketType>',
  '<username>%EMAILADDRESS%</username><authentication>password-cleartext</authentication>',
  '</incomingServer>',
  '<outgoingServer type="smtp">',
  '<hostname>mail.company.example</hostname><port>587</port><socketType>STARTTLS</socketType>',
  '<username>%EMAILADDRESS%</username><authentication>password-cleartext</authentication>',
  '</outgoingServer>',
  '</emailProvider>',
  '</clientConfig>',
].join('\n');

const AUTOCONFIG_URL = 'https://autoconfig.company.example/mail/config-v1.1.xml?emailaddress=ada%40company.example';

function xmlResponse(xml: string, url: string): Response {
  return { ok: true, url, status: 200, text: async () => xml, body: null } as unknown as Response;
}

function failingFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error('ENOTFOUND');
  }) as unknown as typeof fetch;
}

describe('mail server discovery', () => {
  it('reads a Mailcow-style autoconfig document over https before anything else', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url !== AUTOCONFIG_URL) throw new Error(`unexpected lookup: ${url}`);
      return xmlResponse(MAILCOW_XML, url);
    }) as unknown as typeof fetch;
    const resolveSrv = vi.fn(async () => {
      throw new Error('SRV should not be needed once autoconfig answered');
    });

    const result = await discoverMailServers('ada@company.example', { fetchImpl, resolveSrv });

    expect(result).toMatchObject({
      domain: 'company.example',
      source: 'autoconfig',
      found: true,
      provider: 'Company Mail',
      imap: { host: 'mail.company.example', port: 993, secure: true },
      smtp: { host: 'mail.company.example', port: 587, secure: false },
    });
    // %EMAILADDRESS% in the document is the actual login, so the form can show it.
    expect(result.username).toBe('ada@company.example');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(resolveSrv).not.toHaveBeenCalled();
  });

  it('falls back to RFC 6186 SRV records when no document is published', async () => {
    const resolveSrv = vi.fn(async (name: string) => {
      if (name === '_imaps._tcp.company.example.') return [{ name: 'imap.company.example.', port: 993, priority: 10, weight: 5 }];
      if (name === '_submissions._tcp.company.example.') return [{ name: 'smtp.company.example.', port: 465, priority: 10, weight: 5 }];
      throw new Error('ENOTFOUND');
    });

    const result = await discoverMailServers('ada@company.example', { fetchImpl: failingFetch(), resolveSrv });

    expect(result).toMatchObject({
      source: 'srv',
      found: true,
      imap: { host: 'imap.company.example', port: 993, secure: true },
      smtp: { host: 'smtp.company.example', port: 465, secure: true },
    });
  });

  it('honours SRV priority and weight, and uses STARTTLS ports for the plain services', async () => {
    const resolveSrv = vi.fn(async (name: string) => {
      if (name === '_imaps._tcp.company.example.') {
        return [
          { name: 'backup.company.example.', port: 993, priority: 20, weight: 100 },
          { name: 'imap.company.example.', port: 993, priority: 10, weight: 1 },
        ];
      }
      // The plain _imap._tcp record is a fallback: implicit TLS wins when both exist.
      if (name === '_imap._tcp.company.example.') return [{ name: 'imap.company.example.', port: 143, priority: 10, weight: 1 }];
      if (name === '_submission._tcp.company.example.') return [{ name: 'smtp.company.example.', port: 587, priority: 10, weight: 1 }];
      throw new Error('ENOTFOUND');
    });

    const result = await discoverMailServers('ada@company.example', { fetchImpl: failingFetch(), resolveSrv });

    expect(result.imap).toEqual({ host: 'imap.company.example', port: 993, secure: true });
    expect(result.smtp).toEqual({ host: 'smtp.company.example', port: 587, secure: false });
  });

  it('mixes a partial document with SRV records and reports which came from where', async () => {
    const partial = [
      '<clientConfig version="1.1"><emailProvider>',
      '<incomingServer type="imap"><hostname>imap.company.example</hostname><port>993</port><socketType>SSL</socketType></incomingServer>',
      '</emailProvider></clientConfig>',
    ].join('');
    const fetchImpl = vi.fn(async (input: string | URL | Request) => xmlResponse(partial, String(input))) as unknown as typeof fetch;
    const resolveSrv = vi.fn(async (name: string) => {
      if (name === '_submission._tcp.company.example.') return [{ name: 'smtp.company.example.', port: 587, priority: 10, weight: 1 }];
      throw new Error('ENOTFOUND');
    });

    const result = await discoverMailServers('ada@company.example', { fetchImpl, resolveSrv });

    expect(result.source).toBe('mixed');
    expect(result.imap).toEqual({ host: 'imap.company.example', port: 993, secure: true });
    expect(result.smtp).toEqual({ host: 'smtp.company.example', port: 587, secure: false });
  });

  it('refuses a document that redirects off the address domain', async () => {
    const fetchImpl = vi.fn(async () => xmlResponse(MAILCOW_XML, 'https://attacker.example/mail/config-v1.1.xml')) as unknown as typeof fetch;
    const resolveSrv = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });

    const result = await discoverMailServers('ada@company.example', { fetchImpl, resolveSrv });

    expect(result.found).toBe(false);
    expect(result.source).toBe('none');
    expect(result.imap).toBeUndefined();
  });

  it('says nothing instead of throwing when a domain publishes nothing', async () => {
    const resolveSrv = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });

    await expect(discoverMailServers('ada@nothing.example', { fetchImpl: failingFetch(), resolveSrv })).resolves.toEqual({
      domain: 'nothing.example',
      source: 'none',
      found: false,
    });
  });

  it('never looks anything up for an address with no usable domain', async () => {
    const fetchImpl = failingFetch();
    const resolveSrv = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });

    for (const address of ['ada@192.168.1.5', 'ada@mailcow', 'not-an-address']) {
      await expect(discoverMailServers(address, { fetchImpl, resolveSrv })).resolves.toMatchObject({ found: false, source: 'none' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolveSrv).not.toHaveBeenCalled();
  });

  it('still tries the legacy http document, but warns that it arrived in the clear', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://')) throw new Error('TLS handshake failed');
      return xmlResponse(MAILCOW_XML, url);
    }) as unknown as typeof fetch;

    const result = await discoverMailServers('ada@company.example', { fetchImpl, resolveSrv: vi.fn(async () => { throw new Error('ENOTFOUND'); }) });

    expect(result.found).toBe(true);
    expect(result.imap?.host).toBe('mail.company.example');
    expect(result.note).toContain('plain HTTP');
  });

  it('keeps the autoconfig URL order Thunderbird uses', () => {
    expect(autoconfigUrls('company.example', 'ada@company.example')).toEqual([
      AUTOCONFIG_URL,
      'https://company.example/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=ada%40company.example',
      'http://autoconfig.company.example/mail/config-v1.1.xml?emailaddress=ada%40company.example',
      'http://company.example/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=ada%40company.example',
    ]);
    expect(autoconfigUrls('company.example', 'ada@company.example', true)).toHaveLength(2);
    expect(mailDomainOf('ada@Company.Example')).toBe('company.example');
    expect(mailDomainOf('not-an-address')).toBe('');
  });

  it('parses only the fields the form can use', () => {
    const parsed = parseAutoconfigXml(
      [
        '<clientConfig version="1.1"><emailProvider>',
        '<displayName>Mixed Host</displayName>',
        '<incomingServer type="pop3"><hostname>pop.company.example</hostname><port>995</port><socketType>SSL</socketType></incomingServer>',
        '<incomingServer type="imap"><hostname>imap.company.example</hostname><port>143</port><socketType>ssl/tls</socketType>',
        '<username>%EMAILLOCALPART%@company.example</username><authentication>OAuth2</authentication></incomingServer>',
        '<outgoingServer type="smtp"><hostname>smtp.company.example</hostname><port>465</port><socketType>TLS</socketType>',
        '<username>12345</username><authentication>password-cleartext</authentication></outgoingServer>',
        '</emailProvider></clientConfig>',
      ].join(''),
      'ada@company.example',
    );

    // POP3 is ignored, the IMAP block wins, and an ambiguous TLS label uses the port.
    expect(parsed.imap).toEqual({ host: 'imap.company.example', port: 143, secure: true });
    expect(parsed.smtp).toEqual({ host: 'smtp.company.example', port: 465, secure: true });
    expect(parsed.username).toBe('ada@company.example');
    expect(parsed.provider).toBe('Mixed Host');
    expect(parsed.note).toContain('OAuth2');
    // An HTML error page is not a document.
    expect(parseAutoconfigXml('<html><body>Not found</body></html>', 'ada@company.example')).toEqual({});
  });
});
