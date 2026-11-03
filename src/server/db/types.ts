import type { InferSelectModel } from "drizzle-orm"
import type * as s from "./schema"

export type UserRow = InferSelectModel<typeof s.user>
export type AgentRow = InferSelectModel<typeof s.agents>
export type InboxRow = InferSelectModel<typeof s.inboxes>
export type DomainRow = InferSelectModel<typeof s.domains>
export type ThreadRow = InferSelectModel<typeof s.threads>
export type MessageRow = InferSelectModel<typeof s.messages>
export type AttachmentRow = InferSelectModel<typeof s.attachments>
export type ApiKeyRow = InferSelectModel<typeof s.apiKeys>
export type WebhookDeliveryRow = InferSelectModel<typeof s.webhookDeliveries>
export type SignupRow = InferSelectModel<typeof s.agentSignups>
