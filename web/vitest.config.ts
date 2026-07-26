import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Unit tests receive CI environment variables, but never load values from .env files.
  envDir: false,
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./test/network-guard.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/shared/lib/**", "src/modules/**/lib/**", "src/modules/**/services/**"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/mocks/server-only.ts"),
    },
  },
});
