/**
 * A single-file build of the monster sheet, for sharing as one page.
 * The game itself is built by `vite.config.ts`.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-gallery",
    rollupOptions: {
      input: "gallery.html",
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});
