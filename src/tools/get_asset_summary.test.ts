import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetAssetSummary } from "./get_asset_summary.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { AssetSummaryResponse } from "../types/api/schemas.js";

describe("get_asset_summary tool", () => {
  let registeredHandler: (args: { units: string[] }) => Promise<unknown>;
  let getAssetSummarySpy: jest.SpiedFunction<typeof VesprApiRepository.getAssetSummary>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { units: string[] }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetAssetSummary(mockServer);

    // Spy on the repository method
    getAssetSummarySpy = jest.spyOn(VesprApiRepository, "getAssetSummary");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for empty array", async () => {
      const result = await registeredHandler({ units: [] });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Units array cannot be empty." }],
        isError: true,
      });

      expect(getAssetSummarySpy).not.toHaveBeenCalled();
    });

    it("returns error for array with only whitespace strings", async () => {
      const result = await registeredHandler({ units: ["   ", "  ", ""] });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: All provided units are empty or whitespace." }],
        isError: true,
      });

      expect(getAssetSummarySpy).not.toHaveBeenCalled();
    });

    it("returns error when exceeding max limit of 100 assets", async () => {
      const units = Array(101).fill("unit123");

      const result = await registeredHandler({ units });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Maximum 100 assets allowed per request. Received 101." }],
        isError: true,
      });

      expect(getAssetSummarySpy).not.toHaveBeenCalled();
    });

    it("accepts exactly 100 assets", async () => {
      const units = Array(100).fill("unit123");
      const mockResponse: AssetSummaryResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ units })) as {
        content: { type: string; text: string }[];
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      expect(getAssetSummarySpy).toHaveBeenCalledWith(units);
    });
  });

  describe("asset summary retrieval", () => {
    const testUnits = [
      "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a68616e646c65",
      "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
    ];

    it("returns single asset summary correctly", async () => {
      const mockResponse: AssetSummaryResponse = {
        tokens: [
          {
            policy: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
            hex_asset_name: "484f534b59",
            name: "HOSKY",
            ticker: "HOSKY",
            decimals: 0,
            image: { type: "URL_IMAGE", image: "https://example.com/hosky.png" },
            verified: true,
            registered_name: "HOSKY Token",
          },
        ],
        nfts: [],
        other_nfts: [],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ units: [testUnits[0]] })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          queried_count: number;
          tokens: Array<{
            policy: string;
            hex_asset_name: string;
            name: string;
            ticker?: string;
            decimals: number;
            verified: boolean;
            image: { type: string; image?: string };
          }>;
          nfts: Array<{ policy: string; hex_asset_name: string; name: string; image: { type: string } }>;
          other_nfts: Array<{ policy: string; hex_asset_name: string; name: string; image: { type: string } }>;
        };
      };

      expect(getAssetSummarySpy).toHaveBeenCalledWith([testUnits[0]]);

      // Check structured content
      expect(result.structuredContent.queried_count).toBe(1);
      expect(result.structuredContent.tokens).toHaveLength(1);
      expect(result.structuredContent.tokens[0].name).toBe("HOSKY");
      expect(result.structuredContent.tokens[0].ticker).toBe("HOSKY");
      expect(result.structuredContent.tokens[0].verified).toBe(true);
      expect(result.structuredContent.tokens[0].image.type).toBe("URL_IMAGE");
      expect(result.structuredContent.tokens[0].image.image).toBe("https://example.com/hosky.png");
      expect(result.structuredContent.nfts).toHaveLength(0);
      expect(result.structuredContent.other_nfts).toHaveLength(0);

      // Check text content
      expect(result.content[0].text).toContain("Asset Summary (1 assets queried)");
      expect(result.content[0].text).toContain("Tokens (1):");
      expect(result.content[0].text).toContain("HOSKY (HOSKY) - Verified: Yes [Has Image: URL]");
    });

    it("categorizes multiple assets correctly", async () => {
      const mockResponse: AssetSummaryResponse = {
        tokens: [
          {
            policy: "policy1",
            hex_asset_name: "hex1",
            name: "Token1",
            ticker: "TKN1",
            decimals: 6,
            image: { type: "URL_IMAGE", image: "https://example.com/token1.png" },
            verified: true,
          },
          {
            policy: "policy2",
            hex_asset_name: "hex2",
            name: "Token2",
            decimals: 0,
            image: { type: "CID_IMAGE", image: "QmXyz123abc" },
            verified: false,
          },
        ],
        nfts: [
          {
            policy: "policy3",
            hex_asset_name: "hex3",
            name: "CoolNFT",
            image: { type: "NO_IMAGE" },
          },
        ],
        other_nfts: [
          {
            policy: "policy4",
            hex_asset_name: "hex4",
            name: "OtherNFT",
            image: { type: "BASE64_IMAGE", image: "base64data", image_encoding: "image/png" },
          },
        ],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ units: testUnits })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          queried_count: number;
          tokens: Array<{ name: string; verified: boolean; image: { type: string; image?: string } }>;
          nfts: Array<{ name: string; image: { type: string } }>;
          other_nfts: Array<{ name: string; image: { type: string; image?: string; image_encoding?: string } }>;
        };
      };

      // Check structured content
      expect(result.structuredContent.queried_count).toBe(2);
      expect(result.structuredContent.tokens).toHaveLength(2);
      expect(result.structuredContent.nfts).toHaveLength(1);
      expect(result.structuredContent.other_nfts).toHaveLength(1);

      // Verify all image types are included
      expect(result.structuredContent.tokens[0].image.type).toBe("URL_IMAGE");
      expect(result.structuredContent.tokens[0].image.image).toBe("https://example.com/token1.png");
      expect(result.structuredContent.tokens[1].image.type).toBe("CID_IMAGE");
      expect(result.structuredContent.tokens[1].image.image).toBe("QmXyz123abc");
      expect(result.structuredContent.nfts[0].image.type).toBe("NO_IMAGE");
      expect(result.structuredContent.other_nfts[0].image.type).toBe("BASE64_IMAGE");
      expect(result.structuredContent.other_nfts[0].image.image).toBe("base64data");
      expect(result.structuredContent.other_nfts[0].image.image_encoding).toBe("image/png");

      // Check text content includes all categories with image indicators
      const text = result.content[0].text;
      expect(text).toContain("Asset Summary (2 assets queried)");
      expect(text).toContain("Tokens (2):");
      expect(text).toContain("Token1 (TKN1) - Verified: Yes [Has Image: URL]");
      expect(text).toContain("Token2 - Verified: No [Has Image: IPFS]");
      expect(text).toContain("NFTs (1):");
      expect(text).toContain("CoolNFT [No Image]");
      expect(text).toContain("Other NFTs (1):");
      expect(text).toContain("OtherNFT [Has Image: Base64]");
    });

    it("handles empty response correctly", async () => {
      const mockResponse: AssetSummaryResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ units: [testUnits[0]] })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          queried_count: number;
          tokens: Array<unknown>;
          nfts: Array<unknown>;
          other_nfts: Array<unknown>;
        };
      };

      // Check structured content
      expect(result.structuredContent.queried_count).toBe(1);
      expect(result.structuredContent.tokens).toHaveLength(0);
      expect(result.structuredContent.nfts).toHaveLength(0);
      expect(result.structuredContent.other_nfts).toHaveLength(0);

      // Check text content shows empty categories
      const text = result.content[0].text;
      expect(text).toContain("No fungible tokens found");
      expect(text).toContain("No NFTs found");
      expect(text).toContain("No other NFTs found");
    });

    it("trims whitespace from unit parameters", async () => {
      const mockResponse: AssetSummaryResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      await registeredHandler({ units: [`  ${testUnits[0]}  `, `  ${testUnits[1]}  `] });

      expect(getAssetSummarySpy).toHaveBeenCalledWith([testUnits[0], testUnits[1]]);
    });

    it("filters out empty strings from units", async () => {
      const mockResponse: AssetSummaryResponse = {
        tokens: [],
        nfts: [],
        other_nfts: [],
      };

      getAssetSummarySpy.mockResolvedValue(mockResponse);

      await registeredHandler({ units: [testUnits[0], "", "   ", testUnits[1]] });

      // Should only pass non-empty, trimmed units
      expect(getAssetSummarySpy).toHaveBeenCalledWith([testUnits[0], testUnits[1]]);
    });
  });

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      getAssetSummarySpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ units: ["someunit"] })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles 400 errors gracefully", async () => {
      getAssetSummarySpy.mockRejectedValue(new VesprApiError("Bad request", 400));

      const result = (await registeredHandler({ units: ["badunit"] })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Bad request");
    });

    it("handles unexpected errors gracefully", async () => {
      getAssetSummarySpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ units: ["someunit"] })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      getAssetSummarySpy.mockRejectedValue("String error");

      const result = (await registeredHandler({ units: ["someunit"] })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
