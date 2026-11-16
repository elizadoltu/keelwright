# Security policy

## Supported versions

KeelWright is pre-1.0. Only the latest released version receives security fixes.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please don't report security vulnerabilities in public issues.**

Report them privately through GitHub: on the repository page, open the **Security** tab and choose **Report a vulnerability**. Include:

- what the problem is and where (file, command or step),
- how to reproduce it,
- what an attacker could achieve.

You'll get an acknowledgement within 7 days. Once the issue is confirmed, a fix is prepared in a private advisory and released as soon as possible; you'll be credited in the advisory unless you prefer not to be.

## Scope

KeelWright runs inside Claude Code in the user's project and can create files and run commands there. Reports are especially welcome for:

- steps or scripts that write outside the project folder, or that `.keelwright/state.json` could be used to redirect,
- generated configuration that weakens security in the generated project (e.g. overly broad Claude Code permissions, secrets written to files, disabled secret scanning),
- commands run during scaffolding or version lookups that could be influenced by untrusted input,
- secrets or personal data ending up in generated documents or the state file.

Vulnerabilities in Claude Code itself or in third-party packages that a generated project installs should be reported to their maintainers.
