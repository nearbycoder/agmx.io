import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import type { AgentT } from "~/shared/api/domain"
import { useApprovals } from "./queries"

/** Overview banner when outbound mail is waiting for a human decision. */
export const ApprovalsCallout = () => {
  const { data } = useApprovals()
  if (!data?.length) return null
  const first = data[0]!
  return (
    <Link
      to="/app/approvals"
      className="group animate-fade-in flex items-center gap-3 rounded-xl border border-warn/30 bg-surface px-5 py-3 transition-colors hover:bg-bg-subtle/50"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-warn" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">
          {data.length === 1 ? "1 message is waiting for approval" : `${data.length} messages are waiting for approval`}
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {first.from.address} → {first.to.map((t) => t.address).join(", ") || "no recipients"}
          {first.subject ? ` · ${first.subject}` : ""}
        </div>
      </div>
      <span className="flex items-center gap-0.5 text-[13px] text-muted transition-colors group-hover:text-ink">
        Review <ChevronRight className="size-4" />
      </span>
    </Link>
  )
}

/** Overview banner when AGMX paused an agent's outgoing mail (bounces or complaints). */
export const SendingPausedCallout = ({ agents }: { agents: ReadonlyArray<AgentT> | undefined }) => {
  const paused = (agents ?? []).filter((a) => a.sendingPaused)
  if (!paused.length) return null
  const first = paused[0]!
  return (
    <Link
      to="/app/agents/$agentId"
      params={{ agentId: first.id }}
      className="group animate-fade-in flex items-center gap-3 rounded-xl border border-danger/25 bg-surface px-5 py-3 transition-colors hover:bg-bg-subtle/50"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-danger" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">
          {paused.length === 1 ? `Sending is paused for ${first.name}` : `Sending is paused for ${paused.length} agents`}
        </div>
        <div className="truncate text-[12.5px] text-muted">{first.sendingPaused?.reason ?? "Paused by a human."} Incoming mail still arrives.</div>
      </div>
      <span className="flex items-center gap-0.5 text-[13px] text-muted transition-colors group-hover:text-ink">
        Review <ChevronRight className="size-4" />
      </span>
    </Link>
  )
}
