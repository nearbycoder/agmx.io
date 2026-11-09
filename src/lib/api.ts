import { Cause, Context, Effect, Exit, Layer, ManagedRuntime, Option, Schedule } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { AgmxApi } from "~/shared/api/Api"

/**
 * The dashboard talks to the exact same Effect HttpApi as agents do. The
 * generated client is fully typed from the shared API definition, so request
 * payloads, responses and every tagged error are checked end to end.
 */
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof AgmxApi>>()("agmx/client/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(AgmxApi, {
      baseUrl: typeof window === "undefined" ? "http://localhost:3100" : window.location.origin,
      transformClient: (client) => {
        // Only reads are retried. Repeating a write after a dropped connection could create a
        // second agent, key or draft when the first request did reach the server.
        const retrying = client.pipe(HttpClient.retryTransient({ schedule: Schedule.exponential("150 millis"), times: 2 }))
        return HttpClient.transform(client, (effect, request) => (request.method === "GET" ? retrying.execute(request) : effect))
      }
    })
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

const runtime = ManagedRuntime.make(ApiClient.layer)

export type Client = HttpApiClient.ForApi<typeof AgmxApi>

/** Error thrown to React Query, preserving the API's tagged error shape. */
export class ApiFailure extends Error {
  constructor(
    readonly tag: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = "ApiFailure"
  }
}

const toFailure = (error: unknown): ApiFailure => {
  if (error && typeof error === "object" && "_tag" in error) {
    const e = error as { _tag: string; message?: string }
    const friendly =
      e._tag === "HttpClientError" || e._tag === "TransportError"
        ? "Network error — check your connection and try again."
        : e._tag === "SchemaError"
          ? "Unexpected response from the server."
          : e.message || e._tag
    return new ApiFailure(e._tag, friendly, error as Record<string, unknown>)
  }
  return new ApiFailure("Unknown", error instanceof Error ? error.message : "Something went wrong")
}

/** Run a typed API call and return a promise (for React Query). */
export const api = async <A, E>(f: (client: Client) => Effect.Effect<A, E, never>): Promise<A> => {
  const exit = await runtime.runPromiseExit(Effect.flatMap(Effect.service(ApiClient), f))
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.findErrorOption(exit.cause)
  throw toFailure(Option.isSome(failure) ? failure.value : Cause.squash(exit.cause))
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong")
