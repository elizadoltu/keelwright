# Mobile stack rules

<!--
Runtime copy of spec 4.4–4.6 for mobile apps, read by the `architecture` step (the stack is the tech lead's choice). Keep it in sync with
keelwright-spec.md. Researched content: re-checked when the framework's stack pack is refreshed.
-->

## Deciding questions

1. Which platforms: iOS, Android, both — and does the same product need a web version?
2. Does it depend on platform features that cross-platform frameworks reach late or poorly (home-screen widgets, watch apps, CarPlay / Android Auto, heavy AR, background audio or location as the core)?
3. What does the team already know: TypeScript / React, Dart, Swift / Kotlin?
4. Must it work offline, and what happens to changes made offline?

## Candidates

Check in order; **stop at the first match**. Compare the match with the strongest alternative in the stack ADR.

| # | If the app… | Choose | Toolchain |
|---|---|---|---|
| 1 | Is for one platform and its core depends on platform-only features (Q2), or the team is a native team | **Native**: SwiftUI (iOS) / Jetpack Compose (Android) | `editor` |
| 2 | Needs a pixel-identical custom UI or heavy custom rendering on both platforms, or the team works in Dart | **Flutter** | `dart` |
| 3 | Anything else — both platforms, standard UI, web skills, over-the-air updates | **Expo (React Native) + TypeScript** — the default | `node` |

## Defaults (Expo)

| Layer | Default |
|---|---|
| App | Expo with Expo Router (file-based routes, one per screen `S-`), TypeScript |
| Server data | TanStack Query against the backend |
| Backend and data | Supabase when data is stored or synced (as for web); none when the app only reads a public API |
| Local storage | `expo-sqlite` for offline data; `expo-secure-store` for tokens — never AsyncStorage for secrets |
| Unit tests | Jest with `jest-expo` + React Native Testing Library |
| E2E tests | Maestro (flows per P1 journey), run on EAS Workflows or locally |
| Lint / format | ESLint with `eslint-config-expo`, Prettier |
| Build and release | EAS Build and EAS Submit; over-the-air updates with EAS Update |
| Git hooks, secrets | Husky + commitlint, gitleaks |

Flutter: `flutter_lints`, `flutter test` + `integration_test`, the backend as above (Supabase has a Dart client); state management chosen in an ADR only if the app needs more than the framework's own.

## Right-sizing

Remove what the app doesn't need: no backend for an app on a public API, no local database for an online-only app, no over-the-air updates when the store review cycle is fine. Add what it needs: push notifications, payments (store in-app purchases vs external), analytics, crash reporting.

## Conventions

- **Humble Object**: screens and native modules stay thin; logic in plain TypeScript (or Dart) modules tested without a device.
- **Atomic Design** for components (`components/atoms|molecules|organisms`), fed by the design tokens (`src/theme/tokens.ts` generated from `design/tokens.json`).
- **Clean Architecture** only when the app has real domain logic of its own (beyond showing server data).

## Documents

Always for mobile: `screen-flow` (screens `S-`, navigation, states, permissions, deep links) and `visual-identity`. `release-checklist` when it ships to the app stores. **Offline / sync strategy is an ADR** — online-only, cached reads, or offline-first with sync and a conflict rule — decided in `architecture`.

## Versions

`node`, `npm:expo` (the SDK sets the React Native and React versions — resolve `react-native` and `react` with the ranges the SDK's `expo` package requires, or let `npx expo install` pick them and record what it chose), `npm:create-expo-app`, `npm:jest-expo`, `npm:@testing-library/react-native`. Flutter: `flutter` (gives the Dart SDK too), `pub:<package>`. Native: the Xcode / Android Studio and SDK versions from the official release notes, with their URLs.

## Stack packs

| Technology | Pack id | Packages |
|---|---|---|
| Expo / React Native | `expo` | `expo`, `expo-router`, `react-native` |
| Jest + RN Testing Library | `jest-expo` | `jest-expo`, `@testing-library/react-native` |
| Maestro | `maestro` | — |
| Flutter | `flutter` | `flutter` |
| SwiftUI / Jetpack Compose | `swiftui`, `jetpack-compose` | — |
| Shared with web | `typescript`, `supabase`, `git-hooks` | as in `web-stack.md` |

## ADRs

- **ADR-0002 is the app framework decision**, naming the rule that matched and the alternative it was compared with.
- One ADR each for: the offline / sync strategy (in `architecture`), the backend (or none), a held-back version, anything added (push, payments).
