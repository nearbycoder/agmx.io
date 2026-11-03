/**
 * The AGMX mark: a mailbox on a post with its flag raised (lime = new mail).
 * Single source of truth for the in-app logo, favicons, app icons and OG images.
 * Drawn on a 32×32 grid.
 */
export const BRAND = {
  ink: "#0c0c0d",
  paper: "#f7f7f3",
  lime: "#c8f560"
} as const

/** The mailbox glyph without a background, optically centred in a 32×32 box. */
export const glyphSvg = (ink: string = BRAND.ink, paper: string = BRAND.paper, lime: string = BRAND.lime) =>
  `<g transform="translate(-0.8 0.3)">` +
  `<path d="M5 20v-7.4A5.6 5.6 0 0 1 10.6 7h6.8A5.6 5.6 0 0 1 23 12.6V20Z" fill="${paper}"/>` +
  `<rect x="8.2" y="11.8" width="8.6" height="2.4" rx="1.2" fill="${ink}"/>` +
  `<rect x="12.5" y="20" width="3" height="6" rx=".4" fill="${paper}"/>` +
  `<path d="M23 14.2h2.2V7.4" fill="none" stroke="${lime}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<rect x="24.3" y="5.4" width="4.4" height="4" rx=".9" fill="${lime}"/>` +
  `</g>`

/**
 * Full mark as an SVG document.
 * - `tile`: rounded ink tile (favicons, in-app). `bleed`: square ink background (iOS/Android icons).
 * - `scale`: glyph size relative to the canvas (used for maskable safe zones).
 */
export const markSvg = ({ shape = "tile", scale = 1 }: { shape?: "tile" | "bleed"; scale?: number } = {}) => {
  const bg = shape === "tile" ? `<rect width="32" height="32" rx="8" fill="${BRAND.ink}"/>` : `<rect width="32" height="32" fill="${BRAND.ink}"/>`
  const offset = (32 - 32 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${bg}<g transform="translate(${offset} ${offset}) scale(${scale})">${glyphSvg()}</g></svg>`
}
