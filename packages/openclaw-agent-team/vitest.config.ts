import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    // Run test files in sequence to avoid temp directory conflicts
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "tests"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    // Handle internal OpenClaw module imports that aren't in the exports map
    deps: {
      interopDefault: true,
    },
    // Mock the internal heartbeat module path
    alias: [
      {
        find: /^openclaw\/dist\/plugin-sdk\/infra\/heartbeat-wake\.js$/,
        replacement: "/Users/FradSer/Developer/FradSer/openclaw-agent-team/packages/openclaw-agent-team/tests/__mocks__/heartbeat-wake.ts",
      },
    ],
  },
});
