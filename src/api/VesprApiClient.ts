import { config } from "../config.js";
import { FetchApiClient } from "../utils/api/FetchApiClient.js";
import { WalletDetailedResponseSchema, type WalletDetailedResponse } from "../types/api/schemas.js";

export class VesprApiClient {
  private readonly client: FetchApiClient;

  constructor() {
    this.client = new FetchApiClient({
      baseUrl: config.apiBaseUrl,
      headers: { "x-digest": config.apiKey },
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
}

export default new VesprApiClient();
