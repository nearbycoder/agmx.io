/**
 * The AGMX mark: an ink mailbox on a post, flag raised, on a lime tile.
 * Drawn on a 16×16 pixel grid so it stays crisp and legible as a 16px favicon;
 * the same geometry scales up for app icons and social cards.
 * Single source of truth for the in-app logo, favicons, app icons and OG images.
 */
export const BRAND = {
  ink: "#0c0c0d",
  paper: "#f7f7f3",
  lime: "#c8f560"
} as const

/** The mailbox glyph without a background, optically centred in a 16×16 box. */
export const glyphSvg = (ink: string = BRAND.ink, cutout: string = BRAND.lime) =>
  `<g transform="translate(-0.4 0.25)">` +
  `<path d="M1.5 10.5V6.5A3.5 3.5 0 0 1 5 3h5a3.5 3.5 0 0 1 3.5 3.5v4Z" fill="${ink}"/>` +
  `<rect x="3.5" y="6" width="5" height="1.6" rx=".8" fill="${cutout}"/>` +
  `<rect x="6" y="10.5" width="2" height="4" fill="${ink}"/>` +
  `<rect x="12" y="1" width="1.5" height="5.5" fill="${ink}"/>` +
  `<rect x="12" y="1" width="3.3" height="2.6" rx=".5" fill="${ink}"/>` +
  `</g>`

/** Glyph scaled about the centre of the 16×16 box (e.g. 0.88 adds breathing room at large sizes). */
export const scaledGlyph = (scale: number) => {
  const offset = (16 - 16 * scale) / 2
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${glyphSvg()}</g>`
}

/**
 * Full mark as an SVG document.
 * - `tile`: rounded lime tile (favicons, in-app). `bleed`: square lime background (iOS/Android icons).
 * - `scale`: glyph size relative to the canvas. Favicons use 1 for maximum legibility.
 */
export const markSvg = ({ shape = "tile", scale = 1 }: { shape?: "tile" | "bleed"; scale?: number } = {}) => {
  const bg = shape === "tile" ? `<rect width="16" height="16" rx="3.5" fill="${BRAND.lime}"/>` : `<rect width="16" height="16" fill="${BRAND.lime}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${bg}${scaledGlyph(scale)}</svg>`
}
