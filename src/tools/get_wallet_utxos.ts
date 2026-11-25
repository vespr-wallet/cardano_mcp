import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError, invalidInputResult } from "../types/errors.js";
import { lovelaceToAda, formatTokenAmount, readableAssetName } from "../utils/cardano.js";
import { formatWithCommas } from "../utils/formatting.js";
import { isValidCardanoAddress } from "../utils/validation.js";
import { decodeUtxoCborHex, DecodedUtxo } from "../utils/utxo.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import type { TokenInfo } from "../types/api/schemas.js";

export const DEFAULT_UTXO_LIMIT = 50;
export const MAX_UTXO_LIMIT = 200;
/** Tokens listed per UTxO; `token_count` always holds the full count. */
export const MAX_TOKENS_PER_UTXO = 50;

const utxoRefSchema = z.object({
  tx_hash: z.string().describe("Transaction hash of the UTxO"),
  output_index: z.number().int().describe("Output index of the UTxO in its transaction"),
  ada: z.string().describe("ADA amount held by the UTxO"),
});

const utxoTokenSchema = z.object({
  name: z
    .string()
    .describe("The name of the token (the asset name as text, or hex when it isn't printable, for unknown tokens)"),
  ticker: z.string().nullish().describe("The ticker of the token"),
  policy_id: z.string().describe("The policy ID of the token"),
  asset_name_hex: z.string().describe("The hex-encoded asset name"),
  quantity: z.string().describe("Raw on-chain quantity"),
  amount: z.string().describe("Quantity adjusted for the token's decimals (raw when decimals are unknown)"),
});

const utxoSchema = z.object({
  tx_hash: z.string().describe("Transaction hash of the UTxO"),
  output_index: z.number().int().describe("Output index of the UTxO in its transaction"),
  address: z.string().describe("Address holding the UTxO"),
  ada: z.string().describe("ADA amount held by the UTxO"),
  token_count: z.number().int().describe("Number of distinct tokens in the UTxO"),
  tokens: z.array(utxoTokenSchema).describe(`Tokens in the UTxO (at most ${MAX_TOKENS_PER_UTXO} listed)`),
});

const utxosOutputSchema = z.object({
  utxo_count: z.number().int().describe("Total number of UTxOs in the wallet"),
  pure_ada_utxo_count: z.number().int().describe("Number of UTxOs holding only ADA (no tokens)"),
  total_ada: z.string().describe("Total ADA across all UTxOs"),
  largest_pure_ada_utxo: utxoRefSchema.nullable().describe("The largest UTxO holding only ADA, if any"),
  collateral_utxo: utxoRefSchema
    .nullable()
    .describe("The UTxO VESPR would use as collateral (a pure-ADA UTxO of exactly 5 ADA), if any"),
  offset: z.number().int().describe("Index of the first returned UTxO"),
  has_more: z.boolean().describe("Whether more UTxOs exist after this page"),
  utxos: z.array(utxoSchema).describe("UTxOs on this page, sorted by ADA amount, largest first"),
});

type UtxoToken = z.infer<typeof utxoTokenSchema>;
type UtxoRef = z.infer<typeof utxoRefSchema>;
type UtxosOutput = z.infer<typeof utxosOutputSchema>;

function toRef(utxo: DecodedUtxo): UtxoRef {
  return { tx_hash: utxo.tx_hash, output_index: utxo.output_index, ada: lovelaceToAda(utxo.lovelace.toString()) };
}

/**
 * Handler for get_wallet_utxos tool
 */
export async function getWalletUtxosHandler({
  address,
  limit,
  offset,
}: {
  address: string;
  limit: number;
  offset: number;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: UtxosOutput;
  isError?: boolean;
}> {
  // Validate address format before making API call
  if (!isValidCardanoAddress(address)) {
    return invalidInputResult("Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.");
  }

  try {
    const [utxosData, walletData] = await Promise.all([
      VesprApiRepository.getWalletUtxos(address),
      // Token names and decimals are a nice-to-have: still list the UTxOs if this lookup fails
      VesprApiRepository.getDetailedWallet(address).catch(() => null),
    ]);

    const tokenInfo = new Map<string, TokenInfo>(
      (walletData?.tokens ?? []).map((token) => [`${token.policy}${token.hex_asset_name}`, token]),
    );

    const utxos = utxosData.hex_utxos.map(decodeUtxoCborHex).sort((a, b) => {
      if (a.lovelace === b.lovelace) {
        return 0;
      }
      return a.lovelace > b.lovelace ? -1 : 1;
    });
    const pureAdaUtxos = utxos.filter((utxo) => utxo.tokens.length === 0);
    const largestPureAda = pureAdaUtxos[0];
    const collateralHex = utxosData.collateral_hex_utxos[0];
    const totalLovelace = utxos.reduce((acc, utxo) => acc + utxo.lovelace, 0n);
    const page = utxos.slice(offset, offset + limit);

    const output: UtxosOutput = {
      utxo_count: utxos.length,
      pure_ada_utxo_count: pureAdaUtxos.length,
      total_ada: lovelaceToAda(totalLovelace.toString()),
      largest_pure_ada_utxo: largestPureAda ? toRef(largestPureAda) : null,
      collateral_utxo: collateralHex ? toRef(decodeUtxoCborHex(collateralHex)) : null,
      offset,
      has_more: offset + page.length < utxos.length,
      utxos: page.map((utxo) => ({
        tx_hash: utxo.tx_hash,
        output_index: utxo.output_index,
        address: utxo.address,
        ada: lovelaceToAda(utxo.lovelace.toString()),
        token_count: utxo.tokens.length,
        tokens: utxo.tokens.slice(0, MAX_TOKENS_PER_UTXO).map((token): UtxoToken => {
          const info = tokenInfo.get(`${token.policy_id}${token.asset_name_hex}`);
          const quantity = token.quantity.toString();
          return {
            name: info?.name || readableAssetName(token.asset_name_hex),
            ticker: info?.ticker,
            policy_id: token.policy_id,
            asset_name_hex: token.asset_name_hex,
            quantity,
            amount: info ? formatTokenAmount(quantity, info.decimals) : quantity,
          };
        }),
      })),
    };

    const describeRef = (ref: UtxoRef | null) =>
      ref ? `${formatWithCommas(ref.ada)} ADA (${ref.tx_hash}#${ref.output_index})` : "none";

    const textSummary = [
      `UTxOs: ${output.utxo_count} (${output.pure_ada_utxo_count} pure ADA)`,
      `Total ADA: ${formatWithCommas(output.total_ada)} ADA`,
      `Largest pure-ADA UTxO: ${describeRef(output.largest_pure_ada_utxo)}`,
      `Collateral UTxO: ${describeRef(output.collateral_utxo)}`,
      page.length === 0
        ? `Showing none of ${output.utxo_count} (offset ${offset})`
        : `Showing ${offset + 1}-${offset + page.length} of ${output.utxo_count}${output.has_more ? " (use offset for more)" : ""}:`,
      ...output.utxos.map(
        (utxo) =>
          `- ${utxo.tx_hash}#${utxo.output_index}: ${formatWithCommas(utxo.ada)} ADA, ${utxo.token_count} token${utxo.token_count !== 1 ? "s" : ""}`,
      ),
    ].join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: textSummary,
        },
      ],
      structuredContent: output,
    };
  } catch (error) {
    // Handle VesprApiError with user-friendly message
    if (error instanceof VesprApiError) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }

    // Handle unexpected errors
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: An unexpected error occurred. ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

export const GET_WALLET_UTXOS_DESCRIPTION =
  "List a Cardano wallet's UTxOs (unspent outputs) with the ADA and tokens each one holds, plus summary fields: UTxO count, pure-ADA UTxO count, the largest pure-ADA UTxO and the collateral UTxO. This includes the UTxOs of all addresses associated with this wallet, not just the address provided. UTxOs are sorted by ADA amount, largest first, and paginated with limit/offset.";

export const getWalletUtxosInputSchema = {
  address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
  limit: z
    .preprocess(
      (val) => (val === null || val === "" ? undefined : val),
      z.number().int().min(1).max(MAX_UTXO_LIMIT).default(DEFAULT_UTXO_LIMIT),
    )
    .describe(`Number of UTxOs to return (1-${MAX_UTXO_LIMIT}, default ${DEFAULT_UTXO_LIMIT})`),
  offset: z
    .preprocess((val) => (val === null || val === "" ? undefined : val), z.number().int().min(0).default(0))
    .describe("Number of UTxOs to skip, for pagination (default 0)"),
};

export function registerGetWalletUtxos(server: McpServer): void {
  server.registerTool(
    "get_wallet_utxos",
    {
      title: "Get Wallet UTxOs",
      description: GET_WALLET_UTXOS_DESCRIPTION,
      inputSchema: getWalletUtxosInputSchema,
      outputSchema: utxosOutputSchema,
    },
    getWalletUtxosHandler,
  );
}
