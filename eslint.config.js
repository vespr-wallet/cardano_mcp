import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

// Mirrors vespr-core's config. Test files live in src/ and are linted too.
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        NodeJS: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      semi: ["error", "always"],
      "no-undef": "error",
    },
  },
  {
    // scripts/ (the stress test) is outside tsconfig, so tsc doesn't check it either.
    ignores: ["dist/", "coverage/", "scripts/", "**/*.js", "**/*.cjs", "**/*.d.ts", "eslint.config.js"],
  },
);
