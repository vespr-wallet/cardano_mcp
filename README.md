# VESPR MCP Server

MCP (Model Context Protocol) server that enables AI agents like Claude to query Cardano wallet balances via the VESPR API.

## Features

- **Query wallet ADA balance** - Get total ADA holdings
- **View staking rewards** - See unclaimed staking rewards
- **List native tokens** - Display all Cardano native tokens in the wallet
- **Display ADA handles** - Show owned ADA handles ($handle)

## Prerequisites

- Node.js 18 or later
- Claude Desktop (or any MCP-compatible client)

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables

The server can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VESPR_API_URL` | `https://api.vespr.xyz` | VESPR API endpoint |
| `REQUEST_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
| `MAX_RETRIES` | `3` | Maximum retry attempts for transient failures |
| `RETRY_BASE_DELAY_MS` | `1000` | Base delay for exponential backoff (ms) |

Example with custom configuration:

```json
{
  "mcpServers": {
    "vespr": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "REQUEST_TIMEOUT_MS": "60000",
        "MAX_RETRIES": "5"
      }
    }
  }
}
```

### Claude Desktop Setup

Add the VESPR MCP server to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following to your config file (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "vespr": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

> **Important:** Replace `/absolute/path/to/mcp-server` with the actual absolute path to the mcp-server directory.

After updating the config, restart Claude Desktop for changes to take effect.

## Usage

Once configured, you can ask Claude questions like:

- "What's the ADA balance of addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv"
- "Check the wallet balance for this address: addr1..."
- "How much ADA is in wallet addr1..."

## Available Tools

### get_wallet_balance

Query Cardano wallet balance including ADA, staking rewards, and native tokens.

**Input:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Cardano wallet address (bech32 format starting with `addr1` for mainnet or `addr_test1` for testnet) |

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `ada_balance` | string | Total ADA balance (e.g., "1,234.567890") |
| `staking_rewards` | string | Unclaimed staking rewards in ADA |
| `tokens` | array | Array of native tokens with name, ticker, and amount |
| `handles` | array | Array of ADA handles owned by the wallet |

**Example Response:**

```
ADA Balance: 1,234.567890 ADA
Staking Rewards: 12.345678 ADA
Tokens: 3 tokens
Handles: $myhandle

{
  "ada_balance": "1234.567890",
  "staking_rewards": "12.345678",
  "tokens": [
    { "name": "SNEK", "ticker": "SNEK", "amount": "1000.000000" },
    { "name": "HOSKY", "ticker": "HOSKY", "amount": "5000000.000000" },
    { "name": "MIN", "ticker": "MIN", "amount": "250.500000" }
  ],
  "handles": ["$myhandle"]
}
```

## Error Handling

The server provides clear error messages for common issues:

| Error | Description |
|-------|-------------|
| Invalid address format | Address doesn't start with `addr1` or `addr_test1`, or is too short |
| Wallet not found | The address has no transaction history on the blockchain |
| API unavailable | VESPR API is temporarily unavailable |
| Request timeout | Request took longer than 30 seconds |
| Network error | Unable to connect to the VESPR API |

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode for development
npm run start    # Run the compiled server
```

### Running Tests

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

## Technical Details

- Uses native `fetch` (Node.js 18+) - no additional HTTP dependencies
- 30-second request timeout
- Validates addresses before making API calls
- Returns both human-readable text and structured JSON data

## License

MIT
