import { createServer, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { expect, it, vi } from 'vitest';
import { InboxArrivalJournal, MailInboxMonitor } from '../src/connections/mail-inbox-monitor.js';

it('receives an unsolicited IMAP EXISTS over a real IDLE connection without polling', async () => {
  let socket: Socket | undefined, idleTag = '', uids = [1, 2];
  const commands: string[] = [];
  const server = createServer(connection => {
    socket = connection;
    connection.on('error', () => {});
    connection.write('* OK Local IMAP fixture\r\n');
    let buffer = '';
    connection.on('data', data => {
      buffer += data.toString();
      for (;;) {
        const end = buffer.indexOf('\r\n'); if (end < 0) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (line === 'DONE') { connection.write(idleTag + ' OK IDLE completed\r\n'); idleTag = ''; continue; }
        const space = line.indexOf(' '), tag = line.slice(0, space), command = line.slice(space + 1);
        const verb = command.split(' ')[0]!.toUpperCase(); commands.push(verb);
        if (verb === 'CAPABILITY') connection.write('* CAPABILITY IMAP4rev1 IDLE UIDPLUS\r\n' + tag + ' OK capability\r\n');
        else if (verb === 'LOGIN') connection.write(tag + ' OK authenticated\r\n');
        else if (verb === 'LIST' || verb === 'LSUB') connection.write('* LIST (\\HasNoChildren) "/" "INBOX"\r\n' + tag + ' OK listed\r\n');
        else if (verb === 'SELECT' || verb === 'EXAMINE') connection.write('* FLAGS (\\Seen \\Draft)\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 1] stable\r\n* OK [UIDNEXT 3] next\r\n' + tag + ' OK [READ-WRITE] selected\r\n');
        else if (verb === 'UID' && /^UID SEARCH/i.test(command)) {
          const after = Number(/UID (\d+):\*/i.exec(command)?.[1] ?? 1);
          connection.write('* SEARCH' + uids.filter(uid => uid >= after).map(uid => ' ' + uid).join('') + '\r\n' + tag + ' OK searched\r\n');
        } else if (verb === 'IDLE') { idleTag = tag; connection.write('+ idling\r\n'); }
        else if (verb === 'LOGOUT') { connection.end('* BYE\r\n' + tag + ' OK logout\r\n'); }
        else connection.write(tag + ' OK completed\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-idle-'));
  const deliver = vi.fn(async () => true);
  const monitor = new MailInboxMonitor(new InboxArrivalJournal(path.join(root, 'inbox.sqlite')), async () => ['fixture'], () => new ImapFlow({ host: '127.0.0.1', port: (server.address() as { port: number }).port, secure: false, doSTARTTLS: false, auth: { user: 'fixture', pass: 'fixture' }, logger: false, disableAutoIdle: false, autoIdleDelay: 100, connectionTimeout: 2000, socketTimeout: 10000 }), deliver);
  try {
    monitor.start();
    await vi.waitFor(() => expect(idleTag, JSON.stringify({ commands, statuses: monitor.statuses() })).not.toBe(''), { timeout: 5000 });
    expect(monitor.statuses()['fixture']?.state).toBe('listening');
    expect(deliver).not.toHaveBeenCalled();
    const before = commands.filter(verb => verb === 'UID').length;
    uids = [1, 2, 3]; socket!.write('* 3 EXISTS\r\n');
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(deliver.mock.calls[0]?.[0]).toMatchObject({ accountId: 'fixture', uid: 3, uidValidity: '1' });
    expect(commands.filter(verb => verb === 'UID').length).toBe(before + 1);
  } finally {
    await monitor.stop(); socket?.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
