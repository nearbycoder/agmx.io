import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowUpRight, LogOut, Monitor, Moon, Sun } from "lucide-react"
import type { ReactNode } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { KV, origin } from "~/components/dashboard/common"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardBody, CardHeader } from "~/components/ui/card"
import { CopyButton, Meter, Skeleton } from "~/components/ui/misc"
import { authClient } from "~/lib/auth-client"
import { useAgents, useMe } from "~/lib/queries"
import { useTheme } from "~/lib/theme"
import { cn, initials } from "~/lib/utils"
import { formatLimit } from "~/shared/plans"

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings — AGMX" }] }),
  component: SettingsPage
})

function SettingsPage() {
  const { data: me } = useMe()
  const { data: agents } = useAgents()
  const { theme, setTheme } = useTheme()
  const maxInboxes = Math.max(0, ...(agents ?? []).map((a) => a.inboxes.length))

  return (
    <Page className="max-w-4xl">
      <PageHeader title="Settings" description="Your account, plan and preferences." />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            {me ? (
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-full bg-ink text-lg font-semibold text-bg">{initials(me.user.name || me.user.email)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[16px] font-semibold">{me.user.name || "Unnamed"}</span>
                    {me.user.role === "admin" ? <Badge tone="solid">Operator</Badge> : null}
                  </div>
                  <div className="truncate text-[13px] text-muted">{me.user.email}</div>
                  <div className="text-[12px] text-faint">Member since {new Date(me.user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                </div>
              </div>
            ) : (
              <Skeleton className="h-14 w-full" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Plan & usage {me ? <Badge tone="accent">{me.plan.name}</Badge> : null}
              </span>
            }
            description={me?.plan.priceMonthly ? `$${me.plan.priceMonthly}/month` : me?.plan.priceMonthly === 0 ? "Free" : undefined}
            action={
              <Link to="/pricing" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
                Compare plans <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          <CardBody>
            {me ? (
              <>
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <Usage label="Agents" used={me.usage.agents} max={me.plan.maxAgents} />
                  <Usage label="Inboxes per agent (largest)" used={maxInboxes} max={me.plan.inboxesPerAgent} />
                  <Usage label="Sends today" used={me.usage.sentToday} max={me.plan.dailySends} />
                  <Usage label="Sends this month" used={me.usage.sentThisMonth} max={me.plan.monthlySends} />
                  <Usage label="Custom domains" used={me.usage.domains} max={me.plan.customDomains} />
                  <div className="flex flex-col gap-2">
                    <div className="text-[13px] text-muted">Limits</div>
                    <div className="flex flex-wrap gap-2 text-[12.5px]">
                      <span className="rounded-lg border border-line bg-surface-2 px-2 py-1">
                        Retention <b className="font-semibold">{me.plan.retentionDays === null ? "forever" : `${me.plan.retentionDays} days`}</b>
                      </span>
                      <span className="rounded-lg border border-line bg-surface-2 px-2 py-1">
                        Max message <b className="font-semibold">{me.plan.maxMessageMb} MB</b>
                      </span>
                      <span className="rounded-lg border border-line bg-surface-2 px-2 py-1">
                        Receiving <b className="font-semibold">unlimited</b>
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-6 rounded-xl bg-bg-subtle px-4 py-3 text-[12.5px] text-muted">
                  Plans are assigned by the operator of this AGMX server during early access. Contact the operator to change plans. Each recipient counts as one send; daily limits reset at 00:00 UTC.
                </p>
              </>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appearance" description="Choose how AGMX looks on this device." />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                  ["system", "System", Monitor]
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-xl border text-left transition",
                    theme === value ? "border-ink ring-2 ring-ink/10 dark:border-accent dark:ring-accent/20" : "border-line hover:border-line-strong"
                  )}
                  aria-pressed={theme === value}
                >
                  <ThemePreview mode={value} />
                  <span className="flex items-center gap-2 border-t border-line px-3 py-2 text-[13px] font-medium">
                    <Icon className="size-4 text-muted" /> {label}
                  </span>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Connection details" description="Point agents and SDKs at these endpoints." />
          <CardBody className="divide-y divide-line py-1">
            <Endpoint label="REST API" value={`${origin()}/api/v1`} />
            <Endpoint label="MCP server" value={`${origin()}/mcp`} />
            <Endpoint label="OpenAPI spec" value={`${origin()}/api/v1/openapi.json`} />
            <Endpoint label="Agent instructions" value={`${origin()}/skill.md`} />
            <KV label="Shared mail domain">
              <span className="font-mono">{me?.mailDomain ?? "—"}</span>
            </KV>
            <KV label="Outbound sending">{me ? me.sendingEnabled ? <Badge tone="ok">Amazon SES</Badge> : <Badge tone="warn">Dev log transport</Badge> : "—"}</KV>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Session" />
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">Sign out of AGMX on this device. API keys keep working.</p>
            <Button
              variant="secondary"
              onClick={async () => {
                await authClient.signOut()
                window.location.href = "/login"
              }}
            >
              <LogOut /> Sign out
            </Button>
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}

const Usage = ({ label, used, max }: { label: ReactNode; used: number; max: number | null }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums">
        {used.toLocaleString()} <span className="text-faint">/ {formatLimit(max)}</span>
      </span>
    </div>
    {max === null ? <div className="h-1.5 w-full rounded-full border border-dashed border-line" /> : <Meter value={used} max={max} />}
  </div>
)

const Endpoint = ({ label, value }: { label: string; value: string }) => (
  <KV label={label}>
    <span className="flex items-center justify-end gap-1">
      <code className="truncate font-mono text-[12.5px] font-normal">{value}</code>
      <CopyButton value={value} size="xs" label={`${label} copied`} />
    </span>
  </KV>
)

const ThemePreview = ({ mode }: { mode: "light" | "dark" | "system" }) => {
  const pane = (dark: boolean) => (
    <div className={cn("flex h-full flex-1 gap-1.5 p-2.5", dark ? "bg-[#09090a]" : "bg-[#f7f7f3]")}>
      <div className={cn("w-1/4 rounded-md", dark ? "bg-[#17171a]" : "bg-[#efefe9]")} />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className={cn("h-2 w-2/3 rounded", dark ? "bg-[#2f2f33]" : "bg-[#d4d4cc]")} />
        <div className={cn("flex-1 rounded-md border", dark ? "border-[#222225] bg-[#121214]" : "border-[#e6e6df] bg-white")}>
          <div className="m-1.5 h-1.5 w-1/2 rounded bg-[#c8f560]" />
        </div>
      </div>
    </div>
  )
  return <div className="flex h-20">{mode === "system" ? <>{pane(false)}{pane(true)}</> : pane(mode === "dark")}</div>
}
