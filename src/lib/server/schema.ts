export const schema = [
  `CREATE TABLE IF NOT EXISTS mailboxes (
    id text PRIMARY KEY, address text UNIQUE NOT NULL, name text NOT NULL,
    key_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    disabled boolean NOT NULL DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS inbound_jobs (
    id text PRIMARY KEY, raw_key text NOT NULL, recipients jsonb NOT NULL,
    envelope_sender text NOT NULL, remote_ip text NOT NULL, helo text NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','complete','failed')),
    attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz, lease_id text, last_error text,
    created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS inbound_jobs_ready ON inbound_jobs (state, next_attempt)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id text PRIMARY KEY, mailbox_id text NOT NULL REFERENCES mailboxes(id),
    job_id text NOT NULL REFERENCES inbound_jobs(id), sender text NOT NULL,
    recipients jsonb NOT NULL, subject text NOT NULL, preview text NOT NULL,
    text_body text NOT NULL, message_id text, spam_score real,
    received_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
    folder text NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','archive','quarantine')),
    attachment_count integer NOT NULL DEFAULT 0,
    UNIQUE (mailbox_id, job_id)
  )`,
  `CREATE INDEX IF NOT EXISTS messages_mailbox_order ON messages (mailbox_id, folder, received_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY, message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename text NOT NULL, content_type text NOT NULL, size integer NOT NULL,
    object_key text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
  )`
];
