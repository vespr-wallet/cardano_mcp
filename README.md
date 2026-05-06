# Cardano MCP

MCP (Model Context Protocol) server that lets AI assistants query Cardano wallet balances, token prices, staking info, and more — powered by the [VESPR API](https://vespr.xyz).

## Client Compatibility

There are two ways to connect to this MCP server, depending on which AI client you use:

| Client | Transport | How to connect |
|--------|-----------|----------------|
| **Claude Code** | Streamable HTTP | Use the hosted URL or a local HTTP server |
| **Claude Desktop** | stdio (subprocess) | Use `npx` or a local `node` command |
| Other MCP clients | Check client docs | HTTP if supported, otherwise stdio |

> **Why two transports?** Claude Desktop only supports stdio-based MCP servers (subprocess with stdin/stdout). Claude Code and newer MCP clients support the [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) spec, which allows connecting to a remote server over HTTPS with no local installation needed.

---

## Option 1: Hosted MCP — no installation required

The easiest way to get started. No API key needed, no software to install.

**Supported clients:** Claude Code, any Streamable HTTP MCP client

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

Or add it globally via the CLI:

```bash
claude mcp add --transport http cardano https://mcp.vespr.xyz
```

That's it — no API key required when using the hosted server.

---

## Option 2: NPX — works with Claude Desktop

Run the server as a local subprocess using `npx`. Requires a VESPR API key.

### Get a VESPR API Key

Contact [VESPR](https://vespr.xyz) to obtain an API key.

### Claude Desktop

Add this to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop after saving the config.

---

## Option 3: Self-hosted

Run your own instance — useful if you want to customize the server or use it in a private environment.

### Docker (recommended)

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
VESPR_API_KEY=your-api-key docker compose up
```

The server starts on `http://localhost:3000`. Connect via Streamable HTTP:

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

Or via stdio for Claude Desktop:

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

### From source

```bash
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp
npm install
npm run build
VESPR_API_KEY=your-key node dist/index.js
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VESPR_API_KEY` | Yes (self-hosted/npx) | — | Your VESPR API key. Not required when using `mcp.vespr.xyz`. |
| `SERVER_MODE` | No | `stdio` | Transport mode: `stdio`, `http`, or `both` |
| `HTTP_PORT` | No | `3000` | HTTP server port |
| `HTTP_HOST` | No | `0.0.0.0` | HTTP server host |
| `VESPR_API_URL` | No | `https://api.vespr.xyz` | VESPR API base URL |
| `REQUEST_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |
| `MAX_RETRIES` | No | `3` | Maximum retry attempts |
| `RETRY_BASE_DELAY_MS` | No | `1000` | Base delay for exponential backoff |
| `RATE_LIMIT_PER_MINUTE` | No | `10` | Max requests per minute per IP (HTTP mode) |
| `RATE_LIMIT_PER_DAY` | No | `250` | Max requests per day per IP (HTTP mode) |

---

## What you can ask

Once connected, ask your AI assistant questions like:

- "What's the balance of addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv in USD?"
- "Show me the transaction history for this wallet"
- "What's the price and market cap of SNEK token?"
- "Show me the VESPR token price chart for the last week"
- "What tokens are trending right now?"
- "Is this wallet staking? What pool is it in and how much has it earned?"
- "What wallet address does $vespr resolve to?"
- "What are the best performing stake pools?"
- "What currencies are supported?"

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_wallet_balance` | Wallet balance — ADA, tokens, and portfolio value in any currency |
| `get_transaction_history` | Transaction history with amounts and directions |
| `get_token_info` | Token price, market cap, supply, and risk rating |
| `get_token_chart` | OHLCV candlestick price data for any time period |
| `get_trending_tokens` | Trending tokens by volume, buys, or sells |
| `get_staking_info` | Staking status, pool info, and rewards |
| `resolve_ada_handle` | Resolve a $handle to a wallet address |
| `get_asset_metadata` | On-chain CIP-25/CIP-68 metadata for any asset |
| `get_asset_summary` | Batch lookup for multiple assets |
| `get_pool_info` | Stake pool metrics and performance |
| `get_supported_currencies` | List of supported fiat and crypto currencies |

### Tool parameters

<details>
<summary>get_wallet_balance</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32, addr1...) |
| `currency` | string | No | Currency for values (default: USD) |

</details>

<details>
<summary>get_transaction_history</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32, addr1...) |
| `to_block` | number | No | Filter transactions up to this block height |

</details>

<details>
<summary>get_token_info</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Token unit (policy ID + hex asset name) |
| `currency` | string | No | Currency for price display (default: USD) |

</details>

<details>
<summary>get_token_chart</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Token unit (policy ID + hex asset name) |
| `period` | string | No | `1H`, `24H`, `1W`, `1M`, `3M`, `1Y`, `ALL` (default: 24H) |
| `currency` | string | No | Currency for price display (default: ADA) |

</details>

<details>
<summary>get_trending_tokens</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `currency` | string | No | Currency for price display (default: USD) |
| `sort` | string | No | `volume`, `buys`, `sells`, `unique_buyers`, `unique_sellers` |
| `period` | string | No | `1M`, `5M`, `30M`, `1H`, `4H`, `1D` |
| `limit` | number | No | Number of results (default: 10, max: 100) |

</details>

<details>
<summary>get_staking_info</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32, addr1...) |

</details>

<details>
<summary>resolve_ada_handle</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `handle` | string | Yes | ADA handle with or without $ prefix (e.g. `vespr` or `$vespr`) |

</details>

<details>
<summary>get_asset_metadata</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Asset unit (policy ID + hex-encoded asset name) |

</details>

<details>
<summary>get_asset_summary</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `units` | string[] | Yes | Array of asset units (max 100 per request) |

</details>

<details>
<summary>get_pool_info</summary>

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pool_id` | string | Yes | Stake pool ID (bech32, pool1...) |

</details>

<details>
<summary>get_supported_currencies</summary>

No parameters.

</details>

---

## Development

```bash
npm install
npm run build        # compile TypeScript
npm test             # run tests
npm run test:coverage  # tests with coverage report
```

## License

MIT
