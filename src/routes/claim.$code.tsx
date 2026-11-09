import { seo, siteUrlFrom } from "~/lib/seo"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowRight, Bot, CheckCircle2, Clock, Globe, MonitorSmartphone, ShieldCheck, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { AgentAvatar, Logo } from "~/components/brand"
import { FailureNote } from "~/components/dashboard/common"
import { usernameProblem } from "~/components/dashboard/username-hint"
import { Button } from "~/components/ui/button"
import { AddonInput, Field } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/misc"
import { api, ApiFailure } from "~/lib/api"
import { qk, useMe } from "~/lib/queries"
import { getSessionUser } from "~/lib/session"
import type { AgentT } from "~/shared/api/domain"

export const Route = createFileRoute("/claim/$code")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const user = await getSessionUser()
    if (!user) throw redirect({ to: "/login", search: { redirect: `/claim/${params.code}` } })
    return { user }
  },
  head: ({ match }) => seo({ siteUrl: siteUrlFrom(match), path: "/claim", title: "An agent is asking for an inbox — AGMX", description: "Review and approve this agent to give it an AGMX email inbox and a scoped API key.", image: "/og/agents.png", noindex: true }),
  component: ClaimPage
})

const useCountdown = (iso: string | undefined) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!iso) return null
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return "expired"
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, "0")}`
}

function ClaimPage() {
  const { code } = Route.useParams()
  const { user } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const request = useQuery({
    queryKey: qk.signup(code),
    queryFn: () => api((c) => c.signupApprovals.get({ params: { userCode: code } })),
    retry: false
  })
  const [username, setUsername] = useState("")
  const [approved, setApproved] = useState<AgentT | null>(null)
  const [denied, setDenied] = useState(false)
  const remaining = useCountdown(request.data?.expiresAt)
  const mailDomain = me?.mailDomain ?? "agmx.io"

  useEffect(() => {
    if (request.data?.requestedUsername) setUsername(request.data.requestedUsername)
  }, [request.data?.requestedUsername])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.signups })
    void queryClient.invalidateQueries({ queryKey: qk.agents })
    void queryClient.invalidateQueries({ queryKey: qk.me })
  }
  const approve = useMutation({
    mutationFn: () => api((c) => c.signupApprovals.approve({ params: { userCode: code }, payload: { username: username.trim() || undefined } })),
    onSuccess: (agent) => {
      setApproved(agent)
      invalidate()
    }
  })
  const deny = useMutation({
    mutationFn: () => api((c) => c.signupApprovals.deny({ params: { userCode: code } })),
    onSuccess: () => {
      setDenied(true)
      invalidate()
    }
  })

  const data = request.data
  const status = data?.status
  const problem = usernameProblem(username, true)
  const notFound = request.error instanceof ApiFailure && request.error.tag === "NotFound"

  return (
    <div className="flex min-h-dvh flex-col items-center bg-bg px-4 py-6">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link to="/app">
          <Logo />
        </Link>
        <span className="truncate pl-4 text-[12px] text-muted">Signed in as {user.email}</span>
      </div>

      <div className="mt-[10vh] w-full max-w-md animate-fade-in overflow-hidden rounded-xl border border-line bg-surface">
        {request.isLoading ? (
          <div className="space-y-4 p-8">
            <Skeleton className="mx-auto size-11 rounded-[10px]" />
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : notFound ? (
          <State icon={<XCircle className="size-6" />} tone="danger" title="Request not found" body={`No request matches ${code}. Check the code your agent gave you. Codes expire after 30 minutes.`} />
        ) : request.error ? (
          <State icon={<XCircle className="size-6" />} tone="danger" title="Couldn't load this request" body={request.error.message} />
        ) : approved ? (
          <div className="p-8 text-center">
            <div className="relative mx-auto w-fit">
              <AgentAvatar name={approved.name} color={approved.color} size="lg" />
              <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-ok text-white ring-2 ring-surface">
                <CheckCircle2 className="size-3.5" />
              </span>
            </div>
            <h1 className="mt-5 text-[18px] font-semibold tracking-[-0.01em]">{approved.name} is ready</h1>
            <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-muted">It picks up its API key automatically the next time it checks in. Nothing to copy.</p>
            {approved.inboxes[0] ? (
              <code className="mx-auto mt-5 block w-fit rounded-lg border border-line bg-bg-subtle/60 px-3 py-1.5 font-mono text-[13.5px]">{approved.inboxes[0].address}</code>
            ) : null}
            <div className="mt-7 flex justify-center gap-2">
              <Button asChild>
                <Link to="/app/agents/$agentId" params={{ agentId: approved.id }}>
                  Open agent <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/app">Dashboard</Link>
              </Button>
            </div>
          </div>
        ) : denied || status === "denied" ? (
          <State icon={<XCircle className="size-6" />} tone="muted" title="Request denied" body="The agent has been told. It can start a new request if this was a mistake." />
        ) : status === "approved" || status === "completed" ? (
          <State icon={<CheckCircle2 className="size-6" />} tone="ok" title="Already approved" body="This agent has already been set up." action={<Button asChild variant="secondary"><Link to="/app/agents">View agents</Link></Button>} />
        ) : status === "expired" || remaining === "expired" ? (
          <State icon={<Clock className="size-6" />} tone="warn" title="This request expired" body="Requests are valid for 30 minutes. Ask your agent to call POST /api/v1/signup again." />
        ) : data ? (
          <>
            <div className="flex items-start gap-4 border-b border-line p-6">
              <AgentAvatar name={data.agentName} color="slate" size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[18px] font-semibold tracking-[-0.01em]">{data.agentName}</h1>
                <p className="text-[13.5px] text-muted">wants an email inbox on your account</p>
                <p className="mt-0.5 text-[12px] text-faint tabular-nums">Request expires in {remaining}</p>
                {data.description ? <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{data.description}</p> : null}
              </div>
            </div>
            <form
              className="flex flex-col gap-5 p-6"
              onSubmit={(e) => {
                e.preventDefault()
                if (!problem && !approve.isPending && !deny.isPending) approve.mutate()
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] text-muted">Check this code matches the one your agent showed you</span>
                <code className="shrink-0 font-mono text-[16px] font-semibold tracking-[0.1em]">{data.userCode}</code>
              </div>
              <Field label="Inbox address" htmlFor="claim-username" error={problem} hint={username ? undefined : "Leave blank for a random address."}>
                <AddonInput id="claim-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} suffix={`@${mailDomain}`} placeholder="research" spellCheck={false} autoComplete="off" />
              </Field>
              <ul className="flex flex-col gap-2 border-t border-line pt-4 text-[13px] text-muted">
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="size-4 shrink-0 text-faint" /> Gets a key that can only use this inbox
                </li>
                <li className="flex items-center gap-2.5">
                  <Bot className="size-4 shrink-0 text-faint" /> Counts toward your plan's agent limit
                </li>
                {data.clientIp ? (
                  <li className="flex items-center gap-2.5">
                    <Globe className="size-4 shrink-0 text-faint" /> Requested from <code className="font-mono text-[12.5px] text-ink-2">{data.clientIp}</code>
                  </li>
                ) : null}
                {data.userAgent ? (
                  <li className="flex min-w-0 items-center gap-2.5">
                    <MonitorSmartphone className="size-4 shrink-0 text-faint" />
                    <code className="truncate font-mono text-[12.5px] text-ink-2" title={data.userAgent}>
                      {data.userAgent}
                    </code>
                  </li>
                ) : null}
              </ul>
              <FailureNote error={approve.error ?? deny.error} />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" size="lg" loading={deny.isPending} disabled={approve.isPending} onClick={() => deny.mutate()}>
                  Deny
                </Button>
                <Button type="submit" size="lg" loading={approve.isPending} disabled={Boolean(problem) || deny.isPending}>
                  Approve
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </div>
      <p className="mt-5 max-w-sm text-center text-[12px] text-muted">Only approve agents you started yourself. You can pause or delete an agent at any time.</p>
    </div>
  )
}

function State({ icon, title, body, tone, action }: { icon: React.ReactNode; title: string; body: string; tone: "ok" | "warn" | "danger" | "muted"; action?: React.ReactNode }) {
  const toneClass = { ok: "text-ok", warn: "text-warn", danger: "text-danger", muted: "text-muted" }[tone]
  return (
    <div className="p-8 text-center">
      <div className={`mx-auto flex justify-center [&_svg]:size-6 ${toneClass}`}>{icon}</div>
      <h1 className="mt-4 text-[17px] font-semibold">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex justify-center gap-2">
        {action ?? (
          <Button asChild variant="secondary">
            <Link to="/app">Go to dashboard</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
