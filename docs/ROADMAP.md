# Roadmap

Each phase ends with a check that proves it.

| # | Phase | Done when |
|---|---|---|
| 0 | Repo, licenses, docs, CI, code graph, local Supabase config | `ci` is green on `main` from a PR, gitleaks is clean, and the branch ruleset requires `ci` |
| 1 | Tenancy: orgs, roles, invites, RLS | pgTAP proves:<ul><li>org A can't select, insert, update or delete org B's rows</li><li>no self-promotion</li><li>the last owner stays</li></ul>Service-role and reassignment paths are tested too. Concurrent owner changes are serialized (race test). Global-row and storage checks are in phase 2 (D-07) |
| 2 | Content model, versioning, publish gate, lesson player, assignments, progress | The gate rejects an unrelated citation, a distorted quiz explanation, an expired claim and a retracted claim. Also:<ul><li>progress persists</li><li>a double completion counts once</li><li>published versions are immutable</li><li>credit carries forward</li><li>tenants can't write global rows, and storage paths are per-gym (D-07)</li></ul> |
| 3 | Claim pipeline and the shoulder-complex pilot (about 8 lessons) | Every science block is claim-bound, a PT signs off, and a test trainer completes the module and its quiz |
| 4 | Lead authoring of method courses | A lead publishes v1 then v2, and trainers see the "what changed" delta |
| 5 | Disclosure contract, then cohort ingestion and ranking | Tests prove complementary suppression and differencing protection; undersized cohorts keep the default ranking |
| 6+ | Spaced review, anatomy viewer, more modules, credentials, MCP server | Each gets its own plan |

## Phase 2 status
Landed: the content database and publish gate, immutable versions, assignments and progress (PR #8); runtime content schemas and the version-credit engine (PR #7). In review: the learner flow and design system, with its browser tests (`e2e/player.spec.ts`), and the storage and auth verification. Phase 2 is not complete until the combined browser and API proof passes on `main`.

Moved out of phase 2 on purpose: graded, persisted quizzes and the quiz completion rule (phase 3); expiry and rejection notices for learners (needs a learner-readable review state); a resume pointer.
