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
- When a learner is assigned a new version:
  - unchanged lessons (same id and hash) carry credit forward, linked to the original completion (the root, never a chain);
  - changed lessons reopen; removed lessons retire, and the earlier completion stays with its version.
- The database computes hashes and writes credit (ADR 0005). `@spindle/engine` mirrors the rules as pure functions (ADR 0006); the learner e2e test checks that both agree.

## Learner flow (apps/web)
| Route | Shows |
|---|---|
| `/gyms/<slug>/learn` | The caller's assignments in that gym, grouped by course. The newest assigned version leads and gives the single "Resume lesson"; earlier versions stay linked. |
| `/gyms/<slug>/learn/<assignment>` | One assignment's version: progress, lesson states (done, credited with its original version and date, updated, new, to do), what changed since the learner's previous version, and a caution when a cited source was retracted. |
| `/gyms/<slug>/learn/<assignment>/<lesson>` | The lesson player for all seven block kinds, with support labels, sources, the completion control and the course outline. |
| `/media/{org,content}/<path>` | Lesson media from the private `org-media` and `content-media` buckets. |

- **Reads** use the signed-in user's client, so RLS applies, and every query also names the route gym and the caller (`org_id` and `user_id`). Owners and leads can read their members' rows through RLS; the learner pages still show only the caller's own. Another member's assignment, another gym's, an unknown lesson or a malformed id is a 404.
- **Ingress:** a stored snapshot must pass `parseCourse`, match its row's layer and owner, and contain exactly the manifest's lessons. Otherwise the page says the version can't be displayed and renders none of it.
- **Completion:** the server action re-binds the gym (by slug, through RLS), the assignment (to that gym and the caller) and the lesson (to that assignment's version) before it calls the idempotent `complete_lesson` RPC. The UI says "saved" only after the server confirms, and names the version.
- **Media:** the route handler checks the session itself (the proxy skips image-like paths), maps the path to one storage object with the same grammar the renderer uses, and downloads it as the user, so Storage RLS decides. It serves only listed image, video and PDF types, with `private, no-store`, `nosniff` and a sandbox CSP. Every refusal is the same 404. The renderer only uses gym media from the gym that owns the version. No service key is used at runtime.
- **Phase 2 limits:** the quiz is an ungraded self-check and nothing about it is saved; graded quizzes and quiz completion are phase 3. Learners see retraction only: claim reviews (expiry, rejection) have no learner read policy. There is no resume pointer; "Resume" opens the first lesson not done. Diagram blocks have no assets yet and say so.

## Design system
The contract is the root `DESIGN.md` (tokens, components, motion, brand). `apps/web/src/app/globals.css` carries the same tokens for Tailwind v4. `/design` renders every learner component with synthetic data in development; production answers 404.

## Tenancy and identity
- **Identity:** Supabase Auth, with Spindle's own accounts.
- **Roles:** `owner`, `lead` and `trainer`. Only owners change roles, and the last owner can't be removed.
- **RLS:** every operation is either covered by a policy or not granted at all; a pgTAP privilege matrix asserts this. Writes to memberships and invites go only through security-definer functions that check roles. Composite foreign keys keep each child row in its parent's tenant.
- **Serialization:** membership changes lock the org row, so concurrent owner changes can't leave a gym without an owner (race test in `supabase/tests/race/`).
- **Invites:** single-use, 7-day, revocable; tokens stored as SHA-256; accepted only by an account whose confirmed email matches.
- **Service-key paths** bypass RLS, so each has its own tests.

## Client insights (not built)
Spindle ingests no cohort data until a disclosure contract exists. The contract covers:
- minimum cohort size and minimum cell size
- complementary suppression
- rules for repeated releases

Draft types live in `packages/contracts`.

## CI
GitHub-hosted `ubuntu-latest` (free for public repos) runs one required `ci` job: gitleaks, lint, typecheck, unit tests and build, then the pgTAP policy tests, the race tests and the Playwright suite against a production build. See `docs/TESTING.md`.
