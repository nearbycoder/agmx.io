import { SMTPServer, type SMTPServerSession } from 'smtp-server';
import { readFile } from 'node:fs/promises';
import { Effect } from 'effect';
import { runtime } from './runtime';
import { findRecipient, keyHash, rateLimit } from './mail';
import { enqueueInbound } from './ingest';
import { settings } from './config';

function smtpError(message: string, responseCode: number) {
  return Object.assign(new Error(message), { responseCode });
}

export async function startSmtp() {
  const config = settings();
  const certPath = process.env.SMTP_TLS_CERT;
  const keyPath = process.env.SMTP_TLS_KEY;
  if (config.production && (!certPath || !keyPath || !config.spamUrl)) {
    throw new Error('Production SMTP requires SMTP_TLS_CERT, SMTP_TLS_KEY and RSPAMD_URL');
  }
  await runtime.runPromise(Effect.succeed(undefined));
  const server = new SMTPServer({
    name: config.smtpHost,
    banner: 'agmx.io Agent Mail',
    authOptional: true,
    disabledCommands: certPath && keyPath ? ['AUTH'] : ['AUTH', 'STARTTLS'],
    cert: certPath ? await readFile(certPath) : undefined,
    key: keyPath ? await readFile(keyPath) : undefined,
    size: config.maxMessageBytes,
    maxClients: 20,
    socketTimeout: 60_000,
    hidePIPELINING: true,
    onConnect(session, callback) {
      runtime.runPromise(rateLimit(`smtp:${keyHash(session.remoteAddress)}`, 60))
        .then(() => callback(), () => callback(smtpError('Temporarily unable to accept connection', 421)));
    },
    onMailFrom(_address, session, callback) {
      runtime.runPromise(rateLimit(`smtp-messages:${keyHash(session.remoteAddress)}`, 300, 3600))
        .then(() => callback(), () => callback(smtpError('Message rate limit reached; retry later', 451)));
    },
    onRcptTo(address, session, callback) {
      if (session.envelope.rcptTo.length >= 20) { callback(smtpError('Too many recipients', 452)); return; }
      // RFC 5321 also permits the bare Postmaster recipient.
      const recipient = address.address.toLowerCase() === 'postmaster' ? `postmaster@${config.domain}` : address.address;
      runtime.runPromise(findRecipient(recipient)).then(
        (mailbox) => { if (mailbox) address.address = recipient; callback(mailbox ? undefined : smtpError('No such mailbox; relay denied', 550)); },
        () => callback(smtpError('Recipient lookup temporarily unavailable', 451))
      );
    },
    onData(stream, session: SMTPServerSession, callback) {
      // Continue draining an oversized DATA stream without retaining more bytes.
      let size = 0;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= config.maxMessageBytes) chunks.push(chunk);
      });
      stream.once('error', () => callback(smtpError('Unable to receive message', 451)));
      stream.once('end', () => {
        if (stream.sizeExceeded || size > config.maxMessageBytes) {
          callback(smtpError('Message exceeds 25 MiB', 552)); return;
        }
        const envelope = {
          recipients: session.envelope.rcptTo.map((r) => r.address),
          sender: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          remoteIp: session.remoteAddress, helo: session.hostNameAppearsAs || ''
        };
        runtime.runPromise(enqueueInbound(Buffer.concat(chunks), envelope)).then(
          ({ id }) => callback(null, `Queued as ${id}`),
          () => callback(smtpError('Message storage temporarily unavailable; retry later', 451))
        );
      });
    }
  });
  server.on('error', (error) => console.error('SMTP listener error:', error.message));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.smtpPort, process.env.SMTP_BIND || '0.0.0.0', () => {
      server.removeListener('error', reject); resolve();
    });
  });
  console.info(`Agent Mail SMTP listening on port ${config.smtpPort}`);
  return server;
}
