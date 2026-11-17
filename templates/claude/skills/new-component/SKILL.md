---
name: new-component
description: Create a UI component at the right Atomic Design level (atom, molecule, organism, template) using the design tokens. Use when adding or splitting a component, button, card, form field, section or layout.
---

# Create a component

1. **Level** — pick the lowest that fits:
   - **atom**: one element with no children components (Button, Link, Input, Badge)
   - **molecule**: a few atoms working as one unit (FormField = Label + Input + Error)
   - **organism**: a section of a page (Header, ContactForm, ProjectList)
   - **template**: page layout without content
   Check `<component folder>` first: reuse or extend an existing component instead of duplicating it.
2. **Place** it in `<component folder>/<level>/<Name>.<ext>`.
3. **Style** only with theme classes generated from `design/tokens.json` (semantic names such as `bg-primary`, `text-muted`) — never raw colours, sizes or font names. If a value is missing, add a token and run `npm run tokens`; don't hard-code it.
4. **Accessibility**: semantic element first, visible focus, text alternatives, colour never the only signal (`docs/design/visual-identity.md`).
5. **Logic** stays out of the component (Humble Object): put it in `<logic folder>` with a unit test.
6. <framework-specific rules from the stack packs, by ID>
