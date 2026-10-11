# Shoulder lesson drafts

Provisional drafts of the base shoulder lessons. They were written before the outline review and are not publishable.

Each file holds one lesson:
- `lesson`: the lesson in the block schema (`packages/schema`). It passes the runtime lesson schema.
- `claimSlots`: one entry per science statement. Each entry has the claim text and candidate sources (DOI, PMID or nomenclature URL), checked against Crossref and PubMed. A candidate source is not a citation until the claim pipeline verifies it and the claim is approved.
- `scenarios`: ungraded discussion cases with the expected action and the relevant SAFETY.md sections.
- `originality`: the authorship and originality note.
- `reviewNotes`: open points for review.

Science blocks bind `claim-slot:` ids. These are placeholders, not approved claim records, so the publish gate rejects them until each slot is replaced by an approved claim id. Practice-based blocks bind no claims. Graded quiz candidates are the `quiz` blocks, and every one of them is science-bound.

`build_drafts.py` writes every draft file in this folder. Edit the script, not the JSON, and run it from the repo root: `python3 content/shoulder/drafts/build_drafts.py content/shoulder/drafts`. Lesson 8's tier, stop-rule and exclusion lists are parsed from `docs/curriculum/SAFETY.md`, so run the script again whenever SAFETY.md changes.
