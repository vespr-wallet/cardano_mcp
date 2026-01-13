import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";

// Setup mocks before imports
const mockFetch = jest.fn<typeof fetch>();

// Must use unstable_mockModule before importing the module under test
jest.unstable_mockModule("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.vespr.xyz",
    requestTimeoutMs: 100,
    maxRetries: 3,
    retryBaseDelayMs: 10, // Fast retries for tests
  },
}));

jest.unstable_mockModule("../utils/logger.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Dynamic import after mocks are set up
const { fetchWalletDetailed, VesprApiError } = await import("./client.js");

describe("fetchWalletDetailed", () => {
  const validAddress =
    "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

  const mockWalletResponse = {
    lovelace: "5000000000",
    rewards_lovelace: "100000000",
    handles: ["$myhandle"],
    tokens: [
      {
        policy: "abc123",
        hex_asset_name: "546f6b656e",
        name: "TestToken",
        ticker: "TEST",
        quantity: "1000000",
        decimals: 6,
      },
    ],
  };

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("successful requests", () => {
    it("returns wallet data on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWalletResponse,
      } as Response);

      const result = await fetchWalletDetailed(validAddress);

      expect(result.lovelace).toBe("5000000000");
      expect(result.rewards_lovelace).toBe("100000000");
      expect(result.handles).toEqual(["$myhandle"]);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].name).toBe("TestToken");
    });

    it("calls correct API endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWalletResponse,
      } as Response);

      await fetchWalletDetailed(validAddress);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.vespr.xyz/v7/wallet/detailed",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ address: validAddress }),
        }),
      );
    });
  });

  describe("error handling", () => {
    it("throws VesprApiError on 400", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow(VesprApiError);
    });

    it("throws VesprApiError on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow("Wallet not found");
    });

    it("throws VesprApiError on malformed JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      } as unknown as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow("Failed to parse");
    });

    it("throws VesprApiError on unknown status code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 418, // I'm a teapot - unusual status
      } as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow("status 418");
    });

    it("throws VesprApiError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow("Unable to connect");
    });

    it("throws VesprApiError on timeout (AbortError)", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow("Request timed out");
    });
  });

  describe("retry behavior", () => {
    it("retries on 500 error", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockWalletResponse } as Response);

      const result = await fetchWalletDetailed(validAddress);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.lovelace).toBe("5000000000");
    });

    it("retries on 429 rate limit", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => mockWalletResponse } as Response);

      const result = await fetchWalletDetailed(validAddress);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.lovelace).toBe("5000000000");
    });

    it("does not retry on 400 error", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 } as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow(VesprApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails after max retries", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

      await expect(fetchWalletDetailed(validAddress)).rejects.toThrow(VesprApiError);

      expect(mockFetch).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });

  describe("response transformation", () => {
    it("handles missing optional fields", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          lovelace: "1000000",
          // rewards_lovelace missing
          // handles missing
          // tokens missing
        }),
      } as Response);

      const result = await fetchWalletDetailed(validAddress);

      expect(result.lovelace).toBe("1000000");
      expect(result.rewards_lovelace).toBe("0");
      expect(result.handles).toEqual([]);
      expect(result.tokens).toEqual([]);
    });

    it("handles token with null ticker", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockWalletResponse,
          tokens: [{ ...mockWalletResponse.tokens[0], ticker: null }],
        }),
      } as Response);

      const result = await fetchWalletDetailed(validAddress);

      expect(result.tokens[0].ticker).toBeNull();
    });
  });
});
