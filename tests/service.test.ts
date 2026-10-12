import { describe, it, expect } from 'vitest';
import { serviceConfiguration } from '../src/service/service.js';
const options = { node: '/some path/node', cli: '/app/dist/cli.js', data: '/owner/data', cwd: '/owner/workspace', host: '127.0.0.1', port: 8321 };
describe('background service manifests', () => {
  it('uses the same persistent owner data and shutdown behavior across platforms', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      const manifest = serviceConfiguration(platform, options);
      expect(manifest).toContain('AGENT_GITU_HOME');
      expect(manifest).toContain('serve');
      expect(manifest).toContain('8321');
      expect(manifest).toContain('/owner/data');
    }
    expect(serviceConfiguration('linux', options)).toContain('Restart=on-failure');
    expect(serviceConfiguration('win32', options)).toContain('90 sec');
  });
  it('escapes service syntax and rejects newline injection', () => {
    expect(serviceConfiguration('darwin', { ...options, data: '/owner/a&b' })).toContain('a&amp;b');
    expect(() => serviceConfiguration('linux', { ...options, host: 'localhost\nExecStart=/bin/sh' })).toThrow('Invalid');
  });
});
