import { CalendarDays, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, MapPin, Package, Receipt, User } from "lucide-react"
import type { ReactNode } from "react"
import type { MessageT } from "~/shared/api/domain"
import { Tooltip } from "~/components/ui/menu"
import { copyText } from "~/components/ui/misc"
import { cn } from "~/lib/utils"

type Extracted = MessageT["extracted"]
type CalendarEvent = Extracted["events"][number]

const CARRIER: Record<string, string> = { ups: "UPS", fedex: "FedEx", usps: "USPS", dhl: "DHL", other: "Package" }

/** "2026-12-01" (all-day) or an ISO instant → Date in local time. */
const toDate = (value: string, allDay: boolean) => {
  if (allDay) {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y!, (m ?? 1) - 1, d ?? 1)
  }
  return new Date(value)
}

const formatEventTime = (e: CalendarEvent) => {
  if (!e.start) return null
  const start = toDate(e.start, e.allDay)
  if (Number.isNaN(start.getTime())) return null
  const day: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: start.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }
  if (e.allDay) {
    const end = e.end ? toDate(e.end, true) : null
    // iCalendar all-day DTEND is exclusive.
    if (end && end.getTime() - start.getTime() > 86_400_000) {
      const last = new Date(end.getTime() - 86_400_000)
      return `${start.toLocaleDateString(undefined, day)} – ${last.toLocaleDateString(undefined, day)} · All day`
    }
    return `${start.toLocaleDateString(undefined, day)} · All day`
  }
  const end = e.end ? new Date(e.end) : null
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
  const date = start.toLocaleDateString(undefined, day)
  if (!end || Number.isNaN(end.getTime())) return `${date} · ${start.toLocaleTimeString(undefined, time)}`
  if (end.toDateString() === start.toDateString()) {
    const fmt = new Intl.DateTimeFormat(undefined, time)
    return `${date} · ${fmt.formatRange(start, end)}`
  }
  return `${date}, ${start.toLocaleTimeString(undefined, time)} – ${end.toLocaleDateString(undefined, day)}, ${end.toLocaleTimeString(undefined, time)}`
}

const formatMoney = (amount: number, currency: string | null) => {
  if (!currency) return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  try {
    return amount.toLocaleString(undefined, { style: "currency", currency })
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export const hasExtracted = (m: MessageT) => {
  const e = m.extracted
  return (
    m.direction === "inbound" &&
    (e.codes.length > 0 ||
      e.links.some((l) => l.kind === "verify" || l.kind === "login" || l.kind === "reset") ||
      e.events.length > 0 ||
      Boolean(e.receipt) ||
      e.tracking.length > 0)
  )
}

/** Everything AGMX pulled out of the email for agents, shown for humans too. */
export function ExtractedPanel({ extracted }: { extracted: Extracted }) {
  const actionLinks = extracted.links.filter((l) => l.kind === "verify" || l.kind === "login" || l.kind === "reset").slice(0, 3)
  const trackingLinks = new Set(extracted.tracking.map((t) => t.url).filter(Boolean))
  const extraTrackingLinks = extracted.links.filter((l) => l.kind === "tracking" && !trackingLinks.has(l.url)).slice(0, 2)
  const showCodes = extracted.codes.length > 0 || actionLinks.length > 0

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-bg-subtle/60">
      {showCodes ? (
        <Section icon={<KeyRound />} label={extracted.codes.length ? "Verification code" : "Action links"}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {extracted.codes.map((code, i) => (
              <Tooltip key={code} content="Copy code">
                <button
                  type="button"
                  onClick={() => void copyText(code, `Code ${code} copied`)}
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-md font-mono font-semibold tracking-[0.14em] transition-colors",
                    i === 0
                      ? "bg-accent-soft px-2.5 py-1 text-[15px] text-accent-ink ring-1 ring-accent/50 hover:ring-accent"
                      : "px-1.5 py-0.5 text-[13px] text-ink-2 ring-1 ring-line hover:ring-line-strong"
                  )}
                >
                  {code}
                  <Copy className="size-3.5 opacity-60 group-hover:opacity-100" />
                </button>
              </Tooltip>
            ))}
            {actionLinks.length ? (
              <span className="flex flex-wrap gap-1.5">
                {actionLinks.map((link) => (
                  <LinkButton key={link.url} href={link.url} icon={link.kind === "verify" ? <CheckCircle2 className="text-ok" /> : <Link2 />}>
                    {link.text || (link.kind === "verify" ? "Verify" : link.kind === "login" ? "Sign in" : "Reset password")}
                  </LinkButton>
                ))}
              </span>
            ) : null}
          </div>
        </Section>
      ) : null}

      {extracted.events.map((event, i) => {
        const when = formatEventTime(event)
        return (
          <Section key={event.uid ?? i} icon={<CalendarDays />} label={event.method === "CANCEL" ? "Cancelled event" : "Calendar invite"}>
            <div className="min-w-0">
              <div className={cn("text-[13.5px] font-medium", event.method === "CANCEL" && "text-muted line-through")}>{event.title}</div>
              {when ? <div className="mt-0.5 text-[12.5px] text-ink-2 tabular-nums">{when}</div> : null}
              {event.location || event.organizer ? (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                  {event.location ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin className="size-3 shrink-0" />
                      {/^https?:\/\//.test(event.location) ? (
                        <a href={event.location} target="_blank" rel="noreferrer noopener" className="truncate underline decoration-line-strong underline-offset-2 hover:text-ink">
                          {event.location}
                        </a>
                      ) : (
                        <span className="truncate">{event.location}</span>
                      )}
                    </span>
                  ) : null}
                  {event.organizer ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <User className="size-3 shrink-0" />
                      <span className="truncate">{event.organizer}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {event.url ? (
                <div className="mt-2">
                  <LinkButton href={event.url} icon={<Link2 />}>
                    Event link
                  </LinkButton>
                </div>
              ) : null}
            </div>
          </Section>
        )
      })}

      {extracted.receipt ? (
        <Section icon={<Receipt />} label="Receipt">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {extracted.receipt.total !== null ? (
              <span className="text-[15px] font-semibold tabular-nums">{formatMoney(extracted.receipt.total, extracted.receipt.currency)}</span>
            ) : null}
            {extracted.receipt.merchant ? <span className="text-[13px] text-ink-2">{extracted.receipt.merchant}</span> : null}
            {extracted.receipt.orderNumber ? (
              <button
                type="button"
                onClick={() => void copyText(extracted.receipt!.orderNumber!, "Order number copied")}
                className="group inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
                title="Copy order number"
              >
                Order <span className="font-mono text-ink-2 group-hover:text-ink">{extracted.receipt.orderNumber}</span>
                <Copy className="size-3 opacity-60 group-hover:opacity-100" />
              </button>
            ) : null}
          </div>
        </Section>
      ) : null}

      {extracted.tracking.length || extraTrackingLinks.length ? (
        <Section icon={<Package />} label="Tracking">
          <div className="flex flex-col gap-1.5">
            {extracted.tracking.map((t) => (
              <div key={t.number} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[12.5px] font-medium">{CARRIER[t.carrier] ?? "Package"}</span>
                <button
                  type="button"
                  onClick={() => void copyText(t.number, "Tracking number copied")}
                  className="group inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink-2 hover:text-ink"
                  title="Copy tracking number"
                >
                  {t.number}
                  <Copy className="size-3 opacity-60 group-hover:opacity-100" />
                </button>
                {t.url ? (
                  <LinkButton href={t.url} icon={<Package />}>
                    Track
                  </LinkButton>
                ) : null}
              </div>
            ))}
            {extraTrackingLinks.length ? (
              <span className="flex flex-wrap gap-1.5">
                {extraTrackingLinks.map((l) => (
                  <LinkButton key={l.url} href={l.url} icon={<Package />}>
                    {l.text || "Track package"}
                  </LinkButton>
                ))}
              </span>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function Section({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-3.5 py-3 last:border-0 sm:flex-row sm:gap-4">
      <span className="inline-flex w-36 shrink-0 items-center gap-1.5 pt-0.5 text-[12px] text-muted [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function LinkButton({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={href}
      className="inline-flex h-[30px] max-w-[260px] items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium transition-colors hover:border-line-strong [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg:not(.text-ok)]:text-muted"
    >
      {icon}
      <span className="truncate">{children}</span>
      <ExternalLink className="!size-3 shrink-0 !text-faint" />
    </a>
  )
}
