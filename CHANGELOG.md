# Changelog

0.1.1 and earlier: see [GitHub Releases](https://github.com/vespr-wallet/cardano_mcp/releases).

## Unreleased

- Dependencies: @modelcontextprotocol/sdk 1.32, fastify 5.12, @fastify/rate-limit 11, zod 4.6, plus minor updates. `npm audit --omit=dev` is now clean
- Tool input schemas no longer list defaulted fields (`currency`, `period`, `limit`) as required, and nullable output fields use the `"type": [..., "null"]` form (MCP SDK / zod schema generation)
- Docker: Node 24.22.3 (was 22.23.5), npm 11.21.2
- `engines.node` is now `>=22` (was `>=18`, which the dependencies no longer supported: `lru-cache` 11 needs 20 or 22+, `find-my-way` and `thread-stream` need 20+). Node 20 reached end of life in April 2026. The README now states the requirement for `npx` and source installs
- The server reports its real version (from `package.json`) in the MCP `initialize` response and the startup logs, instead of a hardcoded 0.1.0
- Fastify's request logging is turned off through `logController`, replacing the deprecated `disableRequestLogging` option (FSTDEP023 warning at startup)
- `@types/node` 24
