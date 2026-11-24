import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTransactionStatus, getTransactionStatusHandler, MAX_TX_HASHES } from "./get_transaction_status.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import { TxStatusResponseSchema } from "../types/api/schemas.js";

const ON_CHAIN_TX = "317e3fb837".padEnd(64, "a");
const PENDING_TX = "cd".repeat(32);

/** Backend JSON as sent by /v1/wallet/txstatus: `block: null` for a transaction in no block up to the tip. */
const statusJson: unknown = {
  tip: { slot: 175000000, height: 12900000 },
  transactions: [
    { tx_hash: ON_CHAIN_TX, block: { slot: 174990000, height: 12899500 } },
    { tx_hash: PENDING_TX, block: null },
  ],
};

const status = TxStatusResponseSchema.parse(statusJson);

describe("get_transaction_status tool", () => {
  let statusSpy: jest.SpiedFunction<typeof VesprApiRepository.getTxStatus>;

  beforeEach(() => {
    statusSpy = jest.spyOn(VesprApiRepository, "getTxStatus").mockResolvedValue(status);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers getTransactionStatusHandler as the get_transaction_status tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const registerTool = jest.spyOn(server, "registerTool");

    registerGetTransactionStatus(server);

    expect(registerTool).toHaveBeenCalledWith(
      "get_transaction_status",
      expect.objectContaining({ title: expect.any(String) }),
      getTransactionStatusHandler,
    );
  });

  it("rejects an invalid hash without calling the API", async () => {
    const result = await getTransactionStatusHandler({ tx_hashes: [ON_CHAIN_TX, "317e3f"] });

    expect(result).toEqual({
      content: [{ type: "text", text: 'Error: Invalid transaction hash "317e3f". It should be 64 hex characters.' }],
      isError: true,
    });
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it.each([[[]], [Array.from({ length: MAX_TX_HASHES + 1 }, (_, i) => i.toString(16).padStart(64, "0"))]])(
    "rejects %#: too few or too many hashes",
    async (txHashes) => {
      const result = await getTransactionStatusHandler({ tx_hashes: txHashes });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(`between 1 and ${MAX_TX_HASHES}`);
      expect(statusSpy).not.toHaveBeenCalled();
    },
  );

  it("lowercases and dedupes hashes, then reports block, slot and confirmations per hash", async () => {
    const result = await getTransactionStatusHandler({
      tx_hashes: [ON_CHAIN_TX.toUpperCase(), PENDING_TX, ` ${ON_CHAIN_TX} `],
    });

    expect(statusSpy).toHaveBeenCalledWith([ON_CHAIN_TX, PENDING_TX]);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      tip: { slot: 175000000, height: 12900000 },
      transactions: [
        { tx_hash: ON_CHAIN_TX, on_chain: true, block_height: 12899500, slot: 174990000, confirmations: 501 },
        { tx_hash: PENDING_TX, on_chain: false, block_height: null, slot: null, confirmations: null },
      ],
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Chain tip: block 12900000, slot 175000000");
    expect(text).toContain(`- ${ON_CHAIN_TX}: on-chain in block 12899500 (slot 174990000), 501 confirmations`);
    expect(text).toContain(`- ${PENDING_TX}: not on-chain as of slot 175000000`);
  });

  it("treats a hash missing from the response as not on-chain and counts the tip block as 1 confirmation", async () => {
    statusSpy.mockResolvedValue({
      tip: { slot: 100, height: 50 },
      transactions: [{ tx_hash: ON_CHAIN_TX, block: { slot: 100, height: 50 } }],
    });

    const result = await getTransactionStatusHandler({ tx_hashes: [ON_CHAIN_TX, PENDING_TX] });

    expect(result.structuredContent?.transactions.map((tx) => [tx.on_chain, tx.confirmations])).toEqual([
      [true, 1],
      [false, null],
    ]);
    expect(result.content[0]?.text).toContain("1 confirmation\n");
  });

  it("returns the API error message for a VesprApiError", async () => {
    statusSpy.mockRejectedValue(new VesprApiError("Request failed", 500));

    const result = await getTransactionStatusHandler({ tx_hashes: [ON_CHAIN_TX] });

    expect(result).toEqual({ content: [{ type: "text", text: "Error: Request failed" }], isError: true });
  });

  it("returns an unexpected error for other failures", async () => {
    statusSpy.mockRejectedValue(new Error("boom"));

    const result = await getTransactionStatusHandler({ tx_hashes: [ON_CHAIN_TX] });

    expect(result).toEqual({
      content: [{ type: "text", text: "Error: An unexpected error occurred. boom" }],
      isError: true,
    });
  });
});
