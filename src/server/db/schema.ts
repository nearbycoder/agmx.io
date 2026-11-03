import { sql } from "drizzle-orm"
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core"

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea"
})

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export interface Address {
  name?: string | null
  address: string
}

export interface ExtractedEvent {
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  organizer: string | null
  url: string | null
  method: string | null
  uid: string | null
}

export interface ExtractedReceipt {
  merchant: string | null
  total: number | null
  currency: string | null
  orderNumber: string | null
}

export interface ExtractedTracking {
  carrier: "ups" | "fedex" | "usps" | "dhl" | "other"
  number: string
  url: string | null
}

export interface Extracted {
  codes: Array<string>
  links: Array<{ url: string; text?: string | null; kind: "verify" | "login" | "reset" | "unsubscribe" | "tracking" | "other" }>
  events?: Array<ExtractedEvent>
  receipt?: ExtractedReceipt | null
  tracking?: Array<ExtractedTracking>
}

export interface Security {
  risk: "low" | "medium" | "high"
  score: number
  reasons: Array<string>
  hiddenContent: boolean
  /**
   * Whether the From address is authentic: `verified` (DMARC pass, or sent from another AGMX inbox),
   * `failed` (DMARC fail, or both SPF and DKIM fail: likely forged) or `unknown` (no policy / no verdicts).
   * Missing on messages stored before sender checks existed.
   */
  sender?: "verified" | "failed" | "unknown"
}

export interface Verdicts {
  spam?: string | null
  virus?: string | null
  spf?: string | null
  dkim?: string | null
  dmarc?: string | null
}

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  plan: text("plan").notNull().default("free"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("session_user_idx").on(t.userId)]
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("account_user_idx").on(t.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
)

// ---------------------------------------------------------------------------
// AGMX domain tables
// ---------------------------------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("lime"),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret").notNull(),
    status: text("status").notNull().default("active"),
    /** When an agent key sends: `auto`, `first_contact` (new recipients need approval) or `all`. */
    sendPolicy: text("send_policy").$type<"auto" | "first_contact" | "all">().notNull().default("auto"),
    /** Hold any agent-sent message with attachments for approval. */
    approveAttachments: boolean("approve_attachments").notNull().default(false),
    /** Set when sending is paused (automatically for high bounce/complaint rates, or by a human). Receiving continues. */
    sendingPausedAt: timestamp("sending_paused_at", { withTimezone: true }),
    sendingPausedReason: text("sending_paused_reason"),
    /** Reputation is measured from here, so a resumed agent starts with a clean window. */
    reputationSince: timestamp("reputation_since", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("agents_user_idx").on(t.userId)]
)

export const domains = pgTable(
  "domains",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().unique(),
    status: text("status").notNull().default("pending"),
    dkimTokens: jsonb("dkim_tokens").$type<Array<string>>().notNull().default([]),
    dkimStatus: text("dkim_status").notNull().default("PENDING"),
    mxVerified: boolean("mx_verified").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("domains_user_idx").on(t.userId)]
)

export const inboxes = pgTable(
  "inboxes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    domainId: text("domain_id").references(() => domains.id, { onDelete: "cascade" }),
    localPart: text("local_part").notNull(),
    domain: text("domain").notNull(),
    address: text("address").notNull().unique(),
    displayName: text("display_name"),
    status: text("status").notNull().default("active"),
    /** Temporary inboxes are deleted (with their mail) at this time. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Stop accepting mail after this many inbound messages. */
    maxMessages: integer("max_messages"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("inboxes_agent_idx").on(t.agentId), index("inboxes_user_idx").on(t.userId)]
)

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inboxId: text("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    participants: jsonb("participants").$type<Array<Address>>().notNull().default([]),
    messageCount: integer("message_count").notNull().default(0),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt()
  },
  (t) => [index("threads_inbox_last_idx").on(t.inboxId, t.lastMessageAt)]
)

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inboxId: text("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"inbound" | "outbound">().notNull(),
    status: text("status").notNull(),
    rfcMessageId: text("rfc_message_id"),
    /** Our own Message-ID when the provider (SES) rewrites it on the way out. */
    altMessageId: text("alt_message_id"),
    inReplyTo: text("in_reply_to"),
    references: jsonb("references").$type<Array<string>>().notNull().default([]),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    to: jsonb("to").$type<Array<Address>>().notNull().default([]),
    cc: jsonb("cc").$type<Array<Address>>().notNull().default([]),
    bcc: jsonb("bcc").$type<Array<Address>>().notNull().default([]),
    replyTo: jsonb("reply_to").$type<Array<Address>>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    text: text("text"),
    html: text("html"),
    snippet: text("snippet").notNull().default(""),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    extracted: jsonb("extracted").$type<Extracted>().notNull().default({ codes: [], links: [] }),
    /** Prompt-injection / hidden-content analysis of inbound mail. */
    security: jsonb("security").$type<Security>(),
    /** Visible text only: hidden HTML and invisible characters removed. What agents should read. */
    safeText: text("safe_text"),
    idempotencyKey: text("idempotency_key"),
    sendAt: timestamp("send_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    verdicts: jsonb("verdicts").$type<Verdicts>().notNull().default({}),
    labels: jsonb("labels").$type<Array<string>>().notNull().default([]),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    isSpam: boolean("is_spam").notNull().default(false),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: createdAt()
  },
  (t) => [
    index("messages_inbox_created_idx").on(t.inboxId, t.createdAt),
    index("messages_thread_idx").on(t.threadId, t.createdAt),
    index("messages_user_created_idx").on(t.userId, t.createdAt),
    index("messages_rfc_idx").on(t.rfcMessageId),
    index("messages_alt_idx").on(t.altMessageId),
    index("messages_provider_idx").on(t.providerMessageId),
    uniqueIndex("messages_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("messages_status_send_at_idx").on(t.status, t.sendAt)
  ]
)

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    contentId: text("content_id"),
    inline: boolean("inline").notNull().default(false),
    /** File bytes when stored in Postgres (local/dev). Null when the file lives in object storage. */
    content: bytea("content"),
    /** Object-storage key when ATTACHMENT_STORAGE=s3. */
    storageKey: text("storage_key"),
    /** Text extracted from PDFs and other text-bearing attachments (truncated). */
    extractedText: text("extracted_text"),
    createdAt: createdAt()
  },
  (t) => [index("attachments_message_idx").on(t.messageId)]
)

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("api_keys_user_idx").on(t.userId)]
)

export const usageDaily = pgTable(
  "usage_daily",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    sent: integer("sent").notNull().default(0),
    received: integer("received").notNull().default(0),
    /** Inbound messages dropped for exceeding the plan's receive or size limits. */
    dropped: integer("dropped").notNull().default(0)
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
)

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    url: text("url").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status").$type<"pending" | "success" | "failed">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [
    index("webhook_deliveries_agent_idx").on(t.agentId, t.createdAt),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt)
  ]
)

export const agentSignups = pgTable(
  "agent_signups",
  {
    id: text("id").primaryKey(),
    userCode: text("user_code").notNull().unique(),
    pollTokenHash: text("poll_token_hash").notNull().unique(),
    agentName: text("agent_name").notNull(),
    description: text("description"),
    requestedUsername: text("requested_username"),
    ownerEmail: text("owner_email"),
    status: text("status").$type<"pending" | "approved" | "denied" | "completed">().notNull().default("pending"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    inboxId: text("inbox_id").references(() => inboxes.id, { onDelete: "set null" }),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index("agent_signups_status_idx").on(t.status, t.createdAt)]
)

export const suppressions = pgTable(
  "suppressions",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    reason: text("reason").$type<"bounce" | "complaint" | "manual">().notNull(),
    detail: text("detail"),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("suppressions_address_idx").on(sql`lower(${t.address})`)]
)

/** Object-storage keys whose attachments were deleted; drained by the maintenance worker. Filled by a trigger. */
export const storageDeletions = pgTable("storage_deletions", {
  key: text("key").primaryKey(),
  createdAt: createdAt()
})

/** Per-inbox sender rules, evaluated in order before mail is stored. */
export const inboxRules = pgTable(
  "inbox_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inboxId: text("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    field: text("field").$type<"sender" | "domain" | "subject">().notNull(),
    value: text("value").notNull(),
    action: text("action").$type<"allow" | "block" | "label" | "forward" | "webhook">().notNull(),
    /** Label name, forward address or webhook URL depending on `action`. */
    target: text("target"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt()
  },
  (t) => [index("inbox_rules_inbox_idx").on(t.inboxId, t.position)]
)
