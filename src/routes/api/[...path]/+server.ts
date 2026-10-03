import { json, type RequestEvent } from '@sveltejs/kit';
import { Effect } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { z } from 'zod';
import { authenticate, getAttachment, getMessage, listMessages, rateLimit, registerMailbox, rotateKey, stats, updateMessage, keyHash } from '#lib/server/mail';
import { getObject } from '#lib/server/storage';
import { respond, parseBody, withMailbox, requestKey, setSession, checkOrigin } from '#lib/server/http';
import { settings, MailError } from '#lib/server/config';

const folder = z.enum(['inbox', 'archive', 'quarantine']);
const registration = z.object({ username: z.string().max(100), name: z.string().max(100), registration_token: z.string().max(200).optional() });

const dispatch = (event: RequestEvent) => Effect.gen(function* () {
  yield* Effect.try({ try: () => checkOrigin(event), catch: (error) => error as MailError });
  const method = event.request.method;
  const path = event.params.path || '';
  if (path === 'health' && method === 'GET') {
    const sql = yield* SqlClient;
    yield* sql`SELECT 1`;
    return json({ status: 'ok', service: 'agmx-agent-mail' });
  }
  if (path === 'session' && method === 'GET') {
    const key = requestKey(event);
    const mailbox = key ? yield* authenticate(key).pipe(Effect.catch((error) => error instanceof MailError && error.status === 401 ? Effect.succeed(null) : Effect.fail(error))) : null;
    return json({ mailbox, domain: settings().domain, registration_requires_token: !!settings().registrationToken || settings().production, development: !settings().production });
  }
  if (path === 'session' && method === 'POST') {
    yield* rateLimit(`signin:${keyHash(event.getClientAddress())}`, 15);
    const body = yield* parseBody(event.request, z.object({ api_key: z.string().max(200) }));
    const mailbox = yield* authenticate(body.api_key);
    setSession(event, body.api_key);
    return json({ mailbox });
  }
  if (path === 'session' && method === 'DELETE') {
    event.cookies.delete('agmx_mailbox', { path: '/' });
    return json({ ok: true });
  }
  if (path === 'mailboxes' && method === 'POST') {
    yield* rateLimit(`register:${keyHash(event.getClientAddress())}`, 10, 3600);
    const body = yield* parseBody(event.request, registration);
    const result = yield* registerMailbox({ username: body.username, name: body.name,
      registrationToken: body.registration_token || event.request.headers.get('authorization')?.replace(/^Bearer /i, '') });
    if (event.request.headers.get('x-agmx-session') === 'true') setSession(event, result.api_key);
    return json({ ...result, mcp_url: `${event.url.origin}/mcp` }, { status: 201 });
  }
  return yield* withMailbox(event, (mailbox) => Effect.gen(function* () {
    if (path === 'mailbox' && method === 'GET') return json(mailbox);
    if (path === 'stats' && method === 'GET') return json(yield* stats(mailbox.id));
    if (path === 'mailbox/key' && method === 'POST') {
      const result = yield* rotateKey(mailbox.id);
      if (event.cookies.get('agmx_mailbox')) setSession(event, result.api_key);
      return json(result);
    }
    if (path === 'messages' && method === 'GET') {
      const query = z.object({ folder: folder.default('inbox'), q: z.string().max(200).optional(), cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).default(30), unread: z.enum(['true', 'false']).optional() }).safeParse(Object.fromEntries(event.url.searchParams));
      if (!query.success) return yield* Effect.fail(new MailError({ status: 400, message: 'Invalid inbox query' }));
      return json(yield* listMessages(mailbox.id, { folder: query.data.folder, query: query.data.q, cursor: query.data.cursor, limit: query.data.limit, unread: query.data.unread === 'true' }));
    }
    const messageMatch = /^messages\/([a-f0-9-]{36})$/.exec(path);
    if (messageMatch && method === 'GET') return json(yield* getMessage(mailbox.id, messageMatch[1]));
    if (messageMatch && method === 'PATCH') {
      const update = yield* parseBody(event.request, z.object({ read: z.boolean().optional(), folder: folder.optional() }).refine((value) => value.read !== undefined || value.folder !== undefined));
      return json(yield* updateMessage(mailbox.id, messageMatch[1], update));
    }
    const attachmentMatch = /^attachments\/([a-f0-9-]{36})$/.exec(path);
    if (attachmentMatch && method === 'GET') {
      const attachment = yield* getAttachment(mailbox.id, attachmentMatch[1]);
      const data = yield* getObject(attachment.object_key);
      return new Response(Buffer.from(data), { headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
        'Content-Length': String(data.byteLength), 'Cache-Control': 'no-store'
      } });
    }
    return json({ error: 'Endpoint not found' }, { status: 404 });
  }));
});

export const GET = (event: RequestEvent) => respond(dispatch(event), event.request.signal);
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
