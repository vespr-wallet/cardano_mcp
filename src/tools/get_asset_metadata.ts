import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";

// Output schema
const assetMetadataOutputSchema = z.object({
  unit: z.string(),
  name: z.string(),
  has_metadata: z.boolean(),
  onchain_metadata: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * Formats nested metadata as a human-readable string
 */
function formatMetadata(metadata: Record<string, unknown>, indent: number = 0): string {
  const indentStr = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      lines.push(`${indentStr}${key}: null`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${indentStr}${key}:`);
      lines.push(formatMetadata(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${indentStr}${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          lines.push(`${indentStr}  -`);
          lines.push(formatMetadata(item as Record<string, unknown>, indent + 2));
        } else {
          lines.push(`${indentStr}  - ${String(item)}`);
        }
      }
    } else {
      lines.push(`${indentStr}${key}: ${String(value)}`);
    }
  }

  return lines.join("\n");
}

export function registerGetAssetMetadata(server: McpServer): void {
  server.registerTool(
    "get_asset_metadata",
    {
      title: "Get Asset Metadata",
      description:
        "Retrieve on-chain metadata (CIP-25/CIP-68) for a Cardano native asset. Returns the asset name and any associated metadata stored on-chain.",
      inputSchema: {
        unit: z
          .string()
          .describe("Asset unit identifier (policy ID + hex-encoded asset name, e.g., 'policyId + hexAssetName')"),
      },
      outputSchema: assetMetadataOutputSchema,
    },
    async ({ unit }) => {
      // Validate input
      if (!unit || unit.trim() === "") {
        return {
          content: [{ type: "text" as const, text: "Error: Asset unit cannot be empty." }],
          isError: true,
        };
      }

      try {
        const response = await VesprApiRepository.getAssetMetadata(unit.trim());

        const output = {
          unit,
          name: response.name,
          has_metadata: response.onchain_metadata !== null,
          onchain_metadata: response.onchain_metadata,
        };

        // Format human-readable output
        let summary: string;
        if (response.onchain_metadata) {
          const metadataFormatted = formatMetadata(response.onchain_metadata);
          summary = [`Asset: ${response.name}`, `Unit: ${unit}`, "", "On-chain Metadata:", metadataFormatted].join(
            "\n",
          );
        } else {
          summary = [`Asset: ${response.name}`, `Unit: ${unit}`, `Status: No on-chain metadata found`].join("\n");
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
