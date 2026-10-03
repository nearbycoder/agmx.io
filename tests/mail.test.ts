import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { createServer } from 'node:http';
import { Effect } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { RequestEvent } from '@sveltejs/kit';
import { GET as api } from '../src/routes/api/[...path]/+server';
import { POST as mcp } from '../src/routes/mcp/+server';
import type { SMTPServer } from 'smtp-server';
import { runtime } from '../src/lib/server/runtime';
import { authenticate, getAttachment, getMessage, listMessages, registerMailbox, rotateKey, updateMessage } from '../src/lib/server/mail';
import { claimJob, enqueueInbound, processJob, runWorkerOnce, retryFailedJob } from '../src/lib/server/ingest';
import { getObject } from '../src/lib/server/storage';
import { startSmtp } from '../src/lib/server/smtp';
import { createMailMcp } from '../src/lib/server/mcp';

let directory: string;
let smtp: SMTPServer;
let alice: Awaited<ReturnType<typeof createMailbox>>;
let bob: Awaited<ReturnType<typeof createMailbox>>;
const createMailbox = (username: string) => runtime.runPromise(registerMailbox({ username, name: `${username} agent` }));

const rawMessage = (recipient: string, subject = 'Hello agent') => Buffer.from([
  'From: Human <human@example.org>', `To: ${recipient}`, `Subject: ${subject}`,
  'Message-ID: <test-message@example.org>', 'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="test-boundary"', '',
  '--test-boundary', 'Content-Type: text/plain; charset=utf-8', '', 'A real message for your agent.',
  '--test-boundary', 'Content-Type: text/plain; name="notes.txt"',
  'Content-Disposition: attachment; filename="notes.txt"', '', 'Attachment contents.',
  '--test-boundary--', ''
].join('\r\n'));

async function smtpExchange(recipient: string, raw?: Buffer) {
  const port = (smtp.server.address() as { port: number }).port;
  const socket = createConnection(port, '127.0.0.1');
  socket.setEncoding('utf8');
  let buffer = '';
  let pending: ((line: string) => void) | null = null;
  const lines: string[] = [];
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n');
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (!/^\d{3} /.test(line)) continue;
      if (pending) { const resolve = pending; pending = null; resolve(line); }
      else lines.push(line);
    }
  });
  const response = () => lines.length ? Promise.resolve(lines.shift()!) : new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SMTP response timed out')), 5000);
    pending = (line) => { clearTimeout(timer); resolve(line); };
  });
  const command = async (text: string) => { socket.write(`${text}\r\n`); return response(); };
  try {
    expect(await response()).toMatch(/^220/);
    expect(await command('EHLO test.example.org')).toMatch(/^250/);
    expect(await command('MAIL FROM:<human@example.org>')).toMatch(/^250/);
    const recipientReply = await command(`RCPT TO:<${recipient}>`);
    if (!raw || !recipientReply.startsWith('250')) return recipientReply;
    expect(await command('DATA')).toMatch(/^354/);
    const content = raw.toString().replace(/(^|\r\n)\./g, '$1..');
    return await command(`${content.endsWith('\r\n') ? content : `${content}\r\n`}.`);
  } finally { socket.destroy(); }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agmx-mail-test-'));
  for (const name of ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'SMTP_TLS_CERT', 'SMTP_TLS_KEY', 'RSPAMD_PASSWORD']) vi.stubEnv(name, undefined);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SMTP_BIND', '127.0.0.1');
  vi.stubEnv('MAIL_DOMAIN', 'mail.agmx.io');
  process.env.DATA_DIR = directory;
  process.env.SMTP_PORT = '0';
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  else delete process.env.DATABASE_URL;
  delete process.env.REGISTRATION_TOKEN;
  delete process.env.RSPAMD_URL;
  alice = await createMailbox('alice');
  bob = await createMailbox('bob');
  smtp = await startSmtp();
});

afterAll(async () => {
  if (smtp) await new Promise<void>((resolve) => smtp.close(resolve));
  await runtime.dispose();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('SMTP delivery and mailbox isolation', () => {
  it('rejects unknown recipients and relay destinations', async () => {
    expect(await smtpExchange('unknown@mail.agmx.io')).toMatch(/^550/);
    expect(await smtpExchange('somebody@example.net')).toMatch(/^550/);
  });

  it('acknowledges only after a durable raw message and queue record exist', async () => {
    expect(await smtpExchange(alice.mailbox.address, rawMessage(alice.mailbox.address))).toMatch(/^250 Queued as /);
    const job = await runtime.runPromise(claimJob);
    expect(job).not.toBeNull();
    expect(Buffer.from(await runtime.runPromise(getObject(job!.raw_key))).toString()).toContain('Hello agent');
    await runtime.runPromise(processJob(job!));
    // Replaying the same queued work must not duplicate delivery.
    await runtime.runPromise(processJob(job!));
    const page = await runtime.runPromise(listMessages(alice.mailbox.id));
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].subject).toBe('Hello agent');
    expect(page.messages[0].read_at).toBeNull();
    const message = await runtime.runPromise(getMessage(alice.mailbox.id, page.messages[0].id));
    expect(message.text_body).toContain('A real message');
    expect(message.attachments).toHaveLength(1);
    const attachment = await runtime.runPromise(getAttachment(alice.mailbox.id, message.attachments[0].id));
    expect(Buffer.from(await runtime.runPromise(getObject(attachment.object_key))).toString()).toContain('Attachment contents');
    expect((await runtime.runPromise(listMessages(bob.mailbox.id))).messages).toHaveLength(0);
    const deniedMessage = await runtime.runPromiseExit(getMessage(bob.mailbox.id, message.id));
    const deniedAttachment = await runtime.runPromiseExit(getAttachment(bob.mailbox.id, attachment.id));
    expect(deniedMessage._tag).toBe('Failure');
    expect(deniedAttachment._tag).toBe('Failure');
  });

  it('searches, paginates and persists folder/read updates', async () => {
    for (const subject of ['Research update', 'Research details']) {
      await runtime.runPromise(enqueueInbound(rawMessage(alice.mailbox.address, subject), { recipients: [alice.mailbox.address], sender: 'human@example.org', remoteIp: '127.0.0.1', helo: 'example.org' }));
      await runtime.runPromise(runWorkerOnce);
    }
    const first = await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'Research', limit: 1 }));
    expect(first.messages).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const second = await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'Research', limit: 1, cursor: first.next_cursor! }));
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0].id).not.toBe(first.messages[0].id);
    await runtime.runPromise(updateMessage(alice.mailbox.id, first.messages[0].id, { read: true, folder: 'archive' }));
    const archived = await runtime.runPromise(getMessage(alice.mailbox.id, first.messages[0].id));
    expect(archived.folder).toBe('archive');
    expect(archived.read_at).not.toBeNull();
  });

  it('retries filter failures without losing acknowledged mail', async () => {
    process.env.RSPAMD_URL = 'http://127.0.0.1:1';
    const queued = await runtime.runPromise(enqueueInbound(rawMessage(bob.mailbox.address), { recipients: [bob.mailbox.address], sender: 'human@example.org', remoteIp: '127.0.0.1', helo: 'example.org' }));
    await runtime.runPromise(runWorkerOnce);
    const pending = await runtime.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient;
      return (yield* sql<{ state: string; attempts: number }>`SELECT state, attempts FROM inbound_jobs WHERE id = ${queued.id}`)[0];
    }));
    expect(pending).toEqual({ state: 'pending', attempts: 1 });
    delete process.env.RSPAMD_URL;
    await runtime.runPromise(Effect.gen(function* () { const sql = yield* SqlClient; yield* sql`UPDATE inbound_jobs SET next_attempt = now() WHERE id = ${queued.id}`; }));
    await runtime.runPromise(runWorkerOnce);
    expect((await runtime.runPromise(listMessages(bob.mailbox.id))).messages).toHaveLength(1);
  });

  it('prevents address takeover and revokes old keys on rotation', async () => {
    expect((await runtime.runPromiseExit(registerMailbox({ username: 'ALICE', name: 'Other' })))._tag).toBe('Failure');
    const result = await runtime.runPromise(rotateKey(bob.mailbox.id));
    expect((await runtime.runPromiseExit(authenticate(bob.api_key)))._tag).toBe('Failure');
    expect((await runtime.runPromise(authenticate(result.api_key))).id).toBe(bob.mailbox.id);
    bob.api_key = result.api_key;
  });

  it('sends the SMTP envelope to Rspamd and quarantines suspicious mail', async () => {
    let scanRequest = '';
    const filter = createServer((request, response) => {
      expect(request.url).toBe('/checkv3');
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => { scanRequest += chunk; });
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ score: 12, action: 'reject' }));
      });
    });
    await new Promise<void>((resolve) => filter.listen(0, '127.0.0.1', resolve));
    process.env.RSPAMD_URL = `http://127.0.0.1:${(filter.address() as { port: number }).port}`;
    try {
      await runtime.runPromise(enqueueInbound(rawMessage(alice.mailbox.address, 'Suspicious test message'), {
        recipients: [alice.mailbox.address], sender: 'human@example.org', remoteIp: '203.0.113.10', helo: 'example.org'
      }));
      await runtime.runPromise(runWorkerOnce);
      expect(scanRequest).toContain('"ip":"203.0.113.10"');
      expect(scanRequest).toContain(`"rcpt":["${alice.mailbox.address}"]`);
      const quarantine = await runtime.runPromise(listMessages(alice.mailbox.id, { folder: 'quarantine' }));
      expect(quarantine.messages).toHaveLength(1);
      const message = await runtime.runPromise(getMessage(alice.mailbox.id, quarantine.messages[0].id));
      expect(message.spam_score).toBe(12);
      expect(message.subject).toBe('Suspicious test message');
    } finally {
      delete process.env.RSPAMD_URL;
      await new Promise<void>((resolve) => filter.close(() => resolve()));
    }
  });
});

describe('official MCP HTTP transport', () => {
  it('serves tool discovery and reads scoped mailbox data through JSON-RPC', async () => {
    const handler = createMcpHandler(() => createMailMcp(alice.mailbox));
    const request = (body: unknown) => handler.fetch(new Request('http://localhost/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body)
    }));
    const discovery = await request({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(discovery.status).toBe(200);
    const discoveryText = await discovery.text();
    expect(discoveryText).toContain('list_emails');
    expect(discoveryText).toContain('read_email');
    const call = await request({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_mailbox', arguments: {} } });
    expect(await call.text()).toContain(alice.mailbox.address);
    const bobMessage = (await runtime.runPromise(listMessages(bob.mailbox.id))).messages[0];
    const denied = await request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_email', arguments: { id: bobMessage.id } } });
    expect(await denied.text()).toContain('Message not found');
  });
});

function event(path: string, options: { method?: string; key?: string; cookie?: string; body?: string; origin?: string } = {}) {
  const headers = new Headers({ Accept: 'application/json, text/event-stream' });
  if (options.key !== undefined) headers.set('Authorization', `Bearer ${options.key}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.origin) headers.set('Origin', options.origin);
  const url = new URL(`http://localhost/api/${path}`);
  return { url, params: { path: path.split('?')[0] }, request: new Request(url, { method: options.method || 'GET', headers, body: options.body }),
    cookies: { get: () => options.cookie, set: () => {}, delete: () => {} }, getClientAddress: () => '127.0.0.2' } as unknown as RequestEvent;
}
const envelope = (recipients: string[]) => ({ recipients, sender: 'human@example.org', remoteIp: '127.0.0.1', helo: 'example.org' });

describe('readiness boundaries', () => {
  it('enforces production registration tokens and rejects malformed/oversized HTTP bodies', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      delete process.env.REGISTRATION_TOKEN;
      const body = JSON.stringify({ username: 'production-agent', name: 'Production' });
      expect((await api(event('mailboxes', { method: 'POST', body }))).status).toBe(503);
      process.env.REGISTRATION_TOKEN = 'fixture-registration-token';
      expect((await api(event('mailboxes', { method: 'POST', body }))).status).toBe(403);
      expect((await api(event('mailboxes', { method: 'POST', body, key: 'wrong' }))).status).toBe(403);
      expect((await api(event('mailboxes', { method: 'POST', body, key: process.env.REGISTRATION_TOKEN }))).status).toBe(201);
      expect((await api(event('messages', { key: process.env.REGISTRATION_TOKEN }))).status).toBe(401);
    } finally { vi.stubEnv('NODE_ENV', 'test'); delete process.env.REGISTRATION_TOKEN; }
    expect((await api(event('mailboxes', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await api(event('mailboxes', { method: 'POST', body: 'x'.repeat(16_385) }))).status).toBe(413);
  });

  it('scopes HTTP reads, writes and downloads and requires bearer authentication for MCP', async () => {
    const message = (await runtime.runPromise(listMessages(alice.mailbox.id))).messages[0];
    const full = await runtime.runPromise(getMessage(alice.mailbox.id, message.id));
    expect((await api(event(`messages/${message.id}`, { key: bob.api_key }))).status).toBe(404);
    expect((await api(event(`messages/${message.id}`, { method: 'PATCH', key: bob.api_key, body: '{"folder":"archive"}' }))).status).toBe(404);
    expect((await api(event(`attachments/${full.attachments[0].id}`, { key: bob.api_key }))).status).toBe(404);
    const download = await api(event(`attachments/${full.attachments[0].id}`, { key: alice.api_key }));
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment;');
    expect(await download.text()).toContain('Attachment contents');
    expect((await api(event('messages', { key: 'invalid', cookie: alice.api_key }))).status).toBe(401);
    expect((await api(event(`messages/${message.id}`, { method: 'PATCH', cookie: alice.api_key, body: '{"read":true}' }))).status).toBe(403);
    expect((await api(event('messages', { key: alice.api_key, origin: 'https://evil.example' }))).status).toBe(403);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_email', arguments: { id: message.id } } });
    expect((await mcp(event('mcp', { method: 'POST', cookie: alice.api_key, body, origin: 'http://localhost' }))).status).toBe(401);
    expect(await (await mcp(event('mcp', { method: 'POST', key: bob.api_key, body }))).text()).toContain('Message not found');
  });

  it('keeps To/Cc/BCC envelope metadata private through HTTP and MCP', async () => {
    const carol = await createMailbox('carol');
    const recipients = [alice.mailbox.address, bob.mailbox.address, carol.mailbox.address];
    const raw = rawMessage(alice.mailbox.address, 'Private recipients');
    const content = Buffer.from(raw.toString().replace(`To: ${alice.mailbox.address}`, `To: ${alice.mailbox.address}\r\nCc: ${bob.mailbox.address}`));
    const queued = await runtime.runPromise(enqueueInbound(content, envelope(recipients)));
    await runtime.runPromise(runWorkerOnce);
    const rows = await runtime.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient;
      // Simulate pre-fix metadata. Read projection must protect old rows too.
      yield* sql`UPDATE messages SET recipients = ${JSON.stringify(recipients)}::jsonb WHERE job_id = ${queued.id}`;
      return yield* sql<{ id: string; mailbox_id: string }>`SELECT id, mailbox_id FROM messages WHERE job_id = ${queued.id}`;
    }));
    for (const own of [alice, bob, carol]) {
      const row = rows.find((row) => row.mailbox_id === own.mailbox.id)!;
      const other = rows.find((row) => row.mailbox_id !== own.mailbox.id)!;
      const full = await runtime.runPromise(getMessage(own.mailbox.id, row.id));
      const foreign = await runtime.runPromise(getMessage(other.mailbox_id, other.id));
      const response = await api(event(`messages/${row.id}`, { key: own.api_key }));
      expect((await response.json()).recipients).toEqual([own.mailbox.address]);
      const search = await (await api(event('messages?q=Private%20recipients', { key: own.api_key }))).json();
      expect(search.messages.map((message: { id: string }) => message.id)).toEqual([row.id]);
      expect((await api(event(`attachments/${foreign.attachments[0].id}`, { key: own.api_key }))).status).toBe(404);
      expect((await api(event(`attachments/${full.attachments[0].id}`, { key: own.api_key }))).status).toBe(200);
      const call = async (name: string, args: unknown) => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } });
        const text = await (await mcp(event('mcp', { method: 'POST', key: own.api_key, body }))).text();
        // SDK may negotiate JSON or SSE with the same result payload.
        return JSON.parse(text.includes('data: ') ? text.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : text);
      };
      const read = await call('read_email', { id: row.id });
      expect(JSON.parse(read.result.content[0].text).recipients).toEqual([own.mailbox.address]);
      const list = await call('list_emails', { query: 'Private recipients' });
      expect(JSON.parse(list.result.content[0].text).messages.map((message: { id: string }) => message.id)).toEqual([row.id]);
      expect(JSON.stringify(await call('read_attachment', { id: foreign.attachments[0].id }))).toContain('Attachment not found');
      expect(JSON.stringify(await call('read_attachment', { id: full.attachments[0].id }))).toContain(Buffer.from('Attachment contents.').toString('base64').slice(0, 12));
    }
    // Sender-controlled headers/content stay intact in the operator-only raw object.
    const stored = await runtime.runPromise(Effect.gen(function* () { const sql = yield* SqlClient;
      const [row] = yield* sql<{ raw_key: string }>`SELECT raw_key FROM inbound_jobs WHERE id = ${queued.id}`;
      return yield* getObject(row.raw_key); }));
    expect(Buffer.from(stored)).toEqual(content);
  });

  it('does not reset completed jobs after lost commit responses or stale/concurrent operator retries', async () => {
    const queued = await runtime.runPromise(enqueueInbound(rawMessage(alice.mailbox.address, 'Completed retry fixture'), envelope([alice.mailbox.address])));
    await runtime.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient;
      const interrupted = new Proxy(sql, { get(target, property, receiver) {
        if (property === 'withTransaction') return (work: Parameters<typeof sql.withTransaction>[0]) =>
          sql.withTransaction(work).pipe(Effect.andThen(Effect.fail(new Error('Simulated lost completion response'))));
        return Reflect.get(target, property, receiver);
      } });
      yield* runWorkerOnce.pipe(Effect.provideService(SqlClient, interrupted));
    }));
    await Promise.all([runtime.runPromise(retryFailedJob(queued.id)), runtime.runPromise(retryFailedJob(queued.id))]).then((rows) => expect(rows).toEqual([[], []]));
    const state = await runtime.runPromise(Effect.gen(function* () { const sql = yield* SqlClient;
      return (yield* sql<{ state: string; count: number }>`SELECT state, (SELECT count(*)::integer FROM messages WHERE job_id = ${queued.id}) AS count FROM inbound_jobs WHERE id = ${queued.id}`)[0]; }));
    expect(state).toEqual({ state: 'complete', count: 1 });
    // An expired worker holding an obsolete lease cannot redeliver.
    await runtime.runPromise(processJob({ id: queued.id, raw_key: `raw/${queued.id}`, recipients: [alice.mailbox.address],
      envelope_sender: 'human@example.org', remote_ip: '127.0.0.1', helo: 'example.org', attempts: 1, lease_id: 'stale-lease' }));
    expect((await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'Completed retry fixture' }))).messages).toHaveLength(1);
  });

  it('retains raw mail after a committed queue insert loses its response', async () => {
    const result = await runtime.runPromiseExit(Effect.gen(function* () {
      const sql = yield* SqlClient;
      const interrupted = new Proxy(sql, { apply(target, thisArg, args) {
        const operation = Reflect.apply(target, thisArg, args);
        return String(args[0]).includes('INSERT INTO inbound_jobs')
          ? operation.pipe(Effect.andThen(Effect.fail(new Error('Simulated lost commit response')))) : operation;
      } });
      return yield* enqueueInbound(rawMessage(alice.mailbox.address, 'Lost response fixture'), envelope([alice.mailbox.address])).pipe(Effect.provideService(SqlClient, interrupted));
    }));
    expect(result._tag).toBe('Failure');
    const row = await runtime.runPromise(Effect.gen(function* () { const sql = yield* SqlClient;
      return (yield* sql<{ raw_key: string }>`SELECT raw_key FROM inbound_jobs WHERE state = 'pending' ORDER BY created_at DESC LIMIT 1`)[0]; }));
    expect(Buffer.from(await runtime.runPromise(getObject(row.raw_key))).toString()).toContain('Lost response fixture');
    await runtime.runPromise(runWorkerOnce);
    expect((await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'Lost response fixture' }))).messages).toHaveLength(1);
  });

  it('rejects oversized SMTP DATA without queuing it and accepts a later valid delivery', async () => {
    const countJobs = () => runtime.runPromise(Effect.gen(function* () { const sql = yield* SqlClient;
      return (yield* sql<{ count: number }>`SELECT count(*)::integer AS count FROM inbound_jobs`)[0].count; }));
    const before = await countJobs();
    const raw = Buffer.from('From: human@example.org\r\n\r\n' + 'x'.repeat(25 * 1024 * 1024));
    expect(await smtpExchange(alice.mailbox.address, raw)).toMatch(/^552/);
    expect(await countJobs()).toBe(before);
    expect(await smtpExchange(alice.mailbox.address, rawMessage(alice.mailbox.address, 'After oversized DATA'))).toMatch(/^250 Queued as /);
    await runtime.runPromise(runWorkerOnce);
    expect((await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'After oversized DATA' }))).messages).toHaveLength(1);
  });

  it('handles truncated MIME and limits large attachments in MCP while allowing HTTP download', async () => {
    const content = Buffer.alloc(1024 * 1024 + 1, 'a');
    const raw = Buffer.from(['From: human@example.org', 'Subject: Large attachment fixture',
      'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="large"', '', '--large',
      'Content-Type: application/octet-stream', 'Content-Disposition: attachment; filename="large.bin"',
      'Content-Transfer-Encoding: base64', '', content.toString('base64'), ''].join('\r\n'));
    await runtime.runPromise(enqueueInbound(raw, envelope([alice.mailbox.address])));
    await runtime.runPromise(runWorkerOnce);
    const message = (await runtime.runPromise(listMessages(alice.mailbox.id, { query: 'Large attachment fixture' }))).messages[0];
    const full = await runtime.runPromise(getMessage(alice.mailbox.id, message.id));
    expect(full.attachments[0].size).toBe(content.length);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_attachment', arguments: { id: full.attachments[0].id } } });
    const reply = await (await mcp(event('mcp', { method: 'POST', key: alice.api_key, body }))).text();
    expect(reply).toContain('isError');
    expect(reply).toContain('/api/attachments/');
    const download = await api(event(`attachments/${full.attachments[0].id}`, { key: alice.api_key }));
    expect(Buffer.from(await download.arrayBuffer())).toEqual(content);
  });
});
