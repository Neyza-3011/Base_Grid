import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: [
      "server/**/*.test.ts",
      "frontend/src/**/*.test.ts",
      "frontend/src/**/*.test.tsx",
      "tests/**/*.test.ts"
    ],
    exclude: ["node_modules", "dist", ".git"],
    env: {
      NODE_ENV: "test",
      SUPERADMIN_EMAIL: "saas@rapporti.it",
      EMAIL_PROVIDER: "resend",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./frontend/src"),
    },
  },
});
