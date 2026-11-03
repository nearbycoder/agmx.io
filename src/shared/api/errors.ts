import { Schema } from "effect"

/**
 * Typed API errors. Every error carries a human-readable `message` plus a
 * stable `_tag` that agents can branch on. Status codes are encoded directly on
 * the error so the HTTP layer, OpenAPI docs and generated clients agree.
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 }
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { message: Schema.String },
  { httpApiStatus: 403 }
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { message: Schema.String, resource: Schema.String },
  { httpApiStatus: 404 }
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}

export class InvalidRequest extends Schema.TaggedError<InvalidRequest>()(
  "InvalidRequest",
  { message: Schema.String, field: Schema.optional(Schema.String) },
  { httpApiStatus: 422 }
) {}

export class QuotaExceeded extends Schema.TaggedError<QuotaExceeded>()(
  "QuotaExceeded",
  {
    message: Schema.String,
    limit: Schema.Literals(["agents", "inboxes_per_agent", "monthly_sends", "daily_sends", "custom_domains", "message_size"]),
    max: Schema.Number,
    used: Schema.Number
  },
  { httpApiStatus: 402 }
) {}

export class DeliveryFailed extends Schema.TaggedError<DeliveryFailed>()(
  "DeliveryFailed",
  { message: Schema.String },
  { httpApiStatus: 502 }
) {}

export type ApiError =
  | Unauthorized
  | Forbidden
  | NotFound
  | Conflict
  | InvalidRequest
  | QuotaExceeded
  | DeliveryFailed
