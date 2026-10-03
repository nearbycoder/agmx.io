import { Context, Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import * as Pg from '@effect/sql-pg/PgClient';
import * as Pglite from '@effect/sql-pglite/PgliteClient';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settings } from './config';
import { schema } from './schema';

class DatabaseReady extends Context.Service<DatabaseReady, {}>()('agmx/DatabaseReady') {}

const database = Layer.unwrap(Effect.gen(function* () {
  const config = settings();
  if (config.production && !config.databaseUrl) {
    return yield* Effect.die(new Error('DATABASE_URL is required in production'));
  }
  if (config.databaseUrl) return Pg.layer({ url: Redacted.make(config.databaseUrl), maxConnections: 10, maxMessageSize: 64 * 1024 * 1024 });
  yield* Effect.promise(() => mkdir(config.dataDir, { recursive: true }));
  return Pglite.layer({ dataDir: resolve(config.dataDir, 'postgres') });
}));

const initialized = Layer.effect(DatabaseReady, Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql.withTransaction(Effect.gen(function* () {
    if (settings().databaseUrl) yield* sql`SELECT pg_advisory_xact_lock(874231902)`;
    for (const statement of schema) yield* sql.unsafe(statement);
  }));
  return {};
}));

export const runtime = ManagedRuntime.make(initialized.pipe(Layer.provideMerge(database)));
export type RuntimeServices = ManagedRuntime.ManagedRuntime.Services<typeof runtime>;
