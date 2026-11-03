import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { AgentAvatar } from "~/components/brand"
import { useSignupRequests } from "~/lib/queries"
import { relativeTime } from "~/lib/utils"

/** Pending agent self sign-ups waiting for the human's approval. */
export const SignupCallout = () => {
  const { data } = useSignupRequests()
  if (!data?.length) return null
  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-warn/30 bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-warn-soft/50 px-5 py-2.5 text-[13px] font-medium">
        <span className="size-1.5 rounded-full bg-warn" />
        {data.length === 1 ? "An agent is asking for an inbox" : `${data.length} agents are asking for inboxes`}
      </div>
      <div className="divide-y divide-line">
        {data.map((s) => (
          <Link key={s.id} to="/claim/$code" params={{ code: s.userCode }} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-subtle/50">
            <AgentAvatar name={s.agentName} color="slate" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium">{s.agentName}</span>
                <code className="font-mono text-[12px] text-muted">{s.userCode}</code>
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {s.requestedUsername ? `Wants ${s.requestedUsername}@ · ` : ""}
                {s.description ? `${s.description} · ` : ""}
                {relativeTime(s.createdAt)}
              </div>
            </div>
            <span className="flex items-center gap-0.5 text-[13px] text-muted transition-colors group-hover:text-ink">
              Review <ChevronRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
