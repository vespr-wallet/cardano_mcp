import { z } from "zod";

/**
 * Error thrown when a VESPR API request fails.
 * Contains user-friendly messages for common error scenarios.
 */
export class VesprApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error,
    public devMessage?: string,
  ) {
    super(message);
    this.name = "VesprApiError";
  }
}

/**
 * API error response format from the backend. A field with the wrong type is dropped
 * rather than failing the whole parse.
 */
export const ApiErrorResponseSchema = z.object({
  errorMessage: z.string().optional().catch(undefined),
  devErrorMessage: z.string().optional().catch(undefined),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Get fallback error message based on HTTP status code.
 * Used when the API doesn't provide a specific error message.
 */
export function getFallbackErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Invalid request parameters.";
    case 401:
      return "Authentication failed. Check API credentials.";
    case 403:
      return "Access denied.";
    case 404:
      return "The requested resource was not found.";
    case 429:
      return "Rate limited. Please wait before retrying.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Service temporarily unavailable. Try again later.";
    default:
      return `Request failed (status ${statusCode}).`;
  }
}

/**
 * Marks a tool result that rejected its input. It is a symbol key, so JSON drops it and MCP clients never see it; the
 * REST route reads it to answer 422 instead of 502.
 */
export const INVALID_INPUT = Symbol("invalidInput");

/** A tool error for bad input (address, hash, unit, amount...), as opposed to a backend failure. */
export function invalidInputResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  [INVALID_INPUT]: true;
} {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true, [INVALID_INPUT]: true };
}
