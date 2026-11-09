import * as SwitchPrimitive from "@radix-ui/react-switch"
import { Check, Copy } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { cn } from "~/lib/utils"

export const Switch = ({
  checked,
  onCheckedChange,
  disabled,
  id,
  "aria-label": ariaLabel
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  id?: string
  "aria-label"?: string
}) => (
  <SwitchPrimitive.Root
    id={id}
    aria-label={ariaLabel}
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line bg-bg-subtle transition-colors data-[state=checked]:border-ink data-[state=checked]:bg-ink disabled:opacity-50 dark:data-[state=checked]:border-accent dark:data-[state=checked]:bg-accent"
  >
    <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-surface shadow-card transition-transform data-[state=checked]:translate-x-[17px] dark:data-[state=checked]:bg-ink" />
  </SwitchPrimitive.Root>
)

export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface px-1 font-mono text-[11px] text-muted shadow-card", className)}>
    {children}
  </kbd>
)

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton rounded-lg", className)} />

export const copyText = async (value: string, label = "Copied to clipboard") => {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(label)
    return true
  } catch {
    toast.error("Couldn't access the clipboard")
    return false
  }
}

export const CopyButton = ({ value, className, label, size = "sm" }: { value: string; className?: string; label?: string; size?: "sm" | "xs" }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        if (await copyText(value, label)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted transition hover:bg-bg-subtle hover:text-ink",
        size === "sm" ? "size-7" : "size-6",
        className
      )}
      aria-label="Copy"
    >
      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export const EmptyState = ({ icon, title, description, action, className }: { icon: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
    <div className="mb-3 text-faint [&_svg]:size-5">{icon}</div>
    <h3 className="text-[14px] font-semibold">{title}</h3>
    {description ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p> : null}
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
)

export const Meter = ({ value, max, className }: { value: number; max: number | null; className?: string }) => {
  if (max === null) return null
  const percent = max === 0 ? 100 : Math.min(100, (value / max) * 100)
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-bg-subtle", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", percent >= 90 ? "bg-danger" : percent >= 75 ? "bg-warn" : "bg-ink/80 dark:bg-ink/70")}
        style={{ width: `${Math.max(percent, value > 0 ? 3 : 0)}%` }}
      />
    </div>
  )
}
