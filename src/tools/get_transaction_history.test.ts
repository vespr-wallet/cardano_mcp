import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTransactionHistory } from "./get_transaction_history.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { TransactionHistoryResponse } from "../types/api/schemas.js";

describe("get_transaction_history tool", () => {
  let registeredHandler: (args: { address: string; to_block?: number }) => Promise<unknown>;
  let getTransactionHistorySpy: jest.SpiedFunction<typeof VesprApiRepository.getTransactionHistory>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (
          _name: string,
          _config: unknown,
          handler: (args: { address: string; to_block?: number }) => Promise<unknown>,
        ) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetTransactionHistory(mockServer);

    // Spy on the repository method
    getTransactionHistorySpy = jest.spyOn(VesprApiRepository, "getTransactionHistory");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("address validation", () => {
    it("returns error for invalid address", async () => {
      const result = await registeredHandler({ address: "invalid-address" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid Cardano address." }],
        isError: true,
      });

      // Should not call the API
      expect(getTransactionHistorySpy).not.toHaveBeenCalled();
    });

    it("returns error for empty address", async () => {
      const result = await registeredHandler({ address: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid Cardano address." }],
        isError: true,
      });

      expect(getTransactionHistorySpy).not.toHaveBeenCalled();
    });
  });

  describe("successful responses", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("returns formatted history for valid address", async () => {
      const mockResponse: TransactionHistoryResponse = {
        sinceBlock: 100000,
        toBlock: 100500,
        transactions: [
          {
            txHash: "abc123def456789012345678901234567890123456789012345678901234",
            date: "2023-11-14T12:00:00Z",
            timestamp: "2023-11-14T12:00:00Z",
            blockHeight: 100100,
            direction: "externalIn",
            extra: [],
            txFee: "170000",
            deposit: "0",
            lovelace: "5000000",
            assets: [],
          },
          {
            txHash: "xyz789abc123456789012345678901234567890123456789012345678901",
            date: "2023-11-14T12:01:40Z",
            timestamp: "2023-11-14T12:01:40Z",
            blockHeight: 100105,
            direction: "externalOut",
            extra: [],
            txFee: "200000",
            deposit: "0",
            lovelace: "2500000",
            assets: [
              {
                unit: "token1",
                quantity: "100",
                policy: "policy1",
                hexAssetName: "hex1",
                name: "Token1",
                fingerprint: "fp1",
                decimals: 0,
              },
            ],
          },
        ],
      };

      getTransactionHistorySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          sinceBlock: number;
          toBlock: number;
          transactionCount: number;
          transactions: {
            txHash: string;
            timestamp: string;
            blockHeight: number;
            direction: string;
            adaAmount: string;
            fee: string;
            assetCount: number;
          }[];
        };
      };

      expect(getTransactionHistorySpy).toHaveBeenCalledWith(validAddress, undefined);

      // Check structured content
      expect(result.structuredContent).toEqual({
        sinceBlock: 100000,
        toBlock: 100500,
        transactionCount: 2,
        transactions: [
          {
            txHash: "abc123def456789012345678901234567890123456789012345678901234",
            timestamp: "2023-11-14T12:00:00Z",
            blockHeight: 100100,
            direction: "Received",
            adaAmount: "5.000000",
            fee: "0.170000",
            assetCount: 0,
          },
          {
            txHash: "xyz789abc123456789012345678901234567890123456789012345678901",
            timestamp: "2023-11-14T12:01:40Z",
            blockHeight: 100105,
            direction: "Sent",
            adaAmount: "2.500000",
            fee: "0.200000",
            assetCount: 1,
          },
        ],
      });

      // Check text content includes direction symbols and labels
      expect(result.content[0].text).toContain("\u2193"); // DOWN arrow for Received
      expect(result.content[0].text).toContain("\u2191"); // UP arrow for Sent
      expect(result.content[0].text).toContain("+5.000000 ADA"); // + prefix for received
      expect(result.content[0].text).toContain("-2.500000 ADA"); // - prefix for sent
      expect(result.content[0].text).toContain("Received");
      expect(result.content[0].text).toContain("Sent");
    });

    it("handles all direction types correctly", async () => {
      const mockResponse: TransactionHistoryResponse = {
        sinceBlock: 100000,
        toBlock: 100500,
        transactions: [
          {
            txHash: "tx1hash12345678901234567890123456789012345678901234567890123",
            date: "2023-11-14T12:00:00Z",
            timestamp: "2023-11-14T12:00:00Z",
            blockHeight: 100100,
            direction: "externalIn",
            extra: [],
            txFee: "170000",
            deposit: "0",
            lovelace: "1000000",
            assets: [],
          },
          {
            txHash: "tx2hash12345678901234567890123456789012345678901234567890123",
            date: "2023-11-14T12:01:00Z",
            timestamp: "2023-11-14T12:01:00Z",
            blockHeight: 100101,
            direction: "externalOut",
            extra: [],
            txFee: "170000",
            deposit: "0",
            lovelace: "2000000",
            assets: [],
          },
          {
            txHash: "tx3hash12345678901234567890123456789012345678901234567890123",
            date: "2023-11-14T12:02:00Z",
            timestamp: "2023-11-14T12:02:00Z",
            blockHeight: 100102,
            direction: "self",
            extra: [],
            txFee: "170000",
            deposit: "0",
            lovelace: "3000000",
            assets: [],
          },
          {
            txHash: "tx4hash12345678901234567890123456789012345678901234567890123",
            date: "2023-11-14T12:03:00Z",
            timestamp: "2023-11-14T12:03:00Z",
            blockHeight: 100103,
            direction: "multisig",
            extra: [],
            txFee: "170000",
            deposit: "0",
            lovelace: "4000000",
            assets: [],
          },
        ],
      };

      getTransactionHistorySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          transactions: { direction: string }[];
        };
      };

      // Check all direction labels are mapped correctly
      expect(result.structuredContent.transactions[0].direction).toBe("Received");
      expect(result.structuredContent.transactions[1].direction).toBe("Sent");
      expect(result.structuredContent.transactions[2].direction).toBe("Self Transfer");
      expect(result.structuredContent.transactions[3].direction).toBe("Multisig");

      // Check text content includes all direction labels
      expect(result.content[0].text).toContain("Received");
      expect(result.content[0].text).toContain("Sent");
      expect(result.content[0].text).toContain("Self Transfer");
      expect(result.content[0].text).toContain("Multisig");
    });

    it("handles empty transaction list correctly", async () => {
      const mockResponse: TransactionHistoryResponse = {
        sinceBlock: 100000,
        toBlock: 100500,
        transactions: [],
      };

      getTransactionHistorySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          sinceBlock: number;
          toBlock: number;
          transactionCount: number;
          transactions: unknown[];
        };
      };

      expect(result.structuredContent.transactionCount).toBe(0);
      expect(result.structuredContent.transactions).toEqual([]);
      expect(result.content[0].text).toContain("Total: 0 transaction(s)");
    });

    it("passes to_block parameter correctly", async () => {
      const mockResponse: TransactionHistoryResponse = {
        sinceBlock: 100000,
        toBlock: 100200,
        transactions: [],
      };

      getTransactionHistorySpy.mockResolvedValue(mockResponse);

      await registeredHandler({ address: validAddress, to_block: 100200 });

      expect(getTransactionHistorySpy).toHaveBeenCalledWith(validAddress, 100200);
    });
  });

  describe("error handling", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("handles API errors gracefully", async () => {
      getTransactionHistorySpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles unexpected errors gracefully", async () => {
      getTransactionHistorySpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });
  });
});
