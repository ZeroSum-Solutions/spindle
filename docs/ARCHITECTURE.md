# Architecture

## Curriculum layers
| Layer | Owner | Visibility | Support |
|---|---|---|---|
| base | Spindle | all tenants, read-only | science (claim-bound), reviewed by a physical therapist |
| modality | Spindle | all tenants, read-only | science where evidence exists, otherwise practice-based |
| method | a tenant (gym) | that tenant only | practice-based |

Global rows have `org_id = null` and can only be written by the content-publisher path.

## Evidence
- **Foundations** (structure and function) come from consensus references: textbooks (edition and page), position stands (DOI) and nomenclature (Uberon, Terminologia Anatomica).
- **Applied claims** come from recent systematic reviews and meta-analyses.
- **Claim records** hold:
  - the claim
  - sources
  - evidence level
  - population
  - a verification receipt (the source exists, and the claim is faithful to it)
  - reviewer
  - expiry
  - retraction status
- **Publishing** requires every science block, quiz explanations included, to bind approved claims that are unexpired and not retracted.

## Versioning
- Publishing freezes the whole tree (parts, lessons, blocks, claim bindings) into an immutable `curriculum_version` with a content hash.
- Assignments and progress point at a version.
- When a new version is published:
  - unchanged lessons (same hash) carry credit forward;
  - changed lessons are re-assigned.

## Tenancy and identity
- **Identity:** Supabase Auth, with Spindle's own accounts.
- **Roles:** `owner`, `lead` and `trainer`. Only owners change roles, and the last owner can't be removed.
- **RLS:** every operation is covered. Composite foreign keys keep each child row in its parent's tenant.
- **Service-key paths** bypass RLS, so each has its own tests.

## Client insights (not built)
Spindle ingests no cohort data until a disclosure contract exists. The contract covers:
- minimum cohort size and minimum cell size
- complementary suppression
- rules for repeated releases

Draft types live in `packages/contracts`.

## CI
GitHub-hosted `ubuntu-latest` (free for public repos) runs one required `ci` job: gitleaks, lint, typecheck, unit tests and build. Database policy tests join it in phase 1.
