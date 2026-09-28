import { describe, expect, it } from 'vitest';
import { execTurnArgs, type CodexExecThreadConfig } from '../src/llm/codex-exec.js';

const config: CodexExecThreadConfig = {
  executable: 'codex.exe',
  config: ['features.shell_tool=false', 'features.unified_exec=false', 'developer_instructions="Be brief."'],
  model: 'gpt-5.6-sol',
  workingDirectory: 'C:\\workspace',
  networkAccessEnabled: false,
  webSearchMode: 'disabled',
  approvalPolicy: 'never',
  modelReasoningEffort: 'high',
};

describe('Codex exec transport', () => {
  it('always detaches the turn from the user Codex configuration', () => {
    const { args } = execTurnArgs(config, [{ type: 'text', text: 'Hello' }]);
    expect(args.slice(0, 3)).toEqual(['exec', '--experimental-json', '--ignore-user-config']);
  });

  it('passes the app protocol, sandbox and tool-surface overrides verbatim', () => {
    const { args } = execTurnArgs(config, [{ type: 'text', text: 'Hello' }]);
    const pairs = args.flatMap((arg, index) => (arg === '--config' ? [args[index + 1]!] : []));
    expect(pairs).toEqual([
      'features.shell_tool=false',
      'features.unified_exec=false',
      'developer_instructions="Be brief."',
      'model_reasoning_effort="high"',
      'sandbox_workspace_write.network_access=false',
      'web_search="disabled"',
      'approval_policy="never"',
    ]);
    expect(args).toContain('--skip-git-repo-check');
    const modelAt = args.indexOf('--model');
    expect(args.slice(modelAt, modelAt + 2)).toEqual(['--model', 'gpt-5.6-sol']);
    const sandboxAt = args.indexOf('--sandbox');
    expect(args[sandboxAt + 1]).toBe('read-only');
    const cdAt = args.indexOf('--cd');
    expect(args.slice(cdAt, cdAt + 2)).toEqual(['--cd', 'C:\\workspace']);
  });

  it('resumes a known thread and appends images after it', () => {
    const { args, prompt, images } = execTurnArgs(
      config,
      [{ type: 'text', text: 'Inspect' }, { type: 'local_image', path: 'C:\\temp\\shot.png' }],
      'thread-1',
    );
    const resumeAt = args.indexOf('resume');
    expect(args.slice(resumeAt, resumeAt + 2)).toEqual(['resume', 'thread-1']);
    expect(args.slice(resumeAt + 2)).toEqual(['--image', 'C:\\temp\\shot.png']);
    expect(prompt).toBe('Inspect');
    expect(images).toEqual(['C:\\temp\\shot.png']);
  });

  it('delivers a bare prompt without images and never a resume for a fresh thread', () => {
    const { args, prompt, images } = execTurnArgs(config, 'Just answer.');
    expect(args).not.toContain('resume');
    expect(args).not.toContain('--image');
    expect(prompt).toBe('Just answer.');
    expect(images).toEqual([]);
  });
});
