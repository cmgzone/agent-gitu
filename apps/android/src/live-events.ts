import type { RunEvent } from './api';
export type LiveFrame = Omit<RunEvent, 'i' | 'text'> & { i?: number; text?: string; seq?: number };
export interface Reply {
  id: string;
  text: string;
  t: string;
  user: boolean;
  live?: boolean;
}
export interface ToolActivity {
  id: string;
  title: string;
  detail?: string;
  state: 'running' | 'done' | 'failed';
}
export function mergeFrames(current: LiveFrame[], incoming: LiveFrame[]): LiveFrame[] {
  const rows = new Map(current.map((frame) => [frame.i !== undefined ? `row:${frame.i}` : `native:${frame.seq}`, frame]));
  for (const frame of incoming) if (typeof frame.i === 'number' || typeof frame.seq === 'number') rows.set(frame.i !== undefined ? `row:${frame.i}` : `native:${frame.seq}`, frame);
  return [...rows.values()].sort((a, b) => a.t.localeCompare(b.t) || (a.i ?? a.seq ?? 0) - (b.i ?? b.seq ?? 0));
}
export function projectLiveFrames(frames: LiveFrame[]) {
  const replies: Reply[] = [],
    tools: ToolActivity[] = [];
  let draft: Reply | undefined,
    reasoning = '';
  const seen = new Set<number>();
  for (const frame of frames) {
    const text = frame.text || '',
      typed = frame.typed;
    const id = String(frame.i ?? `native-${frame.seq}`);
    if (/^(tdelta|thought) /.test(text)) {
      const chunk = text.slice(text.startsWith('tdelta ') ? 7 : 8);
      if (!draft) {
        draft = { id, text: '', t: frame.t, user: false, live: true };
        replies.push(draft);
      }
      draft.text += chunk;
    } else if (/^(say|answer|assistant-msg|summary)\s/.test(text)) {
      const final = text.replace(/^\S+\s+/, '');
      if (draft) {
        draft.text = final;
        draft.live = false;
        draft = undefined;
      } else if (final.trim()) replies.push({ id, text: final, t: frame.t, user: false });
    } else if (/^user-msg\s/.test(text)) {
      if (draft) draft.live = false;
      draft = undefined;
      reasoning = '';
      replies.push({ id, text: text.replace(/^\S+\s+/, ''), t: frame.t, user: true });
    } else if (/^(blocked|error|warn)\s/.test(text)) replies.push({ id, text: text.replace(/^\S+\s+/, ''), t: frame.t, user: false });
    if (text === 'activity reasoning-reset') reasoning = '';
    if (text.startsWith('activity reasoning-delta ')) {
      try {
        const chunk: unknown = JSON.parse(text.slice(25));
        if (typeof chunk === 'string') reasoning += chunk;
      } catch {
        /* incomplete frame */
      }
    }
    const seq = typed?.seq;
    if (typeof seq === 'number') {
      if (seen.has(seq)) continue;
      seen.add(seq);
    }
    if (typed?.type === 'reasoning' && typeof typed.text === 'string') reasoning = typed.text;
    if (typed?.type === 'command_started' || typed?.type === 'test_started')
      tools.push({ id, title: typed.type === 'test_started' ? 'Running checks' : 'Running command', detail: String(typed.command || ''), state: 'running' });
    else if (typed?.type === 'command_finished' || typed?.type === 'test_finished') {
      const command = String(typed.command || ''),
        previous = [...tools].reverse().find((tool) => tool.state === 'running' && tool.detail === command);
      const state = typed.ok === false || typed.status === 'failed' ? 'failed' : 'done';
      if (previous) previous.state = state;
      else tools.push({ id, title: 'Command finished', detail: command, state });
    } else if (typed?.type === 'file_read' || typed?.type === 'file_changed')
      tools.push({ id, title: typed.type === 'file_read' ? 'Read file' : 'Updated file', detail: String(typed.path || ''), state: 'done' });
    else if ((!typed || typed.type === 'log') && /^run\s/.test(text)) tools.push({ id, title: 'Using tool', detail: text.replace(/^run\s+/, ''), state: 'running' });
    else if ((!typed || typed.type === 'log') && /^(ok|denied|error)\s/.test(text)) {
      const previous = [...tools].reverse().find((tool) => tool.state === 'running');
      if (previous) previous.state = /^ok\s/.test(text) ? 'done' : 'failed';
    }
    if (/^activity tool|^done\s|^stopped\s/.test(text) && draft) {
      draft.live = false;
      draft = undefined;
    }
  }
  return { replies: replies.filter((reply) => reply.text.trim()), reasoning: reasoning.slice(-24000), tools };
}
