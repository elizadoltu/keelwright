# Step: `gaps`

`/adopt` create mode (spec 5.2.1): close the tooling gaps found by `analyse` — for each, show the fix as a diff using the project's existing tools, and apply it only when the user approves it, one by one.

**Reads:** `.keelwright/analysis.md` (Gaps), `.keelwright/stack-packs/*.md`.
**Produces:** the approved fixes; `.keelwright/gaps.md` (applied and declined, so `generate` doesn't refer to declined ones).
**Gate:** none — every fix is approved on its own.

Not implemented yet (Phase 2, build step 4).
