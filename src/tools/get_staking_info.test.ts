import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetStakingInfo } from "./get_staking_info.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { VesprApiError } from "../types/errors.js";
import {
  StakePoolInfoSchema,
  StakingInfoResponseSchema,
  type StakingInfoResponse,
  type StakePoolInfo,
  type RewardItem,
} from "../types/api/schemas.js";

describe("get_staking_info tool", () => {
  let registeredHandler: (args: { address: string }) => Promise<unknown>;
  let getStakingInfoSpy: jest.SpiedFunction<typeof VesprApiRepository.getStakingInfo>;

  // Helper to create mock pool info
  const createMockPool = (overrides?: Partial<StakePoolInfo>): StakePoolInfo => ({
    pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    meta: {
      name: "Test Pool",
      ticker: "TEST",
      homepage: "https://testpool.io",
      description: "A test pool",
      image: { type: "URL_IMAGE" as const, image: "https://testpool.io/logo.png" },
    },
    apy: 0.0412,
    saturation: 0.75,
    ...overrides,
  });

  // Helper to create mock reward item
  const createMockReward = (overrides?: Partial<RewardItem>): RewardItem => ({
    pool: {
      id_bech_32: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      ticker: "TEST",
    },
    time_utc: 1700000000000,
    lovelace: "1500000",
    uses_current_balance: false,
    ...overrides,
  });

  beforeEach(() => {
    // Create a mock server that captures the registered tool handler
    const mockServer = {
      registerTool: jest.fn(
        (_name: string, _config: unknown, handler: (args: { address: string }) => Promise<unknown>) => {
          registeredHandler = handler;
        },
      ),
    } as unknown as McpServer;

    registerGetStakingInfo(mockServer);

    // Spy on the repository method
    getStakingInfoSpy = jest.spyOn(VesprApiRepository, "getStakingInfo");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("address validation", () => {
    it("returns error for invalid address", async () => {
      const result = await registeredHandler({ address: "invalid-address" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid Cardano address." }],
        isError: true,
      });

      // Should not call the API
      expect(getStakingInfoSpy).not.toHaveBeenCalled();
    });

    it("returns error for empty address", async () => {
      const result = await registeredHandler({ address: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Invalid Cardano address." }],
        isError: true,
      });

      expect(getStakingInfoSpy).not.toHaveBeenCalled();
    });

    it("trims whitespace before validation and repository calls", async () => {
      const validAddress =
        "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";
      const mockResponse: StakingInfoResponse = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "10000000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_reward_time_utc: 1701000000000,
        average_apy: 0.04,
        suggested_pool: createMockPool(),
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      await registeredHandler({ address: `  ${validAddress}  ` });

      expect(getStakingInfoSpy).toHaveBeenCalledWith(validAddress);
    });
  });

  describe("NEVER_REGISTERED response", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("formats NEVER_REGISTERED response correctly", async () => {
      const mockResponse: StakingInfoResponse = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "10000000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_reward_time_utc: 1701000000000,
        average_apy: 0.04,
        suggested_pool: createMockPool(),
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          status: string;
          stakingAddress: string;
          balanceAda: string;
          suggestedPool: { id: string; name: string; ticker: string; apy: number };
          averageApy: number;
        };
      };

      expect(getStakingInfoSpy).toHaveBeenCalledWith(validAddress);

      // Check structured content
      expect(result.structuredContent.status).toBe("NEVER_REGISTERED");
      expect(result.structuredContent.stakingAddress).toBe(
        "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      );
      expect(result.structuredContent.balanceAda).toBe("10000.000000");
      expect(result.structuredContent.suggestedPool.name).toBe("Test Pool");
      expect(result.structuredContent.suggestedPool.ticker).toBe("TEST");
      expect(result.structuredContent.averageApy).toBe(0.04);

      // Check text content
      expect(result.content[0].text).toContain("Staking Status: Never Registered");
      expect(result.content[0].text).toContain("Balance: 10000.000000 ADA");
      expect(result.content[0].text).toContain("Suggested Pool: Test Pool (TEST) - 4.12% APY");
      expect(result.content[0].text).toContain("Network Average APY: 4.00%");
    });

    it("handles pool with null meta gracefully", async () => {
      const mockResponse: StakingInfoResponse = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "5000000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_reward_time_utc: 1701000000000,
        average_apy: 0.04,
        suggested_pool: createMockPool({ meta: null }),
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          suggestedPool: { name: string | null; ticker: string | null };
        };
      };

      expect(result.structuredContent.suggestedPool.name).toBeNull();
      expect(result.structuredContent.suggestedPool.ticker).toBeNull();
      // Should still display something in text
      expect(result.content[0].text).toContain("Unknown (pool1xxx");
    });
  });

  describe("REGISTERED response", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("formats REGISTERED response correctly with next reward", async () => {
      const mockResponse: StakingInfoResponse = {
        runtime_type: "REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "50000000000",
        total_rewards: "2500000000",
        withdrawable_rewards: "0",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_rewards_on_re_delegation_time_utc: 1700600000000,
        last_registration_first_earning_time_utc: 1699500000000,
        wallet_apy: 0.045,
        active_pool: createMockPool({ meta: { ...createMockPool().meta!, name: "Active Pool", ticker: "ACTV" } }),
        suggested_pool: createMockPool({ meta: { ...createMockPool().meta!, name: "Better Pool", ticker: "BTTR" } }),
        next_reward: createMockReward({ lovelace: "2000000", time_utc: 1700600000000 }),
        past_rewards: [createMockReward(), createMockReward()],
        future_rewards: [createMockReward()],
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          status: string;
          stakingAddress: string;
          balanceAda: string;
          totalRewardsAda: string;
          walletApy: number;
          activePool: { name: string; ticker: string };
          suggestedPool: { name: string; ticker: string } | null;
          nextReward: { amountAda: string; timestamp: string } | null;
          pastRewardsCount: number;
          futureRewardsCount: number;
        };
      };

      expect(getStakingInfoSpy).toHaveBeenCalledWith(validAddress);

      // Check structured content
      expect(result.structuredContent.status).toBe("REGISTERED");
      expect(result.structuredContent.balanceAda).toBe("50000.000000");
      expect(result.structuredContent.totalRewardsAda).toBe("2500.000000");
      expect(result.structuredContent.walletApy).toBe(0.045);
      expect(result.structuredContent.activePool.name).toBe("Active Pool");
      expect(result.structuredContent.activePool.ticker).toBe("ACTV");
      expect(result.structuredContent.suggestedPool?.name).toBe("Better Pool");
      expect(result.structuredContent.nextReward?.amountAda).toBe("2.000000");
      expect(result.structuredContent.pastRewardsCount).toBe(2);
      expect(result.structuredContent.futureRewardsCount).toBe(1);

      // Check text content
      expect(result.content[0].text).toContain("Staking Status: Active");
      expect(result.content[0].text).toContain("Pool: Active Pool (ACTV)");
      expect(result.content[0].text).toContain("APY: 4.50%");
      expect(result.content[0].text).toContain("Total Rewards: 2500.000000 ADA");
      expect(result.content[0].text).toContain("Balance: 50000.000000 ADA");
      expect(result.content[0].text).toContain("Next Reward: 2.000000 ADA");
      expect(result.content[0].text).toContain("Past Rewards: 2 payment(s)");
      expect(result.content[0].text).toContain("Future Rewards: 1 scheduled");
    });

    it("handles REGISTERED response without next reward", async () => {
      const mockResponse: StakingInfoResponse = {
        runtime_type: "REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "25000000000",
        total_rewards: "1000000000",
        withdrawable_rewards: "0",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_rewards_on_re_delegation_time_utc: 1700600000000,
        last_registration_first_earning_time_utc: 1699500000000,
        wallet_apy: 0.038,
        active_pool: createMockPool(),
        suggested_pool: null,
        next_reward: null,
        past_rewards: [],
        future_rewards: [],
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          nextReward: unknown;
          suggestedPool: unknown;
        };
      };

      expect(result.structuredContent.nextReward).toBeNull();
      expect(result.structuredContent.suggestedPool).toBeNull();
      expect(result.content[0].text).not.toContain("Next Reward:");
    });
  });

  describe("DEREGISTERED response", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("formats DEREGISTERED response correctly", async () => {
      const mockResponse: StakingInfoResponse = {
        runtime_type: "DEREGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "15000000000",
        total_rewards: "500000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_rewards_on_re_delegation_time_utc: 1700600000000,
        suggested_pool: createMockPool({ meta: { ...createMockPool().meta!, name: "Comeback Pool", ticker: "CMBC" } }),
        past_rewards: [createMockReward(), createMockReward(), createMockReward()],
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          status: string;
          stakingAddress: string;
          balanceAda: string;
          totalRewardsAda: string;
          suggestedPool: { name: string; ticker: string };
          pastRewardsCount: number;
        };
      };

      expect(getStakingInfoSpy).toHaveBeenCalledWith(validAddress);

      // Check structured content
      expect(result.structuredContent.status).toBe("DEREGISTERED");
      expect(result.structuredContent.balanceAda).toBe("15000.000000");
      expect(result.structuredContent.totalRewardsAda).toBe("500.000000");
      expect(result.structuredContent.suggestedPool.name).toBe("Comeback Pool");
      expect(result.structuredContent.suggestedPool.ticker).toBe("CMBC");
      expect(result.structuredContent.pastRewardsCount).toBe(3);

      // Check text content
      expect(result.content[0].text).toContain("Staking Status: Deregistered");
      expect(result.content[0].text).toContain("Total Rewards Earned: 500.000000 ADA");
      expect(result.content[0].text).toContain("Balance: 15000.000000 ADA");
      expect(result.content[0].text).toContain("Suggested Pool: Comeback Pool (CMBC) - 4.12% APY");
      expect(result.content[0].text).toContain("Past Rewards: 3 payment(s)");
    });
  });

  describe("BigNumber string coercion (tool-level)", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("handles coerced APY and saturation values in tool output", async () => {
      // Values after schema coercion (schema converts strings to numbers)
      const mockResponse = {
        runtime_type: "NEVER_REGISTERED" as const,
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "10000000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_reward_time_utc: 1701000000000,
        average_apy: 0.04, // After schema coercion
        suggested_pool: {
          pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          meta: {
            name: "Test Pool",
            ticker: "TEST",
            homepage: "https://testpool.io",
            description: "A test pool",
            image: { type: "URL_IMAGE" as const, image: "https://testpool.io/logo.png" },
          },
          apy: 0.0412, // After schema coercion
          saturation: 0.75, // After schema coercion
        },
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          suggestedPool: { apy: number; saturation: number };
          averageApy: number;
        };
      };

      // Verify values are numbers and format correctly
      expect(typeof result.structuredContent.suggestedPool.apy).toBe("number");
      expect(typeof result.structuredContent.suggestedPool.saturation).toBe("number");
      expect(typeof result.structuredContent.averageApy).toBe("number");

      // Verify values are correct
      expect(result.structuredContent.suggestedPool.apy).toBe(0.0412);
      expect(result.structuredContent.suggestedPool.saturation).toBe(0.75);
      expect(result.structuredContent.averageApy).toBe(0.04);

      // Verify APY formatting in human-readable output
      expect(result.content[0].text).toContain("4.12% APY");
      expect(result.content[0].text).toContain("Network Average APY: 4.00%");
    });

    it("handles coerced wallet_apy in REGISTERED response", async () => {
      const mockResponse = {
        runtime_type: "REGISTERED" as const,
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "50000000000",
        total_rewards: "2500000000",
        withdrawable_rewards: "0",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_rewards_on_re_delegation_time_utc: 1700600000000,
        last_registration_first_earning_time_utc: 1699500000000,
        wallet_apy: 0.045, // After schema coercion
        active_pool: createMockPool(),
        suggested_pool: null,
        next_reward: null,
        past_rewards: [],
        future_rewards: [],
      };

      getStakingInfoSpy.mockResolvedValue(mockResponse);

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        structuredContent: {
          walletApy: number;
        };
      };

      // Verify wallet_apy is a number
      expect(typeof result.structuredContent.walletApy).toBe("number");
      expect(result.structuredContent.walletApy).toBe(0.045);

      // Verify formatting in human-readable output
      expect(result.content[0].text).toContain("APY: 4.50%");
    });
  });

  describe("BigNumber string coercion (schema-level)", () => {
    it("StakePoolInfoSchema coerces string apy to number", () => {
      const rawData = {
        pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        meta: null,
        apy: "0.0412", // String from API
        saturation: "0.75", // String from API
      };

      const parsed = StakePoolInfoSchema.parse(rawData);

      expect(typeof parsed.apy).toBe("number");
      expect(typeof parsed.saturation).toBe("number");
      expect(parsed.apy).toBe(0.0412);
      expect(parsed.saturation).toBe(0.75);
    });

    it("StakePoolInfoSchema also accepts numeric values", () => {
      const rawData = {
        pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        meta: null,
        apy: 0.0412, // Already a number
        saturation: 0.75, // Already a number
      };

      const parsed = StakePoolInfoSchema.parse(rawData);

      expect(parsed.apy).toBe(0.0412);
      expect(parsed.saturation).toBe(0.75);
    });

    it("StakingInfoResponseSchema coerces string average_apy in NEVER_REGISTERED", () => {
      const rawData = {
        runtime_type: "NEVER_REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "10000000000",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_reward_time_utc: 1701000000000,
        average_apy: "0.04", // String from API
        suggested_pool: {
          pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          meta: null,
          apy: "0.0412", // String from API
          saturation: "0.75", // String from API
        },
      };

      const parsed = StakingInfoResponseSchema.parse(rawData);

      expect(parsed.runtime_type).toBe("NEVER_REGISTERED");
      if (parsed.runtime_type === "NEVER_REGISTERED") {
        expect(typeof parsed.average_apy).toBe("number");
        expect(parsed.average_apy).toBe(0.04);
        expect(typeof parsed.suggested_pool.apy).toBe("number");
        expect(parsed.suggested_pool.apy).toBe(0.0412);
      }
    });

    it("StakingInfoResponseSchema coerces string wallet_apy in REGISTERED", () => {
      const rawData = {
        runtime_type: "REGISTERED",
        staking_address: "stake1uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        lovelace: "50000000000",
        total_rewards: "2500000000",
        withdrawable_rewards: "0",
        response_time_utc: 1700000000000,
        epoch_start_time_utc: 1699900000000,
        epoch_end_time_utc: 1700500000000,
        first_rewards_on_re_delegation_time_utc: 1700600000000,
        last_registration_first_earning_time_utc: 1699500000000,
        wallet_apy: "0.045", // String from API
        active_pool: {
          pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          meta: null,
          apy: "0.0412", // String from API
          saturation: "0.75", // String from API
        },
        suggested_pool: null,
        next_reward: null,
        past_rewards: [],
        future_rewards: [],
      };

      const parsed = StakingInfoResponseSchema.parse(rawData);

      expect(parsed.runtime_type).toBe("REGISTERED");
      if (parsed.runtime_type === "REGISTERED") {
        expect(typeof parsed.wallet_apy).toBe("number");
        expect(parsed.wallet_apy).toBe(0.045);
        expect(typeof parsed.active_pool.apy).toBe("number");
        expect(parsed.active_pool.apy).toBe(0.0412);
      }
    });

    it("handles zero values correctly", () => {
      const rawData = {
        pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        meta: null,
        apy: "0", // Zero as string
        saturation: "0.0", // Zero with decimal
      };

      const parsed = StakePoolInfoSchema.parse(rawData);

      expect(parsed.apy).toBe(0);
      expect(parsed.saturation).toBe(0);
    });

    it("handles scientific notation strings", () => {
      const rawData = {
        pool_id: "pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        meta: null,
        apy: "4.12e-2", // Scientific notation for 0.0412
        saturation: "7.5e-1", // Scientific notation for 0.75
      };

      const parsed = StakePoolInfoSchema.parse(rawData);

      expect(parsed.apy).toBeCloseTo(0.0412, 4);
      expect(parsed.saturation).toBeCloseTo(0.75, 2);
    });
  });

  describe("error handling", () => {
    const validAddress =
      "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

    it("handles API errors gracefully", async () => {
      getStakingInfoSpy.mockRejectedValue(new VesprApiError("Internal server error", 500));

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Internal server error");
    });

    it("handles unexpected errors gracefully", async () => {
      getStakingInfoSpy.mockRejectedValue(new Error("Network failure"));

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Network failure");
    });

    it("handles non-Error thrown values", async () => {
      getStakingInfoSpy.mockRejectedValue("String error");

      const result = (await registeredHandler({ address: validAddress })) as {
        content: { type: string; text: string }[];
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Unknown error");
    });
  });
});
