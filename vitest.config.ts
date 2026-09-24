import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Science and domain tests must run without a DOM. A jsdom/global-window test
    // would hide exactly the coupling the architecture contract forbids.
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/architecture/**/*.test.ts"],
    reporters: ["default"],
  },
});
