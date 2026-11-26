import { describe, expect, it } from "vitest"
import { parseAddress, parseAddressList, subjectKey } from "~/shared/address"
import { extract } from "~/server/mail/extract"
import { escapeHtml, makeSnippet } from "~/server/mail/compose"
import { verifySnsSignature } from "~/server/mail/sns"
import { buttonEmail } from "~/server/system-mail"
import { contentDisposition } from "~/server/services/Storage"
import { signPayload } from "~/server/services/Webhooks"
import { buildEmailSrcDoc } from "~/components/mail/email-body"
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

describe("encoding & system mail safety", () => {
  it("escapes HTML entities including single quotes", () => {
    expect(escapeHtml(`<script>alert('x' & "y")</script>`)).toBe("&lt;script&gt;alert(&#39;x&#39; &amp; &quot;y&quot;)&lt;/script&gt;")
  })

  it("escapes untrusted fields and blocks non-http links in transactional emails", () => {
    const mail = buttonEmail({
      heading: `Paused <b>"Scout"</b>`,
      body: `<img src=x onerror=alert(1)>`,
      cta: `Review 'now'`,
      url: "javascript:alert(1)",
      footer: `Footer <script>`
    })
    expect(mail.html).toContain("&lt;b&gt;&quot;Scout&quot;&lt;/b&gt;")
    expect(mail.html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(mail.html).toContain("Review &#39;now&#39;")
    expect(mail.html).not.toContain("javascript:")
  })

  it("formats RFC 5987 Content-Disposition safely", () => {
    const cd = contentDisposition(`report (Q4)'s "final"\r\n.pdf`, false)
    expect(cd).not.toMatch(/[\r\n]/)
    expect(cd).toContain(`attachment; filename="report (Q4)'s _final_ .pdf"`)
    expect(cd).toContain("filename*=UTF-8''report%20%28Q4%29%27s%20%22final%22%20.pdf")
  })

  it("rejects malformed or untrusted SNS cert URLs without throwing", async () => {
    const base = {
      Type: "Notification" as const,
      MessageId: "1",
      TopicArn: "arn:aws:sns:us-east-1:123:test",
      Message: "{}",
      Timestamp: new Date().toISOString(),
      SignatureVersion: "2" as const,
      Signature: "AAAA"
    }
    expect(await verifySnsSignature({ ...base, SigningCertURL: "not a url" })).toBe(false)
    expect(await verifySnsSignature({ ...base, SigningCertURL: "http://sns.us-east-1.amazonaws.com/cert.pem" })).toBe(false)
    expect(await verifySnsSignature({ ...base, SigningCertURL: "https://sns.us-east-1.amazonaws.com:8443/cert.pem" })).toBe(false)
    expect(await verifySnsSignature({ ...base, SigningCertURL: "https://evil.example/cert.pem" })).toBe(false)
  })

  it("hardens email iframe srcDoc against meta refresh, base hijacking and scripts", () => {
    const doc = buildEmailSrcDoc(
      `<meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><script>alert(1)</script><iframe src="https://evil.example"></iframe><p>Hi</p><img src="cid:logo1">`,
      [{ id: "att_1", filename: "logo.png", contentType: "image/png", size: 12, contentId: "logo1", inline: true, extractedText: null, downloadUrl: "/api/v1/messages/msg_1/attachments/att_1" }],
      false
    )
    expect(doc).toContain('http-equiv="Content-Security-Policy"')
    expect(doc).toContain('name="referrer" content="no-referrer"')
    expect(doc).not.toContain("evil.example")
    expect(doc).not.toContain("<script")
    expect(doc).not.toContain("<iframe")
    expect(doc).toContain('<img src="/api/v1/messages/msg_1/attachments/att_1?inline=1">')
  })
})
