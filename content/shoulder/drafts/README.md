# Shoulder lesson drafts

Provisional drafts of the base shoulder lessons. They were written before the outline review and are not publishable.

Each file holds one lesson:
- `lesson`: the lesson in the block schema (`packages/schema`). It passes the runtime lesson schema.
- `claimSlots`: one entry per science statement. Each entry has the claim text and candidate sources (DOI, PMID or nomenclature URL), checked against Crossref and PubMed. A candidate source is not a citation until the claim pipeline verifies it and the claim is approved.
- `scenarios`: ungraded discussion cases with the expected action and the relevant SAFETY.md sections.
- `originality`: the authorship and originality note.
- `reviewNotes`: open points for review.

Science blocks bind `claim-slot:` ids. These are placeholders, not approved claim records, so the publish gate rejects them until each slot is replaced by an approved claim id. Practice-based blocks bind no claims. Graded quiz candidates are the `quiz` blocks, and every one of them is science-bound.

`build_drafts.py` writes every draft file in this folder. Edit the script, not the JSON, and run it from the repo root: `python3 content/shoulder/drafts/build_drafts.py content/shoulder/drafts`.

- Lessons 4 and 8 take their referral tiers, stop rules and exclusions from `docs/curriculum/SAFETY.md`, so run the script again whenever SAFETY.md changes. Each table is read only up to the next heading, and every line of the table must be a pipe-delimited row; a missing heading, a malformed table or a row without its pipes stops the build.
- Every lesson is rendered and checked before anything is written (science blocks bind claim slots, practice blocks bind none, every slot is used, every graded quiz is science, and every source has an identifier and a rights record). Writing is all or nothing: new contents go to temporary files first, and if any replacement fails, files already replaced are restored and temporary files are removed.
- Every candidate source records its rights: a licence with its URI, or an explicit rights-reserved or unresolved status. Spindle cites and paraphrases facts; it reproduces no source text.
