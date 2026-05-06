import type { FastifyRateLimitStore } from "@fastify/rate-limit";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface Entry {
  minuteTs: number[];
  dayTs: number[];
}

/**
 * Returns a @fastify/rate-limit-compatible store constructor that enforces
 * both a per-minute and a per-day sliding-window limit per key.
 *
 * The plugin is configured with max=maxPerMinute. When the day budget is
 * exhausted the store returns current=maxPerMinute+1, which causes the plugin
 * to treat the request as over-limit regardless of the per-minute count.
 */
export function createDualWindowStore(
  maxPerMinute: number,
  maxPerDay: number,
): new (options: unknown) => FastifyRateLimitStore {
  return class implements FastifyRateLimitStore {
    private entries = new Map<string, Entry>();

    constructor(_options: unknown) {
      const interval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
      (interval as NodeJS.Timeout).unref?.();
    }

    incr(key: string, cb: (err: Error | null, result?: { current: number; ttl: number }) => void): void {
      const now = Date.now();
      let entry = this.entries.get(key);
      if (!entry) {
        entry = { minuteTs: [], dayTs: [] };
        this.entries.set(key, entry);
      }

      entry.minuteTs = entry.minuteTs.filter((t) => now - t < MINUTE_MS);
      entry.minuteTs.push(now);

      entry.dayTs = entry.dayTs.filter((t) => now - t < DAY_MS);
      entry.dayTs.push(now);

      if (entry.dayTs.length > maxPerDay) {
        const ttl = (entry.dayTs[0] ?? now) + DAY_MS - now;
        cb(null, { current: maxPerMinute + 1, ttl });
        return;
      }

      const ttl = (entry.minuteTs[0] ?? now) + MINUTE_MS - now;
      cb(null, { current: entry.minuteTs.length, ttl });
    }

    child(_routeOptions: unknown): FastifyRateLimitStore {
      return this;
    }

    private cleanup(): void {
      const now = Date.now();
      for (const [key, entry] of this.entries) {
        entry.minuteTs = entry.minuteTs.filter((t) => now - t < MINUTE_MS);
        entry.dayTs = entry.dayTs.filter((t) => now - t < DAY_MS);
        if (entry.minuteTs.length === 0 && entry.dayTs.length === 0) {
          this.entries.delete(key);
        }
      }
    }
  };
}
