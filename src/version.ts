import { readFileSync } from "fs";
import { z } from "zod";

/**
 * The package version, read from package.json so it can't drift from the
 * published version. package.json sits one level above both `src/` and `dist/`.
 */
export const VERSION = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))).version;
