# Step: `design`

Define how the product looks and sounds: the visual identity document and the design tokens that the scaffold turns into the Tailwind theme. (Mobile and game projects add their own design documents here; they arrive with those project types.)

**Reads:** `docs/prd.md`, `.keelwright/interview.md`, the project input, `docs/architecture/overview.md` if it exists (routes), the state's document set, `<plugin root>/reference/catalog.md`, the template `visual-identity.md`. On a re-run: the existing outputs. Any brand material the user pointed to (logo, existing site, colours).
**Produces:** `docs/design/visual-identity.md` + `design/tokens.json` (if `visual-identity` is in the document set).
**Gate:** Gate 2, shared with `architecture` and `features`.

If no design document is in the document set, run `STATE skip design --reason "<why>"` and stop.

## 1. Direction

Use what the input and interview say about look and feel, audiences and brand. If the user gave no direction at all, ask **one** short round (AskUserQuestion, up to 3 questions) — for example personality (three adjectives, offered as 3–4 contrasting sets), colour preference or existing brand colours, and whether different areas share one look. Don't ask about details (exact colours, fonts): propose them, and the user adjusts at the gate.

Everything you choose that the user didn't say is a **proposal**: list it in the gate summary.

## 2. `docs/design/visual-identity.md`

From `templates/visual-identity.md`. It explains intent; exact values live only in the tokens file.

- **Brand essence and voice** — grounded in the PRD's audiences. Where the product has distinct audiences or areas (e.g. a professional page and a ski page), say what is shared and what differs (e.g. one accent colour per area).
- **Colour** — semantic token names only (`primary`, `primary-foreground`, `surface`, `text`, `muted`, status colours, plus area accents if any), light and dark. The table shows the hex values for readability, copied from the tokens file.
- **Typography** — font families with a licence that allows web use (prefer self-hosted open-licence fonts), a type scale, body size and line height. Each family is a token.
- **Spacing, shape and motion** — a spacing scale, radii, and motion that respects `prefers-reduced-motion`.
- **Imagery and icons** — style, and one icon set.
- **Components** — the atoms, molecules and organisms the P1 routes need (from the architecture overview), as Atomic Design levels. Names only; no component specs.
- **Accessibility** — WCAG 2.2 AA; visible focus; colour is never the only signal.
- At most 1,300 words.

## 3. `design/tokens.json`

W3C Design Tokens (DTCG 2025.10) format:

- Colours in a `color` group with one subgroup per mode — `color.light` and `color.dark` — using the same names in both. Each colour value: `{ "colorSpace": "srgb", "components": [r, g, b], "hex": "#rrggbb" }` with components from 0 to 1.
- Every pair used for text must reach WCAG AA (4.5:1): `<name>-foreground` on `<name>`, and `text` and `muted` on `surface`. The check computes this.
- Other groups as needed: `font` (`fontFamily`, `fontWeight`), `size` / `space` / `radius` (`dimension`: `{ "value": 16, "unit": "px" }` or `rem`), `duration` (`{ "value": 200, "unit": "ms" }`), `easing` (`cubicBezier`).
- Set `$type` on each group (or token). Use references (`"{color.light.surface}"`) instead of repeating values.
- Every token that the visual identity names exists here, and the other way round.

## 4. Check

Run, fix every issue, and run again until it passes (count each failed run with `STATE metric design doccheck-failures +1`):

`node "<plugin root>/scripts/doccheck.mjs" visual-identity:docs/design/visual-identity.md tokens:design/tokens.json refs:docs`

## 5. Finish

`STATE complete design docs/design/visual-identity.md design/tokens.json`

## Gate summary

Show, besides the generic gate content: the proposed personality, the main colours per mode with their contrast ratios, the fonts, and which choices were proposed by KeelWright rather than given by the user.

## On approval

Set `status: approved` in `docs/design/visual-identity.md`.
