# Step: `design`

Define how the product looks, feels and is played: the visual identity and the design tokens that the scaffold turns into the theme (Tailwind for web, a TypeScript or Dart theme for apps), the screen flow and store release checklist for mobile apps, and the game design document and asset pipeline for games.

**Reads:** `docs/prd.md`, `.keelwright/interview.md`, the project input, `docs/architecture/overview.md` if it exists (routes), the state's document set, `<plugin root>/reference/catalog.md`, the templates `visual-identity.md`, `screen-flow.md`, `release-checklist.md`, `game-design-document.md`, `asset-pipeline.md`, and the stack rules for the project type (`<plugin root>/reference/<type>-stack.md`). On a re-run: the existing outputs. Any brand material the user pointed to (logo, existing site, colours).
**Produces** (only those in the document set): `docs/design/visual-identity.md` + `design/tokens.json`, `docs/design/screen-flow.md`, `docs/release-checklist.md`, `docs/gdd.md`, `design/asset-pipeline.md`.
**Gate:** Gate 2, shared with `architecture` and `features`.

If none of `visual-identity`, `screen-flow`, `release-checklist`, `game-design-document` and `asset-pipeline` is in the document set, run `STATE skip design --reason "<why>"` and stop.

## 1. Direction

Use what the input and interview say about look and feel, audiences and brand. If the user gave no direction at all, ask **one** short round (AskUserQuestion, up to 3 questions) — for example personality (three adjectives, offered as 3–4 contrasting sets), colour preference or existing brand colours, and whether different areas share one look. Don't ask about details (exact colours, fonts): propose them, and the user adjusts at the gate.

Everything you choose that the user didn't say is a **proposal**: list it in the gate summary.

For games, the direction questions are about the game: the pillars (2–4 words the game must feel like), comparable games, the art and audio style — not brand colours.

## 2. `docs/design/visual-identity.md` (if in the set)

From `templates/visual-identity.md`. It explains intent; exact values live only in the tokens file.

- **Brand essence and voice** — grounded in the PRD's audiences. Where the product has distinct audiences or areas (e.g. a professional page and a ski page), say what is shared and what differs (e.g. one accent colour per area).
- **Colour** — semantic token names only (`primary`, `primary-foreground`, `surface`, `text`, `muted`, status colours, plus area accents if any), light and dark. The table shows the hex values for readability, copied from the tokens file.
- **Typography** — font families with a licence that allows use in the product (web or app embedding) (prefer self-hosted open-licence fonts), a type scale, body size and line height. Each family is a token.
- **Spacing, shape and motion** — a spacing scale, radii, and motion that respects `prefers-reduced-motion`.
- **Imagery and icons** — style, and one icon set.
- **Components** — the atoms, molecules and organisms the P1 routes need (from the architecture overview), as Atomic Design levels. Names only; no component specs.
- **Accessibility** — WCAG 2.2 AA; visible focus; colour is never the only signal.
- At most 1,300 words.

## 3. `design/tokens.json` (with the visual identity)

W3C Design Tokens (DTCG 2025.10) format:

- Colours in a `color` group with one subgroup per mode — `color.light` and `color.dark` — using the same names in both. Each colour value: `{ "colorSpace": "srgb", "components": [r, g, b], "hex": "#rrggbb" }` with components from 0 to 1.
- Every pair used for text must reach WCAG AA (4.5:1): `<name>-foreground` on `<name>`, and `text` and `muted` on `surface`. The check computes this.
- Other groups as needed: `font` (`fontFamily`, `fontWeight`), `size` / `space` / `radius` (`dimension`: `{ "value": 16, "unit": "px" }` or `rem`), `duration` (`{ "value": 200, "unit": "ms" }`), `easing` (`cubicBezier`).
- Set `$type` on each group (or token). Use references (`"{color.light.surface}"`) instead of repeating values.
- Every token that the visual identity names exists here, and the other way round.

## 4. Mobile: `docs/design/screen-flow.md` and `docs/release-checklist.md`

**Screen flow** (if `screen-flow` is in the set), from `templates/screen-flow.md`:
- The navigation model (tabs, stacks, modals) and a Mermaid flowchart of it.
- The screen inventory: every screen a P1 or P2 story needs, with an `S-NN` ID, its purpose, how it's reached, where it goes, its data (the API or entity), whether it works offline (as the offline / sync ADR decided) and its deep link. Each screen cites its stories.
- Screen states for every data-driven screen: loading, empty (with the action that fills it), error, offline.
- Key flows (1–3), the permission prompts with when and why each is asked (never at first launch without context), deep links, and analytics events only if the PRD asks for analytics.
- At most 1,000 words. Screen IDs become route and component names in the scaffold.

**Store release checklist** (if `release-checklist` is in the set), from `templates/release-checklist.md`: identifiers and accounts, versioning, store listing, privacy (the store privacy labels / data safety form from what the app collects), payments if any, the per-release steps (with the build and submit tool from the ADRs) and the rollback plan. Mark everything the user must decide or own (developer accounts, bundle ID, legal pages) as `[NEEDS CLARIFICATION: …]`. At most 900 words.

## 5. Games: `docs/gdd.md` and `design/asset-pipeline.md`

**Game design document** (if `game-design-document` is in the set), from `templates/game-design-document.md` — at most 2 pages (1,300 words):
- Pitch, target player and platforms, **pillars** (every mechanic must serve one), the intended player experience.
- **Core loop** as a short cycle (e.g. explore → fight → loot → upgrade), and its Mermaid diagram.
- Key mechanics, each with the stories that cover it; progression.
- **Scenes and states** — a Mermaid state diagram of the game's scenes (title, play, pause, game over…), the names the scaffold uses for scene files.
- Controls per platform, art and audio direction, comparables, monetisation (or none), tech (engine from the ADR, saves, online services), **scope and cut list** (what is cut first if time runs short), open questions, decision log.
- Bigger systems get a one-pager in `design/<system>.md`, linked from the GDD, only when the GDD would otherwise exceed its length.

**Asset pipeline** (if `asset-pipeline` is in the set), from `templates/asset-pipeline.md`: asset types with formats and tools, naming, import settings for the chosen engine, budgets (texture sizes, audio length, total size per platform), version control (Git LFS patterns for binary assets — the scaffold writes them to `.gitattributes`), licences and attribution, automation. At most 700 words.

## 6. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric design doccheck-failures +1`). Only the targets for documents in the set:

`node "<plugin root>/scripts/doccheck.mjs" visual-identity:docs/design/visual-identity.md tokens:design/tokens.json screen-flow:docs/design/screen-flow.md release-checklist:docs/release-checklist.md gdd:docs/gdd.md asset-pipeline:design/asset-pipeline.md refs:docs`

## 7. Finish

`STATE complete design <each file this step wrote>`

## Gate summary

Show, besides the generic gate content:
- visual identity: the proposed personality, the main colours per mode with their contrast ratios, the fonts;
- mobile: the screens (ID and name) and the navigation model; the store items the user must own;
- games: the pillars, the core loop in one line, the scenes, and the cut list;
- which choices were proposed by KeelWright rather than given by the user.

## On approval

Set `status: approved` in every document this step wrote.
