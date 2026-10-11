# Testing

Use the existing Vitest, pgTAP and Playwright suites. This document owns verification procedures; [AGENTS.md](../AGENTS.md) owns team rules. The required `ci` job is defined in [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Launch and ownership

Use `mise exec --` for the pinned Node and pnpm versions. Database work also needs Docker, the Supabase CLI (CI uses 2.117.0), and PostgreSQL client tools (`psql`, `pg_isready`); mise does not install these. Prepare a fresh checkout with `scripts/worktree-setup.sh`; it installs dependencies but does not start a database or copy environment files. Copy `apps/web/.env.example` to `apps/web/.env.local` only if the destination does not exist. Confirm its prefilled local URL and fill the blank publishable key from the local stack. Never use a production endpoint or service key for these tests. `supabase status` prints local keys; inspect it locally without copying its full output into a receipt.

During concurrent work, the lead owns the shared local Supabase stack and migration admission. Writers ask the lead before starting/stopping/resetting it or applying migrations. Rollback-only pgTAP may run after admission. The owner race test and browser tests write synthetic rows, so schedule them with the lead too. An isolated database needs its own recorded owner, ports and cleanup plan.

For an absent stack, its owner uses the lean start command in [AGENTS.md](../AGENTS.md#commands). It keeps Mailpit for sign-in codes and the Storage API for the media buckets.

Playwright starts the web app on `127.0.0.1:3100`; ordinary `pnpm dev` uses port 3000. The local Playwright config can reuse a server, so verify its worktree and stop only a server you own. For production-build proof, use `CI=1` below, which refuses to reuse an existing server.

## Health check

Before database or browser work, confirm the local database accepts connections and Mailpit answers:

```sh
pg_isready -h 127.0.0.1 -p 54322
curl --fail --silent --show-error http://127.0.0.1:54324/api/v1/info >/dev/null
curl --fail --silent --show-error http://127.0.0.1:54321/storage/v1/status >/dev/null
```

These prove reachability only. A passing SQL suite proves database behavior; browser tests prove the exercised UI/auth flows. If a prerequisite fails, record an environment failure and fix it before evaluating the feature. Never treat a missing service as a product regression.

## Choose the check

Run the smallest existing suite that exercises the change while developing. Before ready, merge the current base, run every touched package's suite and required repo checks, and capture the resulting SHA. CI runs the complete gating job once per head; diagnose a failed test before producing another head.

| Scope | Command | What it proves |
|---|---|---|
| Repository check | `mise exec -- pnpm check` | Lint, typecheck, Vitest and builds; excludes SQL and browser tests |
| Pure functions / evidence clients | `mise exec -- pnpm test` | Existing unit suites; evidence clients use mocked responses, not live provider proof |
| Database policies / RPCs | `mise exec -- supabase test db` | pgTAP suites against the admitted local schema |
| Concurrent last-owner protection | `supabase/tests/race/owner-race.sh` | Two competing transactions produce exactly one failure and leave exactly one owner; needs host `psql` and local DB on :54322, or an isolated local `DB_URL` |
| Browser during development | `mise exec -- pnpm --filter web e2e` | Playwright against local Auth, Mailpit, Storage and database |
| Browser production build | `CI=1 mise exec -- pnpm --filter web e2e` | The same suite against a fresh production build |

The Playwright suite needs host `psql` and a test-only service key for fixture setup and cleanup. Put the local stack's key in the command's environment only, never in a file, log or `NEXT_PUBLIC_*` variable:

```sh
SPINDLE_TEST_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p' | tr -d '"')" \
  mise exec -- pnpm --filter web e2e
```

Only test code reads it; the app never uses a service key. Specs that use it turn traces off, because traces record request headers and cookies. Never use a production key.

Install the pinned browser binary if missing with `mise exec -- pnpm --filter web exec playwright install chromium`. CI also installs OS dependencies on its runner. Read [apps/web/playwright.config.ts](../apps/web/playwright.config.ts) for timeouts, reporting and retained traces.

## Acceptance and coverage

Each feature PR names the acceptance criteria it changes, the tests that assert them, and any remaining gaps. Keep those details in the PR and tests rather than maintaining a second feature checklist here.

| Existing behavior | Evidence source | Limit |
|---|---|---|
| Catalog rules, navigation, in-memory progress | `packages/engine/src/engine.test.ts` | Does not prove durable progress or a publish RPC |
| Evidence-client parsing and transport behavior | `packages/evidence/src/` unit suites | Mocked network responses |
| Tenant privileges and last-owner rules | `supabase/tests/database/`, `supabase/tests/race/` | Applies to the schema tested |
| Sign-in, redirect safety, gym creation, invitations and tenant isolation | `apps/web/e2e/tenancy.spec.ts` | Exercises those browser flows only |
| Session refresh in the proxy | `apps/web/e2e/tenancy.spec.ts` ("an expiring session") | Forces a refresh by moving only the cookie's `expires_at` into the past; the tokens stay real and unexpired. Proves cookie replacement, refresh-token rotation in `auth.refresh_tokens` and the same signed-in user, not the handling of an expired signed JWT |
| Media storage isolation | `apps/web/e2e/storage.spec.ts` | Real Storage API calls for own-gym, trainer, cross-gym, global-bucket, visitor and service-role cases. Storage returns a trigger exception as HTTP 500 `database error, code: P0001`; the spec names the guard by replaying the same row change in a rolled-back transaction |
| Published snapshots parse with the runtime schema | `apps/web/e2e/content-contract.spec.ts` | Publishes synthetic base and method courses through the real RPCs in one rolled-back transaction, checks `parseCourse` leaves each snapshot unchanged, and checks a fixed 37-link corpus against `isSafeContentUrl` |
| Durable player progress and credit in the browser | Phase 2 PR acceptance receipts | Pending until the learner flow lands |

## Fixtures and cleanup

Use synthetic actors in separate browser contexts. The tenancy spec covers an owner, a trainer, an outsider with no gym and a signed-out visitor, with unique `@a.test`, `@b.test` and `@c.test` addresses and gym slugs per run; Mailpit supplies their codes. The storage spec creates its own owners, lead and trainer through the admin API, with a per-run password held in memory. Never use a real client account, mailbox or gym method.

pgTAP fixtures and the content contract spec roll back. The owner race script cleans its fixed synthetic rows on exit, so never run two copies concurrently. The tenancy and storage specs delete exactly the objects, gyms and accounts their run created (by exact id, address or slug, in that order) and assert that none of them, nor their sessions and refresh tokens, remain. Mailpit messages stay. Do not reset a shared stack, clear all mail, or delete another run's fixtures as cleanup.

Stop only your own app process. Leave shared services running for their owner. Keep evidence after removing test state.

## Evidence and exploratory checks

A receipt names the tested commit, command or action, expected result, actual result, exit code and relevant test/artifact path. Playwright retains failure traces in ignored `apps/web/test-results/`. Keep logs and screenshots private unless sanitized; do not commit auth codes, tokens or tenant data. Link shareable CI output from the PR, and use a neutral private receipt reference for local evidence.

For a UI change, capture the action and visible result. For a persisted mutation, verify the result after reload or a fresh session and assert the durable state in the appropriate test. A build or screenshot alone does not prove persistence, authorization or a complete user flow.

An exploratory session covers one named feature with synthetic fixtures and a time limit. Record exact reproduction steps. Rule out environment, seed and expectation errors; confirm a bug with a failing deterministic assertion, fix it, then keep the regression test. An agent's opinion alone is not a failing test.

The verification lifecycle and exploratory-to-regression approach draw on [tester-army/e2e's verification guide](https://github.com/tester-army/e2e/blob/449fa93670ee4da77086cfe535af047f86f4755d/skills/create-verification-skill/SKILL.md) and [bug-bash guide](https://github.com/tester-army/e2e/blob/449fa93670ee4da77086cfe535af047f86f4755d/docs/bug-bash.mdx). No additional runner or model provider is installed.
