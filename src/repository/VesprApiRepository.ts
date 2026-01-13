import { LRUCache } from "lru-cache";
import { VesprApiClient } from "../api/VesprApiClient.js";
import { AdaSpotPriceResponse, WalletDetailedResponse } from "../types/api/schemas.js";
import { CryptoCurrency, FiatCurrency, SupportedCurrency } from "../types/currency.js";

class VesprApiRepository {
  private readonly client: VesprApiClient = new VesprApiClient();
  private readonly spotPriceCache = new LRUCache<FiatCurrency, AdaSpotPriceResponse>({
    max: 100,
    ttl: 1000 * 60 * 10, // 10 minutes
  });

  async getAdaSpotPrice(currency: SupportedCurrency): Promise<AdaSpotPriceResponse> {
    if (currency === CryptoCurrency.ADA) {
      return {
        currency: CryptoCurrency.ADA,
        spot: "1",
        spot1hAgo: null,
        spot24hAgo: null,
      };
    }
    const cached = this.spotPriceCache.get(currency);
    if (cached) {
      return cached;
    }
    const spotPrice = await this.client.getAdaSpotPrice(currency);
    this.spotPriceCache.set(currency, spotPrice);
    return spotPrice;
  }

  async getDetailedWallet(addressBech32: string): Promise<WalletDetailedResponse> {
    return this.client.fetchWalletDetailed(addressBech32);
  }
}

export default new VesprApiRepository();
