import { describe, it, expect } from "@jest/globals";
import { VesprApiError, getFallbackErrorMessage } from "./errors.js";

describe("VesprApiError", () => {
  it("carries the status code, cause and developer message", () => {
    const cause = new Error("socket hang up");
    const error = new VesprApiError("Service temporarily unavailable.", 503, cause, "upstream timeout");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("VesprApiError");
    expect(error.message).toBe("Service temporarily unavailable.");
    expect(error.statusCode).toBe(503);
    expect(error.originalError).toBe(cause);
    expect(error.devMessage).toBe("upstream timeout");
  });

  it("leaves optional fields undefined", () => {
    const error = new VesprApiError("boom");

    expect(error.statusCode).toBeUndefined();
    expect(error.originalError).toBeUndefined();
    expect(error.devMessage).toBeUndefined();
  });
});

describe("getFallbackErrorMessage", () => {
  it.each([
    [400, "Invalid request parameters."],
    [401, "Authentication failed. Check API credentials."],
    [403, "Access denied."],
    [404, "The requested resource was not found."],
    [429, "Rate limited. Please wait before retrying."],
    [500, "Service temporarily unavailable. Try again later."],
    [502, "Service temporarily unavailable. Try again later."],
    [503, "Service temporarily unavailable. Try again later."],
    [504, "Service temporarily unavailable. Try again later."],
    [418, "Request failed (status 418)."],
    [501, "Request failed (status 501)."],
  ])("maps status %i to %p", (status, message) => {
    expect(getFallbackErrorMessage(status)).toBe(message);
  });
});
