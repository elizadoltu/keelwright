# Step: `research`

> **Not implemented yet.** This step is added in Phase 1 build step 5 (spec section 9). Tell the user, don't change the state, and stop.

## Purpose

Research current conventions and best practices for the chosen stack and produce or refresh its stack packs. Reuse cached packs younger than 90 days that match the resolved major versions, unless `--refresh` was given.

## Produces

- Stack packs in `~/.keelwright/stack-packs/` (or reused from the plugin's `stack-packs/`)
- Pack names and research dates recorded with `STATE set stack '<json>'`

## Gate

Gate 3 — the user reviews the stack packs before generation.

## Spec

4.6, 4.7, 5.4
