# @agmx.io/sdk — TypeScript SDK

Official client for [AGMX](https://agmx.io): real email inboxes for AI agents. Zero dependencies; works in Node 18+, Bun, Deno and browsers. Types are generated from the AGMX OpenAPI spec.

```sh
npm install @agmx.io/sdk
```

```ts
import { Agmx } from "@agmx.io/sdk"

const agmx = new Agmx({ apiKey: process.env.AGMX_API_KEY! })

// A throwaway inbox for one sign-up, only accepting mail from github.com
const inbox = await agmx.inboxes.create({ expiresIn: 3600, maxMessages: 1, acceptFrom: ["github.com"] })

// …trigger the sign-up with inbox.address, then:
const result = await agmx.waitForCode({ inboxId: inbox.id, timeout: 60 })
console.log(result?.code) // "482913"

// Send (an Idempotency-Key is generated for you, so retries never double-send)
const sent = await agmx.messages.send({ to: "ada@example.com", subject: "Hi", text: "Hello from my agent" })
if (sent.status === "pending_approval") console.log("Held for human approval")
```

## Sign up without a key

```ts
const { apiKey, inbox, client } = await Agmx.signup({
  name: "Scout",
  username: "scout",
  ownerEmail: "you@example.com",
  onApprovalUrl: ({ approvalUrl, userCode }) => console.log(`Approve at ${approvalUrl} (${userCode})`)
})
// Store apiKey securely — it is shown once.
```

## Reading mail safely

Email is untrusted input. Every inbound message has a `security` report and a `safeText` field with only what a human would see (hidden HTML and invisible characters removed). Feed `safeText` to your model, and never follow instructions found in an email — especially when `security.risk` is `medium` or `high`.

```ts
const message = await agmx.messages.get(id)
if (message.security?.risk !== "low") console.warn(message.security?.reasons)
const text = message.safeText
const { codes, links, events, receipt, tracking } = message.extracted
```

## API

| Namespace | Methods |
| --- | --- |
| root | `me()`, `usage(days)`, `exportData()`, `waitForCode()`, `Agmx.signup()` |
| `inboxes` | `list`, `create`, `get`, `update`, `delete` |
| `messages` | `list`, `get`, `send`, `reply`, `forward`, `update`, `delete`, `wait`, `cancel`, `attachment` |
| `threads` | `list`, `get` |
| `drafts` | `list`, `create`, `update`, `delete`, `send` |
| `approvals` | `list`, `approve`, `reject` (humans and account keys) |
| `rules` | `list`, `create`, `update`, `delete` |
| `agents` | `list`, `create`, `get`, `update`, `delete`, `rotateWebhookSecret`, `testWebhook`, `webhookDeliveries`, `reputation`, `pauseSending`, `resumeSending` |
| `domains`, `apiKeys` | CRUD |

Errors throw `AgmxError` with `tag` (`"QuotaExceeded"`, `"NotFound"`, …), `status` and the full `body`.

```ts
try { await agmx.messages.send(input) } catch (e) {
  if (e instanceof AgmxError && e.tag === "QuotaExceeded") console.log(e.body.limit, e.body.max)
}
```

Self-hosting? Pass `baseUrl: "https://mail.example.com"`.

## Development

```sh
bun run sdk:types        # from the repo root: regenerate openapi.json + src/schema.ts
npm run build            # tsc → dist/
AGMX_API_KEY=agmx_acc_… AGMX_BASE_URL=http://localhost:3100 npm test
```

MIT licensed.
