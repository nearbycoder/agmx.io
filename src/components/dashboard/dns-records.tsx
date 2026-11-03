import { CheckCircle2, CircleDashed, HelpCircle } from "lucide-react"
import { CopyButton } from "~/components/ui/misc"
import { Tooltip } from "~/components/ui/menu"
import type { DomainT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"

const StatusIcon = ({ status }: { status: "verified" | "pending" | "unknown" }) =>
  status === "verified" ? (
    <Tooltip content="Verified">
      <CheckCircle2 className="size-4 text-ok" />
    </Tooltip>
  ) : status === "pending" ? (
    <Tooltip content="Waiting for DNS">
      <CircleDashed className="size-4 animate-[spin_3s_linear_infinite] text-warn" />
    </Tooltip>
  ) : (
    <Tooltip content="Recommended — not checked">
      <HelpCircle className="size-4 text-faint" />
    </Tooltip>
  )

export const DnsRecordTable = ({ records }: { records: DomainT["records"] }) => (
  <div className="overflow-hidden rounded-xl border border-line">
    <div className="hidden grid-cols-[64px_minmax(0,1.1fr)_minmax(0,1.6fr)_40px] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-[11px] font-medium tracking-wider text-faint uppercase md:grid">
      <span>Type</span>
      <span>Name</span>
      <span>Value</span>
      <span />
    </div>
    <div className="divide-y divide-line">
      {records.map((r, i) => (
        <div key={i} className="grid gap-2 px-4 py-3 md:grid-cols-[64px_minmax(0,1.1fr)_minmax(0,1.6fr)_40px] md:items-center md:gap-3">
          <div className="flex items-center justify-between md:block">
            <span className={cn("inline-flex rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold", r.type === "MX" ? "bg-info-soft text-info" : r.type === "CNAME" ? "bg-accent-soft text-accent-ink" : "bg-bg-subtle text-ink-2")}>
              {r.type}
            </span>
            <span className="md:hidden">
              <StatusIcon status={r.status} />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <code className="truncate font-mono text-[12.5px]" title={r.name}>
                {r.name}
              </code>
              <CopyButton value={r.name} size="xs" label="Name copied" />
            </div>
            <div className="text-[11.5px] text-muted">{r.purpose}</div>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {r.priority !== undefined ? <span className="shrink-0 rounded bg-bg-subtle px-1 font-mono text-[11px] text-muted">{r.priority}</span> : null}
            <code className="truncate font-mono text-[12.5px] text-ink-2" title={r.value}>
              {r.value}
            </code>
            <CopyButton value={r.value} size="xs" label="Value copied" />
          </div>
          <div className="hidden justify-end md:flex">
            <StatusIcon status={r.status} />
          </div>
        </div>
      ))}
    </div>
  </div>
)
