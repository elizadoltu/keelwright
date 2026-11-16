# Web stack rules

<!--
Runtime copy of spec sections 4.1–4.3, 4.6 and 4.7, read by the `prd` step.
Keep it in sync with keelwright-spec.md: a change to one is a change to both.
These rules are researched content: the `research` step re-checks them when the web stack pack is refreshed.
-->

## Defaults

| Layer | Default | Alternatives (chosen by the rules below) |
|---|---|---|
| Frontend | TanStack Start (React) + TypeScript, rendering mode set per project | Astro, Next.js, React Router framework mode |
| Styling | Tailwind CSS | — |
| Backend | Node.js + TypeScript + Express | — |
| Database | PostgreSQL / Supabase | — |
| CI/CD & hosting | GitHub Actions + Vercel | — |
| Unit tests | Vitest | — |
| E2E tests | Playwright | — |
| Git hooks | Husky (+ lint-staged, commitlint) | — |
| Secret scanning | gitleaks | — |

**Docker** is for local development only (the Supabase CLI runs the local database in Docker). Express deploys to Vercel as functions, so no Dockerfile — unless right-sizing picks a host other than Vercel (that needs an ADR).

**Conventions** (selected and scaled per project):
- **Clean Architecture** — dependency rule domain ← application ← infrastructure / UI; no framework imports in the domain layer.
- **Atomic Design** — atoms / molecules / organisms / templates / pages.
- **Humble Object** — UI, DB, HTTP and external services stay thin; logic lives in testable objects.

## Right-sizing

The defaults are a starting point. For each layer, decide one of:

- **Keep** — the project needs it as is.
- **Remove** — the project doesn't need it (e.g. a mostly static site needs no Express and no database; content can be Markdown/MDX in the repository).
- **Swap** — the requirements call for something else (the frontend is chosen by the rules below).
- **Add** — something the defaults don't cover (e.g. a form handler, search, auth provider, queue, realtime, i18n).

Scale the conventions too: full Clean Architecture for a backend with real domain logic; for a small static site, Atomic Design and Humble Object are usually enough.

**Every deviation from the defaults is an ADR** — one decision per ADR (see "ADRs for the stack" below).

## Frontend selection rules

The deciding question: **must the first HTML response already contain the content?** Pages that need to rank on Google or be cited by AI search need server-rendered or prerendered HTML — AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't run JavaScript. Pages behind a login don't.

Check in order; **stop at the first match**:

| # | If the project… | Choose |
|---|---|---|
| 1 | Is content-first and mostly static (blog, docs, landing page, portfolio) | **Astro** (React islands where interactivity is needed) |
| 2 | Is public and dynamic **and** specifically needs Next.js (existing Next.js code or team, Next-only features or ecosystem) | **Next.js** — on Vercel, an adapter-supported host, or a Node server |
| 3 | Has public pages **and** a logged-in app | **TanStack Start, one app**: SSR or prerendering for public routes, `ssr: false` on app routes. If the public part is large and content-heavy: two apps — Astro for the public site, TanStack Start in SPA mode for the app |
| 4 | Is public, SEO / AI-search relevant and dynamic | **TanStack Start** with SSR (the default) |
| 5 | Is entirely behind a login and calls an existing API | **TanStack Start in SPA mode** (client-only, static hosting) |

"Mostly static" still allows a few dynamic features (a contact form, a newsletter sign-up): handle them with the framework's server endpoints / serverless functions or a form service, not by switching frameworks.

Guard rules:
- **TanStack Start, mixed SPA and prerendered routes:** keep SSR on as the default and switch it off per route. `defaultSsr: false` globally stops route-level prerendering.
- **Next.js without a server:** `output: 'export'` disables middleware, Server Actions, ISR, redirects / rewrites / headers, cookies, request-dependent route handlers and default image optimisation. Use it only when none are needed; otherwise prefer Astro or React Router prerendering.
- **Next.js hosting:** since the stable Adapter API (Next.js 16.2) it isn't tied to Vercel; multiple self-hosted instances still need cache sync and revalidation work.
- **Public client-rendered routes:** real `<a href>` links with History API routing (no `#` routes), correct soft-404 handling, fingerprinted asset filenames.

## Versions

- **Resolved live** with `node "<plugin root>/scripts/versions.mjs" <specs…>` — never from memory or templates.
- **Stable only.** Node.js: latest **LTS** (the script picks it).
- **Resolve everything the scaffold will install directly:** the runtime, the framework and its integrations, styling, TypeScript, test tools, lint / format tools, git hook tools, and binaries such as gitleaks (`github:gitleaks/gitleaks`).
- **Compatible as a set.** Check the script's peer report:
  - `conflict` → hold the newer package back to the newest compatible version (`npm:<pkg>@<range>`), and record the held-back package and the reason in an ADR.
  - `missing` → if the project installs that peer directly, add it to the set and re-run; if it comes in through another package (e.g. `vite` through Astro), note that and move on.
  - `unknown` → check the range by hand.
- **Recorded:** exact versions and the lookup date go in the PRD's technical constraints and `STATE set stack`. The scaffold step pins them.

## ADRs for the stack

- **ADR-0002 is always the frontend decision**, naming the rule that matched (even when it is the default).
- Each other deviation from the defaults gets its own ADR: e.g. "No custom backend", "No database", "Use a form service for the contact form", a held-back version, a host other than Vercel.
- Layers kept as default need no ADR.
- ADRs written during `prd` are `proposed`; they become `accepted` when gate 1 is approved.
