import { cva, type VariantProps } from "class-variance-authority"
import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "~/lib/utils"
import { Spinner } from "./spinner"

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13.5px] font-medium transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-bg hover:bg-ink/88",
        accent: "bg-accent text-accent-fg hover:brightness-95",
        secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-card",
        ghost: "text-ink-2 hover:bg-bg-subtle hover:text-ink",
        outline: "border border-line text-ink hover:bg-bg-subtle",
        danger: "bg-danger text-white hover:bg-danger/90",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "text-ink underline-offset-4 hover:underline px-0 h-auto"
      },
      size: {
        sm: "h-[30px] px-2.5 text-[13px]",
        md: "h-[34px] px-3",
        lg: "h-10 px-4 text-[14px]",
        icon: "size-[34px]",
        "icon-sm": "size-[30px]"
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
