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
| `getCrossrefWork` | Crossref REST | email in User-Agent | max 3 in flight (polite pool) | Bibliographic metadata is free to reuse; no blanket license is stated for every field. [Limits](https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/) |
| `getUnpaywall` | Unpaywall v2 | `email` query param | 10 req/s and 90,000 per UTC day per process (limit is 100,000/day) | Check [Unpaywall terms](https://unpaywall.org/api) before storing more than license and OA flags. |
| `getSemanticScholarByDoi` | Semantic Scholar Graph | `x-api-key` optional | 1 req/s | [API license](https://api.semanticscholar.org/license/) restricts redistribution and requires attribution; TLDRs are model output. Review before commercial use. |
| `lookupAnatomyByUberon` | Wikidata SPARQL | User-Agent with contact | max 5 in flight | Wikidata data is CC0; Uberon itself is CC BY 4.0 and the Terminologia Anatomica identifiers are only references. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) |
| `listWgerExercises` | wger `/api/v2/exerciseinfo/` | none | 5 req/s | Most exercises are CC BY-SA 4.0. Keep `license` and `licenseAuthor` with any copy. |

Retries: 429 and 5xx are retried up to 3 times. A `Retry-After` is honored in full up to 60 s and pauses every queued request to that host; a longer pause fails with `EvidenceBudgetError`.

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
