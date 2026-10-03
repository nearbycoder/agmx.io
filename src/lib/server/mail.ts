import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Effect } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import type { Attachment, Folder, InboxStats, Mailbox, Message, MessageSummary } from '../types';
import { MailError, settings } from './config';

export const keyHash = (key: string) => createHash('sha256').update(key).digest('hex');
const issueKey = () => `agmx_${randomBytes(32).toString('base64url')}`;
const denied = () => new MailError({ status: 401, message: 'A valid mailbox API key is required' });

export function equalSecret(actual: string, expected: string) {
  return timingSafeEqual(Buffer.from(keyHash(actual)), Buffer.from(keyHash(expected)));
}

export const rateLimit = (bucket: string, limit: number, seconds = 60) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<{ count: number }>`
    INSERT INTO rate_limits (bucket, count, expires_at)
    VALUES (${bucket}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (bucket) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
    RETURNING count`;
  if (rows[0].count > limit) return yield* Effect.fail(new MailError({ status: 429, message: 'Too many requests. Please try again shortly.' }));
});

export const registerMailbox = (input: { username: string; name: string; registrationToken?: string }, options: { operational?: boolean } = {}) => Effect.gen(function* () {
  const config = settings();
  if (config.production && !config.registrationToken) {
    return yield* Effect.fail(new MailError({ status: 503, message: 'Mailbox registration has not been configured' }));
  }
  if (config.registrationToken && !equalSecret(input.registrationToken || '', config.registrationToken)) {
    return yield* Effect.fail(new MailError({ status: 403, message: 'A valid registration token is required' }));
  }
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,47}$/.test(username) || username.includes('..') || /[._-]$/.test(username)) {
    return yield* Effect.fail(new MailError({ status: 400, message: 'Use 2–48 letters, numbers, dots, underscores or hyphens for the inbox name' }));
  }
  if (!options.operational && ['postmaster', 'abuse', 'admin', 'root', 'support', 'security'].includes(username)) {
    return yield* Effect.fail(new MailError({ status: 400, message: 'This address is reserved for service operations' }));
  }
  if (!name || name.length > 80) return yield* Effect.fail(new MailError({ status: 400, message: 'Agent name must be between 1 and 80 characters' }));
  const sql = yield* SqlClient;
  const apiKey = issueKey();
  const rows = yield* sql<Mailbox>`
    INSERT INTO mailboxes (id, address, name, key_hash)
    VALUES (${randomUUID()}, ${`${username}@${config.domain}`}, ${name}, ${keyHash(apiKey)})
    ON CONFLICT (address) DO NOTHING
    RETURNING id, address, name, created_at`;
  if (!rows[0]) return yield* Effect.fail(new MailError({ status: 409, message: 'That inbox address is already registered' }));
  return { mailbox: rows[0], api_key: apiKey };
});

export const authenticate = (key: string) => Effect.gen(function* () {
  if (!/^agmx_[A-Za-z0-9_-]{43}$/.test(key)) return yield* Effect.fail(denied());
  const sql = yield* SqlClient;
  const rows = yield* sql<Mailbox>`SELECT id, address, name, created_at FROM mailboxes WHERE key_hash = ${keyHash(key)} AND disabled = false`;
  if (!rows[0]) return yield* Effect.fail(denied());
  return rows[0];
});

export const findRecipient = (address: string, includeDisabled = false) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<{ id: string; address: string }>`SELECT id, address FROM mailboxes WHERE address = ${address.toLowerCase()} AND (disabled = false OR ${includeDisabled})`;
  return rows[0] || null;
});

export const rotateKey = (mailboxId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const apiKey = issueKey();
  yield* sql`UPDATE mailboxes SET key_hash = ${keyHash(apiKey)} WHERE id = ${mailboxId}`;
  return { api_key: apiKey };
});

function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(decoded) && decoded.length === 2 && typeof decoded[0] === 'string' &&
      !Number.isNaN(Date.parse(decoded[0])) && typeof decoded[1] === 'string' && /^[a-f0-9-]{36}$/.test(decoded[1])) {
      return { date: decoded[0], id: decoded[1] };
    }
  } catch { /* invalid cursor */ }
  throw new MailError({ status: 400, message: 'Invalid pagination cursor' });
}

export const listMessages = (mailboxId: string, options: { folder?: Folder; query?: string; cursor?: string; limit?: number; unread?: boolean } = {}) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const cursor = yield* Effect.try({ try: () => decodeCursor(options.cursor), catch: (error) => error as MailError });
  const limit = Math.max(1, Math.min(100, options.limit || 30));
  const params: unknown[] = [mailboxId, options.folder || 'inbox'];
  let conditions = 'mailbox_id = $1 AND folder = $2';
  if (options.query) {
    params.push(`%${options.query.replace(/[\\%_]/g, '\\$&')}%`);
    conditions += ` AND (subject ILIKE $${params.length} OR sender ILIKE $${params.length} OR text_body ILIKE $${params.length})`;
  }
  if (options.unread) conditions += ' AND read_at IS NULL';
  if (cursor) {
    params.push(cursor.date, cursor.id);
    conditions += ` AND (received_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }
  params.push(limit + 1);
  const rows = yield* sql.unsafe<MessageSummary>(`SELECT id, sender, subject, preview, received_at, read_at, folder, attachment_count
    FROM messages WHERE ${conditions} ORDER BY received_at DESC, id DESC LIMIT $${params.length}`, params);
  const messages = rows.slice(0, limit);
  const last = messages.at(-1);
  return {
    messages,
    next_cursor: rows.length > limit && last ? Buffer.from(JSON.stringify([last.received_at, last.id])).toString('base64url') : null
  };
});

export const stats = (mailboxId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const [row] = yield* sql<InboxStats>`SELECT
    count(*) FILTER (WHERE folder = 'inbox')::integer AS inbox,
    count(*) FILTER (WHERE folder = 'inbox' AND read_at IS NULL)::integer AS unread,
    count(*) FILTER (WHERE folder = 'archive')::integer AS archive,
    count(*) FILTER (WHERE folder = 'quarantine')::integer AS quarantine
    FROM messages WHERE mailbox_id = ${mailboxId}`;
  return row;
});

export const getMessage = (mailboxId: string, messageId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  // Project only this inbox's delivery address, including for existing records.
  // SMTP envelope recipients can include private BCC addresses.
  const rows = yield* sql<Omit<Message, 'attachments'>>`SELECT id, sender,
    jsonb_build_array((SELECT address FROM mailboxes WHERE id = ${mailboxId})) AS recipients,
    subject, preview, text_body, message_id, spam_score,
    received_at, read_at, folder, attachment_count FROM messages WHERE id = ${messageId} AND mailbox_id = ${mailboxId}`;
  if (!rows[0]) return yield* Effect.fail(new MailError({ status: 404, message: 'Message not found' }));
  const attachments = yield* sql<Attachment>`SELECT id, filename, content_type, size FROM attachments WHERE message_id = ${messageId}`;
  return { ...rows[0], attachments };
});

export const updateMessage = (mailboxId: string, messageId: string, update: { read?: boolean; folder?: Folder }) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* getMessage(mailboxId, messageId);
  if (update.read !== undefined) {
    yield* sql`UPDATE messages SET read_at = ${update.read ? new Date().toISOString() : null}::timestamptz WHERE id = ${messageId} AND mailbox_id = ${mailboxId}`;
  }
  if (update.folder) yield* sql`UPDATE messages SET folder = ${update.folder} WHERE id = ${messageId} AND mailbox_id = ${mailboxId}`;
  return yield* getMessage(mailboxId, messageId);
});

export const getAttachment = (mailboxId: string, attachmentId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<Attachment & { object_key: string }>`SELECT a.id, a.filename, a.content_type, a.size, a.object_key
    FROM attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = ${attachmentId} AND m.mailbox_id = ${mailboxId}`;
  if (!rows[0]) return yield* Effect.fail(new MailError({ status: 404, message: 'Attachment not found' }));
  return rows[0];
});
