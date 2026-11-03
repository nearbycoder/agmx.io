import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/** Time-sortable, URL-safe identifier with a resource prefix, e.g. `msg_01j9…`. */
export const newId = (prefix: string): string => {
  let time = Date.now()
  let timePart = ""
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time % 32] + timePart
    time = Math.floor(time / 32)
  }
  const bytes = randomBytes(16)
  let randomPart = ""
  for (let i = 0; i < 16; i++) randomPart += CROCKFORD[bytes[i]! % 32]
  return `${prefix}_${timePart}${randomPart}`
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
export const randomToken = (length = 32): string => {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) out += BASE62[bytes[i]! % 62]
  return out
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
/** Human-friendly code such as `KQ7M-3XPA`, used for agent sign-up approval. */
export const userCode = () => {
  const bytes = randomBytes(8)
  let out = ""
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
    if (i === 3) out += "-"
  }
  return out
}
