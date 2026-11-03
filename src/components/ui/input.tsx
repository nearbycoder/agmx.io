import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react"
import { cn } from "~/lib/utils"

const base =
  "w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink shadow-card outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-ink/50 focus:ring-2 focus:ring-ink/8 dark:focus:border-accent/50 dark:focus:ring-accent/15 disabled:opacity-60"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-[34px]", invalid && "border-danger focus:border-danger focus:ring-danger/10", className)} {...props} />
  )
)
Input.displayName = "Input"

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-24 py-2 leading-relaxed", className)} {...props} />
))
Textarea.displayName = "Textarea"

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-[13px] font-medium text-ink-2", className)} {...props} />
)

export const Field = ({
  label,
  hint,
  error,
  children,
  htmlFor,
  className
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor?: string
  className?: string
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
  </div>
)

/** Input with a fixed suffix, e.g. the @domain part of an address. */
export const AddonInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode; prefix?: ReactNode }>(
  ({ className, suffix, prefix, ...props }, ref) => (
    <div className={cn("flex h-[34px] items-stretch overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-colors focus-within:border-ink/50 focus-within:ring-2 focus-within:ring-ink/8 dark:focus-within:border-accent/50 dark:focus-within:ring-accent/15", className)}>
      {prefix ? <span className="flex items-center border-r border-line bg-surface-2 px-3 text-sm text-muted">{prefix}</span> : null}
      <input ref={ref} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" {...props} />
      {suffix ? <span className="flex items-center border-l border-line bg-surface-2 px-3 font-mono text-[13px] text-muted">{suffix}</span> : null}
    </div>
  )
)
AddonInput.displayName = "AddonInput"
