import * as Menu from "@radix-ui/react-dropdown-menu"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"
import { cn } from "~/lib/utils"

export const DropdownMenu = Menu.Root
export const DropdownTrigger = Menu.Trigger

export const DropdownContent = ({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) => (
  <Menu.Portal>
    <Menu.Content
      align={align}
      sideOffset={6}
      className={cn("z-50 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-pop", className)}
    >
      {children}
    </Menu.Content>
  </Menu.Portal>
)

export const DropdownItem = ({
  children,
  onSelect,
  danger,
  icon,
  shortcut,
  disabled
}: {
  children: ReactNode
  onSelect?: () => void
  danger?: boolean
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
}) => (
  <Menu.Item
    disabled={disabled}
    onSelect={onSelect}
    className={cn(
      "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-bg-subtle [&_svg]:size-4 [&_svg]:text-muted",
      danger && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger"
    )}
  >
    {icon}
    <span className="flex-1">{children}</span>
    {shortcut ? <span className="font-mono text-[11px] text-faint">{shortcut}</span> : null}
  </Menu.Item>
)

export const DropdownSeparator = () => <Menu.Separator className="my-1 h-px bg-line" />
export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <Menu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">{children}</Menu.Label>
)

export const TooltipProvider = TooltipPrimitive.Provider

export const Tooltip = ({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) => (
  <TooltipPrimitive.Root delayDuration={250}>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        sideOffset={6}
        className="z-50 rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-bg shadow-pop data-[state=delayed-open]:animate-fade-in"
      >
        {content}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
)
