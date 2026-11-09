import * as AlertPrimitive from "@radix-ui/react-alert-dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "~/lib/utils"
import { Button } from "./button"

export const Dialog = DialogPrimitive.Root

export const DialogContent = ({
  title,
  description,
  children,
  className,
  footer,
  dismissible = true
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
  footer?: ReactNode
  /**
   * False while the dialog shows something that can't be shown again (a new API key):
   * a stray click outside or Esc no longer closes it. The buttons still do.
   */
  dismissible?: boolean
}) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
    <DialogPrimitive.Content
      onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
      onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
      onOpenAutoFocus={(e) => {
        // Keep a field's autoFocus; otherwise focus the dialog itself rather than its close button.
        const root = e.currentTarget as HTMLElement
        if (root.contains(document.activeElement)) return
        e.preventDefault()
        root.focus()
      }}
      className={cn(
        "fixed top-[12vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-pop",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
        <div>
          <DialogPrimitive.Title className="text-base font-semibold tracking-tight">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close className="-mr-2 rounded-lg p-1.5 text-muted transition hover:bg-bg-subtle hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>
      <div className="scrollbar-thin overflow-y-auto px-6 py-4">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">{footer}</div> : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
)

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
  loading
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  tone?: "danger" | "primary"
  onConfirm: () => void
  loading?: boolean
}) => (
  <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <AlertPrimitive.Portal>
      <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <AlertPrimitive.Content className="fixed top-[20vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-line bg-surface p-6 shadow-pop data-[state=open]:animate-pop">
        <AlertPrimitive.Title className="text-base font-semibold">{title}</AlertPrimitive.Title>
        <AlertPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted">{description}</AlertPrimitive.Description>
        <div className="mt-6 flex justify-end gap-2">
          <AlertPrimitive.Cancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertPrimitive.Cancel>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={loading}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </AlertPrimitive.Content>
    </AlertPrimitive.Portal>
  </AlertPrimitive.Root>
)
