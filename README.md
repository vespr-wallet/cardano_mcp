# @vespr/cardano-mcp

MCP (Model Context Protocol) server that enables AI agents like Claude to query Cardano wallet balances and ADA prices via the VESPR API.

## Features

- **Query wallet balance** - Get portfolio value in any supported fiat/crypto currency
- **List native tokens** - Display all Cardano native tokens with their values
- **Display ADA handles** - Show owned ADA handles ($handle)
- **Get ADA spot price** - Current ADA price with 1h and 24h historical data
- **List supported currencies** - 160+ fiat currencies and crypto options

## Prerequisites

- Node.js 18 or later
- VESPR API key
- Claude Desktop (or any MCP-compatible client)

## Quick Start

### 1. Get a VESPR API Key

Contact VESPR to obtain an API key for accessing the wallet and price APIs.

### 2. Configure Claude Desktop

Add the MCP server to your Claude Desktop configuration:

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

### 3. Restart Claude Desktop

After updating the config, restart Claude Desktop for changes to take effect.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VESPR_API_KEY` | **Yes** | - | Your VESPR API key |
| `VESPR_API_URL` | No | `https://api.vespr.xyz` | VESPR API endpoint |
| `REQUEST_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |
| `MAX_RETRIES` | No | `3` | Maximum retry attempts |
| `RETRY_BASE_DELAY_MS` | No | `1000` | Base delay for exponential backoff |

## Usage

Once configured, you can ask Claude questions like:

- "What's the balance of addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv in USD?"
- "Show me the wallet balance in EUR"
- "What currencies are supported?"

## Available Tools

### get_wallet_balance

Query Cardano wallet balance including ADA and native tokens with values in your chosen currency.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32 format) |
| `currency` | string | No | Currency for values (default: USD) |

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `currency` | string | The currency used for values |
| `portfolio_value` | string | Total portfolio value |
| `tokens` | array | Array of tokens (including ADA) with name, ticker, amount, and value |
| `handles` | array | Array of ADA handles owned by the wallet |

### get_supported_currencies

Get the list of supported fiat and crypto currencies.

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `fiat` | array | List of supported fiat currencies (USD, EUR, GBP, etc.) |
| `crypto` | array | List of supported crypto currencies (ADA) |

## Local Development

```bash
# Clone the repository
git clone https://github.com/vespr-wallet/cardano_mcp.git
cd cardano_mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
VESPR_API_KEY=your-key node dist/index.js
```

### Local Claude Desktop Config

For local development, point to your local build:

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

### Running Tests

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

## License

MIT
