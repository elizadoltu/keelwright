# Game stack rules

<!--
Runtime copy of spec 4.4–4.6 for games, read by the `architecture` step (the stack is the tech lead's choice). Keep it in sync with
keelwright-spec.md. Researched content: re-checked when the engine's stack pack is refreshed.
-->

## Deciding questions

1. Where is it played: in the browser, desktop, mobile, consoles?
2. 2D or 3D, and how demanding (art, physics, number of objects)?
3. What does the team know (an engine, C#, C++, TypeScript), and does it need a visual editor for levels?
4. Licence and cost constraints (revenue share, seats, open source)?

## Candidates

Check in order; **stop at the first match**.

| # | If the game… | Choose | Toolchain |
|---|---|---|---|
| 1 | Targets consoles or high-end 3D, or the team works in Unreal | **Unreal Engine** (C++ / Blueprints) | `editor` |
| 2 | Needs Unity's ecosystem (asset store, a platform only Unity exports to well), or the team works in Unity / C# | **Unity** (C#) | `editor` |
| 3 | Is played in the browser first (web portals, game jams, small 2D, embedded in a site) | **Phaser 4 + TypeScript + Vite** | `node` |
| 4 | Anything else — 2D or moderate 3D on desktop, mobile and web exports, open source | **Godot 4 with GDScript** — the default | `godot` |

Godot with C# needs the .NET build of the editor and the .NET SDK, and C# projects can't export to the web; choose it only when the team works in C#, and record that in the engine ADR.

## Defaults (Godot)

| Layer | Default |
|---|---|
| Engine | Godot 4 (latest stable), GDScript with static typing |
| Structure | One scene per screen / level in the GDD's "Scenes and states", autoloads only for truly global state |
| Game rules | Plain scripts independent of the scene tree, so they are testable headless (Humble Object) |
| Unit tests | gdUnit4 (headless, JUnit report for CI) |
| Lint / format | gdtoolkit (`gdlint`, `gdformat`) |
| Saves | `user://` files (JSON or `ConfigFile`), described in the GDD's Tech section |
| Online data | Only when the GDD needs it (leaderboards, accounts): Supabase, with an ERD |
| Builds | Export presets per platform in the release plan; CI exports only when releases need it |
| Git hooks, secrets | pre-commit with gitleaks and Conventional Commits; Git LFS for binary assets when the asset pipeline says so |

Phaser: Vite + TypeScript, Vitest for game logic, the game in `src/game/` with scenes in `src/game/scenes/`, static hosting (the web defaults).

## Right-sizing

No backend, no database and no ERD unless the GDD needs online features. Visual identity (`visual-identity`, tokens) is for products with a UI design system — a game's look is the GDD's "Art and audio direction" and the asset pipeline; include `visual-identity` only when the game has a substantial UI built in a UI framework (e.g. an HTML menu around a Phaser game).

## Conventions

- **Humble Object** is the main one: rules, scoring, progression and AI as plain code with tests; scenes and nodes only wire input, rendering and audio.
- Clean Architecture and Atomic Design usually don't apply; say so in the architecture overview.

## Documents

Always: `game-design-document` (pillars, core loop, mechanics, scenes and states, scope and cut list) and `asset-pipeline`. `architecture-overview` and `c4` only when there is more than the game itself (a backend, a level editor, services). `erd` only for persisted server data.

## Versions

`godot` (also gives the export templates' version), `unity` (newest LTS), Unreal from its release notes with the URL, `pypi:gdtoolkit`, `github:godot-gdunit-labs/gdUnit4`. Phaser: `node`, `npm:phaser`, `npm:vite`, `npm:typescript`, `github:phaserjs/template-vite-ts`.

## Stack packs

| Technology | Pack id | Packages |
|---|---|---|
| Godot 4 / GDScript | `godot` | `godot` |
| gdUnit4 | `gdunit4` | `gdUnit4` |
| gdtoolkit | `gdtoolkit` | `gdtoolkit` |
| Unity | `unity` | `unity` |
| Unreal Engine | `unreal` | — |
| Phaser | `phaser` | `phaser` |
| Shared | `typescript`, `vitest`, `git-hooks`, `pre-commit`, `supabase` | as in `web-stack.md` / `toolchains.md` |

## ADRs

- **ADR-0002 is the engine decision**, naming the rule that matched and the alternative compared.
- One ADR each for: the language when the engine offers several (GDScript vs C#), online services (or none), a held-back version, Git LFS.
