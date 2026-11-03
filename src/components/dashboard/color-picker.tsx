import { Check } from "lucide-react"
import { AGENT_COLORS } from "~/components/brand"
import { cn } from "~/lib/utils"

export type AgentColorName = "lime" | "sky" | "violet" | "amber" | "rose" | "teal" | "slate"
export const COLOR_NAMES = Object.keys(AGENT_COLORS) as Array<AgentColorName>

export const ColorPicker = ({ value, onChange }: { value: string; onChange: (c: AgentColorName) => void }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Agent color">
    {COLOR_NAMES.map((name) => {
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
            "flex size-7 items-center justify-center rounded-full transition",
            selected ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "hover:scale-110"
          )}
          style={{ backgroundColor: AGENT_COLORS[name]!.swatch }}
        >
          {selected ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
        </button>
      )
    })}
  </div>
)
