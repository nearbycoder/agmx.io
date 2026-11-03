/**
 * Regenerates every brand asset from src/brand/mark.ts:
 *   favicon.svg, favicon.ico, apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png,
 *   email-logo.png and the Open Graph cards in public/og/.
 *
 * Usage: CHROME_PATH=/path/to/chrome bun run brand
 * (any Chromium works; it is only used to rasterise SVG/HTML)
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { BRAND, glyphSvg, markSvg } from "../src/brand/mark"

const out = join(import.meta.dirname, "..", "public")
mkdirSync(join(out, "og"), { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome-stable" })
const page = await browser.newPage({ deviceScaleFactor: 1 })

const renderSvg = async (svg: string, size: number) => {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`)
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/** ICO container with embedded PNGs (supported by every modern browser and Windows). */
const ico = (images: Array<{ size: number; png: Buffer }>) => {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

const tile = markSvg({ shape: "tile" })
writeFileSync(join(out, "favicon.svg"), tile + "\n")
writeFileSync(join(out, "favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await renderSvg(tile, size) })))))
writeFileSync(join(out, "apple-touch-icon.png"), await renderSvg(markSvg({ shape: "bleed", scale: 0.8 }), 180))
writeFileSync(join(out, "icon-192.png"), await renderSvg(tile, 192))
writeFileSync(join(out, "icon-512.png"), await renderSvg(tile, 512))
writeFileSync(join(out, "icon-maskable-512.png"), await renderSvg(markSvg({ shape: "bleed", scale: 0.62 }), 512))
writeFileSync(join(out, "email-logo.png"), await renderSvg(tile, 96))
console.log("✓ icons")

// ---------------------------------------------------------------------------
// Open Graph cards (1200×630)
// ---------------------------------------------------------------------------

const mark = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${BRAND.ink}"/>${glyphSvg()}</svg>`

const card = (opts: { title: string; subtitle: string; visual: string }) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:${BRAND.paper};font-family:Geist,sans-serif;color:${BRAND.ink};overflow:hidden}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-weight:600;font-size:34px;letter-spacing:-.05em}
.main{flex:1;display:flex;align-items:center;gap:56px}
.copy{flex:1;min-width:0}
h1{margin:0;font-size:72px;line-height:1.02;font-weight:600;letter-spacing:-.045em}
p{margin:22px 0 0;font-size:27px;line-height:1.4;color:#6b6b65;max-width:560px}
.foot{display:flex;justify-content:space-between;align-items:center;font-family:'Geist Mono',monospace;font-size:19px;color:#8d8d86}
.panel{width:430px;flex-shrink:0;background:#0d0d0f;border-radius:22px;color:#e6e6e1;font-family:'Geist Mono',monospace;font-size:18px;line-height:1.75;padding:26px 28px;box-shadow:0 30px 60px -30px rgba(0,0,0,.45)}
.muted{color:rgba(255,255,255,.42)}.lime{color:${BRAND.lime}}.white{color:#fff}
.chip{display:inline-block;background:${BRAND.lime};color:${BRAND.ink};border-radius:8px;padding:2px 12px;font-weight:600;letter-spacing:.06em}
.row{display:flex;justify-content:space-between}
.mail{background:#fff;color:${BRAND.ink};border-radius:22px;padding:24px 26px;width:430px;flex-shrink:0;font-size:20px;box-shadow:0 30px 60px -30px rgba(0,0,0,.35);border:1px solid #e6e6df}
.mail .from{display:flex;align-items:center;gap:12px;font-weight:600}
.mail .av{width:40px;height:40px;border-radius:999px;background:${BRAND.ink};color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px}
.mail .subj{margin-top:14px;font-weight:500}.mail .snip{margin-top:4px;color:#6b6b65;font-size:18px}
.mail .ext{margin-top:20px;padding-top:18px;border-top:1px solid #efefea;display:flex;align-items:center;gap:12px;font-size:16px;color:#6b6b65}
.mail .code{font-family:'Geist Mono',monospace;background:#eefbd0;color:#3c5600;border:1px solid #d6f08f;border-radius:8px;padding:3px 12px;font-size:22px;font-weight:600;letter-spacing:.08em}
</style></head><body><div class="wrap">
<div class="brand">${mark(52)}agmx</div>
<div class="main"><div class="copy"><h1>${opts.title}</h1><p>${opts.subtitle}</p></div>${opts.visual}</div>
<div class="foot"><span>agmx.io</span><span>REST · MCP · Webhooks</span></div>
</div></body></html>`

const cards: Record<string, Parameters<typeof card>[0]> = {
  home: {
    title: "Email inboxes for AI agents",
    subtitle: "Real addresses your agents sign up with, read codes from and reply on.",
    visual: `<div class="mail"><div class="from"><div class="av">GH</div><div>GitHub<div style="font-weight:400;font-size:15px;color:#8d8d86">to scout@bot.agmx.io</div></div></div>
      <div class="subj">Please verify your device</div><div class="snip">Your verification code expires in 15 minutes.</div>
      <div class="ext">Extracted <span class="code">482913</span></div></div>`
  },
  agents: {
    title: "Give your agent an inbox",
    subtitle: "One API call to sign up. You approve it, it gets a scoped key and a real address.",
    visual: `<div class="panel"><div><span class="lime">$</span> POST /api/v1/signup</div><div class="muted">→ code KQ7M-3XPA</div><div class="muted">· waiting for approval…</div>
      <div><span class="lime">✓ approved</span></div><div class="white">scout@bot.agmx.io</div><div style="height:10px"></div>
      <div><span class="lime">$</span> GET /messages/wait</div><div class="muted">→ codes: <span class="chip">482913</span></div></div>`
  },
  pricing: {
    title: "Simple, per-fleet pricing",
    subtitle: "Pay for agents, inboxes and sends. Free to self-host.",
    visual: `<div class="panel" style="font-size:20px;line-height:2.3">
      <div class="row"><span class="white">Starter</span><span>$0</span></div>
      <div class="row"><span class="white">Pro</span><span class="lime">$19</span></div>
      <div class="row"><span class="white">Scale</span><span>$99</span></div>
      <div class="row muted" style="font-size:16px"><span>Self-host</span><span>MIT</span></div></div>`
  },
  docs: {
    title: "AGMX documentation",
    subtitle: "REST API, MCP server, webhooks, custom domains and self-hosting.",
    visual: `<div class="panel" style="font-size:17px"><div><span class="lime">curl</span> /api/v1/messages \\</div>
      <div class="muted">&nbsp;&nbsp;-H "Authorization: Bearer …" \\</div><div class="muted">&nbsp;&nbsp;-d '{</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;"to": <span class="lime">"ada@example.com"</span>,</div><div>&nbsp;&nbsp;&nbsp;&nbsp;"subject": <span class="lime">"Hi"</span>,</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;"text": <span class="lime">"Hello from Scout"</span></div><div class="muted">&nbsp;&nbsp;}'</div></div>`
  }
}

await page.setViewportSize({ width: 1200, height: 630 })
for (const [name, opts] of Object.entries(cards)) {
  await page.setContent(card(opts), { waitUntil: "networkidle" })
  await page.evaluate(() => document.fonts.ready)
  writeFileSync(join(out, "og", `${name}.png`), await page.screenshot({ type: "png" }))
}
console.log("✓ og cards:", Object.keys(cards).join(", "))
await browser.close()
