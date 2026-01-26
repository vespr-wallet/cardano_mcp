import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetAssetMetadata } from "./get_asset_metadata.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { AssetMetadataResponse } from "../types/api/schemas.js";

describe("get_asset_metadata tool", () => {
  let registeredHandler: (args: { unit: string }) => Promise<unknown>;
  let getAssetMetadataSpy: jest.SpiedFunction<typeof VesprApiRepository.getAssetMetadata>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { unit: string }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetAssetMetadata(mockServer);

    // Spy on the repository method
    getAssetMetadataSpy = jest.spyOn(VesprApiRepository, "getAssetMetadata");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for empty unit", async () => {
      const result = await registeredHandler({ unit: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Asset unit cannot be empty." }],
        isError: true,
      });

      expect(getAssetMetadataSpy).not.toHaveBeenCalled();
    });

    it("returns error for whitespace-only unit", async () => {
      const result = await registeredHandler({ unit: "   " });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Asset unit cannot be empty." }],
        isError: true,
      });

      expect(getAssetMetadataSpy).not.toHaveBeenCalled();
    });
  });

  describe("metadata retrieval", () => {
    const testUnit = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a68616e646c65";

    it("returns asset with metadata correctly", async () => {
      const mockResponse: AssetMetadataResponse = {
        name: "TestNFT",
        onchain_metadata: {
          name: "Test NFT",
          image: "ipfs://QmTest123",
          description: "A test NFT for unit testing",
        },
      };

      getAssetMetadataSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: testUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          unit: string;
          name: string;
          has_metadata: boolean;
          onchain_metadata: Record<string, unknown> | null;
        };
      };

      expect(getAssetMetadataSpy).toHaveBeenCalledWith(testUnit);

      // Check structured content
      expect(result.structuredContent.unit).toBe(testUnit);
      expect(result.structuredContent.name).toBe("TestNFT");
      expect(result.structuredContent.has_metadata).toBe(true);
      expect(result.structuredContent.onchain_metadata).toEqual(mockResponse.onchain_metadata);

      // Check text content includes metadata
      expect(result.content[0].text).toContain("Asset: TestNFT");
      expect(result.content[0].text).toContain(`Unit: ${testUnit}`);
      expect(result.content[0].text).toContain("On-chain Metadata:");
      expect(result.content[0].text).toContain("name: Test NFT");
      expect(result.content[0].text).toContain("image: ipfs://QmTest123");
    });

    it("returns asset without metadata correctly", async () => {
      const mockResponse: AssetMetadataResponse = {
        name: "SimpleToken",
        onchain_metadata: null,
      };

      getAssetMetadataSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: testUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          unit: string;
          name: string;
          has_metadata: boolean;
          onchain_metadata: Record<string, unknown> | null;
        };
      };

      expect(getAssetMetadataSpy).toHaveBeenCalledWith(testUnit);

      // Check structured content
      expect(result.structuredContent.unit).toBe(testUnit);
      expect(result.structuredContent.name).toBe("SimpleToken");
      expect(result.structuredContent.has_metadata).toBe(false);
      expect(result.structuredContent.onchain_metadata).toBeNull();

      // Check text content shows no metadata status
      expect(result.content[0].text).toContain("Asset: SimpleToken");
      expect(result.content[0].text).toContain(`Unit: ${testUnit}`);
      expect(result.content[0].text).toContain("Status: No on-chain metadata found");
    });

    it("handles complex nested metadata", async () => {
      const mockResponse: AssetMetadataResponse = {
        name: "ComplexNFT",
        onchain_metadata: {
          name: "Complex NFT",
          attributes: {
            rarity: "legendary",
            power: 100,
          },
          files: [
            { mediaType: "image/png", src: "ipfs://QmImage" },
            { mediaType: "video/mp4", src: "ipfs://QmVideo" },
          ],
          extra: null,
        },
      };

      getAssetMetadataSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ unit: testUnit })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          unit: string;
          name: string;
          has_metadata: boolean;
          onchain_metadata: Record<string, unknown> | null;
        };
      };

      // Check structured content preserves nested structure
      expect(result.structuredContent.has_metadata).toBe(true);
      expect(result.structuredContent.onchain_metadata).toEqual(mockResponse.onchain_metadata);

      // Check text content includes nested data
      const text = result.content[0].text;
      expect(text).toContain("On-chain Metadata:");
      expect(text).toContain("attributes:");
      expect(text).toContain("rarity: legendary");
      expect(text).toContain("power: 100");
      expect(text).toContain("files:");
      expect(text).toContain("mediaType: image/png");
    });

    it("trims whitespace from unit parameter", async () => {
      const mockResponse: AssetMetadataResponse = {
        name: "TestToken",
        onchain_metadata: null,
      };

      getAssetMetadataSpy.mockResolvedValue(mockResponse);

      await registeredHandler({ unit: `  ${testUnit}  ` });

      expect(getAssetMetadataSpy).toHaveBeenCalledWith(testUnit);
    });
  });

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      getAssetMetadataSpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ unit: "someunit" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles 404 errors gracefully", async () => {
      getAssetMetadataSpy.mockRejectedValue(new VesprApiError("Asset not found", 404));

      const result = (await registeredHandler({ unit: "nonexistent" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Asset not found");
    });

    it("handles unexpected errors gracefully", async () => {
      getAssetMetadataSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ unit: "someunit" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      getAssetMetadataSpy.mockRejectedValue("String error");

      const result = (await registeredHandler({ unit: "someunit" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
