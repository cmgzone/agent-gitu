import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { PUSH_BRIDGE_JS, pushBridgeScript, pushTarget } from '../apps/mobile/src/gitu/push-protocol.js';

interface BridgeWindow {
  top?: unknown;
  window?: unknown;
  ReactNativeWebView?: { postMessage(raw: string): void };
  __gituPushReply?: (reply: { id: string; result: unknown }) => void;
  gituAndroidPush?: { enable(): Promise<unknown>; disable(): Promise<unknown>; refresh(token: string): Promise<unknown> };
}

describe('Android notification bridge', () => {
  it('uses only previously enabled workspace origins and rejects arbitrary navigation', () => {
    const saved = { 'https://gitu.example': { enabled: true, workspaceId: 'known-workspace' } };
    expect(pushTarget({ workspaceId: 'known-workspace', target: 'run', targetId: 'run-1', url: 'https://evil.example' }, saved)).toEqual({
      server: 'https://gitu.example',
      target: 'run',
      targetId: 'run-1',
    });
    expect(pushTarget({ workspaceId: 'unknown', target: 'run', targetId: 'run-1' }, saved)).toBeUndefined();
    expect(pushTarget({ workspaceId: 'known-workspace', target: 'run', targetId: '../../secret' }, saved)).toBeUndefined();
    expect(pushTarget({ workspaceId: 'known-workspace', target: 'cowork', targetId: 'chat-1', companyId: '../secret' }, saved)).toBeUndefined();
    expect(pushTarget({ workspaceId: 'known-workspace', target: 'cowork', targetId: 'chat-1', threadId: '../secret' }, saved)).toBeUndefined();
    expect(pushTarget({ workspaceId: 'known-workspace', target: 'cowork', targetId: 'chat-1', threadId: 'topic-99' }, saved)).toEqual({
      server: 'https://gitu.example',
      target: 'cowork',
      targetId: 'chat-1',
      threadId: 'topic-99',
    });
    expect(
      pushTarget({ workspaceId: 'known-workspace', target: 'home', targetId: '' }, { 'https://gitu.example': { ...saved['https://gitu.example'], enabled: false } }),
    ).toBeUndefined();
  });

  it('registers using the WebView session and refreshes supplied tokens without requesting another token', async () => {
    const actions: string[] = [],
      bodies: unknown[] = [];
    const window: BridgeWindow = {};
    window.top = window;
    window.window = window;
    window.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const message = JSON.parse(raw);
        expect(message.nonce).toBe('f'.repeat(64));
        actions.push(message.action);
        const result =
          message.action === 'status'
            ? { deviceId: 'device-1', enabled: true, supported: true, permission: 'granted' }
            : message.action === 'enable'
              ? { deviceId: 'device-1', token: 'initial-fcm-token' }
              : {};
        queueMicrotask(() => window.__gituPushReply!({ id: message.id, result }));
      },
    };
    const fetch = vi.fn(async (_url: string, options: { body?: string; credentials: string }) => {
      expect(options.credentials).toBe('same-origin');
      bodies.push(options.body && JSON.parse(options.body));
      return { ok: true, json: async () => ({ workspaceId: 'workspace-1', enabled: true, available: true }) };
    });
    runInNewContext(pushBridgeScript('f'.repeat(64)), { window, fetch, setTimeout, clearTimeout });
    await window.gituAndroidPush!.enable();
    expect(bodies).toContainEqual({ deviceId: 'device-1', token: 'initial-fcm-token' });
    actions.length = 0;
    await window.gituAndroidPush!.refresh('rotated-fcm-token');
    expect(actions).toEqual(['status', 'remember']);
    expect(bodies).toContainEqual({ deviceId: 'device-1', token: 'rotated-fcm-token' });
    await window.gituAndroidPush!.disable();
    expect(actions).toContain('remember');
  });

  it('does not expose the bridge to embedded frames', () => {
    const window = { top: {}, ReactNativeWebView: {} };
    runInNewContext(PUSH_BRIDGE_JS, { window });
    expect(window).not.toHaveProperty('gituAndroidPush');
    expect(() => pushBridgeScript('invalid-nonce')).toThrow();
  });
});
