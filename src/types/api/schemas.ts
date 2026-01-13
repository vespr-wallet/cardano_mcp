import { z } from "zod";

/**
 * Schema for token information from the wallet API
 */
export const TokenInfoSchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  ticker: z.string().nullable(),
  quantity: z.string(),
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
