---
description: >-
  Full environment variable reference for Cardano MCP — transport mode, rate limits, timeouts, CORS, and more.
---

# Configuration

All configuration is done through environment variables. None are required for the hosted server (Option 1); the table below matters when you run the server yourself via NPX or self-hosting.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VESPR_API_KEY` | Yes (NPX / self-hosted) | — | Your VESPR API key. Not required when using `mcp.vespr.xyz`. Sent upstream as `x-api-key`. |
| `SERVER_MODE` | No | `stdio` | Transport mode: `stdio`, `http`, or `both`. |
| `HTTP_PORT` | No | `3000` | Port the HTTP server listens on. |
| `HTTP_HOST` | No | `0.0.0.0` | Host/interface to bind. |
| `VESPR_API_URL` | No | `https://api.vespr.xyz` | Base URL of the upstream VESPR API. |
| `REQUEST_TIMEOUT_MS` | No | `30000` | Per-request upstream timeout in milliseconds. |
| `MAX_RETRIES` | No | `3` | Max attempts for transient (`5xx`/`429`) upstream failures. |
| `RETRY_BASE_DELAY_MS` | No | `1000` | Base delay for exponential backoff (`delay = base × 2^attempt`). |
| `RATE_LIMIT_PER_MINUTE` | No | `10` | Max requests per minute per IP (HTTP mode). |
| `RATE_LIMIT_PER_DAY` | No | `250` | Max requests per day per IP (HTTP mode). |
| `SESSION_TTL_MS` | No | `3600000` | Idle session lifetime before eviction (HTTP mode, 1 hour). |
| `ALLOWED_ORIGINS` | No | _(empty)_ | Comma-separated CORS allow-list. Empty denies all cross-origin browser requests. |
| `TRUSTED_PROXIES` | No | _(empty)_ | Comma-separated IP prefixes trusted for `x-forwarded-for`. Empty uses the direct connection IP (no spoofing risk). |
| `LOG_LEVEL` | No | `info` | Log verbosity. Logs are written to stderr. |

## How values are parsed

* Numeric variables fall back to their default if unset **or** non-numeric (e.g. `HTTP_PORT=abc` → `3000`).
* `SERVER_MODE` is case-insensitive; anything other than `http` or `both` resolves to `stdio`.
* `ALLOWED_ORIGINS` is split on commas; empty entries are discarded. An empty result means "deny all cross-origin requests."

## Example `.env`

The repo ships a `.env.example` you can copy:

```bash
cp .env.example .env
```

```bash
# Server Mode (stdio | http | both)
SERVER_MODE=http

# HTTP Server Configuration
HTTP_PORT=3000
HTTP_HOST=0.0.0.0

# Rate Limiting (per IP address)
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_DAY=250

# Trusted proxy IP prefixes for x-forwarded-for (comma-separated, e.g. "10.0.0.,172.17.")
# TRUSTED_PROXIES=

# Allowed CORS origins (comma-separated). Empty = deny all cross-origin browser requests.
# ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com

# Idle session TTL in milliseconds (default 1 hour)
SESSION_TTL_MS=3600000

# Request Configuration
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=3
RETRY_BASE_DELAY_MS=1000

# Logging
LOG_LEVEL=info
```

{% hint style="warning" %}
Your VESPR API key is intentionally **not** in `.env.example`. Add `VESPR_API_KEY=...` to your own `.env` (which is git-ignored) or pass it inline. See [Authentication & API Keys](authentication.md).
{% endhint %}

## Choosing values

* **Behind a reverse proxy / load balancer (e.g. Cloudflare, Nginx)?** Set `TRUSTED_PROXIES` to your proxy's IP prefixes so per-IP rate limiting keys off the real client IP rather than the proxy. Leaving it empty is the safe default (no header spoofing), but will rate-limit all traffic as if it came from the proxy.
* **Public deployment?** Keep `ALLOWED_ORIGINS` empty unless a specific browser app must call the server cross-origin; then list exactly those origins.
* **High-throughput trusted environment?** Raise `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY`.
* **Slow upstream or flaky network?** Increase `REQUEST_TIMEOUT_MS` and/or `MAX_RETRIES`.
