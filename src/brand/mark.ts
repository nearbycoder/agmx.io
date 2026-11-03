/**
 * The AGMX mark: an ink mailbox on a post, flag raised, on a lime tile.
 *
 * Drawn on a 16×16 grid. Two levels of detail share one geometry:
 * - `full`: lit tile, dimensional mailbox (front face, top highlight, slot glint,
 *   ground shadow). For app icons, social cards and the in-app logo.
 * - `simple`: same silhouette without fine lighting, which turns to mush at
 *   16–32px. For favicons.
 *
 * Single source of truth for the in-app logo, favicons, app icons and OG images.
 */
export const BRAND = {
  ink: "#0c0c0d",
  paper: "#f7f7f3",
  lime: "#c8f560"
} as const

export type Detail = "full" | "simple"

const BODY = "M1.5 10.5V6.5A3.5 3.5 0 0 1 5 3h5a3.5 3.5 0 0 1 3.5 3.5v4Z"
/** The rounded front face (left end) of the mailbox. */
const FRONT = "M1.5 10.5V6.5A3.5 3.5 0 0 1 5 3a3.5 3.5 0 0 1 3.5 3.5v4Z"
const TOP_HIGHLIGHT = "M2.2 6.3A2.8 2.8 0 0 1 5 3.6h5a2.9 2.9 0 0 1 2.4 1.4"

/** Gradient and filter definitions; `id` must be unique per SVG on a page. */
const defs = (id: string, detail: Detail) =>
  `<defs>` +
  `<linearGradient id="${id}-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2fd93"/><stop offset="1" stop-color="#aedd3c"/></linearGradient>` +
  `<linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
  (detail === "full"
    ? `<linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2e33"/><stop offset="1" stop-color="#0a0a0c"/></linearGradient>` +
      `<linearGradient id="${id}-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3d43"/><stop offset="1" stop-color="#16161a"/></linearGradient>` +
      `<radialGradient id="${id}-ground" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2d4400" stop-opacity=".42"/><stop offset="1" stop-color="#2d4400" stop-opacity="0"/></radialGradient>` +
      `<filter id="${id}-lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy=".5" stdDeviation=".5" flood-color="#2d4400" flood-opacity=".38"/></filter>`
    : "") +
  `</defs>`

const glyph = (id: string, detail: Detail) => {
  if (detail === "simple") {
    return (
      `<path d="${BODY}" fill="${BRAND.ink}"/>` +
      `<rect x="3.5" y="6" width="5" height="1.6" rx=".8" fill="${BRAND.lime}"/>` +
      `<rect x="6" y="10.5" width="2" height="4" fill="${BRAND.ink}"/>` +
      `<rect x="12" y="1" width="1.5" height="5.5" fill="${BRAND.ink}"/>` +
      `<rect x="12" y="1" width="3.3" height="2.6" rx=".5" fill="${BRAND.ink}"/>`
    )
  }
  return (
    `<ellipse cx="7" cy="14.55" rx="3.4" ry=".75" fill="url(#${id}-ground)"/>` +
    `<g filter="url(#${id}-lift)">` +
    `<rect x="6" y="10" width="2" height="4.5" rx=".25" fill="url(#${id}-body)"/>` +
    `<path d="${BODY}" fill="url(#${id}-body)"/>` +
    `<path d="${FRONT}" fill="url(#${id}-front)"/>` +
    `<rect x="2.4" y="6" width="5.2" height="1.5" rx=".75" fill="#0a0a0c"/>` +
    `<rect x="2.4" y="6.9" width="5.2" height=".6" rx=".3" fill="${BRAND.lime}" opacity=".9"/>` +
    // Pole and flag drawn as one shape so there is no seam where they meet.
    `<path d="M12.4 1.2h2.7a.5.5 0 0 1 .5.5v1.6a.5.5 0 0 1-.5.5h-1.7v2.6a.3.3 0 0 1-.3.3h-.8a.3.3 0 0 1-.3-.3V1.6a.4.4 0 0 1 .4-.4Z" fill="url(#${id}-body)"/>` +
    `<path d="${TOP_HIGHLIGHT}" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width=".4" stroke-linecap="round"/>` +
    `</g>`
  )
}

/**
 * The mark's inner SVG markup (for a 16×16 viewBox).
 * - `shape`: `tile` (rounded, favicons and in-app) or `bleed` (square, iOS/Android icons).
 * - `scale`: glyph size relative to the canvas; favicons use ~1 for legibility.
 */
export const markMarkup = ({
  id = "agmx",
  shape = "tile",
  scale = 0.88,
  detail = "full"
}: { id?: string; shape?: "tile" | "bleed"; scale?: number; detail?: Detail } = {}) => {
  const offset = (16 - 16 * scale) / 2
  const tile =
    shape === "tile"
      ? `<rect width="16" height="16" rx="3.5" fill="url(#${id}-tile)"/><rect x=".25" y=".25" width="15.5" height="15.5" rx="3.3" fill="none" stroke="url(#${id}-rim)" stroke-width=".5"/>`
      : `<rect width="16" height="16" fill="url(#${id}-tile)"/>`
  return (
    defs(id, detail) +
    tile +
    `<g transform="translate(${offset} ${offset}) scale(${scale})"><g transform="translate(-0.4 0.25)">${glyph(id, detail)}</g></g>`
  )
}

/** Full mark as a standalone SVG document. */
export const markSvg = (options: Parameters<typeof markMarkup>[0] = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${markMarkup(options)}</svg>`
