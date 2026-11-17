# Evaluation suite

Measures how well `/keelwright:kickoff` does on fixed project descriptions, so changes to steps, templates or rules can be compared and regressions are caught (spec section 8.3).

Each run starts a real headless Claude Code session with this plugin in a temporary folder outside the repository, answers the interview from the case, approves gates up to the case's stop gate, and grades what was produced. **Runs cost money** — see "Cost" below.

## Running it

```bash
node evals/run.mjs                                   # every case, 3 runs each
node evals/run.mjs --case personal-website --runs 1  # one case, one run
node evals/run.mjs --stop-at 1 --runs 1              # cheap smoke run: every case to gate 1
node evals/run.mjs --help                            # all options
```

Results go to `evals/results/<timestamp>/` (ignored by git): `summary.md`, `summary.json`, and per run the generated `docs/`, `design/`, `.keelwright/` and `run.json` (calls, cost, every grade).

Exit codes: `0` every grader at or above the threshold (default 67%), `1` below it, `2` stopped by the cost limit (default $30).

## Cases

| Case | What it exercises | Stops at |
|---|---|---|
| `personal-website` | Content-first site with two audiences, a blog and one form → Astro (rule 1), no backend server or database, i18n, stack packs chosen to match | Gate 3 |
| `freelancer-invoicing` | Public marketing pages + logged-in app with stored data → TanStack Start (rule 3), database, ERD | Gate 2 |
| `support-dashboard` | Entirely behind a login, reads an existing API → TanStack Start SPA mode (rule 5), nothing stored | Gate 1 |
| `habit-tracker-mobile` | iOS + Android, offline with sync, TypeScript team → Expo (mobile rule 3), `node`, offline / sync ADR, screen flow, store checklist | Gate 2 |
| `roguelite-game` | Solo 2D PC game, local saves, no royalties → Godot (game rule 4), `godot`, GDD and asset pipeline, no ERD | Gate 2 |
| `support-assistant-ai` | Retrieval + tools with a human-approved refund, EU personal data, Python team → Python (AI rule 2), `python`, provider ADR, AI system design, eval plan with cost and latency budgets | Gate 2 |
| `csv-validator-cli` | Single-binary CLI for CI pipelines → Rust (library rule 2), `rust`, API surface, no UI or data documents | Gate 2 |

A case is a folder in `cases/` with:
- `input.md` — the project description passed to `/keelwright:kickoff`.
- `case.json` — `stopAtGate`, the `answers` sent when the interview asks (in order; after the last one the runner says "decide later"), `expect` (project type, the main stack decision and its rule — `primary`, toolchain, documents that must and mustn't be in the set, ADRs that must exist as title patterns, minimum interview questions) and the `judges` to run.

## Graders

| Grader | Type | Passes when |
|---|---|---|
| `reached-gate` | code | The run is waiting at the case's stop gate |
| `project-type`, `primary`, `toolchain` | code | The state records the expected type, main decision (framework, engine, language) with its rule, and toolchain |
| `adrs` | code | An ADR matches each expected pattern (e.g. the offline / sync decision of a mobile app) |
| `documents-include`, `documents-exclude` | code | The document set contains / leaves out the expected keys |
| `documents-written` | code | Every listed document whose step ran exists |
| `packs` | code | The research step chose the expected stack packs and left out the unexpected ones |
| `interview-asked` | code | The interview asked at least the expected number of questions (from the step's `questions` metric) |
| `doccheck` | code | Every generated document passes `scripts/doccheck.mjs`, including tokens, C4 and cross-document IDs and links |
| `adr-traceability` | code | Every ADR after 0001 (except version hold-backs) cites requirement IDs |
| `versions` | code + network | Every package version exists and is stable on the toolchain's registry (npm, PyPI, pub.dev, crates.io); anything older than the newest stable is explained in an ADR; runtimes (Node.js LTS, Python, Flutter, Rust, Godot, Unity) are current |
| `judge:invented-facts` | model | The PRD states nothing about the product or users that the input and interview don't support |
| `judge:redundant-questions` | model | The interview didn't ask what the input already answered |

Judges use `--judge-model` (default `sonnet`), answer one pass / fail question each after reasoning through it, and vote 3 times (`--judge-votes`); the majority wins. A single vote turned out to be unreliable: in one run the judge's reasoning concluded "pass" while its verdict said "fail".

## Cost

Measured on the first runs (2026-11-16): about **$1.60 per run to gate 1**, **$4.40–5.10 per run to gate 2** (8–10 minutes), and about **$0.07 per judge vote** (3 votes per judge). A full suite (3 cases × 3 runs, with judges) is about **$36**; a smoke run (`--stop-at 1 --runs 1`) about **$6–8**. Re-grading earlier results with `--regrade` costs only the judges (about $1 for one run of every case). Always pass `--max-cost`.

## When it runs

| When | What | How |
|---|---|---|
| Every pull request | Unit tests only (free) | CI |
| Pull requests that change steps, templates, reference rules, document checks or eval cases | Smoke: every case once, to gate 1 (≈ $6–8) | Add the **`evals`** label; CI posts a reminder when such files changed |
| Every Monday | Full suite on `main` (≈ $36) — catches drift from model updates and registry changes even when the code didn't change | Scheduled workflow |
| Before a release | Full suite; record the scores in `scoreboard.md` | Actions → Evals → Run workflow |

CI needs the repository secret `ANTHROPIC_API_KEY` (API billing) or `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, uses a subscription). Without either, the eval job is skipped with a warning.

Locally, runs use your own Claude Code login and settings; your user-level `~/.claude` configuration applies to them.

## Adding a case or grader

- **A finding from a real run** (spec 8.4): first try to catch it mechanically — a `doccheck` rule, or a code grader in `lib/graders.mjs`. Use a judge only when it needs judgement. Add a case when the finding depends on a kind of project the suite doesn't cover yet.
- Keep each judge to one failure mode, answered pass / fail.
- Unit-test graders and runner logic in `tests/evals.test.mjs` with the fake `claude` there — no tokens needed.
