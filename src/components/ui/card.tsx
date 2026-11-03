import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "~/lib/utils"

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-line bg-surface", className)} {...props} />
)

export const CardHeader = ({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-3.5", className)}>
    <div className="min-w-0">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
    </div>
    {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
  </div>
)

export const CardBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5", className)} {...props} />
