# ADR 0003: Curriculum evidence model

- Status: accepted, 2026-10-10

## Decision
- **Foundations** are written fresh from consensus references (textbooks, position stands, nomenclature).
- **Applied claims** come from recent systematic reviews and meta-analyses.
- **Claim records** carry a verification receipt, a reviewer, an expiry and retraction status.
- **Binding:** science blocks must bind approved claims; practice-based blocks must not.
- **Drafting with AI** happens only on the founder's machine. It writes into Spindle's own block schema, and a human reviews every draft. OpenMAIC's generation package is optional and is compared against direct drafting before it is adopted.
- **The pre-existing evidence-atom library is not the backbone.** Its atoms are intervention-outcome findings for client plans. Individual atoms may be imported as candidate claims and go through the same review.
