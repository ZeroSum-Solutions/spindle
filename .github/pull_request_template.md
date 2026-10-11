## Why

## What users will see

## What changed
<!-- Surface area: packages, migrations, routes. -->

## Validation
- [ ] `pnpm check`
- [ ] `supabase test db` (if migrations or policies changed)
- [ ] Owner race test (if last-owner behavior changed)
- [ ] Playwright e2e (if browser/auth behavior changed)
- [ ] Red test first (for bug fixes): fails on `main`, passes here
- [ ] Cross-family review completed and findings resolved, or docs-only exemption recorded below

<!-- Give the command, result, tested SHA and shareable link or neutral private receipt reference for each applicable suite.
     pnpm check excludes database and browser tests. Mark unrun suites as unverified.
     Keep secrets, real tenant data and private local paths out of public receipts. -->

## Review receipt
<!-- LEAD fills this before ready. Merge the current base before review; any later code
     change, including a base merge, requires a fresh review of the resulting head.
     For a docs-only exemption, record the reason instead of claiming a review ran. -->
- Reviewed head SHA:
- Reviewer model and scope (standards/spec when applicable):
- BLOCK/WARN dispositions (fixed or rejected with evidence; remaining items):
- Review receipt link or private receipt reference:

## Merge danger
<!-- Door: one-way or two-way. Blast radius in one or two words. -->
