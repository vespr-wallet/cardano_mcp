import { describe, it, expect } from "@jest/globals";
import { StakePoolInfoSchema, StakingInfoResponseSchema } from "./schemas.js";

const poolBase = {
  meta: null,
  apy: "3.25",
  saturation: "0.5",
};

const reward = { pool: { id_bech_32: "pool1abc" }, time_utc: 1_700_000_000, lovelace: "1000000" };

describe("StakePoolInfoSchema", () => {
  it("keeps pool_id when the API sends it", () => {
    const pool = StakePoolInfoSchema.parse({ ...poolBase, pool_id: "pool1primary", id_bech_32: "pool1alt" });

    expect(pool.pool_id).toBe("pool1primary");
  });

  it("falls back to id_bech_32 when pool_id is missing", () => {
    const pool = StakePoolInfoSchema.parse({ ...poolBase, id_bech_32: "pool1alt" });

    expect(pool.pool_id).toBe("pool1alt");
  });

  it("uses an empty pool_id when neither identifier is present", () => {
    const pool = StakePoolInfoSchema.parse(poolBase);

    expect(pool.pool_id).toBe("");
  });

  it("coerces apy and saturation from BigNumber strings", () => {
    const pool = StakePoolInfoSchema.parse({ ...poolBase, pool_id: "pool1x" });

    expect(pool.apy).toBe(3.25);
    expect(pool.saturation).toBe(0.5);
  });
});

describe("StakingInfoResponseSchema total_rewards normalization", () => {
  const registered = {
    runtime_type: "REGISTERED",
    wallet_apy: "2.5",
    active_pool: { ...poolBase, pool_id: "pool1active" },
    suggested_pool: null,
    past_rewards: [reward],
    future_rewards: [],
  };

  const deregistered = {
    runtime_type: "DEREGISTERED",
    suggested_pool: { ...poolBase, pool_id: "pool1suggested" },
    past_rewards: [reward],
  };

  it.each([
    ["REGISTERED", registered],
    ["DEREGISTERED", deregistered],
  ])("%s: prefers total_rewards", (_label, base) => {
    const parsed = StakingInfoResponseSchema.parse({ ...base, total_rewards: "5", total_rewards_lovelace: "9" });

    expect(parsed).toEqual(expect.objectContaining({ runtime_type: base.runtime_type, total_rewards: "5" }));
  });

  it.each([
    ["REGISTERED", registered],
    ["DEREGISTERED", deregistered],
  ])("%s: falls back to total_rewards_lovelace", (_label, base) => {
    const parsed = StakingInfoResponseSchema.parse({ ...base, total_rewards_lovelace: "9" });

    expect(parsed).toEqual(expect.objectContaining({ total_rewards: "9" }));
  });

  it.each([
    ["REGISTERED", registered],
    ["DEREGISTERED", deregistered],
  ])("%s: defaults total_rewards to 0 when neither field is present", (_label, base) => {
    const parsed = StakingInfoResponseSchema.parse(base);

    expect(parsed).toEqual(expect.objectContaining({ total_rewards: "0" }));
  });

  it("rejects an unknown runtime_type", () => {
    expect(StakingInfoResponseSchema.safeParse({ ...deregistered, runtime_type: "PAUSED" }).success).toBe(false);
  });
});
