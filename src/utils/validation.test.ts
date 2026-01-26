import { isValidCardanoAddress, isValidPoolId } from "./validation.js";

describe("isValidCardanoAddress", () => {
  describe("valid addresses", () => {
    it("accepts valid mainnet address", () => {
      const address =
        "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";
      expect(isValidCardanoAddress(address)).toBe(true);
    });

    it("accepts valid testnet address", () => {
      const address =
        "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
      expect(isValidCardanoAddress(address)).toBe(true);
    });
  });

  describe("invalid addresses", () => {
    it("rejects too short address", () => {
      expect(isValidCardanoAddress("addr1abc")).toBe(false);
    });

    it("rejects address with wrong prefix", () => {
      const stakeAddress = "stake1uyehkck0lajq8gr28t9uxnuvgcqmny6k328vp686mhf7hcgrf8swf";
      expect(isValidCardanoAddress(stakeAddress)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidCardanoAddress("")).toBe(false);
    });

    it("rejects non-string input", () => {
      expect(isValidCardanoAddress(null as unknown as string)).toBe(false);
      expect(isValidCardanoAddress(undefined as unknown as string)).toBe(false);
      expect(isValidCardanoAddress(123 as unknown as string)).toBe(false);
    });

    it("handles whitespace-only input", () => {
      expect(isValidCardanoAddress("   ")).toBe(false);
    });

    it("accepts address with leading/trailing whitespace", () => {
      const address =
        "  addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv  ";
      expect(isValidCardanoAddress(address)).toBe(true);
    });
  });
});

describe("isValidPoolId", () => {
  describe("valid pool IDs", () => {
    it("accepts valid pool ID", () => {
      // Example pool ID (56 characters, pool1 prefix)
      const poolId = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";
      expect(isValidPoolId(poolId)).toBe(true);
    });

    it("accepts pool ID with leading/trailing whitespace", () => {
      const poolId = "  pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy  ";
      expect(isValidPoolId(poolId)).toBe(true);
    });
  });

  describe("invalid pool IDs", () => {
    it("rejects pool ID without pool1 prefix", () => {
      expect(isValidPoolId("stake1uyehkck0lajq8gr28t9uxnuvgcqmny6k328vp686mhf7hcgrf8swf")).toBe(false);
    });

    it("rejects pool ID with wrong prefix", () => {
      expect(isValidPoolId("addr1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy")).toBe(false);
    });

    it("rejects too short pool ID", () => {
      expect(isValidPoolId("pool1abc")).toBe(false);
    });

    it("rejects too long pool ID", () => {
      const longPoolId = "pool1" + "a".repeat(60);
      expect(isValidPoolId(longPoolId)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidPoolId("")).toBe(false);
    });

    it("rejects null", () => {
      expect(isValidPoolId(null as unknown as string)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isValidPoolId(undefined as unknown as string)).toBe(false);
    });

    it("rejects non-string input", () => {
      expect(isValidPoolId(123 as unknown as string)).toBe(false);
    });

    it("handles whitespace-only input", () => {
      expect(isValidPoolId("   ")).toBe(false);
    });
  });
});
