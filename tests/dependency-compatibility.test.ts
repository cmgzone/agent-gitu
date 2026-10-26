import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { EventType, type BaseEvent } from '@ag-ui/core';
import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { GituAguiAgent, type GituRunBridge } from '../src/server/ag-ui.js';

const require = createRequire(import.meta.url);
const commentedAddress = 'Owner (x(y) <other@example.net>) <owner@example.com>';

describe('security dependency compatibility', () => {
  it('rejects oversized constrained arrays before validating their elements', () => {
    const clientRequire = createRequire(require.resolve('@ag-ui/client'));
    const { z } = clientRequire('zod/v4') as typeof import('zod/v4');
    const result = z.array(z.string().uuid()).max(100).safeParse(Array(100_000).fill(0));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.code).toBe('too_big');
    }
  });

  it('validates and applies a Gitu run through the AG-UI client', async () => {
    const bridge: GituRunBridge = {
      startRun: async () => ({ status: 'completed' }),
      subscribe: (_threadId, listener) => {
        listener({ i: 1, t: new Date().toISOString(), text: 'say Verified dependency upgrade.' });
        return () => {};
      },
      status: () => 'completed',
    };
    const agent = new GituAguiAgent(bridge);
    agent.threadId = 'dependency-thread';
    agent.addMessage({ id: 'user-1', role: 'user', content: 'Verify dependencies' });
    const events: BaseEvent[] = [];
    await agent.runAgent(
      { runId: 'dependency-run' },
      {
        onEvent: ({ event }) => {
          events.push(event);
        },
      },
    );
    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(agent.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'assistant', content: 'Verified dependency upgrade.' })]));
  });

  it('keeps addresses inside nested comments out of mail recipients and senders', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const outgoing = await transport.sendMail({ from: 'sender@example.com', to: commentedAddress, text: 'Fixture only' });
    expect(outgoing.envelope.to).toEqual(['owner@example.com']);
    const incoming = await simpleParser(`From: ${commentedAddress}\r\nTo: reader@example.com\r\n\r\nFixture only`);
    expect(incoming.from?.value.map((address) => address.address)).toEqual(['owner@example.com']);
  });

  it('writes Excel conditional formatting with the upgraded CommonJS UUID dependency', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Values');
    sheet.addRows([[1], [2]]);
    sheet.addConditionalFormatting({
      ref: 'A1:A2',
      rules: [{ type: 'dataBar', priority: 1, gradient: false, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF00AA00' } }],
    });
    const files = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(xml).toMatch(/<x14:cfRule[^>]+id="\{[A-F0-9]{8}-[A-F0-9]{4}-4[A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}\}"/);
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(restored.getWorksheet('Values')?.getCell('A2').value).toBe(2);
  });
});
