import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/agmx_test",
      MAIL_TRANSPORT: "log",
      MAIL_DOMAIN: "agmx.test",
      APP_URL: "http://agmx.test",
      ALLOWED_EMAILS: "owner@example.com",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123"
    }
  }
})
