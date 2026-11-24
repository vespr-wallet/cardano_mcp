import { describe, it, expect } from "@jest/globals";
import { formatTokenAmount, lovelaceToAda, readableAssetName } from "./cardano.js";

describe("lovelaceToAda", () => {
  it.each([
    ["0", "0.000000"],
    ["1500000", "1.500000"],
    ["-171152300", "-171.152300"],
    ["-152300", "-0.152300"],
  ])("formats %s as %s", (lovelace, ada) => {
    expect(lovelaceToAda(lovelace)).toBe(ada);
  });
});

describe("formatTokenAmount", () => {
  it.each([
    ["42", 0, "42"],
    ["-1234567", 3, "-1234.567"],
    ["1000000000000000001", 18, "1.000000000000000001"],
  ])("formats %s with %d decimals as %s", (quantity, decimals, expected) => {
    expect(formatTokenAmount(quantity, decimals)).toBe(expected);
  });
});

describe("readableAssetName", () => {
  it("decodes a hex name that is printable UTF-8 text", () => {
    expect(readableAssetName("484f534b59")).toBe("HOSKY");
    expect(readableAssetName("536e656b20f09f9089")).toBe("Snek 🐉");
  });

  it.each([
    ["", "an empty name"],
    ["000de1406d795f68616e646c65", "a CIP-68 label"],
    ["ff00", "invalid UTF-8"],
  ])("keeps the hex for %p (%s)", (hex) => {
    expect(readableAssetName(hex)).toBe(hex);
  });
});
