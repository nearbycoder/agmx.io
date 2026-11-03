import { parse, type HTMLElement, NodeType } from "node-html-parser"
import type { Security } from "../db/schema"
import { htmlToText } from "./compose"

/**
 * Prompt-injection and hidden-content analysis for inbound mail.
 *
 * Email is untrusted input that agents feed straight into a model. Attackers
 * hide instructions where a human reviewer won't see them (white-on-white text,
 * zero-size fonts, display:none, HTML comments, invisible Unicode) and phrase
 * them as orders to the model. This module:
 *   1. builds `safeText` — only what a human would actually see, with invisible
 *      characters removed — which is what agents should read, and
 *   2. scores the message and explains why, so agents and humans can decide.
 *
 * Heuristic by design: fast, deterministic and dependency-light. It reduces risk;
 * it does not make untrusted text trustworthy.
 */

// Zero-width, bidi controls, BOM, word joiner and Unicode "tag" characters (ASCII smuggling).
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]|[\u{E0000}-\u{E007F}]/gu

const INSTRUCTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your)\b[^.\n]{0,30}\b(instructions?|prompts?|rules|directions|guidelines)\b/i, "asks the reader to ignore its instructions"],
  [/\b(you are now|from now on,? you|act as|pretend to be|roleplay as)\b/i, "tries to assign the reader a new role"],
  [/\b(system prompt|system message|developer message|hidden instructions?|new instructions?)\b/i, "references system or hidden instructions"],
  [/<\|?(im_start|im_end|system|assistant)\|?>|\[\/?INST\]|^\s*(system|assistant)\s*:/im, "contains chat-template control tokens"],
  [/\b(do not|don't|never)\b[^.\n]{0,25}\b(tell|inform|mention|reveal|alert|notify)\b[^.\n]{0,25}\b(the )?(user|human|owner|operator)\b/i, "asks the reader to hide something from its human"],
  [/\b(forward|send|email|reply with|share|paste|upload|post)\b[^.\n]{0,50}\b(api[ _-]?keys?|passwords?|credentials|secrets?|tokens?|private keys?|session|cookies?|2fa|one[- ]time codes?|verification codes?)\b/i, "asks the reader to send credentials or codes"],
  [/\b(forward|send|copy)\b[^.\n]{0,30}\b(all|every|each|your)\b[^.\n]{0,20}\b(emails?|messages?|inbox|conversations?|files?)\b/i, "asks the reader to forward mail or data"],
  [/\b(call|invoke|use|run|execute)\b[^.\n]{0,20}\b(the )?(tool|function|command|shell|terminal|send_email|reply_to_email|forward_email)\b/i, "tells the reader to run tools"],
  [/\b(transfer|wire|send)\b[^.\n]{0,30}\$?\b\d[\d,.]*\s?(usd|dollars|btc|eth|usdc)?\b[^.\n]{0,30}\b(to|into)\b[^.\n]{0,30}\b(account|wallet|iban)\b/i, "requests a payment or transfer"]
]

const HIDDEN_STYLE: Array<[RegExp, string]> = [
  [/display\s*:\s*none/i, "display:none"],
  [/visibility\s*:\s*hidden/i, "visibility:hidden"],
  [/opacity\s*:\s*0(\.0+)?\s*(;|$)/i, "opacity:0"],
  [/font-size\s*:\s*(0|0?\.\d+|1)(px|pt|em|rem)?\s*(;|$)/i, "zero-size font"],
  [/(max-)?height\s*:\s*0(px)?\s*(;|$)[^]*overflow\s*:\s*hidden|overflow\s*:\s*hidden[^]*(max-)?height\s*:\s*0(px)?\s*(;|$)/i, "collapsed box"],
  [/(left|top|text-indent)\s*:\s*-\d{3,}(px|em)/i, "positioned off-screen"],
  [/clip\s*:\s*rect\(\s*0/i, "clipped to nothing"]
]

const WHITE = /^(#fff(fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255(\s*,\s*1(\.0+)?)?\s*\))$/i

const colorOf = (style: string, prop: "color" | "background(-color)?") => {
  const match = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, "i"))
  return match ? match[1]!.trim().toLowerCase() : null
}

/** Why an element is invisible to a human, or null if it isn't. */
const hiddenReason = (el: HTMLElement, hiddenClasses: Set<string>): string | null => {
  if (el.hasAttribute("hidden")) return "hidden attribute"
  const style = el.getAttribute("style") ?? ""
  for (const [re, label] of HIDDEN_STYLE) if (re.test(style)) return label
  const color = colorOf(style, "color")
  if (color && WHITE.test(color)) {
    const bg = colorOf(style, "background(-color)?")
    if (!bg || WHITE.test(bg)) return "white-on-white text"
  }
  if (color && color === colorOf(style, "background(-color)?")) return "text coloured like its background"
  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
  if (classes.some((c) => hiddenClasses.has(c))) return "hidden by stylesheet"
  return null
}

/** Class names a `<style>` block hides with display:none / visibility:hidden / font-size:0. */
const hiddenClassesFrom = (root: HTMLElement) => {
  const hidden = new Set<string>()
  for (const styleTag of root.querySelectorAll("style")) {
    for (const rule of styleTag.text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const body = rule[2]!
      if (!HIDDEN_STYLE.some(([re]) => re.test(body))) continue
      for (const selector of rule[1]!.split(",")) {
        const cls = selector.trim().match(/^\.([\w-]+)$/)
        if (cls) hidden.add(cls[1]!)
      }
    }
  }
  return hidden
}

export interface SecurityResult {
  security: Security
  safeText: string
  /** HTML with hidden elements and comments removed (used for link extraction). */
  visibleHtml: string | null
}

export const analyzeSecurity = (subject: string, text: string | null, html: string | null): SecurityResult => {
  const reasons = new Set<string>()
  let score = 0
  let hiddenText = ""
  let visibleHtml: string | null = null

  if (html) {
    const root = parse(html, { comment: true, blockTextElements: { script: true, style: true, noscript: true } })
    const hiddenClasses = hiddenClassesFrom(root)

    // Comments can carry instructions that some HTML-to-text converters keep.
    const walkComments = (node: HTMLElement) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === NodeType.COMMENT_NODE) {
          const content = child.rawText.trim()
          if (content.length > 20) hiddenText += `\n${content}`
          child.remove()
        } else if (child.nodeType === NodeType.ELEMENT_NODE) walkComments(child as HTMLElement)
      }
    }
    walkComments(root)

    for (const el of root.querySelectorAll("*")) {
      if (!el.parentNode) continue
      const reason = hiddenReason(el, hiddenClasses)
      if (!reason) continue
      const content = el.text.replace(/\s+/g, " ").trim()
      // Tracking pixels and empty spacers are normal; only flag hidden *text*.
      if (content.length >= 12) {
        hiddenText += `\n${content}`
        reasons.add(`hidden text (${reason})`)
      }
      el.remove()
    }
    for (const el of root.querySelectorAll("script, noscript, template")) el.remove()
    visibleHtml = root.toString()
  }

  const visible = (text && text.trim() ? text : visibleHtml ? htmlToText(visibleHtml) : "") ?? ""
  const invisibleCount = (visible.match(INVISIBLE) ?? []).length + (subject.match(INVISIBLE) ?? []).length
  // Characters that differ between the plain-text part and what's visible in HTML can also smuggle text.
  const safeText = visible.replace(INVISIBLE, "").replace(/\n{3,}/g, "\n\n").trim()

  if (invisibleCount >= 3) {
    reasons.add(`${invisibleCount} invisible Unicode characters`)
    score += invisibleCount >= 10 ? 3 : 2
  }
  if (/[\u{E0000}-\u{E007F}]/u.test(visible)) {
    reasons.add("Unicode tag characters (text smuggling)")
    score += 4
  }

  const hiddenContent = hiddenText.trim().length > 0
  if (hiddenContent) score += 1

  for (const [re, label] of INSTRUCTION_PATTERNS) {
    if (hiddenContent && re.test(hiddenText)) {
      reasons.add(`hidden content ${label}`)
      score += 5
    } else if (re.test(`${subject}\n${safeText}`)) {
      reasons.add(`message ${label}`)
      score += 2
    }
  }

  const risk: Security["risk"] = score >= 5 ? "high" : score >= 2 ? "medium" : "low"
  return { security: { risk, score, reasons: [...reasons].slice(0, 8), hiddenContent }, safeText, visibleHtml }
}
