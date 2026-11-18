# Step: `research`

Gather current, sourced conventions for every technology in the chosen stack — one **stack pack** per technology — so the generator builds rules, skills and hooks from researched practice instead of fixed templates.

**In /adopt:** not implemented yet (Phase 2, build step 3). The rest of this file is the `/kickoff` step.

**Reads:** the state (`STATE status --json`: `stack.layers`, `stack.versions`, `projectType`), `docs/prd.md` (technical constraints), the ADRs, `docs/architecture/overview.md` if it exists (conventions), the stack rules for the project type (`<plugin root>/reference/<type>-stack.md`, "Stack packs": pack ids), `<plugin root>/steps/research-pack.md`, `<plugin root>/templates/stack-pack.md`. On a re-run: the existing `.keelwright/stack-packs/`.
**Produces:** `.keelwright/stack-packs/<id>.md`, one per technology; `stack.packs` in the state.
**Gate:** Gate 3 — the user reviews the packs before anything is generated from them.

`PACKS` below means `node "<plugin root>/scripts/packs.mjs"` (run in the project root).

## 1. Choose the packs

One pack per technology the generated rules must cover: the framework or engine, a backend framework, the data layer, styling, unit and E2E testing, language tooling (types, lint, format), hosting, deploy or distribution, git hooks — and for AI projects the model provider's SDK and the eval framework. A service used through a single SDK call (an email API, an anti-spam check) doesn't need a pack — its usage belongs in the architecture overview.

Use the pack ids in the type's stack rules (and `reference/web-stack.md` for the shared web technologies) for the technologies listed there. For anything else, the id is the technology's name as a lowercase slug, and its packages are the packages the project installs for it from its registry (npm, PyPI, pub.dev, crates.io), primary package first — the key it has in `stack.versions`, so the pack's major version can be compared. Git hooks: `git-hooks` for Node.js projects (Husky), `pre-commit` for the others.

Leave out technologies the stack removed (e.g. no `express` pack when there is no custom backend).

## 2. Reuse or research

Run `PACKS plan <id>... ` — add `--refresh` when the user ran `/kickoff research --refresh`. For each pack it says `reuse` or `research`, and why (no pack yet, older than 90 days, researched for another major version, invalid, refresh requested).

- **Reuse:** `PACKS install <ids to reuse>` copies them into `.keelwright/stack-packs/`.
- **Research:** for each, follow `steps/research-pack.md` with the pack's id, name, packages, the resolved version from `stack.versions`, and the output file `.keelwright/stack-packs/<id>.md`. If you can delegate to subagents, research the packs in parallel, one subagent per pack, each given that procedure and its inputs.

Tell the user in one line per pack what happens and why, before researching — research takes a few minutes per pack.

## 3. Check the selection rules

When the main framework's or engine's pack was **researched** in this run (not reused), compare what the research found with the claims in the type's stack rules (`reference/<type>-stack.md`: the candidates, defaults and guard rules; for web, `reference/web-stack.md` "Frontend selection rules") for that technology — e.g. rendering modes, per-route SSR, static export limits, hosting adapters. List every contradiction or outdated claim for the gate summary, with the source. Don't edit the plugin's files; the user decides whether to report it.

## 4. Check the packs

1. `PACKS validate .keelwright/stack-packs/*.md` — fix every issue and run again until it passes (count each failed run with `STATE metric research validate-failures +1`).
2. Read each pack's rules against the project: a rule that contradicts an accepted ADR (e.g. a pack recommends SSR where the project chose static output) is not deleted — mark it in the gate summary as "not applicable to this project, see ADR-NNNN".
3. Record the packs: `STATE set stack '{"packs": {"<id>": "<researchedAt>", …}}'`, and count them: `STATE metric research packs-researched <n>` and `STATE metric research packs-reused <n>`.

## 5. Finish

`STATE complete research .keelwright/stack-packs/<id>.md …` (list the files).

## Gate summary

Show, besides the generic gate content:
- one line per pack: reused (with its research date) or researched, and the number of rules;
- the rules that will be **enforced** mechanically (lint, types, hook, ci, config) — these become hooks and CI checks in the `generate` step;
- rules not applicable to this project because of an ADR;
- contradictions found in the selection rules (step 3), if any.

The user can edit any pack: drop a rule, change one, add their own. The edited packs are what `generate` uses.

## On approval

- Set `status: reviewed` in each pack in `.keelwright/stack-packs/`.
- For each pack **researched in this run**, save it to the user's cache so other projects can reuse it: `PACKS save .keelwright/stack-packs/<id>.md`. Don't save reused packs the user edited for this project only — ask first whether the edits should apply to other projects too.
