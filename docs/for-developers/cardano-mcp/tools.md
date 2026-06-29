---
description: >-
  Reference for all 11 Cardano MCP tools: wallet balance, transaction history, token info, staking, ADA handles, and more.
---

# Available Tools

The server exposes 11 tools. Your assistant picks and calls them automatically based on your question — you rarely invoke them by name. The reference below is useful when building integrations or debugging.

| Tool | What it does |
| --- | --- |
| [`get_wallet_balance`](#get_wallet_balance) | Wallet balance — ADA, tokens, and portfolio value in any currency. |
| [`get_transaction_history`](#get_transaction_history) | Transaction history with amounts and directions. |
| [`get_token_info`](#get_token_info) | Token price, market cap, supply, and risk rating. |
| [`get_token_chart`](#get_token_chart) | OHLCV candlestick price data for any time period. |
| [`get_trending_tokens`](#get_trending_tokens) | Trending tokens by trading activity. |
| [`get_staking_info`](#get_staking_info) | Staking status, pool info, and rewards. |
| [`resolve_ada_handle`](#resolve_ada_handle) | Resolve a `$handle` to a wallet address. |
| [`get_asset_metadata`](#get_asset_metadata) | On-chain CIP-25/CIP-68 metadata for an asset. |
| [`get_asset_summary`](#get_asset_summary) | Batch summary lookup for multiple assets. |
| [`get_pool_info`](#get_pool_info) | Stake pool metrics and performance. |
| [`get_supported_currencies`](#get_supported_currencies) | List of supported fiat and crypto currencies. |

{% hint style="info" %}
**Currencies:** tools that accept a `currency` parameter support 160+ fiat codes (USD, EUR, JPY, ...) plus `ADA`. Call `get_supported_currencies` for the authoritative list.
{% endhint %}

---

## get_wallet_balance

Wallet balance including ADA and native tokens. Includes balances from **all** addresses associated with the wallet, not just the one provided.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `address` | string | Yes | — | Cardano wallet address (bech32, `addr1...`). |
| `currency` | string | No | `USD` | Currency for displayed values. |

Returns portfolio value, per-token amounts and values, and any ADA handles on the wallet.

## get_transaction_history

Recent transactions with direction (Received / Sent / Self Transfer / Multisig), ADA amount, fee, and asset count.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | Yes | Cardano wallet address (bech32, `addr1...`). |
| `to_block` | integer | No | Only include transactions up to this block height. |

## get_token_info

Detailed information about a native token.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `unit` | string | Yes | — | Token unit (policy ID + hex asset name). |
| `currency` | string | No | `USD` | Currency for price display. |

Returns name, ticker, decimals, price, circulating supply, FDV, market cap, total supply, risk rating, and verification status.

## get_token_chart

OHLCV (open/high/low/close/volume) candlestick data.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `unit` | string | Yes | — | Token unit (policy ID + hex asset name). |
| `period` | string | No | `24H` | One of `1H`, `24H`, `1W`, `1M`, `3M`, `1Y`, `ALL`. |
| `currency` | string | No | `ADA` | Currency for price display. |

## get_trending_tokens

Tokens ranked by trading activity over a window.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `currency` | string | No | `USD` | Currency for price display. |
| `period` | string | No | _(API default)_ | One of `1M`, `5M`, `30M`, `1H`, `4H`, `1D`. |
| `limit` | integer | No | `10` | Number of results (1–100). |

## get_staking_info

Staking status and rewards for a wallet.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `address` | string | Yes | Cardano wallet address (bech32, `addr1...`). |

Returns status (`NEVER_REGISTERED` / `REGISTERED` / `DEREGISTERED`), active pool, APY, next reward, total rewards, and a suggested pool.

## resolve_ada_handle

Resolve an ADA handle to its owner's wallet address.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `handle` | string | Yes | ADA handle, with or without the `$` prefix (e.g. `vespr` or `$vespr`). |

## get_asset_metadata

On-chain CIP-25/CIP-68 metadata for a single asset.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `unit` | string | Yes | Asset unit (policy ID + hex-encoded asset name). |

## get_asset_summary

Batch lookup for multiple assets, categorized into tokens, NFTs, and other NFTs.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `units` | string[] | Yes | Array of asset units (max 100 per request). |

## get_pool_info

Stake pool metrics and performance.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `pool_id` | string | Yes | Stake pool ID (bech32, `pool1...`). |

Returns name, ticker, state, APY, saturation, delegator count, active/live stake, pledge, fees, and total blocks produced.

## get_supported_currencies

No parameters. Returns the lists of supported `fiat` and `crypto` currency codes.

---

## Example prompts

* "What's the balance of `addr1qy8ac7...g69mq4afdhv` in USD?"
* "Show me the transaction history for this wallet."
* "What's the price and market cap of SNEK?"
* "Show me the VESPR token price chart for the last week."
* "What tokens are trending right now?"
* "Is this wallet staking? What pool, and how much has it earned?"
* "What wallet address does `$vespr` resolve to?"
* "What are the best-performing stake pools?"
