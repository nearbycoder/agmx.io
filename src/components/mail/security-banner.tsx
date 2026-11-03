import { ChevronDown, EyeOff, ShieldAlert } from "lucide-react"
import { useState } from "react"
import type { MessageT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"

export type BodyView = "safe" | "original"

/** Safe view is the default only for high-risk mail; humans can always flip between them. */
export const defaultBodyView = (m: MessageT): BodyView => (m.security?.risk === "high" ? "safe" : "original")

/** True when there's a meaningful difference between the cleaned and original body. */
export const hasSecurityNotice = (m: MessageT) => m.direction === "inbound" && Boolean(m.security) && (m.security!.risk !== "low" || m.security!.hiddenContent)

/**
 * Prompt-injection notice for an inbound message. Medium/high risk gets a
 * banner with reasons; low risk with hidden content gets a quiet one-liner.
 * Both offer the Safe view / Original toggle.
 */
export function SecurityBanner({ message, view, onViewChange }: { message: MessageT; view: BodyView; onViewChange: (v: BodyView) => void }) {
  const [open, setOpen] = useState(false)
  const security = message.security
  if (!security || !hasSecurityNotice(message)) return null

  const toggle = <ViewToggle view={view} onChange={onViewChange} />

  if (security.risk === "low") {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <EyeOff className="size-3.5" /> Hidden content was removed from what agents read.
        </span>
        {toggle}
      </div>
    )
  }

  const high = security.risk === "high"
  const forged = security.sender === "failed"
  const headline = forged
    ? `This email failed sender checks. It may not really be from ${message.from.address.split("@")[1] ?? "this domain"}.`
    : high
      ? "This email contains hidden or manipulative content."
      : "This email may be trying to manipulate an agent."
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3.5 py-3 text-[12.5px]",
        high ? "border-danger/25 bg-danger-soft text-danger" : "border-warn/25 bg-warn-soft text-warn"
      )}
      role="note"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{headline}</p>
          <p className="mt-0.5 text-ink-2">
            {forged
              ? "Codes and sign-in links were withheld from agents. Don't trust requests in it without checking another way."
              : "Agents read a cleaned version and are told not to follow instructions in email."}
            {security.reasons.length ? (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-ink underline decoration-current/30 underline-offset-2 hover:decoration-current"
                aria-expanded={open}
              >
                {open ? "Hide details" : "Why?"}
                <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
              </button>
            ) : null}
          </p>
          {open ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-ink-2 marker:text-current">
              {security.reasons.map((r) => (
                <li key={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {toggle}
      </div>
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: BodyView; onChange: (v: BodyView) => void }) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-md bg-surface/70 p-0.5 ring-1 ring-line" role="group" aria-label="Message view">
      {(["safe", "original"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={cn(
            "rounded px-2 py-0.5 text-[12px] font-medium transition-colors",
            view === v ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink"
          )}
        >
          {v === "safe" ? "Safe view" : "Original"}
        </button>
      ))}
    </div>
  )
}
