import { randomUUID } from 'node:crypto';
import { Effect, Schedule } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';
import { settings, MailError } from './config';
import { getObject, putObject } from './storage';
import { findRecipient } from './mail';

interface InboundEnvelope {
  recipients: string[];
  sender: string;
  remoteIp: string;
  helo: string;
}

export interface Job {
  id: string;
  raw_key: string;
  recipients: string[];
  envelope_sender: string;
  remote_ip: string;
  helo: string;
  attempts: number;
  lease_id: string;
}

// SMTP must wait for BOTH object persistence and queue commit before responding 250.
export const enqueueInbound = (raw: Uint8Array, envelope: InboundEnvelope) => Effect.gen(function* () {
  if (raw.byteLength > settings().maxMessageBytes) return yield* Effect.fail(new MailError({ status: 413, message: 'Message exceeds 25 MiB' }));
  const sql = yield* SqlClient;
  const recipients = [...new Set(envelope.recipients.map((address) => address.toLowerCase()))];
  if (!recipients.length) return yield* Effect.fail(new MailError({ status: 400, message: 'No recipients' }));
  for (const address of recipients) {
    if (!(yield* findRecipient(address))) return yield* Effect.fail(new MailError({ status: 404, message: 'Unknown recipient' }));
  }
  const id = randomUUID();
  const key = `raw/${id}`;
  yield* putObject(key, raw);
  // A failed response can follow a successful commit. Preserve the raw object
  // rather than risk deleting mail referenced by a committed queue record.
  yield* sql`INSERT INTO inbound_jobs (id, raw_key, recipients, envelope_sender, remote_ip, helo)
    VALUES (${id}, ${key}, ${JSON.stringify(recipients)}::jsonb, ${envelope.sender}, ${envelope.remoteIp}, ${envelope.helo})`;
  return { id };
});

export const claimJob = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const lease = randomUUID();
  const rows = yield* sql<Job>`UPDATE inbound_jobs SET state = 'processing', attempts = attempts + 1,
    locked_until = now() + interval '5 minutes', lease_id = ${lease}
    WHERE id = (SELECT id FROM inbound_jobs WHERE
      (state = 'pending' AND next_attempt <= now()) OR (state = 'processing' AND locked_until < now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`;
  return rows[0] || null;
});

const scanMessage = (raw: Uint8Array, job: Job) => Effect.gen(function* () {
  const config = settings();
  if (!config.spamUrl) {
    if (config.production) return yield* Effect.fail(new MailError({ status: 503, message: 'Spam filtering must be configured in production' }));
    return { score: null as number | null, quarantine: false };
  }
  const result = yield* Effect.tryPromise({
    try: async () => {
      const body = new FormData();
      body.append('metadata', new Blob([JSON.stringify({ ip: job.remote_ip, from: job.envelope_sender,
        rcpt: job.recipients, helo: job.helo, queue_id: job.id })], { type: 'application/json' }), 'metadata.json');
      body.append('message', new Blob([Buffer.from(raw)], { type: 'message/rfc822' }), 'message.eml');
      const response = await fetch(`${config.spamUrl!.replace(/\/$/, '')}/checkv3`, {
        method: 'POST', body, signal: AbortSignal.timeout(30_000),
        headers: config.spamPassword ? { Password: config.spamPassword } : {}
      });
      if (!response.ok) throw new Error('Spam filter unavailable');
      const data = await response.json() as { score: number; action: string };
      if (!Number.isFinite(data.score) || typeof data.action !== 'string') throw new Error('Invalid spam filter response');
      return data;
    },
    catch: () => new MailError({ status: 503, message: 'Spam filter unavailable' })
  });
  return { score: result.score, quarantine: ['reject', 'soft reject', 'add header', 'quarantine'].includes(result.action) || result.score >= 6 };
});

export const processJob = (job: Job) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  const raw = yield* getObject(job.raw_key);
  const spam = yield* scanMessage(raw, job);
  const parsed = yield* Effect.tryPromise({
    try: () => simpleParser(Buffer.from(raw), { skipHtmlToText: true, skipTextToHtml: true, maxHtmlLengthToParse: settings().maxMessageBytes }),
    catch: () => new MailError({ status: 422, message: 'Email could not be parsed' })
  });
  const text = parsed.text || (parsed.html ? convert(parsed.html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] }) : '');
  const files: { id: string; filename: string; content_type: string; size: number; key: string }[] = [];
  for (const [index, attachment] of parsed.attachments.entries()) {
    const key = `attachments/${job.id}/${index}`;
    yield* putObject(key, attachment.content);
    files.push({ id: randomUUID(), filename: attachment.filename || `attachment-${index + 1}`, content_type: attachment.contentType,
      size: attachment.size, key });
  }
  yield* sql.withTransaction(Effect.gen(function* () {
    // Lease fence prevents an expired worker from committing over a newer worker.
    const current = yield* sql`SELECT id FROM inbound_jobs WHERE id = ${job.id} AND lease_id = ${job.lease_id} AND state = 'processing' FOR UPDATE`;
    if (!current.length) return;
    for (const address of job.recipients) {
      const mailbox = yield* findRecipient(address, true);
      if (!mailbox) continue;
      const id = randomUUID();
      const inserted = yield* sql`INSERT INTO messages (id, mailbox_id, job_id, sender, recipients, subject, preview, text_body,
        message_id, spam_score, folder, attachment_count, received_at)
        VALUES (${id}, ${mailbox.id}, ${job.id}, ${parsed.from?.text || job.envelope_sender || '(unknown sender)'},
          ${JSON.stringify([address])}::jsonb, ${parsed.subject || '(no subject)'}, ${text.replace(/\s+/g, ' ').slice(0, 180)}, ${text},
          ${parsed.messageId || null}, ${spam.score}, ${spam.quarantine ? 'quarantine' : 'inbox'}, ${files.length},
          (SELECT created_at FROM inbound_jobs WHERE id = ${job.id}))
        ON CONFLICT (mailbox_id, job_id) DO NOTHING RETURNING id`;
      if (!inserted.length) continue;
      for (const file of files) {
        yield* sql`INSERT INTO attachments (id, message_id, filename, content_type, size, object_key)
          VALUES (${randomUUID()}, ${id}, ${file.filename}, ${file.content_type}, ${file.size}, ${file.key})`;
      }
    }
    yield* sql`UPDATE inbound_jobs SET state = 'complete', completed_at = now(), locked_until = NULL, last_error = NULL WHERE id = ${job.id} AND lease_id = ${job.lease_id}`;
  }));
});

export const runWorkerOnce = Effect.gen(function* () {
  const job = yield* claimJob;
  if (!job) return false;
  yield* processJob(job).pipe(Effect.timeout('4 minutes'), Effect.catch((error) => Effect.gen(function* () {
    const sql = yield* SqlClient;
    const seconds = Math.min(3600, 5 * 2 ** Math.min(job.attempts, 10));
    yield* sql`UPDATE inbound_jobs SET state = ${job.attempts >= 12 ? 'failed' : 'pending'},
      next_attempt = now() + ${seconds} * interval '1 second', locked_until = NULL,
      last_error = ${error instanceof MailError ? error.message : 'Processing failed; inspect worker logs'}
      WHERE id = ${job.id} AND lease_id = ${job.lease_id} AND state = 'processing'`;
    yield* Effect.logError('Inbound message processing failed', { jobId: job.id, attempt: job.attempts, error });
  })));
  return true;
});

export const workerLoop = Effect.forever(Effect.gen(function* () {
  const processed = yield* runWorkerOnce.pipe(Effect.catch((error) => Effect.logError('Queue worker failed', error).pipe(Effect.as(false))));
  if (!processed) yield* Effect.sleep('2 seconds');
}));

// Conditional update is atomic with respect to worker completion and stale CLI requests.
export const retryFailedJob = (id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient;
  return yield* sql`UPDATE inbound_jobs SET state = 'pending', attempts = 0, next_attempt = now(), lease_id = NULL, locked_until = NULL
    WHERE id = ${id} AND state = 'failed' RETURNING id`;
});

export const maintenanceLoop = Effect.repeat(Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`DELETE FROM rate_limits WHERE expires_at < now() - interval '1 day'`;
}).pipe(Effect.catch((error) => Effect.logError('Maintenance failed', error))), Schedule.spaced('1 hour'));
