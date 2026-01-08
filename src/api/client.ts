/**
 * VESPR API client for wallet data
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Token information from the wallet API
 */
export interface TokenInfo {
  policy: string;
  hex_asset_name: string;
  name: string;
  ticker: string | null;
  quantity: string;
  decimals: number;
}

/**
 * Response from the /v7/wallet/detailed endpoint
 * Only includes fields needed for the MCP tool
 */
export interface WalletDetailedResponse {
  lovelace: string;
  rewards_lovelace: string;
  handles: string[];
  tokens: TokenInfo[];
}

/**
 * Error thrown when the VESPR API request fails
 * Contains user-friendly messages for common error scenarios
 */
export class VesprApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'VesprApiError';
  }
}

/**
 * Get user-friendly error message based on HTTP status code
 */
function getErrorMessageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Invalid wallet address format.';
    case 404:
      return 'Wallet not found. Verify the address is correct.';
    case 429:
      return 'Rate limited by VESPR API. Please wait before retrying.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'VESPR API is temporarily unavailable. Try again later.';
    default:
      return `VESPR API returned an error (status ${statusCode}).`;
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (5xx or 429)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof VesprApiError && error.statusCode) {
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  return false;
}

/**
 * Execute function with retry and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt === config.maxRetries - 1) {
        throw error;
      }

      const delayMs = config.retryBaseDelayMs * Math.pow(2, attempt);
      logger.warn('api_retry', {
        context,
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        delayMs,
        error: lastError.message,
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Fetch detailed wallet data from VESPR API (single attempt)
 * @param address - Cardano wallet address (bech32 format)
 * @returns Wallet data including ADA balance, rewards, tokens, and handles
 * @throws VesprApiError if the request fails
 */
async function fetchWalletDetailedOnce(address: string): Promise<WalletDetailedResponse> {
  const url = `${config.apiBaseUrl}/v7/wallet/detailed`;
  const start = Date.now();
  const truncatedAddress = address.slice(0, 20) + '...';

  logger.info('api_call_start', { address: truncatedAddress });

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('api_call_error', {
        address: truncatedAddress,
        error: 'Request timed out',
        latencyMs: Date.now() - start,
      });
      throw new VesprApiError('Request timed out. Try again.', undefined, error);
    }

    // Handle network errors
    logger.error('api_call_error', {
      address: truncatedAddress,
      error: 'Network error',
      latencyMs: Date.now() - start,
    });
    throw new VesprApiError(
      'Unable to connect to VESPR API. Check your internet connection.',
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = getErrorMessageForStatus(response.status);
    logger.error('api_call_error', {
      address: truncatedAddress,
      error: message,
      statusCode: response.status,
      latencyMs: Date.now() - start,
    });
    throw new VesprApiError(message, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    logger.error('api_call_error', {
      address: truncatedAddress,
      error: 'Failed to parse API response',
      latencyMs: Date.now() - start,
    });
    throw new VesprApiError(
      'Failed to parse API response.',
      undefined,
      error instanceof Error ? error : undefined
    );
  }

  // Extract only the fields we need
  const rawResult = data as Record<string, unknown>;
  const walletData: WalletDetailedResponse = {
    lovelace: String(rawResult.lovelace ?? '0'),
    rewards_lovelace: String(rawResult.rewards_lovelace ?? '0'),
    handles: Array.isArray(rawResult.handles) ? rawResult.handles : [],
    tokens: Array.isArray(rawResult.tokens)
      ? rawResult.tokens.map((t: Record<string, unknown>) => ({
        policy: String(t.policy ?? ''),
        hex_asset_name: String(t.hex_asset_name ?? ''),
        name: String(t.name ?? ''),
        ticker: t.ticker != null ? String(t.ticker) : null,
        quantity: String(t.quantity ?? '0'),
        decimals: typeof t.decimals === 'number' ? t.decimals : 0,
      }))
      : [],
  };

  logger.info('api_call_success', {
    address: truncatedAddress,
    latencyMs: Date.now() - start,
    tokenCount: walletData.tokens.length,
  });

  return walletData;
}

/**
 * Fetch detailed wallet data with automatic retry
 * Retries on 5xx errors and 429 (rate limit) with exponential backoff
 * @param address - Cardano wallet address (bech32 format)
 * @returns Wallet data including ADA balance, rewards, tokens, and handles
 * @throws VesprApiError if all retry attempts fail
 */
export async function fetchWalletDetailed(address: string): Promise<WalletDetailedResponse> {
  return withRetry(
    () => fetchWalletDetailedOnce(address),
    `fetchWalletDetailed(${address.slice(0, 15)}...)`
  );
}
