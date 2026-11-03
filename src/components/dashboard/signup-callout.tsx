import { Link } from "@tanstack/react-router"
import { ArrowRight, BellRing } from "lucide-react"
import { useSignupRequests } from "~/lib/queries"
import { relativeTime } from "~/lib/utils"

/** Pending agent self sign-ups waiting for the human's approval. */
export const SignupCallout = () => {
  const { data } = useSignupRequests()
  if (!data?.length) return null
  return (
    <div className="animate-rise overflow-hidden rounded-2xl border border-warn/30 bg-warn-soft/60 shadow-card">
      <div className="flex items-center gap-2.5 border-b border-warn/20 px-4 py-2.5 text-[13px] font-medium text-warn">
        <BellRing className="size-4" />
        {data.length === 1 ? "An agent is asking for an inbox" : `${data.length} agents are asking for inboxes`}
      </div>
      <div className="divide-y divide-warn/15">
        {data.map((s) => (
          <Link
            key={s.id}
            to="/claim/$code"
            params={{ code: s.userCode }}
            className="group flex items-center gap-4 bg-surface/60 px-4 py-3 transition hover:bg-surface"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{s.agentName}</span>
                <span className="rounded-md border border-line bg-surface px-1.5 font-mono text-[11px] text-muted">{s.userCode}</span>
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-muted">
                {s.requestedUsername ? `wants ${s.requestedUsername}@ · ` : ""}
                {s.description ?? "No description"} · {relativeTime(s.createdAt)}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink">
              Review <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
