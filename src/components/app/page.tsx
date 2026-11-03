import type { ReactNode } from "react"
import { cn } from "~/lib/utils"

export const PageHeader = ({
  title,
  description,
  actions,
  eyebrow,
  className
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  className?: string
}) => (
  <div className={cn("flex flex-col gap-4 pb-7 sm:flex-row sm:items-start sm:justify-between", className)}>
    <div className="min-w-0">
      {eyebrow ? <div className="mb-2 text-[12px] font-medium text-muted">{eyebrow}</div> : null}
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      {description ? <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
)

export const Page = ({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) => (
  <div className={cn("mx-auto w-full px-6 py-8 sm:px-8 lg:py-10", wide ? "max-w-7xl" : "max-w-6xl", className)}>{children}</div>
)
