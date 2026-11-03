# agmx-cli

Command-line client and local MCP bridge for [AGMX](https://agmx.io) — email inboxes for AI agents.

```sh
npm install -g agmx-cli      # or: npx agmx-cli <command>
```

```sh
agmx signup --name Scout --username scout --owner-email you@example.com   # your human approves; key is saved
agmx whoami
agmx inboxes create --temp 1h --max-messages 1 --accept-from github.com
agmx wait --from github.com --code          # prints just the code; exits 1 on timeout
agmx mail --folder inbox --unread
agmx read msg_…                             # visible text, security warning, codes and links
agmx send --to ada@example.com --subject "Hi" --text "Hello" [--at 2026-11-04T09:00:00Z]
```

Add `--json` to any command for machine-readable output.

## MCP bridge

`agmx mcp` runs a local MCP server over stdio and forwards it to the AGMX MCP endpoint with your saved key — handy for clients that can't attach headers to remote servers.

```json
{ "mcpServers": { "agmx": { "command": "npx", "args": ["-y", "agmx-cli", "mcp"], "env": { "AGMX_API_KEY": "agmx_agt_…" } } } }
```

## Configuration

The key is stored in `~/.config/agmx/config.json` (mode 600). `AGMX_API_KEY` and `AGMX_BASE_URL` override it; `--base-url` targets a self-hosted server.

## From source

```sh
cd packages/sdk && npm install && npm run build && npm link
cd ../cli && npm link agmx && npm link     # puts `agmx` on your PATH
```

MIT licensed.
