import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // DOM tests exercise interactions; the Next build and browser checks compile
  // the actual Tailwind pipeline. Plain component CSS needs no PostCSS plugins here.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["e2e/**", "**/node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      zod: path.resolve(__dirname, "./node_modules/zod"),
      "server-only": path.resolve(
        __dirname,
        "./node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
});
