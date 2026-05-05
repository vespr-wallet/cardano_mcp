import { jest, describe, beforeEach, afterEach, it, expect } from "@jest/globals";
import { RateLimiter } from "./rateLimit.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new RateLimiter({ maxRequestsPerMinute: 3, maxRequestsPerDay: 5 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("checkLimit", () => {
    it("allows requests under the limit", () => {
      expect(limiter.checkLimit("1.2.3.4")).toBeNull();
      expect(limiter.checkLimit("1.2.3.4")).toBeNull();
      expect(limiter.checkLimit("1.2.3.4")).toBeNull();
    });

    it("blocks requests over per-minute limit", () => {
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");

      const result = limiter.checkLimit("1.2.3.4");
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
      expect(result!.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("blocks requests over per-day limit", () => {
      // Fill up minute window (3 requests)
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");

      // Advance past the minute window so per-minute counter resets
      jest.advanceTimersByTime(61_000);

      // 2 more requests to reach the daily limit of 5
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");

      // Advance past the minute window again so per-minute doesn't block first
      jest.advanceTimersByTime(61_000);

      const result = limiter.checkLimit("1.2.3.4");
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
      expect(result!.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("tracks different IPs independently", () => {
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");

      expect(limiter.checkLimit("5.6.7.8")).toBeNull();
    });
  });

  describe("getRemaining", () => {
    it("returns full limits for unknown IPs", () => {
      const remaining = limiter.getRemaining("1.2.3.4");
      expect(remaining.perMinute).toBe(3);
      expect(remaining.perDay).toBe(5);
    });

    it("decrements remaining after requests", () => {
      limiter.checkLimit("1.2.3.4");
      limiter.checkLimit("1.2.3.4");

      const remaining = limiter.getRemaining("1.2.3.4");
      expect(remaining.perMinute).toBe(1);
      expect(remaining.perDay).toBe(3);
    });
  });

  describe("cleanup", () => {
    it("removes stale entries after window expires", () => {
      limiter.checkLimit("1.2.3.4");

      jest.advanceTimersByTime(61_000);
      limiter.cleanup();

      const remaining = limiter.getRemaining("1.2.3.4");
      expect(remaining.perMinute).toBe(3);
      expect(remaining.perDay).toBe(4);
    });

    it("removes the IP entirely after both windows expire", () => {
      limiter.checkLimit("1.2.3.4");

      jest.advanceTimersByTime(86_401_000);
      limiter.cleanup();

      const remaining = limiter.getRemaining("1.2.3.4");
      expect(remaining.perMinute).toBe(3);
      expect(remaining.perDay).toBe(5);
    });
  });
});
