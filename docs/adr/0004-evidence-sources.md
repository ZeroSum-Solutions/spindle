# ADR 0004: Evidence sources and verification receipts

- Status: accepted, 2026-10-10
- Builds on: ADR 0003 (curriculum evidence model)

## Context
Claim records need a verification receipt (exists, retraction status, license) and a way to find candidate reviews. We want free sources, no paid scraping, and no dependence on one vendor.

## Decision
- A new package, `packages/evidence`, holds typed, zod-validated clients for: PubMed E-utilities, Europe PMC, OpenAlex, Crossref, Unpaywall, Semantic Scholar, Wikidata (Uberon to TA98/TA2) and wger.
- All calls go through one `fetchJson`: identifying User-Agent with a contact email (`SPINDLE_CONTACT_EMAIL`), timeout, retry with backoff on 429/5xx, and a per-host rate limiter. The email and keys come from the environment only.
- `verifySource(doi)` merges Crossref, OpenAlex and Unpaywall into a `SourceCheck`. `verified` needs matching Crossref and OpenAlex records with an explicit retraction flag and no service error; a failed or mismatched service gives `unverified`, a retraction or withdrawal gives `flagged`.
- Clients return small normalized types, not raw payloads. Stored receipts record `checkedAt`, so staleness is visible.
- Tests use recorded fixtures. CI never touches the network. A manual smoke script checks the live APIs.

## Consequences
- Retraction detection uses two independent sources (Crossref notices, OpenAlex flag). Neither is complete; the claim expiry in ADR 0003 forces re-checks.
- wger data is CC BY-SA 4.0 and stays attributed in `NOTICE`. Wikidata and OpenAlex data are CC0; Uberon is CC BY 4.0; other sources follow their own terms (package README).
- Abstracts from PubMed or Europe PMC may be copyrighted. The clients truncate them, fixtures use synthetic text, and the curriculum never republishes them.
- Adding a source means a new client file and fixture, not a new pattern. Dropping one changes `verifySource` only if it is Crossref, OpenAlex or Unpaywall.
- This is a two-way door: the package has no consumers yet.

## Amendment, 2026-10-11: publication metadata and source-type overrides (D-12)
- Every evidence entry carries the publication `year` and `journal` from the PubMed (or Europe PMC MED) record next to its title, so a claim may cite a year that the reviewer can see. A paper without a year is blocked at ingest.
- A publisher may record a **source-type override**. It is stored in `source_kind_overrides` with the document type, the publisher's justification (at least 40 characters), the PubMed publication types it overrides and who recorded it. It is audited and cannot be changed. There are two cases:
  - A guideline, position stand, consensus statement or care pathway that PubMed mislabels (for example, the ACSM 2026 position stand tagged "Review", or the BESS 2025 pathway tagged "Journal Article") is admitted as a `position_stand`.
  - An open (CC BY, CC0 or public-domain) anatomy or nomenclature reference, such as an open narrative anatomy review, is admitted as a `foundation_reference`. Plan v3 section 4 says foundations come from consensus references. Only claims created with `domain: "foundation"` may cite one. The database refuses any other claim–source link for every writer, and a claim's domain cannot change. Applied claims (effects, risks, treatments) still need a systematic review, meta-analysis, position stand or guideline.
- An override is refused for any other kind and for any record whose publication types name a study or a notice (trial, cohort, case report, letter, retraction, …).
- Overrides do not bypass review. The evidence entry shows the override, and the recorder refuses evidence that hides an override the database holds. Sol checks that an overridden source reads as the stated document type, and that a foundation claim states anatomy or nomenclature rather than an effect. A foundation claim's hash covers its domain; applied claims keep their earlier hashes.
