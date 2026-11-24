import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { normalizeTxHash } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";

/** Most hashes one call checks (the backend's limit). */
export const MAX_TX_HASHES = 25;

const chainPointSchema = z.object({
  slot: z.number().int().describe("Slot number"),
  height: z.number().int().describe("Block height"),
});

const txStatusSchema = z.object({
  tx_hash: z.string().describe("Transaction hash (lowercase)"),
  on_chain: z.boolean().describe("Whether the transaction is in a block"),
  block_height: z.number().int().nullable().describe("Height of the block holding the transaction"),
  slot: z.number().int().nullable().describe("Slot of the block holding the transaction"),
  confirmations: z.number().int().nullable().describe("Blocks from the transaction's block to the tip, inclusive"),
});

const txStatusOutputSchema = z.object({
  tip: chainPointSchema.describe("Chain tip the answer holds for"),
  transactions: z.array(txStatusSchema).describe("Status of each requested transaction, in request order"),
});

type TxStatusOutput = z.infer<typeof txStatusOutputSchema>;

function errorResult(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/**
 * Handler for get_transaction_status tool
 */
export async function getTransactionStatusHandler({ tx_hashes }: { tx_hashes: string[] }): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: TxStatusOutput;
  isError?: boolean;
}> {
  const hashes: string[] = [];
  for (const txHash of tx_hashes) {
    const normalized = normalizeTxHash(txHash);
    if (normalized === null) {
      return errorResult(`Invalid transaction hash "${txHash}". It should be 64 hex characters.`);
    }
    if (!hashes.includes(normalized)) {
      hashes.push(normalized);
    }
  }
  if (hashes.length === 0 || hashes.length > MAX_TX_HASHES) {
    return errorResult(`Provide between 1 and ${MAX_TX_HASHES} transaction hashes.`);
  }

  try {
    const response = await VesprApiRepository.getTxStatus(hashes);
    const byHash = new Map(response.transactions.map((tx) => [tx.tx_hash.toLowerCase(), tx.block]));

    const transactions = hashes.map((txHash) => {
      const block = byHash.get(txHash) ?? null;
      return {
        tx_hash: txHash,
        on_chain: block !== null,
        block_height: block?.height ?? null,
        slot: block?.slot ?? null,
        confirmations: block ? response.tip.height - block.height + 1 : null,
      };
    });

    const text = [
      `Chain tip: block ${response.tip.height}, slot ${response.tip.slot}`,
      ...transactions.map((tx) =>
        tx.on_chain
          ? `- ${tx.tx_hash}: on-chain in block ${tx.block_height} (slot ${tx.slot}), ${tx.confirmations} confirmation${tx.confirmations !== 1 ? "s" : ""}`
          : `- ${tx.tx_hash}: not on-chain as of slot ${response.tip.slot}`,
      ),
    ].join("\n");

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { tip: response.tip, transactions },
    };
  } catch (error) {
    if (error instanceof VesprApiError) {
      return errorResult(error.message);
    }
    return errorResult(`An unexpected error occurred. ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export const GET_TRANSACTION_STATUS_DESCRIPTION = `Check whether Cardano transactions are on-chain: for each hash, the block height, slot and confirmations, plus the chain tip the answer holds for. A transaction that isn't on-chain is in no block up to the tip (still pending, never submitted, or expired). Up to ${MAX_TX_HASHES} hashes per call.`;

export const getTransactionStatusInputSchema = {
  tx_hashes: z
    .array(z.string())
    .min(1)
    .max(MAX_TX_HASHES)
    .describe(`Transaction hashes to check (64 hex characters each, 1-${MAX_TX_HASHES})`),
};

export function registerGetTransactionStatus(server: McpServer): void {
  server.registerTool(
    "get_transaction_status",
    {
      title: "Get Transaction Status",
      description: GET_TRANSACTION_STATUS_DESCRIPTION,
      inputSchema: getTransactionStatusInputSchema,
      outputSchema: txStatusOutputSchema,
    },
    getTransactionStatusHandler,
  );
}
