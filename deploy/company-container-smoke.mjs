import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// This check always creates an independent owner workspace and loopback server.
// It never attaches to an existing installation or launches model work.
const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-container-company-'));
process.env.AGENT_GITU_HOME = root;
delete process.env.AGENT_GITU_PUBLIC_ORIGIN;
delete process.env.AGENT_GITU_TRUST_LOCAL_PROXY;
const { GituServer } = await import('../dist/server/server.js');
const { ScriptedMockLlm } = await import('../dist/llm/llm.js');
const { chromium } = await import('playwright');
let server, origin;
const start = async () => {
  server = new GituServer({ passwordRequired: false, port: 0, host: '127.0.0.1', cwd: root, llm: new ScriptedMockLlm([]), autoInstallLsp: false });
  origin = `http://127.0.0.1:${await server.start()}`;
};
const request = async (route, method = 'GET', value) => {
  const response = await fetch(origin + route, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: value === undefined ? undefined : JSON.stringify(value),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return { status: response.status, data };
};
try {
  await start();
  const a = await request('/api/companies', 'POST', { name: 'Container Alpha', purpose: 'Deployment fixture', monthlyBudgetUsd: null, maxFileBytes: null });
  const b = await request('/api/companies', 'POST', { name: 'Container Beta', monthlyBudgetUsd: null, maxFileBytes: null });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const company = a.data.company;
  const base = `/api/companies/${company.id}/files/uploads`;
  const bytes = Buffer.alloc(21 * 1024 * 1024, 73);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const created = await request(base, 'POST', { scope: 'company', name: 'fixture.mp4', mime: 'video/mp4', size: bytes.length, checksum });
  assert.equal(created.status, 201);
  const id = created.data.file.id;
  const chunkSize = 5 * 1024 * 1024;
  const sendChunk = async offset => {
    const response = await fetch(`${origin}${base}/${id}?scope=company`, {
      method: 'PATCH',
      headers: { origin, 'upload-offset': String(offset) },
      body: bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, await response.text());
  };
  await sendChunk(0);
  await server.stop();
  await start();
  const resumed = await request(`${base}/${id}?scope=company`);
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.file.offset, chunkSize);
  for (let offset = chunkSize; offset < bytes.length; offset += chunkSize) await sendChunk(offset);
  const finished = await request(`${base}/${id}/complete?scope=company`, 'POST');
  assert.equal(finished.status, 200);
  assert.equal(finished.data.file.checksum, checksum);
  const downloaded = await fetch(`${origin}${base}/${id}/content?scope=company`, { signal: AbortSignal.timeout(15000) });
  assert.equal(downloaded.status, 200);
  const digest = createHash('sha256');
  for await (const chunk of downloaded.body) digest.update(chunk);
  assert.equal(digest.digest('hex'), checksum);
  const range = await fetch(`${origin}${base}/${id}/content?scope=company&inline=1`, { headers: { range: 'bytes=1048576-1048583' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(1048576, 1048584));
  assert.equal((await request(`/api/companies/${b.data.company.id}/files/uploads/${id}?scope=company`)).status, 404);
  assert.equal((await request(`/api/companies/${company.id}/archive`, 'POST')).status, 200);
  assert.equal((await request(`/api/companies/${company.id}/restore`, 'POST')).status, 200);
  assert.equal((await request(`/api/companies/${company.id}`)).data.company.state, 'paused');
  const browser = await chromium.launch({ headless: true, ...(process.env.GITU_CONTAINER_SMOKE_CHANNEL ? { channel: process.env.GITU_CONTAINER_SMOKE_CHANNEL } : {}) });
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Company container browser</title><p>Ready</p>');
    assert.equal(await page.title(), 'Company container browser');
  } finally {
    await browser.close();
  }
  console.log('Container runtime passed: company isolation, durable upload resume, 21 MiB checksum, video range, archive/restore and headless browser.');
} finally {
  await server?.stop();
}
