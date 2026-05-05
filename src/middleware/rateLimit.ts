import { FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../utils/logger.js";

interface RateLimitEntry {
  requests: number[];
  dailyRequests: number[];
}

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerDay: number;
  trustedProxies?: string[];
}

const MINUTE_WINDOW_MS = 60_000;
const DAY_WINDOW_MS = 86_400_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  constructor(private readonly config: RateLimitConfig) {}

  checkLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } | null {
    const now = Date.now();
    let entry = this.store.get(ip);

    if (!entry) {
      entry = { requests: [], dailyRequests: [] };
      this.store.set(ip, entry);
    }

    entry.requests = entry.requests.filter((time) => now - time < MINUTE_WINDOW_MS);
    entry.dailyRequests = entry.dailyRequests.filter((time) => now - time < DAY_WINDOW_MS);

    if (entry.dailyRequests.length >= this.config.maxRequestsPerDay) {
      const oldestRequest = entry.dailyRequests[0] ?? now;
      const retryAfterSeconds = Math.ceil((oldestRequest + DAY_WINDOW_MS - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    if (entry.requests.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = entry.requests[0] ?? now;
      const retryAfterSeconds = Math.ceil((oldestRequest + MINUTE_WINDOW_MS - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    entry.requests.push(now);
    entry.dailyRequests.push(now);

    return null;
  }

  getRemaining(ip: string): { perMinute: number; perDay: number } {
    const now = Date.now();
    const entry = this.store.get(ip);

    if (!entry) {
      return {
        perMinute: this.config.maxRequestsPerMinute,
        perDay: this.config.maxRequestsPerDay,
      };
    }

    const minuteRequests = entry.requests.filter((time) => now - time < MINUTE_WINDOW_MS);
    const dailyRequests = entry.dailyRequests.filter((time) => now - time < DAY_WINDOW_MS);

    return {
      perMinute: Math.max(0, this.config.maxRequestsPerMinute - minuteRequests.length),
      perDay: Math.max(0, this.config.maxRequestsPerDay - dailyRequests.length),
    };
  }

  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, entry] of this.store.entries()) {
      entry.requests = entry.requests.filter((time) => now - time < MINUTE_WINDOW_MS);
      entry.dailyRequests = entry.dailyRequests.filter((time) => now - time < DAY_WINDOW_MS);

      if (entry.requests.length === 0 && entry.dailyRequests.length === 0) {
        this.store.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug("rate_limiter_cleanup", { cleaned, remaining: this.store.size });
    }
  }
}

function getClientIp(request: FastifyRequest, trustedProxies: string[]): string {
  if (trustedProxies.length > 0 && trustedProxies.some((proxy) => request.ip.startsWith(proxy))) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
  }
  return request.ip;
}

export function createRateLimitHook(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  const cleanupInterval = setInterval(() => limiter.cleanup(), CLEANUP_INTERVAL_MS);

  process.on("SIGINT", () => clearInterval(cleanupInterval));
  process.on("SIGTERM", () => clearInterval(cleanupInterval));

  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const ip = getClientIp(request, config.trustedProxies ?? []);
    const result = limiter.checkLimit(ip);
    const remaining = limiter.getRemaining(ip);

    reply.header("X-RateLimit-Limit-Minute", config.maxRequestsPerMinute);
    reply.header("X-RateLimit-Remaining-Minute", remaining.perMinute);
    reply.header("X-RateLimit-Limit-Day", config.maxRequestsPerDay);
    reply.header("X-RateLimit-Remaining-Day", remaining.perDay);

    if (result) {
      logger.warn("rate_limit_exceeded", {
        ip,
        path: request.url,
        retryAfter: result.retryAfterSeconds,
      });

      reply.header("Retry-After", result.retryAfterSeconds);

      return reply.status(429).send({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`,
          retryAfter: result.retryAfterSeconds,
          limits: {
            perMinute: config.maxRequestsPerMinute,
            perDay: config.maxRequestsPerDay,
          },
        },
      });
    }

    logger.debug("rate_limit_allowed", {
      ip,
      path: request.url,
      remainingMinute: remaining.perMinute,
      remainingDay: remaining.perDay,
    });
  };
}
