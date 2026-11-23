# Step: `brief`

Write the client brief: what was agreed with the client — stakeholders and who signs off, the commercial frame, the agreed scope and exclusions, how the client wants to work — so the PRD and everyone after it build on the agreement, not on guesses. **Only for a project delivered for a client.**

**Reads:** the project input, `.keelwright/interview.md`, `<plugin root>/reference/catalog.md`, the template `client-brief.md`. On a re-run: the existing `docs/client/brief.md`.
**Produces:** `docs/client/brief.md`; `client-brief` in the document set.
**Gate:** Gate 1, shared with `prd` — each approved by its own owner.

**Who runs it:** the account manager (spec 5.7) — the person who owns the client relationship; on a team without one, the project manager. A tech lead, a developer or someone without a role can run it too. A project manager, business analyst or designer never sees commercial values they didn't give.

## 1. Is this a client project?

From the input and the interview: is the product being built **for another organisation** — a client of an agency, a customer of a supplier? Signs: a client named, a contract, a statement of work, a proposal, "the client wants…", a deadline set by someone outside the team.

- **No** (an internal tool, a personal or in-house product): `STATE skip brief --reason "<why: e.g. an internal tool for our own office>"` and stop.
- **Unclear**: ask once (AskUserQuestion): **For a client** · **Internal / our own product**.

## 2. Ask what only the account manager knows

The interview covers the product. Ask the account manager (AskUserQuestion, one round, at most 4 questions, only what the input doesn't say) about the agreement — never about technology:

- who signs off scope and releases on the client side, and who the sponsor is;
- the contract type and the deadline (and why it matters);
- what was explicitly left out or promised during sales;
- how the client wants updates (channel, cadence) and who accepts a release.

Budget and rates: only if the account manager offers them; offer "Not shared" as the first option. What they can't answer yet becomes a question for the client.

## 3. Write `docs/client/brief.md`

From `templates/client-brief.md`. Front matter: `status: draft`, today's date, `owner` = the profile's name (the command passes it), `client` = the organisation.

- Everything in the client's words; nothing about how it will be built.
- Every unknown that only the client can answer is a `[NEEDS CLARIFICATION (am): …]` in **Questions for the client**, phrased so it can be sent to the client as it is: plain words, one question each, with the options when there are some ("Should members be able to cancel a booking themselves, or only through the front desk?").
- Add `client-brief` to the document set: `STATE set documents <the current set, plus client-brief>` (`STATE status --json` has the current set).

## 4. Check and finish

1. `node "<plugin root>/scripts/doccheck.mjs" client-brief:docs/client/brief.md` — fix and re-run until it passes (`STATE metric brief doccheck-failures +1` per failed run).
2. `STATE complete brief docs/client/brief.md`.

## Gate summary

Show, besides the generic gate content:
- the stakeholders and who signs off, in one line;
- the commercial frame in one line each (contract, deadline, change requests);
- the exclusions;
- the questions for the client, ready to send.

## On approval

Set `status: approved` in `docs/client/brief.md`.
