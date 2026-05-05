import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { registerHttpRoutes } from "./transports/http.js";
import { registerStreamableHttpRoutes } from "./transports/streamableHttp.js";
import { registerHttpTools } from "./tools/index.js";
import { createRateLimitHook } from "./middleware/rateLimit.js";

/**
 * Create and configure Fastify HTTP server
 * Outputs logs to stderr to avoid interfering with MCP protocol on stdout
 */
export function createServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: "info",
      // Output to stderr (stdout reserved for MCP protocol)
      stream: process.stderr,
    },
    disableRequestLogging: true, // We'll use our own structured logging
  });

  return server;
}

/**
 * Register plugins and configure the server
 */
async function configureServer(server: FastifyInstance): Promise<void> {
  // CORS support for cross-origin requests
  await server.register(cors, {
    origin: true, // Allow all origins in development, configure for production
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Sensible defaults (error handling, 404 handling, etc.)
  await server.register(sensible);

  // Health check endpoint
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Root endpoint
  server.get("/", async () => {
    return {
      name: "@vespr/cardano-mcp",
      version: "0.1.0",
      transport: "http",
      endpoints: {
        health: "/health",
        tools: "/mcp/tools",
        execute: "/mcp/tools/:toolName",
        mcp: "/mcp",
      },
    };
  });

  // Register HTTP tools with the registry
  registerHttpTools();

  const rateLimitHook = createRateLimitHook({
    maxRequestsPerMinute: config.rateLimitPerMinute,
    maxRequestsPerDay: config.rateLimitPerDay,
  });
  server.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/mcp/")) {
      await rateLimitHook(request, reply);
    }
  });

  await registerHttpRoutes(server);
  await registerStreamableHttpRoutes(server);
}

/**
 * Start the HTTP server
 */
export async function startServer(): Promise<FastifyInstance> {
  const server = createServer();
  await configureServer(server);

  const port = config.httpPort;
  const host = config.httpHost;

  await server.listen({ port, host });

  logger.info("http_server_started", {
    port,
    host,
    version: "0.1.0",
  });

  return server;
}

/**
 * Gracefully shutdown the server
 */
export async function stopServer(server: FastifyInstance): Promise<void> {
  await server.close();
  logger.info("http_server_stopped", {});
}
