import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';

const tempDirs: string[] = [];

function createTempStore(): CoworkStore {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-avatar-test-'));
  tempDirs.push(dir);
  return new CoworkStore(path.join(dir, 'cowork.json'));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('CoworkStore custom agent avatars', () => {
  it('saves, serves, preserves across profile edits, replaces, and deletes custom avatars', () => {
    const store = createTempStore();
    const agent = store.saveAgent({
      name: 'Nova',
      tagline: 'Deploy Lead',
      systemPrompt: 'Help deploy apps safely.',
      avatar: { shape: 'dot-nova', color: '#9c6df2' },
    });

    // Save PNG avatar
    const updated = store.saveAgentAvatar(agent.id, TINY_PNG, 'image/png');
    expect(updated.avatar.imageUrl).toMatch(new RegExp(`^/api/cowork/agents/${agent.id}/avatar\\?v=\\d+$`));

    const storedFile = store.agentAvatarFile(agent.id);
    expect(storedFile).toBeDefined();
    expect(storedFile?.mime).toBe('image/png');
    expect(readFileSync(storedFile!.filePath).equals(TINY_PNG)).toBe(true);

    // Updating agent color/name without passing imageUrl preserves the custom avatar
    const edited = store.saveAgent({
      id: agent.id,
      name: 'Nova',
      tagline: 'Release Lead',
      systemPrompt: 'Help deploy apps safely.',
      avatar: { shape: 'dot-orb', color: '#4c7df0' },
    });
    expect(edited.avatar.color).toBe('#4c7df0');
    expect(edited.avatar.shape).toBe('dot-orb');
    expect(edited.avatar.imageUrl).toBe(updated.avatar.imageUrl);

    // Replacing PNG with JPEG removes old PNG and writes JPEG
    const replaced = store.saveAgentAvatar(agent.id, TINY_JPEG, 'image/jpeg');
    expect(replaced.avatar.imageUrl).toMatch(new RegExp(`^/api/cowork/agents/${agent.id}/avatar\\?v=\\d+$`));
    const jpegFile = store.agentAvatarFile(agent.id);
    expect(jpegFile?.mime).toBe('image/jpeg');
    expect(readFileSync(jpegFile!.filePath).equals(TINY_JPEG)).toBe(true);

    // Explicitly clearing imageUrl or calling deleteAgentAvatar removes file and clears URL
    const cleared = store.deleteAgentAvatar(agent.id);
    expect(cleared?.avatar.imageUrl).toBeUndefined();
    expect(store.agentAvatarFile(agent.id)).toBeUndefined();
  });

  it('rejects untrusted external avatar URLs during sanitization and cleans up files on deleteAgent', () => {
    const store = createTempStore();
    const agent = store.saveAgent({
      name: 'Atlas',
      tagline: 'Cloud Architect',
      systemPrompt: 'Manage cloud servers.',
      avatar: {
        shape: 'dot-block',
        color: '#4c7df0',
        imageUrl: 'javascript:alert(1)',
      },
    });
    expect(agent.avatar.imageUrl).toBeUndefined();

    store.saveAgentAvatar(agent.id, TINY_PNG, 'image/png');
    expect(store.agentAvatarFile(agent.id)).toBeDefined();

    expect(store.deleteAgent(agent.id)).toBe(true);
    expect(store.agentAvatarFile(agent.id)).toBeUndefined();
  });
});
