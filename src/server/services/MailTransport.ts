import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetAccountCommand,
  GetEmailIdentityCommand,
  SESv2Client,
  SendEmailCommand
} from "@aws-sdk/client-sesv2"
import { DescribeReceiptRuleCommand, SESClient, UpdateReceiptRuleCommand } from "@aws-sdk/client-ses"
import { Context, Effect, Layer, Schedule } from "effect"
import { DeliveryFailed } from "~/shared/api/errors"
import { env } from "../env"
import { newId, randomToken } from "../ids"

export interface SesAccountInfo {
  productionAccess: boolean
  sendingEnabled: boolean
  max24HourSend: number
  sentLast24Hours: number
  maxSendRate: number
  /** Where Amazon's review of the production-access request stands, if one was made. */
  reviewStatus: "PENDING" | "GRANTED" | "DENIED" | "FAILED" | null
  reviewCaseId: string | null
}

export class MailTransport extends Context.Service<MailTransport, {
  readonly name: "ses" | "log"
  /** Deliver a fully composed MIME message to the given envelope recipients. */
  send(input: { from: string; recipients: ReadonlyArray<string>; raw: Buffer }): Effect.Effect<{ providerMessageId: string }, DeliveryFailed>
  createDomainIdentity(domain: string): Effect.Effect<{ dkimTokens: Array<string> }, DeliveryFailed>
  getDomainIdentity(domain: string): Effect.Effect<{ dkimStatus: string; verifiedForSending: boolean; dkimTokens: Array<string> }, DeliveryFailed>
  deleteDomainIdentity(domain: string): Effect.Effect<void>
  /** Adds the domain to the configured SES receipt rule so inbound mail is accepted. */
  setReceiving(domain: string, enabled: boolean): Effect.Effect<void>
  account(): Effect.Effect<SesAccountInfo | null, DeliveryFailed>
}>()("agmx/services/MailTransport") {
  static readonly layerSes = Layer.sync(MailTransport)(() => {
    const credentials =
      env.aws.accessKeyId && env.aws.secretAccessKey
        ? { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey }
        : undefined
    const client = new SESv2Client({ region: env.aws.region, credentials })
    const classic = new SESClient({ region: env.aws.region, credentials })

    /**
     * `safeToRepeat: false` is for calls that aren't idempotent (sending mail): those are only
     * retried when SES refused the request outright, never after a timeout or dropped
     * connection, where the message may already have been accepted.
     */
    const call = <A>(label: string, f: () => Promise<A>, safeToRepeat = true) =>
      Effect.tryPromise({
        try: f,
        catch: (cause) => new DeliveryFailed({ message: `${label}: ${cause instanceof Error ? cause.message : String(cause)}` })
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential("200 millis"),
          times: 2,
          while: (error) =>
            (safeToRepeat ? /throttl|timeout|ECONNRESET|socket|503|500|Rate exceeded/i : /throttl|Rate exceeded|TooManyRequests/i).test(error.message)
        }),
        Effect.withSpan(`ses.${label}`)
      )

    return MailTransport.of({
      name: "ses",
      send: ({ from, recipients, raw }) =>
        call("SendEmail", () =>
          client.send(
            new SendEmailCommand({
              FromEmailAddress: from,
              Destination: { ToAddresses: [...recipients] },
              Content: { Raw: { Data: raw } },
              ConfigurationSetName: env.aws.configurationSet
            })
          ),
          false
        ).pipe(Effect.map((result) => ({ providerMessageId: result.MessageId ?? newId("ses") }))),

      createDomainIdentity: (domain) =>
        call("CreateEmailIdentity", () => client.send(new CreateEmailIdentityCommand({ EmailIdentity: domain }))).pipe(
          Effect.map((result) => ({ dkimTokens: result.DkimAttributes?.Tokens ?? [] }))
        ),

      getDomainIdentity: (domain) =>
        call("GetEmailIdentity", () => client.send(new GetEmailIdentityCommand({ EmailIdentity: domain }))).pipe(
          Effect.map((result) => ({
            dkimStatus: result.DkimAttributes?.Status ?? "PENDING",
            verifiedForSending: result.VerifiedForSendingStatus ?? false,
            dkimTokens: result.DkimAttributes?.Tokens ?? []
          }))
        ),

      deleteDomainIdentity: (domain) =>
        call("DeleteEmailIdentity", () => client.send(new DeleteEmailIdentityCommand({ EmailIdentity: domain }))).pipe(
          Effect.asVoid,
          Effect.catch((error) => Effect.logWarning("Failed to delete SES identity", error.message))
        ),

      setReceiving: (domain, enabled) =>
        Effect.gen(function* () {
          if (!env.aws.receiptRuleSet || !env.aws.receiptRule) return
          const ruleSet = env.aws.receiptRuleSet
          const described = yield* call("DescribeReceiptRule", () =>
            classic.send(new DescribeReceiptRuleCommand({ RuleSetName: ruleSet, RuleName: env.aws.receiptRule }))
          )
          const rule = described.Rule
          if (!rule) return
          // An empty recipient list means "all verified domains", so only edit an explicit list.
          if (!rule.Recipients || rule.Recipients.length === 0) return
          const recipients = new Set(rule.Recipients.map((r) => r.toLowerCase()))
          if (enabled) recipients.add(domain)
          else recipients.delete(domain)
          yield* call("UpdateReceiptRule", () =>
            classic.send(new UpdateReceiptRuleCommand({ RuleSetName: ruleSet, Rule: { ...rule, Recipients: [...recipients] } }))
          )
        }).pipe(Effect.catch((error) => Effect.logWarning("Failed to update SES receipt rule", error.message))),

      account: () =>
        call("GetAccount", () => client.send(new GetAccountCommand({}))).pipe(
          Effect.map((result) => ({
            productionAccess: result.ProductionAccessEnabled ?? false,
            sendingEnabled: result.SendingEnabled ?? false,
            max24HourSend: result.SendQuota?.Max24HourSend ?? 0,
            sentLast24Hours: result.SendQuota?.SentLast24Hours ?? 0,
            maxSendRate: result.SendQuota?.MaxSendRate ?? 0,
            reviewStatus: (result.Details?.ReviewDetails?.Status as SesAccountInfo["reviewStatus"] | undefined) ?? null,
            reviewCaseId: result.Details?.ReviewDetails?.CaseId ?? null
          }))
        )
    })
  })

  /** Development transport: prints mail to the console instead of sending it. */
  static readonly layerLog = Layer.sync(MailTransport)(() => {
    const identities = new Map<string, Array<string>>()
    return MailTransport.of({
      name: "log",
      send: ({ from, recipients, raw }) =>
        Effect.gen(function* () {
          const preview = raw.toString("utf8").split(/\r?\n\r?\n/)[0]
          yield* Effect.logInfo(`[mail:log] ${from} → ${recipients.join(", ")}\n${preview}`)
          return { providerMessageId: newId("log") }
        }),
      createDomainIdentity: (domain) =>
        Effect.sync(() => {
          const tokens = [randomToken(32).toLowerCase(), randomToken(32).toLowerCase(), randomToken(32).toLowerCase()]
          identities.set(domain, tokens)
          return { dkimTokens: tokens }
        }),
      getDomainIdentity: (domain) =>
        Effect.succeed({ dkimStatus: "SUCCESS", verifiedForSending: true, dkimTokens: identities.get(domain) ?? [] }),
      deleteDomainIdentity: (domain) => Effect.sync(() => void identities.delete(domain)),
      setReceiving: () => Effect.void,
      account: () => Effect.succeed(null)
    })
  })

  static readonly layer = env.mailTransport === "ses" ? MailTransport.layerSes : MailTransport.layerLog
}
