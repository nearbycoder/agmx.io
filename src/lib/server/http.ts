import { json, type RequestEvent } from '@sveltejs/kit';
import { Effect } from 'effect';
import { z } from 'zod';
import { runtime, type RuntimeServices } from './runtime';
import { MailError, settings } from './config';
import { authenticate, keyHash, rateLimit } from './mail';
import type { Mailbox } from '../types';

export function requestKey(event: RequestEvent, allowCookie = true) {
  const header = event.request.headers.get('authorization');
  if (header !== null) return /^Bearer /i.test(header) ? header.slice(7) : '';
  return allowCookie ? event.cookies.get('agmx_mailbox') || '' : '';
}

export function setSession(event: RequestEvent, key: string) {
  event.cookies.set('agmx_mailbox', key, { path: '/', httpOnly: true, secure: settings().production, sameSite: 'strict', maxAge: 60 * 60 * 24 * 30 });
}

export function checkOrigin(event: RequestEvent) {
  const origin = event.request.headers.get('origin');
  const expected = settings().production ? settings().origin : event.url.origin;
  if ((origin && origin !== expected) || event.request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new MailError({ status: 403, message: 'Cross-origin requests are not allowed' });
  }
  if (!['GET', 'HEAD'].includes(event.request.method) && event.cookies.get('agmx_mailbox') && !event.request.headers.has('authorization') && !origin) {
    throw new MailError({ status: 403, message: 'An Origin header is required for browser changes' });
  }
}

export const parseBody = <T extends z.ZodType>(request: Request, schema: T) => Effect.tryPromise({
  try: async () => {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > 16_384) throw new MailError({ status: 413, message: 'Request body too large' });
    const reader = request.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16_384) { await reader.cancel(); throw new MailError({ status: 413, message: 'Request body too large' }); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    return schema.parse(JSON.parse(Buffer.concat(parts).toString('utf8'))) as z.output<T>;
  },
  catch: (error) => error instanceof MailError ? error : new MailError({ status: 400, message: 'Invalid request body' })
});

export function withMailbox<A, E>(event: RequestEvent, action: (mailbox: Mailbox) => Effect.Effect<A, E, RuntimeServices>) {
  return Effect.gen(function* () {
    const key = requestKey(event);
    yield* rateLimit(`api-ip:${keyHash(event.getClientAddress())}`, 600);
    const mailbox = yield* authenticate(key);
    yield* rateLimit(`api:${keyHash(key)}`, 300);
    return yield* action(mailbox);
  });
}

export async function respond<E>(effect: Effect.Effect<Response, E, RuntimeServices>, signal?: AbortSignal) {
  try {
    return await runtime.runPromise(effect.pipe(Effect.catch((error) => {
      if (error instanceof MailError) {
        return Effect.succeed(json({ error: error.message }, { status: error.status, headers: error.status === 429 ? { 'Retry-After': '60' } : error.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="agmx-mail"' } : {} }));
      }
      return Effect.logError('Mail request failed', error).pipe(Effect.as(json({ error: 'Service temporarily unavailable' }, { status: 503 })));
    })), { signal });
  } catch (error) {
    console.error('Mail service unavailable', error);
    return json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }
}
