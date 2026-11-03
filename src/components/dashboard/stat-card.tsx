import type { ReactNode } from "react"
import { Meter, Skeleton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"

export const StatCard = ({
  label,
  value,
  icon,
  hint,
  max,
  used,
  loading,
  className
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  max?: number | null
  used?: number
  loading?: boolean
  className?: string
}) => (
  <div className={cn("flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card", className)}>
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {icon ? <span className="text-faint [&_svg]:size-4">{icon}</span> : null}
    </div>
    {loading ? (
      <Skeleton className="mt-3 h-7 w-16" />
    ) : (
      <div className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}</div>
    )}
    <div className="mt-auto pt-3">
      {max !== undefined && max !== null && used !== undefined ? <Meter value={used} max={max} className="mb-2" /> : null}
      {hint ? <div className="text-[12px] text-muted">{hint}</div> : null}
    </div>
  </div>
)
