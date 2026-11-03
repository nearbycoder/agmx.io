/**
 * Writes packages/sdk/openapi.json straight from the Effect HttpApi definition,
 * so the SDK types can never drift from the API. The SDK package then turns it
 * into TypeScript types (`npm run gen` in packages/sdk).
 *
 * Usage: bun run sdk:types
 */
import { execSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { OpenApi } from "effect/http-api"
import { AgmxApi } from "../src/shared/api/Api"

const sdk = join(import.meta.dirname, "..", "packages", "sdk")
writeFileSync(join(sdk, "openapi.json"), JSON.stringify(OpenApi.fromApi(AgmxApi), null, 2) + "\n")
console.log("✓ wrote packages/sdk/openapi.json")
if (!process.argv.includes("--spec-only")) {
  execSync("npm run gen", { cwd: sdk, stdio: "inherit" })
}
