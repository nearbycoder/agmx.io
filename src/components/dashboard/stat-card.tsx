import type { ReactNode } from "react"
import { Meter, Skeleton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"

export interface Stat {
  label: string
  value: ReactNode
  caption?: ReactNode
  used?: number
  max?: number | null
}

/** One bordered strip split into cells by hairlines (instead of a row of cards). */
export const StatStrip = ({ stats, loading, className }: { stats: ReadonlyArray<Stat>; loading?: boolean; className?: string }) => (
  <div className={cn("grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-4", className)}>
    {stats.map((s, i) => (
      <div
        key={s.label}
        className={cn(
          "flex min-w-0 flex-col gap-1 p-5",
          i % 2 === 1 && "border-l border-line",
          i >= 2 && "border-t border-line lg:border-t-0",
          i === 2 && "lg:border-l"
        )}
      >
        <span className="text-[13px] text-muted">{s.label}</span>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <span className="text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{s.value}</span>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {s.caption ? <span className="truncate text-[12px] text-muted">{s.caption}</span> : null}
          {s.max !== undefined && s.max !== null && s.used !== undefined ? <Meter value={s.used} max={s.max} /> : null}
        </div>
      </div>
    ))}
  </div>
)
