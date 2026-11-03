/**
 * The agent-facing guide served at /skill.md. Written for an LLM agent to read
 * top-to-bottom and act on. Keep field names exactly in sync with the API.
 */
export const agentGuide = (origin: string, mailDomain = "agmx.io") => `---
name: agmx
description: Get a real email inbox (you@${mailDomain}) for yourself, receive verification codes and magic links, and send or reply to email — over REST or MCP.
---

# AGMX — email inboxes for AI agents

AGMX gives you (an AI agent) a real email address such as \`scout@${mailDomain}\`.
You can receive mail (verification codes and magic links are extracted for you),
send mail, reply in-thread and forward — through a REST API or an MCP server.

- API base URL: \`${origin}/api/v1\`
- MCP server (Streamable HTTP): \`${origin}/mcp\`
- OpenAPI spec: \`${origin}/api/v1/openapi.json\`
- Human docs: \`${origin}/docs\`

All authenticated requests send \`Authorization: Bearer <apiKey>\`. API keys start with \`agmx_\`.

## 1. Get credentials

If your human already gave you an AGMX API key (starts with \`agmx_\`), skip to step 2.

Otherwise sign yourself up. No credentials are needed to start; a human must approve you.

\`\`\`http
POST ${origin}/api/v1/signup
Content-Type: application/json

{
  "name": "Scout",
  "username": "scout",
  "description": "Researches vendors and signs up for trials",
  "ownerEmail": "your-human@example.com"
}
\`\`\`

- \`name\` (required): your display name.
- \`username\` (optional): preferred inbox local part → \`scout@${mailDomain}\`. Lowercase letters, numbers, \`.\`, \`_\`, \`-\`, at least 3 characters.
- \`ownerEmail\` (optional, recommended): the email of the human who will approve you. The request then shows up in their dashboard.
- \`description\` (optional): what you'll use the inbox for.

Response:

\`\`\`json
{
  "signupId": "sgn_…",
  "userCode": "KQ7M-3XPA",
  "pollToken": "agmx_poll_…",
  "approvalUrl": "${origin}/claim/KQ7M-3XPA",
  "pollUrl": "${origin}/api/v1/signup/sgn_…?token=agmx_poll_…",
  "pollIntervalSeconds": 5,
  "expiresAt": "2026-01-01T00:30:00.000Z",
  "instructions": "Ask your human to open …"
}
\`\`\`

Now:

1. **Tell your human** to open \`approvalUrl\` and approve the code \`userCode\`. Show them both verbatim.
2. **Poll** \`GET pollUrl\` every \`pollIntervalSeconds\` (5s). Statuses:
   - \`pending\` — keep polling.
   - \`approved\` — the response contains \`apiKey\`, \`agent\` and \`inbox\`. **The key is returned exactly once.** Store it securely (secret store / env var), never print it in logs or chat.
   - \`completed\` — the key was already handed out on a previous poll.
   - \`denied\` or \`expired\` — stop. Requests expire after 30 minutes; start over if needed.

## 2. Check who you are

\`\`\`http
GET ${origin}/api/v1/me
Authorization: Bearer agmx_…
\`\`\`

Returns your plan limits (\`plan.monthlySends\`, \`plan.dailySends\`, \`plan.monthlyReceives\`, \`plan.maxInboundMb\`, \`plan.inboxesPerAgent\`, …), current usage and \`auth.agentId\`. Incoming mail over \`monthlyReceives\` or larger than \`maxInboundMb\` is dropped (counted in \`usage.droppedThisMonth\`).

\`\`\`http
GET ${origin}/api/v1/inboxes
\`\`\`

Lists your inboxes: \`id\`, \`address\`, \`unreadCount\`. If you have none, create one:

\`\`\`http
POST ${origin}/api/v1/inboxes
{ "username": "scout", "displayName": "Scout" }
\`\`\`

Omit \`username\` for a random address like \`swift-otter-4821@${mailDomain}\`.

## 3. Recipes

### Receive a verification code or magic link

1. Note the current time (ISO-8601), e.g. \`2026-01-01T12:00:00Z\`.
2. Trigger the email (submit the sign-up form with your AGMX address).
3. Long-poll for it:

\`\`\`http
GET ${origin}/api/v1/messages/wait?timeout=60&since=2026-01-01T12:00:00Z&from=github.com
\`\`\`

- \`timeout\`: seconds to wait, 1–60 (default 30). Returns as soon as a matching email arrives.
- \`since\`: only messages after this time (defaults to now). \`from\` / \`subject\`: optional substring filters. \`inboxId\`: restrict to one inbox.

Response: \`{ "message": { … } | null, "timedOut": boolean }\`. Read:

- \`message.extracted.codes[0]\` — the most likely one-time code (e.g. \`"482913"\`).
- \`message.extracted.links\` — links with a \`kind\`: \`verify\`, \`login\`, \`reset\`, \`unsubscribe\` or \`other\` (best first).
- \`message.text\` / \`message.html\` — the full body if you need it.

If \`timedOut\` is true, call it again (up to a few minutes total) before giving up.

### Check your inbox

\`\`\`http
GET ${origin}/api/v1/messages?folder=inbox&unread=true&limit=20
\`\`\`

Returns \`{ messages: [...], nextCursor }\` — summaries newest first. Pass \`cursor=<nextCursor>\` for the next page. \`q=\` searches subject, body and addresses. Then read one in full:

\`\`\`http
GET ${origin}/api/v1/messages/{messageId}?markRead=true
\`\`\`

### Send an email

\`\`\`http
POST ${origin}/api/v1/messages
{
  "to": "alice@example.com",
  "subject": "Quick question",
  "text": "Hi Alice, …"
}
\`\`\`

- \`from\`: inbox id or address. Optional if you own exactly one inbox.
- \`to\`, \`cc\`, \`bcc\`: a string or an array; \`"Name <addr>"\` is accepted.
- \`text\` and/or \`html\`. \`attachments\`: \`[{ "filename": "a.pdf", "contentType": "application/pdf", "content": "<base64>" }]\`.
- **Every recipient counts as one send** against your plan quota.

### Reply (stays in the same thread)

\`\`\`http
POST ${origin}/api/v1/messages/{messageId}/reply
{ "text": "Thanks — confirmed.", "replyAll": false }
\`\`\`

Forward: \`POST /api/v1/messages/{messageId}/forward\` with \`{ "to": "...", "text": "FYI" }\`.
Whole conversation: \`GET /api/v1/threads/{threadId}\`.

### Organise

\`PATCH /api/v1/messages/{messageId}\` with any of \`isRead\`, \`isStarred\`, \`isArchived\`, \`isSpam\`, \`labels\`.

Plus-addressing works: mail to \`scout+github@${mailDomain}\` lands in \`scout@${mailDomain}\` with the label \`github\`. Use a unique tag per service to sort mail.

## 4. MCP (alternative to REST)

Connect any MCP client to \`${origin}/mcp\` with header \`Authorization: Bearer agmx_…\`.

Tools: \`whoami\`, \`list_inboxes\`, \`create_inbox\`, \`list_messages\`, \`get_message\`, \`wait_for_email\`, \`send_email\`, \`reply_to_email\`, \`forward_email\`, \`update_message\`, \`delete_message\`, \`list_threads\`, \`get_thread\`.

\`\`\`json
{
  "mcpServers": {
    "agmx": {
      "type": "http",
      "url": "${origin}/mcp",
      "headers": { "Authorization": "Bearer agmx_…" }
    }
  }
}
\`\`\`

## 5. Errors

Every error is JSON with a stable \`_tag\` and a human \`message\`:

| Status | \`_tag\` | What to do |
| --- | --- | --- |
| 401 | \`Unauthorized\` | Missing or revoked key. Re-check the \`Authorization\` header. |
| 403 | \`Forbidden\` | Agent keys can't manage agents, keys or domains, and paused inboxes can't send. |
| 404 | \`NotFound\` | Wrong id, or it belongs to another agent. |
| 409 | \`Conflict\` | Username already taken — pick another. |
| 422 | \`InvalidRequest\` | Fix the field named in \`field\`. |
| 402 | \`QuotaExceeded\` | Plan limit hit. \`limit\` is one of \`monthly_sends\`, \`daily_sends\`, \`agents\`, \`inboxes_per_agent\`, \`custom_domains\`, \`message_size\`; \`max\` and \`used\` give numbers. Tell your human; don't retry in a loop. |
| 502 | \`DeliveryFailed\` | The mail provider rejected the send. Retry later or tell your human. |

## 6. Etiquette

- Only email people who expect it. Hard bounces and spam complaints permanently suppress an address.
- Never paste your API key into emails, chats or logs.
- Prefer \`wait\` over tight polling loops.
`

export const llmsTxt = (origin: string) => `# AGMX

> Real email inboxes for AI agents. An agent can sign itself up (a human approves), receive mail with verification codes and links extracted, and send, reply and forward — via REST, MCP or webhooks. Open source, built on Amazon SES.

## Start here

- [Agent skill guide](${origin}/skill.md): step-by-step instructions written for agents — sign-up flow, recipes, errors.
- [Documentation](${origin}/docs): full human-readable docs.

## API

- [OpenAPI 3.1 spec](${origin}/api/v1/openapi.json): machine-readable description of every endpoint.
- [Interactive API reference](${origin}/api/v1/reference)
- [MCP server](${origin}/mcp): Streamable HTTP endpoint; authenticate with \`Authorization: Bearer agmx_…\`.

## Optional

- [Pricing](${origin}/pricing): plan limits for agents, inboxes and sends.
- [Source code](https://github.com/nearbycoder/agmx.io)
`
