import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VesprApiError } from "../types/errors.js";
import VesprApiRepository from "../repository/VesprApiRepository.js";
import type { ImageData } from "../types/api/schemas.js";

// Maximum number of assets that can be queried at once
const MAX_ASSETS_LIMIT = 100;

// Output schema for image data - discriminated union supporting all image types
const imageDataOutputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("URL_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("CID_IMAGE"),
    image: z.string(),
  }),
  z.object({
    type: z.literal("BASE64_IMAGE"),
    image: z.string(),
    image_encoding: z.string(),
  }),
  z.object({
    type: z.literal("NO_IMAGE"),
  }),
]);

// Output schema for tokens
const tokenSummarySchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  ticker: z.string().optional(),
  decimals: z.number(),
  verified: z.boolean(),
  registered_name: z.string().optional(),
  image: imageDataOutputSchema,
});

// Output schema for NFTs
const nftSummarySchema = z.object({
  policy: z.string(),
  hex_asset_name: z.string(),
  name: z.string(),
  registered_name: z.string().optional(),
  image: imageDataOutputSchema,
});

// Main output schema
const assetSummaryOutputSchema = z.object({
  queried_count: z.number(),
  tokens: z.array(tokenSummarySchema),
  nfts: z.array(nftSummarySchema),
  other_nfts: z.array(nftSummarySchema),
});

/**
 * Returns a display string for image availability
 */
function formatImageInfo(image: ImageData): string {
  switch (image.type) {
    case "URL_IMAGE":
      return "[Has Image: URL]";
    case "CID_IMAGE":
      return "[Has Image: IPFS]";
    case "BASE64_IMAGE":
      return "[Has Image: Base64]";
    case "NO_IMAGE":
      return "[No Image]";
  }
}

/**
 * Formats the asset summary as human-readable text
 */
function formatAssetSummary(
  queriedCount: number,
  tokens: Array<{ name: string; ticker?: string; verified: boolean; image: ImageData }>,
  nfts: Array<{ name: string; image: ImageData }>,
  otherNfts: Array<{ name: string; image: ImageData }>,
): string {
  const lines: string[] = [];

  lines.push(`Asset Summary (${queriedCount} assets queried)`);
  lines.push("");

  // Tokens section
  lines.push(`Tokens (${tokens.length}):`);
  if (tokens.length === 0) {
    lines.push("  No fungible tokens found");
  } else {
    for (const token of tokens) {
      const ticker = token.ticker ? ` (${token.ticker})` : "";
      const verified = token.verified ? "Yes" : "No";
      const imageInfo = formatImageInfo(token.image);
      lines.push(`  - ${token.name}${ticker} - Verified: ${verified} ${imageInfo}`);
    }
  }
  lines.push("");

  // NFTs section
  lines.push(`NFTs (${nfts.length}):`);
  if (nfts.length === 0) {
    lines.push("  No NFTs found");
  } else {
    for (const nft of nfts) {
      const imageInfo = formatImageInfo(nft.image);
      lines.push(`  - ${nft.name} ${imageInfo}`);
    }
  }
  lines.push("");

  // Other NFTs section
  lines.push(`Other NFTs (${otherNfts.length}):`);
  if (otherNfts.length === 0) {
    lines.push("  No other NFTs found");
  } else {
    for (const nft of otherNfts) {
      const imageInfo = formatImageInfo(nft.image);
      lines.push(`  - ${nft.name} ${imageInfo}`);
    }
  }

  return lines.join("\n");
}

export function registerGetAssetSummary(server: McpServer): void {
  server.registerTool(
    "get_asset_summary",
    {
      title: "Get Asset Summary",
      description:
        "Retrieve summary information for multiple Cardano native assets in a single batch request. Returns categorized results for tokens (fungible), NFTs, and other NFTs. Maximum 100 assets per request.",
      inputSchema: {
        units: z
          .array(z.string())
          .describe(
            "Array of asset unit identifiers (policy ID + hex-encoded asset name). Maximum 100 units per request.",
          ),
      },
      outputSchema: assetSummaryOutputSchema,
    },
    async ({ units }) => {
      // Validate input - empty array
      if (!units || units.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: Units array cannot be empty." }],
          isError: true,
        };
      }

      // Validate input - max limit
      if (units.length > MAX_ASSETS_LIMIT) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Maximum ${MAX_ASSETS_LIMIT} assets allowed per request. Received ${units.length}.`,
            },
          ],
          isError: true,
        };
      }

      // Validate input - no empty strings
      const trimmedUnits = units.map((u) => u.trim()).filter((u) => u !== "");
      if (trimmedUnits.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Error: All provided units are empty or whitespace." }],
          isError: true,
        };
      }

      try {
        const response = await VesprApiRepository.getAssetSummary(trimmedUnits);

        // Transform tokens to output format (including image for AI display)
        const tokens = response.tokens.map((t) => ({
          policy: t.policy,
          hex_asset_name: t.hex_asset_name,
          name: t.name,
          ticker: t.ticker,
          decimals: t.decimals,
          verified: t.verified,
          registered_name: t.registered_name,
          image: t.image,
        }));

        // Transform NFTs to output format (including image for AI display)
        const nfts = response.nfts.map((n) => ({
          policy: n.policy,
          hex_asset_name: n.hex_asset_name,
          name: n.name,
          registered_name: n.registered_name,
          image: n.image,
        }));

        // Transform other NFTs to output format (including image for AI display)
        const otherNfts = response.other_nfts.map((n) => ({
          policy: n.policy,
          hex_asset_name: n.hex_asset_name,
          name: n.name,
          registered_name: n.registered_name,
          image: n.image,
        }));

        const output = {
          queried_count: trimmedUnits.length,
          tokens,
          nfts,
          other_nfts: otherNfts,
        };

        // Format human-readable output
        const summary = formatAssetSummary(trimmedUnits.length, tokens, nfts, otherNfts);

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
