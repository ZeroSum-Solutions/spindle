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

| Client | Endpoint | Auth | Limit we apply | Terms |
|---|---|---|---|---|
| `searchPubMed`, `getPubMedSummaries` | NCBI E-utilities | none; `NCBI_API_KEY` optional | 340 ms between calls (3/s); 110 ms with a key | Metadata is public. Abstracts may be copyrighted: do not republish them. [NCBI policies](https://www.ncbi.nlm.nih.gov/home/about/policies/) |
| `searchEuropePmc`, `getEuropePmcByDoi` | Europe PMC REST | none | 100 ms | Metadata is free. Full text and abstracts follow each article's license (returned in `oa.license`). |
| `searchOpenAlex`, `getOpenAlexByDoi` | OpenAlex works | none; `mailto` for the polite pool | 100 ms | Data is CC0. |
| `getCrossrefWork` | Crossref REST | none; email in User-Agent | 100 ms | Metadata is free to reuse. Include a contact in the User-Agent. |
| `getUnpaywall` | Unpaywall v2 | `email` query param | 100 ms (limit is 100k/day) | Data is CC0. Respect the daily limit. |
| `getSemanticScholarByDoi` | Semantic Scholar Graph | `x-api-key` optional | 1000 ms (1/s) | [API license](https://www.semanticscholar.org/product/api/license): attribute, no bulk redistribution. TLDRs are model output. |
| `lookupAnatomyByUberon` | Wikidata SPARQL | none; User-Agent with contact | 250 ms | Data is CC0. [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy). Keep queries small. |
| `listWgerExercises` | wger `/api/v2/exerciseinfo/` | none | 200 ms | Most exercises are CC BY-SA 4.0. Keep `license` and `licenseAuthor` with any copy, and credit wger. |

## Verification receipt

`verifySource(ctx, doi)` combines Crossref (exists, title, retraction notices), OpenAlex (`is_retracted`) and Unpaywall (license) into one `SourceCheck`:

- `verified`: Crossref and OpenAlex answered, DOI exists, no retraction found.
- `flagged`: a retraction was found, or the DOI is itself a retraction notice.
- `unverified`: a service failed or the DOI was not found. A failure is never reported as clean; see `issues`.

## Tests and fixtures

`pnpm test` (repo root) runs the unit tests against recorded JSON in `src/__fixtures__/`. CI never calls the network.

- Re-record fixtures by hand: `SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence record`. The script trims payloads to the fields the clients read and cuts abstracts to 300 characters.
- Live check: `SPINDLE_CONTACT_EMAIL=you@example.org pnpm --filter @spindle/evidence smoke` prints one line per API.
