import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/core-api/public/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "apps/mobile/.expo/**",
      ".data/**",
      ".logs/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The web client runs in a browser, not in Node.
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["apps/mobile/**/*.ts", "apps/mobile/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.es2024,
        __DEV__: "readonly",
      },
    },
  },
  {
    files: ["apps/mobile/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
);
