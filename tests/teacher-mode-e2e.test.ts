import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { reflectOnDemonstration, TeachingRecorder } from '../src/cowork/teaching.js';
import { PendingSkillStore } from '../src/skills/pending.js';
import { SkillStore } from '../src/skills/skills.js';

/**
 * End-to-end check of the learning path without Docker: record an episode,
 * reflect with a stubbed model, stage the result, then install it through the
 * same store the approval endpoint uses.
 */
describe('teacher mode end to end', () => {
  it('records a demonstration, reflects, stages and installs the skill', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-e2e-'));
    const recorder = new TeachingRecorder(path.join(root, 'Teaching'));
    recorder.start('agent-e2e', 'Import CSV from the file menu');

    // Simulate what the desktop view posts for a short demonstration.
    recorder.record('agent-e2e', [
      { t: 100, kind: 'click', x: 210, y: 48 },
      { t: 900, kind: 'click', x: 640, y: 332 },
      { t: 1400, kind: 'key', key: 'Return', down: true },
    ]);
    // One JPEG keyframe, as desktopScreenshot would return it.
    const frameBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const frame = recorder.addFrame('agent-e2e', frameBytes.toString('base64'));
    expect(frame?.file).toBe('frame-01.jpg');

    const finished = recorder.finish('agent-e2e');
    expect(finished).toBeDefined();

    // Capture what the model is actually shown.
    const seen: { system: string; user: string; images: number } = { system: '', user: '', images: 0 };
    const llm = {
      complete: vi.fn(async (messages: any[]) => {
        const system = messages.find((m) => m.role === 'system');
        const user = messages.find((m) => m.role === 'user');
        seen.system = typeof system?.content === 'string' ? system.content : '';
        if (Array.isArray(user?.content)) {
          seen.user = user.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
          seen.images = user.content.filter((p: any) => p.type === 'image_url').length;
        } else {
          seen.user = String(user?.content ?? '');
        }
        return JSON.stringify({
          name: 'Import CSV From File Menu',
          description: 'Use when the user asks to import a CSV export from the desktop app.',
          instructions: '1. Open the File menu in the top bar.\n2. Choose Import and select the CSV.\n3. Press Return to confirm the import.',
        });
      }),
    };

    const proposal = await reflectOnDemonstration({
      episode: finished!.episode,
      dir: finished!.dir,
      agentName: 'P',
      llm: llm as never,
      existingSkills: ['browser-workflow'],
    });

    // The model must receive the timeline and the keyframe image.
    expect(seen.images).toBe(1);
    expect(seen.user).toContain('Import CSV from the file menu');
    expect(seen.user).toContain('click at (210, 48)');
    expect(seen.user).toContain('key Return');
    expect(seen.user).toContain('browser-workflow');
    expect(seen.user).toContain('Never copy literal values');

    expect(proposal).toEqual({
      name: 'Import CSV From File Menu',
      description: 'Use when the user asks to import a CSV export from the desktop app.',
      instructions: expect.stringContaining('Open the File menu'),
    });

    // Stage exactly as stageDemonstratedSkill does.
    const skills = new SkillStore(path.join(root, '.hermes', 'skills'));
    const stagedRoot = path.join(root, 'Pending', 'skills');
    mkdirSync(stagedRoot, { recursive: true });
    const stagedPath = skills.stageSkillDir({
      name: proposal!.name,
      description: proposal!.description,
      instructions: proposal!.instructions,
      stagedRoot,
      id: 'psk-e2e',
      frames: [{ file: 'demo-frame-01.jpg', bytes: frameBytes }],
    });
    const pending = new PendingSkillStore(path.join(root, 'skills.json'));
    pending.addStaged({ name: proposal!.name, description: proposal!.description, stagedPath, agentName: 'P.', source: 'Demonstrated on the desktop' });

    const queued = pending.pending();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.stagedPath).toBe(stagedPath);

    // Approve it the way the HTTP endpoint does.
    const installed = skills.installStagedDir(stagedPath, { scope: 'project' });
    expect(installed.name).toBe('import-csv-from-file-menu');
    expect(installed.instructions).toContain('Open the File menu');
    expect(skills.list().some((skill) => skill.name === 'import-csv-from-file-menu')).toBe(true);
    // Keyframes land beside the installed skill as review evidence.
    const evidence = path.join(root, '.hermes', 'skills', 'import-csv-from-file-menu', 'references', 'demo-frame-01.jpg');
    expect(Buffer.from(require('node:fs').readFileSync(evidence)).equals(frameBytes)).toBe(true);
  });

  it('returns undefined when the model replies without a usable skill', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-teach-e2e2-'));
    const recorder = new TeachingRecorder(path.join(root, 'Teaching'));
    recorder.start('agent-none', 'Nothing');
    const finished = recorder.finish('agent-none');
    const proposal = await reflectOnDemonstration({
      episode: finished!.episode,
      dir: finished!.dir,
      agentName: 'P',
      llm: { complete: async () => 'I could not find anything reusable.' } as never,
    });
    expect(proposal).toBeUndefined();
  });
});
