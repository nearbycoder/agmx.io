/**
 * Plan definitions. These are intentionally plain data so self-hosters can
 * tune limits without touching any business logic. `null` means unlimited.
 */
export interface Plan {
  readonly id: PlanId
  readonly name: string
  readonly tagline: string
  readonly priceMonthly: number | null
  /** Maximum number of agents an account can create. */
  readonly maxAgents: number | null
  /** Maximum number of inbox addresses each agent may own. */
  readonly inboxesPerAgent: number | null
  /** Outbound emails per calendar month (UTC). */
  readonly monthlySends: number | null
  /** Outbound emails per calendar day (UTC). Protects sender reputation. */
  readonly dailySends: number | null
  /** Inbound emails accepted per calendar month (UTC); extra mail is dropped. */
  readonly monthlyReceives: number | null
  /** Largest accepted inbound message. */
  readonly maxInboundMb: number
  /** Custom sending/receiving domains. */
  readonly customDomains: number | null
  /** Days messages are retained before automatic cleanup. */
  readonly retentionDays: number | null
  /** Largest accepted outbound message, including attachments. */
  readonly maxMessageMb: number
  readonly features: ReadonlyArray<string>
  /** Hidden plans are not shown on the public pricing page. */
  readonly hidden?: boolean
  readonly highlight?: boolean
}

export const PLAN_IDS = ["free", "pro", "scale", "unlimited"] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Starter",
    tagline: "For tinkering with your first agent.",
    priceMonthly: 0,
    maxAgents: 2,
    inboxesPerAgent: 1,
    monthlySends: 300,
    dailySends: 50,
    monthlyReceives: 5_000,
    maxInboundMb: 10,
    customDomains: 0,
    retentionDays: 30,
    maxMessageMb: 10,
    features: ["2 agents", "1 inbox per agent", "300 sends / month", "5,000 received / month", "REST API, MCP & webhooks", "30-day retention"]
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For agents that do real work every day.",
    priceMonthly: 19,
    maxAgents: 15,
    inboxesPerAgent: 5,
    monthlySends: 10_000,
    dailySends: 1_000,
    monthlyReceives: 100_000,
    maxInboundMb: 25,
    customDomains: 3,
    retentionDays: 180,
    maxMessageMb: 25,
    highlight: true,
    features: ["15 agents", "5 inboxes per agent", "10,000 sends / month", "100,000 received / month", "3 custom domains", "Signed webhooks with retries", "180-day retention"]
  },
  scale: {
    id: "scale",
    name: "Scale",
    tagline: "For fleets of agents in production.",
    priceMonthly: 99,
    maxAgents: 250,
    inboxesPerAgent: 25,
    monthlySends: 150_000,
    dailySends: 15_000,
    monthlyReceives: 1_000_000,
    maxInboundMb: 40,
    customDomains: 25,
    retentionDays: 365,
    maxMessageMb: 40,
    features: ["250 agents", "25 inboxes per agent", "150,000 sends / month", "1M received / month", "25 custom domains", "REST API, MCP & webhooks", "1-year retention"]
  },
  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    tagline: "Operator plan for self-hosted installs.",
    priceMonthly: null,
    maxAgents: null,
    inboxesPerAgent: null,
    monthlySends: null,
    dailySends: null,
    monthlyReceives: null,
    maxInboundMb: 40,
    customDomains: null,
    retentionDays: null,
    maxMessageMb: 40,
    hidden: true,
    features: ["Everything, without limits"]
  }
}

export const getPlan = (id: string | null | undefined): Plan =>
  PLANS[(PLAN_IDS as ReadonlyArray<string>).includes(id ?? "") ? (id as PlanId) : "free"]

export const formatLimit = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString("en-US"))
