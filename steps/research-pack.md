# Procedure: research one stack pack

Used by the `research` step for each pack it has to research, and by `scripts/research-pack.mjs` to produce the packs shipped with the plugin. You are given: the pack **id**, the technology's **name**, its **packages** (primary first), the **resolved version** of the primary package, the **template** (`<plugin root>/templates/stack-pack.md`) and the **output file**.

## 1. Sources

Research live; never write from memory. Use WebSearch to find pages and WebFetch to read them. **Cite only pages you actually fetched.**

Priority, highest first:
1. **official** — the technology's own documentation, style guide, API reference, migration guide, release notes.
2. **maintainer** — setups recommended by the maintainers: official starters / templates, the maintainers' own example repositories, official integration guides of the tools it pairs with.
3. **reference-project** — well-maintained, widely used projects built with it (say why it counts as reference).
4. **community** — only to fill a gap the others leave; never the only source for a rule.

## 2. The right version

- The docs must match the **resolved major version**. Check the docs' version selector or URL, and read the **migration / upgrade guide into this major** and its release notes.
- If the docs you find describe an older major, say so and look for the current pages; don't mix majors.
- Record breaking changes, deprecated APIs to avoid, and known compatibility limits in **Version notes**.

## 3. Write the pack

Follow `templates/stack-pack.md` (keep its sections in order; remove its instruction comments and placeholder rows):

- Front matter: `id`, `name`, `packages` (primary first; globs allowed), `major` = the resolved major, `researchedAt` = today, `status: draft`.
- One section per research topic. State facts with the source ID in brackets, e.g. "Routes live in `src/pages/` [S1]." Where sources disagree, say so and follow the official one.
- **Conventions:** how Clean Architecture (dependency rule, layers), Atomic Design (component levels) and Humble Object (thin boundaries, testable logic) map onto this technology — concretely (folders, file kinds), or "not applicable" with the reason.
- 1,200–3,000 words including the tables (the validator enforces the upper limit).

## 4. Rules

The Rules table is what the generator turns into `.claude/rules`, skills, lint config and hooks. Write **8–20** rules:

- **Concrete and checkable** — "Use `import.meta.env` only in server code; client code reads `PUBLIC_*` variables" rather than "handle env vars carefully".
- **Enforced where possible.** "Enforce with" starts with one of `lint`, `format`, `types`, `hook`, `ci`, `test`, `config`, `review`, followed by the exact tool and rule or setting — e.g. `lint: eslint-plugin-astro astro/no-set-html-directive`, `config: tsconfig "strict": true`, `ci: astro check`. **Use only rule names, settings and commands that appear in your sources**; if nothing enforces it mechanically, use `review`.
- IDs: the pack id in capitals without dashes, then a two-digit number — e.g. `ASTRO-01`, `TANSTACKSTART-03`.
- Every rule cites at least one source; not community-only.

## 5. Check

Run `node "<plugin root>/scripts/packs.mjs" validate <output file>` and fix every issue until it passes.
