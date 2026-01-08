/**
 * Server configuration from environment variables
 */
export const config = {
  /** VESPR API base URL */
  apiBaseUrl: process.env.VESPR_API_URL ?? 'https://api.vespr.xyz',

  /** Request timeout in milliseconds */
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 30000,

  /** Maximum retry attempts for transient failures */
  maxRetries: Number(process.env.MAX_RETRIES) || 3,

  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 1000,
};
