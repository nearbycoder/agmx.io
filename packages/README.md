# AGMX client packages

| Package | Registry name | Description |
| --- | --- | --- |
| [`sdk/`](sdk) | npm `agmx` | TypeScript SDK (types generated from the OpenAPI spec) |
| [`cli/`](cli) | npm `agmx-cli` | `agmx` command-line client and stdio MCP bridge |
| [`python/`](python) | PyPI `agmx` | Python SDK (stdlib only) |

These are independent of the app build. Regenerate SDK types after API changes with `bun run sdk:types` from the repo root.
