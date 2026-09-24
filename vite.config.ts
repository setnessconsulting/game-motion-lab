import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Relative base by default so the built artifact can be mounted beneath a versioned
// games-site prefix (motion-lab/<version>/) without rewriting asset URLs.
// See docs/RELEASE.md and docs/ARCHITECTURE.md.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        // Keep the renderer in its own chunk so the bundle baseline can track the
        // game chunk separately from the initial application chunk.
        manualChunks(id: string): string | undefined {
          if (id.includes("node_modules/phaser")) return "phaser";
          return undefined;
        },
      },
    },
  },
});
