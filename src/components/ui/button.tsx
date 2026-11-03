import { cva, type VariantProps } from "class-variance-authority"
import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "~/lib/utils"
import { Spinner } from "./spinner"

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-ink text-bg hover:bg-ink/85 shadow-card",
        accent: "bg-accent text-accent-fg hover:brightness-95 shadow-card",
        secondary: "bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong shadow-card",
        ghost: "text-ink-2 hover:bg-bg-subtle hover:text-ink",
        outline: "border border-line text-ink hover:bg-bg-subtle",
        danger: "bg-danger text-white hover:bg-danger/90 shadow-card",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "text-ink underline-offset-4 hover:underline px-0 h-auto"
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-[15px] rounded-xl",
        icon: "size-9",
        "icon-sm": "size-8 rounded-lg"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading ? <Spinner className="size-4" /> : null}
    {children}
  </button>
))
Button.displayName = "Button"
