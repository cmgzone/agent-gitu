import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { App, Credential } from 'firebase-admin/app';
import { SecretVault } from '../connections/secret-vault.js';
import { readCredentialJson, updateCredentialJson } from '../llm/credential-file.js';
import { logger } from './logger.js';

export const PUSH_CHANNEL = 'gitu-workspace';
export interface PushNotice {
  id: string;
  at: number;
  kind: 'completed' | 'failed' | 'attention' | 'reply' | 'test';
  target: 'run' | 'cowork' | 'home';
  targetId: string;
  companyId?: string;
}
export interface PushSender {
  send(token: string, workspaceId: string, notice: PushNotice): Promise<void>;
  close?(): Promise<void>;
}
type Sealed = ReturnType<SecretVault['seal']>;
interface Device {
  id: string;
  owner: string;
  token: Sealed;
  createdAt: number;
  updatedAt: number;
  sent: string[];
}
interface Devices {
  version: 1;
  devices: Device[];
}
const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{16,80}$/.test(value);
const workspaceId = (owner: string) => createHash('sha256').update(owner).digest('hex').slice(0, 32);
const description: Record<PushNotice['kind'], string> = {
  completed: 'Your task is complete.',
  failed: 'A task needs your attention.',
  attention: 'Gitu is waiting for your review or answer.',
  reply: 'A teammate has replied.',
  test: 'Android notifications are connected.',
};

/** Firebase credentials are resolved only on the server through ADC or an env secret. */
export class FcmPushSender implements PushSender {
  private app?: App;
  constructor(private readonly projectId: string) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw Error('Invalid FCM project ID.');
  }
  async send(token: string, workspace: string, notice: PushNotice): Promise<void> {
    const { initializeApp, applicationDefault, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const serviceAccountJson = process.env['AGENT_GITU_FCM_SERVICE_ACCOUNT_JSON']?.trim();
    let credential: Credential;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson) as {
        project_id?: unknown;
        client_email?: unknown;
        private_key?: unknown;
      };
      if (
        serviceAccount.project_id !== this.projectId ||
        typeof serviceAccount.client_email !== 'string' ||
        typeof serviceAccount.private_key !== 'string'
      )
        throw Error('Invalid FCM service-account configuration.');
      credential = cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      });
    } else {
      credential = applicationDefault();
    }
    this.app ??= initializeApp({ projectId: this.projectId, credential }, 'gitu-push-' + randomUUID());
    const data = { workspaceId: workspace, target: notice.target, targetId: notice.targetId, ...(notice.companyId ? { companyId: notice.companyId } : {}) };
    await getMessaging(this.app).send({
      token,
      notification: { title: 'Agent Gitu', body: description[notice.kind] },
      data,
      android: {
        priority: 'high',
        ttl: 60 * 60 * 1000,
        notification: {
          channelId: PUSH_CHANNEL,
          tag: createHash('sha256').update(notice.id).digest('hex').slice(0, 32),
          visibility: 'private',
          defaultSound: true,
        },
      },
    });
  }
  async close(): Promise<void> {
    if (this.app) {
      const { deleteApp } = await import('firebase-admin/app');
      await deleteApp(this.app);
      this.app = undefined;
    }
  }
}

/** Owner-scoped opt-in devices; reusable tokens never appear in API responses. */
export class MobilePush {
  private readonly file: string;
  private readonly vault: SecretVault;
  private tail = Promise.resolve();
  private pending = new Set<string>();
  private stopped = false;
  constructor(
    root: string,
    private readonly owner: () => string,
    private readonly sender?: PushSender,
  ) {
    this.file = path.join(root, 'mobile-push.json');
    this.vault = new SecretVault(path.join(root, 'mobile-push-secrets'));
  }
  get available(): boolean {
    return !!this.sender;
  }
  private decode(value: unknown): Devices {
    const data = value as Devices;
    if (
      data?.version !== 1 ||
      !Array.isArray(data.devices) ||
      data.devices.length > 32 ||
      data.devices.some(
        (d) =>
          !validId(d.id) ||
          typeof d.owner !== 'string' ||
          !d.token?.data ||
          !d.token.iv ||
          !d.token.tag ||
          !Number.isFinite(d.createdAt) ||
          !Number.isFinite(d.updatedAt) ||
          !Array.isArray(d.sent) ||
          d.sent.length > 128 ||
          d.sent.some((id) => typeof id !== 'string'),
      )
    )
      throw Error('Invalid notification settings.');
    return data;
  }
  private read(): Devices {
    return readCredentialJson(this.file, (value) => this.decode(value)) ?? { version: 1, devices: [] };
  }
  private update(work: (data: Devices) => Devices): void {
    updateCredentialJson(
      this.file,
      (value) => this.decode(value),
      (current) => work(current ?? { version: 1, devices: [] }),
    );
  }
  private deviceId(value: unknown): string {
    if (!validId(value)) throw Error('Invalid notification device ID.');
    return value;
  }
  status(id: unknown) {
    const deviceId = this.deviceId(id),
      owner = this.owner();
    return { available: this.available, enabled: this.read().devices.some((d) => d.id === deviceId && d.owner === owner), workspaceId: workspaceId(owner) };
  }
  register(id: unknown, value: unknown) {
    if (!this.available) throw Error('The server owner must configure Firebase notifications first.');
    const deviceId = this.deviceId(id),
      owner = this.owner();
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:~-]{20,4096}$/.test(value)) throw Error('Invalid Android notification token.');
    const token = this.vault.seal(owner + ':' + deviceId, value),
      now = Date.now();
    this.update((data) => {
      const devices = data.devices.filter((d) => now - d.updatedAt < 90 * 24 * 60 * 60 * 1000);
      const previous = devices.find((d) => d.id === deviceId && d.owner === owner);
      if (!previous && devices.length >= 32) throw Error('Remove an unused notification device first.');
      return {
        version: 1,
        devices: [...devices.filter((d) => d !== previous), { id: deviceId, owner, token, createdAt: previous?.createdAt ?? now, updatedAt: now, sent: previous?.sent ?? [] }],
      };
    });
    return this.status(deviceId);
  }
  unregister(id: unknown): void {
    const deviceId = this.deviceId(id),
      owner = this.owner();
    this.update((data) => ({ ...data, devices: data.devices.filter((d) => d.id !== deviceId || d.owner !== owner) }));
  }
  get hasDevices(): boolean {
    return this.available && this.read().devices.some((d) => d.owner === this.owner());
  }
  notify(notice: PushNotice): void {
    if (!this.sender || this.stopped || !Number.isFinite(notice.at) || Date.now() - notice.at > 24 * 60 * 60 * 1000 || this.pending.has(notice.id) || this.pending.size >= 128)
      return;
    this.pending.add(notice.id);
    this.tail = this.tail
      .then(async () => {
        if (this.stopped) return;
        await this.deliver(notice);
      })
      .catch(() => {
        logger.warn({ subsystem: 'push' }, 'Notification delivery unavailable');
      })
      .finally(() => {
        this.pending.delete(notice.id);
      });
  }
  private async deliver(notice: PushNotice, only?: string): Promise<void> {
    const owner = this.owner();
    for (const device of this.read().devices) {
      if (
        this.stopped ||
        device.owner !== owner ||
        (only && device.id !== only) ||
        device.createdAt > notice.at ||
        Date.now() - device.updatedAt >= 90 * 24 * 60 * 60 * 1000 ||
        device.sent.includes(notice.id)
      )
        continue;
      // Recheck revocation and token rotation immediately before sending.
      const current = this.read().devices.find((d) => d.id === device.id && d.owner === owner);
      if (!current || current.token.data !== device.token.data) continue;
      try {
        await this.sender!.send(this.vault.open<string>(owner + ':' + device.id, device.token), workspaceId(owner), notice);
        this.update((data) => ({ ...data, devices: data.devices.map((d) => (d.id === device.id && d.owner === owner ? { ...d, sent: [...d.sent, notice.id].slice(-128) } : d)) }));
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code ?? '')) {
          this.update((data) => ({ ...data, devices: data.devices.filter((d) => d.id !== device.id || d.owner !== owner || d.token.data !== device.token.data) }));
        }
        // Provider messages may contain device tokens; log only a fixed message.
        logger.warn({ subsystem: 'push' }, 'Notification could not be delivered');
        if (only) throw Error('The test notification could not be sent. Check Firebase configuration.');
      }
    }
  }
  async test(id: unknown): Promise<void> {
    const deviceId = this.deviceId(id);
    if (!this.available || !this.status(deviceId).enabled) throw Error('Enable notifications on this phone first.');
    await this.deliver({ id: randomUUID(), at: Date.now(), kind: 'test', target: 'home', targetId: '' }, deviceId);
  }
  async drain(): Promise<void> {
    await this.tail;
  }
  async close(): Promise<void> {
    this.stopped = true;
    await this.tail;
    await this.sender?.close?.();
  }
}
