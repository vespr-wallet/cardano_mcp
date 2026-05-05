import Fastify, { FastifyInstance, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fastifyRateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { registerHttpRoutes } from "./transports/http.js";
import { registerStreamableHttpRoutes } from "./transports/streamableHttp.js";
import { registerHttpTools } from "./tools/index.js";
import { createDualWindowStore } from "./middleware/rateLimit.js";

let serverStartTime: number | null = null;

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
  // CORS support — restrict to configured origins; deny all cross-origin if none are set
  const allowedOrigins = config.allowedOrigins;
  await server.register(cors, {
    origin:
      allowedOrigins.length > 0
        ? (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
            if (!origin || allowedOrigins.includes(origin)) {
              cb(null, true);
            } else {
              cb(new Error("Not allowed by CORS"), false);
            }
          }
        : false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "mcp-session-id"],
    exposedHeaders: ["mcp-session-id"],
  });

  // Sensible defaults (error handling, 404 handling, etc.)
  await server.register(sensible);

  // Health check endpoint
  server.get("/health", async () => {
    const now = Date.now();
    return {
      status: "ok",
      timestamp: new Date(now).toISOString(),
      startedAt: serverStartTime ? new Date(serverStartTime).toISOString() : null,
      uptimeMs: serverStartTime ? now - serverStartTime : null,
    };
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

  const rateLimitKeyGenerator = (request: FastifyRequest): string =>
    (request.headers["x-real-ip"] as string | undefined) ||
    (request.headers["x-client-ip"] as string | undefined) ||
    (request.headers["cf-connecting-ip"] as string | undefined) ||
    (request.headers["do-connecting-ip"] as string | undefined) ||
    (typeof request.headers["x-forwarded-for"] === "string"
      ? request.headers["x-forwarded-for"].split(",")[0].trim()
      : "") ||
    request.ip;

  await server.register(fastifyRateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: "1 minute",
    hook: "preValidation",
    store: createDualWindowStore(config.rateLimitPerMinute, config.rateLimitPerDay),
    allowList: (request) => !request.url.startsWith("/mcp"),
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry in ${context.after}.`,
    }),
  });

  await registerHttpRoutes(server);
  await registerStreamableHttpRoutes(server, config.sessionTtlMs);
}

/**
 * Start the HTTP server
 */
export async function startServer(): Promise<FastifyInstance> {
  serverStartTime = Date.now();
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
