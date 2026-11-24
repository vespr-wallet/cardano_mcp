import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetSwapOrders, getSwapOrdersHandler } from "./get_swap_orders.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import { SwapHistoryResponseSchema, type AssetSummaryResponse } from "../types/api/schemas.js";

const ADDRESS =
  "addr1qy5zazr25j6xk0uxsh0djlyekt43r6es2n7pxde9lu9lugsvqx2j0rt2mn57amxfpsvkgwp0j7mr3cpgaljgxgeutv9swphm2p";
const TOKEN_POLICY = "52419331e752".padEnd(56, "0");
const TOKEN_UNIT = `${TOKEN_POLICY}435342`;
const SNEK_UNIT = "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b";
const OPEN_TX = "317e3fb837".padEnd(64, "a");
const SPLIT_TX = "b8".repeat(32);

const IMAGE = { type: "NO_IMAGE" as const };

/**
 * Backend JSON as sent by /v4/wallet/swap/history: BigNumbers are strings, dates ISO strings,
 * ADA is the "416461" unit, and single orders carry their DEX and output index at the top level.
 */
const historyJson: unknown = {
  data: [
    {
      runtime_type: "single",
      _id: "dh-1",
      submission_time: "2026-10-30T09:15:00.000Z",
      submission_tx_hash: OPEN_TX,
      token_in: "416461",
      token_out: TOKEN_UNIT,
      status: "PENDING",
      amount_in: "50",
      spent_amount_in: "0",
      expected_out_amount: "37418079",
      actual_out_amount: "1",
      aggregator_fee: "0.25",
      paid_batcher_fee: "1",
      held_deposit: "2",
      dex: "SNEKFUN",
      submission_tx_output_index: 0,
      update_info: null,
    },
    {
      runtime_type: "split",
      submission_time: "2026-10-01T18:00:00.000Z",
      submission_tx_hash: SPLIT_TX,
      token_in: SNEK_UNIT,
      token_out: "416461",
      status: "COMPLETED",
      amount_in: "1000",
      spent_amount_in: "1000",
      expected_out_amount: "3.5",
      actual_out_amount: "3.52",
      aggregator_fee: "0.0175",
      paid_batcher_fee: "2",
      held_deposit: "0",
      splits: [
        {
          _id: "dh-2",
          amount_in: "600",
          dex: "Minswap",
          status: "COMPLETED",
          aggregator_fee: "0.0105",
          paid_batcher_fee: "1",
          held_deposit: "0",
          submission_tx_output_index: 0,
          expected_out_amount: "2.1",
          percentage_of_total_order: "0.6",
          update_info: {
            update_tx_hash: "c1".repeat(32),
            last_update_time: "2026-10-01T18:02:00.000Z",
            actual_out_amount: "2.11",
          },
        },
        {
          _id: "dh-3",
          amount_in: "400",
          dex: "Splash",
          status: "COMPLETED",
          aggregator_fee: "0.007",
          paid_batcher_fee: "1",
          held_deposit: "0",
          submission_tx_output_index: 1,
          expected_out_amount: "1.4",
          percentage_of_total_order: "0.4",
          update_info: {
            update_tx_hash: "c2".repeat(32),
            last_update_time: "2026-10-01T18:03:00.000Z",
            actual_out_amount: "1.41",
          },
        },
      ],
    },
  ],
  next_page_cursor: "2026-10-01T17:59:59.999Z",
};

const history = SwapHistoryResponseSchema.parse(historyJson);
const openOrder = history.data[0];

const summary: AssetSummaryResponse = {
  tokens: [
    {
      policy: TOKEN_POLICY,
      hex_asset_name: "435342",
      name: "CSB",
      ticker: "CSB",
      decimals: 0,
      image: IMAGE,
      verified: false,
    },
    {
      policy: SNEK_UNIT.slice(0, 56),
      hex_asset_name: SNEK_UNIT.slice(56),
      name: "Snek",
      ticker: "SNEK",
      decimals: 0,
      image: IMAGE,
      verified: true,
    },
  ],
  nfts: [],
  other_nfts: [],
};

describe("get_swap_orders tool", () => {
  let historySpy: jest.SpiedFunction<typeof VesprApiRepository.getSwapHistory>;
  let statusSpy: jest.SpiedFunction<typeof VesprApiRepository.getSwapOrderStatus>;
  let summarySpy: jest.SpiedFunction<typeof VesprApiRepository.getAssetSummary>;

  beforeEach(() => {
    historySpy = jest.spyOn(VesprApiRepository, "getSwapHistory").mockResolvedValue(history);
    statusSpy = jest.spyOn(VesprApiRepository, "getSwapOrderStatus");
    summarySpy = jest.spyOn(VesprApiRepository, "getAssetSummary").mockResolvedValue(summary);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers getSwapOrdersHandler as the get_swap_orders tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const registerTool = jest.spyOn(server, "registerTool");

    registerGetSwapOrders(server);

    expect(registerTool).toHaveBeenCalledWith(
      "get_swap_orders",
      expect.objectContaining({ title: expect.any(String) }),
      getSwapOrdersHandler,
    );
  });

  it("returns error for invalid address format without calling the API", async () => {
    const result = await getSwapOrdersHandler({ address: "invalid-address", open_only: false });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid Cardano address");
    expect(historySpy).not.toHaveBeenCalled();
  });

  it("returns error for an invalid token unit", async () => {
    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false, token_unit: "CSB" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid token unit");
    expect(historySpy).not.toHaveBeenCalled();
  });

  it("returns error for an invalid submission tx hash", async () => {
    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false, submission_tx_hash: "317e3f" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid submission transaction hash");
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("lists orders with token names, per-split DEXes and the next cursor", async () => {
    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false });

    expect(historySpy).toHaveBeenCalledWith({
      address: ADDRESS,
      openOnly: false,
      assetUnit: undefined,
      pageCursor: undefined,
    });
    expect(summarySpy).toHaveBeenCalledWith([TOKEN_UNIT, SNEK_UNIT]);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      orders: [
        {
          submission_tx_hash: OPEN_TX,
          submission_time: "2026-10-30T09:15:00.000Z",
          status: "PENDING",
          is_open: true,
          token_in: { unit: "416461", name: "ADA", ticker: "ADA" },
          token_out: { unit: TOKEN_UNIT, name: "CSB", ticker: "CSB" },
          amount_in: "50",
          spent_amount_in: "0",
          expected_amount_out: "37418079",
          actual_amount_out: "1",
          aggregator_fee_ada: "0.25",
          batcher_fee_ada: "1",
          held_deposit_ada: "2",
          dexes: ["SNEKFUN"],
          splits: [
            {
              dex: "SNEKFUN",
              status: "PENDING",
              share_percent: "100",
              amount_in: "50",
              expected_amount_out: "37418079",
              actual_amount_out: null,
              output_index: 0,
            },
          ],
        },
        expect.objectContaining({
          submission_tx_hash: SPLIT_TX,
          status: "COMPLETED",
          is_open: false,
          token_in: { unit: SNEK_UNIT, name: "Snek", ticker: "SNEK" },
          token_out: { unit: "416461", name: "ADA", ticker: "ADA" },
          dexes: ["Minswap", "Splash"],
          splits: [
            {
              dex: "Minswap",
              status: "COMPLETED",
              share_percent: "60",
              amount_in: "600",
              expected_amount_out: "2.1",
              actual_amount_out: "2.11",
              output_index: 0,
            },
            expect.objectContaining({ dex: "Splash", share_percent: "40", actual_amount_out: "1.41" }),
          ],
        }),
      ],
      next_cursor: "2026-10-01T17:59:59.999Z",
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("2 swap orders:");
    expect(text).toContain(
      `- 2026-10-30T09:15:00.000Z · PENDING (open) · 50 ADA → 37,418,079 CSB expected · 1 received · SNEKFUN · tx ${OPEN_TX}`,
    );
    expect(text).toContain("Minswap 60% COMPLETED, Splash 40% COMPLETED");
    expect(text).toContain('pass cursor "2026-10-01T17:59:59.999Z"');
  });

  it("forwards open_only, a normalized token unit and the cursor", async () => {
    historySpy.mockResolvedValue({ data: [], next_page_cursor: null });

    const result = await getSwapOrdersHandler({
      address: ADDRESS,
      open_only: true,
      token_unit: "ADA",
      cursor: "2026-10-01T17:59:59.999Z",
    });

    expect(historySpy).toHaveBeenCalledWith({
      address: ADDRESS,
      openOnly: true,
      assetUnit: "416461",
      pageCursor: "2026-10-01T17:59:59.999Z",
    });
    expect(summarySpy).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ orders: [], next_cursor: null });
    expect(result.content[0]?.text).toBe("No open swap orders found.");
  });

  it("keeps only open orders when open_only is combined with a token filter", async () => {
    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: true, token_unit: SNEK_UNIT });

    expect(result.structuredContent?.orders.map((order) => order.submission_tx_hash)).toEqual([OPEN_TX]);
  });

  it("looks up a single order by its lowercased submission tx hash", async () => {
    statusSpy.mockResolvedValue({ data: openOrder });

    const result = await getSwapOrdersHandler({
      address: ADDRESS,
      open_only: false,
      submission_tx_hash: OPEN_TX.toUpperCase(),
    });

    expect(statusSpy).toHaveBeenCalledWith(ADDRESS, OPEN_TX);
    expect(historySpy).not.toHaveBeenCalled();
    expect(result.structuredContent?.orders).toHaveLength(1);
    expect(result.structuredContent?.next_cursor).toBeNull();
    expect(result.content[0]?.text).toContain("Swap order:");
  });

  it("reports when no order matches the submission tx hash", async () => {
    statusSpy.mockResolvedValue({ data: null });

    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false, submission_tx_hash: OPEN_TX });

    expect(result.structuredContent).toEqual({ orders: [], next_cursor: null });
    expect(result.content[0]?.text).toBe(`No swap order found for transaction ${OPEN_TX}.`);
  });

  it("rounds float noise in amounts to each token's decimals", async () => {
    historySpy.mockResolvedValue({
      data: [{ ...openOrder, expected_out_amount: "37418079.00000001", aggregator_fee: "0.25000000000000006" }],
    });

    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false });

    const order = result.structuredContent?.orders[0];
    expect(order?.expected_amount_out).toBe("37418079");
    expect(order?.splits[0]?.expected_amount_out).toBe("37418079");
    expect(order?.aggregator_fee_ada).toBe("0.25");
  });

  it("shows units as names when the token lookup fails", async () => {
    summarySpy.mockRejectedValue(new VesprApiError("Summary failed", 500));

    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.orders[0]?.token_out).toEqual({
      unit: TOKEN_UNIT,
      name: TOKEN_UNIT,
      ticker: null,
    });
  });

  it("returns the API error message for a VesprApiError", async () => {
    historySpy.mockRejectedValue(new VesprApiError("Request failed", 400));

    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false });

    expect(result).toEqual({ content: [{ type: "text", text: "Error: Request failed" }], isError: true });
  });

  it("returns an unexpected error for other failures", async () => {
    historySpy.mockRejectedValue(new Error("boom"));

    const result = await getSwapOrdersHandler({ address: ADDRESS, open_only: false });

    expect(result).toEqual({
      content: [{ type: "text", text: "Error: An unexpected error occurred. boom" }],
      isError: true,
    });
  });
});
