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
