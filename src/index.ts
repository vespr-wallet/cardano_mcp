#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { config } from "./config.js";
import { startServer } from "./server.js";
import { logger } from "./utils/logger.js";

const VERSION = "0.1.0";

/**
 * Create and configure the MCP server instance
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "@vespr/cardano-mcp",
    version: VERSION,
  });

  // Register all tools
  registerTools(server);

  return server;
}

/**
 * Start STDIO transport for Claude Desktop integration
 */
async function startStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server_started", { transport: "stdio", version: VERSION });
}

let httpServer: import("fastify").FastifyInstance | undefined;

/**
 * Start HTTP transport for web clients
 */
async function startHttpTransport(): Promise<void> {
  httpServer = await startServer();
}

/**
 * Main entry point - starts server in configured mode
 */
async function main(): Promise<void> {
  const { serverMode } = config;

  logger.info("server_initializing", { mode: serverMode, version: VERSION });

  if (serverMode === "stdio" || serverMode === "both") {
    const mcpServer = createMcpServer();
    await startStdioTransport(mcpServer);
  }

  if (serverMode === "http" || serverMode === "both") {
    await startHttpTransport();
  }
}

function shutdown(signal: string): void {
  logger.info("server_shutdown", { signal });
  if (httpServer) {
    httpServer.close().finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start the server
main().catch((error) => {
  logger.error("server_startup_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
