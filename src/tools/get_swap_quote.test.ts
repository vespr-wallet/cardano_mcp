import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetSwapQuote, getSwapQuoteHandler } from "./get_swap_quote.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import { SwapEstimateResponseSchema } from "../types/api/schemas.js";
import { FiatCurrency } from "../types/currency.js";

const TOKEN_POLICY = "52419331e752".padEnd(56, "0");
const TOKEN_UNIT = `${TOKEN_POLICY}435342`;

/**
 * Backend JSON as sent by /v4/wallet/swap/estimate: BigNumbers and bigints are strings, ADA has an empty policy,
 * split shares are 0-1 fractions, impact is a percentage, and legacy `*_ada` totals ride along.
 */
const estimateJson: unknown = {
  runtime_type: "DATA",
  token_in: {
    policy: "",
    hex_asset_name: "416461",
    quantity: "100",
    verified: true,
    decimals: 6,
    value_fiat: "45.1",
    name: "Cardano",
    ticker: "ADA",
  },
  token_out: {
    policy: TOKEN_POLICY,
    hex_asset_name: "435342",
    quantity: "1250000",
    verified: false,
    decimals: 0,
    name: "CSB",
    ticker: "CSB",
  },
  distortion: "0.4",
  impact: "1.234567",
  aggregator_bonus_amount: "1500",
  aggregator_bonus_relative: "0.0012",
  quote_price_ab: "12500",
  quote_price_ba: "0.00008",
  aggregator_fee_lovelace: "500000",
  quote_amount_in: "100",
  reduced_from_amount: "0",
  token_out_min_quantity: "1237500",
  order_splits: [
    {
      dex_name: "Minswap",
      dex_image: { type: "NO_IMAGE" },
      fee_lovelace: "1000000",
      deposit_lovelace: "2000000",
      percentage_share: "0.7",
    },
    {
      dex_name: "Splash",
      dex_image: { type: "NO_IMAGE" },
      fee_lovelace: "500000",
      deposit_lovelace: "1500000",
      percentage_share: "0.3",
    },
  ],
  response_time_utc: 1764000000000,
  currency: "USD",
  batcher_fee_ada: "1.5",
  deposit_ada: "3.5",
  aggregator_fee_ada: "0.5",
};

const estimate = SwapEstimateResponseSchema.parse(estimateJson);

describe("get_swap_quote tool", () => {
  let estimateSpy: jest.SpiedFunction<typeof VesprApiRepository.getSwapEstimate>;

  beforeEach(() => {
    estimateSpy = jest.spyOn(VesprApiRepository, "getSwapEstimate").mockResolvedValue(estimate);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers getSwapQuoteHandler as the get_swap_quote tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const registerTool = jest.spyOn(server, "registerTool");

    registerGetSwapQuote(server);

    expect(registerTool).toHaveBeenCalledWith(
      "get_swap_quote",
      expect.objectContaining({ title: expect.any(String) }),
      getSwapQuoteHandler,
    );
  });

  it.each([
    { token_in: "CSB", token_out: "ADA", amount: "1", error: "Invalid token unit" },
    { token_in: "ADA", token_out: "lovelace", amount: "1", error: "must be different" },
    { token_in: "ADA", token_out: TOKEN_UNIT, amount: "0", error: "Invalid amount" },
    { token_in: "ADA", token_out: TOKEN_UNIT, amount: "-5", error: "Invalid amount" },
    { token_in: "ADA", token_out: TOKEN_UNIT, amount: "1e3", error: "Invalid amount" },
  ])("rejects $token_in -> $token_out for $amount without calling the API", async ({ error, ...args }) => {
    const result = await getSwapQuoteHandler(args);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(error);
    expect(estimateSpy).not.toHaveBeenCalled();
  });

  it("quotes ADA to a token with the expected amount, fees and DEX split", async () => {
    const result = await getSwapQuoteHandler({ token_in: "ADA", token_out: TOKEN_UNIT, amount: " 100 " });

    expect(estimateSpy).toHaveBeenCalledWith({
      tokenInUnit: "416461",
      tokenOutUnit: TOKEN_UNIT,
      amountIn: "100",
      currency: FiatCurrency.USD,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      route_found: true,
      quote: {
        token_in: {
          unit: "416461",
          name: "Cardano",
          ticker: "ADA",
          verified: true,
          value: "45.1",
          amount: "100",
        },
        token_out: {
          unit: TOKEN_UNIT,
          name: "CSB",
          ticker: "CSB",
          verified: false,
          value: null,
          expected_amount: "1250000",
          min_amount: "1237500",
        },
        price: "12500",
        inverse_price: "0.00008",
        price_impact_percent: "1.234567",
        batcher_fee_ada: "1.500000",
        deposit_ada: "3.500000",
        aggregator_fee_ada: "0.500000",
        currency: "USD",
        route: [
          { dex: "Minswap", share_percent: "70", batcher_fee_ada: "1.000000", deposit_ada: "2.000000" },
          { dex: "Splash", share_percent: "30", batcher_fee_ada: "0.500000", deposit_ada: "1.500000" },
        ],
      },
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Quote: 100 ADA → 1,250,000 CSB expected (min 1,237,500 with 1% slippage)");
    expect(text).toContain("Price: 1 ADA = 12500 CSB");
    expect(text).toContain("Price impact: 1.23%");
    expect(text).toContain("Route: Minswap 70%, Splash 30%");
    expect(text).toContain("nothing was built or submitted");
  });

  it("forwards the currency and accepts a policy.asset_name unit", async () => {
    await getSwapQuoteHandler({
      token_in: `${TOKEN_POLICY}.435342`,
      token_out: "lovelace",
      amount: "0.5",
      currency: FiatCurrency.EUR,
    });

    expect(estimateSpy).toHaveBeenCalledWith({
      tokenInUnit: TOKEN_UNIT,
      tokenOutUnit: "416461",
      amountIn: "0.5",
      currency: FiatCurrency.EUR,
    });
  });

  it("reports when no route exists", async () => {
    estimateSpy.mockResolvedValue({ runtime_type: "POOL_NOT_FOUND" });

    const result = await getSwapQuoteHandler({ token_in: "ADA", token_out: TOKEN_UNIT, amount: "100" });

    expect(result).toEqual({
      content: [{ type: "text", text: "No swap route found for this pair and amount." }],
      structuredContent: { route_found: false, quote: null },
    });
  });

  it("returns the API error message for a VesprApiError", async () => {
    estimateSpy.mockRejectedValue(new VesprApiError("Invalid asset.", 400));

    const result = await getSwapQuoteHandler({ token_in: "ADA", token_out: TOKEN_UNIT, amount: "100" });

    expect(result).toEqual({ content: [{ type: "text", text: "Error: Invalid asset." }], isError: true });
  });

  it("returns an unexpected error for other failures", async () => {
    estimateSpy.mockRejectedValue(new Error("boom"));

    const result = await getSwapQuoteHandler({ token_in: "ADA", token_out: TOKEN_UNIT, amount: "100" });

    expect(result).toEqual({
      content: [{ type: "text", text: "Error: An unexpected error occurred. boom" }],
      isError: true,
    });
  });
});
