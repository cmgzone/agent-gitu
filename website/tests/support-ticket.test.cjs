'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_BODY_LENGTH,
  createSupportTicket,
  persistSupportTicket,
  processSupportTicket,
  validateSupportTicket,
} = require('../support-ticket.cjs');

function validPayload(overrides) {
  return Object.assign(
    {
      name: 'Test User',
      email: 't@example.com',
      productOrPage: 'pikpam.com',
      problem: 'The download button is not working',
      whenStarted: 'today',
      reproductionDetails: 'Clicked the download button on the homepage and nothing happened.',
    },
    overrides || {}
  );
}

function withNotificationEmail(value, run) {
  const saved = process.env.SUPPORT_NOTIFICATION_EMAIL;
  if (value === undefined) delete process.env.SUPPORT_NOTIFICATION_EMAIL;
  else process.env.SUPPORT_NOTIFICATION_EMAIL = value;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.SUPPORT_NOTIFICATION_EMAIL;
    else process.env.SUPPORT_NOTIFICATION_EMAIL = saved;
  }
}

test('accepts a valid website problem and persists it as JSONL', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pikpam-support-'));

  try {
    const validation = validateSupportTicket(validPayload());
    assert.equal(validation.ok, true);
    assert.equal(validation.ticket.status, 'open');

    const ticket = createSupportTicket(validPayload({ name: '  Test User  ' }));
    assert.match(ticket.id, /^SUP-[0-9a-f-]{36}$/);
    assert.match(ticket.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(ticket.name, 'Test User');
    assert.equal(ticket.email, 't@example.com');
    assert.equal(ticket.status, 'open');

    const persisted = persistSupportTicket(path.join(dir, 'nested', 'tickets'), ticket);
    assert.ok(fs.existsSync(persisted.ticketsPath));
    assert.ok(fs.existsSync(persisted.notificationsPath));

    const ticketLines = fs.readFileSync(persisted.ticketsPath, 'utf8').trim().split('\n');
    assert.equal(ticketLines.length, 1);

    const stored = JSON.parse(ticketLines[0]);
    assert.equal(stored.id, ticket.id);
    assert.equal(stored.email, 't@example.com');
    assert.equal(stored.problem, 'The download button is not working');
    assert.equal(stored.status, 'open');

    const notificationLines = fs.readFileSync(persisted.notificationsPath, 'utf8').trim().split('\n');
    assert.equal(notificationLines.length, 1);

    const withEmail = withNotificationEmail('sales@pikpam.com', () => persistSupportTicket(dir, ticket));
    const notifyLines = fs.readFileSync(withEmail.notificationsPath, 'utf8').trim().split('\n');
    assert.equal(JSON.parse(notifyLines[notifyLines.length - 1]).to, 'sales@pikpam.com');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects messages that contain secrets', () => {
  const result = validateSupportTicket(
    validPayload({ problem: 'Login fails, my password: hunter2SuperSecret keeps getting rejected' })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'secret_detected');
  assert.ok(typeof result.message === 'string' && result.message.length > 0);

  const apiKey = validateSupportTicket(
    validPayload({ reproductionDetails: 'api_key = sk-live-abcdefghijklmnop123456' })
  );
  assert.equal(apiKey.ok, false);
  assert.equal(apiKey.code, 'secret_detected');
});

test('rejects out-of-scope requests', () => {
  const refund = validateSupportTicket(
    validPayload({ problem: 'I want a refund for my subscription invoice this month' })
  );
  assert.equal(refund.ok, false);
  assert.equal(refund.code, 'out_of_scope');

  const infra = validateSupportTicket(
    validPayload({ problem: 'Please change the code and open a pull request for our terraform infra' })
  );
  assert.equal(infra.ok, false);
  assert.equal(infra.code, 'out_of_scope');

  const invalidEmail = validateSupportTicket(validPayload({ email: 'not-an-email' }));
  assert.equal(invalidEmail.ok, false);
  assert.equal(invalidEmail.code, 'invalid_email');
});

test('is not accepted when SUPPORT_NOTIFICATION_EMAIL is not configured', () => {
  assert.equal(MAX_BODY_LENGTH, 16000);

  const unavailable = withNotificationEmail(undefined, () => processSupportTicket(validPayload()));
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.code, 'temporarily_unavailable');
  assert.equal(unavailable.ticket, undefined);

  const configured = withNotificationEmail('sales@pikpam.com', () => processSupportTicket(validPayload()));
  assert.equal(configured.ok, true);
  assert.equal(configured.status, 200);
  assert.equal(configured.notificationEmail, 'sales@pikpam.com');
  assert.match(configured.ticket.id, /^SUP-/);
});
