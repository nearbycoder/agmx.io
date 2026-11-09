import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"
import { cn } from "~/lib/utils"

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-bg-subtle text-ink-2 border border-line",
      accent: "bg-accent-soft text-accent-ink border border-accent/40",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      danger: "bg-danger-soft text-danger",
      info: "bg-info-soft text-info",
      solid: "bg-ink text-bg"
    }
  },
  defaultVariants: { tone: "neutral" }
})

export const Badge = ({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
)
