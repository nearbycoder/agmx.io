import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pause, Play, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { Meter } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk } from "~/lib/queries"
import { cn, relativeTime } from "~/lib/utils"
import type { AgentT } from "~/shared/api/domain"
import { toastFailure } from "./common"
import { Panel, Section } from "./section"

export const reputationKey = (agentId: string) => ["reputation", agentId] as const

export const useReputation = (agentId: string) =>
  useQuery({ queryKey: reputationKey(agentId), queryFn: () => api((c) => c.agents.reputation({ params: { agentId } })), staleTime: 30_000 })

const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 1)}%`

function useSendingMutations(agentId: string) {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: reputationKey(agentId) })
    void queryClient.invalidateQueries({ queryKey: qk.agent(agentId) })
    void queryClient.invalidateQueries({ queryKey: qk.agents })
  }
  const resume = useMutation({
    mutationFn: () => api((c) => c.agents.resumeSending({ params: { agentId } })),
    onSuccess: () => {
      refresh()
      toast.success("Sending resumed. Reputation starts fresh from now.")
    },
    onError: (e) => toastFailure(e)
  })
  const pause = useMutation({
    mutationFn: () => api((c) => c.agents.pauseSending({ params: { agentId }, payload: {} })),
    onSuccess: () => {
      refresh()
      toast.success("Sending paused. The agent can still receive mail.")
    },
    onError: (e) => toastFailure(e)
  })
  return { resume, pause }
}

/** Shown at the top of the agent page when outgoing mail is paused. */
export function SendingPausedNotice({ agent }: { agent: AgentT }) {
  const { resume } = useSendingMutations(agent.id)
  if (!agent.sendingPaused) return null
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3.5 sm:flex-row sm:items-start" role="alert">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        <p className="font-medium text-ink">Sending paused {relativeTime(agent.sendingPaused.at)}</p>
        <p className="mt-0.5 text-ink-2">
          {agent.sendingPaused.reason ?? "Paused by a human."} Incoming mail still arrives. Scheduled mail waits until you resume.
        </p>
      </div>
      <Button size="sm" variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()} className="shrink-0">
        <Play /> Resume sending
      </Button>
    </div>
  )
}

/** Bounce and complaint rates for mail the agent sent, against the auto-pause thresholds. */
export function ReputationSection({ agent }: { agent: AgentT }) {
  const { data } = useReputation(agent.id)
  const { pause } = useSendingMutations(agent.id)
  const [confirming, setConfirming] = useState(false)

  return (
    <Section
      title="Deliverability"
      description={
        data
          ? `Mail this agent sent through SES since ${new Date(data.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Sending pauses automatically if bounces or spam complaints climb.`
          : "Bounces and spam complaints for mail this agent sent."
      }
      action={
        agent.sendingPaused ? null : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <Pause /> Pause sending
          </Button>
        )
      }
    >
      <Panel className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Sent" value={data ? data.sent.toLocaleString() : "–"} />
        <RateStat
          label="Hard bounces"
          count={data?.bounced}
          rate={data?.bounceRate}
          limit={data?.thresholds.bounceRate}
          note={data ? `Pauses at ${pct(data.thresholds.bounceRate)} (min ${data.thresholds.minBounces})` : ""}
        />
        <RateStat
          label="Spam complaints"
          count={data?.complained}
          rate={data?.complaintRate}
          limit={data?.thresholds.complaintRate}
          note={data ? `Pauses at ${pct(data.thresholds.complaintRate)} (min ${data.thresholds.minComplaints})` : ""}
        />
      </Panel>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Pause sending for ${agent.name}?`}
        description="Outgoing mail from all of this agent's inboxes stops until you resume it. Incoming mail keeps arriving, and scheduled mail waits."
        confirmLabel="Pause sending"
        onConfirm={() => {
          pause.mutate()
          setConfirming(false)
        }}
      />
    </Section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
    </div>
  )
}

function RateStat({ label, count, rate, limit, note }: { label: string; count?: number; rate?: number; limit?: number; note: string }) {
  const level = rate !== undefined && limit ? rate / limit : 0
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("text-[20px] font-semibold tracking-[-0.02em] tabular-nums", level >= 1 ? "text-danger" : level >= 0.6 && "text-warn")}>
          {rate === undefined ? "–" : pct(rate)}
        </span>
        <span className="text-[12px] text-muted tabular-nums">{count === undefined ? "" : count.toLocaleString()}</span>
      </div>
      <Meter value={Math.min(level, 1) * 100} max={100} className="mt-2" />
      <div className="mt-1.5 text-[11.5px] text-faint">{note}</div>
    </div>
  )
}
