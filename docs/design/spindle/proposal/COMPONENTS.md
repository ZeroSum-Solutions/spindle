# Spindle component plan

Proposed Atlas system. This is an implementation map, not copied component source.

| Product pattern | Foundation | Required states and behavior |
|---|---|---|
| CourseRow / LessonOutline | Semantic list + button/link; Sheet for mobile | Ordered lessons; title, duration, format; current item; literal completed state; same sequence on phone; restore focus on drawer close |
| ResumeLesson | Card + Button | Assigned lesson, no assignment, loading, unavailable, retry; one primary task |
| SupportLabel | Badge + text | Science or Practice-based from block; not inferred from citations, color, course layer or completion |
| EvidenceLevel | Badge / text | Source-approved value; absent and loading explicitly different; no invented score |
| ClaimDisclosure | Accordion or native details | Claim, source, DOI/PMID, population, evidence level, verification receipt, reviewer/approval date, expiry, retraction where present; retry on failure; maintain reading position |
| VersionNotice | Alert + link | Current assignment; previous completion; unchanged credit; changed lesson assignment; retired review item |
| QuizOption | RadioGroup + Button + Alert | Unanswered, selected, submitting, feedback after response, save failed; cited explanation; no success before confirmation |
| CompletionReceipt | Alert | Saving, confirmed with curriculum version, failed with retry; do not create a new curriculum version on completion |
| AssignmentRow | Table or stacked semantic rows | Assigned, no assignment, unavailable, pending; suppressed is unknown, not zero; gym context visible |
| InviteStatus | Badge + Alert | Link created, delivery confirmed, acceptance pending, accepted, expired, failed; created does not mean sent |
| Method editor | Form + Input/Textarea + Alert | Practice-based only; dirty, saving, saved, validation error; preserve values on failure |
| Access denied | Alert + safe navigation | Do not disclose another gym's method or member names |

Use the shadcn primitives already in Spindle. Radix handles composite interaction where needed. Lucide is the sole icon family. A library choice does not replace keyboard, focus, contrast or touch checks.

21st.dev metadata candidates: 19143 simple onboarding progress, 29801 stepper, 973 motion accordion, 28550 segmented pill. Animated stepper 28558 and registration stepper 8864 are references only. No paid source was retrieved. Check the exact per-item license and dependency chain before adopting code. Do not add a general animation dependency to replace one native disclosure.

The included HTML uses native details, radio inputs, buttons and labels. It demonstrates local quiz, completion outcomes, outline and theme comparison. It does not implement auth, tenancy, claims, actual progress, publishing or content approval.

## Motion and accessibility acceptance

- Feedback 120ms, disclosure 180ms, drawer 240ms; cubic-bezier(.2,.8,.2,1).
- Reduced motion removes animation and transitions; all state changes remain visible.
- Visible 3px cobalt focus with 4px offset; adapt dark exploration to a visible mint focus if used later.
- Main actions 48px high; every touch target at least 44×44px.
- Text contrast 4.5:1; boundaries/focus 3:1. Pale dividers are not control outlines.
- One column below 768px; course outline drawer below 1024px in the app.
- Reading text 18px/1.65, maximum 68ch. Source details remain at least 16px.
- Figures remain near their explanatory text on phones. Licensed/PT-reviewed anatomy only.
- Test keyboard-only, 320px reflow and 200% text zoom on the integrated app. Prototype checks do not prove those flows.
