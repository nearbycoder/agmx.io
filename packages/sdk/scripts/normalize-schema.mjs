// Effect's JSON codec documents non-finite numbers as strings; the API only ever
// returns finite numbers, so present plain `number` to SDK users.
import { readFileSync, writeFileSync } from "node:fs"
const file = new URL("../src/schema.ts", import.meta.url)
const src = readFileSync(file, "utf8").replaceAll(' | ("Infinity" | "-Infinity" | "NaN")', "")
writeFileSync(file, src)
console.log("✓ normalized number types")
