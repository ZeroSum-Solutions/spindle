# ADR 0001: Licensing

- Status: accepted, 2026-10-10
- Decider: Devin Wiggins (Zero-Sum Solutions)

## Decision
- Application code: AGPL-3.0-only.
- `packages/contracts`: Apache-2.0, so other products can implement Spindle's contracts without copyleft obligations.
- Original curriculum text: CC BY-SA 4.0. Third-party material keeps its own license and is never relicensed.
- Contributors sign a CLA so Zero-Sum Solutions can relicense future versions.

## Consequences
- Anyone who runs a modified Spindle as a network service must publish their changes (AGPL section 13). AGPL does not stop others from hosting Spindle.
- Releases already published stay available under AGPL. A later license change applies only to new versions.
