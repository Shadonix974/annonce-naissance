import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    globalSetup: "./test/setup.ts",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: "default",
    environment: "node",
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
