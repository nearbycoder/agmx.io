import { Schema } from "effect"

const Timestamp = Schema.String.annotate({ description: "ISO-8601 timestamp", format: "date-time" })
const NullableTimestamp = Schema.NullOr(Timestamp)

export const AddressSchema = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
  address: Schema.String
})
export type AddressT = typeof AddressSchema.Type

export const AgentColor = Schema.Literals(["lime", "sky", "violet", "amber", "rose", "teal", "slate"])
export type AgentColorT = typeof AgentColor.Type

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const PlanLimits = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  priceMonthly: Schema.NullOr(Schema.Number),
  maxAgents: Schema.NullOr(Schema.Number),
  inboxesPerAgent: Schema.NullOr(Schema.Number),
  monthlySends: Schema.NullOr(Schema.Number),
  dailySends: Schema.NullOr(Schema.Number),
  customDomains: Schema.NullOr(Schema.Number),
  retentionDays: Schema.NullOr(Schema.Number),
  maxMessageMb: Schema.Number
})

export const UsageSummary = Schema.Struct({
  agents: Schema.Number,
  inboxes: Schema.Number,
  domains: Schema.Number,
  sentToday: Schema.Number,
  sentThisMonth: Schema.Number,
  receivedThisMonth: Schema.Number,
  messagesStored: Schema.Number
})

export const Me = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: Schema.String,
    role: Schema.String,
    image: Schema.NullOr(Schema.String),
    createdAt: Timestamp
  }),
  auth: Schema.Struct({
    kind: Schema.Literals(["session", "account_key", "agent_key"]),
    agentId: Schema.NullOr(Schema.String)
  }),
  plan: PlanLimits,
  usage: UsageSummary,
  mailDomain: Schema.String,
  /** Brand domain where only operators can create inboxes (e.g. admin@agmx.io). Null for non-operators. */
  operatorDomain: Schema.NullOr(Schema.String),
  sendingEnabled: Schema.Boolean,
  /** True when development helpers (e.g. simulated inbound mail) are enabled on this server. */
  devTools: Schema.Boolean
})
export type MeT = typeof Me.Type

export const UsagePoint = Schema.Struct({ day: Schema.String, sent: Schema.Number, received: Schema.Number })
export const UsageSeries = Schema.Struct({ days: Schema.Array(UsagePoint) })

// ---------------------------------------------------------------------------
// Agents & inboxes
// ---------------------------------------------------------------------------

export const Inbox = Schema.Struct({
  id: Schema.String,
  agentId: Schema.String,
  address: Schema.String,
  localPart: Schema.String,
  domain: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  status: Schema.String,
  unreadCount: Schema.Number,
  messageCount: Schema.Number,
  lastMessageAt: NullableTimestamp,
  createdAt: Timestamp
})
export type InboxT = typeof Inbox.Type

export const Agent = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  color: Schema.String,
  status: Schema.String,
  webhookUrl: Schema.NullOr(Schema.String),
  inboxes: Schema.Array(Inbox),
  createdAt: Timestamp,
  updatedAt: Timestamp
})
export type AgentT = typeof Agent.Type

export const AgentWithSecret = Schema.Struct({
  ...Agent.fields,
  webhookSecret: Schema.String
})

export const CreateAgentPayload = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  description: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)))),
  color: Schema.optional(AgentColor),
  webhookUrl: Schema.optional(Schema.NullOr(Schema.String)),
  /** Optionally create the first inbox at the same time, e.g. `"research-bot"`. */
  username: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  /** Also mint an agent-scoped API key and return it once. */
  createApiKey: Schema.optional(Schema.Boolean)
})

export const CreateAgentResult = Schema.Struct({
  agent: Agent,
  apiKey: Schema.NullOr(Schema.String)
})

export const UpdateAgentPayload = Schema.Struct({
  name: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))),
  description: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)))),
  color: Schema.optional(AgentColor),
  status: Schema.optional(Schema.Literals(["active", "paused"])),
  webhookUrl: Schema.optional(Schema.NullOr(Schema.String))
})

export const CreateInboxPayload = Schema.Struct({
  /** Required when authenticating with a session or account key. Implied for agent keys. */
  agentId: Schema.optional(Schema.String),
  /** Local part of the address. Random if omitted. */
  username: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.NullOr(Schema.String))
})

export const UpdateInboxPayload = Schema.Struct({
  displayName: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.Literals(["active", "paused"]))
})

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const ExtractedLink = Schema.Struct({
  url: Schema.String,
  text: Schema.optional(Schema.NullOr(Schema.String)),
  kind: Schema.Literals(["verify", "login", "reset", "unsubscribe", "other"])
})

export const Extracted = Schema.Struct({
  codes: Schema.Array(Schema.String),
  links: Schema.Array(ExtractedLink)
})

export const AttachmentMeta = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  contentType: Schema.String,
  size: Schema.Number,
  inline: Schema.Boolean,
  contentId: Schema.NullOr(Schema.String),
  downloadUrl: Schema.String
})

export const MessageSummary = Schema.Struct({
  id: Schema.String,
  inboxId: Schema.String,
  threadId: Schema.String,
  direction: Schema.Literals(["inbound", "outbound"]),
  status: Schema.String,
  from: AddressSchema,
  to: Schema.Array(AddressSchema),
  cc: Schema.Array(AddressSchema),
  subject: Schema.String,
  snippet: Schema.String,
  extracted: Extracted,
  labels: Schema.Array(Schema.String),
  isRead: Schema.Boolean,
  isStarred: Schema.Boolean,
  isArchived: Schema.Boolean,
  isSpam: Schema.Boolean,
  attachmentCount: Schema.Number,
  createdAt: Timestamp
})
export type MessageSummaryT = typeof MessageSummary.Type

export const Message = Schema.Struct({
  ...MessageSummary.fields,
  bcc: Schema.Array(AddressSchema),
  replyTo: Schema.Array(AddressSchema),
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
  headers: Schema.Record(Schema.String, Schema.String),
  rfcMessageId: Schema.NullOr(Schema.String),
  inReplyTo: Schema.NullOr(Schema.String),
  verdicts: Schema.Struct({
    spam: Schema.optional(Schema.NullOr(Schema.String)),
    virus: Schema.optional(Schema.NullOr(Schema.String)),
    spf: Schema.optional(Schema.NullOr(Schema.String)),
    dkim: Schema.optional(Schema.NullOr(Schema.String)),
    dmarc: Schema.optional(Schema.NullOr(Schema.String))
  }),
  error: Schema.NullOr(Schema.String),
  sizeBytes: Schema.Number,
  attachments: Schema.Array(AttachmentMeta)
})
export type MessageT = typeof Message.Type

export const MessagePage = Schema.Struct({
  messages: Schema.Array(MessageSummary),
  nextCursor: Schema.NullOr(Schema.String)
})

export const Recipients = Schema.Union([Schema.String, Schema.Array(Schema.String)]).annotate({
  description: "One address or a list. Accepts `name <addr>` or bare `addr` forms."
})

export const OutgoingAttachment = Schema.Struct({
  filename: Schema.String,
  contentType: Schema.optional(Schema.String),
  /** Base64 encoded file contents. */
  content: Schema.String
})

export const SendMessagePayload = Schema.Struct({
  /** Inbox id or address to send from. Optional when the agent owns a single inbox. */
  from: Schema.optional(Schema.String),
  to: Recipients,
  cc: Schema.optional(Recipients),
  bcc: Schema.optional(Recipients),
  replyTo: Schema.optional(Recipients),
  subject: Schema.String.check(Schema.isMaxLength(998)),
  text: Schema.optional(Schema.String),
  html: Schema.optional(Schema.String),
  attachments: Schema.optional(Schema.Array(OutgoingAttachment)),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  labels: Schema.optional(Schema.Array(Schema.String))
})
export type SendMessagePayloadT = typeof SendMessagePayload.Type

export const ReplyPayload = Schema.Struct({
  text: Schema.optional(Schema.String),
  html: Schema.optional(Schema.String),
  replyAll: Schema.optional(Schema.Boolean),
  attachments: Schema.optional(Schema.Array(OutgoingAttachment))
})

export const ForwardPayload = Schema.Struct({
  to: Recipients,
  text: Schema.optional(Schema.String)
})

export const UpdateMessagePayload = Schema.Struct({
  isRead: Schema.optional(Schema.Boolean),
  isStarred: Schema.optional(Schema.Boolean),
  isArchived: Schema.optional(Schema.Boolean),
  isSpam: Schema.optional(Schema.Boolean),
  labels: Schema.optional(Schema.Array(Schema.String))
})

export const WaitResult = Schema.Struct({
  message: Schema.NullOr(Message),
  timedOut: Schema.Boolean
})

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export const Thread = Schema.Struct({
  id: Schema.String,
  inboxId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  participants: Schema.Array(AddressSchema),
  messageCount: Schema.Number,
  unreadCount: Schema.Number,
  lastMessageAt: Timestamp,
  createdAt: Timestamp
})
export type ThreadT = typeof Thread.Type

export const ThreadWithMessages = Schema.Struct({
  ...Thread.fields,
  messages: Schema.Array(Message)
})

export const ThreadPage = Schema.Struct({
  threads: Schema.Array(Thread),
  nextCursor: Schema.NullOr(Schema.String)
})

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const DnsRecord = Schema.Struct({
  type: Schema.Literals(["MX", "TXT", "CNAME"]),
  name: Schema.String,
  value: Schema.String,
  priority: Schema.optional(Schema.Number),
  purpose: Schema.String,
  status: Schema.Literals(["verified", "pending", "unknown"])
})

export const Domain = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
  dkimStatus: Schema.String,
  mxVerified: Schema.Boolean,
  records: Schema.Array(DnsRecord),
  lastCheckedAt: NullableTimestamp,
  createdAt: Timestamp
})
export type DomainT = typeof Domain.Type

export const CreateDomainPayload = Schema.Struct({ name: Schema.String })

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const ApiKey = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  prefix: Schema.String,
  agentId: Schema.NullOr(Schema.String),
  agentName: Schema.NullOr(Schema.String),
  scope: Schema.Literals(["account", "agent"]),
  lastUsedAt: NullableTimestamp,
  createdAt: Timestamp
})
export type ApiKeyT = typeof ApiKey.Type

export const CreateApiKeyPayload = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  /** Scope the key to a single agent. Omit for a full account key. */
  agentId: Schema.optional(Schema.NullOr(Schema.String))
})

export const CreatedApiKey = Schema.Struct({
  apiKey: ApiKey,
  /** The secret. Shown exactly once. */
  key: Schema.String
})

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const WebhookDelivery = Schema.Struct({
  id: Schema.String,
  event: Schema.String,
  url: Schema.String,
  status: Schema.String,
  attempts: Schema.Number,
  responseStatus: Schema.NullOr(Schema.Number),
  lastError: Schema.NullOr(Schema.String),
  createdAt: Timestamp,
  deliveredAt: NullableTimestamp
})

// ---------------------------------------------------------------------------
// Agent self sign-up (device-style approval flow)
// ---------------------------------------------------------------------------

export const StartSignupPayload = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  /** Preferred inbox username, e.g. `"scout"` → scout@bot.agmx.io. */
  username: Schema.optional(Schema.String),
  /** Email of the human who should approve this agent. Helps them find the request. */
  ownerEmail: Schema.optional(Schema.String)
})

export const StartSignupResult = Schema.Struct({
  signupId: Schema.String,
  userCode: Schema.String,
  pollToken: Schema.String,
  approvalUrl: Schema.String,
  pollUrl: Schema.String,
  pollIntervalSeconds: Schema.Number,
  expiresAt: Timestamp,
  instructions: Schema.String
})

export const SignupStatus = Schema.Struct({
  status: Schema.Literals(["pending", "approved", "denied", "expired", "completed"]),
  /** Returned exactly once, on the first poll after approval. */
  apiKey: Schema.NullOr(Schema.String),
  agent: Schema.NullOr(Agent),
  inbox: Schema.NullOr(Inbox),
  mcpUrl: Schema.String,
  apiBaseUrl: Schema.String
})

export const PendingSignup = Schema.Struct({
  id: Schema.String,
  userCode: Schema.String,
  agentName: Schema.String,
  description: Schema.NullOr(Schema.String),
  requestedUsername: Schema.NullOr(Schema.String),
  ownerEmail: Schema.NullOr(Schema.String),
  status: Schema.String,
  clientIp: Schema.NullOr(Schema.String),
  userAgent: Schema.NullOr(Schema.String),
  expiresAt: Timestamp,
  createdAt: Timestamp
})
export type PendingSignupT = typeof PendingSignup.Type

export const ApproveSignupPayload = Schema.Struct({
  username: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String)
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const AdminUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  role: Schema.String,
  plan: Schema.String,
  agents: Schema.Number,
  inboxes: Schema.Number,
  sentThisMonth: Schema.Number,
  createdAt: Timestamp
})

export const UpdateAdminUserPayload = Schema.Struct({
  plan: Schema.optional(Schema.Literals(["free", "pro", "scale", "unlimited"])),
  role: Schema.optional(Schema.Literals(["user", "admin"]))
})

export const SystemStatus = Schema.Struct({
  mailTransport: Schema.String,
  mailDomain: Schema.String,
  awsRegion: Schema.String,
  sesConfigured: Schema.Boolean,
  inboundWebhookUrl: Schema.String,
  allowedEmails: Schema.Array(Schema.String),
  sesAccount: Schema.NullOr(
    Schema.Struct({
      productionAccess: Schema.Boolean,
      sendingEnabled: Schema.Boolean,
      max24HourSend: Schema.Number,
      sentLast24Hours: Schema.Number,
      maxSendRate: Schema.Number
    })
  ),
  sesError: Schema.NullOr(Schema.String)
})
