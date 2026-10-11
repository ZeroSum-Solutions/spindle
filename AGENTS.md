# AGENTS.md — Spindle

Spindle teaches personal trainers how the human body works. Every science claim is cited. Gyms layer their own method on top of the base curriculum. This file is the canonical guide for any coding agent; `CLAUDE.md` imports it.

## Ground rules
- **Public repo, AGPL-3.0-only.** Never commit tenant method content, client data, secrets, `.env*`, screenshots of third-party products, generated bundles, logs or `.codegraph/`. `packages/contracts` is Apache-2.0; original curriculum text in `content/` is CC BY-SA 4.0.
- **Copyright:** lesson text is our own explanation of facts. Never paste paper text beyond a short attributed quote. Record each source's license.
- **Science vs practice:** a block with `support: "science"` must bind at least one approved claim. Practice-based blocks must not carry claims. Gym method courses (`layer: "method"`) are always practice-based. Modality courses may use science where evidence exists and practice-based otherwise. `validateCatalog` and (from phase 2) the database publish gate enforce this. Do not weaken either one.
- **Tenancy:** every tenant row carries `org_id`, and RLS covers every operation. Code that uses the service key bypasses RLS, so it needs its own tests. Cache keys include `org_id`.
- **Client data:** do not ingest any cohort or client data until the disclosure contract (roadmap phase 5) and its tests exist. A suppressed count means unknown, never zero.
- **AI:** Spindle's runtime never calls a model through a personal subscription on behalf of tenants. Founder drafting runs locally and is reviewed by a human before it is committed.

## Layout
| Path | What |
|---|---|
| `apps/web` | Next.js 16 app (App Router). Read `apps/web/AGENTS.md` before writing Next code. |
| `packages/schema` | Curriculum types: Course → Part → Lesson → Block, support and claims |
| `packages/engine` | Pure functions: catalog validation, navigation, progress |
| `packages/contracts` | Public contracts for other products (signal tags, cohort snapshot draft) |
| `supabase/` | Local Supabase config, migrations, pgTAP tests |
| `content/` | Original base curriculum source |
| `docs/` | `ARCHITECTURE.md`, `ROADMAP.md`, `adr/` |

## Commands
Use the pinned toolchain: `mise exec -- <cmd>` (Node 24, pnpm 10).
- `pnpm install`
- `pnpm check` — lint, typecheck, unit tests, build. Run it before opening a PR.
- `pnpm test` — Vitest (`packages/*/src/**/*.test.ts`)
- `pnpm dev` — web app on :3000
- `supabase start -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,postgres-meta,supavisor` — lean local stack (needs Docker); Mailpit on :54324 receives sign-in codes
- `supabase test db` — pgTAP policy tests in `supabase/tests/database/`
- `pnpm --filter web e2e` — Playwright end-to-end tests (needs the local stack; copy `apps/web/.env.example` to `.env.local` with the key from `supabase status`)
- `supabase gen types typescript --local > apps/web/src/lib/supabase/database.types.ts` — after every migration

## Team workflow
- **One lead, at most two writers.** The lead sets priorities, keeps `docs/DECISIONS.md` and is the only one who lands PRs. Writers each own one claimed unit.
- **Claim before code:** every writer works in its own worktree, `~/projects/spindle-worktrees/<slug>` on branch `<type>/<slug>`, prepared with `scripts/worktree-setup.sh`. Never edit another writer's files without the lead's OK, and never run two git commands at once in one worktree.
- **Red test first** for bugs: a test that fails on `main` and passes on the branch.
- **PRs:** open as drafts and fill in `.github/pull_request_template.md`. Mark a PR ready once, after a cross-family review: GPT-6.1 Sol reviews Claude-written code, Claude reviews GPT-written code. Verify each finding against the code before acting on it.
- **No direct pushes to `main`.** The ruleset requires the `ci` check and a squash merge.

## Working conventions
- Small pure functions in `packages/engine`; the UI stays thin. Use zod at every boundary where external data enters.
- Conventional commits on a feature branch; squash-merge through a PR. The `ci` check is required.
- Add an ADR in `docs/adr/` for any decision that is hard to reverse.
- Code graph: run `codegraph init` once per clone (`.codegraph/` is ignored), then use `codegraph explore "<question>"` before grepping.
