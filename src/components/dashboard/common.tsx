import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"
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

export const FailureNote = ({ error, className }: { error: unknown; className?: string }) => {
  if (!error) return null
  const quota = error instanceof ApiFailure && error.tag === "QuotaExceeded"
  return (
    <div
      className={cn(
        "animate-fade-in rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed",
        quota ? "border-warn/25 bg-warn-soft text-warn" : "border-danger/20 bg-danger-soft text-danger",
        className
      )}
    >
      {error instanceof Error ? error.message : "Something went wrong"}
      {quota ? (
        <Link to="/pricing" className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
          Compare plans <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
    </div>
  )
}

export const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("text-[11px] font-medium tracking-wider text-faint uppercase", className)}>{children}</div>
)

export const UpgradePanel = ({ title, description }: { title: string; description: ReactNode }) => (
  <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card">
    <div className="absolute -top-24 -right-24 size-64 rounded-full bg-accent/25 blur-3xl" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <Link
        to="/pricing"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-ink px-3.5 text-sm font-medium text-bg shadow-card transition hover:bg-ink/85"
      >
        Compare plans <ArrowUpRight className="size-4" />
      </Link>
    </div>
  </div>
)

/** Small key/value row used in detail cards. */
export const KV = ({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-between gap-4 py-2.5 text-[13px]", className)}>
    <span className="text-muted">{label}</span>
    <span className="min-w-0 text-right font-medium">{children}</span>
  </div>
)

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
      "h-9 w-full appearance-none rounded-[10px] border border-line bg-surface bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 pl-3 text-sm text-ink shadow-card outline-none transition-colors hover:border-line-strong focus:border-ink/40 focus:ring-4 focus:ring-ink/5 disabled:opacity-60 dark:focus:border-accent/60",
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d8d86' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
      className
    )}
  >
    {children}
  </select>
)

export const origin = () => (typeof window === "undefined" ? "" : window.location.origin)
