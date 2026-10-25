import { describe, expect, it } from 'vitest';
import { privateCodingToolParams, privateProjectForCoding } from '../src/coding/project-selection.js';

describe('private coding workspace handoff', () => {
  it('uses the folder named in the brief instead of a generic desktop root', () => {
    const goal = 'Repair the build. Work in /workspace/merishawschool and preserve the article.';
    expect(privateProjectForCoding(undefined, goal)).toBe('/workspace/merishawschool');
    expect(privateProjectForCoding('/workspace', goal)).toBe('/workspace/merishawschool');
    expect(privateProjectForCoding('merishawschool', goal)).toBe('/workspace/merishawschool');
    expect(() => privateProjectForCoding('/workspace/other', goal)).toThrow('Folder mismatch');
    expect(() => privateProjectForCoding(undefined, 'Work in /workspace/one; compare the repository /workspace/two.')).toThrow('several project folders');
    expect(() => privateProjectForCoding('/etc')).toThrow('inside /workspace');
  });

  it('binds relative commands and files to that project while preserving explicit file locations', () => {
    const root = '/workspace/merishawschool';
    expect(privateCodingToolParams(root, 'run_command', { command: 'npm run build' })).toEqual({ command: "cd '/workspace/merishawschool' && (\nnpm run build\n)" });
    expect(privateCodingToolParams(root, 'read_file', { path: 'package.json' })).toEqual({ path: root + '/package.json' });
    expect(privateCodingToolParams(root, 'list_files', {})).toEqual({ path: root });
    expect(privateCodingToolParams(root, 'read_file', { path: '/home/agent/Downloads/image.png' })).toEqual({ path: '/home/agent/Downloads/image.png' });
    expect(privateCodingToolParams(root, 'computer_process', { action: 'status', id: 'job-1' })).toEqual({ action: 'status', id: 'job-1' });
  });

  it('quotes the directory and keeps every compound command behind the successful directory change', () => {
    const routed = privateCodingToolParams("/workspace/team's site", 'run_command', { command: 'false; echo diagnostic' });
    expect(routed.command).toBe("cd '/workspace/team'\"'\"'s site' && (\nfalse; echo diagnostic\n)");
    expect(() => privateProjectForCoding('/workspace/project\nother')).toThrow('Linux project path');
  });
});
