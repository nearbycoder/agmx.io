import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, CheckCircle2, Circle, Server, ShieldAlert, Users } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { KV, NativeSelect, toastFailure } from "~/components/dashboard/common"
import { Badge, StatusDot } from "~/components/ui/badge"
import { Card, CardBody, CardHeader } from "~/components/ui/card"
import { CopyButton, EmptyState, Meter, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk, useMe } from "~/lib/queries"
import { cn, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/admin")({
  head: () => ({ meta: [{ title: "Operator — AGMX" }] }),
  component: AdminPage
})

function AdminPage() {
  const { data: me, isLoading } = useMe()
  if (isLoading) return <Page><Skeleton className="h-64 rounded-2xl" /></Page>
  if (me?.user.role !== "admin") {
    return (
      <Page>
        <EmptyState icon={<ShieldAlert />} title="Operators only" description="This area is for the people who run this AGMX server. Ask them if you need something changed." />
      </Page>
    )
  }
  return (
    <Page>
      <PageHeader title="Operator" description="Server health, Amazon SES setup and account management." />
      <div className="flex flex-col gap-6">
        <SystemCard />
        <UsersCard />
      </div>
    </Page>
  )
}

function SystemCard() {
  const { data: sys, isLoading } = useQuery({ queryKey: qk.system, queryFn: () => api((c) => c.admin.system()) })
  if (isLoading || !sys) return <Skeleton className="h-80 rounded-2xl" />
  const ses = sys.sesAccount
  const region = sys.awsRegion
  const steps: Array<{ done: boolean | null; title: string; body: ReactNode; copy?: string }> = [
    {
      done: sys.sesConfigured,
      title: "Configure AWS credentials",
      body: (
        <>
          Set <Code>AWS_ACCESS_KEY_ID</Code>, <Code>AWS_SECRET_ACCESS_KEY</Code> and <Code>AWS_REGION</Code> (currently <Code>{region}</Code>), then restart. Without them mail is only logged.
        </>
      )
    },
    {
      done: ses ? ses.sendingEnabled : null,
      title: `Verify ${sys.mailDomain} in SES`,
      body: <>In the SES console → Identities, add the domain and publish its DKIM CNAMEs. Sending is {ses?.sendingEnabled ? "enabled" : "not confirmed"}.</>
    },
    {
      done: null,
      title: "Point MX at SES inbound",
      body: (
        <>
          <Code>{sys.mailDomain}</Code> MX 10 <Code>{`inbound-smtp.${region}.amazonaws.com`}</Code>
        </>
      ),
      copy: `inbound-smtp.${region}.amazonaws.com`
    },
    {
      done: null,
      title: "Receipt rule → SNS → AGMX",
      body: <>Create an active receipt rule for the domain with an SNS action (Base64 encoding) or S3 + SNS action, and subscribe this HTTPS endpoint to the topic. Subscriptions are confirmed automatically.</>,
      copy: sys.inboundWebhookUrl
    },
    {
      done: null,
      title: "Delivery feedback",
      body: (
        <>
          Create a configuration set with an SNS event destination for Bounce, Complaint and Delivery events pointing at the same endpoint, then set <Code>SES_CONFIGURATION_SET</Code>.
        </>
      )
    },
    {
      done: ses ? ses.productionAccess : null,
      title: "Request production access",
      body: <>New SES accounts are sandboxed and can only send to verified addresses. {ses ? (ses.productionAccess ? "Production access is enabled." : "This account is still in the sandbox.") : ""}</>
    }
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Server className="size-4 text-muted" /> System
            </span>
          }
        />
        <CardBody className="divide-y divide-line py-1">
          <KV label="Mail transport">
            {sys.mailTransport === "ses" ? (
              <Badge tone="ok">
                <StatusDot tone="ok" /> Amazon SES
              </Badge>
            ) : (
              <Badge tone="warn">
                <StatusDot tone="warn" /> Console log (dev)
              </Badge>
            )}
          </KV>
          <KV label="Shared domain">
            <span className="font-mono">{sys.mailDomain}</span>
          </KV>
          <KV label="AWS region">
            <span className="font-mono">{sys.awsRegion}</span>
          </KV>
          <KV label="Production access">{ses ? ses.productionAccess ? <Badge tone="ok">Yes</Badge> : <Badge tone="warn">Sandbox</Badge> : <span className="text-faint">—</span>}</KV>
          {ses ? (
            <div className="py-3">
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="text-muted">SES 24h quota</span>
                <span className="font-medium tabular-nums">
                  {ses.sentLast24Hours.toLocaleString()} / {ses.max24HourSend.toLocaleString()} · {ses.maxSendRate}/s
                </span>
              </div>
              <Meter value={ses.sentLast24Hours} max={ses.max24HourSend} />
            </div>
          ) : null}
          <KV label="Inbound webhook">
            <span className="flex items-center justify-end gap-1">
              <code className="truncate font-mono text-[12px] font-normal">{sys.inboundWebhookUrl}</code>
              <CopyButton value={sys.inboundWebhookUrl} size="xs" label="Webhook URL copied" />
            </span>
          </KV>
          <div className="py-3">
            <div className="mb-2 text-[13px] text-muted">Allowed sign-in emails</div>
            <div className="flex flex-wrap gap-1.5">
              {sys.allowedEmails.map((e) => (
                <span key={e} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[12px]">
                  {e}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              Change with the <Code>ALLOWED_EMAILS</Code> environment variable.
            </p>
          </div>
          {sys.sesError ? (
            <div className="my-3 flex gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {sys.sesError}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Amazon SES setup" description="Everything needed for real sending and receiving." />
        <ol className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3.5 px-5 py-3.5">
              <span className="mt-0.5">
                {s.done === true ? (
                  <CheckCircle2 className="size-5 text-ok" />
                ) : s.done === false ? (
                  <Circle className="size-5 text-warn" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full border border-line-strong text-[11px] font-semibold text-muted">{i + 1}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{s.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.body}</div>
                {s.copy ? (
                  <div className="mt-2 flex items-center gap-1 rounded-lg border border-line bg-surface-2 py-0.5 pr-0.5 pl-2.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{s.copy}</code>
                    <CopyButton value={s.copy} size="xs" />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function UsersCard() {
  const queryClient = useQueryClient()
  const { data: users, isLoading } = useQuery({ queryKey: qk.adminUsers, queryFn: () => api((c) => c.admin.users()) })
  const update = useMutation({
    mutationFn: (input: { userId: string; plan?: "free" | "pro" | "scale" | "unlimited"; role?: "user" | "admin" }) =>
      api((c) => c.admin.updateUser({ params: { userId: input.userId }, payload: { plan: input.plan, role: input.role } })),
    onSuccess: (u) => {
      void queryClient.invalidateQueries({ queryKey: qk.adminUsers })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      toast.success(`Updated ${u.email}`)
    },
    onError: (e) => toastFailure(e)
  })
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted" /> Accounts
          </span>
        }
        description={users ? `${users.length} account${users.length === 1 ? "" : "s"}` : undefined}
      />
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-faint uppercase">
                <th className="px-5 py-2.5 font-medium">Account</th>
                <th className="px-3 py-2.5 font-medium">Agents</th>
                <th className="px-3 py-2.5 font-medium">Inboxes</th>
                <th className="px-3 py-2.5 font-medium">Sent (month)</th>
                <th className="px-3 py-2.5 font-medium">Plan</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-5 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users?.map((u) => (
                <tr key={u.id} className={cn("transition hover:bg-surface-2", update.isPending && update.variables?.userId === u.id && "opacity-60")}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{u.name || "—"}</div>
                    <div className="text-[12px] text-muted">{u.email}</div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{u.agents}</td>
                  <td className="px-3 py-3 tabular-nums">{u.inboxes}</td>
                  <td className="px-3 py-3 tabular-nums">{u.sentThisMonth.toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <NativeSelect
                      aria-label={`Plan for ${u.email}`}
                      className="h-8 w-32 text-[13px]"
                      value={u.plan}
                      onChange={(plan) => update.mutate({ userId: u.id, plan: plan as "free" | "pro" | "scale" | "unlimited" })}
                    >
                      <option value="free">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="scale">Scale</option>
                      <option value="unlimited">Unlimited</option>
                    </NativeSelect>
                  </td>
                  <td className="px-3 py-3">
                    <NativeSelect
                      aria-label={`Role for ${u.email}`}
                      className="h-8 w-28 text-[13px]"
                      value={u.role}
                      onChange={(role) => update.mutate({ userId: u.id, role: role as "user" | "admin" })}
                    >
                      <option value="user">User</option>
                      <option value="admin">Operator</option>
                    </NativeSelect>
                  </td>
                  <td className="px-5 py-3 text-muted">{relativeTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-bg-subtle px-1 py-px font-mono text-[11.5px] text-ink-2">{children}</code>
