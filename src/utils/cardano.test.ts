import { describe, it, expect } from "@jest/globals";
import { formatTokenAmount, lovelaceToAda } from "./cardano.js";

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
