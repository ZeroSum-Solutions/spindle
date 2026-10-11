# Decisions

Numbered owner decisions. A later decision names the one it supersedes. Hard-to-reverse technical decisions also get an ADR in `adr/`.

| # | Date | Decision | Notes |
|---|---|---|---|
| D-01 | 2026-10-10 | Spindle is a standalone product. It shares only published contracts with other products. | ADR 0002 |
| D-02 | 2026-10-10 | Public repo, AGPL-3.0-only app code, Apache-2.0 contracts, CC BY-SA 4.0 original curriculum, CLA. | ADR 0001 |
| D-03 | 2026-10-10 | Built fresh by cherry-picking: only the prototype's pure catalog and progress functions came across. | — |
| D-04 | 2026-10-10 | Curriculum: foundations from consensus references, applied claims from recent systematic reviews; not built on an existing atom library. | ADR 0003 |
| D-05 | 2026-10-10 | Free scholarly APIs (PubMed, Europe PMC, OpenAlex, Crossref, Unpaywall, Semantic Scholar, Wikidata, wger) feed the claim pipeline. | ADR 0004 |
| D-06 | 2026-10-10 | CI on GitHub-hosted runners only. Local checks run on the laptop. | ADR 0002 |
| D-07 | 2026-10-10 | Phase 1 proves tenant isolation for the tables that exist (orgs, memberships, invites). The "tenants can't write global rows" and storage-path checks move to phase 2, where the first global table (curricula) and the first bucket are created. The plan v3 phase 1 row is updated to match. | Lead decision (ordering); Sol spec review flagged the scope change |
| D-08 | 2026-10-11 | Until launch, GPT-6.1 Sol (an independent model) reviews every claim and lesson, and receipts are recorded. Phase 3 must add database enforcement that refuses stale or missing reviews for base content (planned ADR 0007, superseding the receipt rules in ADR 0005). A licensed PT reviews the whole base curriculum once before launch. Launch means the first access by real trainers outside test orgs, including pilots. The PT receipt covers exact base versions and hashes, quizzes and selected video segments; that release is frozen, and any later change to a lesson needs a new PT review of that lesson. Supersedes the human-review clause in ADR 0003 and the PT sign-off in the phase 3 row. | Owner decision. The UI never claims PT review before it exists |
| D-09 | 2026-10-11 | Coaching videos are YouTube embeds, never re-hosted: click-to-load privacy-enhanced player, embeddability checked, optional, practice-labelled, never a science source; segments rechecked before launch and every 90 days. | Owner decision; planned ADR 0007 |
| D-10 | 2026-10-11 | Spindle is the evidence-checked base layer. Gyms and coach-creators of any modality build their own method and modality courses on it; phase 4 widens authoring to coach-creators within ADR 0005's ownership boundaries. A private, owner-approved set of coaches inspires style only: their text, images, diagrams and programs are never copied; no paywalled or members-only material is used and no such site is logged into; no coach names, logos or endorsement wording appear in lesson branding; contested frameworks appear only as practice-based context. Videos come from the approved set first; any other channel needs LEAD admission and a GPT-6.1 Sol review. | Owner decision |
