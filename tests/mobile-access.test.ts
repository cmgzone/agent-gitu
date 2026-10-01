import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-mobile-test-'));
process.env['AGENT_GITU_HOME'] = path.join(root, 'home');
afterAll(() => rmSync(root, { recursive: true, force: true }));
const key = 'mobile-test-key-with-at-least-32-characters';

describe('Remote access', () => {
  it('requires opt-in for network listening', () => {
    expect(() => new GituServer({ passwordRequired: false, cwd: root, host: '0.0.0.0', accessKey: '' })).toThrow(/access.key/i);
    expect(() => new GituServer({ passwordRequired: false, cwd: root, accessKey: 'short' })).toThrow(/32 characters/);
  });

  it('pairs by header, loads with cookies, keeps Origin protection, and revokes sessions', async () => {
    const server = new GituServer({ passwordRequired: false, cwd: root, port: 0, accessKey: key, autoInstallLsp: false });
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    const headers = { Authorization: `Bearer ${key}`, Host: `hosted.agent.test:${port}`, 'X-Forwarded-Proto': 'https' };
    const read = (route: string, options: { headers?: Record<string, string>; method?: string } = {}) =>
      new Promise<{ status: number; text: string; cookie?: string }>((resolve, reject) => {
        const req = request(`${base}${route}`, options, (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode!, text, cookie: res.headers['set-cookie']?.[0] }));
        });
        req.on('error', reject);
        req.end();
      });
    try {
      expect((await read('/api/mobile/status')).status).toBe(401);
      expect((await read('/api/project', { headers: { Host: headers.Host } })).status).toBe(401);
      expect((await read('/api/project', { headers: { Host: `127.0.0.1:${port}` } })).status).toBe(401);
      expect((await read(`/api/mobile/status?key=${key}`, { headers: { Host: headers.Host } })).status).toBe(401);
      const status = await read('/api/mobile/status', { headers });
      expect(JSON.parse(status.text)).toEqual({ app: 'Agent Gitu', mobileProtocol: 1, mobileFeatures: ['native-workspace'] });
      const page = await read('/mobile', { headers });
      expect(page.status).toBe(200);
      const setCookie = page.cookie!;
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Secure');
      expect(page.text).not.toContain(key);
      const cookieHeaders = { Host: headers.Host, Cookie: setCookie.split(';')[0]!, Origin: `https://${headers.Host}`, 'X-Forwarded-Proto': 'https' };
      expect((await read('/api/project', { headers: cookieHeaders })).status).toBe(200);
      expect((await read('/api/project', { headers: { ...cookieHeaders, Origin: 'https://evil.test' } })).status).toBe(403);
      expect((await read('/api/project', { headers: { ...cookieHeaders, Origin: 'null' } })).status).toBe(403);
      expect((await read('/api/project', { headers: { ...cookieHeaders, Origin: `http://${headers.Host}` } })).status).toBe(403);
      expect((await read('/api/mobile/disconnect', { method: 'POST', headers: cookieHeaders })).status).toBe(200);
      expect((await read('/api/project', { headers: cookieHeaders })).status).toBe(401);
      expect((await read('/api/mobile/status', { headers: { ...headers, Authorization: 'Bearer wrong' } })).status).toBe(401);
    } finally {
      await server.stop();
    }
  }, 30000);

});
