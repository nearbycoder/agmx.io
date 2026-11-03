import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
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
