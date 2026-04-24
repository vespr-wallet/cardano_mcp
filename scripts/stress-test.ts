#!/usr/bin/env npx tsx
/**
 * Stress test script for VESPR MCP Server tools.
 * Tests all endpoints for:
 * - Response time (< 2 seconds)
 * - Concurrent query handling
 * - Error resilience
 *
 * Usage: npx tsx scripts/stress-test.ts
 */

import VesprApiRepository from "../src/repository/VesprApiRepository.js";
import { FiatCurrency, CryptoCurrency } from "../src/types/currency.js";

// Test configuration - using known active Cardano entities
const TEST_CONFIG = {
  // VESPR official wallet (known active wallet with tokens)
  address: "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv",
  // SNEK token (popular token)
  tokenUnit: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  // VESPR token unit
  vesprUnit: "8be5f3a0db5cda689f1ed0f78f5b9f76889dc82a6e66e6eda06bcfb1564553505242",
  // Known stake pool (NUTS - StakeNuts pool, verified working)
  poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
  // Known ADA handle
  handle: "vespr",
};

// Performance thresholds
const MAX_RESPONSE_TIME_MS = 2000;
const CONCURRENT_REQUESTS = 5;

interface TestResult {
  tool: string;
  success: boolean;
  responseTimeMs: number;
  error?: string;
  passedThreshold: boolean;
}

interface ConcurrencyResult {
  tool: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  avgResponseTimeMs: number;
  maxResponseTimeMs: number;
  minResponseTimeMs: number;
}

/**
 * Execute a single test and measure response time
 */
async function runTest<T>(name: string, testFn: () => Promise<T>): Promise<TestResult> {
  const start = performance.now();
  try {
    await testFn();
    const responseTimeMs = Math.round(performance.now() - start);
    return {
      tool: name,
      success: true,
      responseTimeMs,
      passedThreshold: responseTimeMs < MAX_RESPONSE_TIME_MS,
    };
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    return {
      tool: name,
      success: false,
      responseTimeMs,
      error: error instanceof Error ? error.message : String(error),
      passedThreshold: false,
    };
  }
}

/**
 * Run concurrent requests and measure performance
 */
async function runConcurrencyTest<T>(
  name: string,
  testFn: () => Promise<T>,
  count: number,
): Promise<ConcurrencyResult> {
  const times: number[] = [];
  let successCount = 0;
  let failedCount = 0;

  const promises = Array(count)
    .fill(null)
    .map(async () => {
      const start = performance.now();
      try {
        await testFn();
        const elapsed = Math.round(performance.now() - start);
        times.push(elapsed);
        successCount++;
      } catch {
        const elapsed = Math.round(performance.now() - start);
        times.push(elapsed);
        failedCount++;
      }
    });

  await Promise.all(promises);

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const max = Math.max(...times);
  const min = Math.min(...times);

  return {
    tool: name,
    totalRequests: count,
    successCount,
    failedCount,
    avgResponseTimeMs: avg,
    maxResponseTimeMs: max,
    minResponseTimeMs: min,
  };
}

/**
 * Run all individual tool tests
 */
async function runIndividualTests(): Promise<TestResult[]> {
  console.error("\n🔧 Running individual tool tests...\n");
  const results: TestResult[] = [];

  // 1. get_supported_currencies (static, no API call)
  results.push(
    await runTest("get_supported_currencies", async () => {
      // This is static data, just verify we can access it
      const { SUPPORTED_FIAT_CURRENCIES, SUPPORTED_CRYPTO_CURRENCIES } = await import("../src/types/currency.js");
      if (SUPPORTED_FIAT_CURRENCIES.length === 0 || SUPPORTED_CRYPTO_CURRENCIES.length === 0) {
        throw new Error("No currencies found");
      }
      return { fiat: SUPPORTED_FIAT_CURRENCIES, crypto: SUPPORTED_CRYPTO_CURRENCIES };
    }),
  );
  console.error(`  ✓ get_supported_currencies: ${results[results.length - 1].responseTimeMs}ms`);

  // 2. get_wallet_balance
  results.push(
    await runTest("get_wallet_balance", async () => {
      return VesprApiRepository.getDetailedWallet(TEST_CONFIG.address, FiatCurrency.USD);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_wallet_balance: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 3. get_transaction_history
  results.push(
    await runTest("get_transaction_history", async () => {
      return VesprApiRepository.getTransactionHistory(TEST_CONFIG.address);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_transaction_history: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 4. get_token_info
  results.push(
    await runTest("get_token_info", async () => {
      return VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_token_info: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 5. get_token_chart
  results.push(
    await runTest("get_token_chart", async () => {
      return VesprApiRepository.getTokenChart(TEST_CONFIG.tokenUnit, "24H", CryptoCurrency.ADA);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_token_chart: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 6. get_trending_tokens
  results.push(
    await runTest("get_trending_tokens", async () => {
      return VesprApiRepository.getTrendingTokens(FiatCurrency.USD, "1H");
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_trending_tokens: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 7. get_staking_info
  results.push(
    await runTest("get_staking_info", async () => {
      return VesprApiRepository.getStakingInfo(TEST_CONFIG.address);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_staking_info: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 8. resolve_ada_handle
  results.push(
    await runTest("resolve_ada_handle", async () => {
      return VesprApiRepository.resolveAdaHandle(TEST_CONFIG.handle);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} resolve_ada_handle: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 9. get_asset_metadata
  results.push(
    await runTest("get_asset_metadata", async () => {
      return VesprApiRepository.getAssetMetadata(TEST_CONFIG.tokenUnit);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_asset_metadata: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 10. get_asset_summary
  results.push(
    await runTest("get_asset_summary", async () => {
      return VesprApiRepository.getAssetSummary([TEST_CONFIG.tokenUnit, TEST_CONFIG.vesprUnit]);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_asset_summary: ${results[results.length - 1].responseTimeMs}ms`,
  );

  // 11. get_pool_info
  results.push(
    await runTest("get_pool_info", async () => {
      return VesprApiRepository.getPoolInfo(TEST_CONFIG.poolId);
    }),
  );
  console.error(
    `  ${results[results.length - 1].success ? "✓" : "✗"} get_pool_info: ${results[results.length - 1].responseTimeMs}ms`,
  );

  return results;
}

/**
 * Run concurrency tests for critical endpoints
 */
async function runConcurrencyTests(): Promise<ConcurrencyResult[]> {
  console.error(`\n🔀 Running concurrency tests (${CONCURRENT_REQUESTS} parallel requests)...\n`);
  const results: ConcurrencyResult[] = [];

  // Test concurrent wallet balance queries
  results.push(
    await runConcurrencyTest(
      "get_wallet_balance (concurrent)",
      () => VesprApiRepository.getDetailedWallet(TEST_CONFIG.address, FiatCurrency.USD),
      CONCURRENT_REQUESTS,
    ),
  );
  console.error(
    `  ${results[results.length - 1].tool}: avg ${results[results.length - 1].avgResponseTimeMs}ms, max ${results[results.length - 1].maxResponseTimeMs}ms`,
  );

  // Test concurrent token info queries
  results.push(
    await runConcurrencyTest(
      "get_token_info (concurrent)",
      () => VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD),
      CONCURRENT_REQUESTS,
    ),
  );
  console.error(
    `  ${results[results.length - 1].tool}: avg ${results[results.length - 1].avgResponseTimeMs}ms, max ${results[results.length - 1].maxResponseTimeMs}ms`,
  );

  // Test concurrent trending queries
  results.push(
    await runConcurrencyTest(
      "get_trending_tokens (concurrent)",
      () => VesprApiRepository.getTrendingTokens(FiatCurrency.USD, "1H"),
      CONCURRENT_REQUESTS,
    ),
  );
  console.error(
    `  ${results[results.length - 1].tool}: avg ${results[results.length - 1].avgResponseTimeMs}ms, max ${results[results.length - 1].maxResponseTimeMs}ms`,
  );

  return results;
}

/**
 * Format and display results
 */
function formatResults(individual: TestResult[], concurrent: ConcurrencyResult[]): void {
  console.error("\n" + "=".repeat(60));
  console.error("📊 STRESS TEST RESULTS");
  console.error("=".repeat(60));

  // Individual test summary
  console.error("\n📋 Individual Tool Tests:");
  console.error("-".repeat(60));

  const passed = individual.filter((r) => r.passedThreshold && r.success);
  const failed = individual.filter((r) => !r.passedThreshold || !r.success);

  for (const result of individual) {
    const status = result.success ? (result.passedThreshold ? "✅ PASS" : "⚠️ SLOW") : "❌ FAIL";
    console.error(
      `  ${status} ${result.tool.padEnd(30)} ${result.responseTimeMs.toString().padStart(5)}ms${result.error ? ` (${result.error})` : ""}`,
    );
  }

  // Concurrency test summary
  console.error("\n📋 Concurrency Tests:");
  console.error("-".repeat(60));

  for (const result of concurrent) {
    const passRate = ((result.successCount / result.totalRequests) * 100).toFixed(0);
    console.error(`  ${result.tool}:`);
    console.error(`    Success: ${result.successCount}/${result.totalRequests} (${passRate}%)`);
    console.error(
      `    Response times: min=${result.minResponseTimeMs}ms, avg=${result.avgResponseTimeMs}ms, max=${result.maxResponseTimeMs}ms`,
    );
  }

  // Overall summary
  console.error("\n" + "=".repeat(60));
  console.error("📈 SUMMARY");
  console.error("=".repeat(60));
  console.error(`  Total tools tested: ${individual.length}`);
  console.error(`  Passed (< ${MAX_RESPONSE_TIME_MS}ms): ${passed.length}`);
  console.error(`  Failed/Slow: ${failed.length}`);
  console.error(`  Concurrent tests: ${concurrent.length}`);

  const allPassed = passed.length === individual.length;
  const allConcurrentPassed = concurrent.every((r) => r.successCount === r.totalRequests);

  console.error(
    `\n  Overall: ${allPassed && allConcurrentPassed ? "✅ ALL TESTS PASSED" : "⚠️ SOME TESTS NEED ATTENTION"}`,
  );
  console.error("=".repeat(60) + "\n");

  // Output JSON results for programmatic consumption
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    config: {
      maxResponseTimeMs: MAX_RESPONSE_TIME_MS,
      concurrentRequests: CONCURRENT_REQUESTS,
    },
    individual: individual.map((r) => ({
      tool: r.tool,
      success: r.success,
      responseTimeMs: r.responseTimeMs,
      passedThreshold: r.passedThreshold,
      error: r.error,
    })),
    concurrent: concurrent.map((r) => ({
      tool: r.tool,
      totalRequests: r.totalRequests,
      successCount: r.successCount,
      failedCount: r.failedCount,
      avgResponseTimeMs: r.avgResponseTimeMs,
      maxResponseTimeMs: r.maxResponseTimeMs,
      minResponseTimeMs: r.minResponseTimeMs,
    })),
    summary: {
      totalTools: individual.length,
      passed: passed.length,
      failed: failed.length,
      allPassed: allPassed && allConcurrentPassed,
    },
  };

  // Output JSON to stdout
  console.log(JSON.stringify(jsonOutput, null, 2));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.error("🚀 VESPR MCP Server Stress Test");
  console.error(`   Threshold: ${MAX_RESPONSE_TIME_MS}ms`);
  console.error(`   Concurrent: ${CONCURRENT_REQUESTS} requests`);

  // Check for API key
  if (!process.env.VESPR_API_KEY) {
    console.error("\n❌ Error: VESPR_API_KEY environment variable is required");
    console.error("   Set it with: export VESPR_API_KEY=your-api-key\n");
    process.exit(1);
  }

  try {
    const individualResults = await runIndividualTests();
    const concurrencyResults = await runConcurrencyTests();

    formatResults(individualResults, concurrencyResults);

    // Exit with error code if any tests failed
    const anyFailed = individualResults.some((r) => !r.success);
    const anySlow = individualResults.some((r) => !r.passedThreshold);

    if (anyFailed) {
      process.exit(1);
    } else if (anySlow) {
      process.exit(2); // Warning exit code for slow but successful
    }
  } catch (error) {
    console.error("\n❌ Stress test failed with error:", error);
    process.exit(1);
  }
}

main();
