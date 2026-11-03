import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "~/lib/utils"

/**
 * A titled block of a page. The title sits outside the content, so most
 * content needs only a single hairline panel (or none) — not a card with a
 * header bar.
 */
export const Section = ({
  title,
  description,
  action,
  children,
  className,
  id
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) => (
  <section id={id} className={cn("flex min-w-0 flex-col gap-3", className)}>
    <div className="flex min-h-[30px] items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
    {children}
  </section>
)

/** Hairline container. `divided` separates direct children with hairlines. */
export const Panel = ({ className, divided, ...props }: HTMLAttributes<HTMLDivElement> & { divided?: boolean }) => (
  <div className={cn("min-w-0 overflow-hidden rounded-xl border border-line bg-surface", divided && "divide-y divide-line", className)} {...props} />
)

export const PanelEmpty = ({ children }: { children: ReactNode }) => <div className="px-5 py-8 text-center text-[13px] text-muted">{children}</div>
