/**
 * A single-file build of the game, for handing to somebody to play.
 *
 * Everything - JS, CSS, fonts fallbacks - ends up inside one .html file, so the page
 * works with no server and no network. `tools/inline.mjs` does the inlining after the
 * normal bundle, which is simpler than fighting Rollup's asset handling.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-play",
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: {
      input: "index.html",
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});
