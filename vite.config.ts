import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/aws-mahjong/",
  build: {
    outDir: "docs/app",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
