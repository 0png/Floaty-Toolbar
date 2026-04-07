// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["node_modules/", "main.js", "dist/"],
  },
  ...obsidianmd.configs.recommended,
  // Or include English locale files (JSON and TS/JS modules)
  // ...obsidianmd.configs.recommendedWithLocalesEn,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
      globals: {
        ...globals.browser,
      },
    },

    // Optional project overrides
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Floaty"],
          acronyms: ["OK", "URL"],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
]);
