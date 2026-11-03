import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, CheckCircle2, Circle, ShieldAlert } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { CopyField, KV, NativeSelect, Notice, toastFailure } from "~/components/dashboard/common"
import { Panel, Section } from "~/components/dashboard/section"
import { EmptyState, Meter, Skeleton } from "~/components/ui/misc"
import { Table, TBody, Td, Th, THead, Tr } from "~/components/ui/table"
import { api } from "~/lib/api"
import { qk, useMe } from "~/lib/queries"
import { cn, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/admin")({
  head: () => ({ meta: [{ title: "Operator — AGMX" }] }),
  component: AdminPage
})

function AdminPage() {
  const { data: me, isLoading } = useMe()
  if (isLoading)
    return (
      <Page>
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    )
  if (me?.user.role !== "admin") {
    return (
      <Page>
        <Panel>
          <EmptyState icon={<ShieldAlert />} title="Operators only" description="This area is for the people who run this AGMX server." />
        </Panel>
      </Page>
    )
  }
  return (
    <Page>
      <PageHeader title="Operator" description="Server health, Amazon SES setup and account management." />
      <div className="flex flex-col gap-10">
        <SystemSection />
        <UsersSection />
      </div>
    </Page>
  )
}

function SystemSection() {
  const { data: sys, isLoading } = useQuery({ queryKey: qk.system, queryFn: () => api((c) => c.admin.system()) })
  if (isLoading || !sys) return <Skeleton className="h-80 rounded-xl" />
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
      body: <>In SES, add the domain under Identities and publish its DKIM records. Sending is {ses?.sendingEnabled ? "enabled" : "not confirmed yet"}.</>
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
      body: <>Create an active receipt rule for the domain with an S3 + SNS action (or an SNS action with Base64 encoding), then subscribe this endpoint to the topic. Subscriptions confirm automatically.</>,
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
      body: <>New SES accounts can only send to verified addresses. {ses ? (ses.productionAccess ? "Production access is enabled." : "This account is still in the sandbox.") : ""}</>
    }
  ]

  const dot = (ok: boolean | null) => <span className={cn("size-1.5 rounded-full", ok === null ? "bg-faint" : ok ? "bg-ok" : "bg-warn")} />
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Section title="System" description="How this server is configured.">
        <Panel divided>
          <KV label="Mail transport">
            <span className="inline-flex items-center gap-1.5">
              {dot(sys.mailTransport === "ses")}
              {sys.mailTransport === "ses" ? "Amazon SES" : "Console log (development)"}
            </span>
          </KV>
          <KV label="Shared domain">
            <code className="font-mono text-[12.5px]">{sys.mailDomain}</code>
          </KV>
          <KV label="AWS region">
            <code className="font-mono text-[12.5px]">{sys.awsRegion}</code>
          </KV>
          <KV label="Production access">
            {ses ? (
              <span className="inline-flex items-center gap-1.5">
                {dot(ses.productionAccess)}
                {ses.productionAccess ? "Enabled" : "Sandbox"}
              </span>
            ) : (
              <span className="text-faint">—</span>
            )}
          </KV>
          {ses ? (
            <div className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="text-muted">SES sending, last 24 h</span>
                <span className="tabular-nums">
                  {ses.sentLast24Hours.toLocaleString()} <span className="text-muted">of {ses.max24HourSend.toLocaleString()} · {ses.maxSendRate}/s</span>
                </span>
              </div>
              <Meter value={ses.sentLast24Hours} max={ses.max24HourSend} />
            </div>
          ) : null}
          <div className="flex flex-col gap-2 px-5 py-3">
            <span className="text-[13.5px] text-muted">Inbound webhook</span>
            <CopyField value={sys.inboundWebhookUrl} label="Webhook URL" />
          </div>
          <div className="flex flex-col gap-2 px-5 py-3">
            <span className="text-[13.5px] text-muted">Allowed sign-in emails</span>
            <div className="flex flex-wrap gap-1.5">
              {sys.allowedEmails.map((e) => (
                <code key={e} className="rounded-md border border-line bg-bg-subtle/50 px-2 py-0.5 font-mono text-[12px]">
                  {e}
                </code>
              ))}
            </div>
            <p className="text-[12px] text-muted">
              Set with the <Code>ALLOWED_EMAILS</Code> environment variable.
            </p>
          </div>
        </Panel>
        {sys.sesError ? (
          <Notice tone="danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {sys.sesError}
          </Notice>
        ) : null}
      </Section>

      <Section title="Amazon SES setup" description="What real sending and receiving needs.">
        <Panel divided>
          {steps.map((s, i) => (
            <div key={s.title} className="flex gap-3 px-5 py-3.5">
              <span className="mt-0.5 shrink-0">
                {s.done === true ? (
                  <CheckCircle2 className="size-4 text-ok" />
                ) : s.done === false ? (
                  <Circle className="size-4 text-warn" />
                ) : (
                  <span className="flex size-4 items-center justify-center rounded-full border border-line-strong text-[10px] font-medium text-muted tabular-nums">{i + 1}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{s.title}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.body}</div>
                {s.copy ? <CopyField value={s.copy} className="mt-2" /> : null}
              </div>
            </div>
          ))}
        </Panel>
      </Section>
    </div>
  )
}

function UsersSection() {
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
    <Section title="Accounts" description={users ? `${users.length} ${users.length === 1 ? "account" : "accounts"}` : undefined}>
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <Table>
          <THead>
            <Th>Account</Th>
            <Th className="text-right">Agents</Th>
            <Th className="text-right">Inboxes</Th>
            <Th className="text-right">Sent this month</Th>
            <Th>Plan</Th>
            <Th>Role</Th>
            <Th>Joined</Th>
          </THead>
          <TBody>
            {users?.map((u) => (
              <Tr key={u.id} className={cn(update.isPending && update.variables?.userId === u.id && "opacity-60")}>
                <Td>
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-[12.5px] text-muted">{u.email}</div>
                </Td>
                <Td className="text-right tabular-nums">{u.agents}</Td>
                <Td className="text-right tabular-nums">{u.inboxes}</Td>
                <Td className="text-right tabular-nums">{u.sentThisMonth.toLocaleString()}</Td>
                <Td>
                  <NativeSelect
                    aria-label={`Plan for ${u.email}`}
                    className="h-[30px] w-32 text-[13px]"
                    value={u.plan}
                    onChange={(plan) => update.mutate({ userId: u.id, plan: plan as "free" | "pro" | "scale" | "unlimited" })}
                  >
                    <option value="free">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="scale">Scale</option>
                    <option value="unlimited">Unlimited</option>
                  </NativeSelect>
                </Td>
                <Td>
                  <NativeSelect
                    aria-label={`Role for ${u.email}`}
                    className="h-[30px] w-28 text-[13px]"
                    value={u.role}
                    onChange={(role) => update.mutate({ userId: u.id, role: role as "user" | "admin" })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Operator</option>
                  </NativeSelect>
                </Td>
                <Td className="whitespace-nowrap text-muted">{relativeTime(u.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Section>
  )
}

const Code = ({ children }: { children: ReactNode }) => <code className="font-mono text-[12px] text-ink-2">{children}</code>
