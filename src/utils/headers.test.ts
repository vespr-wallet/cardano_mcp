import { describe, it, expect } from "@jest/globals";
import { getHeader } from "./headers.js";

describe("getHeader", () => {
  it("returns a string header", () => {
    expect(getHeader({ "x-api-key": "key-123" }, "x-api-key")).toBe("key-123");
  });

  it("returns undefined for a missing header", () => {
    expect(getHeader({}, "x-api-key")).toBeUndefined();
  });

  it("returns undefined for an empty header", () => {
    expect(getHeader({ "x-api-key": "" }, "x-api-key")).toBeUndefined();
  });

  it("returns undefined for a repeated header delivered as an array", () => {
    expect(getHeader({ "set-cookie": ["a=1", "b=2"] }, "set-cookie")).toBeUndefined();
  });
});
