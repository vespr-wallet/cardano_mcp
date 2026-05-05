/**
 * Server mode type
 * - stdio: STDIO transport only (default, for Claude Desktop integration)
 * - http: HTTP transport only (for web clients)
 * - both: Both transports simultaneously (useful for local development)
 */
export type ServerMode = "stdio" | "http" | "both";

/**
 * Parse and validate SERVER_MODE environment variable
 */
function parseServerMode(): ServerMode {
  const mode = process.env.SERVER_MODE?.toLowerCase();
  if (mode === "http" || mode === "both") {
    return mode;
  }
  return "stdio"; // Default for backward compatibility
}

/**
 * Server configuration from environment variables
 */
export const config = {
  /** VESPR API base URL */
  apiBaseUrl: process.env.VESPR_API_URL ?? "https://api.vespr.xyz",

  /** VESPR API Key (optional - users provide their own via X-API-Key header in HTTP mode) */
  apiKey: process.env.VESPR_API_KEY,

  /** Request timeout in milliseconds */
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 30000,

  /** Maximum retry attempts for transient failures */
  maxRetries: Number(process.env.MAX_RETRIES) || 3,

  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: Number(process.env.RETRY_BASE_DELAY_MS) || 1000,

  /** Server mode: stdio, http, or both */
  serverMode: parseServerMode(),

  /** HTTP server port */
  httpPort: Number(process.env.HTTP_PORT) || 3000,

  /** HTTP server host */
  httpHost: process.env.HTTP_HOST ?? "0.0.0.0",

  /** Rate limit: max requests per minute per IP */
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 10,

  /** Rate limit: max requests per day per IP */
  rateLimitPerDay: Number(process.env.RATE_LIMIT_PER_DAY) || 250,

  /** Trusted proxy IPs/prefixes for x-forwarded-for (comma-separated, e.g. "10.0.0.,172.17.") */
  trustedProxies: (process.env.TRUSTED_PROXIES ?? "").split(",").filter(Boolean),

  /** Allowed CORS origins (comma-separated). Empty = deny all cross-origin requests */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),

  /** Idle session TTL in milliseconds — sessions unused beyond this are evicted */
  sessionTtlMs: Number(process.env.SESSION_TTL_MS) || 3_600_000,
};
