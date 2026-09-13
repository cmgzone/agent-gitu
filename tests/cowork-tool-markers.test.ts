import { describe, expect, it } from 'vitest';
import { compactDialectMarkers, parseToolCalls, stripToolMarkers } from '../src/cowork/tools.js';

/** DeepSeek renders DSML with spaces around the pipes, e.g. `<| DSML | invoke ...>`. */
const spacedMarkup = [
  '<| DSML | calls >',
  '<| DSML | invoke name="todo_manage">',
  '<| DSML | parameter name="action" string="true">add<| DSML | parameter>',
  '<| DSML | parameter name="title" string="true">Write the report<| DSML | parameter>',
  '</| DSML | invoke>',
  '</| DSML | calls>',
].join('\n');

/** The compact dialect is what DeepSeek V3.2 emits most of the time. */
const compactMarkup = [
  '<|DSML|calls>',
  '<|DSML|invoke name="list_skills">',
  '<|DSML|parameter name="filter" string="true">all<|DSML|parameter>',
  '</|DSML|invoke>',
  '<|DSML|invoke name="run_command">',
  '<|DSML|parameter name="command" string="true">Write-Host $FOUND<|DSML|parameter>',
  '<|DSML|parameter name="timeoutMs" string="false">60000<|DSML|parameter>',
  '</|DSML|invoke>',
  '</|DSML|calls>',
].join('\n');

describe('compactDialectMarkers', () => {
  it('collapses spaced DSML markers onto the compact form', () => {
    expect(compactDialectMarkers('<| DSML | invoke name="x">')).toBe('<|DSML|invoke name="x">');
    expect(compactDialectMarkers('</| DSML | invoke>')).toBe('</|DSML|invoke>');
    expect(compactDialectMarkers('<|DSML|invoke>')).toBe('<|DSML|invoke>');
  });

  it('leaves ordinary prose untouched', () => {
    expect(compactDialectMarkers('a < b | c > d')).toBe('a < b | c > d');
  });
});

describe('parseToolCalls', () => {
  it('handles the full-width double-pipe dialect captured from live DeepSeek Flash', () => {
    const source = '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="schedule_manage">\n<｜｜DSML｜｜ parameter name="params" string="false">{"action":"create","every":"1d","goal":"Prepare a local brief"}</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>';
    expect(parseToolCalls(source)).toEqual([{ tool: 'schedule_manage', params: { action: 'create', every: '1d', goal: 'Prepare a local brief' } }]);
    for (let i = 1; i <= source.length; i++) expect(stripToolMarkers(source.slice(0, i), true)).toBe('');
    expect(stripToolMarkers(source)).toBe('');
  });
  it('handles empty invocations, wrapped params and typed strings without executing partial calls', () => {
    expect(parseToolCalls('<| DSML | invoke name="list_skills"></| DSML | invoke>')).toEqual([{ tool: 'list_skills', params: {} }]);
    expect(parseToolCalls('<invoke name="todo_manage"><parameter name="params" string="false">{"action":"list"}</parameter></invoke>')).toEqual([{ tool: 'todo_manage', params: { action: 'list' } }]);
    expect(parseToolCalls('<invoke name="write_file"><parameter name="content" string="true">123</parameter></invoke>')[0]!.params['content']).toBe('123');
    expect(parseToolCalls('<invoke name="run_command"><parameter name="command">partial')).toEqual([]);
  });
  it('parses the spaced DSML dialect from the screenshot into separate calls', () => {
    expect(parseToolCalls(spacedMarkup)).toEqual([
      { tool: 'todo_manage', params: { action: 'add', title: 'Write the report' } },
    ]);
  });

  it('parses consecutive compact calls without leaking parameters across them', () => {
    const calls = parseToolCalls(compactMarkup);

    expect(calls.map((call) => call.tool)).toEqual(['list_skills', 'run_command']);
    expect(calls[0]!.params).toEqual({ filter: 'all' });
    expect(calls[1]!.params.command).toBe('Write-Host $FOUND');
    expect(String(calls[1]!.params.timeoutMs)).toBe('60000');
  });

  it('still parses the legacy <tool>{...}</tool> marker', () => {
    expect(parseToolCalls('use <tool>{"name":"todo_manage","params":{"action":"add"}}</tool>')).toEqual([
      { tool: 'todo_manage', params: { action: 'add' } },
    ]);
  });

  it('ignores a bare <json> block that is not a call', () => {
    expect(parseToolCalls('Here is a snippet:\n<json>{"a":1}</json>')).toEqual([]);
  });
});

describe('stripToolMarkers', () => {
  it('removes the spaced DSML block from the visible reply', () => {
    expect(stripToolMarkers(`Scanning the disk now.\n${spacedMarkup}`)).toBe('Scanning the disk now.');
    expect(stripToolMarkers(spacedMarkup)).toBe('');
  });

  it('removes the compact DSML block from the visible reply', () => {
    expect(stripToolMarkers(`Scanning the disk now.\n${compactMarkup}`)).toBe('Scanning the disk now.');
  });

  it('holds back markers that are still arriving mid-stream', () => {
    expect(stripToolMarkers('Done.\n<|DSML|calls', true)).toBe('Done.');
    expect(stripToolMarkers('Done.\n<|DSM', true)).toBe('Done.');
    expect(stripToolMarkers('Done.\n<| DSM', true)).toBe('Done.');
    expect(stripToolMarkers('Done.\n<i', true)).toBe('Done.');
    // once the chunk resolves, the real prose comes back
    expect(stripToolMarkers('Done.\n<i>ok</i>', true)).toBe('Done.\n<i>ok</i>');
    expect(stripToolMarkers('Done.\n<i>ok</i>', false)).toBe('Done.\n<i>ok</i>');
  });

  it('never renders markup while a reply streams chunk by chunk', () => {
    const reply = `Scanning the disk now.\n${spacedMarkup}\n${compactMarkup}`;
    const chunks = reply.match(/[\s\S]/g) ?? [];
    let streamed = '';
    const frames: string[] = [];
    for (const chunk of chunks) {
      streamed += chunk;
      // mirrors runner.ts: strip the accumulated text on every delta
      frames.push(stripToolMarkers(streamed, true));
    }

    expect(frames.at(-1)).toBe('Scanning the disk now.');
    for (const frame of frames) {
      expect(frame).not.toContain('DSML');
      expect(frame).not.toContain('<|');
      expect(frame).not.toContain('name=');
      expect(frame).not.toContain('parameter');
    }
  });
});
