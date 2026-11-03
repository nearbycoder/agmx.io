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

const appUrl = (read("APP_URL") ?? read("BETTER_AUTH_URL") ?? (read("RAILWAY_PUBLIC_DOMAIN") ? `https://${read("RAILWAY_PUBLIC_DOMAIN")}` : "http://localhost:3100")).replace(/\/$/, "")
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
    /** Optional allow-list of SNS topic ARNs accepted by the inbound webhook. */
    inboundTopicArns: list("SES_INBOUND_TOPIC_ARNS").map((arn) => arn),
    /** Rule set + rule used when a custom domain is added, so SES accepts mail for it. */
    receiptRuleSet: read("SES_RECEIPT_RULE_SET"),
    receiptRule: read("SES_RECEIPT_RULE")
  },
  /** `ses` sends real mail. `log` prints mail to the console (local development). */
  mailTransport: (read("MAIL_TRANSPORT") ?? (hasAwsCredentials ? "ses" : "log")) as "ses" | "log",
  systemFrom: read("SYSTEM_FROM") ?? `AGMX <no-reply@${mailDomain}>`,
  /** Allows `POST /api/dev/inbound` to inject raw MIME for testing. */
  devInbound: read("ENABLE_DEV_INBOUND") === "true" || read("NODE_ENV") !== "production",
  /** Public agent self-signup (device flow). The human still approves every request. */
  agentSignups: read("ENABLE_AGENT_SIGNUPS") !== "false"
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
