import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z, ZodObject, ZodRawShape } from "zod";
import { logger } from "../utils/logger.js";
import { apiKeyContext } from "../utils/apiKeyContext.js";

/**
 * Tool definition for HTTP transport
 */
export interface HttpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodObject<ZodRawShape> | Record<string, never>;
  handler: (args: Record<string, unknown>) => Promise<HttpToolResult>;
}

/**
 * Result from tool execution
 */
export interface HttpToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Tool registry for HTTP transport
 * Maintains a separate registry of tools that can be called via HTTP
 */
export class HttpToolRegistry {
  private tools: Map<string, HttpToolDefinition> = new Map();

  /**
   * Register a tool with the HTTP registry
   */
  registerTool(tool: HttpToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info("http_tool_registered", { tool: tool.name });
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): HttpToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): HttpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Remove all registered tools (useful for test teardown)
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * List tool metadata (without handlers)
   */
  listTools(): Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema instanceof z.ZodObject ? tool.inputSchema.shape : {},
    }));
  }
}

// Global registry instance
export const httpToolRegistry = new HttpToolRegistry();

/**
 * HTTP request body schema for tool execution
 */
const executeToolBodySchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

/**
 * Request params for tool execution
 */
interface ExecuteToolParams {
  toolName: string;
}

/**
 * Register MCP HTTP routes with Fastify
 */
export async function registerHttpRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /mcp/tools - List all available tools
   */
  server.get("/mcp/tools", async (_request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const tools = httpToolRegistry.listTools();

      logger.info("http_list_tools", {
        count: tools.length,
        durationMs: Date.now() - startTime,
      });

      return reply.send({
        tools,
        count: tools.length,
      });
    } catch (error) {
      logger.error("http_list_tools_error", {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list tools",
        },
      });
    }
  });

  /**
   * POST /mcp/tools/:toolName - Execute a tool
   */
  server.post<{
    Params: ExecuteToolParams;
    Body: z.infer<typeof executeToolBodySchema>;
  }>("/mcp/tools/:toolName", async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const { toolName } = request.params as ExecuteToolParams;

    try {
      // Parse and validate request body
      const bodyResult = executeToolBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        logger.warn("http_tool_invalid_body", {
          tool: toolName,
          issues: bodyResult.error.issues,
          durationMs: Date.now() - startTime,
        });

        return reply.status(400).send({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request body",
            details: bodyResult.error.issues,
          },
        });
      }

      // Find the tool
      const tool = httpToolRegistry.getTool(toolName);
      if (!tool) {
        logger.warn("http_tool_not_found", {
          tool: toolName,
          durationMs: Date.now() - startTime,
        });

        return reply.status(404).send({
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool '${toolName}' not found`,
            availableTools: httpToolRegistry.listTools().map((t) => t.name),
          },
        });
      }

      // Validate tool arguments if schema is defined
      const args = bodyResult.data.arguments;
      if (tool.inputSchema instanceof z.ZodObject) {
        const argsResult = tool.inputSchema.safeParse(args);
        if (!argsResult.success) {
          logger.warn("http_tool_invalid_args", {
            tool: toolName,
            issues: argsResult.error.issues,
            durationMs: Date.now() - startTime,
          });

          return reply.status(400).send({
            error: {
              code: "INVALID_ARGUMENTS",
              message: "Invalid tool arguments",
              details: argsResult.error.issues,
            },
          });
        }
      }

      logger.info("http_tool_executing", {
        tool: toolName,
        hasArgs: Object.keys(args).length > 0,
      });

      const apiKey = (request.headers?.["x-api-key"] as string | undefined) || undefined;

      const result = await apiKeyContext.run(apiKey, () => tool.handler(args));

      logger.info("http_tool_executed", {
        tool: toolName,
        durationMs: Date.now() - startTime,
        hasStructuredContent: !!result.structuredContent,
      });

      if (result.isError) {
        return reply.status(502).send({
          error: {
            code: "TOOL_ERROR",
            message: result.content.map((c) => c.text).join("\n"),
          },
        });
      }

      return reply.send({
        result: result.structuredContent ?? result.content,
      });
    } catch (error) {
      logger.error("http_tool_execution_error", {
        tool: toolName,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      // Check if it's a known API error type
      const errorMessage = error instanceof Error ? error.message : "Tool execution failed";
      const statusCode = errorMessage.includes("not found") ? 404 : 500;

      return reply.status(statusCode).send({
        error: {
          code: statusCode === 404 ? "NOT_FOUND" : "EXECUTION_ERROR",
          message: errorMessage,
        },
      });
    }
  });

  logger.info("http_routes_registered", {
    routes: ["/mcp/tools", "/mcp/tools/:toolName"],
  });
}
