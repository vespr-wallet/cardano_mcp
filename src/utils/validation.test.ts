import { isValidCardanoAddress } from "./validation.js";

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
