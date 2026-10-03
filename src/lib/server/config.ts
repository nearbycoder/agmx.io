import 'dotenv/config';
import { Data } from 'effect';

export class MailError extends Data.TaggedError('MailError')<{
  status: number;
  message: string;
}> {}

export function settings() {
  const production = process.env.NODE_ENV === 'production';
  return {
    production,
    origin: process.env.ORIGIN || 'http://localhost:5173',
    domain: (process.env.MAIL_DOMAIN || 'mail.agmx.io').toLowerCase(),
    registrationToken: process.env.REGISTRATION_TOKEN || '',
    databaseUrl: process.env.DATABASE_URL,
    dataDir: process.env.DATA_DIR || '.data',
    smtpHost: process.env.SMTP_HOSTNAME || 'mx.agmx.io',
    smtpPort: Number(process.env.SMTP_PORT || 1025),
    maxMessageBytes: 25 * 1024 * 1024,
    spamUrl: process.env.RSPAMD_URL,
    spamPassword: process.env.RSPAMD_PASSWORD,
    s3Bucket: process.env.S3_BUCKET,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION || 'us-east-1',
    s3AccessKey: process.env.S3_ACCESS_KEY_ID,
    s3SecretKey: process.env.S3_SECRET_ACCESS_KEY
  };
}
