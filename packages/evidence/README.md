# @spindle/evidence

Typed, zod-validated clients for free scholarly and reference APIs. Spindle uses them to build and verify curriculum claim records. Every response is validated at the boundary and returned as a small normalized type.

License: AGPL-3.0-only (code). Data returned by each API keeps its own license; see below.

## Setup

```ts
import { createContext, verifySource } from "@spindle/evidence";

const ctx = createContext(); // reads SPINDLE_CONTACT_EMAIL, NCBI_API_KEY, S2_API_KEY
const receipt = await verifySource(ctx, "10.1177/0269215520934147");
```

Environment (see `.env.example`):

| Variable | Needed by | Notes |
|---|---|---|
| `SPINDLE_CONTACT_EMAIL` | Crossref, OpenAlex, Unpaywall, Wikidata, `verifySource` | Sent as `mailto`. Clients throw if it is missing. |
| `NCBI_API_KEY` | PubMed (optional) | 10 req/s instead of 3. |
| `S2_API_KEY` | Semantic Scholar (optional) | Sent as `x-api-key`. |

`fetchJson` sends `User-Agent: Spindle/0.1 (+https://github.com/ZeroSum-Solutions/spindle; mailto:<email>)`, times out after 20 s, retries 429 and 5xx (up to 3 times, honoring `Retry-After`), and spaces calls per host. Pass `fetch` to `createContext` to stub the network.

## APIs

| Client | Endpoint | Auth | Limits we apply | Data license and terms |
|---|---|---|---|---|
| `searchPubMed`, `getPubMedSummaries` | NCBI E-utilities | `tool` + `email` always sent; `NCBI_API_KEY` optional | 3 req/s (10 with a key) | Metadata is public. Abstracts may be copyrighted: do not republish. [NCBI policies](https://www.ncbi.nlm.nih.gov/home/about/policies/) |
| `searchEuropePmc`, `getEuropePmcByDoi` | Europe PMC REST | none | 10 req/s | Metadata is free to query. Abstracts and full text follow each article's license (see `oa.license`); do not republish. [Terms](https://europepmc.org/help) |
| `searchOpenAlex`, `getOpenAlexByDoi` | OpenAlex works | `mailto` | 10 req/s; OpenAlex now meters usage by budget; its budget headers are not read yet, so keep batches small | Data is CC0. [Docs](https://help.openalex.org/api/authentication/) |
| `getCrossrefWork` | Crossref REST | email in User-Agent | serial queue, 100 ms spacing | Bibliographic metadata is free to reuse; no blanket license is stated for every field. [Limits](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/) |
| `getUnpaywall` | Unpaywall v2 | `email` query param | 10 req/s and 90,000 per UTC day per process (limit is 100,000/day) | Check [Unpaywall terms](https://unpaywall.org/api) before storing more than license and OA flags. |
| `getSemanticScholarByDoi` | Semantic Scholar Graph | `x-api-key` optional | 1 req/s | [API license](https://api.semanticscholar.org/license/) restricts redistribution and requires attribution; TLDRs are model output. Review before commercial use. |
| `lookupAnatomyByUberon` | Wikidata SPARQL | User-Agent with contact | serial queue, 250 ms spacing | Wikidata data is CC0; Uberon itself is CC BY 4.0 and the Terminologia Anatomica identifiers are only references. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) |
| `listWgerExercises` | wger `/api/v2/exerciseinfo/` | none | 5 req/s | Most exercises are CC BY-SA 4.0. Keep `license` and `licenseAuthor` with any copy. |

Rate limiting: each host has one serial FIFO queue, so at most one request per host is in flight (Spindle's volume is low, so throughput does not matter). Before every send the client waits for the later of the minimum spacing and any provider pause. Retries keep their turn at the front of the same queue, so spacing holds for them too. Because we never exceed one in-flight request, the Crossref (3) and WDQS (5) concurrency limits are not used.

Retries: 429, 5xx and transport or body timeouts are retried up to 3 times. A `Retry-After` is honored in full up to 60 s and delays the next send to that host; a longer pause fails with `EvidenceBudgetError`.

## Verification receipt

`verifySource(ctx, doi)` combines Crossref (exists, title, retraction notices), OpenAlex (`is_retracted`) and Unpaywall (license) into one `SourceCheck`:

- `verified`: Crossref and OpenAlex each returned a record for exactly the requested DOI, OpenAlex gave an explicit `is_retracted`, and no service (Unpaywall included) errored.
- `flagged`: a matching record says retracted or withdrawn, or the DOI is itself a retraction notice. Always wins.
- `unverified`: anything else. A failed or mismatched service is never clean; see `issues`. A DOI Unpaywall does not know gives `licenseStatus: "unknown"` plus an issue, not an error.

Issues are sanitized: no contact email or key is ever stored.

## Tests and fixtures

`pnpm test` (repo root) runs the unit tests against recorded JSON in `src/__fixtures__/`. CI never calls the network.

- Fixtures hold metadata only. Abstract and TLDR fields are synthetic (`SYNTHETIC ABSTRACT FOR TESTS`).
- Re-record fixtures by hand: `SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence record`. The script trims payloads to the fields the clients read and replaces abstracts and TLDRs with synthetic placeholder text, so no publisher or model prose is redistributed.
- Live check: `SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence smoke` prints one line per API.

## Claim pipeline (phase 3, ADR 0007)

Everything here fails closed. A step that cannot prove its result records nothing, and the database checks every receipt again. No step runs in CI. CI tests the pure parts with stubbed networks and a fake reviewer.

| Script (`pnpm --filter @spindle/evidence exec tsx scripts/<name>.ts`) | Does | Exit |
|---|---|---|
| `ingest.ts --pmid <id> \| --doi <doi> [--add-source] [--kind-override <type> --justification <text>]` | Builds an `IngestedPaper` from PubMed metadata, the full abstract of the matching PubMed record (Europe PMC's MED copy, else Crossref's deposit) and `verifySource`. It is `ready` only when identifiers match, the abstract is complete, the publication type is a systematic review, meta-analysis or guideline, and the source is verified as not retracted. Unknown is never "not retracted". `--add-source` calls `publisher_add_source`, or reuses the existing source with that DOI and refreshes its private evidence entry. Evidence must match the source's DOI, PMID, kind and override, both when the packet is built and when receipts are recorded. Entries carry the record's year and journal; a paper with no year is blocked. D-12: `--kind-override position_stand\|clinical_guideline\|consensus_statement\|care_pathway` admits a guidance document PubMed mislabels as a position stand. `--kind-override anatomy_reference\|nomenclature_reference` admits an openly licensed reference as a `foundation_reference`, which only `domain: "foundation"` claims may cite. Both need `--justification`, are refused for study or notice types, and are stored and audited. | 0 ready, 1 blocked |
| `review.ts --claims <ids> \| --course <id> --safety <SAFETY.md> [--dry-run]` | Builds a bounded packet (`assertPacket`: at most 80 items and 400 KB, evidence checked within 30 days) from `publisher_claim_target` / `publisher_review_targets` and runs the reviewer. The reviewer is `codex exec` with GPT-6.1 Sol at xhigh, given an allowlisted environment with no credentials, an empty working directory, a read-only sandbox, no user config, the packet as fenced data and an output schema. The answer must name every item exactly once with a valid verdict, model, session and packet digest (`parseReviewResult`). Writes packet, prompt and outcome; records nothing. | 0 valid, 1 not approved |
| `record-review.ts --dir <review dir>` | The trusted step. Checks that the outcome belongs to this exact packet, then records every receipt in one transaction as `SPINDLE_PUBLISHER_ID`. A stale hash anywhere means nothing is recorded. | 0 recorded, 1 refused |
| `media.ts admit\|recheck\|refresh\|retire` | Practice-media registry upkeep. Admission needs an oEmbed 200 (401/403 means embedding is off; 404 means missing; anything else is an error). A failed recheck records a failed check and disables the clip. Metadata older than 25 days is refreshed; retiring deletes it. | 0 ok, 1 failure or disable |
| `publish.ts --course <id>` | The founder publishing entry point. It rechecks every source the global course cites with `verifySource` (plan section 7: retraction status is rechecked before every publish) and records any retraction. It refuses while any cited paper is retracted, unknown or has no DOI; textbooks and nomenclature have no retraction status. Only then does it call `publisher_publish_course`. | 0 published, 1 refused |
| `retraction-recheck.ts [--dry-run]` | Monthly. Runs `verifySource` for every cited DOI source, records retractions (flagging published versions) and reports unknowns. | 0 all verified, 1 otherwise |

Environment:
- `SPINDLE_DB_URL` must be a loopback database. `:54322` (the shared local stack) is refused unless the lead sets `SPINDLE_ALLOW_SHARED_DB=1` after migration admission.
- `SPINDLE_PUBLISHER_ID` is a row in `private.content_publishers`.
- `SPINDLE_EVIDENCE_DIR` and `SPINDLE_REVIEW_DIR` must be absolute paths outside the repository. Abstracts, packets and raw answers are private and copyrighted, and never committed.
- `SPINDLE_CONTACT_EMAIL` is required, as above.

Video segments (D-11): `codex exec` takes text and still images only, and Gemini on the `agy` subscription lane has no native video input. The approved route is the metered Gemini API, whose native YouTube input lets a describer report a segment's speech and demonstration.

`segment-review.ts --media <id> --safety <SAFETY.md>` checks that the clip is active and embedded by a global lesson. Under the lock `SPINDLE_REVIEW_DIR/gemini-spend.jsonl.lock` it refuses a clip described or sent in the last 90 days and a call that could pass the $5-per-month cap, then reserves the call's upper bound in the private ledger `SPINDLE_REVIEW_DIR/gemini-spend.jsonl`. `gemini-3.8-flash` describes the segment plus 15 s of context, and the reservation is settled with the reported cost (an unknown cost keeps the full bound). A lock file left by a crashed run blocks every call until someone removes it. Then:
- A describer failure records nothing.
- Uncertain content records a failed segment check.
- Otherwise Sol reviews the description, lessons and SAFETY.md, and `record-review.ts` records Sol's run with the describer run and the lessons' hashes.

After a lesson that embeds the clip changes, `--reuse <earlier packet dir>` sends the same description (if under 90 days old) to Sol with the current lessons, without a describer call.

The key comes from `GEMINI_API_KEY` or `GOOGLE_API_KEY`, travels only in a request header and is never printed.
