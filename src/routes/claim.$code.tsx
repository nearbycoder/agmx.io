import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowRight, Bot, CheckCircle2, Clock, Globe, MonitorSmartphone, ShieldCheck, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { AgentAvatar, Logo } from "~/components/brand"
import { FailureNote } from "~/components/dashboard/common"
import { usernameProblem } from "~/components/dashboard/username-hint"
import { Badge } from "~/components/ui/badge"
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
  head: () => ({ meta: [{ title: "Approve agent — AGMX" }] }),
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
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-bg px-4 py-8">
      <div className="dot-bg pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
      <div className="relative flex w-full max-w-md items-center justify-between">
        <Link to="/app">
          <Logo />
        </Link>
        <span className="text-[12px] text-muted">Signed in as {user.email}</span>
      </div>

      <div className="relative mt-[8vh] w-full max-w-md animate-rise rounded-3xl border border-line bg-surface shadow-pop">
        {request.isLoading ? (
          <div className="space-y-4 p-8">
            <Skeleton className="mx-auto size-14 rounded-[28%]" />
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : notFound ? (
          <State icon={<XCircle className="size-6" />} tone="danger" title="Request not found" body={`No sign-up request matches ${code}. Check the code your agent gave you — codes expire after 30 minutes.`} />
        ) : request.error ? (
          <State icon={<XCircle className="size-6" />} tone="danger" title="Couldn't load this request" body={request.error.message} />
        ) : approved ? (
          <div className="p-8 text-center">
            <div className="relative mx-auto w-fit">
              <AgentAvatar name={approved.name} color={approved.color} size="lg" className="size-16 text-xl" />
              <span className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full bg-ok text-white ring-4 ring-surface">
                <CheckCircle2 className="size-4" />
              </span>
            </div>
            <h1 className="mt-5 text-xl font-semibold tracking-tight">{approved.name} is ready</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">It will pick up its API key automatically on its next poll — no copy-pasting needed.</p>
            {approved.inboxes[0] ? (
              <div className="mx-auto mt-5 w-fit rounded-xl border border-accent/40 bg-accent-soft px-4 py-2 font-mono text-[14px] text-accent-ink">{approved.inboxes[0].address}</div>
            ) : null}
            <div className="mt-7 flex justify-center gap-2">
              <Link to="/app/agents/$agentId" params={{ agentId: approved.id }}>
                <Button>
                  Open agent <ArrowRight />
                </Button>
              </Link>
              <Link to="/app">
                <Button variant="secondary">Dashboard</Button>
              </Link>
            </div>
          </div>
        ) : denied || status === "denied" ? (
          <State icon={<XCircle className="size-6" />} tone="muted" title="Request denied" body="The agent was told no. It can start a new request if this was a mistake." />
        ) : status === "approved" || status === "completed" ? (
          <State icon={<CheckCircle2 className="size-6" />} tone="ok" title="Already approved" body="This agent has already been set up." action={<Link to="/app/agents"><Button variant="secondary">View agents</Button></Link>} />
        ) : status === "expired" || remaining === "expired" ? (
          <State icon={<Clock className="size-6" />} tone="warn" title="This request expired" body="Requests are valid for 30 minutes. Ask your agent to call POST /api/v1/signup again." />
        ) : data ? (
          <>
            <div className="border-b border-line p-7 text-center">
              <Badge tone="warn" className="mb-4">
                <Clock /> Expires in {remaining}
              </Badge>
              <div className="mx-auto w-fit">
                <AgentAvatar name={data.agentName} color="lime" size="lg" className="size-16 text-xl" />
              </div>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">{data.agentName}</h1>
              <p className="mt-1 text-sm text-muted">wants an email inbox on your account</p>
              {data.description ? <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-ink-2">“{data.description}”</p> : null}
            </div>
            <div className="flex flex-col gap-5 p-7">
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
                <span className="text-[12px] text-muted">Confirm this code matches your agent</span>
                <span className="font-mono text-[17px] font-semibold tracking-[0.12em]">{data.userCode}</span>
              </div>
              <Field label="Inbox address" htmlFor="claim-username" error={problem} hint={username ? undefined : "Leave blank for a random friendly address."}>
                <AddonInput id="claim-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} suffix={`@${mailDomain}`} placeholder="research" spellCheck={false} autoComplete="off" />
              </Field>
              <ul className="flex flex-col gap-2 text-[12.5px] text-muted">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-ok" /> Gets an agent-scoped key: only this inbox, nothing else
                </li>
                {data.clientIp ? (
                  <li className="flex items-center gap-2">
                    <Globe className="size-4" /> Requested from <span className="font-mono text-ink-2">{data.clientIp}</span>
                  </li>
                ) : null}
                {data.userAgent ? (
                  <li className="flex items-center gap-2">
                    <MonitorSmartphone className="size-4 shrink-0" /> <span className="truncate font-mono text-ink-2" title={data.userAgent}>{data.userAgent}</span>
                  </li>
                ) : null}
                <li className="flex items-center gap-2">
                  <Bot className="size-4" /> Counts toward your plan's agent limit
                </li>
              </ul>
              <FailureNote error={approve.error ?? deny.error} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="lg" loading={deny.isPending} disabled={approve.isPending} onClick={() => deny.mutate()}>
                  Deny
                </Button>
                <Button size="lg" loading={approve.isPending} disabled={Boolean(problem) || deny.isPending} onClick={() => approve.mutate()}>
                  Approve
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
      <p className="relative mt-6 max-w-sm text-center text-[12px] text-faint">Only approve agents you started yourself. You can pause or delete an agent at any time.</p>
    </div>
  )
}

function State({ icon, title, body, tone, action }: { icon: React.ReactNode; title: string; body: string; tone: "ok" | "warn" | "danger" | "muted"; action?: React.ReactNode }) {
  const toneClass = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", muted: "bg-bg-subtle text-muted" }[tone]
  return (
    <div className="p-8 text-center">
      <div className={`mx-auto flex size-14 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div>
      <h1 className="mt-5 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex justify-center gap-2">
        {action ?? (
          <Link to="/app">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
