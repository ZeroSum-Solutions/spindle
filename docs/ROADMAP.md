# Roadmap

Each phase ends with a check that proves it.

| # | Phase | Done when |
|---|---|---|
| 0 | Repo, licenses, docs, CI, code graph, local Supabase config | `ci` is green on `main` from a PR, gitleaks is clean, and the branch ruleset requires `ci` |
| 1 | Tenancy: orgs, roles, invites, RLS | pgTAP proves:<ul><li>org A can't select, insert, update or delete org B's rows</li><li>no self-promotion</li><li>the last owner stays</li></ul>Service-role and reassignment paths are tested too. Global-row and storage policies are tested in phase 2, when the first global table and bucket exist |
| 2 | Content model, versioning, publish gate, lesson player, assignments, progress | The gate rejects an unrelated citation, a distorted quiz explanation, an expired claim and a retracted claim. Also:<ul><li>progress persists</li><li>a double completion counts once</li><li>published versions are immutable</li><li>credit carries forward</li></ul> |
| 3 | Claim pipeline and the shoulder-complex pilot (about 8 lessons) | Every science block is claim-bound, a PT signs off, and a test trainer completes the module and its quiz |
| 4 | Lead authoring of method courses | A lead publishes v1 then v2, and trainers see the "what changed" delta |
| 5 | Disclosure contract, then cohort ingestion and ranking | Tests prove complementary suppression and differencing protection; undersized cohorts keep the default ranking |
| 6+ | Spaced review, anatomy viewer, more modules, credentials, MCP server | Each gets its own plan |
