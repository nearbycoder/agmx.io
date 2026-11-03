import { BRAND, glyphSvg } from "~/brand/mark"
import { cn, initials } from "~/lib/utils"

export const LogoMark = ({ className, title }: { className?: string; title?: string }) => (
  <svg
    viewBox="0 0 32 32"
    className={cn("size-7 shrink-0", className)}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    dangerouslySetInnerHTML={{
      __html: `<rect width="32" height="32" rx="8" fill="${BRAND.ink}"/><rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#fff" stroke-opacity="0.1"/>${glyphSvg()}`
    }}
  />
)

export const Logo = ({ className, mark = true }: { className?: string; mark?: boolean }) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    {mark ? <LogoMark /> : null}
    <span className="text-[17px] font-semibold tracking-[-0.04em]">agmx</span>
  </span>
)

/**
 * Agent colours: soft tints with a deep foreground in light mode, and muted
 * dark tints with a light foreground in dark mode. Distinct, never loud.
 */
export const AGENT_COLORS: Record<string, { bg: string; fg: string; ring: string; swatch: string }> = {
  lime: { bg: "bg-[#e4f0c9] dark:bg-[#26301a]", fg: "text-[#3d5410] dark:text-[#c5e08f]", ring: "ring-[#9fbf5a]/40", swatch: "#a9cf5c" },
  sky: { bg: "bg-[#dae9f5] dark:bg-[#14283a]", fg: "text-[#164466] dark:text-[#9fc9ea]", ring: "ring-[#6aa6d4]/40", swatch: "#6aa6d4" },
  violet: { bg: "bg-[#e6e0f5] dark:bg-[#231d36]", fg: "text-[#46327d] dark:text-[#c4b6ef]", ring: "ring-[#9a86d6]/40", swatch: "#9a86d6" },
  amber: { bg: "bg-[#f4e8cf] dark:bg-[#2f2614]", fg: "text-[#6b4b07] dark:text-[#e6c57c]", ring: "ring-[#d4a548]/40", swatch: "#d4a548" },
  rose: { bg: "bg-[#f4dee2] dark:bg-[#341c21]", fg: "text-[#7a2638] dark:text-[#eeaab7]", ring: "ring-[#d98495]/40", swatch: "#d98495" },
  teal: { bg: "bg-[#d5ece7] dark:bg-[#142d29]", fg: "text-[#13534a] dark:text-[#90d6c9]", ring: "ring-[#5fb3a4]/40", swatch: "#5fb3a4" },
  slate: { bg: "bg-[#e3e5e9] dark:bg-[#20242a]", fg: "text-[#344150] dark:text-[#b8c1cc]", ring: "ring-[#8a96a5]/40", swatch: "#8a96a5" }
}

export const AgentAvatar = ({ name, color, size = "md", className }: { name: string; color: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) => {
  const c = AGENT_COLORS[color] ?? AGENT_COLORS.lime!
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold tracking-tight",
        c.bg,
        c.fg,
        size === "xs" && "size-5 rounded-[5px] text-[9px]",
        size === "sm" && "size-6 rounded-md text-[10px]",
        size === "md" && "size-8 rounded-lg text-[12px]",
        size === "lg" && "size-11 rounded-[10px] text-[15px]",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

const SENDER_TONES = Object.values(AGENT_COLORS)
export const SenderAvatar = ({ name, address, className }: { name?: string | null; address: string; className?: string }) => {
  let hash = 0
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const tone = SENDER_TONES[hash % SENDER_TONES.length]!
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", tone.bg, tone.fg, className)}>
      {initials(name || address)}
    </span>
  )
}
