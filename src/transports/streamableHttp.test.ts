import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Fastify, { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerStreamableHttpRoutes } from "./streamableHttp.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import { getCurrentApiKey } from "../utils/apiKeyContext.js";

const SESSION_CLEANUP_INTERVAL_MS = 60_000;

interface ConnectedClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
  sessionId: string;
}

describe("registerStreamableHttpRoutes", () => {
  let server: FastifyInstance;
  let baseUrl: string;
  const clients: Client[] = [];

  async function startServer(sessionTtlMs: number): Promise<void> {
    server = Fastify({ forceCloseConnections: true });
    registerStreamableHttpRoutes(server, sessionTtlMs);
    baseUrl = await server.listen({ port: 0, host: "127.0.0.1" });
  }

  async function connectClient(apiKey?: string): Promise<ConnectedClient> {
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: apiKey ? { headers: { "x-api-key": apiKey } } : undefined,
    });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(transport);
    clients.push(client);
    const sessionId = transport.sessionId;
    if (!sessionId) {
      throw new Error("Server did not assign a session id");
    }
    return { client, transport, sessionId };
  }

  function rawRequest(method: "GET" | "POST" | "DELETE", headers: Record<string, string>, body?: unknown) {
    return fetch(baseUrl, {
      method,
      headers: {
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const listToolsRequest = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("session lifecycle", () => {
    beforeEach(async () => {
      await startServer(3_600_000);
    });

    it("creates a session on initialize and serves tools on it", async () => {
      const { client, sessionId } = await connectClient();

      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(11);
      expect(tools.map((t) => t.name)).toContain("get_wallet_balance");
    });

    it("gives each client its own session", async () => {
      const first = await connectClient();
      const second = await connectClient();

      expect(first.sessionId).not.toBe(second.sessionId);
    });

    it("rejects a non-initialize request that carries no session id", async () => {
      const response = await rawRequest("POST", {}, listToolsRequest);

      expect(response.status).toBe(400);
      expect(await response.text()).toMatch(/not initialized/i);
    });

    it.each(["POST", "GET", "DELETE"] as const)("%s with an unknown session id returns 404", async (method) => {
      const response = await rawRequest(
        method,
        { "mcp-session-id": "00000000-0000-0000-0000-000000000000" },
        method === "POST" ? listToolsRequest : undefined,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Invalid or expired session ID" });
    });

    it.each(["GET", "DELETE"] as const)("%s without a session id returns 404", async (method) => {
      const response = await rawRequest(method, {});

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Invalid or expired session ID" });
    });

    it("opens an SSE stream on GET for a live session", async () => {
      const { sessionId, client } = await connectClient();
      // The SDK client already holds the session's standalone SSE stream; release it first
      // because the server allows only one per session.
      await client.close();

      const controller = new AbortController();
      const response = await fetch(baseUrl, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "mcp-session-id": sessionId,
          "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
        },
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      controller.abort();
    });

    it("DELETE terminates the session so later requests with its id get 404", async () => {
      const { transport, sessionId } = await connectClient();

      await transport.terminateSession();

      const response = await rawRequest("POST", { "mcp-session-id": sessionId }, listToolsRequest);
      expect(response.status).toBe(404);
    });
  });

  describe("API key propagation", () => {
    beforeEach(async () => {
      await startServer(3_600_000);
    });

    it("runs tool calls with the API key the session was created with", async () => {
      const seenKeys: Array<string | undefined> = [];
      jest.spyOn(VesprApiRepository, "resolveAdaHandle").mockImplementation(() => {
        seenKeys.push(getCurrentApiKey());
        return Promise.resolve({ owner: "addr1owner" });
      });

      const withKey = await connectClient("session-key-1");
      const withoutKey = await connectClient();

      const result = await withKey.client.callTool({ name: "resolve_ada_handle", arguments: { handle: "$alice" } });
      await withoutKey.client.callTool({ name: "resolve_ada_handle", arguments: { handle: "$bob" } });

      expect(result.isError).toBeFalsy();
      expect(seenKeys).toEqual(["session-key-1", undefined]);
    });
  });

  describe("transport failures", () => {
    // Before the fix these requests never got an answer; the timeout turns a hang into a failure.
    const HANG_TIMEOUT_MS = 3_000;

    beforeEach(async () => {
      await startServer(3_600_000);
    });

    function request(method: "GET" | "POST" | "DELETE", sessionId?: string): Promise<Response> {
      return fetch(baseUrl, {
        method,
        headers: {
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(listToolsRequest) : undefined,
        signal: AbortSignal.timeout(HANG_TIMEOUT_MS),
      });
    }

    async function expectInternalServerError(response: Response): Promise<void> {
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toMatch(/^application\/json/);
      expect(await response.json()).toEqual({ error: "Internal server error" });
    }

    /** Connects a client, then releases its connections so only the test's own request reaches the server. */
    async function liveSessionId(): Promise<string> {
      const { client, sessionId } = await connectClient();
      await client.close();
      return sessionId;
    }

    it("POST answers 500 when the transport throws before writing a response", async () => {
      jest.spyOn(StreamableHTTPServerTransport.prototype, "handleRequest").mockRejectedValueOnce(new Error("boom"));

      await expectInternalServerError(await request("POST"));
    });

    it("POST answers 500 when creating the session fails before the reply is hijacked", async () => {
      jest.spyOn(McpServer.prototype, "registerTool").mockImplementationOnce(() => {
        throw new Error("tool registration failed");
      });

      await expectInternalServerError(await request("POST"));
    });

    it("POST terminates the response when the transport throws after starting it", async () => {
      jest.spyOn(StreamableHTTPServerTransport.prototype, "handleRequest").mockImplementationOnce((_req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("event: message\n\n");
        return Promise.reject(new Error("failed mid-stream"));
      });

      const response = await request("POST");

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("event: message\n\n");
    });

    it("GET answers 500 when the transport throws", async () => {
      const sessionId = await liveSessionId();
      jest.spyOn(StreamableHTTPServerTransport.prototype, "handleRequest").mockRejectedValueOnce(new Error("boom"));

      await expectInternalServerError(await request("GET", sessionId));
    });

    it("DELETE answers 500 when the transport throws", async () => {
      const sessionId = await liveSessionId();
      jest.spyOn(StreamableHTTPServerTransport.prototype, "handleRequest").mockRejectedValueOnce(new Error("boom"));

      await expectInternalServerError(await request("DELETE", sessionId));
    });
  });

  describe("idle session cleanup", () => {
    beforeEach(() => {
      // Fake only the interval timer and the clock; real I/O timers keep HTTP working.
      jest.useFakeTimers({
        doNotFake: [
          "setTimeout",
          "clearTimeout",
          "setImmediate",
          "clearImmediate",
          "nextTick",
          "queueMicrotask",
          "hrtime",
          "performance",
        ],
      });
    });

    it("expires sessions idle for longer than the TTL", async () => {
      await startServer(30_000);
      const { sessionId } = await connectClient();

      jest.advanceTimersByTime(SESSION_CLEANUP_INTERVAL_MS);

      const response = await rawRequest("POST", { "mcp-session-id": sessionId }, listToolsRequest);
      expect(response.status).toBe(404);
    });

    it("keeps sessions that are still within the TTL", async () => {
      await startServer(5 * SESSION_CLEANUP_INTERVAL_MS);
      const { client } = await connectClient();

      jest.advanceTimersByTime(SESSION_CLEANUP_INTERVAL_MS);

      const { tools } = await client.listTools();
      expect(tools).toHaveLength(11);
    });

    it("stops the cleanup timer when the server closes", async () => {
      await startServer(30_000);
      expect(jest.getTimerCount()).toBe(1);

      await server.close();

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
