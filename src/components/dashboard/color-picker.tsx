import { Check } from "lucide-react"
import { AGENT_COLORS } from "~/components/brand"
import { cn } from "~/lib/utils"

export type AgentColorName = "lime" | "sky" | "violet" | "amber" | "rose" | "teal" | "slate"
export const COLOR_NAMES = Object.keys(AGENT_COLORS) as Array<AgentColorName>

export const ColorPicker = ({ value, onChange }: { value: string; onChange: (c: AgentColorName) => void }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Agent color">
    {COLOR_NAMES.map((name) => {
      const c = AGENT_COLORS[name]!
      const selected = value === name
      return (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn(
            "flex size-8 items-center justify-center rounded-[28%] transition-all",
            c.bg,
            c.fg,
            selected ? "scale-105 ring-2 ring-ink ring-offset-2 ring-offset-surface" : "opacity-80 hover:opacity-100"
          )}
        >
          {selected ? <Check className="size-4" /> : null}
        </button>
      )
    })}
  </div>
)
