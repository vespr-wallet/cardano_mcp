import { jest, describe, beforeEach, afterEach, it, expect } from "@jest/globals";
import { createDualWindowStore } from "./rateLimit.js";

type Store = InstanceType<ReturnType<typeof createDualWindowStore>>;

function incr(store: Store, key: string): Promise<{ current: number; ttl: number }> {
  return new Promise((resolve, reject) => {
    store.incr(key, (err, result) => {
      if (err) reject(err);
      else resolve(result!);
    });
  });
}

describe("DualWindowStore", () => {
  let Store: ReturnType<typeof createDualWindowStore>;
  let store: Store;

  beforeEach(() => {
    jest.useFakeTimers();
    Store = createDualWindowStore(3, 5);
    store = new Store({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("per-minute limit", () => {
    it("allows requests under the limit", async () => {
      const r1 = await incr(store, "1.2.3.4");
      const r2 = await incr(store, "1.2.3.4");
      const r3 = await incr(store, "1.2.3.4");
      expect(r1.current).toBe(1);
      expect(r2.current).toBe(2);
      expect(r3.current).toBe(3);
    });

    it("blocks when per-minute limit exceeded", async () => {
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");

      const result = await incr(store, "1.2.3.4");
      expect(result.current).toBeGreaterThan(3); // > max → plugin blocks
      expect(result.ttl).toBeGreaterThan(0);
    });

    it("resets after the minute window", async () => {
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");

      jest.advanceTimersByTime(61_000);

      const result = await incr(store, "1.2.3.4");
      expect(result.current).toBe(1); // fresh window
    });
  });

  describe("per-day limit", () => {
    it("blocks when per-day limit exceeded", async () => {
      // 3 requests — fills the minute window
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");

      jest.advanceTimersByTime(61_000); // reset minute window

      await incr(store, "1.2.3.4"); // 4th total
      await incr(store, "1.2.3.4"); // 5th total — day limit reached

      jest.advanceTimersByTime(61_000); // reset minute window again

      const result = await incr(store, "1.2.3.4"); // 6th total — day blocked
      expect(result.current).toBeGreaterThan(3);
      expect(result.ttl).toBeGreaterThan(60_000); // retry window > 1 minute (day-scale)
    });
  });

  describe("IP isolation", () => {
    it("tracks different IPs independently", async () => {
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");
      await incr(store, "1.2.3.4");

      const result = await incr(store, "5.6.7.8");
      expect(result.current).toBe(1);
    });
  });
});
