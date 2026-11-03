<p align="center">
  <img src="public/favicon.svg" width="56" height="56" alt="AGMX">
</p>

<h1 align="center">AGMX — email inboxes for AI agents</h1>

<p align="center">
  Real addresses your agents can sign up with, read verification codes from, and reply on.<br>
  One REST API, an MCP server, and signed webhooks. Open source, built on Amazon SES.
</p>

---

## What it does

- **Instant inboxes.** `POST /api/v1/agents` → `scout@agmx.io` is live. Plus-addressing (`scout+github@…`) becomes a label.
- **Agents sign themselves up.** `POST /api/v1/signup` needs no credentials. A human approves the request in the dashboard, and the agent gets its own scoped API key by polling. Point any agent at `/skill.md` and it can do this by itself.
- **Built for verification flows.** Every inbound email is parsed and enriched with `extracted.codes` (OTPs) and `extracted.links` (verify / login / reset / unsubscribe). `GET /api/v1/messages/wait` long-polls until the next email arrives.
- **Full mail client for humans.** Three-pane, keyboard-driven inbox with threads, compose, reply/forward, attachments, search, live updates and dark mode.
- **MCP server** at `/mcp` (Streamable HTTP) with 13 tools: `wait_for_email`, `send_email`, `reply_to_email` and more.
- **Webhooks** for `message.received`, `message.sent`, `message.delivered`, `message.bounced` and `message.complained`. Deliveries are HMAC-signed and retried with backoff.
- **Custom domains.** SES identity with DKIM. Shows the exact DNS records to publish and verifies them.
- **Plans & quotas.** Agents, inboxes per agent, daily and monthly sends, monthly receives, inbound and outbound message size, custom domains, and retention. Mail over the receive limits is dropped and counted. Defined in [`src/shared/plans.ts`](src/shared/plans.ts).
- **Cheap at scale.** Attachments live in S3-compatible object storage (S3, R2, MinIO) and download through signed URLs; raw inbound mail is deleted from the intake bucket the moment it's stored. Postgres holds only metadata and text.
- **Deliverability hygiene.** Hard bounces and complaints go on a suppression list. SPF/DKIM/DMARC and spam/virus verdicts are stored on every inbound message.
- **Invite-only access.** An email allow-list (`ALLOWED_EMAILS`) is enforced at sign-up, sign-in, and every new session.

## Stack

| | |
| --- | --- |
| **TanStack Start** (React 19, Vite, Nitro) | Routing, SSR, server routes |
| **Effect 4** | All backend services, typed errors, transactions, background workers, and the schema-first `HttpApi`. The API generates the OpenAPI spec and the typed client the dashboard uses. |
| **Drizzle ORM + Postgres** | Data model and migrations ([`src/server/db/schema.ts`](src/server/db/schema.ts)) |
| **Better Auth** | Magic-link and password auth, sessions |
| **Amazon SES** | Outbound mail (SESv2 raw send), inbound mail (receipt rules → SNS), domain identities |
| **Tailwind CSS 4, Radix, cmdk** | UI |

```
                    ┌────────────────────────────── TanStack Start (Node) ──────────────────────────────┐
 agents ── REST ──► │ /api/v1/*  Effect HttpApi ─┐                                                       │
 agents ── MCP ───► │ /mcp       JSON-RPC ───────┼──► Effect services (Agents, Mail, Quota, Webhooks…) ──┼──► Postgres
 humans ── web ───► │ dashboard  typed Effect client                │                                   │
 SES ──── SNS ────► │ /api/inbound/ses (signature-verified) ────────┘── SESv2 SendEmail ────────────────┼──► the internet
                    └────────────────────────────────────────────────────────────────────────────────────┘
```

Mail between two AGMX inboxes is delivered internally, without going through SES.

## Local development

Requirements: Node 22.6+ (24 recommended), [Bun](https://bun.sh), and Postgres 15+.

```sh
bun install
cp .env.example .env          # set DATABASE_URL, BETTER_AUTH_SECRET, ALLOWED_EMAILS / ADMIN_EMAILS
bun run db:migrate
bun run dev                   # http://localhost:3100
```

With `MAIL_TRANSPORT=log`, outgoing mail and magic links are printed to the console, so no AWS account is needed. Inject a test email as if it came from the internet:

```sh
curl -X POST localhost:3100/api/dev/inbound -H 'content-type: application/json' -d '{
  "from": "GitHub <noreply@github.com>", "to": "scout@agmx.io",
  "subject": "Your verification code", "text": "Your code is 482913"
}'
```

Other scripts: `bun run test` (Vitest, unit + end-to-end API tests against `TEST_DATABASE_URL`), `bun run typecheck`, `bun run build`, `bun run db:generate` (after schema changes), `bun run db:studio`.

## Deploying

### 1. Railway

1. Create a project from this repository. Railway picks up `railway.json` and the `Dockerfile`.
2. Add a **Postgres** service and set `DATABASE_URL=${{Postgres.DATABASE_URL}}` on the app.
3. Set the variables from [`.env.example`](.env.example): at minimum `BETTER_AUTH_SECRET`, `APP_URL`, `MAIL_DOMAIN`, `ALLOWED_EMAILS`, `ADMIN_EMAILS` and the AWS keys.
4. Add your custom domain (e.g. `agmx.io`) in Railway's networking settings.

Migrations run automatically on boot. Health check: `GET /api/v1/health`.

### 2. Amazon SES

Pick a region that supports **email receiving** (e.g. `us-east-1`, `us-west-2`, `eu-west-1`) and use it for everything below.

1. **Verify your mail domain.** In *SES → Identities → Create identity → Domain*, enter `MAIL_DOMAIN` and enable Easy DKIM. Publish the three DKIM `CNAME` records it shows.
2. **Route inbound mail to SES.** Publish `MX 10 inbound-smtp.<region>.amazonaws.com` on `MAIL_DOMAIN`.
3. **Create an SNS topic** (e.g. `agmx-inbound`). Add an **HTTPS subscription** to `https://<your-host>/api/inbound/ses`. AGMX verifies the signature and confirms the subscription automatically.
4. **Receipt rule.** In *SES → Email receiving → Rule sets*, create and **activate** a rule set. Add a rule for your domain with an **SNS action** targeting the topic, encoding **Base64**. SNS can carry up to 150 KB of mail per message. For larger mail, use an **S3 action** with that SNS topic as its notification. AGMX then fetches the object, which needs `s3:GetObject` on the bucket.
5. **Delivery feedback (recommended).** Create a configuration set with an event destination for *Bounce, Complaint, Delivery* that publishes to an SNS topic subscribed to the same URL. Set `SES_CONFIGURATION_SET`.
6. **Attachment bucket (recommended).** Create a private bucket and set `ATTACHMENT_STORAGE=s3` and `STORAGE_BUCKET`. For Cloudflare R2, also set `STORAGE_ENDPOINT` and R2 keys in `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`.
7. **IAM user** for the app, with `ses:SendEmail`, `ses:SendRawEmail`, `ses:GetAccount`, `ses:CreateEmailIdentity`, `ses:GetEmailIdentity` and `ses:DeleteEmailIdentity`. Add `ses:DescribeReceiptRule`/`ses:UpdateReceiptRule` if you use `SES_RECEIPT_RULE*`, `s3:GetObject` + `s3:DeleteObject` on the inbound bucket, and `s3:PutObject`/`GetObject`/`DeleteObject` on the attachment bucket. Put its keys in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
8. **Leave the sandbox.** Request production access in *SES → Account dashboard*. Until then SES only delivers to verified addresses.

The *Operator* page in the dashboard (`/app/admin`) shows live SES account status, the inbound webhook URL and a setup checklist.

## Using it from an agent

Tell your agent: **"Read https://agmx.io/skill.md and set up your own email inbox."**

Or do it yourself:

```sh
# 1. Agent asks for an inbox (no credentials)
curl -X POST https://agmx.io/api/v1/signup -H 'content-type: application/json' \
  -d '{"name":"Scout","username":"scout","ownerEmail":"you@example.com"}'
# → { approvalUrl, userCode, pollUrl, pollToken, ... }   human opens approvalUrl and approves

# 2. Agent polls pollUrl until status = "approved" and stores apiKey (shown once)

# 3. Wait for a verification email
curl -H "Authorization: Bearer $AGMX_KEY" "https://agmx.io/api/v1/messages/wait?timeout=60"
# → { message: { subject, extracted: { codes: ["482913"], links: [...] }, ... } }

# 4. Send
curl -X POST https://agmx.io/api/v1/messages -H "Authorization: Bearer $AGMX_KEY" \
  -H 'content-type: application/json' -d '{"to":"ada@example.com","subject":"Hi","text":"Hello from Scout"}'
```

**MCP** (Claude Desktop, Cursor, any Streamable-HTTP client):

```json
{
  "mcpServers": {
    "agmx": { "url": "https://agmx.io/mcp", "headers": { "Authorization": "Bearer agmx_agt_…" } }
  }
}
```

Full docs are at `/docs`, the interactive API reference at `/api/v1/reference`, and the OpenAPI spec at `/api/v1/openapi.json`.

## Project layout

```
src/
  shared/          isomorphic: Effect HttpApi definition, schemas, errors, plans, address parsing
  server/
    services/      Effect services: Agents, Mail, Quota, Webhooks, Inbound, Domains, Signups, Account…
    http/          HttpApi handlers + auth middleware (API keys and sessions)
    mail/          MIME compose/parse, OTP & link extraction, SNS verification
    db/            Drizzle schema + client
    auth.ts        Better Auth (allow-list enforced here)
    mcp.ts         MCP tools over the same services
    runtime.ts     Layer wiring + ManagedRuntime
  routes/          TanStack Start routes (marketing, docs, dashboard, API mounts, /mcp, /skill.md)
  components/      UI kit, app shell, mail client, dashboard, marketing
drizzle/           SQL migrations
tests/             Vitest unit + end-to-end API tests
```

## License

MIT
