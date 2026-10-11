import { defineConfig, devices } from "@playwright/test";
import { e2ePort } from "./e2e/helpers/test-env";

// E2E_PORT lets a writer run the suite on its own port beside the shared one (default 3100; validated).
const PORT = e2ePort();

// Needs the local Supabase stack (`supabase start`, with Mailpit) for sign-in codes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI tests the production build (NEXT_PUBLIC_* values are inlined at build time).
    // SPINDLE_PREVIEW_PAGES=1 turns on the test-only pages (the brand preview) in the production build.
    // The app never gets the test-only service key: it is unset before the server
    // starts, and the server refuses to start (exit 97) if it is still present.
    command: `env -u SPINDLE_TEST_SERVICE_ROLE_KEY SPINDLE_PREVIEW_PAGES=1 sh -c 'test -z "\${SPINDLE_TEST_SERVICE_ROLE_KEY+x}" || exit 97; ${
      process.env.CI
        ? `pnpm exec next build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`
        : `pnpm exec next dev --port ${PORT} --hostname 127.0.0.1`
    }'`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
