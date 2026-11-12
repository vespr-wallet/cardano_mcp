import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Fastify, { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpToolRegistry, httpToolRegistry, registerHttpRoutes, HttpToolResult } from "./http.js";
import { getCurrentApiKey } from "../utils/apiKeyContext.js";

// Mock logger to avoid console output during tests
jest.mock("../utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const textResult = (text: string): HttpToolResult => ({ content: [{ type: "text", text }] });

describe("HttpToolRegistry", () => {
  let registry: HttpToolRegistry;

  beforeEach(() => {
    registry = new HttpToolRegistry();
  });

  describe("registerTool", () => {
    it("should register a tool", () => {
      const tool = {
        name: "test_tool",
        title: "Test Tool",
        description: "A test tool",
        inputSchema: z.object({}),
        handler: async () => textResult("test"),
      };

      registry.registerTool(tool);

      expect(registry.getTool("test_tool")).toBeDefined();
      expect(registry.getTool("test_tool")?.name).toBe("test_tool");
    });

    it("should overwrite existing tool with same name", () => {
      const tool1 = {
        name: "test_tool",
        title: "Test Tool 1",
        description: "First tool",
        inputSchema: z.object({}),
        handler: async () => textResult("first"),
      };
      const tool2 = {
        name: "test_tool",
        title: "Test Tool 2",
        description: "Second tool",
        inputSchema: z.object({}),
        handler: async () => textResult("second"),
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      expect(registry.getTool("test_tool")?.title).toBe("Test Tool 2");
    });
  });

  describe("getTool", () => {
    it("should return undefined for non-existent tool", () => {
      expect(registry.getTool("non_existent")).toBeUndefined();
    });

    it("should return the correct tool", () => {
      const tool = {
        name: "my_tool",
        title: "My Tool",
        description: "Description",
        inputSchema: z.object({ param: z.string() }),
        handler: async () => textResult("result"),
      };

      registry.registerTool(tool);

      const retrieved = registry.getTool("my_tool");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("my_tool");
      expect(retrieved?.title).toBe("My Tool");
    });
  });

  describe("getAllTools", () => {
    it("should return empty array when no tools registered", () => {
      expect(registry.getAllTools()).toEqual([]);
    });

    it("should return all registered tools", () => {
      const tool1 = {
        name: "tool_a",
        title: "Tool A",
        description: "A",
        inputSchema: z.object({}),
        handler: async () => textResult("a"),
      };
      const tool2 = {
        name: "tool_b",
        title: "Tool B",
        description: "B",
        inputSchema: z.object({}),
        handler: async () => textResult("b"),
      };

      registry.registerTool(tool1);
      registry.registerTool(tool2);

      const tools = registry.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain("tool_a");
      expect(tools.map((t) => t.name)).toContain("tool_b");
    });
  });

  describe("listTools", () => {
    it("should return tool metadata without handlers", () => {
      const tool = {
        name: "list_test",
        title: "List Test",
        description: "For listing",
        inputSchema: z.object({ input: z.string() }),
        handler: async () => textResult("result"),
      };

      registry.registerTool(tool);

      const listed = registry.listTools();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toHaveProperty("name", "list_test");
      expect(listed[0]).toHaveProperty("title", "List Test");
      expect(listed[0]).toHaveProperty("description", "For listing");
      expect(listed[0]).toHaveProperty("inputSchema");
      expect(listed[0]).not.toHaveProperty("handler");
    });

    it("should handle empty inputSchema", () => {
      const tool = {
        name: "no_input",
        title: "No Input",
        description: "Tool with no input",
        inputSchema: z.object({}),
        handler: async () => textResult("done"),
      };

      registry.registerTool(tool);

      const listed = registry.listTools();
      expect(listed[0].inputSchema).toEqual({});
    });
  });
});

describe("registerHttpRoutes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    // Clear global registry before each test
    httpToolRegistry.clear();
    server = Fastify();
  });

  afterEach(async () => {
    await server.close();
    httpToolRegistry.clear();
  });

  // Registers the routes after the test has set up the registry, then waits for Fastify to be ready
  const startServer = async (): Promise<void> => {
    await registerHttpRoutes(server);
    await server.ready();
  };

  it("should register GET /tools route", async () => {
    await startServer();

    expect(server.hasRoute({ method: "GET", url: "/tools" })).toBe(true);
  });

  it("should register POST /tools/:toolName route", async () => {
    await startServer();

    expect(server.hasRoute({ method: "POST", url: "/tools/:toolName" })).toBe(true);
  });

  describe("GET /tools handler", () => {
    it("should return list of registered tools", async () => {
      // Register a test tool in the global registry
      httpToolRegistry.registerTool({
        name: "test_list",
        title: "Test List",
        description: "Test description",
        inputSchema: z.object({}),
        handler: async () => textResult("test"),
      });

      await startServer();

      const response = await server.inject({ method: "GET", url: "/tools" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "test_list",
            title: "Test List",
            description: "Test description",
          }),
        ]),
        count: 1,
      });
    });

    it("should return empty list when no tools registered", async () => {
      await startServer();

      const response = await server.inject({ method: "GET", url: "/tools" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tools: [],
        count: 0,
      });
    });
  });

  describe("POST /tools/:toolName handler", () => {
    beforeEach(async () => {
      // Register a test tool
      httpToolRegistry.registerTool({
        name: "echo_tool",
        title: "Echo Tool",
        description: "Echoes the input",
        inputSchema: z.object({
          message: z.string(),
        }),
        handler: async (args: Record<string, unknown>) => ({
          content: [{ type: "text", text: `Echo: ${args.message}` }],
          structuredContent: { echoed: args.message },
        }),
      });

      await startServer();
    });

    it("should execute a tool and return result", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/tools/echo_tool",
        payload: { arguments: { message: "hello" } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: { echoed: "hello" },
      });
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/tools/non_existent_tool",
        payload: { arguments: {} },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: "TOOL_NOT_FOUND",
          message: "Tool 'non_existent_tool' not found",
          availableTools: expect.any(Array),
        },
      });
    });

    it("should return 400 for invalid request body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/tools/echo_tool",
        payload: { arguments: "not-an-object" }, // Invalid - should be object
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: expect.any(Array),
        },
      });
    });

    it("should return 400 for invalid tool arguments", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/tools/echo_tool",
        payload: { arguments: { message: 123 } }, // Invalid - should be string
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: "INVALID_ARGUMENTS",
          message: "Invalid tool arguments",
          details: expect.any(Array),
        },
      });
    });

    it("should handle tool execution errors", async () => {
      // Register a tool that throws an error
      httpToolRegistry.registerTool({
        name: "error_tool",
        title: "Error Tool",
        description: "Throws an error",
        inputSchema: z.object({}),
        handler: async () => {
          throw new Error("Something went wrong");
        },
      });

      const response = await server.inject({
        method: "POST",
        url: "/tools/error_tool",
        payload: { arguments: {} },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: {
          code: "EXECUTION_ERROR",
          message: "Something went wrong",
        },
      });
    });

    it("should return content array when no structuredContent", async () => {
      httpToolRegistry.registerTool({
        name: "text_only_tool",
        title: "Text Only",
        description: "Returns only text content",
        inputSchema: z.object({}),
        handler: async () => textResult("Just text"),
      });

      const response = await server.inject({
        method: "POST",
        url: "/tools/text_only_tool",
        payload: { arguments: {} },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: [{ type: "text", text: "Just text" }],
      });
    });

    it("should use default empty object for missing arguments", async () => {
      httpToolRegistry.registerTool({
        name: "no_args_tool",
        title: "No Args",
        description: "Needs no arguments",
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: "text", text: "Done" }],
          structuredContent: { success: true },
        }),
      });

      const response = await server.inject({
        method: "POST",
        url: "/tools/no_args_tool",
        payload: {}, // No arguments field
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: { success: true },
      });
    });
  });
});

describe("Global httpToolRegistry", () => {
  it("should be a singleton instance", () => {
    expect(httpToolRegistry).toBeInstanceOf(HttpToolRegistry);
  });
});

describe("registerHttpRoutes over a real Fastify instance", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    httpToolRegistry.clear();
    server = Fastify();
    await registerHttpRoutes(server);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    httpToolRegistry.clear();
    jest.restoreAllMocks();
  });

  it("returns 500 INTERNAL_ERROR when listing tools throws", async () => {
    jest.spyOn(httpToolRegistry, "listTools").mockImplementation(() => {
      throw new Error("registry exploded");
    });

    const response = await server.inject({ method: "GET", url: "/tools" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Failed to list tools" },
    });
  });

  it("lists the tool names that exist when a tool is not found", async () => {
    httpToolRegistry.registerTool({
      name: "known_tool",
      title: "Known",
      description: "Known tool",
      inputSchema: z.object({}),
      handler: async () => textResult("ok"),
    });

    const response = await server.inject({ method: "POST", url: "/tools/missing_tool", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "TOOL_NOT_FOUND",
        message: "Tool 'missing_tool' not found",
        availableTools: ["known_tool"],
      },
    });
  });

  it("maps a tool result flagged isError to 502 TOOL_ERROR joining all text parts", async () => {
    httpToolRegistry.registerTool({
      name: "failing_tool",
      title: "Failing",
      description: "Returns an error result",
      inputSchema: z.object({}),
      handler: async () => ({
        content: [
          { type: "text", text: "Error: upstream down" },
          { type: "text", text: "Try again later" },
        ],
        isError: true,
      }),
    });

    const response = await server.inject({ method: "POST", url: "/tools/failing_tool", payload: {} });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: { code: "TOOL_ERROR", message: "Error: upstream down\nTry again later" },
    });
  });

  it("maps a thrown 'not found' error to 404 NOT_FOUND", async () => {
    httpToolRegistry.registerTool({
      name: "lookup_tool",
      title: "Lookup",
      description: "Throws a not-found error",
      inputSchema: z.object({}),
      handler: async () => {
        throw new Error("Asset not found in index");
      },
    });

    const response = await server.inject({ method: "POST", url: "/tools/lookup_tool", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Asset not found in index" },
    });
  });

  it("maps a thrown non-Error value to 500 with a generic message", async () => {
    httpToolRegistry.registerTool({
      name: "weird_tool",
      title: "Weird",
      description: "Throws a string",
      inputSchema: z.object({}),
      handler: () => Promise.reject("plain string failure"),
    });

    const response = await server.inject({ method: "POST", url: "/tools/weird_tool", payload: {} });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "EXECUTION_ERROR", message: "Tool execution failed" },
    });
  });

  it("makes the X-API-Key header available to the handler through the API key context", async () => {
    const seenKeys: Array<string | undefined> = [];
    httpToolRegistry.registerTool({
      name: "key_tool",
      title: "Key",
      description: "Records the API key it runs with",
      inputSchema: z.object({}),
      handler: async () => {
        seenKeys.push(getCurrentApiKey());
        return textResult("ok");
      },
    });

    await server.inject({
      method: "POST",
      url: "/tools/key_tool",
      headers: { "x-api-key": "user-key-123" },
      payload: {},
    });
    await server.inject({ method: "POST", url: "/tools/key_tool", payload: {} });

    expect(seenKeys).toEqual(["user-key-123", undefined]);
  });

  it("passes the schema-parsed arguments, with defaults and preprocessing applied, to the handler", async () => {
    const received: Array<Record<string, unknown>> = [];
    httpToolRegistry.registerTool({
      name: "defaults_tool",
      title: "Defaults",
      description: "Records the arguments it receives",
      inputSchema: z.object({
        unit: z.string(),
        currency: z.preprocess((val) => (val === "" ? undefined : val), z.string().default("USD")),
        period: z.string().default("24H"),
      }),
      handler: async (args) => {
        received.push(args);
        return textResult("ok");
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/tools/defaults_tool",
      payload: { arguments: { unit: "abc", currency: "" } },
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual([{ unit: "abc", currency: "USD", period: "24H" }]);
  });
});
