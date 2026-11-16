---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
---

# Visual identity: <Product name>

<!--
Rules for this document:
- This document explains intent: what the brand feels like and how to use it.
- Exact values live in one tokens file: design/tokens.json (W3C DTCG format).
  The Tailwind theme (@theme in CSS) is generated from it — never edit colours or sizes in two places.
- Use semantic token names in code (color-primary, color-surface), not raw values or palette names.
- Every colour pair used for text must meet WCAG 2.2 AA contrast.
- Target length: 1–2 pages plus the tokens file.
-->

## Brand essence

- **Purpose:** <one sentence: why this product exists>
- **Audience:** <who it speaks to>
- **Personality:** <three adjectives, e.g. calm, precise, warm>
- **Is / is not:** <e.g. "confident, not arrogant"; "playful, not childish">

## Voice and tone

<!-- Voice stays the same everywhere; tone adapts to the situation. -->

| Context | Tone | Example |
|---|---|---|
| Marketing / landing | <e.g. inviting, energetic> | "<sample line>" |
| UI labels and buttons | <e.g. short, direct> | "Save changes" |
| Errors | <e.g. calm, helpful, no blame> | "We couldn't save that. Try again." |
| Empty states | <e.g. encouraging> | "<sample line>" |

- **Words we use:** <…>
- **Words we avoid:** <jargon, slang, terms that conflict with the brand>

## Logo

- Files: `public/brand/` (SVG master + PNG exports)
- Variants: <full / mark only / monochrome / on dark>
- Clear space: <e.g. height of the mark on every side>
- Minimum size: <e.g. 24 px height on screen>
- Don't: <stretch, recolour, add effects, place on busy backgrounds>

## Colour

| Semantic token | Light | Dark | Use |
|---|---|---|---|
| color-primary | <value> | <value> | main actions, links |
| color-primary-foreground | <value> | <value> | text on primary |
| color-surface | <value> | <value> | page and card backgrounds |
| color-text | <value> | <value> | body text |
| color-muted | <value> | <value> | secondary text, borders |
| color-success / warning / danger | <value> | <value> | status only, never decoration |

## Typography

| Token | Family | Weight | Use |
|---|---|---|---|
| font-display | <family> | <weights> | headings |
| font-body | <family> | <weights> | body, UI |
| font-mono | <family> | <weights> | code, data |

- Type scale: <e.g. 12 / 14 / 16 / 20 / 24 / 32 / 48>
- Body size and line height: <e.g. 16 px / 1.5>
- Font licence and loading: <self-hosted / provider, licence link>

## Spacing, shape and motion

- Spacing base: <e.g. 4 px scale>
- Radius: <e.g. sm 4 px, md 8 px, full for pills>
- Shadows / elevation: <levels and when to use them>
- Motion: <durations, easing; respect prefers-reduced-motion>

## Imagery and icons

- Photography / illustration style: <description + moodboard link>
- Icon set: <library, stroke width, sizes>
- Alt text: <rule, e.g. describe purpose, not appearance>

## Components

<!-- How the identity maps onto Atomic Design. The component library is the source of truth for detail. -->

| Level | Examples | Notes |
|---|---|---|
| Atoms | Button, Input, Badge, Icon | <variants> |
| Molecules | Form field, Card header | <…> |
| Organisms | Navbar, Pricing table | <…> |

## Accessibility

- Contrast: WCAG 2.2 AA minimum for text and UI controls
- Focus: visible focus ring using <token>
- Colour is never the only signal (pair with icon or text)

## Open questions

- [NEEDS CLARIFICATION: <question>]
