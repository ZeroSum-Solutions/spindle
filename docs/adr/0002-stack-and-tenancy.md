# ADR 0002: Stack and tenancy

- Status: accepted, 2026-10-10

## Decision
- **Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, Supabase (Postgres, Auth, Storage), pnpm workspaces, Node 24 pinned with mise, Vitest, Playwright.
- **Tenancy:** a shared database with `org_id` on every tenant row, enforced by RLS on every operation. Base and modality content are global rows written only by the content-publisher path.
- **Identity:** Spindle's own Supabase Auth accounts. Federation with other identity providers needs a new ADR.
- **Mac mini:** not used for CI; hosted runners are free for public repos.

## Why
- The stack matches the owner's other products.
- RLS tenancy is the lightest model a solo builder can test thoroughly.
- Hosted runners avoid the risk of fork PRs running code on a self-hosted machine.
