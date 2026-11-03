import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "../env"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { __agmxSql?: ReturnType<typeof postgres> }

export const sqlClient =
  globalForDb.__agmxSql ??
  postgres(env.databaseUrl, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    onnotice: () => {}
  })

if (!env.isProduction) globalForDb.__agmxSql = sqlClient

export const db = drizzle(sqlClient, { schema, casing: "snake_case" })
export type Database = typeof db
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type DbOrTx = Database | Transaction
