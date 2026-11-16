---
status: draft            # draft | approved
date: YYYY-MM-DD
owner: <name>
---

# Store release checklist: <App name>

<!--
Rules for this document:
- Covers everything needed to ship to the App Store and Google Play beyond the code itself.
- The "Project setup" sections are filled once; the "Per release" checklist is copied into
  each release PR or issue.
- Store rules change often: re-check the current Apple App Review Guidelines and Google Play
  policies before the first submission and at least once a year.
- Target length: 1–2 pages.
-->

## Project setup (once)

### Identifiers and accounts

| Item | iOS | Android |
|---|---|---|
| App ID / package name | <com.example.app> | <com.example.app> |
| Developer account | <Apple Developer team> | <Google Play Console account> |
| Signing | <certificates / profiles, managed by EAS / fastlane / Xcode> | <upload key, Play App Signing> |
| Build service | <EAS Build / Xcode Cloud / CI> | <EAS Build / Gradle in CI> |

### Versioning

- User-facing version: <SemVer, e.g. 1.4.0>
- Build number: <incremented automatically on every build, never reused>
- Minimum OS versions: <iOS x / Android API y>

### Store listing

- [ ] Name, subtitle / short description, full description
- [ ] Keywords (iOS), category, content / age rating questionnaire
- [ ] Screenshots for every required device size, app icon, feature graphic (Android)
- [ ] Privacy policy URL and support URL
- [ ] Demo account and notes for app reviewers (if the app has a login)

### Privacy and permissions

- [ ] App Privacy details (iOS) and Data safety form (Android) match what the app actually collects
- [ ] Every permission has a purpose string that explains why — see screen flow "Permission prompts"
- [ ] App Tracking Transparency prompt, if the app tracks across apps
- [ ] In-app account deletion, if users can create an account

### Payments

<!-- Delete if the app has no payments. -->

- [ ] Digital goods use the platform's in-app purchase system, unless an exception applies
- [ ] Products / subscriptions configured in both stores

## Per release

- [ ] Version and build number bumped
- [ ] Release notes written (user-facing, from the changelog)
- [ ] Tested on the device matrix: <list of devices / OS versions>
- [ ] Internal testing: TestFlight / Play internal track, sign-off by <name>
- [ ] Crash-free rate of the previous release reviewed
- [ ] Store listing and screenshots updated if the UI changed
- [ ] Privacy declarations updated if data collection changed
- [ ] Submitted for review
- [ ] Rollout: <phased release (iOS) / staged rollout % (Android)>, plan to reach 100% by <day>
- [ ] Monitoring after release: crash-free sessions ≥ <target>, ANR rate, reviews

## Rollback plan

- <how to halt a staged rollout, and how fast a fix release can ship>

## Open questions

- [NEEDS CLARIFICATION: <question>]
