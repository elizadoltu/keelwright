# Evaluation suite

Measures how well `/keelwright:kickoff` does on fixed project descriptions, and `/keelwright:adopt` on fixed sample repositories, so changes to steps, templates or rules can be compared and regressions are caught (spec section 8.3).

Each run starts a real headless Claude Code session with this plugin in a temporary folder outside the repository, answers the interview from the case, approves gates up to the case's stop gate, and grades what was produced. **Runs cost money** — see "Cost" below.

## Running it

```bash
node evals/run.mjs                                   # every case, 3 runs each
node evals/run.mjs --case personal-website --runs 1  # one case, one run
node evals/run.mjs --stop-at 1 --runs 1              # cheap smoke run: every case to gate 1 (deep cases left out)
node evals/run.mjs --help                            # all options
```

Results go to `evals/results/<timestamp>/` (ignored by git): `summary.md`, `summary.json`, and per run the generated `docs/`, `design/`, `evals/data/` (AI eval seeds), `.keelwright/` and `run.json` (calls, cost, every grade).

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

| `adopt-orders-api` | `/adopt`: pnpm Express 4 API with an existing `docs/adr/` folder and AGENTS.md. Planted: one route breaks the `HttpError` convention (mixed), PostgreSQL through `pg` with no ADR, Express a major behind the shipped pack | Gate 2 |
| `adopt-etl-python` | `/adopt`: Poetry ETL job with a Makefile, Ruff, mypy, pytest, GitLab CI, no ADRs; Pydantic 1 | Gate 1 |
| `adopt-workspace-app` | `/adopt`: npm workspace repo (`web/` React + Vite, `api/` Express) adopted as one project; the api's test script only echoes | Gate 1 |

Phase 3 cases (spec 9, step 7):

| Case | What it exercises | Runs until |
|---|---|---|
| `start-notes` | `/start` in a folder with only notes → `/kickoff`, the notes as its input | The interview's first questions |
| `start-code` | `/start` in the `adopt-etl-python` repo, with some history → `/adopt` | The adoption is set up |
| `doctor-drift` | `/start` on a hand-made Claude setup that drifted (a missing script, a deleted folder in CLAUDE.md and the architecture notes, a rule scoped to it) → audit mode: the doctor finds all of it and nothing changes before approval | The first fix question |
| `pm-kickoff-booking` | `/kickoff` run by a project manager (profile): the open questions are tagged with the role that can answer them — launch date `(pm)`, cancellation rules `(ba)`, the old membership app `(dev)` | Gate 1 |
| `adopt-security-shop` | `/adopt` on the `security-shop` fixture: the threat model, as built, names the planted surface (the `orders` table, the admin routes, `profiles`) and passes its doccheck | Gate 2 |
| `security-shop-deep` | The deep security review and the mechanical audit on `security-shop`, with five planted vulnerabilities: an injectable order lookup, a delete-user route without the admin check, `orders` without RLS, lodash 4.17.20, a Stripe key only in the history | The review, under `maxCost` ($3) |

`security-shop` lives in `evals/fixtures/` because two cases share it. A case's `repo` points at it, `history` scripts the commits before the repository's own files, and `secret` holds the planted key in pieces, joined only in the run's temporary repository — so no secret-looking string is committed to KeelWright.

A `"mode": "command"` case runs `command` and then each of `replies` in one session; a `"mode": "deep"` case runs `lib/deep.mjs` under the case's `maxCost` and then the mechanical audit, without a command. A case's `profile` (e.g. `{ "role": "project-manager" }`) is written to the run's own profile folder (`KEELWRIGHT_HOME`); without one, every run has a profile already asked and skipped, so no run stops at the profile question and none reads your `~/.keelwright`.

A `/kickoff` case is a folder in `cases/` with:
- `input.md` — the project description passed to `/keelwright:kickoff`.
- `case.json` — `stopAtGate`, the `answers` sent when the interview asks (in order; after the last one the runner says "decide later"), `expect` (project type, the main stack decision and its rule — `primary`, toolchain, documents that must and mustn't be in the set, ADRs that must exist as title patterns, minimum interview questions) and the `judges` to run.

An `/adopt` case has `"mode": "adopt"` and a `repo/` folder instead of `input.md`: the runner copies it to a temporary folder, commits it to a fresh git repository, runs `/keelwright:adopt` (answering the branch question with "stay on the current branch"), and records a hash of every file before and after (`.eval/files.json` in the results). `expect` holds the facts planted in the repository.

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
| `mode` | code | `/adopt` cases: the state is an adoption |
| `cited-files` | code | Every file the analysis and the new ADRs cite (table rows, Evidence lists) exists in the project |
| `code-untouched` | code | Before `gaps`, no file outside the documents, `.keelwright/` and the Claude setup changed — and no existing document either |
| `analysis-check` | code | The analysis passes `doccheck analysis` against the project's files |
| `conventions` | code | The planted conventions are found, with the expected verdict (e.g. the `HttpError` convention is *mixed*) |
| `gaps-found` | code | The planted gaps are in the analysis's Gaps section, and the things that aren't gaps aren't |
| `versions-in-use` | code | The state records the locked versions, not the latest |
| `workspaces` | code | A workspace repo records its workspaces |
| `adr-folder` | code | New ADRs go in the project's ADR folder, numbered after its highest; no ADR-0001 when ADRs exist |
| `retro-adrs` | code | Retroactive ADRs pass `doccheck adr-retro`, and list no alternatives the repository never mentions |
| `pack-majors` | code | Packs are researched or reused at the major the project uses (Express 4, not 5) |
| `route` | code | `/start` took the expected route: a kickoff or an adoption started, or the doctor ran without starting a pipeline |
| `doctor-found` | code | `.keelwright/doctor.md` names each planted problem |
| `only-keelwright` | code | Nothing outside `.keelwright/` changed (audit mode asks before fixing) |
| `marker-roles` | code | Every role tag on an open question is known (`dev`, `pm`, `ba`, `am`), and the expected questions carry the expected role |
| `threat-surface` | code | The threat model names the planted tables and routes and passes `doccheck threat-model` |
| `planted-found` | code | The deep review reported each planted vulnerability, in the right file |
| `findings-real` | code | No deep finding cites a file the project doesn't have, and the review stayed within `maxCost` |
| `mechanical-found` | code | The mechanical audit found what it can see (RLS, the advisory, the secret in history); a check that couldn't run here — gitleaks not installed, offline — is reported as skipped |
| `judge:invented-facts` | model | The PRD states nothing about the product or users that the input and interview don't support |
| `judge:redundant-questions` | model | The interview didn't ask what the input already answered |

Judges use `--judge-model` (default `sonnet`), answer one pass / fail question each after reasoning through it, and vote 3 times (`--judge-votes`); the majority wins. A single vote turned out to be unreliable: in one run the judge's reasoning concluded "pass" while its verdict said "fail".

## Cost

`/adopt` cases (estimates until measured): about **$1.50–2.50 per run to gate 1**, and **$5–7** for `adopt-orders-api` to gate 2, which researches one pack (Express 4). One run of the three: about **$10**.

Phase 3 cases (estimates until measured): `start-notes`, `start-code` and `doctor-drift` about **$0.30–0.60** each; `pm-kickoff-booking` about **$1.60** (gate 1); `adopt-security-shop` about **$5** (gate 2); `security-shop-deep` at most **$3** (its `maxCost`). One run of the six: about **$11**.

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
