import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "~/lib/utils"

interface Point {
  day: string
  sent: number
  received: number
}

const niceMax = (value: number) => {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const s of [1, 2, 2.5, 5, 10]) if (s * magnitude >= value) return s * magnitude
  return 10 * magnitude
}

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" })

const fmtTick = (t: number) => (t >= 1000 ? `${+(t / 1000).toFixed(1)}k` : String(t))

/** Thin paired daily bars (received / sent) with a hover tooltip. */
export const UsageChart = ({ days, className }: { days: ReadonlyArray<Point>; className?: string }) => {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const height = width < 480 ? 160 : 188
  const pad = { top: 10, right: 4, bottom: 24, left: 30 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = useMemo(() => niceMax(Math.max(1, ...days.map((d) => Math.max(d.sent, d.received)))), [days])
  const ticks = [0, max / 2, max]
  const slot = innerW / Math.max(days.length, 1)
  const barW = Math.max(3, Math.min(7, slot / 4))
  const y = (v: number) => pad.top + innerH - (v / max) * innerH
  const barH = (v: number) => (v === 0 ? 0 : Math.max(2, (v / max) * innerH))
  const totals = days.reduce((acc, d) => ({ sent: acc.sent + d.sent, received: acc.received + d.received }), { sent: 0, received: 0 })
  const active = hover !== null ? days[hover] : null
  const labelEvery = Math.ceil(days.length / (width < 480 ? 4 : 7))

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <Legend swatch="bg-accent ring-1 ring-inset ring-black/10" label="Received" value={totals.received} />
        <Legend swatch="bg-ink/80" label="Sent" value={totals.sent} />
      </div>
      <div className="relative" ref={ref}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-full overflow-visible"
          role="img"
          aria-label={`Mail over ${days.length} days: ${totals.received} received, ${totals.sent} sent`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={t === 0 ? undefined : "3 5"} />
              <text x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint text-[10px] tabular-nums">
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const cx = pad.left + slot * i + slot / 2
            const dim = hover !== null && hover !== i
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)}>
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH + pad.bottom} fill="transparent" />
                {hover === i ? <line x1={cx} x2={cx} y1={pad.top} y2={pad.top + innerH} className="stroke-line-strong" /> : null}
                <rect x={cx - barW - 1} y={pad.top + innerH - barH(d.received)} width={barW} height={barH(d.received)} rx={barW / 2} className="fill-accent" opacity={dim ? 0.35 : 1} />
                <rect x={cx + 1} y={pad.top + innerH - barH(d.sent)} width={barW} height={barH(d.sent)} rx={barW / 2} className="fill-ink" opacity={dim ? 0.2 : 0.8} />
                {(days.length - 1 - i) % labelEvery === 0 ? (
                  <text x={cx} y={height - 6} textAnchor="middle" className="fill-faint text-[10px]">
                    {fmtDay(d.day)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-36 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={{ left: `${Math.min(88, Math.max(12, ((pad.left + slot * hover + slot / 2) / width) * 100))}%` }}
          >
            <div className="mb-1 font-medium">{fmtDay(active.day, { weekday: "short", month: "short", day: "numeric" })}</div>
            <div className="flex justify-between text-muted">
              Received <span className="font-medium text-ink tabular-nums">{active.received.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted">
              Sent <span className="font-medium text-ink tabular-nums">{active.sent.toLocaleString()}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const Legend = ({ swatch, label, value }: { swatch: string; label: string; value: number }) => (
  <span className="flex items-center gap-2">
    <span className={cn("size-2 rounded-full", swatch)} />
    <span className="text-muted">{label}</span>
    <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
  </span>
)
