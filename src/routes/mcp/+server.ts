import { createMcpHandler } from '@modelcontextprotocol/server';
import type { RequestEvent } from '@sveltejs/kit';
import { Effect } from 'effect';
import { authenticate, keyHash, rateLimit } from '#lib/server/mail';
import { requestKey, respond, checkOrigin } from '#lib/server/http';
import { createMailMcp } from '#lib/server/mcp';
import { MailError } from '#lib/server/config';

const handle = (event: RequestEvent) => respond(Effect.gen(function* () {
  yield* Effect.try({ try: () => checkOrigin(event), catch: (error) => error as MailError });
  const key = requestKey(event, false);
  yield* rateLimit(`mcp-ip:${keyHash(event.getClientAddress())}`, 300);
  const mailbox = yield* authenticate(key);
  yield* rateLimit(`mcp:${keyHash(key)}`, 120);
  const handler = createMcpHandler(() => createMailMcp(mailbox), { maxRequestBodySize: 64 * 1024 });
  return yield* Effect.tryPromise({
    try: () => handler.fetch(event.request),
    catch: () => new MailError({ status: 400, message: 'Invalid MCP request' })
  });
}), event.request.signal);

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
