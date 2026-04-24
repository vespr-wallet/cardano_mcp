import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../currency.js";

/**
 * Schema for token information from the wallet API
 */
export const TokenInfoSchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  ticker: z.string().nullish(),
  quantity: z.string(),
  ada_per_adjusted_unit: z.string().nullish(),
  decimals: z.number().int(),
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;

/**
 * Schema for the /v7/wallet/detailed endpoint response.
 * Strict validation - all fields required, no defaults.
 */
export const WalletDetailedResponseSchema = z.object({
  lovelace: z.string(),
  rewards_lovelace: z.string(),
  handles: z.array(z.string()),
  tokens: z.array(TokenInfoSchema),
});

export type WalletDetailedResponse = z.infer<typeof WalletDetailedResponseSchema>;

/**
 * Schema for the /v5/ada/spot endpoint response.
 */
export const AdaSpotPriceResponseSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  spot: z.string(),
  spot1hAgo: z.string().nullable(),
  spot24hAgo: z.string().nullable(),
});

export type AdaSpotPriceResponse = z.infer<typeof AdaSpotPriceResponseSchema>;

// ============================================================================
// Transaction History Schemas (/v4/wallet/transactions)
// ============================================================================

/**
 * Schema for transaction asset information
 */
export const TransactionAssetSchema = z.object({
  unit: z.string(),
  quantity: z.string(), // BigInt as string
  policy: z.string(),
  hexAssetName: z.string(),
  name: z.string(),
  fingerprint: z.string(),
  decimals: z.number().int(),
});

export type TransactionAsset = z.infer<typeof TransactionAssetSchema>;

/**
 * Schema for individual transaction data
 */
export const TransactionDataSchema = z.object({
  txHash: z.string(),
  date: z.string(), // ISO date-time string
  timestamp: z.string(), // ISO format
  blockHeight: z.number().int(),
  direction: z.enum(["self", "externalOut", "externalIn", "multisig"]),
  extra: z.array(z.string()),
  txFee: z.string(), // BigInt as string
  deposit: z.string(), // BigInt as string
  lovelace: z.string(), // BigInt as string
  assets: z.array(TransactionAssetSchema),
});

export type TransactionData = z.infer<typeof TransactionDataSchema>;

/**
 * Schema for the /v4/wallet/transactions endpoint response
 */
export const TransactionHistoryResponseSchema = z.object({
  sinceBlock: z.number().int(),
  toBlock: z.number().int(),
  transactions: z.array(TransactionDataSchema),
});

export type TransactionHistoryResponse = z.infer<typeof TransactionHistoryResponseSchema>;

// ============================================================================
// Staking Info Schemas (/v5/wallet/rewards/staking/info)
// ============================================================================

/**
 * Schema for pool image metadata - reuses ImageDataSchema
 * Supports all VESPR API image variants including NO_IMAGE
 */
const PoolImageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("URL_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("CID_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("BASE64_IMAGE"),
    image: z.string(),
    image_encoding: z.string(),
  }),
  z.object({
    type: z.literal("NO_IMAGE"),
  }),
]);

/**
 * Schema for pool metadata
 * Note: description is optional - not always present in API responses
 */
const PoolMetaSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  homepage: z.string(),
  description: z.string().nullish(),
  image: PoolImageSchema,
});

/**
 * Schema for stake pool information
 * Note: apy and saturation come as strings from the API (BigNumber serialization)
 * Note: API may use either pool_id or id_bech_32 - we accept both
 */
const StakePoolInfoBaseSchema = z.object({
  pool_id: z.string().optional(),
  id_bech_32: z.string().optional(),
  meta: PoolMetaSchema.nullable(),
  apy: z.coerce.number(), // BigNumber serialized as string, coerced to number
  saturation: z.coerce.number(), // BigNumber serialized as string, coerced to number
  pledge: z.string().nullish(), // BigInt
  margin: z.string().nullish(), // BigNumber
  fixed_cost: z.string().nullish(), // BigInt
  stake: z.string().nullish(), // BigInt
  epoch_blocks: z.string().nullish(), // Number as string
  lifetime_blocks: z.string().nullish(), // Number as string
});

export const StakePoolInfoSchema = StakePoolInfoBaseSchema.transform((data) => ({
  ...data,
  // Normalize to pool_id - use pool_id if present, otherwise use id_bech_32
  pool_id: data.pool_id ?? data.id_bech_32 ?? "",
}));

export type StakePoolInfo = z.infer<typeof StakePoolInfoSchema>;

/**
 * Schema for reward item information
 */
export const RewardItemSchema = z.object({
  pool: z.object({
    id_bech_32: z.string(),
    ticker: z.string().nullish(),
  }),
  time_utc: z.number(),
  lovelace: z.string(), // BigInt
  uses_current_balance: z.boolean().nullish(),
});

export type RewardItem = z.infer<typeof RewardItemSchema>;

/**
 * Schema for staking info when wallet has never been registered for staking
 */
const NeverRegisteredStakingSchema = z.object({
  runtime_type: z.literal("NEVER_REGISTERED"),
  staking_address: z.string(),
  lovelace: z.string(),
  response_time_utc: z.number(),
  epoch_start_time_utc: z.number(),
  epoch_end_time_utc: z.number(),
  first_reward_time_utc: z.number(),
  average_apy: z.coerce.number(), // BigNumber serialized as string, coerced to number
  suggested_pool: StakePoolInfoSchema,
});

/**
 * Schema for staking info when wallet is actively registered
 * Note: Many fields are optional as the API response structure varies
 * Note: API may use total_rewards or total_rewards_lovelace - we accept both
 */
const RegisteredStakingBaseSchema = z.object({
  runtime_type: z.literal("REGISTERED"),
  wallet_apy: z.coerce.number(), // BigNumber serialized as string, coerced to number
  total_rewards: z.string().optional(), // BigInt - may use total_rewards_lovelace instead
  total_rewards_lovelace: z.string().optional(), // BigInt - alternative field name
  withdrawable_rewards: z.string().nullish(), // BigInt - optional, not always present
  active_pool: StakePoolInfoSchema,
  suggested_pool: StakePoolInfoSchema.nullable(),
  past_rewards: z.array(RewardItemSchema),
  future_rewards: z.array(RewardItemSchema),
  // Optional fields - not always present in API response
  staking_address: z.string().nullish(),
  lovelace: z.string().nullish(),
  response_time_utc: z.number().nullish(),
  epoch_start_time_utc: z.number().nullish(),
  epoch_end_time_utc: z.number().nullish(),
  first_rewards_on_re_delegation_time_utc: z.number().nullish(),
  last_registration_first_earning_time_utc: z.number().nullish(),
  next_reward: RewardItemSchema.nullable().nullish(),
});

const RegisteredStakingSchema = RegisteredStakingBaseSchema.transform((data) => ({
  ...data,
  // Normalize to total_rewards - use total_rewards if present, otherwise use total_rewards_lovelace
  total_rewards: data.total_rewards ?? data.total_rewards_lovelace ?? "0",
}));

/**
 * Schema for staking info when wallet has been deregistered from staking
 * Note: Field names aligned with REGISTERED schema for consistency
 * Note: API may use total_rewards or total_rewards_lovelace - we accept both
 */
const DeregisteredStakingBaseSchema = z.object({
  runtime_type: z.literal("DEREGISTERED"),
  total_rewards: z.string().optional(), // BigInt - may use total_rewards_lovelace instead
  total_rewards_lovelace: z.string().optional(), // BigInt - alternative field name
  withdrawable_rewards: z.string().nullish(), // BigInt
  suggested_pool: StakePoolInfoSchema,
  past_rewards: z.array(RewardItemSchema),
  // Optional fields - may not always be present
  staking_address: z.string().nullish(),
  lovelace: z.string().nullish(),
  response_time_utc: z.number().nullish(),
  epoch_start_time_utc: z.number().nullish(),
  epoch_end_time_utc: z.number().nullish(),
  first_rewards_on_re_delegation_time_utc: z.number().nullish(),
});

const DeregisteredStakingSchema = DeregisteredStakingBaseSchema.transform((data) => ({
  ...data,
  // Normalize to total_rewards
  total_rewards: data.total_rewards ?? data.total_rewards_lovelace ?? "0",
}));

/**
 * Union schema for the /v5/wallet/rewards/staking/info endpoint.
 * Response type varies based on registration status:
 * - NEVER_REGISTERED: Wallet has never staked
 * - REGISTERED: Wallet is actively staking
 * - DEREGISTERED: Wallet was staking but deregistered
 * Note: Using z.union instead of z.discriminatedUnion due to transform schemas
 */
export const StakingInfoResponseSchema = z.union([
  NeverRegisteredStakingSchema,
  RegisteredStakingSchema,
  DeregisteredStakingSchema,
]);

export type StakingInfoResponse = z.infer<typeof StakingInfoResponseSchema>;

// ============================================================================
// Token Info Schemas (/v1/token/:unit/info)
// ============================================================================

/**
 * Token risk rating from Xerberus
 */
export const TokenRiskRatingSchema = z.enum([
  "A",
  "AA",
  "AAA", // Investment Grade
  "B",
  "BB",
  "BBB", // Speculative
  "C",
  "CC",
  "CCC", // Highly Speculative
  "D", // Junk
  "not_available", // Token not on Xerberus
  "unknown", // Other error
]);

export type TokenRiskRating = z.infer<typeof TokenRiskRatingSchema>;

/**
 * Schema for the /v1/token/:unit/info endpoint response.
 * Returns detailed token information including price, market cap, and risk rating.
 */
export const TokenInfoResponseSchema = z.object({
  data: z.object({
    subject: z.string(), // Token unit identifier (policy + hex asset name)
    description: z.string().nullish(),
    name: z.string(),
    url: z.string().nullish(),
    decimals: z.number(),
    ticker: z.string().nullish(),
    price: z.number().nullish(), // Price in requested currency
    circSupply: z.number().nullish(), // Circulating supply
    fdv: z.number().nullish(), // Fully diluted valuation
    mcap: z.number().nullish(), // Market cap
    totalSupply: z.number(),
    riskCategory: TokenRiskRatingSchema.nullish(),
    verified: z.boolean(),
    currency: z.enum(SUPPORTED_CURRENCIES),
  }),
});

export type TokenInfoResponse = z.infer<typeof TokenInfoResponseSchema>;

// ============================================================================
// Token Chart Schemas (/v1/token/:unit/chart)
// ============================================================================

/**
 * Chart interval for token price data
 */
export const TokenChartIntervalSchema = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);

export type TokenChartInterval = z.infer<typeof TokenChartIntervalSchema>;

/**
 * Chart period for requesting token price history
 */
export const ChartPeriodSchema = z.enum(["1H", "24H", "1W", "1M", "3M", "1Y", "ALL"]);

export type ChartPeriod = z.infer<typeof ChartPeriodSchema>;

/**
 * OHLCV candle data for token charts
 */
export const ChartCandleSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  timestamp: z.number(),
  volume: z.number(),
});

export type ChartCandle = z.infer<typeof ChartCandleSchema>;

/**
 * Schema for the /v1/token/:unit/chart endpoint response.
 * Returns OHLCV price data for the requested period.
 */
export const TokenChartResponseSchema = z.object({
  data: z.array(ChartCandleSchema),
  interval: TokenChartIntervalSchema,
  currency: z.enum(SUPPORTED_CURRENCIES),
});

export type TokenChartResponse = z.infer<typeof TokenChartResponseSchema>;

// ============================================================================
// Trending Tokens Schemas (/v2/tokens/explore/trending)
// ============================================================================

/**
 * Trending period for filtering token activity
 */
export const TrendingPeriodSchema = z.enum(["1M", "5M", "30M", "1H", "4H", "1D"]);

export type TrendingPeriod = z.infer<typeof TrendingPeriodSchema>;

/**
 * Simplified chart data for trending view (close price and timestamp only)
 */
export const TokenChartSimplifiedSchema = z.object({
  interval: TokenChartIntervalSchema,
  data: z.array(
    z.object({
      close: z.number(),
      timestamp: z.number(),
    }),
  ),
});

export type TokenChartSimplified = z.infer<typeof TokenChartSimplifiedSchema>;

/**
 * Individual trending token item
 * Field names match actual VESPR API response from /v1/tokens/explore/trending
 */
export const TrendingTokenItemSchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  ticker: z.string().optional(),
  verified: z.boolean(),
  decimals: z.number(),
  // Price in ADA per adjusted unit (accounts for decimals)
  ada_per_adjusted_unit: z.number(),
  // Percentage price change over the selected period
  period_ada_price_change_percentage: z.number().nullish(),
  // Trading volume in ADA for the period
  period_volume_ada: z.number(),
  period_buys_count: z.number(),
  period_sales_count: z.number(),
  chart_data: TokenChartSimplifiedSchema.nullish(),
});

export type TrendingTokenItem = z.infer<typeof TrendingTokenItemSchema>;

/**
 * Schema for the /v1/tokens/explore/trending endpoint response.
 * Returns trending tokens with activity metrics and optional chart data.
 * Note: API does not return currency in response - it uses the currency from request params.
 */
export const TrendingTokensResponseSchema = z.object({
  data: z.array(TrendingTokenItemSchema),
});

export type TrendingTokensResponse = z.infer<typeof TrendingTokensResponseSchema>;

// ============================================================================
// ADA Handle Schemas (/v4/asset/handle_owner)
// ============================================================================

/**
 * Schema for the /v4/asset/handle_owner endpoint response.
 * Returns the owner address for an ADA handle, or null if not found.
 */
export const AdaHandleOwnerResponseSchema = z.object({
  owner: z.string().nullable(), // Wallet address or null if not found
});

export type AdaHandleOwnerResponse = z.infer<typeof AdaHandleOwnerResponseSchema>;

// ============================================================================
// Asset Metadata Schemas (/v4/asset/:unit/metadata)
// ============================================================================

/**
 * Schema for the /v4/asset/:unit/metadata endpoint response.
 * Returns asset name and optional on-chain metadata.
 */
export const AssetMetadataResponseSchema = z.object({
  name: z.string(),
  onchain_metadata: z.record(z.string(), z.unknown()).nullable(),
});

export type AssetMetadataResponse = z.infer<typeof AssetMetadataResponseSchema>;

// ============================================================================
// Asset Summary Schemas (/v4/asset/summary)
// ============================================================================

/**
 * Schema for image data from VESPR API.
 * Supports all image type variants:
 * - URL_IMAGE: External URL
 * - CID_IMAGE: IPFS CID reference
 * - BASE64_IMAGE: Base64 encoded with encoding type
 * - NO_IMAGE: Asset has no image (no `image` field)
 */
export const ImageDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("URL_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("CID_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("BASE64_IMAGE"),
    image: z.string(),
    image_encoding: z.string(),
  }),
  z.object({
    type: z.literal("NO_IMAGE"),
    // No image field for this type
  }),
]);

export type ImageData = z.infer<typeof ImageDataSchema>;

/**
 * Schema for fungible token summary
 */
export const AssetSummaryFtItemSchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  ticker: z.string().optional(),
  decimals: z.number().int(),
  image: ImageDataSchema,
  verified: z.boolean(),
  registered_name: z.string().optional(),
});

export type AssetSummaryFtItem = z.infer<typeof AssetSummaryFtItemSchema>;

/**
 * Schema for NFT summary
 */
export const AssetSummaryNftItemSchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  image: ImageDataSchema,
  registered_name: z.string().optional(),
});

export type AssetSummaryNftItem = z.infer<typeof AssetSummaryNftItemSchema>;

/**
 * Schema for the /v4/asset/summary endpoint response.
 * Returns categorized asset information for tokens and NFTs.
 */
export const AssetSummaryResponseSchema = z.object({
  tokens: z.array(AssetSummaryFtItemSchema),
  nfts: z.array(AssetSummaryNftItemSchema),
  other_nfts: z.array(AssetSummaryNftItemSchema),
});

export type AssetSummaryResponse = z.infer<typeof AssetSummaryResponseSchema>;

// ============================================================================
// Pool Info Schemas (/v4/pool/info)
// ============================================================================

/**
 * Pool registration state
 */
export const PoolStateSchema = z.enum(["registered", "retiring", "retired"]);

export type PoolState = z.infer<typeof PoolStateSchema>;

/**
 * Schema for pool detail (metadata)
 */
export const PoolDetailSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  homepage: z.string(),
  description: z.string(),
  image: ImageDataSchema,
});

export type PoolDetail = z.infer<typeof PoolDetailSchema>;

/**
 * Schema for pool history summary
 */
export const PoolHistorySummarySchema = z.object({
  date_utc: z.number(),
  blocks_minted: z.number().int(),
  dtu: z.number().nullish(), // Decentralization to uptime ratio
});

export type PoolHistorySummary = z.infer<typeof PoolHistorySummarySchema>;

/**
 * Schema for the /v4/pool/info endpoint response.
 * Returns comprehensive pool information including stake, performance, and history.
 */
export const PoolInfoResponseSchema = z.object({
  response_time_utc: z.number(),
  pool_id_bech32: z.string(),
  detail: PoolDetailSchema.nullable(),
  active_stake_lovelace: z.string(), // BigInt as string
  live_stake_lovelace: z.string(), // BigInt as string
  saturation: z.coerce.number(), // BigNumber serialized as string, coerced to number
  state: PoolStateSchema,
  apy: z.coerce.number(), // BigNumber serialized as string, coerced to number
  pledge: z.string(), // BigInt as string
  dtu: z.number().nullish(),
  total_blocks: z.number().int(),
  delegators_count: z.number().int(),
  fixed_fee: z.string(), // BigInt as string
  variable_fee: z.coerce.number(), // BigNumber serialized as string, coerced to number
  history: z.array(PoolHistorySummarySchema),
});

export type PoolInfoResponse = z.infer<typeof PoolInfoResponseSchema>;
