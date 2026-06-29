---
description: >-
  Three ways to run Cardano MCP: hosted (no install), NPX for Claude Desktop, or self-hosted. Pick the option that matches your client.
---

# Setup & Installation

There are three ways to run Cardano MCP. Pick the one that matches your client and how much control you want.

| Option | Best for | API key required? |
| --- | --- | --- |
| **1. Hosted** | Claude Code & any Streamable HTTP client | No |
| **2. NPX** | Claude Desktop (stdio) | Yes |
| **3. Self-hosted** | Custom/private deployments | Yes (server-side) |

---

## Option 1: Hosted — no installation

The easiest path. The server is already running at `https://mcp.vespr.xyz` with a VESPR API key configured server-side, so **you don't need a key of your own**.

**Works with:** Claude Code, and any client that supports the MCP Streamable HTTP transport.

### Claude Code

Add this to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cardano": {
      "type": "http",
      "url": "https://mcp.vespr.xyz"
    }
  }
}
```

Or register it globally from the CLI:

```bash
claude mcp add --transport http cardano https://mcp.vespr.xyz
```

That's it. See [Connect with Claude](connect-claude.md) for verification steps.

---

## Option 2: NPX — works with Claude Desktop

Claude Desktop only supports **stdio** servers (it runs them as a local subprocess), so it can't use the hosted URL directly. Instead, run the server locally with `npx`. This requires a VESPR API key.

### Get a VESPR API key

Contact [VESPR](https://vespr.xyz) to obtain an API key. (Not needed for Option 1.)

### Configure Claude Desktop

Edit your Claude Desktop config file:

* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cardano": {
      "command": "npx",
      "args": ["-y", "github:vespr-wallet/cardano_mcp"],
      "env": {
        "VESPR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving. More detail in [Authentication & API Keys](authentication.md).

---

## Option 3: Self-hosted

Run your own instance to customize behavior, set your own rate limits, or operate in a private environment. Full deployment guide in [Self-Hosting](self-hosting.md).

### Docker (recommended)

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
VESPR_API_KEY=your-api-key docker compose up
```

The server starts on `http://localhost:3000`. Connect to it over Streamable HTTP:

```json
{
  "mcpServers": {
    "cardano": {
      "type": "http",
      "url": "http://localhost:3000",
      "headers": {
        "x-api-key": "${VESPR_API_KEY}"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
npm install
npm run build
VESPR_API_KEY=your-key node dist/index.js
```

By default this starts in **stdio** mode. To run the HTTP server, set `SERVER_MODE=http` (see [Configuration](configuration.md)):

```bash
SERVER_MODE=http VESPR_API_KEY=your-key node dist/index.js
```

---

## Verify it's working

Once connected, ask your assistant:

> "What currencies does the Cardano MCP support?"

It should call `get_supported_currencies` and return a list of fiat and crypto currencies. If you self-hosted in HTTP mode, you can also hit the health endpoint directly:

```bash
curl https://mcp.vespr.xyz/health
# {"status":"ok","timestamp":"...","startedAt":"...","uptimeMs":...}
```

Stuck? See [Troubleshooting & FAQ](troubleshooting.md).
