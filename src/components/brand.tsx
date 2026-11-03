import { cn, initials } from "~/lib/utils"

export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
    <rect width="32" height="32" rx="8" fill="#0c0c0d" />
    <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.12" />
    <path d="M7.5 11.5 16 17.5l8.5-6" fill="none" stroke="#c8f560" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="7" y="20.5" width="7" height="2.6" rx="1.3" fill="#c8f560" />
    <rect x="16" y="20.5" width="9" height="2.6" rx="1.3" fill="#f7f7f3" opacity="0.35" />
  </svg>
)

export const Logo = ({ className, mark = true }: { className?: string; mark?: boolean }) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    {mark ? <LogoMark /> : null}
    <span className="text-[17px] font-semibold tracking-[-0.04em]">agmx</span>
  </span>
)

export const AGENT_COLORS: Record<string, { bg: string; fg: string; ring: string }> = {
  lime: { bg: "bg-[#c8f560]", fg: "text-[#1d2a00]", ring: "ring-[#c8f560]/40" },
  sky: { bg: "bg-[#7dd3fc]", fg: "text-[#062b3d]", ring: "ring-[#7dd3fc]/40" },
  violet: { bg: "bg-[#c4b5fd]", fg: "text-[#2a1663]", ring: "ring-[#c4b5fd]/40" },
  amber: { bg: "bg-[#fcd34d]", fg: "text-[#3d2a00]", ring: "ring-[#fcd34d]/40" },
  rose: { bg: "bg-[#fda4af]", fg: "text-[#4a0d17]", ring: "ring-[#fda4af]/40" },
  teal: { bg: "bg-[#5eead4]", fg: "text-[#023a33]", ring: "ring-[#5eead4]/40" },
  slate: { bg: "bg-[#cbd5e1]", fg: "text-[#1e293b]", ring: "ring-[#cbd5e1]/40" }
}

export const AgentAvatar = ({ name, color, size = "md", className }: { name: string; color: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) => {
  const c = AGENT_COLORS[color] ?? AGENT_COLORS.lime!
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[28%] font-semibold tracking-tight",
        c.bg,
        c.fg,
        size === "xs" && "size-5 text-[9px]",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-[12px]",
        size === "lg" && "size-12 text-[17px]",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

const PALETTE = ["#fca5a5", "#fdba74", "#fcd34d", "#bef264", "#86efac", "#5eead4", "#7dd3fc", "#a5b4fc", "#c4b5fd", "#f0abfc", "#fda4af"]
export const SenderAvatar = ({ name, address, className }: { name?: string | null; address: string; className?: string }) => {
  let hash = 0
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-black/75", className)}
      style={{ backgroundColor: PALETTE[hash % PALETTE.length] }}
    >
      {initials(name || address)}
    </span>
  )
}
