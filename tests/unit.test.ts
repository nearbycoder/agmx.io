import { describe, expect, it } from "vitest"
import { parseAddress, parseAddressList, subjectKey } from "~/shared/address"
import { extract } from "~/server/mail/extract"
import { makeSnippet } from "~/server/mail/compose"
import { signPayload } from "~/server/services/Webhooks"
import { getPlan } from "~/shared/plans"
import { createHmac } from "node:crypto"

describe("addresses", () => {
  it("parses named and bare addresses", () => {
    expect(parseAddress("Ada Lovelace <ADA@Example.com>")).toEqual({ name: "Ada Lovelace", address: "ada@example.com" })
    expect(parseAddress('"Doe, Jane" <jane@x.io>')).toEqual({ name: "Doe, Jane", address: "jane@x.io" })
    expect(parseAddress("bob@x.io")).toEqual({ name: null, address: "bob@x.io" })
    expect(parseAddress("not an email")).toBeNull()
  })
  it("splits lists respecting quotes and dedupes", () => {
    const { valid, invalid } = parseAddressList('"Doe, Jane" <jane@x.io>, bob@x.io; bob@x.io, nope')
    expect(valid.map((v) => v.address)).toEqual(["jane@x.io", "bob@x.io"])
    expect(invalid).toEqual(["nope"])
  })
  it("normalises reply subjects", () => {
    expect(subjectKey("Re: RE: Fwd: Hello there")).toBe("hello there")
  })
})

describe("extraction", () => {
  it("finds verification codes near keywords", () => {
    const r = extract("Your GitHub launch code", "Here is your verification code: 482913\nIt expires in 15 minutes.", null)
    expect(r.codes[0]).toBe("482913")
  })
  it("handles split codes and ignores years/prices", () => {
    const r = extract("Sign in", "Your login code is 123 456. © 2026 Acme. Total $1999", null)
    expect(r.codes).toContain("123456")
    expect(r.codes).not.toContain("2026")
  })
  it("finds alphanumeric codes", () => {
    expect(extract("Confirm", "Your confirmation code: KQ7M-3XPA", null).codes).toContain("KQ7M-3XPA")
  })
  it("classifies links", () => {
    const r = extract(
      "Welcome",
      null,
      '<a href="https://x.io/unsubscribe?u=1">Unsubscribe</a><a href="https://x.io/verify?t=abc&amp;u=2">Verify email</a><a href="https://x.io/logo.png">img</a>'
    )
    expect(r.links[0]).toMatchObject({ kind: "verify", url: "https://x.io/verify?t=abc&u=2" })
    expect(r.links.at(-1)?.kind).toBe("unsubscribe")
    expect(r.links.some((l) => l.url.endsWith(".png"))).toBe(false)
  })
})

describe("snippets", () => {
  it("drops quoted history", () => {
    expect(makeSnippet("Sounds good!\n\nOn Tue, 3 Nov 2026 10:00, Bob <b@x.io> wrote:\n> hi")).toBe("Sounds good!")
  })
})

describe("webhook signatures", () => {
  it("matches the documented scheme", () => {
    const sig = signPayload("whsec_test", '{"a":1}', 1700000000)
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex")
    expect(sig).toBe(`t=1700000000,v1=${expected}`)
  })
})

describe("plans", () => {
  it("falls back to free", () => {
    expect(getPlan("nope").id).toBe("free")
    expect(getPlan("pro").monthlySends).toBe(10_000)
  })
})
