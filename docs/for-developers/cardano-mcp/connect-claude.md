---
description: >-
  Step-by-step instructions for connecting Claude Code (Streamable HTTP) and Claude Desktop (stdio/npx) to Cardano MCP.
---

# Connect with Claude

Claude has two products, and they use different MCP transports. Pick the matching section below.

| Product | Transport | Recommended option |
| --- | --- | --- |
| **Claude Code** | Streamable HTTP | Hosted URL (no key) |
| **Claude Desktop** | stdio | NPX (key required) |

---

## Claude Code

Claude Code supports the Streamable HTTP transport, so it can connect straight to the hosted server with no installation and no API key.

### Option A: per-project `.mcp.json`

Create or edit `.mcp.json` in your project root:

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

### Option B: CLI

```bash
claude mcp add --transport http cardano https://mcp.vespr.xyz
```

### Verify the connection

List configured servers and confirm `cardano` shows as connected:

```bash
claude mcp list
```

Then ask Claude:

> "Using the cardano tools, what currencies are supported?"

It should call `get_supported_currencies` and return the list. If it doesn't, see [Troubleshooting & FAQ](troubleshooting.md).

### Pointing at a self-hosted instance

If you run your own server (see [Self-Hosting](self-hosting.md)), swap the URL and, if your server requires a per-client key, add the header:

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

---

## Claude Desktop

Claude Desktop only supports **stdio** servers — it launches the server as a local subprocess — so it cannot use the hosted URL. Run it with `npx`, which requires a VESPR API key.

### 1. Get a key

Contact [VESPR](https://vespr.xyz) for an API key. (See [Authentication & API Keys](authentication.md).)

### 2. Edit the config file

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

### 3. Restart Claude Desktop

Quit and reopen the app. The `cardano` tools should appear in the tool menu (the slider/plug icon). Ask:

> "Is addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv staking? What pool and how much earned?"

### Run a local build instead of NPX

If you've cloned and built the repo, point Claude Desktop at the compiled entrypoint:

```json
{
  "mcpServers": {
    "cardano": {
      "command": "node",
      "args": ["/absolute/path/to/cardano_mcp/dist/index.js"],
      "env": {
        "VESPR_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

## Other MCP clients

Any client that implements the [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) spec can connect to `https://mcp.vespr.xyz` the same way Claude Code does. For stdio-only clients, use the `npx` / `node` subprocess approach with `VESPR_API_KEY` in the environment.

### Inspect with the MCP Inspector

A quick, visual way to explore the tools without wiring up a full client:

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter `https://mcp.vespr.xyz/`, click **Connect**, then **List Tools** and try `get_supported_currencies`.
