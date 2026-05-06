import { randomUUID } from "crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "../tools/index.js";
import { apiKeyContext } from "../utils/apiKeyContext.js";
import { logger } from "../utils/logger.js";

const VERSION = "0.1.0";
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
  if (sessionId && sessions.has(sessionId)) {
    return { session: sessions.get(sessionId)!, isNew: false };
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

      reply.hijack();

      await apiKeyContext.run(session.apiKey, async () => {
        await session.transport.handleRequest(request.raw, reply.raw, request.body);
      });
    } catch (error) {
      logger.error("mcp_post_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      if (!reply.sent) {
        return reply.status(500).send({
          error: "Internal server error",
        });
      }
    }
  });

  server.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers["mcp-session-id"] as string) || undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      return reply.status(404).send({
        error: "Invalid or expired session ID",
      });
    }

    const session = sessions.get(sessionId)!;
    session.lastActiveAt = Date.now();

    try {
      reply.hijack();

      await apiKeyContext.run(session.apiKey, async () => {
        await session.transport.handleRequest(request.raw, reply.raw);
      });
    } catch (error) {
      logger.error("mcp_get_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      if (!reply.sent) {
        return reply.status(500).send({
          error: "Internal server error",
        });
      }
    }
  });

  server.delete("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (request.headers["mcp-session-id"] as string) || undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      return reply.status(404).send({
        error: "Invalid or expired session ID",
      });
    }

    const session = sessions.get(sessionId)!;

    try {
      reply.hijack();

      await session.transport.handleRequest(request.raw, reply.raw);

      sessions.delete(sessionId);
      logger.info("mcp_session_deleted", { sessionId });
    } catch (error) {
      logger.error("mcp_delete_error", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      if (!reply.sent) {
        return reply.status(500).send({
          error: "Internal server error",
        });
      }
    }
  });

  logger.info("streamable_http_routes_registered", {
    routes: ["POST /", "GET /", "DELETE /"],
  });
}
