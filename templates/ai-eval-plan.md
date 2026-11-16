---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <one domain expert who makes the final call on quality>
---

# Eval plan: <AI / LLM feature>

<!--
Rules for this document:
- Start with error analysis on real (or realistic) outputs before writing graders.
- Prefer code checks, then binary pass/fail LLM judges. Use human grading sparingly.
- One LLM judge per failure mode; grade with a different model than the one being tested.
- Evals run on every change. A bug found in production becomes a regression case.
- Stay tool-agnostic: datasets are plain files in the repo.
-->

## Task and scope

- Input: <what the system receives>
- Output: <what it must produce>
- Architecture: <single-turn | workflow | agent | multi-agent | RAG>
- Model(s) under test: <model and version>

## Success criteria

<!-- Specific and measurable. Link PRD success metrics (SC-) where they exist. -->

| ID | Criterion | Metric | Target | Grader |
|---|---|---|---|---|
| EV-001 | <e.g. answer is grounded in retrieved sources> | pass rate | ≥ 95% | LLM judge |
| EV-002 | <e.g. output is valid JSON> | pass rate | 100% | code |
| EV-003 | Latency | p95 | < 3 s | code |
| EV-004 | Cost | per request | < $0.01 | code |

## Failure taxonomy

<!-- Built from reading and annotating at least 30 traces; keep going until new traces stop showing new failures. -->

| Failure mode | Example | Frequency | Grader |
|---|---|---|---|
| <e.g. invents a product feature> | <trace link> | <x / n> | judge-hallucination |

## Datasets

| Set | Purpose | Source | Size | Path |
|---|---|---|---|---|
| golden | typical cases with expected outcomes | real / curated | <n> | evals/data/golden.jsonl |
| edge | boundary and unusual inputs | curated | <n> | evals/data/edge.jsonl |
| adversarial | prompt injection, jailbreaks, unsafe requests | curated | <n> | evals/data/adversarial.jsonl |
| regression | cases from past bugs | production | grows | evals/data/regression.jsonl |

## Graders

| Grader | Type | Checks | Validation |
|---|---|---|---|
| <name> | code | <e.g. schema, regex, exact match> | — |
| <name> | LLM judge (binary) | <one failure mode, rubric link> | TPR / TNR on 30–50 pass + 30–50 fail labelled examples |

## Offline evals in CI

- Runs on: <every PR touching prompts, models, retrieval or tools>
- Blocks merge when: <e.g. any EV target missed, or regression set < 100%>
- Command: `<e.g. npm run evals>`

## Online monitoring

- Sampled traces reviewed: <e.g. 20 per week>
- Signals: <user feedback, error rate, latency, cost>
- Alert when: <threshold>

## Cadence

- <e.g. weekly trace review; re-validate judges after model change>

## Results log

<!-- Dated narrative of what changed and why — not a dashboard dump. -->

| Date | Change | Result | Notes |
|---|---|---|---|
| YYYY-MM-DD | <prompt v2> | EV-001 91% → 96% | <…> |
