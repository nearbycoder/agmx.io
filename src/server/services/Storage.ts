import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Context, Effect, Layer } from "effect"
import { env } from "../env"

/** RFC 5987 Content-Disposition value with a safe ASCII fallback. */
export const contentDisposition = (filename: string, inline: boolean) => {
  const clean = filename.replace(/[\r\n\0]+/g, " ").trim() || "attachment"
  const fallback = clean.replace(/["\\]/g, "_").replace(/[^\x20-\x7e]/g, "_")
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Attachment byte storage. With the `s3` driver files live in an S3-compatible
 * bucket and are downloaded through short-lived signed URLs, so large files
 * never pass through (or bloat) the app or the database. The `db` driver keeps
 * bytes in Postgres for zero-config local development.
 */
export class Storage extends Context.Service<Storage, {
  readonly driver: "s3" | "db"
  /** Store bytes. Returns the object key, or null when the caller should keep bytes in the database. */
  put(key: string, body: Buffer, contentType: string): Effect.Effect<string | null>
  get(key: string): Effect.Effect<Buffer>
  remove(keys: ReadonlyArray<string>): Effect.Effect<void>
  /** A signed GET URL valid for a few minutes, with download headers baked in. */
  signedUrl(key: string, options: { filename: string; contentType: string; inline: boolean }): Effect.Effect<string>
}>()("agmx/services/Storage") {
  static readonly layerDb = Layer.succeed(Storage)({
    driver: "db",
    put: () => Effect.succeed(null),
    get: () => Effect.die(new Error("Database storage has no object keys")),
    remove: () => Effect.void,
    signedUrl: () => Effect.die(new Error("Database storage has no object keys"))
  })

  static readonly layerS3 = Layer.sync(Storage)(() => {
    const bucket = env.storage.bucket
    if (!bucket) throw new Error("ATTACHMENT_STORAGE=s3 requires STORAGE_BUCKET")
    const makeClient = (endpoint: string | undefined) =>
      new S3Client({
        region: env.storage.endpoint ? (env.storage.forcePathStyle ? env.storage.region : "auto") : env.storage.region,
        endpoint,
        // MinIO/RustFS and other self-hosted servers usually need bucket-in-path URLs.
        forcePathStyle: env.storage.forcePathStyle,
        credentials:
          env.storage.accessKeyId && env.storage.secretAccessKey
            ? { accessKeyId: env.storage.accessKeyId, secretAccessKey: env.storage.secretAccessKey }
            : undefined
      })
    const client = makeClient(env.storage.endpoint)
    // Signed URLs are opened by the browser, which may reach storage at a different address
    // than the app does (e.g. http://localhost:9000 vs http://s3:9000 inside Docker).
    const signer = env.storage.publicEndpoint ? makeClient(env.storage.publicEndpoint) : client
    const attempt = <A>(label: string, f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: (cause) => cause }).pipe(
        Effect.retry({ times: 2 }),
        Effect.orDie,
        Effect.withSpan(`storage.${label}`)
      )
    return Storage.of({
      driver: "s3",
      put: (key, body, contentType) =>
        attempt("put", () => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))).pipe(
          Effect.as(key)
        ),
      get: (key) =>
        attempt("get", async () => {
          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
          return Buffer.from(await object.Body!.transformToByteArray())
        }),
      remove: (keys) =>
        keys.length === 0
          ? Effect.void
          : Effect.forEach(
              Array.from({ length: Math.ceil(keys.length / 1000) }, (_, i) => keys.slice(i * 1000, i * 1000 + 1000)),
              (chunk) =>
                attempt("remove", () =>
                  client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }))
                ),
              { discard: true }
            ),
      signedUrl: (key, { filename, contentType, inline }) =>
        attempt("sign", () =>
          getSignedUrl(
            signer,
            new GetObjectCommand({
              Bucket: bucket,
              Key: key,
              ResponseContentType: contentType,
              ResponseContentDisposition: contentDisposition(filename, inline),
              ResponseCacheControl: "private, max-age=300"
            }),
            { expiresIn: 300 }
          )
        )
    })
  })

  static readonly layer = env.storage.driver === "s3" ? Storage.layerS3 : Storage.layerDb
}
