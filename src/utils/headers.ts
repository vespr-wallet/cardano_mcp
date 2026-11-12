import type { IncomingHttpHeaders } from "node:http";

/**
 * Returns a request header as a non-empty string, or undefined when it is missing, empty,
 * or not a single string value.
 */
export function getHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}
