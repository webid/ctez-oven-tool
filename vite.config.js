import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "./",
  plugins: [
    nodePolyfills({
      include: ["buffer"],
      globals: { Buffer: true },
    }),
  ],
  build: {
    outDir: "dist",
  },
  define: {
    global: "globalThis",
  },
});
