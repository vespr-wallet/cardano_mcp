# Changelog

0.1.1 and earlier: see [GitHub Releases](https://github.com/vespr-wallet/cardano_mcp/releases).

## Unreleased

- Dependencies: @modelcontextprotocol/sdk 1.32, fastify 5.12, @fastify/rate-limit 11, zod 4.6, plus minor updates. `npm audit --omit=dev` is now clean
- Tool input schemas no longer list defaulted fields (`currency`, `period`, `limit`) as required, and nullable output fields use the `"type": [..., "null"]` form (MCP SDK / zod schema generation)
- Docker: Node 22.23.5, npm 11.21.2
