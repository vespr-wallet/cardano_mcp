import { describe, it, expect } from "@jest/globals";
import { decodeUtxoCborHex, addressBytesToBech32 } from "./utxo.js";
import { UTXO_FIXTURES, FIXTURE_ADDRESS, HOSKY_POLICY, HANDLE_POLICY } from "./utxo.fixtures.js";

describe("decodeUtxoCborHex", () => {
  it("decodes a pure-ADA UTxO", () => {
    expect(decodeUtxoCborHex(UTXO_FIXTURES.pureAda5)).toEqual({
      tx_hash: "11".repeat(32),
      output_index: 0,
      address: FIXTURE_ADDRESS,
      lovelace: 5000000n,
      tokens: [],
    });
  });

  it("decodes a legacy array-format output with tokens", () => {
    expect(decodeUtxoCborHex(UTXO_FIXTURES.withTokens)).toEqual({
      tx_hash: "33".repeat(32),
      output_index: 1,
      address: FIXTURE_ADDRESS,
      lovelace: 1500000n,
      tokens: [
        { policy_id: HOSKY_POLICY, asset_name_hex: "484f534b59", quantity: 1234567n },
        { policy_id: HANDLE_POLICY, asset_name_hex: "000de1406d795f68616e646c65", quantity: 1n },
      ],
    });
  });

  it("decodes a post-Alonzo map-format output", () => {
    expect(decodeUtxoCborHex(UTXO_FIXTURES.mapFormat)).toEqual({
      tx_hash: "44".repeat(32),
      output_index: 2,
      address: FIXTURE_ADDRESS,
      lovelace: 2000000n,
      tokens: [{ policy_id: HOSKY_POLICY, asset_name_hex: "484f534b59", quantity: 5n }],
    });
  });

  it("decodes indefinite-length arrays", () => {
    // [[h'00..', 7], [h'61', 1000000]] with indefinite outer and input arrays
    const hex = `9f9f5820${"00".repeat(32)}07ff824161 1a000f4240ff`.replace(/ /g, "");
    expect(decodeUtxoCborHex(hex)).toEqual(
      expect.objectContaining({ tx_hash: "00".repeat(32), output_index: 7, lovelace: 1000000n }),
    );
  });

  it("skips datum and script fields made of tags, text, negative ints, simple values and chunked strings", () => {
    const address = `581d61${"00".repeat(28)}`;
    const datum = "8201d8185f41aa41bbff"; // [1, 24(h'aa' h'bb' indefinite)]
    const extra = "bf63616263207f6178fff5ff"; // {_ "abc": -1, (_ "x"): true}
    const hex = `82825820${"66".repeat(32)}01a400${address}011a001e848002${datum}03${extra}`;

    expect(decodeUtxoCborHex(hex)).toEqual({
      tx_hash: "66".repeat(32),
      output_index: 1,
      address: expect.stringMatching(/^addr1v/),
      lovelace: 2000000n,
      tokens: [],
    });
  });

  it.each([
    { name: "invalid hex", hex: "zz" },
    { name: "odd-length hex", hex: "828" },
    { name: "truncated data", hex: UTXO_FIXTURES.pureAda5.slice(0, -4) },
    { name: "trailing bytes", hex: `${UTXO_FIXTURES.pureAda5}00` },
    { name: "wrong top-level type", hex: "01" },
    { name: "missing output", hex: `8182582011${"11".repeat(31)}00` },
    { name: "float value", hex: "f93c00" },
    { name: "unexpected break", hex: "ff" },
    { name: "indefinite-length integer", hex: "1f" },
    { name: "invalid additional info", hex: "1c" },
    { name: "length beyond the data", hex: "5a00010000" },
    { name: "invalid string chunk", hex: "5f01ff" },
  ])("rejects $name", ({ hex }) => {
    expect(() => decodeUtxoCborHex(hex)).toThrow();
  });
});

describe("addressBytesToBech32", () => {
  it("encodes a testnet enterprise address with the addr_test prefix", () => {
    const bytes = Uint8Array.from([0x60, ...new Array<number>(28).fill(0)]);
    expect(addressBytesToBech32(bytes)).toMatch(/^addr_test1/);
  });

  it("returns hex for non-Shelley addresses", () => {
    expect(addressBytesToBech32(Uint8Array.from([0x82, 0x01]))).toBe("8201");
  });
});
