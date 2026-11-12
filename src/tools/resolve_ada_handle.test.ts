import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResolveAdaHandle, resolveAdaHandleHandler } from "./resolve_ada_handle.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import type { AdaHandleOwnerResponse } from "../types/api/schemas.js";

describe("resolve_ada_handle tool", () => {
  const registeredHandler = resolveAdaHandleHandler;
  let resolveAdaHandleSpy: jest.SpiedFunction<typeof VesprApiRepository.resolveAdaHandle>;

  beforeEach(() => {
    // Spy on the repository method
    resolveAdaHandleSpy = jest.spyOn(VesprApiRepository, "resolveAdaHandle");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers resolveAdaHandleHandler as the resolve_ada_handle tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const registerTool = jest.spyOn(server, "registerTool");

    registerResolveAdaHandle(server);

    expect(registerTool).toHaveBeenCalledWith(
      "resolve_ada_handle",
      expect.objectContaining({ title: expect.any(String) }),
      resolveAdaHandleHandler,
    );
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

      const result = await registeredHandler({ handle: "$myhandle" });

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("$myhandle");

      // Check structured content
      expect(result.structuredContent?.handle).toBe("myhandle");
      expect(result.structuredContent?.owner).toBe(mockResponse.owner);
      expect(result.structuredContent?.found).toBe(true);

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

      const result = await registeredHandler({ handle: "myhandle" });

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("myhandle");

      // Check structured content
      expect(result.structuredContent?.handle).toBe("myhandle");
      expect(result.structuredContent?.owner).toBe(mockResponse.owner);
      expect(result.structuredContent?.found).toBe(true);

      // Check text content
      expect(result.content[0].text).toContain("Handle: $myhandle");
      expect(result.content[0].text).toContain(`Owner: ${mockResponse.owner}`);
    });

    it("handles non-existent handle correctly", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner: null,
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = await registeredHandler({ handle: "nonexistent" });

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("nonexistent");

      // Check structured content
      expect(result.structuredContent?.handle).toBe("nonexistent");
      expect(result.structuredContent?.owner).toBeNull();
      expect(result.structuredContent?.found).toBe(false);

      // Check text content
      expect(result.content[0].text).toContain("Handle: $nonexistent");
      expect(result.content[0].text).toContain("Status: Not found");
    });

    it("trims whitespace before resolution and display", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner:
          "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = await registeredHandler({ handle: "  $myhandle  " });

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("$myhandle");
      expect(result.structuredContent?.handle).toBe("myhandle");
      expect(result.content[0].text).toContain("Handle: $myhandle");
    });

    it("normalizes mixed-case handles to lowercase for display", async () => {
      const mockResponse: AdaHandleOwnerResponse = {
        owner:
          "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
      };

      resolveAdaHandleSpy.mockResolvedValue(mockResponse);

      const result = await registeredHandler({ handle: "  $MyHandle  " });

      expect(resolveAdaHandleSpy).toHaveBeenCalledWith("$MyHandle");
      expect(result.structuredContent?.handle).toBe("myhandle");
      expect(result.content[0].text).toContain("Handle: $myhandle");
    });
  });

  describe("error handling", () => {
    it("handles API errors gracefully", async () => {
      resolveAdaHandleSpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = await registeredHandler({ handle: "myhandle" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles unexpected errors gracefully", async () => {
      resolveAdaHandleSpy.mockRejectedValue(new Error("Network failure"));

      const result = await registeredHandler({ handle: "myhandle" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      resolveAdaHandleSpy.mockRejectedValue("String error");

      const result = await registeredHandler({ handle: "myhandle" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
