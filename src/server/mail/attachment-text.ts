import { extractText, getDocumentProxy } from "unpdf"

const MAX_CHARS = 20_000
const MAX_PDF_BYTES = 15 * 1024 * 1024

/**
 * Best-effort text from an attachment so agents can read PDFs and text files
 * without downloading them. Returns null when there's nothing useful (or on
 * failure); never throws.
 */
export const attachmentText = async (contentType: string, filename: string, content: Buffer): Promise<string | null> => {
  const type = contentType.toLowerCase()
  try {
    if (type === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      if (content.byteLength > MAX_PDF_BYTES) return null
      const pdf = await getDocumentProxy(new Uint8Array(content))
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          extractText(pdf, { mergePages: true }),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), 8_000)
          })
        ])
        const text = result ? (Array.isArray(result.text) ? result.text.join("\n") : result.text) : ""
        const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
        return clean ? clean.slice(0, MAX_CHARS) : null
      } finally {
        clearTimeout(timer)
        await (pdf as { destroy?: () => Promise<void> }).destroy?.().catch(() => {})
      }
    }
    if (/^text\/(plain|csv|markdown|tab-separated-values)|application\/(json|xml)/.test(type) && content.byteLength <= 512 * 1024) {
      const text = content.toString("utf8").trim()
      return text ? text.slice(0, MAX_CHARS) : null
    }
  } catch {
    return null
  }
  return null
}

export const isCalendar = (contentType: string, filename: string) =>
  contentType.toLowerCase().startsWith("text/calendar") || filename.toLowerCase().endsWith(".ics")
