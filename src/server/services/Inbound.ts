import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Context, Effect, Layer } from "effect"
import { suppressions } from "../db/schema"
import { env } from "../env"
import { newId } from "../ids"
import { isSnsEnvelope, verifySnsSignature, type SnsEnvelope } from "../mail/sns"
import { Db } from "./Db"
import { Mail } from "./Mail"

interface SesReceipt {
  recipients: Array<string>
  spamVerdict?: { status: string }
  virusVerdict?: { status: string }
  spfVerdict?: { status: string }
  dkimVerdict?: { status: string }
  dmarcVerdict?: { status: string }
  action: { type: "SNS" | "S3" | string; encoding?: "BASE64" | "UTF8"; bucketName?: string; objectKey?: string }
}

interface SesNotification {
  notificationType?: "Received" | "Bounce" | "Complaint" | "Delivery"
  eventType?: "Bounce" | "Complaint" | "Delivery" | "Send" | "Reject" | "DeliveryDelay"
  mail: { messageId: string; destination?: Array<string> }
  receipt?: SesReceipt
  content?: string
  bounce?: { bounceType: string; bounceSubType: string; bouncedRecipients: Array<{ emailAddress: string; diagnosticCode?: string }> }
  complaint?: { complainedRecipients: Array<{ emailAddress: string }>; complaintFeedbackType?: string }
  delivery?: { recipients: Array<string> }
}

/**
 * Handles everything SES pushes to us through SNS: inbound mail (receipt
 * rules) and delivery feedback (bounces, complaints, deliveries) for mail we
 * sent. Every request is signature-verified before it is trusted.
 */
export class Inbound extends Context.Service<Inbound, {
  handleSns(body: string): Effect.Effect<{ status: number; message: string }>
}>()("agmx/services/Inbound") {
  static readonly layer = Layer.effect(
    Inbound,
    Effect.gen(function* () {
      const mail = yield* Mail
      const db = yield* Db
      const s3 = new S3Client({
        region: env.aws.region,
        credentials:
          env.aws.accessKeyId && env.aws.secretAccessKey
            ? { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey }
            : undefined
      })

      const suppress = (address: string, reason: "bounce" | "complaint", detail: string | null) =>
        db.use((d) =>
          d
            .insert(suppressions)
            .values({ id: newId("sup"), address: address.toLowerCase(), reason, detail })
            .onConflictDoNothing()
        )

      const handleNotification = Effect.fn("Inbound.handleNotification")(function* (note: SesNotification) {
        const type = note.notificationType ?? note.eventType
        if (type === "Received" && note.receipt) {
          const receipt = note.receipt
          let raw: Buffer
          if (receipt.action.type === "S3" && receipt.action.bucketName && receipt.action.objectKey) {
            const object = yield* Effect.tryPromise(() =>
              s3.send(new GetObjectCommand({ Bucket: receipt.action.bucketName, Key: receipt.action.objectKey }))
            ).pipe(Effect.orDie)
            raw = Buffer.from(yield* Effect.promise(() => object.Body!.transformToByteArray()))
          } else if (note.content) {
            raw = receipt.action.encoding === "BASE64" ? Buffer.from(note.content, "base64") : Buffer.from(note.content, "utf8")
          } else {
            return { status: 400, message: "Notification has no content. Use an SNS action with content or an S3 action." }
          }
          const result = yield* mail.ingestRaw(raw, receipt.recipients, {
            spam: receipt.spamVerdict?.status ?? null,
            virus: receipt.virusVerdict?.status ?? null,
            spf: receipt.spfVerdict?.status ?? null,
            dkim: receipt.dkimVerdict?.status ?? null,
            dmarc: receipt.dmarcVerdict?.status ?? null
          })
          // The message is safely stored now; drop the raw copy instead of paying to keep it.
          if (receipt.action.type === "S3" && receipt.action.bucketName && receipt.action.objectKey) {
            const { bucketName, objectKey } = receipt.action
            yield* Effect.tryPromise(() => s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey }))).pipe(
              Effect.catch((error) => Effect.logWarning(`Could not delete raw inbound object ${objectKey}`, error))
            )
          }
          yield* Effect.logInfo(
            `Inbound mail ${note.mail.messageId} (${raw.byteLength} bytes) for ${receipt.recipients.join(", ")} → delivered to ${result.delivered} inbox(es)`
          )
          return { status: 200, message: `Delivered to ${result.delivered} inbox(es)` }
        }
        if (type === "Bounce" && note.bounce) {
          const detail = `${note.bounce.bounceType}/${note.bounce.bounceSubType}: ${note.bounce.bouncedRecipients
            .map((r) => `${r.emailAddress}${r.diagnosticCode ? ` (${r.diagnosticCode})` : ""}`)
            .join(", ")}`
          if (note.bounce.bounceType === "Permanent") {
            for (const r of note.bounce.bouncedRecipients) yield* suppress(r.emailAddress, "bounce", detail.slice(0, 500))
          }
          yield* mail.applyDeliveryEvent(note.mail.messageId, "bounced", detail.slice(0, 1000))
          return { status: 200, message: "Bounce recorded" }
        }
        if (type === "Complaint" && note.complaint) {
          for (const r of note.complaint.complainedRecipients) yield* suppress(r.emailAddress, "complaint", note.complaint.complaintFeedbackType ?? null)
          yield* mail.applyDeliveryEvent(note.mail.messageId, "complained", note.complaint.complaintFeedbackType ?? "complaint")
          return { status: 200, message: "Complaint recorded" }
        }
        if (type === "Delivery") {
          yield* mail.applyDeliveryEvent(note.mail.messageId, "delivered", null)
          return { status: 200, message: "Delivery recorded" }
        }
        return { status: 200, message: `Ignored ${type ?? "unknown"} notification` }
      })

      return Inbound.of({
        handleSns: (body) =>
          Effect.gen(function* () {
            let envelope: SnsEnvelope
            try {
              const parsed: unknown = JSON.parse(body)
              if (!isSnsEnvelope(parsed)) return { status: 400, message: "Not an SNS message" }
              envelope = parsed
            } catch {
              return { status: 400, message: "Invalid JSON" }
            }
            // A valid SNS signature only proves the message came from *some* AWS topic, so the topic
            // itself must be one of ours. Outside production an empty list accepts any topic.
            if (env.aws.inboundTopicArns.length === 0 && env.isProduction) {
              yield* Effect.logError(`Rejected SNS message from ${envelope.TopicArn}: set SES_INBOUND_TOPIC_ARNS to the topic ARNs this server should accept.`)
              return { status: 403, message: "SES_INBOUND_TOPIC_ARNS is not configured" }
            }
            if (env.aws.inboundTopicArns.length && !env.aws.inboundTopicArns.includes(envelope.TopicArn.toLowerCase())) {
              return { status: 403, message: "Topic not allowed" }
            }
            const valid = yield* Effect.promise(() => verifySnsSignature(envelope).catch(() => false))
            if (!valid) return { status: 403, message: "Invalid SNS signature" }

            if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
              const url = new URL(envelope.SubscribeURL)
              if (!/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) return { status: 400, message: "Bad SubscribeURL" }
              yield* Effect.promise(() => fetch(url).then((r) => r.text()))
              yield* Effect.logInfo(`Confirmed SNS subscription for ${envelope.TopicArn}`)
              return { status: 200, message: "Subscription confirmed" }
            }
            if (envelope.Type !== "Notification") return { status: 200, message: "Ignored" }
            let note: SesNotification
            try {
              note = JSON.parse(envelope.Message) as SesNotification
            } catch {
              return { status: 400, message: "Notification message is not JSON" }
            }
            return yield* handleNotification(note)
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logError("Inbound SNS handling failed", cause).pipe(Effect.as({ status: 500, message: "Internal error" }))
            )
          )
      })
    })
  )
}
