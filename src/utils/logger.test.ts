import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { logger, LogLevel } from "./logger.js";

describe("logger", () => {
  let errorSpy: jest.SpiedFunction<typeof console.error>;
  const originalLevel = process.env.CARDANO_MCP_LOG_LEVEL;

  beforeEach(() => {
    delete process.env.CARDANO_MCP_LOG_LEVEL;
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalLevel === undefined) {
      delete process.env.CARDANO_MCP_LOG_LEVEL;
    } else {
      process.env.CARDANO_MCP_LOG_LEVEL = originalLevel;
    }
  });

  function loggedEntries(): unknown[] {
    return errorSpy.mock.calls.map(([line]): unknown => JSON.parse(String(line)));
  }

  it.each<LogLevel>(["debug", "info", "warn", "error"])("writes %s entries as one JSON line to stderr", (level) => {
    logger[level]("something_happened", { tool: "get_pool_info", count: 2 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedEntries()).toEqual([
      {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        level,
        event: "something_happened",
        tool: "get_pool_info",
        count: 2,
      },
    ]);
  });

  it("logs just the event when no data is given", () => {
    logger.info("bare_event");

    expect(loggedEntries()).toEqual([{ timestamp: expect.any(String), level: "info", event: "bare_event" }]);
  });

  it("writes nothing when CARDANO_MCP_LOG_LEVEL is silent", () => {
    process.env.CARDANO_MCP_LOG_LEVEL = "silent";

    logger.error("hidden_event", { reason: "test" });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
