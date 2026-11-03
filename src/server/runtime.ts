import { Layer, ManagedRuntime } from "effect"
import { Account } from "./services/Account"
import { Agents } from "./services/Agents"
import { Db } from "./services/Db"
import { Domains } from "./services/Domains"
import { Events } from "./services/Events"
import { Inbound } from "./services/Inbound"
import { Mail } from "./services/Mail"
import { MailTransport } from "./services/MailTransport"
import { Quota } from "./services/Quota"
import { Signups } from "./services/Signups"
import { Storage } from "./services/Storage"
import { Webhooks } from "./services/Webhooks"

const Infra = Layer.mergeAll(Db.layer, MailTransport.layer, Events.layer, Storage.layer)
const QuotaLive = Quota.layer.pipe(Layer.provide(Infra))
const AgentsLive = Agents.layer.pipe(Layer.provide([Infra, QuotaLive]))
const WebhooksLive = Webhooks.layer.pipe(Layer.provide([Infra, AgentsLive]))
const MailLive = Mail.layer.pipe(Layer.provide([Infra, QuotaLive, AgentsLive, WebhooksLive]))

/** Every domain service, fully wired. Shared by the HTTP API, MCP and server functions. */
export const ServicesLive = Layer.mergeAll(
  Infra,
  QuotaLive,
  AgentsLive,
  WebhooksLive,
  MailLive,
  Inbound.layer.pipe(Layer.provide([Infra, MailLive])),
  Domains.layer.pipe(Layer.provide([Infra, QuotaLive])),
  Signups.layer.pipe(Layer.provide([Infra, AgentsLive])),
  Account.layer.pipe(Layer.provide([Infra, QuotaLive]))
)

/** Background fibers: webhook delivery and housekeeping. */
const WorkersLive = Layer.mergeAll(Webhooks.worker, Account.maintenance).pipe(Layer.provide(ServicesLive))

export const AppLayer = Layer.mergeAll(ServicesLive, WorkersLive)

type Globals = { __agmxMemoMap?: Layer.MemoMap; __agmxRuntime?: ManagedRuntime.ManagedRuntime<Layer.Success<typeof AppLayer>, never> }
const globals = globalThis as unknown as Globals

/** One memo map, so the HTTP handler and the runtime share service instances (and the event bus). */
export const memoMap = (globals.__agmxMemoMap ??= Layer.makeMemoMapUnsafe())

export const runtime = (globals.__agmxRuntime ??= ManagedRuntime.make(AppLayer, { memoMap }))
