import { createVerify } from "node:crypto"

export interface SnsEnvelope {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation"
  MessageId: string
  TopicArn: string
  Subject?: string
  Message: string
  Timestamp: string
  SignatureVersion: "1" | "2"
  Signature: string
  SigningCertURL: string
  SubscribeURL?: string
  Token?: string
}

const certCache = new Map<string, string>()
const MAX_CERT_CACHE = 64

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/

const fieldsFor = (message: SnsEnvelope): Array<keyof SnsEnvelope> =>
  message.Type === "Notification"
    ? ["Message", "MessageId", ...(message.Subject !== undefined ? (["Subject"] as const) : []), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]

/** Verifies an SNS message signature per the AWS documentation. */
export const verifySnsSignature = async (message: SnsEnvelope): Promise<boolean> => {
  let certUrl: URL
  try {
    certUrl = new URL(message.SigningCertURL)
  } catch {
    return false
  }
  if (
    certUrl.protocol !== "https:" ||
    certUrl.port !== "" ||
    certUrl.username !== "" ||
    certUrl.password !== "" ||
    !CERT_HOST.test(certUrl.hostname) ||
    !certUrl.pathname.endsWith(".pem")
  ) {
    return false
  }

  let cert = certCache.get(certUrl.href)
  if (!cert) {
    const response = await fetch(certUrl, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return false
    cert = await response.text()
    if (certCache.size >= MAX_CERT_CACHE) {
      const oldest = certCache.keys().next().value
      if (oldest !== undefined) certCache.delete(oldest)
    }
    certCache.set(certUrl.href, cert)
  }

  const payload = fieldsFor(message)
    .map((key) => `${key}\n${message[key] ?? ""}\n`)
    .join("")

  try {
    const verifier = createVerify(message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1")
    verifier.update(payload, "utf8")
    return verifier.verify(cert, message.Signature, "base64")
  } catch {
    return false
  }
}

export const isSnsEnvelope = (value: unknown): value is SnsEnvelope =>
  typeof value === "object" &&
  value !== null &&
  "Type" in value &&
  "Signature" in value &&
  "SigningCertURL" in value &&
  "TopicArn" in value
