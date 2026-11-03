import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Eye, EyeOff } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { CopyButton } from "~/components/ui/misc"
import { ApiFailure } from "~/lib/api"
import { cn } from "~/lib/utils"

/** Show an API failure as a toast, with an upgrade hint for quota errors. */
export const toastFailure = (error: unknown, fallback = "Something went wrong") => {
  const message = error instanceof Error ? error.message : fallback
  if (error instanceof ApiFailure && error.tag === "QuotaExceeded") {
    toast.error("Plan limit reached", {
      description: message,
      action: { label: "See plans", onClick: () => (window.location.href = "/pricing") }
    })
    return
  }
  toast.error(message)
}

/** Inline, low-key notice. Use for state the user should know about on this screen. */
export const Notice = ({ tone = "neutral", children, className }: { tone?: "neutral" | "warn" | "danger" | "ok"; children: ReactNode; className?: string }) => (
  <div
    className={cn(
      "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed",
      tone === "neutral" && "border-line bg-bg-subtle/60 text-ink-2",
      tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
      tone === "danger" && "border-danger/20 bg-danger-soft text-danger",
      tone === "ok" && "border-ok/20 bg-ok-soft text-ok",
      className
    )}
  >
    {children}
  </div>
)

export const FailureNote = ({ error, className }: { error: unknown; className?: string }) => {
  if (!error) return null
  const quota = error instanceof ApiFailure && error.tag === "QuotaExceeded"
  return (
    <Notice tone={quota ? "warn" : "danger"} className={cn("animate-fade-in block", className)}>
      {error instanceof Error ? error.message : "Something went wrong"}
      {quota ? (
        <Link to="/pricing" className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
          Compare plans <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
    </Notice>
  )
}

export const UpgradePanel = ({ title, description }: { title: string; description: ReactNode }) => (
  <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{description}</p>
    </div>
    <Link
      to="/pricing"
      className="inline-flex h-[34px] shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-3 text-[13.5px] font-medium shadow-card transition-colors hover:border-line-strong hover:bg-surface-2 sm:self-auto"
    >
      Compare plans <ArrowUpRight className="size-4" />
    </Link>
  </div>
)

/** Label/value row used inside panels. */
export const KV = ({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) => (
  <div className={cn("flex min-h-12 items-center justify-between gap-4 px-5 py-2.5 text-[13.5px]", className)}>
    <span className="shrink-0 text-muted">{label}</span>
    <span className="min-w-0 text-right">{children}</span>
  </div>
)

/** Monospace value with a copy button, e.g. an address, URL or id. */
export const CopyField = ({ value, label, className, display }: { value: string; label?: string; className?: string; display?: ReactNode }) => (
  <div className={cn("flex h-[34px] min-w-0 items-center gap-1 rounded-lg border border-line bg-bg-subtle/50 pr-1 pl-3", className)}>
    <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{display ?? value}</code>
    <CopyButton value={value} label={label ? `${label} copied` : undefined} />
  </div>
)

/** A secret with reveal + copy. */
export const SecretField = ({ value, masked, label, className }: { value: string; masked: string; label: string; className?: string }) => {
  const [visible, setVisible] = useState(false)
  return (
    <div className={cn("flex h-[34px] min-w-0 items-center gap-0.5 rounded-lg border border-line bg-bg-subtle/50 pr-1 pl-3", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{visible ? value : masked}</code>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="inline-flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-bg-subtle hover:text-ink"
        aria-label={visible ? `Hide ${label}` : `Reveal ${label}`}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <CopyButton value={value} label={`${label} copied`} />
    </div>
  )
}

const SELECT_CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d8d86' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`

export const NativeSelect = ({
  value,
  onChange,
  children,
  className,
  id,
  disabled,
  "aria-label": ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
  id?: string
  disabled?: boolean
  "aria-label"?: string
}) => (
  <select
    id={id}
    value={value}
    disabled={disabled}
    aria-label={ariaLabel}
    onChange={(e) => onChange(e.target.value)}
    className={cn(
      "h-[34px] w-full appearance-none rounded-lg border border-line bg-surface bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-[13.5px] text-ink shadow-card outline-none transition-colors hover:border-line-strong focus:border-ink/50 focus:ring-2 focus:ring-ink/8 disabled:opacity-60 dark:focus:border-accent/50 dark:focus:ring-accent/15",
      className
    )}
    style={{ backgroundImage: SELECT_CHEVRON }}
  >
    {children}
  </select>
)

/** Small muted link with an arrow, used in section headers. */
export const SectionLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink">
    {children}
  </Link>
)

export const origin = () => (typeof window === "undefined" ? "" : window.location.origin)
