import { config } from "../config.js";
import { FetchApiClient } from "../utils/api/FetchApiClient.js";
import {
  WalletDetailedResponseSchema,
  AdaSpotPriceResponseSchema,
  type WalletDetailedResponse,
  type AdaSpotPriceResponse,
} from "../types/api/schemas.js";
import { FiatCurrency } from "../types/currency.js";

export class VesprApiClient {
  private readonly client: FetchApiClient;

  constructor() {
    this.client = new FetchApiClient({
      baseUrl: config.apiBaseUrl,
      headers: {
        "Content-Type": "application/json",
        "x-digest": config.apiKey,
      },
      requestTimeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
    });
  }

  async fetchWalletDetailed(address: string): Promise<WalletDetailedResponse> {
    return this.client.post({
      path: "/v7/wallet/detailed",
      body: { address },
      schema: WalletDetailedResponseSchema,
      context: `wallet(${address.slice(0, 15)}...)`,
    });
  }

  async getAdaSpotPrice(currency: FiatCurrency): Promise<AdaSpotPriceResponse> {
    return this.client.get({
      path: `/v5/ada/spot?currency=${encodeURIComponent(currency)}`,
      schema: AdaSpotPriceResponseSchema,
      context: `ada-spot(${currency})`,
    });
  }
}

export default new VesprApiClient();
