import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowUpRight, LogOut, Monitor, Moon, Sun } from "lucide-react"
import type { ReactNode } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { CopyField, KV, origin } from "~/components/dashboard/common"
import { Panel, Section } from "~/components/dashboard/section"
import { Button } from "~/components/ui/button"
import { Meter, Skeleton } from "~/components/ui/misc"
import { authClient } from "~/lib/auth-client"
import { useAgents, useMe } from "~/lib/queries"
import { useTheme } from "~/lib/theme"
import { cn, initials } from "~/lib/utils"

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
    <Page>
      <PageHeader title="Settings" description="Your account, plan and preferences." />
      <div className="flex max-w-3xl flex-col gap-10">
        <Section title="Profile">
          <Panel className="flex items-center gap-4 p-5">
            {me ? (
              <>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-bg">{initials(me.user.name || me.user.email)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{me.user.name || "Unnamed"}</span>
                    {me.user.role === "admin" ? <span className="rounded-md border border-line px-1.5 py-px text-[11px] font-medium text-muted">Operator</span> : null}
                  </div>
                  <div className="truncate text-[13px] text-muted">{me.user.email}</div>
                </div>
                <span className="hidden text-[12px] text-muted sm:block">
                  Member since {new Date(me.user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
              </>
            ) : (
              <Skeleton className="h-11 w-full" />
            )}
          </Panel>
        </Section>

        <Section
          title="Plan and usage"
          description={me ? `${me.plan.name}${me.plan.priceMonthly ? ` · $${me.plan.priceMonthly} per month` : me.plan.priceMonthly === 0 ? " · Free" : ""}` : undefined}
          action={
            <Link to="/pricing" className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink">
              Compare plans <ArrowUpRight className="size-3.5" />
            </Link>
          }
        >
          {me ? (
            <>
              <Panel divided>
                <Usage label="Agents" used={me.usage.agents} max={me.plan.maxAgents} />
                <Usage label="Inboxes per agent" hint="Largest agent" used={maxInboxes} max={me.plan.inboxesPerAgent} />
                <Usage label="Sends today" hint="Resets at 00:00 UTC" used={me.usage.sentToday} max={me.plan.dailySends} />
                <Usage label="Sends this month" used={me.usage.sentThisMonth} max={me.plan.monthlySends} />
                <Usage
                  label="Received this month"
                  hint={me.usage.droppedThisMonth > 0 ? `${me.usage.droppedThisMonth.toLocaleString()} dropped over limit` : undefined}
                  hintTone={me.usage.droppedThisMonth > 0 ? "warn" : undefined}
                  used={me.usage.receivedThisMonth}
                  max={me.plan.monthlyReceives}
                />
                <Usage label="Custom domains" used={me.usage.domains} max={me.plan.customDomains} />
                <KV label="Message retention">{me.plan.retentionDays === null ? "Indefinite" : `${me.plan.retentionDays} days`}</KV>
                <KV label="Largest message">
                  <span className="tabular-nums">
                    {me.plan.maxMessageMb} MB sent · {me.plan.maxInboundMb} MB received
                  </span>
                </KV>
              </Panel>
              <p className="text-[12.5px] text-muted">Plans are assigned by the operator of this server during early access. Each recipient of a message counts as one send.</p>
            </>
          ) : (
            <Skeleton className="h-80 w-full rounded-xl" />
          )}
        </Section>

        <Section title="Appearance" description="Applies to this device only.">
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
                  "flex flex-col overflow-hidden rounded-xl border text-left transition-colors",
                  theme === value ? "border-ink ring-1 ring-ink dark:border-ink-2 dark:ring-ink-2" : "border-line hover:border-line-strong"
                )}
                aria-pressed={theme === value}
              >
                <ThemePreview mode={value} />
                <span className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2 text-[13px] font-medium">
                  <Icon className="size-4 text-muted" /> {label}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Endpoints" description="Point agents and SDKs at these URLs.">
          <Panel divided>
            <Endpoint label="REST API" value={`${origin()}/api/v1`} />
            <Endpoint label="MCP server" value={`${origin()}/mcp`} />
            <Endpoint label="OpenAPI spec" value={`${origin()}/api/v1/openapi.json`} />
            <Endpoint label="Agent instructions" value={`${origin()}/skill.md`} />
            <KV label="Shared mail domain">
              <code className="font-mono text-[12.5px]">{me?.mailDomain ?? "…"}</code>
            </KV>
            <KV label="Outbound sending">
              {me ? (
                <span className="inline-flex items-center gap-1.5 text-[13px]">
                  <span className={cn("size-1.5 rounded-full", me.sendingEnabled ? "bg-ok" : "bg-warn")} />
                  {me.sendingEnabled ? "Amazon SES" : "Development log (not sent)"}
                </span>
              ) : (
                "…"
              )}
            </KV>
          </Panel>
        </Section>

        <Section title="Session">
          <Panel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
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
          </Panel>
        </Section>
      </div>
    </Page>
  )
}

const Usage = ({ label, hint, hintTone, used, max }: { label: ReactNode; hint?: string; hintTone?: "warn"; used: number; max: number | null }) => (
  <div className="flex min-h-12 items-center gap-4 px-5 py-3 text-[13.5px]">
    <div className="min-w-0 flex-1">
      <div className="text-muted">{label}</div>
      {hint ? <div className={cn("text-[12px]", hintTone === "warn" ? "text-warn" : "text-faint")}>{hint}</div> : null}
    </div>
    {max !== null ? <Meter value={used} max={max} className="hidden w-28 sm:block" /> : null}
    <span className="w-36 shrink-0 text-right tabular-nums">
      {used.toLocaleString()} <span className="text-muted">{max === null ? "· no limit" : `of ${max.toLocaleString()}`}</span>
    </span>
  </div>
)

const Endpoint = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <span className="shrink-0 text-[13.5px] text-muted">{label}</span>
    <CopyField value={value} label={label} className="w-full sm:max-w-sm" />
  </div>
)

const ThemePreview = ({ mode }: { mode: "light" | "dark" | "system" }) => {
  const pane = (dark: boolean) => (
    <div className={cn("flex h-full flex-1 gap-1.5 p-2.5", dark ? "bg-[#09090a]" : "bg-[#f7f7f3]")}>
      <div className={cn("w-1/4 rounded-md", dark ? "bg-[#17171a]" : "bg-[#efefe9]")} />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className={cn("h-2 w-2/3 rounded", dark ? "bg-[#2f2f33]" : "bg-[#d4d4cc]")} />
        <div className={cn("flex-1 rounded-md border", dark ? "border-[#222225] bg-[#121214]" : "border-[#e6e6df] bg-white")}>
          <div className={cn("m-1.5 h-1.5 w-1/2 rounded", dark ? "bg-[#2f2f33]" : "bg-[#e6e6df]")} />
        </div>
      </div>
    </div>
  )
  return <div className="flex h-20">{mode === "system" ? <>{pane(false)}{pane(true)}</> : pane(mode === "dark")}</div>
}
