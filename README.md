# @vespr/cardano-mcp

MCP (Model Context Protocol) server that enables AI agents like Claude to query Cardano wallet balances and ADA prices via the VESPR API.

## Features

- **Query wallet balance** - Get portfolio value in any supported fiat/crypto currency
- **Transaction history** - View wallet transaction history with details
- **Token information** - Get detailed token info including price, market cap, and risk rating
- **Token price charts** - OHLCV candlestick data for any time period
- **Trending tokens** - Discover trending tokens by volume, buys, or sells
- **Staking information** - Check staking status, pool info, and rewards
- **ADA handle resolution** - Resolve $handles to wallet addresses
- **Asset metadata** - Retrieve on-chain CIP-25/CIP-68 metadata
- **Batch asset lookup** - Get summary info for multiple assets at once
- **Pool information** - Query stake pool metrics and performance
- **Currency support** - 160+ fiat currencies and crypto options

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
- "Show me the transaction history for this wallet"
- "What's the price and market cap of SNEK token?"
- "Show me the price chart for VESPR token over the last week"
- "What tokens are trending right now?"
- "Is this wallet staking? What pool is it delegated to?"
- "What wallet address does $vespr resolve to?"
- "What are the best performing stake pools?"
- "What currencies are supported?"

## Available Tools

| Tool | Description |
|------|-------------|
| `get_wallet_balance` | Query wallet balance with ADA, tokens, and portfolio value |
| `get_transaction_history` | Query wallet transaction history with amounts and directions |
| `get_token_info` | Get detailed token information (price, market cap, supply, risk) |
| `get_token_chart` | Get OHLCV price chart data for a token |
| `get_trending_tokens` | Discover trending tokens by volume or trading activity |
| `get_staking_info` | Query wallet staking status, pool info, and rewards |
| `resolve_ada_handle` | Resolve an ADA handle ($handle) to a wallet address |
| `get_asset_metadata` | Get on-chain CIP-25/CIP-68 metadata for an asset |
| `get_asset_summary` | Batch lookup for multiple assets with categorization |
| `get_pool_info` | Get stake pool information and performance metrics |
| `get_supported_currencies` | List all supported fiat and crypto currencies |

### get_wallet_balance

Query Cardano wallet balance including ADA and native tokens with values in your chosen currency.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32 format, addr1...) |
| `currency` | string | No | Currency for values (default: USD) |

### get_transaction_history

Query transaction history for a Cardano wallet address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32 format, addr1...) |
| `to_block` | number | No | Filter transactions up to this block height |

### get_token_info

Query detailed information about a Cardano native token including price, market cap, supply, and risk rating.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Token unit identifier (policy ID + hex asset name) |
| `currency` | string | No | Currency for price display (default: USD) |

### get_token_chart

Query OHLCV (Open, High, Low, Close, Volume) price chart data for a token.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Token unit identifier (policy ID + hex asset name) |
| `period` | string | No | Chart period: 1H, 24H, 1W, 1M, 3M, 1Y, ALL (default: 24H) |
| `currency` | string | No | Currency for price display (default: ADA) |

### get_trending_tokens

Discover trending Cardano native tokens based on trading activity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `currency` | string | No | Currency for price display (default: USD) |
| `sort` | string | No | Sort by: volume, buys, sells, unique_buyers, unique_sellers |
| `period` | string | No | Time period: 1M, 5M, 30M, 1H, 4H, 1D |
| `limit` | number | No | Number of tokens to return (default: 10, max: 100) |

### get_staking_info

Query staking status and rewards for a Cardano wallet address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Cardano wallet address (bech32 format, addr1...) |

### resolve_ada_handle

Resolve an ADA handle to its owner's wallet address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `handle` | string | Yes | ADA handle (with or without $ prefix, e.g., 'myhandle' or '$myhandle') |

### get_asset_metadata

Retrieve on-chain metadata (CIP-25/CIP-68) for a Cardano native asset.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit` | string | Yes | Asset unit identifier (policy ID + hex-encoded asset name) |

### get_asset_summary

Retrieve summary information for multiple Cardano native assets in a single batch request.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `units` | string[] | Yes | Array of asset unit identifiers (max 100 per request) |

### get_pool_info

Query information about a Cardano stake pool.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pool_id` | string | Yes | Cardano stake pool ID (bech32 format, pool1...) |

### get_supported_currencies

Get the list of supported fiat and crypto currencies. No input parameters required.

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
