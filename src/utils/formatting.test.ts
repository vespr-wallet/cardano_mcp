import { describe, it, expect } from "@jest/globals";
import { roundAmount } from "./formatting.js";

describe("roundAmount", () => {
  it.each([
    ["36.085547000000005", 6, "36.085547"],
    ["4.086971999999999", 6, "4.086972"],
    ["0.9999999", 6, "1"],
    ["37418079.5", 0, "37418080"],
    ["2.5", 6, "2.5"],
    ["0.0000004", 6, "0"],
    ["9007199254740993", 0, "9007199254740993"],
    ["12345678901.123456", 6, "12345678901.123456"],
    ["1e-7", 6, "1e-7"],
    ["36.085547000000005", null, "36.085547000000005"],
  ])("roundAmount(%s, %s) is %s", (value, decimals, expected) => {
    expect(roundAmount(value, decimals)).toBe(expected);
  });
});
