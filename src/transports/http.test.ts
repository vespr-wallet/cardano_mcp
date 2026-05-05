import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpToolRegistry, httpToolRegistry, registerHttpRoutes, HttpToolResult } from "./http.js";

// Mock logger to avoid console output during tests
jest.mock("../utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

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
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "test" }] }) as HttpToolResult,
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
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "first" }] }) as HttpToolResult,
      };
      const tool2 = {
        name: "test_tool",
        title: "Test Tool 2",
        description: "Second tool",
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "second" }] }) as HttpToolResult,
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
        handler: async () => ({ content: [{ type: "text", text: "result" }] }) as HttpToolResult,
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
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "a" }] }) as HttpToolResult,
      };
      const tool2 = {
        name: "tool_b",
        title: "Tool B",
        description: "B",
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "b" }] }) as HttpToolResult,
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
        handler: async () => ({ content: [{ type: "text", text: "result" }] }) as HttpToolResult,
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
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "done" }] }) as HttpToolResult,
      };

      registry.registerTool(tool);

      const listed = registry.listTools();
      expect(listed[0].inputSchema).toEqual({});
    });
  });
});

describe("registerHttpRoutes", () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, { method: string; handler: Function }>;

  beforeEach(() => {
    registeredRoutes = new Map();

    // Clear global registry before each test
    const tools = httpToolRegistry.getAllTools();
    tools.forEach((tool) => {
      httpToolRegistry["tools"].delete(tool.name);
    });

    mockServer = {
      get: jest.fn((path: string, handler: Function) => {
        registeredRoutes.set(`GET ${path}`, { method: "GET", handler });
      }) as unknown as FastifyInstance["get"],
      post: jest.fn((path: string, handler: Function) => {
        registeredRoutes.set(`POST ${path}`, { method: "POST", handler });
      }) as unknown as FastifyInstance["post"],
    };
  });

  it("should register GET /mcp/tools route", async () => {
    await registerHttpRoutes(mockServer as FastifyInstance);

    expect(mockServer.get).toHaveBeenCalledWith("/mcp/tools", expect.any(Function));
  });

  it("should register POST /mcp/tools/:toolName route", async () => {
    await registerHttpRoutes(mockServer as FastifyInstance);

    expect(mockServer.post).toHaveBeenCalledWith("/mcp/tools/:toolName", expect.any(Function));
  });

  describe("GET /mcp/tools handler", () => {
    it("should return list of registered tools", async () => {
      // Register a test tool in the global registry
      httpToolRegistry.registerTool({
        name: "test_list",
        title: "Test List",
        description: "Test description",
        inputSchema: {},
        handler: async () => ({ content: [{ type: "text", text: "test" }] }) as HttpToolResult,
      });

      await registerHttpRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get("GET /mcp/tools");
      expect(route).toBeDefined();

      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
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
      await registerHttpRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get("GET /mcp/tools");
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        tools: [],
        count: 0,
      });
    });
  });

  describe("POST /mcp/tools/:toolName handler", () => {
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

      await registerHttpRoutes(mockServer as FastifyInstance);
    });

    it("should execute a tool and return result", async () => {
      const route = registeredRoutes.get("POST /mcp/tools/:toolName");
      expect(route).toBeDefined();

      const mockRequest = {
        params: { toolName: "echo_tool" },
        body: { arguments: { message: "hello" } },
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        result: { echoed: "hello" },
      });
    });

    it("should return 404 for non-existent tool", async () => {
      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "non_existent_tool" },
        body: { arguments: {} },
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: "TOOL_NOT_FOUND",
          message: "Tool 'non_existent_tool' not found",
          availableTools: expect.any(Array),
        },
      });
    });

    it("should return 400 for invalid request body", async () => {
      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "echo_tool" },
        body: { arguments: "not-an-object" }, // Invalid - should be object
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: expect.any(Array),
        },
      });
    });

    it("should return 400 for invalid tool arguments", async () => {
      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "echo_tool" },
        body: { arguments: { message: 123 } }, // Invalid - should be string
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
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
        inputSchema: {},
        handler: async () => {
          throw new Error("Something went wrong");
        },
      });

      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "error_tool" },
        body: { arguments: {} },
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
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
        inputSchema: {},
        handler: async () => ({
          content: [{ type: "text", text: "Just text" }],
        }),
      });

      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "text_only_tool" },
        body: { arguments: {} },
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        result: [{ type: "text", text: "Just text" }],
      });
    });

    it("should use default empty object for missing arguments", async () => {
      httpToolRegistry.registerTool({
        name: "no_args_tool",
        title: "No Args",
        description: "Needs no arguments",
        inputSchema: {},
        handler: async () => ({
          content: [{ type: "text", text: "Done" }],
          structuredContent: { success: true },
        }),
      });

      const route = registeredRoutes.get("POST /mcp/tools/:toolName");

      const mockRequest = {
        params: { toolName: "no_args_tool" },
        body: {}, // No arguments field
      };
      const mockReply = {
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await route!.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
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
