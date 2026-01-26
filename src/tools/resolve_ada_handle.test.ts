import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResolveAdaHandle } from "./resolve_ada_handle.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { AdaHandleOwnerResponse } from "../types/api/schemas.js";

describe("resolve_ada_handle tool", () => {
  let registeredHandler: (args: { handle: string }) => Promise<unknown>;
  let resolveAdaHandleSpy: jest.SpiedFunction<typeof VesprApiRepository.resolveAdaHandle>;

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { handle: string }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerResolveAdaHandle(mockServer);

    // Spy on the repository method
    resolveAdaHandleSpy = jest.spyOn(VesprApiRepository, "resolveAdaHandle");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("input validation", () => {
    it("returns error for empty handle", async () => {
      const result = await registeredHandler({ handle: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Handle cannot be empty." }],
        isError: true,
      });

      expect(resolveAdaHandleSpy).not.toHaveBeenCalled();
    });

    it("returns error for whitespace-only handle", async () => {
      const result = await registeredHandler({ handle: "   " });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Handle cannot be empty." }],
        isError: true,
      });

      expect(resolveAdaHandleSpy).not.toHaveBeenCalled();
    });

    it("returns error for lone $ character", async () => {
      const result = await registeredHandler({ handle: "$" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Handle cannot be empty." }],
        isError: true,
      });

      expect(resolveAdaHandleSpy).not.toHaveBeenCalled();
    });
  });

  describe("handle resolution", () => {
    it("resolves handle with $ prefix correctly", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner:
          "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ handle: "$myhandle" })) as {
        content: { type: string; text: string }[];
        structuredContent: { handle: string; owner: string | null; found: boolean };
      };

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("$myhandle");

      // Check structured content
      expect(result.structuredContent.handle).toBe("myhandle");
      expect(result.structuredContent.owner).toBe(mockResponse.owner);
      expect(result.structuredContent.found).toBe(true);

      // Check text content
      expect(result.content[0].text).toContain("Handle: $myhandle");
      expect(result.content[0].text).toContain(`Owner: ${mockResponse.owner}`);
    });

    it("resolves handle without $ prefix correctly", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner:
          "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ handle: "myhandle" })) as {
        content: { type: string; text: string }[];
        structuredContent: { handle: string; owner: string | null; found: boolean };
      };

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("myhandle");

      // Check structured content
      expect(result.structuredContent.handle).toBe("myhandle");
      expect(result.structuredContent.owner).toBe(mockResponse.owner);
      expect(result.structuredContent.found).toBe(true);

      // Check text content
      expect(result.content[0].text).toContain("Handle: $myhandle");
      expect(result.content[0].text).toContain(`Owner: ${mockResponse.owner}`);
    });

    it("handles non-existent handle correctly", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner: null,
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ handle: "nonexistent" })) as {
        content: { type: string; text: string }[];
        structuredContent: { handle: string; owner: string | null; found: boolean };
      };

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("nonexistent");

      // Check structured content
      expect(result.structuredContent.handle).toBe("nonexistent");
      expect(result.structuredContent.owner).toBeNull();
      expect(result.structuredContent.found).toBe(false);

      // Check text content
      expect(result.content[0].text).toContain("Handle: $nonexistent");
      expect(result.content[0].text).toContain("Status: Not found");
    });
  });

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      resolveAdaHandleSpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ handle: "myhandle" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles unexpected errors gracefully", async () => {
      resolveAdaHandleSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ handle: "myhandle" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      resolveAdaHandleSpy.mockRejectedValue("String error");

      const result = (await registeredHandler({ handle: "myhandle" })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
