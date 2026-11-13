import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { lovelaceToAda } from "../utils/cardano.js";
import { isValidCardanoAddress } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";

// Output schemas
const transactionOutputSchema = z.object({
  txHash: z.string(),
  timestamp: z.string(),
  blockHeight: z.number(),
  direction: z.enum(["Received", "Sent", "Self Transfer", "Multisig"]),
  adaAmount: z.string(),
  fee: z.string(),
  assetCount: z.number(),
});

// Direction mapping from API values to human-readable labels
type ApiDirection = "self" | "externalOut" | "externalIn" | "multisig";

const directionLabels: Record<ApiDirection, z.infer<typeof transactionOutputSchema>["direction"]> = {
  externalIn: "Received",
  externalOut: "Sent",
  self: "Self Transfer",
  multisig: "Multisig",
};

const directionSymbols: Record<ApiDirection, string> = {
  externalIn: "\u2193", // DOWN arrow (receiving)
  externalOut: "\u2191", // UP arrow (sending)
  self: "\u21C4", // LEFT RIGHT ARROW
  multisig: "\u21C6", // LEFT RIGHT ARROW WITH STROKE
};

const historyOutputSchema = z.object({
  sinceBlock: z.number(),
  toBlock: z.number(),
  transactionCount: z.number(),
  transactions: z.array(transactionOutputSchema),
});

/**
 * Handler for get_transaction_history tool
 */
export async function getTransactionHistoryHandler({
  address,
  to_block,
}: {
  address: string;
  to_block?: number;
}): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: z.infer<typeof historyOutputSchema>;
  isError?: boolean;
}> {
  // Validate address
  if (!isValidCardanoAddress(address)) {
    return {
      content: [{ type: "text" as const, text: "Error: Invalid Cardano address." }],
      isError: true,
    };
  }

  try {
    const response = await VesprApiRepository.getTransactionHistory(address, to_block);

    // Transform transactions for output
    const transactions = response.transactions.map((tx) => ({
      txHash: tx.txHash,
      timestamp: tx.timestamp,
      blockHeight: tx.blockHeight,
      direction: directionLabels[tx.direction],
      adaAmount: lovelaceToAda(tx.lovelace),
      fee: lovelaceToAda(tx.txFee),
      assetCount: tx.assets.length,
    }));

    const output = {
      sinceBlock: response.sinceBlock,
      toBlock: response.toBlock,
      transactionCount: transactions.length,
      transactions,
    };

    // Format human-readable summary using direction symbols and amount prefixes
    const summary = [
      `Transaction History (blocks ${response.sinceBlock} - ${response.toBlock})`,
      `Total: ${transactions.length} transaction(s)`,
      "",
      ...transactions.slice(0, 10).map((tx, i) => {
        // transactions maps response.transactions 1:1, so the index lines up
        const apiDirection = response.transactions[i].direction;
        // adaAmount is signed (sent amounts are negative), so only positive amounts need a "+"
        const sign = tx.adaAmount.startsWith("-") ? "" : "+";
        return `${directionSymbols[apiDirection]} ${sign}${tx.adaAmount} ADA | ${tx.direction} | ${tx.timestamp} | ${tx.assetCount} assets | ${tx.txHash.slice(0, 16)}...`;
      }),
      transactions.length > 10 ? `... and ${transactions.length - 10} more` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [{ type: "text" as const, text: summary }],
      structuredContent: output,
    };
  } catch (error) {
    if (error instanceof VesprApiError) {
      return {
        content: [{ type: "text" as const, text: `Error: ${error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }],
      isError: true,
    };
  }
}

export function registerGetTransactionHistory(server: McpServer): void {
  server.registerTool(
    "get_transaction_history",
    {
      title: "Get Transaction History",
      description:
        "Query transaction history for a Cardano wallet address. Returns recent transactions with direction (IN/OUT), amounts, and asset transfers.",
      inputSchema: {
        address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
        to_block: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional: Filter transactions up to this block height"),
      },
      outputSchema: historyOutputSchema,
    },
    getTransactionHistoryHandler,
  );
}
