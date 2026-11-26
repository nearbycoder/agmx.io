/**
 * Centralised, typed access to environment configuration. Everything an
 * operator needs to configure lives here and is documented in `.env.example`.
 */
const read = (key: string): string | undefined => {
  const value = process.env[key]
  return value === undefined || value.trim() === "" ? undefined : value.trim()
}

const list = (key: string): Array<string> =>
  (read(key) ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

// Sessions are signed with this. A missing secret in production would fall back to a value anyone can read in the source.
if (read("NODE_ENV") === "production" && !read("BETTER_AUTH_SECRET"))
  throw new Error("BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -hex 32` and set it before starting AGMX in production.")

const appUrl = (read("APP_URL") ?? read("BETTER_AUTH_URL") ?? "http://localhost:3100").replace(/\/$/, "")
const mailDomain = (read("MAIL_DOMAIN") ?? "agmx.io").toLowerCase()
/** Optional brand domain (e.g. agmx.io) where only operators may create inboxes such as admin@ or support@. */
const operatorDomain = read("OPERATOR_DOMAIN")?.toLowerCase() ?? null
const hasAwsCredentials = Boolean(read("AWS_ACCESS_KEY_ID") && read("AWS_SECRET_ACCESS_KEY"))

export const env = {
  nodeEnv: read("NODE_ENV") ?? "development",
  isProduction: read("NODE_ENV") === "production",
  appUrl,
  databaseUrl: read("DATABASE_URL") ?? "postgres://postgres@localhost:54329/agmx",
  authSecret: read("BETTER_AUTH_SECRET") ?? "dev-secret-change-me-dev-secret-change-me",
  mailDomain,
  operatorDomain: operatorDomain === mailDomain ? null : operatorDomain,
  /** Emails (or `*@domain.com` patterns) allowed to sign in. Empty = open sign-ups. */
  allowedEmails: list("ALLOWED_EMAILS"),
  /** Emails that become operators: admin role + unlimited plan. */
  adminEmails: list("ADMIN_EMAILS"),
  defaultPlan: read("DEFAULT_PLAN") ?? "free",
  aws: {
    region: read("AWS_REGION") ?? "us-east-1",
    accessKeyId: read("AWS_ACCESS_KEY_ID"),
    secretAccessKey: read("AWS_SECRET_ACCESS_KEY"),
    configurationSet: read("SES_CONFIGURATION_SET"),
    /** SNS topic ARNs the inbound webhook accepts. Required in production: without it anyone's topic could post mail. */
    inboundTopicArns: list("SES_INBOUND_TOPIC_ARNS"),
    /** Rule set + rule used when a custom domain is added, so SES accepts mail for it. */
    receiptRuleSet: read("SES_RECEIPT_RULE_SET"),
    receiptRule: read("SES_RECEIPT_RULE")
  },
  /**
   * Where attachment bytes live. `s3` = any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO);
   * `db` = Postgres (zero-config, fine for development and small installs).
   */
  storage: {
    driver: ((read("ATTACHMENT_STORAGE") ?? (read("STORAGE_BUCKET") ? "s3" : "db")) as "s3" | "db"),
    bucket: read("STORAGE_BUCKET"),
    region: read("STORAGE_REGION") ?? read("AWS_REGION") ?? "us-east-1",
    /** Custom endpoint for R2/MinIO, e.g. https://<account>.r2.cloudflarestorage.com */
    endpoint: read("STORAGE_ENDPOINT"),
    /** Address browsers use for signed download URLs when it differs from STORAGE_ENDPOINT. */
    publicEndpoint: read("STORAGE_PUBLIC_ENDPOINT"),
    /** Bucket-in-path addressing, needed by most self-hosted S3 servers (MinIO, RustFS). */
    forcePathStyle: read("STORAGE_FORCE_PATH_STYLE") === "true",
    accessKeyId: read("STORAGE_ACCESS_KEY_ID") ?? read("AWS_ACCESS_KEY_ID"),
    secretAccessKey: read("STORAGE_SECRET_ACCESS_KEY") ?? read("AWS_SECRET_ACCESS_KEY")
  },
  /** `ses` sends real mail. `log` prints mail to the console (local development). */
  mailTransport: (read("MAIL_TRANSPORT") ?? (hasAwsCredentials ? "ses" : "log")) as "ses" | "log",
  systemFrom: read("SYSTEM_FROM") ?? `AGMX <no-reply@${mailDomain}>`,
  /** Allows `POST /api/dev/inbound` to inject raw MIME for testing. */
  devInbound: read("ENABLE_DEV_INBOUND") === "true" || read("NODE_ENV") !== "production",
  /** Who gets operator alerts (errors, SES failures). Defaults to ADMIN_EMAILS. */
  alertEmails: list("ALERT_EMAILS").length ? list("ALERT_EMAILS") : list("ADMIN_EMAILS"),
  /** Optional Slack/Discord-compatible incoming webhook for operator alerts. */
  alertWebhookUrl: read("ALERT_WEBHOOK_URL"),
  /** Alerts are on in production; set ALERTS=on/off to override. */
  alertsEnabled: read("ALERTS") ? read("ALERTS") === "on" : read("NODE_ENV") === "production",
  /** Public agent self-signup (device flow). The human still approves every request. */
  agentSignups: read("ENABLE_AGENT_SIGNUPS") !== "false",
  /** Who runs this instance, shown in the Terms and Privacy Policy. */
  operatorName: read("OPERATOR_NAME") ?? "AGMX",
  /** Domain for abuse@, postmaster@ and privacy@ (RFC 2142): the operator domain, else the mail domain. */
  contactDomain: (operatorDomain && operatorDomain !== mailDomain ? operatorDomain : mailDomain),
  /**
   * Role mailboxes created automatically for the first operator (RFC 2142). Set to an empty
   * string to disable.
   */
  systemInboxes: (process.env.SYSTEM_INBOXES ?? "abuse,postmaster,privacy")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-z0-9][a-z0-9._-]*$/.test(entry))
} as const

export const isEmailAllowed = (email: string): boolean => {
  const normalized = email.trim().toLowerCase()
  if (env.adminEmails.includes(normalized)) return true
  if (env.allowedEmails.length === 0 || env.allowedEmails.includes("*")) return true
  return env.allowedEmails.some((rule) =>
    rule.startsWith("*@") ? normalized.endsWith(rule.slice(1)) : rule === normalized
  )
}

export const isAdminEmail = (email: string) => env.adminEmails.includes(email.trim().toLowerCase())

/** Whether an address is one of the operator's RFC 2142 role mailboxes (abuse@, postmaster@…). */
export const isSystemAddress = (address: string) => {
  const at = address.lastIndexOf("@")
  return address.slice(at + 1).toLowerCase() === env.contactDomain && env.systemInboxes.includes(address.slice(0, at).toLowerCase())
}
