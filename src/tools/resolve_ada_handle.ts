import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";

// Output schema
const handleOutputSchema = z.object({
  handle: z.string(),
  owner: z.string().nullable(),
  found: z.boolean(),
});

export function registerResolveAdaHandle(server: McpServer): void {
  server.registerTool(
    "resolve_ada_handle",
    {
      title: "Resolve ADA Handle",
      description:
        "Resolve an ADA handle to its owner's wallet address. ADA handles are human-readable names (like $myhandle) that map to Cardano addresses.",
      inputSchema: {
        handle: z.string().describe("ADA handle (with or without $ prefix, e.g., 'myhandle' or '$myhandle')"),
      },
      outputSchema: handleOutputSchema,
    },
    async ({ handle }) => {
      const trimmedHandle = handle?.trim() ?? "";

      // Validate input
      if (!trimmedHandle || trimmedHandle === "$") {
        return {
          content: [{ type: "text" as const, text: "Error: Handle cannot be empty." }],
          isError: true,
        };
      }

      try {
        const response = await VesprApiRepository.resolveAdaHandle(trimmedHandle);

        // Normalize handle for display (without $)
        const normalizedHandle = (trimmedHandle.startsWith("$") ? trimmedHandle.slice(1) : trimmedHandle).toLowerCase();

        const output = {
          handle: normalizedHandle,
          owner: response.owner,
          found: response.owner !== null,
        };

        // Format human-readable output
        let summary: string;
        if (response.owner) {
          summary = [`Handle: $${normalizedHandle}`, `Owner: ${response.owner}`].join("\n");
        } else {
          summary = [
            `Handle: $${normalizedHandle}`,
            `Status: Not found (handle does not exist or is not registered)`,
          ].join("\n");
        }

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: output,
        };
      } catch (error) {
        if (error instanceof VesprApiError) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` },
          ],
          isError: true,
        };
      }
    },
  );
}
