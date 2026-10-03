# Agent Mail · agmx.io

A self-hosted, receive-only email service for agents. An agent registers `nearby@mail.agmx.io`, receives a mailbox-scoped API key, and reads email through HTTP, the browser inbox, or MCP. Inbound delivery is handled by our own SMTP receiver; no email SaaS is required.

## Stack and responsibilities

| Technology | Responsibility |
| --- | --- |
| SvelteKit **3.0.0** / Svelte 5 | Browser inbox, registration and HTTP endpoints; Node adapter |
| Effect **4.0.0** | Typed workflows, dependency injection, SQL transactions, concurrency, retry scheduling and authoritative UI state |
| Effect SQL + PostgreSQL | Durable accounts, key hashes, inbox state and inbound job queue |
| `smtp-server` + MailParser | SMTP receiver, envelope validation and MIME parsing |
| Rspamd **4.2** | Sender authentication and spam scoring; suspicious messages go to quarantine |
| S3-compatible object storage | Durable raw messages and attachments; shared local files are supported on a single host |
| Official MCP TypeScript SDK **2.3.0** | Streamable HTTP MCP endpoint; modern and legacy protocol compatibility |
| Caddy | HTTPS for the web app and API |

Effect owns client state through `SubscriptionRef`; Svelte subscribes to snapshots. Effect SQL owns all database access. PostgreSQL remains the durable source of truth across processes and restarts; in-memory Effect state is never used as the delivery queue.

The SMTP listener is an application-specific receiving gateway, rather than a general-purpose forwarding MTA. It accepts only registered recipients and never relays mail. A mature front-end MTA such as Postfix can be added if you need larger-scale connection management, SMTP rejection policies, or secondary MX servers.

```text
Internet sender ── SMTP :25 ──> receiver ──> raw object + durable queue
                                                   │
                                      Effect worker + Rspamd
                                                   │
                                      PostgreSQL + attachments
                                                   │
                             SvelteKit inbox / HTTP API / MCP agent
```

## Local development

Requires Node.js 24 or newer.

```sh
npm ci
cp .env.example .env
# Keep SMTP_BIND=127.0.0.1 for local-only SMTP testing.
npm run dev
```

Use the Local URL printed by Vite; it chooses another port if 5173 is occupied. With `ENABLE_DEV_SMTP=true`, the app also starts an SMTP receiver on port 1025 and an embedded queue worker when the first request initializes the server. Without `DATABASE_URL`, local development uses persistent PGlite (embedded PostgreSQL) in `.data/postgres`. Raw mail and attachments live in `.data/objects`.

Register an inbox in the UI and save its one-time key. To deliver a real test message locally:

```sh
python3 - <<'PY'
import smtplib
from email.message import EmailMessage

message = EmailMessage()
message['From'] = 'human@example.org'
message['To'] = 'nearby@mail.agmx.io' # Register this inbox first.
message['Subject'] = 'Hello, agent'
message.set_content('Your self-hosted inbox is receiving email.')
message.add_attachment(b'Useful data', maintype='text', subtype='plain', filename='notes.txt')
with smtplib.SMTP('127.0.0.1', 1025) as smtp:
    smtp.send_message(message)
PY
```

The inbox refreshes every 15 seconds. Use Refresh to update immediately. Opening a message in the browser marks it read; HTTP GET and MCP `read_email` leave read state unchanged.

To run SMTP and processing in separate processes, use a real PostgreSQL server and set the same `DATABASE_URL` and storage configuration in every process:

```sh
npm run dev   # Set ENABLE_DEV_SMTP=false to avoid another listener.
npm run smtp
npm run worker
```

Do not open the same PGlite directory from multiple processes. Standalone SMTP and worker scripts require `DATABASE_URL` for this reason.

## Production setup

The production stack is prepared in `compose.yaml`. It has separate web, SMTP and worker processes, PostgreSQL, Rspamd and Caddy. The app image runs as an unprivileged user, with host port 25 mapped to container port 1025. PostgreSQL and Rspamd ports are internal only.

1. Use a Linux VPS with a fixed public IP and **inbound TCP port 25 allowed**. A starting allocation of 2 CPUs and 4 GB RAM is reasonable for a small deployment; size storage for your mail volume. Confirm port 25 availability with the host before purchasing it.
2. Set these DNS records at the authoritative provider for `agmx.io`:

   | Name | Type | Value |
   | --- | --- | --- |
   | `agmx.io` | A | Your web server IPv4 |
   | `mx.agmx.io` | A | Your SMTP server IPv4; DNS only, without an HTTP proxy |
   | `mail.agmx.io` | MX | Priority `10`, target `mx.agmx.io.` |

   Publish AAAA records only if IPv6 routing and port 25 actually work. Preserve existing root-domain MX records: agent inboxes use the separate `mail.agmx.io` subdomain. A provider PTR record matching `mx.agmx.io` is useful for operating the SMTP host.

3. Obtain a publicly trusted TLS certificate for `mx.agmx.io`. A DNS-01 ACME client is suitable because Caddy manages ports 80/443 for the web application. Set up automatic renewal and restart the SMTP process after renewal so it reloads the certificate.
4. Create `.env` from `.env.example`. Set `POSTGRES_PASSWORD` and `REGISTRATION_TOKEN` to separately generated random hex values, and set `SMTP_CERTS_DIR` to a directory containing readable `fullchain.pem` and `privkey.pem`. Use copies of the actual certificate files: relative symlinks to a Let's Encrypt archive outside the mounted directory will not resolve. Keep the private key accessible only to the SMTP container's user and the operator.
5. For object storage, either retain the persistent shared `mail-data` volume for a single host or fill in the `S3_*` values. The same bucket and credentials must be available to all app processes. S3 storage is recommended when scaling to multiple hosts. Use durable encrypted volumes or bucket encryption, private access, and backups.
6. Build and start:

   ```sh
   docker compose up -d --build
   docker compose run --rm web npm run operator -- bootstrap
   ```

   Bootstrap creates the reserved `postmaster@mail.agmx.io` and `abuse@mail.agmx.io` inboxes and outputs their one-time API keys. Save the keys and monitor these inboxes. The command is idempotent and does not reveal existing keys.

7. Verify `https://agmx.io/api/health`, register an agent with the registration token, and send an external test email to its address. Confirm inbox and MCP retrieval, STARTTLS availability, and rejection of unknown/external recipients before opening registration to your agents.

Public DNS, the production host and TLS credentials are not configured by this repository. Docker images and the Rspamd deployment should be validated on the chosen host before launch. The code's SMTP/queue/MCP tests run with PGlite and can also run against PostgreSQL.

This service currently receives email. Sending/replying, IMAP, OAuth login, custom user domains, billing and mailbox deletion are outside the implemented scope. Inbox credentials are bearer API keys, not passwords or full OAuth grants. Clients that require OAuth-only MCP authentication will need an additional auth layer.

## Register and read through HTTP

```sh
curl -X POST https://agmx.io/api/mailboxes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_REGISTRATION_TOKEN' \
  -d '{"username":"nearby","name":"Nearby agent"}'
```

The response contains `mailbox`, the one-time `api_key`, and `mcp_url`. Production registration requires a configured registration token. Names are normalized, unique, and reserved operational names cannot be registered through the public API.

```sh
curl 'https://agmx.io/api/messages?folder=inbox&limit=30' \
  -H 'Authorization: Bearer YOUR_MAILBOX_API_KEY'
```

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/mailboxes` | Register using a service registration token |
| GET | `/api/mailbox` | Authenticated mailbox identity |
| GET | `/api/stats` | Inbox, unread, archive and quarantine counts |
| GET | `/api/messages` | List; `folder`, `q`, `unread`, `limit` and `cursor` filters |
| GET | `/api/messages/:id` | Text, metadata and attachment IDs |
| PATCH | `/api/messages/:id` | `{ "read": true, "folder": "archive" }`; either field is optional |
| GET | `/api/attachments/:id` | Authenticated attachment download |
| POST | `/api/mailbox/key` | Revoke old key and return replacement once |
| GET | `/api/health` | Check application/database availability |

Message `recipients` metadata contains only the authenticated mailbox delivery address, including for messages stored before this privacy restriction. The SMTP envelope can contain other To/Cc/BCC recipients; it is private to processing and operator storage. Sender-authored To/Cc headers, quoted text, forwarded messages and attachments may legitimately name other addresses. Original RFC messages and content are preserved, not redacted; operators with database/object-store access can see raw mail and the full envelope. This service does not promise to conceal addresses that the sender includes in email content.

All mailbox endpoints require `Authorization: Bearer <mailbox-key>` or the secure browser session. Registration tokens cannot read mail. Missing/invalid keys return 401; cross-mailbox message and attachment IDs return 404. Responses are not cached.

Pagination returns `next_cursor`. Pass it back with the same filters to retrieve the next page; pages sort by receive time and ID. Search is case-insensitive across sender, subject and text body. Dates use the receiver's queue acceptance time rather than a sender-controlled Date header.

## MCP

Remote endpoint: `https://agmx.io/mcp`.

```json
{
  "mcpServers": {
    "agmx-mail": {
      "url": "https://agmx.io/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MAILBOX_API_KEY"
      }
    }
  }
}
```

Client configuration syntax varies; use the client's remote Streamable HTTP server configuration with this URL and header. The service uses the official SDK's stateless HTTP handler and supports modern and legacy MCP requests. Each HTTP request authenticates the key anew; no in-memory MCP session is required for horizontal scaling.

| Tool | Behavior |
| --- | --- |
| `get_mailbox` | Mailbox identity and counts |
| `list_emails` | Folder/filter/search, unread filter and cursor pagination |
| `read_email` | Full text and attachment metadata; does not mark read |
| `update_email` | Mark read/unread, archive, restore, or quarantine |
| `read_attachment` | Base64 for attachments up to 1 MiB; larger files use HTTP |

The `mailbox://<id>` resource also exposes the authenticated mailbox identity and counts. All tools are restricted to the authenticated inbox. Treat email bodies and attachment contents as untrusted input, including instructions embedded by a sender.

## Delivery guarantees and operations

- The receiver validates every SMTP recipient, enforces a 25 MiB message size, allows at most 20 recipients per message and 20 concurrent SMTP clients, and applies per-IP rate limits.
- Raw message persistence and a committed queue record precede SMTP `250`. Storage/database failures return temporary SMTP failures so the sender can retry. Object writes use S3 PUT or local file and directory fsync.
- A worker claims jobs atomically, with a lease and a fencing token. It checks spam, parses MIME, stores attachments, and commits every recipient's message and job completion in a transaction.
- Duplicate processing of the same job is idempotent. Completed jobs cannot be moved back to pending by processing-error recovery or the operator retry command; that command atomically updates only failed jobs. SMTP retries after an ambiguous network disconnect can still create a separate delivery, as with normal SMTP. Sender-controlled Message-ID is not treated as a trustworthy deduplication key.
- Filter/storage/processing failures retry with exponential delay, up to 12 attempts. Production processing fails closed when no spam filter is configured. Suspicious mail is quarantined; filter failures never silently discard accepted messages.
- Failed jobs retain their raw messages and errors. Inspect and requeue after fixing the cause:

  ```sh
  docker compose run --rm web npm run operator -- jobs
  docker compose run --rm web npm run operator -- retry JOB_ID
  docker compose logs --tail=100 smtp worker
  ```

- The SMTP listener exits when production TLS/spam-filter configuration is missing. The production database requires PostgreSQL. The worker processes one message at a time; run additional worker containers for higher throughput.
- API keys have 256 bits of randomness and are stored as SHA-256 hashes. Browser sessions use HttpOnly, SameSite=Strict cookies, Secure in production, and origin checks. Key rotation also updates the active browser session.
- HTML is converted to text and never rendered as active content. Attachments download with `Content-Disposition: attachment` and `nosniff`; they are not automatically executed or displayed inline. Spam filtering is not a guarantee that an attachment is malware-free.
- Raw messages and attachments are retained indefinitely. Monitor queue age, failed jobs, disk/bucket growth, and DB/storage backups. Before a broad public launch, set your retention/quotas, backup recovery procedures, abuse handling and malware-scanning policy. A storage write followed by a lost DB response can leave either a committed queue entry or an orphan object. Raw objects are deliberately preserved on uncertain inserts. Reconcile using the stable UUID in `raw/<job-id>` and `inbound_jobs.id`/`raw_key`; never delete objects solely because an insert returned an error. Do reconciliation against a consistent backup or while ingress is paused so an in-flight insert cannot race deletion.
- The health endpoint checks the web app/database, not external SMTP reachability or successful spam scans. Monitor SMTP port 25, STARTTLS and the inbound queue separately. Back up both the database and message objects together.

## Validation

```sh
npm run check
npm test
npm run build
```

The 14-test readiness suite passes against isolated PGlite and disposable PostgreSQL fixtures. It covers production registration tokens, HTTP authentication/origin checks, three-recipient To/Cc/BCC privacy through HTTP/MCP reads and search, scoped attachment access, simulated lost queue/completion responses, stale/concurrent operator retries, oversized SMTP DATA, truncated MIME and large attachment limits. Tests also exercise actual TCP SMTP delivery and relay rejection, durable queue/storage, MIME attachments, tenant isolation, repeated job processing, search/pagination, folder changes, retry after spam-filter failure, key rotation and the official MCP HTTP transport. To run the same suite against a disposable empty PostgreSQL database:

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST/EMPTY_TEST_DATABASE npm test
```

Only use a disposable test database: tests create fixture accounts and messages. Headless Chromium checks against a separate local fixture passed desktop keyboard registration/read/archive/download and mobile Escape/sign-in/restore, with no page errors or horizontal overflow. The native collaborative preview was unavailable in the review environment. HTTP/MCP route checks use the real route handlers with isolated request fixtures. Container startup and public delivery are still prerequisites below.

Implementation references: [Effect 4](https://github.com/Effect-TS/effect), [SvelteKit 3](https://svelte.dev/blog/sveltekit-3-is-here), [SMTP receiver](https://nodemailer.com/extras/smtp-server), [Rspamd protocol](https://docs.rspamd.com/developers/protocol/), [official MCP HTTP handler](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).

## Remaining launch prerequisites

Public delivery is not live. No DNS, firewall or production infrastructure changes were made during the readiness review.

- Provision the chosen host with a fixed public IP, persistent encrypted storage and confirmed inbound TCP 25; allow HTTP/HTTPS 80/443 for Caddy.
- Set `agmx.io` A and `mx.agmx.io` A to the appropriate host(s), then `mail.agmx.io` MX priority 10 to `mx.agmx.io.`. Leave existing root-domain MX records intact; publish IPv6 only after testing it.
- Supply separate strong `POSTGRES_PASSWORD` and `REGISTRATION_TOKEN` values, shared durable storage, and readable trusted `mx.agmx.io` TLS certificate/key copies in `SMTP_CERTS_DIR`; configure renewal and SMTP restart.
- Validate `docker compose config`, build/start all services on the target host, and verify Rspamd 4.2 scans and the unprivileged SMTP user's certificate access. The review environment has a Docker CLI but no Compose plugin or running daemon, so container startup has **not** been verified.
- Bootstrap and monitor postmaster/abuse inboxes; define retention/quotas, monitoring and backup/restore procedures for both PostgreSQL and objects.
- Test from an external sender: public port 25, STARTTLS certificate, registered-recipient delivery, unknown-recipient/relay rejection, spam quarantine, and retrieval through HTTPS HTTP/MCP. `/api/health` alone does not validate public delivery.
