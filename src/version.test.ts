import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { VERSION } from "./version.js";

describe("VERSION", () => {
  it("matches the package.json version", () => {
    const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg).toMatchObject({ version: VERSION });
  });
});
