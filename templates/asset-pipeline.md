---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
---

# Asset pipeline: <Game title>

<!--
Generated as design/asset-pipeline.md, a one-page system design next to the GDD.
Rules for this document:
- Maximum 1 page. Describes how assets go from source tool to the build.
- Source files (e.g. .blend, .psd) and exported files have separate, fixed locations.
- Every budget is a number that can be checked automatically.
- Every third-party asset has a licence entry before it is committed.
-->

## Asset types

| Type | Source tool | Source format | Export format | Location |
|---|---|---|---|---|
| Sprites / textures | <Aseprite / Krita> | <.aseprite> | <.png> | `assets/sprites/` |
| 3D models | <Blender> | <.blend> | <.glb> | `assets/models/` |
| Audio | <DAW> | <.wav> | <.ogg> | `assets/audio/` |
| Fonts | — | — | <.ttf> | `assets/fonts/` |

Source files: `<art-source/>` (not shipped in the build)

## Naming

- Pattern: `<category>_<name>_<variant>.<ext>`, lowercase, snake_case — e.g. `enemy_slime_idle.png`
- Animations: `<name>_<action>_<frame-count>` or one sheet per action

## Import settings

| Type | Setting |
|---|---|
| Textures | <filtering (nearest for pixel art), compression, mipmaps> |
| Audio | <music streamed, SFX loaded; sample rate> |
| Models | <scale, axis, collision generation> |

## Budgets

| Budget | Limit | Checked by |
|---|---|---|
| Texture size | <max 2048 px> | <import script / CI check> |
| Triangles per model | <…> | <…> |
| Total build size | <e.g. < 200 MB> | CI |

## Version control

- Large binaries tracked with Git LFS: <*.png, *.wav, *.glb, *.blend …> (in `.gitattributes`)
- Engine-generated files ignored: <e.g. .godot/, Library/>

## Licences and attribution

| Asset | Source | Licence | Attribution required |
|---|---|---|---|
| <name> | <URL> | <CC0 / CC-BY 4.0 / purchased> | <yes: credits screen> |

## Automation

- Export: <script or tool that exports sources to the asset folders>
- Validation: <script that checks naming, budgets and licence entries; runs in CI>

## Open questions

- [NEEDS CLARIFICATION: <question>]
