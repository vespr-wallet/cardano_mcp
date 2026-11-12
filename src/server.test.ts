import { describe, it, expect, beforeEach, afterEach, afterAll } from "@jest/globals";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServer, startServer, stopServer } from "./server.js";
import { config } from "./config.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const originalConfig = { ...config, allowedOrigins: [...config.allowedOrigins] };

const healthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  uptimeMs: z.number().nonnegative(),
});

describe("server", () => {
  let server: FastifyInstance;

  async function start(overrides: Partial<typeof config> = {}): Promise<void> {
    Object.assign(config, originalConfig, { httpPort: 0, httpHost: "127.0.0.1" }, overrides);
    server = await startServer();
  }

  afterEach(async () => {
    if (server.server.listening) {
      await stopServer(server);
    }
  });

  afterAll(() => {
    Object.assign(config, originalConfig);
  });

  describe("createServer", () => {
    it("returns an unconfigured Fastify instance without routes", async () => {
      server = createServer();

      const response = await server.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(404);
      await server.close();
    });
  });

  describe("startServer / stopServer", () => {
    it("listens on the configured host and stops cleanly", async () => {
      await start();

      expect(server.server.listening).toBe(true);
      const address = server.server.address();
      expect(address).toEqual(expect.objectContaining({ address: "127.0.0.1" }));

      await stopServer(server);
      expect(server.server.listening).toBe(false);
    });

    it("reports health with start time and uptime", async () => {
      await start();

      const response = await server.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      const body = healthSchema.parse(response.json());
      expect(Date.parse(body.startedAt)).toBeLessThanOrEqual(Date.parse(body.timestamp));
      expect(body.uptimeMs).toBe(Date.parse(body.timestamp) - Date.parse(body.startedAt));
    });

    it("registers the REST tool routes and the MCP endpoint", async () => {
      await start();

      const tools = await server.inject({ method: "GET", url: "/tools" });
      const mcpWithoutSession = await server.inject({ method: "GET", url: "/" });

      expect(tools.statusCode).toBe(200);
      expect(tools.json()).toEqual(expect.objectContaining({ count: 11 }));
      expect(mcpWithoutSession.statusCode).toBe(404);
      expect(mcpWithoutSession.json()).toEqual({ error: "Invalid or expired session ID" });
    });
  });

  describe("rate limiting", () => {
    const LIMIT = 2;

    beforeEach(async () => {
      await start({ rateLimitPerMinute: LIMIT, rateLimitPerDay: 100 });
    });

    function getTools(headers: Record<string, string> = {}, remoteAddress?: string) {
      return server.inject({ method: "GET", url: "/tools", headers, remoteAddress });
    }

    async function exhaust(headers: Record<string, string>, remoteAddress?: string): Promise<void> {
      for (let i = 0; i < LIMIT; i++) {
        const response = await getTools(headers, remoteAddress);
        expect(response.statusCode).toBe(200);
      }
    }

    it("returns 429 with a retry hint once the per-minute limit is exceeded", async () => {
      await exhaust({ "x-real-ip": "1.1.1.1" });

      const response = await getTools({ "x-real-ip": "1.1.1.1" });

      expect(response.statusCode).toBe(429);
      const body = z.object({ statusCode: z.number(), error: z.string(), message: z.string() }).parse(response.json());
      expect(body.statusCode).toBe(429);
      expect(body.error).toBe("Too Many Requests");
      expect(body.message).toMatch(/^Rate limit exceeded\. Retry in .+\.$/);
    });

    it("never rate limits the health check", async () => {
      for (let i = 0; i < LIMIT * 3; i++) {
        const response = await server.inject({ method: "GET", url: "/health", headers: { "x-real-ip": "1.1.1.1" } });
        expect(response.statusCode).toBe(200);
      }
    });

    it.each(["x-real-ip", "x-client-ip", "cf-connecting-ip", "do-connecting-ip"])(
      "keys clients by the %s header",
      async (header) => {
        await exhaust({ [header]: "3.3.3.3" });

        expect((await getTools({ [header]: "3.3.3.3" })).statusCode).toBe(429);
        expect((await getTools({ [header]: "4.4.4.4" })).statusCode).toBe(200);
      },
    );

    it("keys clients by the first X-Forwarded-For hop", async () => {
      await exhaust({ "x-forwarded-for": " 5.5.5.5 , 10.0.0.1" });

      expect((await getTools({ "x-forwarded-for": "5.5.5.5, 10.0.0.2" })).statusCode).toBe(429);
      expect((await getTools({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" })).statusCode).toBe(200);
    });

    it("prefers X-Real-IP over the other client IP headers", async () => {
      await exhaust({ "x-real-ip": "7.7.7.7", "x-client-ip": "8.8.8.8" });

      expect((await getTools({ "x-real-ip": "7.7.7.7", "x-client-ip": "9.9.9.9" })).statusCode).toBe(429);
      expect((await getTools({ "x-client-ip": "8.8.8.8" })).statusCode).toBe(200);
    });

    it("falls back to the socket address when no client IP header is present", async () => {
      await exhaust({}, "10.1.1.1");

      expect((await getTools({}, "10.1.1.1")).statusCode).toBe(429);
      expect((await getTools({}, "10.2.2.2")).statusCode).toBe(200);
    });
  });

  describe("CORS", () => {
    it("denies cross-origin access when no origins are configured", async () => {
      await start({ allowedOrigins: [] });

      const response = await server.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://app.example" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    describe("with configured origins", () => {
      beforeEach(async () => {
        await start({ allowedOrigins: ["https://app.example"] });
      });

      it("allows a configured origin and exposes the MCP session header", async () => {
        const response = await server.inject({
          method: "GET",
          url: "/health",
          headers: { origin: "https://app.example" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe("https://app.example");
        expect(response.headers["access-control-expose-headers"]).toBe("mcp-session-id");
      });

      it("answers preflight requests with the allowed methods and headers", async () => {
        const response = await server.inject({
          method: "OPTIONS",
          url: "/",
          headers: {
            origin: "https://app.example",
            "access-control-request-method": "DELETE",
          },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers["access-control-allow-methods"]).toBe("GET, POST, DELETE, OPTIONS");
        expect(response.headers["access-control-allow-headers"]).toBe(
          "Content-Type, Authorization, x-api-key, mcp-session-id",
        );
      });

      it("sends the CORS headers on MCP endpoint responses so browsers can read them", async () => {
        const address = server.server.address();
        if (address === null || typeof address === "string") {
          throw new Error("Expected a TCP address");
        }

        const response = await fetch(`http://127.0.0.1:${address.port}/`, {
          method: "POST",
          headers: {
            origin: "https://app.example",
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "browser", version: "0.0.0" },
            },
          }),
        });
        await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("mcp-session-id")).toEqual(expect.any(String));
        expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example");
        expect(response.headers.get("access-control-expose-headers")).toBe("mcp-session-id");
      });

      it("allows requests that carry no Origin header", async () => {
        const response = await server.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
      });

      it("rejects an origin that is not configured", async () => {
        const response = await server.inject({
          method: "GET",
          url: "/health",
          headers: { origin: "https://evil.example" },
        });

        expect(response.statusCode).toBe(500);
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
        expect(response.json()).toEqual(expect.objectContaining({ message: "Not allowed by CORS" }));
      });
    });
  });
});
