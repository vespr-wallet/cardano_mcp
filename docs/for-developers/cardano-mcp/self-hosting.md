---
description: >-
  Run your own Cardano MCP instance with Docker or from source. Includes reverse proxy setup and deployment verification.
---

# Self-Hosting

Run your own instance when you need custom rate limits, a private network, your own VESPR key management, or full control over the deployment. The hosted server at `mcp.vespr.xyz` is fine for most users — self-host only if you have a reason to.

## Prerequisites

* A VESPR API key (see [Authentication & API Keys](authentication.md)).
* Docker, **or** Node.js ≥ 18 for a from-source build.

## Docker (recommended)

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
VESPR_API_KEY=your-api-key docker compose up
```

The bundled `docker-compose.yml` runs the server in **HTTP mode** on port `3000`, with a health check and `restart: unless-stopped`. It passes through these variables (with defaults) so you can override them in your environment or an `.env` file:

```yaml
environment:
  - SERVER_MODE=http
  - HTTP_PORT=3000
  - HTTP_HOST=0.0.0.0
  - VESPR_API_KEY=${VESPR_API_KEY}
  - RATE_LIMIT_PER_MINUTE=${RATE_LIMIT_PER_MINUTE:-10}
  - RATE_LIMIT_PER_DAY=${RATE_LIMIT_PER_DAY:-250}
  - TRUSTED_PROXIES=${TRUSTED_PROXIES:-}
  - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-}
  - SESSION_TTL_MS=${SESSION_TTL_MS:-3600000}
  - LOG_LEVEL=${LOG_LEVEL:-info}
  - REQUEST_TIMEOUT_MS=${REQUEST_TIMEOUT_MS:-30000}
  - MAX_RETRIES=${MAX_RETRIES:-3}
```

Run detached:

```bash
VESPR_API_KEY=your-api-key docker compose up -d
```

### The image

The `Dockerfile` is a multi-stage build on `node:22-alpine`. It compiles TypeScript in a builder stage, installs only production dependencies in the final stage, and runs as the non-root `node` user with `CMD ["node", "dist/index.js"]`.

## From source

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
npm install
npm run build
```

Run in HTTP mode:

```bash
SERVER_MODE=http VESPR_API_KEY=your-key node dist/index.js
```

Or stdio mode (for a local Claude Desktop subprocess):

```bash
VESPR_API_KEY=your-key node dist/index.js
```

## Health checks

In HTTP mode the server exposes `GET /health`, which is **exempt from rate limiting** and safe to poll from a load balancer or uptime monitor:

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "startedAt": "2026-01-01T11:30:00.000Z",
  "uptimeMs": 1800000
}
```

The Docker health check uses this endpoint:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

## Running behind a reverse proxy

If you put the server behind Nginx, Cloudflare, or a cloud load balancer:

1. **Forward the real client IP.** Set `TRUSTED_PROXIES` to your proxy's IP prefixes (e.g. `10.0.0.,172.17.`) so per-IP rate limiting keys off the genuine client IP. The key generator reads `x-real-ip`, `x-client-ip`, `cf-connecting-ip`, `do-connecting-ip`, and `x-forwarded-for` (first hop), falling back to the socket IP. Leaving `TRUSTED_PROXIES` empty is the safe default (it ignores spoofable headers) but treats all traffic as coming from the proxy.
2. **Terminate TLS at the proxy.** The app speaks plain HTTP; let the proxy handle HTTPS.
3. **Pass through MCP headers.** Ensure `mcp-session-id` and `x-api-key` are forwarded, and that the proxy does not buffer the SSE response on `GET /` (disable response buffering for the MCP route).

## Verify your deployment

Run a full MCP handshake against your instance to confirm it's live and serving this codebase:

```bash
MCP_URL=http://localhost:3000/ npm run proof:live
```

This performs `initialize` → `notifications/initialized` → `tools/list` and asserts the server identifies as `@vespr/cardano-mcp` with all 11 tools. See [Troubleshooting & FAQ](troubleshooting.md) if it fails.
