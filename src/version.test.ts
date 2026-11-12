import { readFileSync } from "fs";
import { VERSION } from "./version.js";

describe("VERSION", () => {
  it("matches the package.json version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});
