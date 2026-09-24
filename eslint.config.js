import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The architecture contract (docs/ARCHITECTURE.md, ADR 0001/0002) is enforced in two
 * places on purpose:
 *   1. here, as editor/lint feedback; and
 *   2. tests/architecture/boundaries.test.ts, as a checked gate that also fails in CI
 *      and locally when ESLint is not the runner.
 * A prose boundary with no executable check does not satisfy the contract.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "performance-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Scientific authority: pure, deterministic, renderer-free.
    files: ["src/science/**/*.ts", "src/domain/**/*.ts", "src/content/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "Science/domain/content must not depend on React (ADR 0001)." },
            { name: "react-dom", message: "Science/domain/content must not depend on React (ADR 0001)." },
            { name: "phaser", message: "Science/domain/content must not depend on Phaser (ADR 0001)." },
          ],
          patterns: [
            {
              group: ["@/ui/*", "@/renderer/*", "@/host/*", "@/viewmodel/*", "../ui/*", "../renderer/*", "../host/*", "../viewmodel/*"],
              message: "Science/domain/content must not import presentation layers (ADR 0001).",
            },
          ],
        },
      ],
    },
  },
  {
    // The renderer may read the typed view model and nothing scientific.
    files: ["src/renderer/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "The Phaser renderer is not a React component (ADR 0002)." },
          ],
          patterns: [
            {
              group: ["@/science/*", "@/domain/*", "@/content/*", "../science/*", "../domain/*", "../content/*"],
              message: "The renderer must not reach into scientific authority; consume the view model (ADR 0002).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/e2e/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
