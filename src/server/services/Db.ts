import { Cause, Context, Effect, Exit, Layer } from "effect"
import { db, type DbOrTx, type Transaction } from "../db/client"

/** The transaction (if any) that the current fiber is running inside. */
export const CurrentTx = Context.Reference<DbOrTx | null>("agmx/db/CurrentTx", { defaultValue: () => null })

class Rollback {
  constructor(readonly exit: Exit.Exit<unknown, unknown>) {}
}

/** Postgres unique_violation, surfaced so services can map it to `Conflict`. */
export const isUniqueViolation = (cause: unknown): boolean => {
  let current: unknown = cause
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current !== null && "code" in current && (current as { code: unknown }).code === "23505") {
      return true
    }
    current = typeof current === "object" && current !== null && "cause" in current ? (current as { cause: unknown }).cause : undefined
  }
  return false
}

export class Db extends Context.Service<Db, {
  /** Run a Drizzle query. Database failures are defects (500s). Uses the ambient transaction if one is open. */
  readonly use: <A>(f: (db: DbOrTx) => Promise<A>) => Effect.Effect<A>
  /** Like `use`, but unique-constraint violations are returned as `null` so callers can raise `Conflict`. */
  readonly useUnique: <A>(f: (db: DbOrTx) => Promise<A>) => Effect.Effect<A | null>
  /**
   * Run an effect inside a database transaction. Any failure, defect or
   * interruption rolls the transaction back. Nested calls join the outer
   * transaction.
   */
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}>()("agmx/services/Db") {
  static readonly layer = Layer.succeed(Db)({
    use: <A>(f: (db: DbOrTx) => Promise<A>) =>
      Effect.gen(function* () {
        const tx = yield* CurrentTx
        return yield* Effect.tryPromise({ try: () => f(tx ?? db), catch: (cause) => cause }).pipe(Effect.orDie)
      }),
    useUnique: <A>(f: (db: DbOrTx) => Promise<A>) =>
      Effect.gen(function* () {
        const tx = yield* CurrentTx
        // Inside a transaction a failed statement aborts the whole transaction, so run it in a
        // savepoint: the violation rolls back to there and the outer transaction carries on.
        const run = tx && tx !== db ? () => (tx as Transaction).transaction((savepoint) => f(savepoint)) : () => f(db)
        return yield* Effect.tryPromise({ try: run, catch: (cause) => cause }).pipe(
          Effect.catch((cause) => (isUniqueViolation(cause) ? Effect.succeed(null) : Effect.die(cause)))
        )
      }),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const existing = yield* CurrentTx
        if (existing && existing !== db) return yield* effect
        const context = yield* Effect.context<R>()
        const exit = yield* Effect.promise(() =>
          db
            .transaction(async (tx) => {
              const result = await Effect.runPromiseExit(
                effect.pipe(Effect.provideService(CurrentTx, tx), Effect.provideContext(context))
              )
              if (Exit.isFailure(result)) throw new Rollback(result)
              return result
            })
            .catch((error: unknown) =>
              error instanceof Rollback ? (error.exit as Exit.Exit<A, E>) : Exit.failCause(Cause.die(error))
            )
        )
        return yield* exit
      })
  })
}
