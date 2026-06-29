---
description: >-
  Common errors, connection checks, and FAQ for Cardano MCP — API key issues, session errors, rate limits, and more.
---

# Troubleshooting & FAQ

## Common errors

### "VESPR API key is required..."

```
VESPR API key is required. Provide it via X-API-Key header (HTTP) or VESPR_API_KEY environment variable (stdio/npx).
```

The server couldn't find a key. Fix depends on your setup:

* **Hosted (`mcp.vespr.xyz`):** you should never see this — you don't supply a key. If you do, you're likely pointing at a self-hosted instance that has no key configured.
* **NPX / Claude Desktop:** add `VESPR_API_KEY` to the `env` block of your client config.
* **Self-hosted HTTP:** either set `VESPR_API_KEY` on the server, or have the client send an `x-api-key` header.

See [Authentication & API Keys](authentication.md).

### `404 Route POST:/mcp not found`

The MCP endpoint is the **root path `/`**, not `/mcp`. Use `https://mcp.vespr.xyz` (no `/mcp` suffix) in your client config.

### `404 Invalid or expired session ID`

You sent an `mcp-session-id` header for a session that doesn't exist or has expired. Sessions are evicted after `SESSION_TTL_MS` of inactivity (default 1 hour). Re-run the `initialize` handshake to get a fresh session ID. Most MCP clients do this automatically on reconnect.

### `429 Too Many Requests`

You hit the per-IP rate limit (`RATE_LIMIT_PER_MINUTE`, default 10/min; `RATE_LIMIT_PER_DAY`, default 250/day). Wait for the window to reset, or — if self-hosting — raise the limits in [Configuration](configuration.md).

### "Not allowed by CORS"

A cross-origin browser request was rejected. Add the calling origin to `ALLOWED_ORIGINS` (comma-separated) on the server. This only affects browser-based clients; server-side and desktop clients aren't subject to CORS.

### "Request timed out" / "Unable to connect to API"

The upstream VESPR API didn't respond in time or was unreachable. The server already retries transient `5xx`/`429` failures with backoff. If it persists, check VESPR API status, your network, and consider raising `REQUEST_TIMEOUT_MS` / `MAX_RETRIES`.

### "Invalid Cardano address"

The `address` argument isn't a valid bech32 Shelley-era address. Addresses must start with `addr1` (mainnet). This is validated locally before any network call.

## Connection checks

### Is the hosted server up?

```bash
curl https://mcp.vespr.xyz/health
```

A `200` with `{"status":"ok",...}` means it's live.

### Does the full MCP handshake work?

From a clone of the repo:

```bash
npm run proof:live
```

This runs `initialize` → `notifications/initialized` → `tools/list` and confirms the server reports `@vespr/cardano-mcp` with all 11 tools. Point it elsewhere with `MCP_URL`:

```bash
MCP_URL=http://localhost:3000/ npm run proof:live
```

### Claude Code can't see the tools

1. Confirm the server is listed: `claude mcp list` — look for `cardano: connected`.
2. Check your `.mcp.json` uses `"type": "http"` and the URL `https://mcp.vespr.xyz` (no trailing path).
3. Restart Claude Code so it re-reads the config.

### Claude Desktop can't see the tools

1. Claude Desktop only supports **stdio** — make sure you used the `npx` / `node` config, not the HTTP URL.
2. Verify `VESPR_API_KEY` is set in the `env` block.
3. Confirm the config file is valid JSON and in the right location (see [Connect with Claude](connect-claude.md)).
4. Fully quit and reopen the app — a window reload isn't enough.

## FAQ

**Do I need a VESPR API key?**
Only for the NPX and self-hosted options. The hosted server (`mcp.vespr.xyz`) needs no key from you.

**Is this read-only? Can it move funds?**
Read-only. Every tool is a query — there are no signing, sending, or wallet-control capabilities. The server never sees private keys.

**Which networks are supported?**
Cardano mainnet. Addresses must be bech32 mainnet (`addr1...`).

**Can I use it with clients other than Claude?**
Yes. Any MCP client that supports Streamable HTTP can use the hosted URL; stdio-only clients can run it as a subprocess via `npx`/`node`. See [Connect with Claude](connect-claude.md).

**How fresh is the data?**
Each call hits the VESPR API live at request time. There's no long-lived caching of blockchain data in the MCP layer.

**Where do logs go?**
To stderr (so stdout stays clean for the MCP protocol in stdio mode). Control verbosity with `LOG_LEVEL`. The API key is never logged.

**How many tools are there?**
Eleven. See [Available Tools](tools.md).

## Still stuck?

* Re-read [How It Works](how-it-works.md) to confirm your mental model of transports and auth.
* Open an issue at [github.com/vespr-wallet/cardano_mcp](https://github.com/vespr-wallet/cardano_mcp).
* For API-key access or VESPR API questions, contact [VESPR](https://vespr.xyz).
