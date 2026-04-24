import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { z } from "zod";
import { FetchApiClient, type FetchApiClientConfig } from "./FetchApiClient.js";
import { VesprApiError } from "../../types/errors.js";

// Mock global fetch
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

describe("FetchApiClient", () => {
  const defaultConfig: FetchApiClientConfig = {
    baseUrl: "https://api.test.com",
    headers: { "Content-Type": "application/json", "x-api-key": "test-key" },
    requestTimeoutMs: 5000,
    maxRetries: 1, // Single attempt for most tests
    retryBaseDelayMs: 100,
  };

  const retryConfig: FetchApiClientConfig = {
    ...defaultConfig,
    maxRetries: 3,
    retryBaseDelayMs: 10, // Short delay for retry tests
  };

  const testSchema = z.object({
    id: z.number(),
    name: z.string(),
  });

  let client: FetchApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new FetchApiClient(defaultConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("get", () => {
    it("makes a GET request and returns parsed data", async () => {
      const mockResponse = { id: 1, name: "Test" };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await client.get({
        path: "/test",
        schema: testSchema,
        context: "test-get",
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "GET",
          headers: defaultConfig.headers,
        }),
      );
    });
  });

  describe("post", () => {
    it("makes a POST request with body and returns parsed data", async () => {
      const mockResponse = { id: 2, name: "Posted" };
      const requestBody = { data: "test" };

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await client.post({
        path: "/test",
        body: requestBody,
        schema: testSchema,
        context: "test-post",
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(requestBody),
        }),
      );
    });
  });

  describe("retry logic", () => {
    it("retries on 500 errors with exponential backoff", async () => {
      const retryClient = new FetchApiClient(retryConfig);
      const mockResponse = { id: 1, name: "Success" };

      // First two calls fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce(new Response("Server error", { status: 500 }))
        .mockResolvedValueOnce(new Response("Server error", { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await retryClient.get({
        path: "/test",
        schema: testSchema,
        context: "retry-test",
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 10000);

    it("retries on 429 rate limit errors", async () => {
      const retryClient = new FetchApiClient(retryConfig);
      const mockResponse = { id: 1, name: "Success" };

      mockFetch
        .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const result = await retryClient.get({
        path: "/test",
        schema: testSchema,
        context: "rate-limit-test",
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000);

    it("throws after max retries exhausted", async () => {
      const retryClient = new FetchApiClient(retryConfig);

      mockFetch.mockResolvedValue(new Response("Server error", { status: 500 }));

      await expect(
        retryClient.get({
          path: "/test",
          schema: testSchema,
          context: "max-retry-test",
        }),
      ).rejects.toThrow(VesprApiError);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 10000);

    it("does not retry on 4xx errors (except 429)", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Bad request", { status: 400 }));

      await expect(
        client.get({
          path: "/test",
          schema: testSchema,
          context: "no-retry-test",
        }),
      ).rejects.toThrow(VesprApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("throws VesprApiError with API error message", async () => {
      const errorResponse = {
        errorMessage: "Wallet not found",
        devErrorMessage: "No wallet exists with this address",
      };

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(errorResponse), { status: 404 }));

      try {
        await client.get({
          path: "/wallet",
          schema: testSchema,
          context: "error-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).message).toBe("Wallet not found");
        expect((error as VesprApiError).statusCode).toBe(404);
      }
    });

    it("uses fallback message when error body cannot be parsed", async () => {
      // Use 400 (non-retryable) to avoid retry attempts
      mockFetch.mockResolvedValueOnce(new Response("Not JSON", { status: 400 }));

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "parse-error-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).statusCode).toBe(400);
      }
    });

    it("handles timeout errors", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "timeout-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).message).toBe("Request timed out. Try again.");
      }
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "network-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).message).toBe("Unable to connect to API. Check your internet connection.");
      }
    });

    it("handles non-Error thrown values", async () => {
      mockFetch.mockRejectedValueOnce("String error");

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "string-error-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
      }
    });
  });

  describe("response validation", () => {
    it("throws VesprApiError on schema validation failure", async () => {
      const invalidResponse = { id: "not-a-number", name: 123 };

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(invalidResponse), { status: 200 }));

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "validation-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).message).toContain("Invalid API response");
      }
    });

    it("throws VesprApiError when response is not valid JSON", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not valid JSON {{{", { status: 200 }));

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "json-parse-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        expect((error as VesprApiError).message).toBe("Failed to parse API response.");
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty error response body", async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));

      try {
        await client.get({
          path: "/test",
          schema: testSchema,
          context: "empty-error-test",
        });
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(VesprApiError);
        // Should use fallback message
        expect((error as VesprApiError).statusCode).toBe(400);
      }
    });

    it("handles POST request without body", async () => {
      const mockResponse = { id: 1, name: "Test" };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

      const postSchema = z.object({ id: z.number(), name: z.string() });
      const result = await client.post({
        path: "/test",
        body: undefined,
        schema: postSchema,
        context: "no-body-post",
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: undefined,
        }),
      );
    });
  });
});
