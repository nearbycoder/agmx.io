import { useMemo, useState } from "react"
import { cn } from "~/lib/utils"

interface Point {
  day: string
  sent: number
  received: number
}

const niceMax = (value: number) => {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 2, 2.5, 5, 10]
  for (const s of steps) if (s * magnitude >= value) return s * magnitude
  return 10 * magnitude
}

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" })

/** Grouped daily bars: received (accent) and sent (ink), with a hover read-out. */
export const UsageChart = ({ days, className }: { days: ReadonlyArray<Point>; className?: string }) => {
  const [hover, setHover] = useState<number | null>(null)
  const width = 720
  const height = 200
  const pad = { top: 12, right: 8, bottom: 24, left: 32 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = useMemo(() => niceMax(Math.max(1, ...days.map((d) => Math.max(d.sent, d.received)))), [days])
  const ticks = [0, max / 2, max]
  const slot = innerW / Math.max(days.length, 1)
  const barW = Math.max(2, Math.min(9, slot / 2 - 1.5))
  const y = (v: number) => pad.top + innerH - (v / max) * innerH
  const totals = days.reduce((acc, d) => ({ sent: acc.sent + d.sent, received: acc.received + d.received }), { sent: 0, received: 0 })
  const active = hover !== null ? days[hover] : null

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-5 text-[12.5px]">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-accent ring-1 ring-black/10" />
            <span className="text-muted">Received</span>
            <span className="font-semibold tabular-nums">{(active?.received ?? totals.received).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px] bg-ink" />
            <span className="text-muted">Sent</span>
            <span className="font-semibold tabular-nums">{(active?.sent ?? totals.sent).toLocaleString()}</span>
          </span>
        </div>
        <span className="text-[12px] text-muted tabular-nums">{active ? fmtDay(active.day, { weekday: "short", month: "short", day: "numeric" }) : `Last ${days.length} days`}</span>
      </div>
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[520px] overflow-visible" role="img" aria-label={`Usage over ${days.length} days: ${totals.received} received, ${totals.sent} sent`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint text-[10px] tabular-nums">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2
          const isActive = hover === i
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill="transparent" />
              {isActive ? <rect x={pad.left + slot * i + 1} y={pad.top} width={slot - 2} height={innerH} rx={4} className="fill-bg-subtle" /> : null}
              <rect x={cx - barW - 0.75} y={y(d.received)} width={barW} height={Math.max(0, innerH + pad.top - y(d.received))} rx={Math.min(2, barW / 2)} className="fill-accent" opacity={hover === null || isActive ? 1 : 0.45} />
              <rect x={cx + 0.75} y={y(d.sent)} width={barW} height={Math.max(0, innerH + pad.top - y(d.sent))} rx={Math.min(2, barW / 2)} className="fill-ink" opacity={hover === null || isActive ? 1 : 0.35} />
              {i % Math.ceil(days.length / 6) === 0 || i === days.length - 1 ? (
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-faint text-[10px]">
                  {fmtDay(d.day)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      </div>
    </div>
  )
}
