import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Fastify, { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z, ZodObject, ZodRawShape } from "zod";
import { registerTools, registerHttpTools } from "./index.js";
import { httpToolRegistry, registerHttpRoutes } from "../transports/http.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { CryptoCurrency, FiatCurrency } from "../types/currency.js";
import type {
  AdaSpotPriceResponse,
  TokenChartResponse,
  TokenInfoResponse,
  TrendingTokensResponse,
  WalletDetailedResponse,
} from "../types/api/schemas.js";

const ALL_TOOL_NAMES = [
  "get_asset_metadata",
  "get_asset_summary",
  "get_pool_info",
  "get_staking_info",
  "get_supported_currencies",
  "get_token_chart",
  "get_token_info",
  "get_transaction_history",
  "get_trending_tokens",
  "get_wallet_balance",
  "resolve_ada_handle",
];

const VALID_ADDRESS =
  "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

const walletFixture: WalletDetailedResponse = {
  lovelace: "1000000000",
  rewards_lovelace: "0",
  handles: [],
  tokens: [],
};

const spotPriceFixture: AdaSpotPriceResponse = {
  currency: FiatCurrency.USD,
  spot: "0.35",
  spot1hAgo: null,
  spot24hAgo: null,
};

const chartFixture: TokenChartResponse = {
  interval: "1h",
  currency: CryptoCurrency.ADA,
  data: [],
};

const tokenInfoFixture: TokenInfoResponse = {
  data: {
    subject: "unit123",
    name: "Test Token",
    ticker: "TEST",
    description: "A test token",
    url: "https://test.com",
    decimals: 6,
    price: 0.5,
    circSupply: 1000000,
    fdv: 500000,
    mcap: 250000,
    totalSupply: 1000000,
    verified: true,
    currency: FiatCurrency.USD,
  },
};

const trendingFixture = (count: number): TrendingTokensResponse => ({
  data: Array.from({ length: count }, (_, i) => ({
    policy: `policy${i}`,
    hex_asset_name: "54455354",
    name: `Token ${i}`,
    ticker: `T${i}`,
    verified: false,
    decimals: 6,
    ada_per_adjusted_unit: 0.5,
    period_ada_price_change_percentage: 1,
    period_volume_ada: 1000,
    period_buys_count: 1,
    period_sales_count: 1,
    chart_data: null,
  })),
});

describe("registerTools (MCP transport)", () => {
  let client: Client;
  let mcpServer: McpServer;

  beforeEach(async () => {
    mcpServer = new McpServer({ name: "test-server", version: "0.0.0" });
    registerTools(mcpServer);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await mcpServer.close();
    jest.restoreAllMocks();
  });

  it("exposes every tool to MCP clients", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("get_token_chart treats null period and empty currency as omitted and applies defaults", async () => {
    const spy = jest.spyOn(VesprApiRepository, "getTokenChart").mockResolvedValue(chartFixture);

    const result = await client.callTool({
      name: "get_token_chart",
      arguments: { unit: "unit123", period: null, currency: "" },
    });

    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith("unit123", "24H", CryptoCurrency.ADA);
  });

  it("get_token_chart forwards explicit period and currency", async () => {
    const spy = jest
      .spyOn(VesprApiRepository, "getTokenChart")
      .mockResolvedValue({ ...chartFixture, currency: FiatCurrency.EUR });

    await client.callTool({
      name: "get_token_chart",
      arguments: { unit: "unit123", period: "1W", currency: FiatCurrency.EUR },
    });

    expect(spy).toHaveBeenCalledWith("unit123", "1W", FiatCurrency.EUR);
  });

  it("get_token_info defaults an empty currency to USD", async () => {
    const spy = jest.spyOn(VesprApiRepository, "getTokenInfo").mockResolvedValue(tokenInfoFixture);

    const result = await client.callTool({ name: "get_token_info", arguments: { unit: "unit123", currency: "" } });

    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith("unit123", FiatCurrency.USD);
  });

  it("get_trending_tokens defaults null/empty limit, currency and period", async () => {
    const spy = jest.spyOn(VesprApiRepository, "getTrendingTokens").mockResolvedValue(trendingFixture(15));

    const result = await client.callTool({
      name: "get_trending_tokens",
      arguments: { limit: null, currency: "", period: null },
    });

    expect(spy).toHaveBeenCalledWith(FiatCurrency.USD, undefined);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({ currency: FiatCurrency.USD, period: null, tokens: expect.any(Array) }),
    );
    const tokens = z.object({ tokens: z.array(z.unknown()) }).parse(result.structuredContent).tokens;
    expect(tokens).toHaveLength(10);
  });

  it("get_trending_tokens forwards explicit values", async () => {
    const spy = jest.spyOn(VesprApiRepository, "getTrendingTokens").mockResolvedValue(trendingFixture(5));

    const result = await client.callTool({
      name: "get_trending_tokens",
      arguments: { limit: 2, currency: FiatCurrency.EUR, period: "1H" },
    });

    expect(spy).toHaveBeenCalledWith(FiatCurrency.EUR, "1H");
    const tokens = z.object({ tokens: z.array(z.unknown()) }).parse(result.structuredContent).tokens;
    expect(tokens).toHaveLength(2);
  });

  it("get_wallet_balance defaults a null currency to USD", async () => {
    jest.spyOn(VesprApiRepository, "getDetailedWallet").mockResolvedValue(walletFixture);
    const spotSpy = jest.spyOn(VesprApiRepository, "getAdaSpotPrice").mockResolvedValue(spotPriceFixture);

    const result = await client.callTool({
      name: "get_wallet_balance",
      arguments: { address: VALID_ADDRESS, currency: null },
    });

    expect(result.isError).toBeFalsy();
    expect(spotSpy).toHaveBeenCalledWith(FiatCurrency.USD);
  });

  it("rejects arguments that fail the input schema without calling the API", async () => {
    const spy = jest.spyOn(VesprApiRepository, "getTokenChart");

    const result = await client.callTool({
      name: "get_token_chart",
      arguments: { unit: "unit123", period: "2H" },
    });

    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("registerHttpTools (HTTP transport)", () => {
  beforeEach(() => {
    httpToolRegistry.clear();
    registerHttpTools();
  });

  afterEach(() => {
    httpToolRegistry.clear();
    jest.restoreAllMocks();
  });

  function schemaOf(name: string): ZodObject<ZodRawShape> {
    const tool = httpToolRegistry.getTool(name);
    if (!tool) {
      throw new Error(`Tool ${name} is not registered`);
    }
    return tool.inputSchema;
  }

  it("registers every tool with a title and description", () => {
    const tools = httpToolRegistry.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.title).not.toBe("");
      expect(tool.description).not.toBe("");
    }
  });

  it("get_supported_currencies takes no arguments", () => {
    expect(httpToolRegistry.listTools().find((t) => t.name === "get_supported_currencies")?.inputSchema).toEqual({});
  });

  const defaultCases: Array<{ tool: string; base: Record<string, unknown>; field: string; fallback: unknown }> = [
    { tool: "get_wallet_balance", base: { address: VALID_ADDRESS }, field: "currency", fallback: FiatCurrency.USD },
    { tool: "get_staking_info", base: { address: VALID_ADDRESS }, field: "currency", fallback: FiatCurrency.USD },
    { tool: "get_token_info", base: { unit: "u" }, field: "currency", fallback: FiatCurrency.USD },
    { tool: "get_token_chart", base: { unit: "u" }, field: "period", fallback: "24H" },
    { tool: "get_token_chart", base: { unit: "u" }, field: "currency", fallback: CryptoCurrency.ADA },
    { tool: "get_trending_tokens", base: {}, field: "limit", fallback: 10 },
    { tool: "get_trending_tokens", base: {}, field: "currency", fallback: FiatCurrency.USD },
    { tool: "get_trending_tokens", base: {}, field: "period", fallback: undefined },
    { tool: "get_transaction_history", base: { address: VALID_ADDRESS }, field: "to_block", fallback: undefined },
  ];

  it.each(defaultCases)(
    "$tool.$field: null and empty string fall back to $fallback",
    ({ tool, base, field, fallback }) => {
      const schema = schemaOf(tool);

      expect(schema.parse({ ...base, [field]: null })[field]).toEqual(fallback);
      expect(schema.parse({ ...base, [field]: "" })[field]).toEqual(fallback);
      expect(schema.parse(base)[field]).toEqual(fallback);
    },
  );

  it.each([
    { tool: "get_wallet_balance", base: { address: VALID_ADDRESS }, field: "currency", value: FiatCurrency.EUR },
    { tool: "get_staking_info", base: { address: VALID_ADDRESS }, field: "currency", value: CryptoCurrency.ADA },
    { tool: "get_token_info", base: { unit: "u" }, field: "currency", value: FiatCurrency.GBP },
    { tool: "get_token_chart", base: { unit: "u" }, field: "period", value: "1Y" },
    { tool: "get_token_chart", base: { unit: "u" }, field: "currency", value: FiatCurrency.USD },
    { tool: "get_trending_tokens", base: {}, field: "limit", value: 100 },
    { tool: "get_trending_tokens", base: {}, field: "currency", value: FiatCurrency.JPY },
    { tool: "get_trending_tokens", base: {}, field: "period", value: "4H" },
    { tool: "get_transaction_history", base: { address: VALID_ADDRESS }, field: "to_block", value: 12345 },
  ])("$tool.$field: keeps an explicit value", ({ tool, base, field, value }) => {
    expect(schemaOf(tool).parse({ ...base, [field]: value })[field]).toEqual(value);
  });

  it.each([
    { tool: "get_trending_tokens", args: { limit: 0 } },
    { tool: "get_trending_tokens", args: { limit: 101 } },
    { tool: "get_trending_tokens", args: { limit: 2.5 } },
    { tool: "get_trending_tokens", args: { currency: "NOPE" } },
    { tool: "get_token_chart", args: { unit: "u", period: "2H" } },
    { tool: "get_transaction_history", args: { address: VALID_ADDRESS, to_block: -1 } },
    { tool: "get_wallet_balance", args: {} },
    { tool: "get_wallet_balance", args: { address: VALID_ADDRESS, currency: "INVALID" } },
    { tool: "get_token_info", args: { unit: "u", currency: "DOGE" } },
    { tool: "resolve_ada_handle", args: {} },
    { tool: "get_asset_metadata", args: { unit: 42 } },
    { tool: "get_asset_summary", args: {} },
    { tool: "get_pool_info", args: {} },
  ])("$tool rejects invalid arguments $args", ({ tool, args }) => {
    expect(schemaOf(tool).safeParse(args).success).toBe(false);
  });

  describe("through the HTTP routes", () => {
    let server: FastifyInstance;

    beforeEach(async () => {
      server = Fastify();
      registerHttpRoutes(server);
      await server.ready();
    });

    afterEach(async () => {
      await server.close();
    });

    it("get_wallet_balance applies the default currency when it is omitted", async () => {
      jest.spyOn(VesprApiRepository, "getDetailedWallet").mockResolvedValue(walletFixture);
      const spotSpy = jest.spyOn(VesprApiRepository, "getAdaSpotPrice").mockResolvedValue(spotPriceFixture);

      const response = await server.inject({
        method: "POST",
        url: "/tools/get_wallet_balance",
        payload: { arguments: { address: VALID_ADDRESS } },
      });

      expect(response.statusCode).toBe(200);
      expect(spotSpy).toHaveBeenCalledWith(FiatCurrency.USD);
      expect(response.json()).toEqual({ result: expect.objectContaining({ currency: FiatCurrency.USD }) });
    });

    it("get_asset_summary passes the units array to the handler", async () => {
      const spy = jest
        .spyOn(VesprApiRepository, "getAssetSummary")
        .mockResolvedValue({ tokens: [], nfts: [], other_nfts: [] });

      const response = await server.inject({
        method: "POST",
        url: "/tools/get_asset_summary",
        payload: { arguments: { units: ["unit1", "unit2"] } },
      });

      expect(response.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledWith(["unit1", "unit2"]);
    });

    it("get_token_chart applies the default period when an empty string is sent", async () => {
      const spy = jest.spyOn(VesprApiRepository, "getTokenChart").mockResolvedValue(chartFixture);

      const response = await server.inject({
        method: "POST",
        url: "/tools/get_token_chart",
        payload: { arguments: { unit: "unit123", period: "" } },
      });

      expect(response.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledWith("unit123", "24H", CryptoCurrency.ADA);
    });
  });
});
