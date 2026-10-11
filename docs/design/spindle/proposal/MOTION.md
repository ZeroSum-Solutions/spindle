# Spindle motion specification and selection work

Status: proposed motion decisions for Claude Code to complete. The current specimen demonstrates state messages and basic CSS transitions. It does not contain a Lottie runtime, downloaded Lottie asset, animated logo, or the full choreography below.

## Motion language

Use the diagonal cut in the preferred wordmark as the brand cue. Keep letterforms legible throughout. Brand moments can feel deliberate and expressive; task feedback should explain the result promptly. The following durations are Spindle proposals, not measurements copied from a gallery.

| Moment | Proposed behavior | Trigger and duration | Reduced-motion fallback |
|---|---|---|---|
| Logo reveal | Reveal the finished wordmark with a narrow diagonal mask aligned to the d cut; keep l solid | Once on public brand cover, 560ms; never delay app access | Finished static SVG immediately |
| Successful save | Small check draws beside the confirmed result; no confetti for an ordinary save | Only after server confirmation, about 320ms, play once | Static check and same text immediately |
| Module completion | One restrained accent ring/check with version-specific completion text | Confirmed completion of assigned version, at most 650ms, once per response | Static completion icon and literal text |
| Save pending | Stable button width, disabled double-submit, explicit Saving label | Start immediately; spinner only while request is pending | Static pending icon and label |
| Save failed | Inline message with Retry; preserve input and reading position | On actual failure, 120ms opacity; no shake | Immediate message |
| Source disclosure | Small chevron rotation; content opens without moving keyboard focus | User action, 180ms; long reading content should not slide through viewport | Immediate open/close |
| Mobile outline | Short opacity/translation reveal, return focus to trigger when closed | User action, 240ms maximum | Immediate reveal and same focus behavior |
| Onboarding/settings panel | Small directional transition to preserve step relationship | User action, 180ms; no lesson-text morphing | Immediate panel swap |

Use ease-out `cubic-bezier(.2,.8,.2,1)` for entry and `cubic-bezier(.4,0,1,1)` for exit. Keep hover/focus feedback at 120ms. These are proposed tokens to reconcile with the existing contract. Do not use motion to invent real progress or imply an approved scientific claim.

## Specific sources and decisions

- [Success check by Lan Jean](https://lottiefiles.com/free-animation/success-check-wJKVBD0ZMK): asset page inspected; candidate for save confirmation. It names an original by Andrew Vilchez. Claude must inspect actual playback and recolor to the chosen brand before deciding. Current status: not downloaded, installed or playback-tested.
- [LottieFiles download guide](https://help.lottiefiles.com/discovering-downloading-and-uploading-animations): use the asset page and workspace flow. A login may be required. Use the project-approved account workflow if sign-in is required.
- [LottieFiles licensing guide](https://help.lottiefiles.com/animation-licensing-basics-): verify the actual asset license at selection time. Record creator, asset URL, chosen format, license URL, download date and any modifications. Do not distribute third-party animation source files as a standalone library in this bundle.
- [Transition Panel](https://motion-primitives.com/docs/transition-panel): documentation reviewed; candidate for onboarding/settings. Inspect code and actual keyboard/focus behavior before choosing. Avoid adding a dependency for a transition CSS can provide adequately.
- [Motion accessibility](https://motion.dev/docs/react-accessibility): use the user's reduced-motion preference. A global Motion setting does not automatically control a separate Lottie player; explicitly stop it and show a static final frame.
- [Transitions](https://transitions.dev), [60fps](https://60fps.design), [Kinetics](https://kinetics.colorion.co): homepage-level research only. Claude should choose and inspect concrete examples for the brand reveal and completion moment, then record detail links. Do not mark these as rendered references yet.

## Work Claude must finish

1. Preview the specific Lottie success candidate. Compare it with a custom SVG check and choose one. Record a visual reason, file bytes, dependency cost and license. A custom SVG may fit the wordmark better.
2. Build a replayable motion board with logo reveal, confirmed save, module completion, pending, failure/retry and source disclosure. Show normal and reduced-motion versions. Keep demo states labelled until connected to real responses.
3. Check the wordmark at 120px, 160px and 240px wide in both themes and at 2x display scale. The slash must remain on d; l must never become a second i. Choose a separate favicon treatment instead of forcing the whole wordmark into 16px.
4. Verify play-once behavior, route changes, repeat submissions, keyboard focus, screen-reader announcements, reduced motion, slow/failed asset loading, no layout jump, and mobile performance. Keep the message available if the animation fails.
5. Use a stable local project asset or permanent delivery URL. Do not commit expiring preview URLs. Get independent visual review and incorporate verified findings before the system is called complete.
