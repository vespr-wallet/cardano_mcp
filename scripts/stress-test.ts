#!/usr/bin/env npx tsx
/**
 * Stress test script for VESPR MCP Server tools.
 *
 * Tests 4 endpoints for:
 *   - Baseline response time (sequential, < 500ms threshold)
 *   - Concurrent query handling (20 parallel requests per scenario)
 *   - High-load resilience (50 parallel requests)
 *   - Error resilience under load
 *
 * Human-readable output → stderr  (for screenshots / logs)
 * Machine-readable JSON → stdout  (for CI / reporting)
 *
 * Usage:
 *   VESPR_API_KEY=<key> npx tsx scripts/stress-test.ts
 *   VESPR_API_KEY=<key> npm run stress-test
 */

import VesprApiRepository from "../src/repository/VesprApiRepository.js";
import {
  FiatCurrency,
  CryptoCurrency,
  SUPPORTED_FIAT_CURRENCIES,
  SUPPORTED_CRYPTO_CURRENCIES,
} from "../src/types/currency.js";

// ─── Configuration ────────────────────────────────────────────────────────────

const TEST_CONFIG = {
  // SNEK token (popular, well-supported)
  tokenUnit: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  // VESPR token
  vesprUnit: "8be5f3a0db5cda689f1ed0f78f5b9f76889dc82a6e66e6eda06bcfb1564553505242",
  // Test wallet address
  walletAddress:
    "addr1qyhdaj73wy4my8f8vhqujegew2kgndp8jhh6ymrlje43agy9k9643uyqgz44qyg7jpm2jflg02f7uy6jp3ex7gfal7zq3kqtyn",
};

const MAX_RESPONSE_TIME_MS = 500;
const CONCURRENT_REQUESTS = 20;
const HIGH_LOAD_REQUESTS = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestResult {
  tool: string;
  success: boolean;
  responseTimeMs: number;
  error?: string;
  passedThreshold: boolean;
}

interface ConcurrencyResult {
  scenario: string;
  totalRequests: number;
  successCount: number;
  failedCount: number;
  wallTimeMs: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runTest<T>(name: string, fn: () => Promise<T>): Promise<TestResult> {
  const start = performance.now();
  try {
    await fn();
    const responseTimeMs = Math.round(performance.now() - start);
    return { tool: name, success: true, responseTimeMs, passedThreshold: responseTimeMs < MAX_RESPONSE_TIME_MS };
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

async function runConcurrencyTest(scenario: string, tasks: Array<() => Promise<unknown>>): Promise<ConcurrencyResult> {
  const wallStart = performance.now();
  const times: number[] = [];
  let successCount = 0;
  let failedCount = 0;

  await Promise.all(
    tasks.map(async (task) => {
      const start = performance.now();
      try {
        await task();
        times.push(Math.round(performance.now() - start));
        successCount++;
      } catch {
        times.push(Math.round(performance.now() - start));
        failedCount++;
      }
    }),
  );

  const wallTimeMs = Math.round(performance.now() - wallStart);
  const sorted = [...times].sort((a, b) => a - b);

  return {
    scenario,
    totalRequests: tasks.length,
    successCount,
    failedCount,
    wallTimeMs,
    avgResponseTimeMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    minResponseTimeMs: sorted[0] ?? 0,
    maxResponseTimeMs: sorted[sorted.length - 1] ?? 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    throughputRps: Math.round((tasks.length / Math.max(1, wallTimeMs)) * 1000),
  };
}

// ─── Individual tests (sequential baseline) ───────────────────────────────────

async function runIndividualTests(): Promise<TestResult[]> {
  console.error("\n🔧 Individual tool tests (sequential baseline)\n");

  const tests: Array<[string, () => Promise<unknown>]> = [
    [
      "get_supported_currencies",
      async () => {
        if (SUPPORTED_FIAT_CURRENCIES.length === 0 || SUPPORTED_CRYPTO_CURRENCIES.length === 0) {
          throw new Error("No currencies found");
        }
      },
    ],
    ["get_token_info", () => VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD)],
    ["get_token_chart", () => VesprApiRepository.getTokenChart(TEST_CONFIG.tokenUnit, "24H", CryptoCurrency.ADA)],
    ["get_ada_spot_price", () => VesprApiRepository.getAdaSpotPrice(FiatCurrency.USD)],
    ["get_wallet_balance", () => VesprApiRepository.getDetailedWallet(TEST_CONFIG.walletAddress)],
  ];

  const results: TestResult[] = [];
  for (const [name, fn] of tests) {
    const r = await runTest(name, fn);
    results.push(r);
    const icon = r.success ? (r.passedThreshold ? "✓" : "⚠") : "✗";
    const errSuffix = r.error ? `  [${r.error.slice(0, 80)}]` : "";
    console.error(`  ${icon} ${r.tool.padEnd(32)} ${r.responseTimeMs.toString().padStart(5)}ms${errSuffix}`);
  }

  return results;
}

// ─── Concurrency tests ────────────────────────────────────────────────────────

async function runConcurrencyTests(): Promise<ConcurrencyResult[]> {
  console.error(`\n🔀 Concurrency tests\n`);
  const results: ConcurrencyResult[] = [];

  // Scenario A: 20 parallel — same endpoint (spot price, LRU-cacheable)
  results.push(
    await runConcurrencyTest(
      `ada_spot_price × ${CONCURRENT_REQUESTS} parallel (same key)`,
      Array.from({ length: CONCURRENT_REQUESTS }, () => () => VesprApiRepository.getAdaSpotPrice(FiatCurrency.USD)),
    ),
  );

  // Scenario B: 20 parallel — token info (same token, LRU-cacheable)
  results.push(
    await runConcurrencyTest(
      `get_token_info × ${CONCURRENT_REQUESTS} parallel (same key)`,
      Array.from(
        { length: CONCURRENT_REQUESTS },
        () => () => VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD),
      ),
    ),
  );

  // Scenario C: 20 parallel — trending tokens (LRU-cacheable)
  results.push(
    await runConcurrencyTest(
      `get_trending_tokens × ${CONCURRENT_REQUESTS} parallel (same key)`,
      Array.from(
        { length: CONCURRENT_REQUESTS },
        () => () => VesprApiRepository.getTrendingTokens(FiatCurrency.USD, "1H"),
      ),
    ),
  );

  // Scenario D: 20 parallel — all tools mixed (warm LRU cache, keys pre-loaded by prior scenarios)
  results.push(
    await runConcurrencyTest(`all tools mixed × ${CONCURRENT_REQUESTS} parallel (warm cache)`, [
      ...Array.from({ length: 5 }, () => () => VesprApiRepository.getAdaSpotPrice(FiatCurrency.USD)),
      ...Array.from(
        { length: 5 },
        () => () => VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD),
      ),
      ...Array.from(
        { length: 5 },
        () => () => VesprApiRepository.getTokenChart(TEST_CONFIG.tokenUnit, "24H", CryptoCurrency.ADA),
      ),
      ...Array.from({ length: 5 }, () => () => VesprApiRepository.getTrendingTokens(FiatCurrency.USD, "1H")),
    ]),
  );

  // Scenario E: 50 parallel high-load wave
  const highLoadPool: Array<() => Promise<unknown>> = [
    () => VesprApiRepository.getAdaSpotPrice(FiatCurrency.USD),
    () => VesprApiRepository.getTokenInfo(TEST_CONFIG.tokenUnit, FiatCurrency.USD),
    () => VesprApiRepository.getTrendingTokens(FiatCurrency.USD, "1H"),
    () => VesprApiRepository.getTokenChart(TEST_CONFIG.tokenUnit, "24H", CryptoCurrency.ADA),
    () => VesprApiRepository.getAdaSpotPrice(FiatCurrency.EUR),
  ];
  results.push(
    await runConcurrencyTest(
      `high-load wave × ${HIGH_LOAD_REQUESTS} parallel (mixed)`,
      Array.from({ length: HIGH_LOAD_REQUESTS }, (_, i) => highLoadPool[i % highLoadPool.length]),
    ),
  );

  for (const r of results) {
    printConcurrencyRow(r);
  }

  return results;
}

function printConcurrencyRow(r: ConcurrencyResult): void {
  const passRate = ((r.successCount / r.totalRequests) * 100).toFixed(0);
  const icon = r.failedCount === 0 ? "✓" : "⚠";
  console.error(`  ${icon} ${r.scenario}`);
  console.error(
    `    ${r.successCount}/${r.totalRequests} succeeded (${passRate}%)  |  wall: ${r.wallTimeMs}ms  |  throughput: ${r.throughputRps} req/s`,
  );
  console.error(
    `    latency — p50: ${r.p50Ms}ms  p95: ${r.p95Ms}ms  p99: ${r.p99Ms}ms  max: ${r.maxResponseTimeMs}ms\n`,
  );
}

// ─── Final report ─────────────────────────────────────────────────────────────

function printReport(individual: TestResult[], concurrent: ConcurrencyResult[]): void {
  const sep = "=".repeat(62);
  const dash = "-".repeat(62);

  console.error(`\n${sep}`);
  console.error("📊  STRESS TEST RESULTS");
  console.error(sep);

  console.error("\n📋  Individual Tool Tests (sequential):");
  console.error(dash);
  for (const r of individual) {
    const status = r.success ? (r.passedThreshold ? "✅ PASS" : "⚠️ SLOW") : "❌ FAIL";
    const errSuffix = r.error ? `  (${r.error.slice(0, 60)})` : "";
    console.error(`  ${status}  ${r.tool.padEnd(30)}  ${r.responseTimeMs.toString().padStart(5)}ms${errSuffix}`);
  }

  console.error("\n📋  Concurrency Tests:");
  console.error(dash);
  for (const r of concurrent) {
    const passRate = ((r.successCount / r.totalRequests) * 100).toFixed(0);
    const status = r.failedCount === 0 ? "✅" : "⚠️";
    console.error(`  ${status}  ${r.scenario}`);
    console.error(`      Requests : ${r.successCount}/${r.totalRequests} (${passRate}%)`);
    console.error(`      Wall time: ${r.wallTimeMs}ms  |  Throughput: ${r.throughputRps} req/s`);
    console.error(
      `      Latency  : p50=${r.p50Ms}ms  p95=${r.p95Ms}ms  p99=${r.p99Ms}ms  max=${r.maxResponseTimeMs}ms`,
    );
  }

  const passed = individual.filter((r) => r.success && r.passedThreshold);
  const failed = individual.filter((r) => !r.success || !r.passedThreshold);
  const allConcurrentPassed = concurrent.every((r) => r.successCount === r.totalRequests);

  console.error(`\n${sep}`);
  console.error("📈  SUMMARY");
  console.error(sep);
  console.error(`  Tools tested            : ${individual.length}`);
  console.error(`  Passed (< ${MAX_RESPONSE_TIME_MS}ms)       : ${passed.length}`);
  console.error(`  Failed / Slow           : ${failed.length}`);
  console.error(`  Concurrency scenarios   : ${concurrent.length}`);
  console.error(`  Max concurrency tested  : ${HIGH_LOAD_REQUESTS} parallel requests`);
  console.error(
    `\n  Overall: ${passed.length === individual.length && allConcurrentPassed ? "✅ ALL TESTS PASSED" : "⚠️  SOME TESTS NEED ATTENTION"}`,
  );
  console.error(`${sep}\n`);

  // JSON summary → stdout (for CI / reporting tools)
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: {
          maxResponseTimeMs: MAX_RESPONSE_TIME_MS,
          concurrentRequests: CONCURRENT_REQUESTS,
          highLoadRequests: HIGH_LOAD_REQUESTS,
        },
        individual: individual.map((r) => ({
          tool: r.tool,
          success: r.success,
          responseTimeMs: r.responseTimeMs,
          passedThreshold: r.passedThreshold,
          ...(r.error ? { error: r.error } : {}),
        })),
        concurrent: concurrent.map((r) => ({ ...r })),
        summary: {
          totalTools: individual.length,
          passed: passed.length,
          failed: failed.length,
          allPassed: passed.length === individual.length && allConcurrentPassed,
        },
      },
      null,
      2,
    ),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.error("╔══════════════════════════════════════════════════════════╗");
  console.error("║        VESPR Cardano MCP — Concurrent Stress Test        ║");
  console.error("╚══════════════════════════════════════════════════════════╝");
  console.error(`  Threshold  : ${MAX_RESPONSE_TIME_MS}ms per request`);
  console.error(`  Concurrent : ${CONCURRENT_REQUESTS} parallel requests`);
  console.error(`  High-load  : ${HIGH_LOAD_REQUESTS} parallel requests`);
  console.error(`  Node.js    : ${process.version}`);
  console.error(`  Started    : ${new Date().toISOString()}`);

  if (!process.env.VESPR_API_KEY) {
    console.error("\n❌  VESPR_API_KEY environment variable is required.");
    console.error("    Set it with: export VESPR_API_KEY=your-api-key\n");
    process.exit(1);
  }

  const individualResults = await runIndividualTests();
  const concurrencyResults = await runConcurrencyTests();
  printReport(individualResults, concurrencyResults);

  const anyFailed = individualResults.some((r) => !r.success);
  const anySlow = individualResults.some((r) => !r.passedThreshold);
  process.exit(anyFailed ? 1 : anySlow ? 2 : 0);
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err);
  process.exit(1);
});
