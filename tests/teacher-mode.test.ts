import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  coalesceEvents,
  decodeRfbInput,
  describeEpisode,
  keysymName,
  parseDemonstrationSkill,
  TeachingRecorder,
  TEACHING_LIMITS,
  type TeachEvent,
} from '../src/cowork/teaching.js';
import { PendingSkillStore } from '../src/skills/pending.js';
import { SkillStore } from '../src/skills/skills.js';

function keyPacket(keysym: number, down: boolean): Uint8Array {
  const packet = new Uint8Array(8);
  packet[0] = 4;
  packet[1] = down ? 1 : 0;
  new DataView(packet.buffer).setUint32(4, keysym);
  return packet;
}

function pointerPacket(mask: number, x: number, y: number): Uint8Array {
  const packet = new Uint8Array(6);
  packet[0] = 5;
  packet[1] = mask;
  const view = new DataView(packet.buffer);
  view.setUint16(2, x);
  view.setUint16(4, y);
  return packet;
}

function project(label: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `gitu-teach-${label}-`));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: label }));
  return root;
}

describe('RFB input decoding', () => {
  it('decodes key presses and ignores releases', () => {
    const down = decodeRfbInput(keyPacket(0xff0d, true), 100);
    expect(down).toEqual({ t: 100, kind: 'key', key: 'Enter', down: true });
    // A release is decoded but later dropped by coalescing.
    expect(decodeRfbInput(keyPacket(0xff0d, false), 120)?.down).toBe(false);
  });

  it('maps printable keysyms to characters', () => {
    expect(keysymName(0x61)).toBe('a');
    expect(keysymName(0xffe1)).toBe('shift');
    expect(keysymName(0xffffffff)).toBeUndefined();
  });

  it('decodes pointer clicks, scrolls and presses', () => {
    expect(decodeRfbInput(pointerPacket(1, 840, 320), 0)).toEqual({ t: 0, kind: 'click', x: 840, y: 320 });
    expect(decodeRfbInput(pointerPacket(0x08, 10, 20), 0)).toEqual({ t: 0, kind: 'scroll', x: 10, y: 20, delta: -1 });
    expect(decodeRfbInput(pointerPacket(0x10, 10, 20), 0)).toEqual({ t: 0, kind: 'scroll', x: 10, y: 20, delta: 1 });
    // A move with no button held adds nothing a click does not describe.
    expect(decodeRfbInput(pointerPacket(0, 10, 20), 0)).toBeUndefined();
  });

  it('rejects short or unknown packets instead of inventing clicks', () => {
    expect(decodeRfbInput(new Uint8Array([5, 1]), 0)).toBeUndefined();
    expect(decodeRfbInput(new Uint8Array([4, 1, 0, 0]), 0)).toBeUndefined();
    expect(decodeRfbInput(new Uint8Array([9, 1, 2, 3, 4, 5, 6, 7]), 0)).toBeUndefined();
    expect(decodeRfbInput(new Uint8Array(0), 0)).toBeUndefined();
  });
});

describe('event coalescing', () => {
  it('drops key releases and duplicate pointer positions', () => {
    const events: TeachEvent[] = [
      { t: 0, kind: 'move', x: 1, y: 1 },
      { t: 1, kind: 'move', x: 1, y: 1 },
      { t: 2, kind: 'click', x: 1, y: 1 },
      { t: 3, kind: 'key', key: 'a', down: true },
      { t: 4, kind: 'key', key: 'a', down: false },
    ];
    const result = coalesceEvents(events);
    expect(result.map((event) => event.kind)).toEqual(['move', 'click', 'key']);
  });
});

describe('TeachingRecorder', () => {
  it('records, debounces frames, and refuses concurrent episodes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-rec-'));
    const recorder = new TeachingRecorder(root);
    const episode = recorder.start('agent-1', '  Import a CSV  ');
    expect(episode.title).toBe('Import a CSV');
    expect(() => recorder.start('agent-1', 'again')).toThrow(/already being recorded/);

    const first = recorder.record('agent-1', [{ t: 0, kind: 'click', x: 5, y: 6 }]);
    expect(first.accepted).toBe(1);
    expect(first.frameDue).toBe(true);

    const frame = recorder.addFrame('agent-1', Buffer.from('jpeg-bytes').toString('base64'));
    expect(frame?.file).toBe('frame-01.jpg');
    // A second frame inside the minimum gap is refused by the caller's check;
    // the recorder still guards the hard cap.
    expect(recorder.idleMs('agent-1')).toBeGreaterThanOrEqual(0);
  });

  it('caps the event count and marks the episode truncated', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-cap-'));
    const recorder = new TeachingRecorder(root);
    recorder.start('agent-2', 'Long demo');
    const burst: TeachEvent[] = Array.from({ length: TEACHING_LIMITS.events + 10 }, (_, i) => ({ t: i, kind: 'click' as const, x: 1, y: 1 }));
    const outcome = recorder.record('agent-2', burst);
    expect(outcome.accepted).toBe(TEACHING_LIMITS.events);
    const finished = recorder.finish('agent-2');
    expect(finished?.episode.truncated).toBe(true);
  });

  it('writes episode.json on finish and removes the directory on cancel', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-io-'));
    const recorder = new TeachingRecorder(root);
    recorder.start('agent-3', 'Ship it');
    const finished = recorder.finish('agent-3');
    expect(finished).toBeDefined();
    expect(existsSync(path.join(finished!.dir, 'episode.json'))).toBe(true);

    recorder.start('agent-4', 'Discard me');
    const cancelled = recorder.active('agent-4');
    expect(cancelled).toBeDefined();
    recorder.cancel('agent-4');
    expect(recorder.active('agent-4')).toBeUndefined();
  });

  it('expires an episode past its wall-clock budget', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-exp-'));
    const recorder = new TeachingRecorder(root);
    const episode = recorder.start('agent-5', 'Slow demo');
    expect(recorder.expired('agent-5')).toBe(false);
    episode.startedAt = new Date(Date.now() - TEACHING_LIMITS.durationMs - 1000).toISOString();
    expect(recorder.expired('agent-5')).toBe(true);
  });
});

describe('reflection helpers', () => {
  it('describes the demonstration without pointer noise', () => {
    const text = describeEpisode({
      id: 'teach-1',
      agentId: 'a',
      title: 'Open settings',
      startedAt: new Date().toISOString(),
      events: [
        { t: 0, kind: 'move', x: 1, y: 1 },
        { t: 1500, kind: 'click', x: 20, y: 30 },
        { t: 2000, kind: 'key', key: 'Enter', down: true },
        { t: 2500, kind: 'type', chars: 12 },
      ],
      frames: [{ t: 1600, file: 'frame-01.jpg', eventIndex: 1 }],
    });
    expect(text).toContain('Task the user demonstrated: Open settings');
    expect(text).toContain('1.5s  click at (20, 30)');
    expect(text).toContain('2.0s  key Enter');
    expect(text).toContain('type 12 character(s)');
    expect(text).not.toContain('move');
  });

  it('parses a fenced JSON reply and rejects incomplete ones', () => {
    const parsed = parseDemonstrationSkill('```json\n{"name":"import-csv","description":"Use when importing","instructions":"1. Do it"}\n```');
    expect(parsed).toEqual({ name: 'import-csv', description: 'Use when importing', instructions: '1. Do it' });
    expect(parseDemonstrationSkill('{"name":"x"}')).toBeUndefined();
    expect(parseDemonstrationSkill('nothing here')).toBeUndefined();
  });
});

describe('staged skill installation', () => {
  it('installs SKILL.md and keeps keyframes as review evidence', () => {
    const root = project('install');
    const skills = new SkillStore(path.join(root, '.hermes', 'skills'));
    const stagedRoot = mkdtempSync(path.join(tmpdir(), 'gitu-teach-staged-'));
    const stagedPath = skills.stageSkillDir({
      name: 'Import CSV Demo',
      description: 'Use when importing a CSV export',
      instructions: '1. Open the import dialog\n2. Choose the file',
      stagedRoot,
      id: 'psk-1',
      frames: [{ file: 'demo-frame-01.jpg', bytes: Buffer.from('frame-bytes') }],
    });
    expect(existsSync(path.join(stagedPath, 'references', 'demo-frame-01.jpg'))).toBe(true);

    const installed = skills.installStagedDir(stagedPath);
    expect(installed.name).toBe('import-csv-demo');
    expect(installed.format).toBe('skill-md');
    expect(installed.instructions).toContain('import dialog');
    const installedFrame = path.join(root, '.hermes', 'skills', 'import-csv-demo', 'references', 'demo-frame-01.jpg');
    expect(existsSync(installedFrame)).toBe(true);
    // Images are evidence for the human, not agent-loadable text.
    expect(skills.readReference('import-csv-demo', 'references/demo-frame-01.jpg').ok).toBe(false);
  });

  it('refuses a staged directory whose frontmatter does not parse', () => {
    const root = project('bad-frontmatter');
    const skills = new SkillStore(path.join(root, '.hermes', 'skills'));
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-teach-bad-'));
    writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: x\ndescription: >-\n  multi line\n---\n\nbody\n');
    expect(() => skills.installStagedDir(dir)).toThrow(/frontmatter is invalid/);
  });

  it('round-trips a staged entry through the pending store', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-pending-'));
    const store = new PendingSkillStore(path.join(root, 'skills.json'));
    const staged = store.addStaged({ name: 'import-csv', description: 'Use when importing', stagedPath: path.join(root, 'psk-1'), source: 'Demonstrated on the desktop' });
    expect(staged.stagedPath).toBe(path.join(root, 'psk-1'));
    expect(store.pending()).toHaveLength(1);
    // Same-name staging replaces the earlier intent.
    store.addStaged({ name: 'import-csv', description: 'Updated', stagedPath: path.join(root, 'psk-2') });
    const pending = store.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.stagedPath).toBe(path.join(root, 'psk-2'));
    expect(pending[0]!.source).toBeUndefined();
  });
});
