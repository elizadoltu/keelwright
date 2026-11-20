# Security frameworks

<!--
Runtime copy of spec 7.7 (frameworks per project type) and 5.3 (security reviewer), read by the
`architecture` and `document` steps (threat model), `generate` (security-reviewer, security-review
skill, .claude/rules/security.md) and generatecheck. Editions are updated here, in the plugin —
never looked up per run. Keep in sync with keelwright-spec.md.
-->

## Frameworks per project type

The threat model's `framework` front matter and the `security-reviewer` agent name the edition exactly as written in the **Edition** column.

| Project type | Edition | Checklist behind it | Category IDs |
|---|---|---|---|
| Web | OWASP Top 10 (2025) | ASVS 5.0, level 1 | `A01`–`A10` |
| Mobile | OWASP MASVS 2 | MASVS-STORAGE, -CRYPTO, -AUTH, -NETWORK, -PLATFORM, -CODE, -RESILIENCE, -PRIVACY | `MASVS-…` |
| AI / LLM | OWASP Top 10 for LLM Applications (2025) | plus the web or API list for the rest of the system | `LLM01`–`LLM10` (and `A..` / `API..`) |
| HTTP API (library / CLI / API type, or `api-surface` with HTTP endpoints) | OWASP API Security Top 10 (2023) | ASVS 5.0, level 1 | `API1`–`API10` |
| Library or CLI (no HTTP API) | Supply chain and input handling | what the published package contains, install scripts, pinned release workflow, unsafe defaults, path and shell injection | `SC-…` free text |
| Game | OWASP API Security Top 10 (2023) for an online backend | — | `API1`–`API10` |

A project with several parts uses one edition as its main `framework` and names the others in the risks' Category column (e.g. an AI assistant: LLM Top 10 as the framework, `A01` for the dashboard's access control).

## When there is a threat model

The catalog key `threat-model` is included when **there is something to attack**:

- a backend, including a managed one (Supabase, Firebase) or serverless functions;
- user accounts or any login;
- stored personal data (also on the device, for mobile);
- an API other systems or teams call;
- an LLM that gets tools or user data;
- a package or binary others install.

Not included: a static site with no forms and no third-party data collection, an offline single-player game, a local script nobody else installs. Those projects get no `security-reviewer`; their `reviewer` keeps a short security section instead.

## What the security reviewer always checks

Besides the project's `SEC-` risks, for the framework of its type:

| Area | Web / API | Mobile | AI / LLM |
|---|---|---|---|
| Access control | every route and handler checks the role or owner; RLS on every exposed table | server enforces it, not the app | tools act with the user's rights, never more |
| Injection | parameterised queries, no string-built SQL / shell / HTML | WebView and deep-link input | prompt injection reaching tools; model output never executed or rendered raw |
| Auth and sessions | the framework's or provider's auth, no home-made crypto, secure cookies | tokens in the keychain / keystore | — |
| Secrets | server-only env vars; nothing secret in client bundles | no secrets in the app binary | provider keys server-side only |
| Data exposure | errors and logs without personal data or stack traces | no personal data in logs or backups | what reaches the provider matches the PRD's privacy NFRs |
| Dependencies | a new dependency is maintained and has no known advisory | same | same |

## How findings are reported

At most 5, most severe first. Each: `file:line`, the `SEC-` ID or framework category, severity (critical, high, medium, low), the evidence (what input reaches what), and the concrete fix. "Approve" when there are none — no speculative findings: a finding names the path the attack takes.
