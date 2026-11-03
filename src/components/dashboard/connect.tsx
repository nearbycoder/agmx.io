import { origin } from "./common"

export const mcpConfig = (key: string) =>
  JSON.stringify(
    {
      mcpServers: {
        agmx: {
          type: "http",
          url: `${origin()}/mcp`,
          headers: { Authorization: `Bearer ${key}` }
        }
      }
    },
    null,
    2
  )

export const connectSnippets = (key: string) => [
  {
    label: "MCP config",
    lang: "json" as const,
    code: mcpConfig(key)
  },
  {
    label: "Claude Code",
    lang: "bash" as const,
    code: `claude mcp add --transport http agmx ${origin()}/mcp \\\n  --header "Authorization: Bearer ${key}"`
  },
  {
    label: "curl",
    lang: "bash" as const,
    code: `# Who am I?\ncurl ${origin()}/api/v1/me \\\n  -H "Authorization: Bearer ${key}"\n\n# Wait for the next email (verification codes land in extracted.codes)\ncurl "${origin()}/api/v1/messages/wait?timeout=30" \\\n  -H "Authorization: Bearer ${key}"`
  },
  {
    label: "Send",
    lang: "bash" as const,
    code: `curl -X POST ${origin()}/api/v1/messages \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"to":"someone@example.com","subject":"Hello","text":"Sent by my agent"}'`
  }
]
