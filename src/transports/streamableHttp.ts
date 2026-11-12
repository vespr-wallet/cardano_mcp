import { randomUUID } from "crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "../tools/index.js";
import { apiKeyContext } from "../utils/apiKeyContext.js";
import { logger } from "../utils/logger.js";
import { VERSION } from "../version.js";

const SESSION_CLEANUP_INTERVAL_MS = 60_000;

interface Session {
  transport: StreamableHTTPServerTransport;
  apiKey?: string;
  lastActiveAt: number;
}

const sessions = new Map<string, Session>();

function getOrCreateSession(
  sessionId: string | undefined,
  apiKey: string | undefined,
): { session: Session; isNew: boolean } {
  const existing = sessionId ? sessions.get(sessionId) : undefined;
  if (existing) {
    return { session: existing, isNew: false };
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid: string) => {
      sessions.set(sid, { transport, apiKey, lastActiveAt: Date.now() });
      logger.info("mcp_session_created", { sessionId: sid });
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
      logger.info("mcp_session_closed", { sessionId: sid });
    }
  };

  const mcpServer = new McpServer({
    name: "@vespr/cardano-mcp",
    version: VERSION,
  });

  registerTools(mcpServer);

  mcpServer.connect(transport).catch((error) => {
    logger.error("mcp_server_connect_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const session: Session = { transport, apiKey, lastActiveAt: Date.now() };

  return { session, isNew: true };
}

/**
 * Take over the raw response for the MCP transport.
 *
 * Headers set by Fastify hooks (such as the CORS headers) live on the Fastify reply and are only
 * flushed by reply.send(), which hijacked replies never call, so copy them onto the raw response
 * before the transport writes to it.
 */
function hijackReply(reply: FastifyReply): void {
  if (!reply.raw.headersSent) {
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) {
        reply.raw.setHeader(name, value);
      }
    }
  }
  reply.hijack();
}

/**
 * Answer a failed MCP request with a 500.
 *
 * The routes hijack the reply before handing the raw response to the MCP transport, after which
 * Fastify's reply.send() is a no-op (reply.sent is true), so the error is written to the raw
 * response directly. hijack() is idempotent and also covers errors raised before the hand-off.
 * If the transport already started the response, it can only be terminated.
 */
function sendInternalServerError(reply: FastifyReply): void {
  hijackReply(reply);
  const res = reply.raw;
  if (!res.headersSent) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  } else if (!res.writableEnded) {
    res.end();
  }
}

export async function registerStreamableHttpRoutes(server: FastifyInstance, sessionTtlMs: number): Promise<void> {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of sessions.entries()) {
      if (now - session.lastActiveAt > sessionTtlMs) {
        session.transport.close().catch(() => {});
        sessions.delete(sid);
        logger.info("mcp_session_expired", { sessionId: sid });
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  server.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
  });

  server.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers["mcp-session-id"] as string) || undefined;
    const apiKey = (request.headers["x-api-key"] as string) || undefined;

    try {
      if (sessionId && !sessions.has(sessionId)) {
        return reply.status(404).send({
          error: "Invalid or expired session ID",
        });
      }

      const { session } = getOrCreateSession(sessionId, apiKey);
      session.lastActiveAt = Date.now();

      hijackReply(reply);

      await apiKeyContext.run(session.apiKey, async () => {
        await session.transport.handleRequest(request.raw, reply.raw, request.body);
      });
    } catch (error) {
      logger.error("mcp_post_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      sendInternalServerError(reply);
    }
  });

  server.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers["mcp-session-id"] as string) || undefined;

    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!sessionId || !session) {
      return reply.status(404).send({
        error: "Invalid or expired session ID",
      });
    }
    session.lastActiveAt = Date.now();

    try {
      hijackReply(reply);

      await apiKeyContext.run(session.apiKey, async () => {
        await session.transport.handleRequest(request.raw, reply.raw);
      });
    } catch (error) {
      logger.error("mcp_get_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      sendInternalServerError(reply);
    }
  });

  server.delete("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers["mcp-session-id"] as string) || undefined;

    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!sessionId || !session) {
      return reply.status(404).send({
        error: "Invalid or expired session ID",
      });
    }

    try {
      hijackReply(reply);

      await session.transport.handleRequest(request.raw, reply.raw);

      sessions.delete(sessionId);
      logger.info("mcp_session_deleted", { sessionId });
    } catch (error) {
      logger.error("mcp_delete_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      sendInternalServerError(reply);
    }
  });

  logger.info("streamable_http_routes_registered", {
    routes: ["POST /", "GET /", "DELETE /"],
  });
}
