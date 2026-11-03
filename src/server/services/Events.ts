import { Context, Effect, Layer, PubSub, type Scope } from "effect"

export interface MailEvent {
  readonly type: "message.received" | "message.sent" | "message.updated" | "message.deleted" | "message.status"
  readonly userId: string
  readonly inboxId: string
  readonly messageId: string
  readonly threadId: string
}

/** In-process event bus that powers long-polling and the live dashboard. */
export class Events extends Context.Service<Events, {
  publish(event: MailEvent): Effect.Effect<void>
  readonly subscribe: Effect.Effect<PubSub.Subscription<MailEvent>, never, Scope.Scope>
}>()("agmx/services/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const pubsub = yield* PubSub.sliding<MailEvent>(1024)
      return Events.of({
        publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
        subscribe: PubSub.subscribe(pubsub)
      })
    })
  )
}
