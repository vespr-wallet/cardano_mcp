import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetWalletUtxos, getWalletUtxosHandler, MAX_TOKENS_PER_UTXO } from "./get_wallet_utxos.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError, INVALID_INPUT } from "../types/errors.js";
import type { WalletDetailedResponse, WalletUtxosResponse } from "../types/api/schemas.js";
import { UTXO_FIXTURES, FIXTURE_ADDRESS, HOSKY_POLICY, HANDLE_POLICY } from "../utils/utxo.fixtures.js";

describe("get_wallet_utxos tool", () => {
  let getWalletUtxosSpy: jest.SpiedFunction<typeof VesprApiRepository.getWalletUtxos>;
  let getDetailedWalletSpy: jest.SpiedFunction<typeof VesprApiRepository.getDetailedWallet>;

  const mockUtxos: WalletUtxosResponse = {
    hex_utxos: [UTXO_FIXTURES.withTokens, UTXO_FIXTURES.pureAda5, UTXO_FIXTURES.mapFormat, UTXO_FIXTURES.pureAda12],
    collateral_hex_utxos: [UTXO_FIXTURES.pureAda5],
  };

  const mockWallet: WalletDetailedResponse = {
    lovelace: "20845678",
    rewards_lovelace: "0",
    handles: ["$my_handle"],
    tokens: [
      {
        policy: HOSKY_POLICY,
        hex_asset_name: "484f534b59",
        name: "HOSKY Token",
        ticker: "HOSKY",
        quantity: "1234572",
        ada_per_adjusted_unit: null,
        decimals: 2,
      },
    ],
  };

  beforeEach(() => {
    getWalletUtxosSpy = jest.spyOn(VesprApiRepository, "getWalletUtxos");
    getDetailedWalletSpy = jest.spyOn(VesprApiRepository, "getDetailedWallet");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers getWalletUtxosHandler as the get_wallet_utxos tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const registerTool = jest.spyOn(server, "registerTool");

    registerGetWalletUtxos(server);

    expect(registerTool).toHaveBeenCalledWith(
      "get_wallet_utxos",
      expect.objectContaining({ title: expect.any(String) }),
      getWalletUtxosHandler,
    );
  });

  it("returns error for invalid address format without calling the API", async () => {
    const result = await getWalletUtxosHandler({ address: "invalid-address", limit: 50, offset: 0 });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Error: Invalid Cardano address. Address should be a valid bech32 Shelley Era Wallet address.",
        },
      ],
      isError: true,
      [INVALID_INPUT]: true,
    });
    expect(getWalletUtxosSpy).not.toHaveBeenCalled();
    expect(getDetailedWalletSpy).not.toHaveBeenCalled();
  });

  it("lists UTxOs largest first with summary fields and resolved token metadata", async () => {
    getWalletUtxosSpy.mockResolvedValue(mockUtxos);
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(getWalletUtxosSpy).toHaveBeenCalledWith(FIXTURE_ADDRESS);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      utxo_count: 4,
      pure_ada_utxo_count: 2,
      total_ada: "20.845678",
      largest_pure_ada_utxo: { tx_hash: "22".repeat(32), output_index: 3, ada: "12.345678" },
      collateral_utxo: { tx_hash: "11".repeat(32), output_index: 0, ada: "5.000000" },
      offset: 0,
      has_more: false,
      utxos: [
        {
          tx_hash: "22".repeat(32),
          output_index: 3,
          address: FIXTURE_ADDRESS,
          ada: "12.345678",
          token_count: 0,
          tokens: [],
        },
        {
          tx_hash: "11".repeat(32),
          output_index: 0,
          address: FIXTURE_ADDRESS,
          ada: "5.000000",
          token_count: 0,
          tokens: [],
        },
        {
          tx_hash: "44".repeat(32),
          output_index: 2,
          address: FIXTURE_ADDRESS,
          ada: "2.000000",
          token_count: 1,
          tokens: [
            {
              name: "HOSKY Token",
              ticker: "HOSKY",
              policy_id: HOSKY_POLICY,
              asset_name_hex: "484f534b59",
              quantity: "5",
              amount: "0.05",
            },
          ],
        },
        {
          tx_hash: "33".repeat(32),
          output_index: 1,
          address: FIXTURE_ADDRESS,
          ada: "1.500000",
          token_count: 2,
          tokens: [
            {
              name: "HOSKY Token",
              ticker: "HOSKY",
              policy_id: HOSKY_POLICY,
              asset_name_hex: "484f534b59",
              quantity: "1234567",
              amount: "12345.67",
            },
            {
              name: "000de1406d795f68616e646c65",
              ticker: undefined,
              policy_id: HANDLE_POLICY,
              asset_name_hex: "000de1406d795f68616e646c65",
              quantity: "1",
              amount: "1",
            },
          ],
        },
      ],
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("UTxOs: 4 (2 pure ADA)");
    expect(text).toContain("Total ADA: 20.845678 ADA");
    expect(text).toContain(`Largest pure-ADA UTxO: 12.345678 ADA (${"22".repeat(32)}#3)`);
    expect(text).toContain(`Collateral UTxO: 5.000000 ADA (${"11".repeat(32)}#0)`);
    expect(text).toContain("Showing 1-4 of 4:");
    expect(text).toContain(`- ${"33".repeat(32)}#1: 1.500000 ADA, 2 tokens`);
  });

  it("paginates with limit and offset while keeping wallet-wide summary fields", async () => {
    getWalletUtxosSpy.mockResolvedValue(mockUtxos);
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 2, offset: 1 });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({ utxo_count: 4, pure_ada_utxo_count: 2, offset: 1, has_more: true }),
    );
    expect(result.structuredContent?.utxos.map((u) => u.output_index)).toEqual([0, 2]);
    expect(result.content[0]?.text).toContain("Showing 2-3 of 4 (use offset for more):");
  });

  it("returns an empty page past the end", async () => {
    getWalletUtxosSpy.mockResolvedValue(mockUtxos);
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 10 });

    expect(result.structuredContent).toEqual(expect.objectContaining({ utxos: [], has_more: false }));
    expect(result.content[0]?.text).toContain("Showing none of 4 (offset 10)");
  });

  it("handles a wallet without UTxOs", async () => {
    getWalletUtxosSpy.mockResolvedValue({ hex_utxos: [], collateral_hex_utxos: [] });
    getDetailedWalletSpy.mockResolvedValue({ ...mockWallet, tokens: [] });

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        utxo_count: 0,
        pure_ada_utxo_count: 0,
        total_ada: "0.000000",
        largest_pure_ada_utxo: null,
        collateral_utxo: null,
      }),
    );
    expect(result.content[0]?.text).toContain("Largest pure-ADA UTxO: none");
  });

  it("falls back to raw quantities and the decoded asset name when the token metadata lookup fails", async () => {
    getWalletUtxosSpy.mockResolvedValue({ hex_utxos: [UTXO_FIXTURES.withTokens], collateral_hex_utxos: [] });
    getDetailedWalletSpy.mockRejectedValue(new VesprApiError("Wallet lookup failed", 500));

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.utxos[0]?.tokens[0]).toEqual(
      expect.objectContaining({ name: "HOSKY", quantity: "1234567", amount: "1234567" }),
    );
  });

  it(`lists at most ${MAX_TOKENS_PER_UTXO} tokens per UTxO but reports the full token count`, async () => {
    // [[h'55..55', 0], [h'61', [2000000, {h'<policy>': {h'00': 1, ..., h'3b': 1}}]]] (60 tokens)
    const assets = Array.from({ length: 60 }, (_, i) => `41${i.toString(16).padStart(2, "0")}01`).join("");
    const hex = `82825820${"55".repeat(32)}00824161821a001e8480a1581c${HOSKY_POLICY}b83c${assets}`;
    getWalletUtxosSpy.mockResolvedValue({ hex_utxos: [hex], collateral_hex_utxos: [] });
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(result.structuredContent?.utxos[0]?.token_count).toBe(60);
    expect(result.structuredContent?.utxos[0]?.tokens).toHaveLength(MAX_TOKENS_PER_UTXO);
  });

  it("returns the API error message for a VesprApiError", async () => {
    getWalletUtxosSpy.mockRejectedValue(new VesprApiError("Request failed", 400));
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(result).toEqual({ content: [{ type: "text", text: "Error: Request failed" }], isError: true });
  });

  it("returns an unexpected error for undecodable UTxO data", async () => {
    getWalletUtxosSpy.mockResolvedValue({ hex_utxos: ["zz"], collateral_hex_utxos: [] });
    getDetailedWalletSpy.mockResolvedValue(mockWallet);

    const result = await getWalletUtxosHandler({ address: FIXTURE_ADDRESS, limit: 50, offset: 0 });

    expect(result).toEqual({
      content: [{ type: "text", text: "Error: An unexpected error occurred. Invalid hex string" }],
      isError: true,
    });
  });
});
