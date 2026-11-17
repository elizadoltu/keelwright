# AI / LLM stack rules

<!--
Runtime copy of spec 4.4–4.6 for AI / LLM projects, read by the `prd` step. Keep it in sync with
keelwright-spec.md. Researched content: re-checked when the packs are refreshed. Model names and
prices change often: look them up live in the provider's documentation, never from this file.
-->

**Project type `ai`** is for products whose core is a model: an assistant, an agent, an extraction or classification pipeline, a RAG service. A web app with one AI feature is `web` (with `ai-system-design` and `ai-eval-plan` in its document set); the rules below then apply only to that feature.

## Deciding questions

1. What does the model do: generate, extract, classify, answer from sources (retrieval), act with tools (agent)?
2. Where does it run: a backend service, a batch job, inside an existing product, on the user's machine?
3. What data goes to the provider — personal data, customer data, secrets? Which retention and region rules apply?
4. What are the budgets: cost per request or per month, latency (p95), volume?
5. What does the team use: Python or TypeScript, and what system does this plug into?

## Candidates — language and runtime

Check in order; **stop at the first match**.

| # | If the project… | Choose | Toolchain |
|---|---|---|---|
| 1 | Lives inside an existing TypeScript product or the team works in TypeScript | **TypeScript** (Node.js), the provider SDK; Express or the existing framework for HTTP | `node` |
| 2 | Anything else — data work, evaluation-heavy, ML beyond prompting, a Python team | **Python** (uv), the provider SDK; FastAPI for HTTP | `python` |

## Model provider and model

Compare **2–3** providers / models for this task in the stack ADR on: quality for the task (a small eval on examples from the input when possible), cost at the expected volume, latency, context size, tool use, data handling (retention, training use, region), and availability on the platforms the project uses. Look up current model names and prices in the providers' documentation at run time. Use the provider's SDK directly; add an orchestration framework only when an ADR shows the project needs what it adds.

## Defaults

| Layer | Default |
|---|---|
| Model access | The chosen provider's official SDK, the model name in configuration (not code) |
| Prompts | Files in `prompts/` named by ID (`prompts/P-01-answer.md`), versioned with the code |
| Tools | Functions named as in the AI system design (`T-` IDs), with typed input validation |
| Retrieval | None unless needed. When needed and data is in Postgres: pgvector on Supabase (the `vector` extension); a dedicated vector database only when an ADR shows scale or features Postgres lacks |
| Evals | A dataset in `evals/data/`, graders per `EV-` criterion, run by the `eval` task. Framework chosen in an ADR: promptfoo (config-driven, any language), Inspect (`inspect-ai`, Python) or DeepEval (pytest-style) — or plain tests when the graders are simple |
| Observability | Log every model call's input size, output size, latency, cost and outcome (no personal data in logs) |
| Backend | Python: FastAPI; TypeScript: Express. Hosting as for web (Vercel functions) unless latency, streaming or job length need a long-running host — then an ADR |
| Tests | pytest / Vitest for everything that isn't the model (parsing, tools, guardrails) |
| Git hooks, secrets | Python: pre-commit with gitleaks and Conventional Commits; TypeScript: Husky. API keys only in environment variables |

## Conventions

- **Humble Object**: the model call is a thin adapter; prompt assembly, parsing, validation, tools and guardrails are plain code with tests.
- **Clean Architecture** when the service has domain logic beyond the model (e.g. orders, accounts).
- Prompts and tools keep their `P-` / `T-` IDs in file and function names, so the documents and code can be compared.

## Documents

Always: `ai-system-design` (model and data flow, prompts, tools, guardrails, data sent to providers) and `ai-eval-plan` (`EV-` criteria with thresholds — including a cost and a latency budget — datasets, graders). `architecture-overview` and `c4` when there is a backend or more than one service; `erd` when data is stored (including embeddings).

## Versions

Python: `python`, `pypi:<provider sdk>` (e.g. `pypi:anthropic`), `pypi:fastapi`, `pypi:uvicorn`, `pypi:pydantic`, the eval framework, `pypi:ruff`, `pypi:pyright`, `pypi:pytest`, `pypi:poethepoet`. TypeScript: `node`, `npm:<provider sdk>` (e.g. `npm:@anthropic-ai/sdk`), `npm:express`, `npm:zod`, the eval framework (e.g. `npm:promptfoo`), plus the web tooling.

## Stack packs

| Technology | Pack id | Packages |
|---|---|---|
| The provider SDK | `<provider>-sdk`, e.g. `anthropic-sdk` | `anthropic` / `@anthropic-ai/sdk` |
| FastAPI | `fastapi` | `fastapi` |
| Python tooling (uv, Ruff, pyright, pytest, poe) | `python-tooling` | `ruff`, `pyright`, `pytest`, `poethepoet` |
| promptfoo / Inspect / DeepEval | `promptfoo`, `inspect-ai`, `deepeval` | the package |
| pgvector on Supabase | `supabase` | as in `web-stack.md` |
| Git hooks (pre-commit) | `pre-commit` | `pre-commit` |
| TypeScript projects | `typescript`, `express`, `vitest`, `git-hooks` | as in `web-stack.md` |

## ADRs

- **ADR-0002 is the model provider and model decision** (what was compared, on which criteria, and the data-handling terms that matter).
- One ADR each for: the language when not decided by rule 1, retrieval (or none), the eval framework, hosting if not the default, a held-back version.
