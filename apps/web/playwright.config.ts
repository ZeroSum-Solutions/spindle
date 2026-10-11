import { defineConfig, devices } from "@playwright/test";

// Needs the local Supabase stack (`supabase start`, with Mailpit) for sign-in codes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI tests the production build (NEXT_PUBLIC_* values are inlined at build time).
    command: process.env.CI
      ? "pnpm exec next build && pnpm exec next start --port 3100 --hostname 127.0.0.1"
      : "pnpm exec next dev --port 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
