import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetPoolInfo } from "./get_pool_info.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { PoolInfoResponse } from "../types/api/schemas.js";

describe("get_pool_info tool", () => {
  let registeredHandler: (args: { pool_id: string }) => Promise<unknown>;
  let getPoolInfoSpy: jest.SpiedFunction<typeof VesprApiRepository.getPoolInfo>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { pool_id: string }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetPoolInfo(mockServer);

    // Spy on the repository method
    getPoolInfoSpy = jest.spyOn(VesprApiRepository, "getPoolInfo");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for invalid pool ID format", async () => {
      const result = await registeredHandler({ pool_id: "invalid" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid pool ID. Pool IDs must start with 'pool1' prefix." }],
        isError: true,
      });

      expect(getPoolInfoSpy).not.toHaveBeenCalled();
    });

    it("returns error for empty pool ID", async () => {
      const result = await registeredHandler({ pool_id: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid pool ID. Pool IDs must start with 'pool1' prefix." }],
        isError: true,
      });

      expect(getPoolInfoSpy).not.toHaveBeenCalled();
    });

    it("returns error for pool ID with wrong prefix", async () => {
      const result = await registeredHandler({
        pool_id: "stake1uyehkck0lajq8gr28t9uxnuvgcqmny6k328vp686mhf7hcgrf8swf",
      });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid pool ID. Pool IDs must start with 'pool1' prefix." }],
        isError: true,
      });

      expect(getPoolInfoSpy).not.toHaveBeenCalled();
    });

    it("returns error for too short pool ID", async () => {
      const result = await registeredHandler({ pool_id: "pool1abc" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid pool ID. Pool IDs must start with 'pool1' prefix." }],
        isError: true,
      });

      expect(getPoolInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe("pool info retrieval", () => {
    const testPoolId = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

    it("returns pool info with metadata correctly", async () => {
      const mockResponse: PoolInfoResponse = {
        response_time_utc: 1700000000000,
        pool_id_bech32: testPoolId,
        detail: {
          name: "Test Pool",
          ticker: "TEST",
          homepage: "https://testpool.com",
          description: "A test stake pool for unit testing",
          image: {
            type: "URL_IMAGE",
            image: "https://testpool.com/logo.png",
          },
        },
        active_stake_lovelace: "1000000000000", // 1M ADA
        live_stake_lovelace: "1100000000000", // 1.1M ADA
        saturation: 0.5,
        state: "registered",
        apy: 0.045,
        pledge: "500000000000", // 500K ADA
        dtu: 0.95,
        total_blocks: 1234,
        delegators_count: 567,
        fixed_fee: "340000000", // 340 ADA
        variable_fee: 0.02,
        history: [],
      };

      getPoolInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          pool_id: string;
          name: string | null;
          ticker: string | null;
          state: string;
          apy: number;
          saturation: number;
          delegators_count: number;
          active_stake_ada: string;
          live_stake_ada: string;
          pledge_ada: string;
          fixed_fee_ada: string;
          variable_fee: number;
          total_blocks: number;
        };
      };

      expect(getPoolInfoSpy).toHaveBeenCalledWith(testPoolId);

      // Check structured content
      expect(result.structuredContent.pool_id).toBe(testPoolId);
      expect(result.structuredContent.name).toBe("Test Pool");
      expect(result.structuredContent.ticker).toBe("TEST");
      expect(result.structuredContent.state).toBe("registered");
      expect(result.structuredContent.apy).toBe(0.045);
      expect(result.structuredContent.saturation).toBe(0.5);
      expect(result.structuredContent.delegators_count).toBe(567);
      expect(result.structuredContent.active_stake_ada).toBe("1000000.000000");
      expect(result.structuredContent.live_stake_ada).toBe("1100000.000000");
      expect(result.structuredContent.pledge_ada).toBe("500000.000000");
      expect(result.structuredContent.fixed_fee_ada).toBe("340.000000");
      expect(result.structuredContent.variable_fee).toBe(0.02);
      expect(result.structuredContent.total_blocks).toBe(1234);

      // Check text content includes key info
      expect(result.content[0].text).toContain("Pool: Test Pool (TEST)");
      expect(result.content[0].text).toContain("State: Registered (Active)");
      expect(result.content[0].text).toContain("APY: 4.50%");
      expect(result.content[0].text).toContain("Saturation: 50.00%");
      expect(result.content[0].text).toContain("Delegators: 567");
      expect(result.content[0].text).toContain("Total Blocks: 1,234");
    });

    it("handles pool without metadata (detail=null)", async () => {
      const mockResponse: PoolInfoResponse = {
        response_time_utc: 1700000000000,
        pool_id_bech32: testPoolId,
        detail: null,
        active_stake_lovelace: "500000000000",
        live_stake_lovelace: "550000000000",
        saturation: 0.25,
        state: "registered",
        apy: 0.04,
        pledge: "100000000000",
        dtu: null,
        total_blocks: 100,
        delegators_count: 50,
        fixed_fee: "340000000",
        variable_fee: 0.01,
        history: [],
      };

      getPoolInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          pool_id: string;
          name: string | null;
          ticker: string | null;
          description: string | null;
          homepage: string | null;
        };
      };

      expect(getPoolInfoSpy).toHaveBeenCalledWith(testPoolId);

      // Check structured content for null metadata
      expect(result.structuredContent.pool_id).toBe(testPoolId);
      expect(result.structuredContent.name).toBeNull();
      expect(result.structuredContent.ticker).toBeNull();
      expect(result.structuredContent.description).toBeNull();
      expect(result.structuredContent.homepage).toBeNull();

      // Check text content uses fallbacks
      expect(result.content[0].text).toContain("Pool: Unknown Pool");
      expect(result.content[0].text).toContain(`(${testPoolId.slice(0, 10)})`);
    });

    it("handles retiring pool state", async () => {
      const mockResponse: PoolInfoResponse = {
        response_time_utc: 1700000000000,
        pool_id_bech32: testPoolId,
        detail: {
          name: "Retiring Pool",
          ticker: "RET",
          homepage: "",
          description: "",
          image: { type: "URL_IMAGE", image: "" },
        },
        active_stake_lovelace: "100000000000",
        live_stake_lovelace: "80000000000",
        saturation: 0.1,
        state: "retiring",
        apy: 0.03,
        pledge: "50000000000",
        dtu: null,
        total_blocks: 50,
        delegators_count: 10,
        fixed_fee: "340000000",
        variable_fee: 0.015,
        history: [],
      };

      getPoolInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        structuredContent: { state: string };
      };

      expect(result.structuredContent.state).toBe("retiring");
      expect(result.content[0].text).toContain("State: Retiring");
    });

    it("handles retired pool state", async () => {
      const mockResponse: PoolInfoResponse = {
        response_time_utc: 1700000000000,
        pool_id_bech32: testPoolId,
        detail: {
          name: "Retired Pool",
          ticker: "OLD",
          homepage: "",
          description: "",
          image: { type: "URL_IMAGE", image: "" },
        },
        active_stake_lovelace: "0",
        live_stake_lovelace: "0",
        saturation: 0,
        state: "retired",
        apy: 0,
        pledge: "0",
        dtu: null,
        total_blocks: 500,
        delegators_count: 0,
        fixed_fee: "340000000",
        variable_fee: 0.02,
        history: [],
      };

      getPoolInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        structuredContent: { state: string };
      };

      expect(result.structuredContent.state).toBe("retired");
      expect(result.content[0].text).toContain("State: Retired");
    });

    it("trims whitespace from pool_id parameter", async () => {
      const mockResponse: PoolInfoResponse = {
        response_time_utc: 1700000000000,
        pool_id_bech32: testPoolId,
        detail: null,
        active_stake_lovelace: "100000000000",
        live_stake_lovelace: "100000000000",
        saturation: 0.1,
        state: "registered",
        apy: 0.04,
        pledge: "50000000000",
        dtu: null,
        total_blocks: 100,
        delegators_count: 10,
        fixed_fee: "340000000",
        variable_fee: 0.01,
        history: [],
      };

      getPoolInfoSpy.mockResolvedValue(mockResponse);

      await registeredHandler({ pool_id: `  ${testPoolId}  ` });

      expect(getPoolInfoSpy).toHaveBeenCalledWith(testPoolId);
    });
  });

  describe("error handling", () => {
    const testPoolId = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

    it("handles API errors gracefully", async () => {
      getPoolInfoSpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles 404 errors gracefully", async () => {
      getPoolInfoSpy.mockRejectedValue(new VesprApiError("Pool not found", 404));

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Pool not found");
    });

    it("handles unexpected errors gracefully", async () => {
      getPoolInfoSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      getPoolInfoSpy.mockRejectedValue("String error");

      const result = (await registeredHandler({ pool_id: testPoolId })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
