import { Dialog, DialogContent } from "~/components/ui/dialog"
import { Kbd } from "~/components/ui/misc"
import { modKey } from "~/lib/utils"

export const SHORTCUTS: Array<{ group: string; items: Array<[string[], string]> }> = [
  {
    group: "Navigate",
    items: [
      [["j"], "Next message"],
      [["k"], "Previous message"],
      [["o"], "Open message"],
      [["esc"], "Close conversation"],
      [["/"], "Search"],
      [["⌘", "K"], "Command palette"]
    ]
  },
  {
    group: "Act",
    items: [
      [["c"], "Compose"],
      [["r"], "Reply"],
      [["a"], "Reply all"],
      [["f"], "Forward"],
      [["e"], "Archive"],
      [["s"], "Star"],
      [["u"], "Mark unread"],
      [["#"], "Delete"]
    ]
  },
  {
    group: "Compose",
    items: [
      [["⌘", "↵"], "Send"],
      [["⌘", "S"], "Save draft"],
      [["esc"], "Close composer"]
    ]
  }
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" description="Work through your agents' mail without the mouse." className="max-w-xl">
        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUTS.map((section) => (
            <div key={section.group} className={section.group === "Act" ? "sm:row-span-2" : undefined}>
              <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">{section.group}</div>
              <div className="flex flex-col">
                {section.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between border-b border-line/60 py-1.5 text-[13px] last:border-0">
                    <span className="text-ink-2">{label}</span>
                    <span className="flex gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k === "⌘" ? modKey() : k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
