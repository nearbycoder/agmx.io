import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/agmx"
const client = postgres(url, { max: 1, onnotice: () => {} })

const started = Date.now()
await migrate(drizzle(client), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
console.log(`✓ Database migrated in ${Date.now() - started}ms`)
await client.end()
