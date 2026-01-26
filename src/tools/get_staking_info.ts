import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import { lovelaceToAda } from "../utils/cardano.js";
import { isValidCardanoAddress } from "../utils/validation.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import type { StakingInfoResponse, StakePoolInfo, RewardItem } from "../types/api/schemas.js";

// Output schema for pool info (shared across states)
const poolOutputSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  ticker: z.string().nullable(),
  apy: z.number(),
  saturation: z.number(),
});

// Output schema for reward item
const rewardOutputSchema = z.object({
  poolId: z.string(),
  poolTicker: z.string().nullable(),
  amountAda: z.string(),
  timestamp: z.string(),
});

/**
 * Unified output schema for staking info.
 * Uses a single object with all possible fields to maintain MCP SDK compatibility.
 * (MCP SDK's normalizeObjectSchema doesn't support discriminatedUnion schemas)
 *
 * Fields present by status:
 * - NEVER_REGISTERED: suggestedPool, averageApy
 * - REGISTERED: totalRewardsAda, walletApy, activePool, suggestedPool, nextReward, pastRewardsCount, futureRewardsCount
 * - DEREGISTERED: totalRewardsAda, suggestedPool, pastRewardsCount
 */
const stakingOutputSchema = z.object({
  // Common fields (always present)
  status: z.enum(["NEVER_REGISTERED", "REGISTERED", "DEREGISTERED"]),
  stakingAddress: z.string().nullable(),
  balanceAda: z.string().nullable(),

  // NEVER_REGISTERED specific
  averageApy: z.number().nullable(), // null when not NEVER_REGISTERED

  // REGISTERED specific
  walletApy: z.number().nullable(), // null when not REGISTERED
  activePool: poolOutputSchema.nullable(), // null when not REGISTERED
  nextReward: rewardOutputSchema.nullable(), // null when not REGISTERED or no next reward
  futureRewardsCount: z.number().nullable(), // null when not REGISTERED

  // Shared by multiple states
  totalRewardsAda: z.string().nullable(), // null when NEVER_REGISTERED
  suggestedPool: poolOutputSchema.nullable(), // always present but nullable for REGISTERED
  pastRewardsCount: z.number().nullable(), // null when NEVER_REGISTERED
});

/**
 * Format pool info for output
 */
function formatPool(pool: StakePoolInfo) {
  return {
    id: pool.pool_id,
    name: pool.meta?.name ?? null,
    ticker: pool.meta?.ticker ?? null,
    apy: pool.apy,
    saturation: pool.saturation,
  };
}

/**
 * Format reward item for output
 */
function formatReward(reward: RewardItem): z.infer<typeof rewardOutputSchema> {
  return {
    poolId: reward.pool.id_bech_32,
    poolTicker: reward.pool.ticker ?? null,
    amountAda: lovelaceToAda(reward.lovelace),
    timestamp: new Date(reward.time_utc).toISOString(),
  };
}

/**
 * Format pool display string
 */
function formatPoolDisplay(pool: StakePoolInfo): string {
  const name = pool.meta?.name ?? "Unknown";
  const ticker = pool.meta?.ticker ?? pool.pool_id.slice(0, 8);
  return `${name} (${ticker})`;
}

/**
 * Format human-readable text based on staking state
 */
function formatHumanReadable(response: StakingInfoResponse): string {
  const balanceAda = response.lovelace ? lovelaceToAda(response.lovelace) : null;
  const lines: string[] = [];

  switch (response.runtime_type) {
    case "NEVER_REGISTERED": {
      lines.push("Staking Status: Never Registered");
      if (balanceAda) lines.push(`Balance: ${balanceAda} ADA`);
      lines.push("");
      lines.push(
        `Suggested Pool: ${formatPoolDisplay(response.suggested_pool)} - ${(response.suggested_pool.apy * 100).toFixed(2)}% APY`,
      );
      lines.push(`Network Average APY: ${(response.average_apy * 100).toFixed(2)}%`);
      break;
    }

    case "REGISTERED": {
      const totalRewardsAda = lovelaceToAda(response.total_rewards);
      lines.push("Staking Status: Active");
      lines.push(`Pool: ${formatPoolDisplay(response.active_pool)}`);
      lines.push(`APY: ${(response.wallet_apy * 100).toFixed(2)}%`);
      lines.push(`Total Rewards: ${totalRewardsAda} ADA`);
      if (balanceAda) lines.push(`Balance: ${balanceAda} ADA`);

      if (response.next_reward) {
        const nextRewardAda = lovelaceToAda(response.next_reward.lovelace);
        const expectedDate = new Date(response.next_reward.time_utc).toLocaleDateString();
        lines.push(`Next Reward: ${nextRewardAda} ADA (expected ${expectedDate})`);
      }

      lines.push("");
      lines.push(`Past Rewards: ${response.past_rewards.length} payment(s)`);
      lines.push(`Future Rewards: ${response.future_rewards.length} scheduled`);
      break;
    }

    case "DEREGISTERED": {
      const totalRewardsAda = lovelaceToAda(response.total_rewards);
      lines.push("Staking Status: Deregistered");
      lines.push(`Total Rewards Earned: ${totalRewardsAda} ADA`);
      if (balanceAda) lines.push(`Balance: ${balanceAda} ADA`);
      lines.push("");
      lines.push(
        `Suggested Pool: ${formatPoolDisplay(response.suggested_pool)} - ${(response.suggested_pool.apy * 100).toFixed(2)}% APY`,
      );
      lines.push(`Past Rewards: ${response.past_rewards.length} payment(s)`);
      break;
    }
  }

  return lines.join("\n");
}

/**
 * Transform API response to unified output format.
 * All fields are included with null values for status-specific fields that don't apply.
 */
function transformResponse(response: StakingInfoResponse): z.infer<typeof stakingOutputSchema> {
  const base = {
    stakingAddress: response.staking_address ?? null,
    balanceAda: response.lovelace ? lovelaceToAda(response.lovelace) : null,
  };

  switch (response.runtime_type) {
    case "NEVER_REGISTERED":
      return {
        ...base,
        status: "NEVER_REGISTERED" as const,
        // NEVER_REGISTERED specific
        averageApy: response.average_apy,
        suggestedPool: formatPool(response.suggested_pool),
        // Not applicable for NEVER_REGISTERED
        walletApy: null,
        activePool: null,
        nextReward: null,
        futureRewardsCount: null,
        totalRewardsAda: null,
        pastRewardsCount: null,
      };

    case "REGISTERED":
      return {
        ...base,
        status: "REGISTERED" as const,
        // REGISTERED specific
        walletApy: response.wallet_apy,
        activePool: formatPool(response.active_pool),
        nextReward: response.next_reward ? formatReward(response.next_reward) : null,
        futureRewardsCount: response.future_rewards.length,
        // Shared fields
        totalRewardsAda: lovelaceToAda(response.total_rewards),
        suggestedPool: response.suggested_pool ? formatPool(response.suggested_pool) : null,
        pastRewardsCount: response.past_rewards.length,
        // Not applicable for REGISTERED
        averageApy: null,
      };

    case "DEREGISTERED":
      return {
        ...base,
        status: "DEREGISTERED" as const,
        // DEREGISTERED specific
        totalRewardsAda: lovelaceToAda(response.total_rewards),
        suggestedPool: formatPool(response.suggested_pool),
        pastRewardsCount: response.past_rewards.length,
        // Not applicable for DEREGISTERED
        averageApy: null,
        walletApy: null,
        activePool: null,
        nextReward: null,
        futureRewardsCount: null,
      };
  }
}

export function registerGetStakingInfo(server: McpServer): void {
  server.registerTool(
    "get_staking_info",
    {
      title: "Get Staking Info",
      description:
        "Query staking status and rewards for a Cardano wallet address. Returns staking status (active/never registered/deregistered), pool information, APY, and reward history.",
      inputSchema: {
        address: z.string().describe("Cardano wallet address (bech32 format, addr1...)"),
      },
      outputSchema: stakingOutputSchema,
    },
    async ({ address }) => {
      // Validate address
      if (!isValidCardanoAddress(address)) {
        return {
          content: [{ type: "text" as const, text: "Error: Invalid Cardano address." }],
          isError: true,
        };
      }

      try {
        const response = await VesprApiRepository.getStakingInfo(address);

        const output = transformResponse(response);
        const summary = formatHumanReadable(response);

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof VesprApiError) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` },
          ],
          isError: true,
        };
      }
    },
  );
}
