import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "frontend/src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".git"],
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
    },
  },
});
