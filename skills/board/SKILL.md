---
name: board
description: "Plan the project backlog. Reads .jairus/INTENT.md and the placeholder backlog that init created, adds one card per feature after the reserved cards (bootstrap, environment, branding) in dependency order, previews them, presents Gate 2 and writes them. Re-run any time to add features the intent gained, or to add an upgrade card when the starter has moved past the recorded pin. It plans only: /jairus:ship runs the cards. QA writes a GitHub Project through the planner agent."
argument-hint: ""
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git rev-parse *), Bash(git status *), Bash(git log *), Bash(node *), Bash(gh auth status), Bash(gh project *), Bash(gh issue *), Bash(gh label *), mcp__github__*
---

# /jairus:board

Owns **the backlog plan only**: turn the intent into cards, order them, present Gate 2 (owned only here), write them and
record the plan. Does NOT run any card (`ship`), design a feature, move a card after it is written, or touch `INTENT.md`.
`init` invokes this command (Skill tool) once the intent is approved; it can also be run on its own at any time.

No arguments: it creates the plan from the placeholder, or completes an approved backlog (adds only what is missing,
never changes an existing card).

## Step 0 — Preflight
Run rules/preflight.md (stage: board) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.
No starter-knowledge step: the planner gets no project docs (`rules/delegation.md`).

## Step 1 — Verify input contract
Check [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md) → Stage 1 input contract: `.jairus/INTENT.md` with
`status: bootstrapped`, `.jairus/jairus.json`, and (DEV) `.jairus/product-backlog.json` (the placeholder from `init`, or an
approved backlog); in QA the github MCP with `repo` + `project` scope. Also run
`node ${CLAUDE_PLUGIN_ROOT}/bin/check-intent.mjs .jairus/INTENT.md --final`; any `FAIL` → stop and show it. A missing
`product-backlog.json` in DEV: create the placeholder first with
`node ${CLAUDE_PLUGIN_ROOT}/bin/make-backlog.mjs --placeholder --out .jairus/product-backlog.json`.

## Step 2 — Plan (read-only)

**DEV** (`mode: dev`, store `file`): the plan is deterministic — no agent. Preview it with
`node ${CLAUDE_PLUGIN_ROOT}/bin/make-backlog.mjs .jairus/INTENT.md --out .jairus/product-backlog.json --dry-run` and show
every card in order: name, type, plugin, `depends_on`, stage Backlog. The reserved cards come first (`bootstrap`,
`environment`, `branding`); every feature depends on `bootstrap` and `branding`. On an approved backlog only the missing
features are listed.

**Starter moved?** When `starter.sha` in `.jairus/jairus.json` is set and
`git -C <starter.path> rev-parse HEAD` differs, offer one extra card, `upgrade-<short sha>`, in the same Gate 2 (it carries
the target ref; it waits until no card is in progress and is run by the Phase 2 build commands).

**QA** (`mode: qa`, store `github`): dispatch the `planner` agent in mode `plan` with a CRAFT envelope
([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)); inputs = the intent and, when one exists,
the board URL from `project.backlog.url`. It creates nothing in this pass. (QA ordering — the repo must exist before its
Project — is settled when QA ships: `rules/foundation.md`.)

## Step 3 — Verify the plan
Check against the Gate 2 exit criteria in the
[gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry): every INTENT feature has a card, the reserved cards
lead, every dependent has its `depends_on`/`blocked-by`, every new card starts in **Backlog**, stage names match
[state-model.md](${CLAUDE_PLUGIN_ROOT}/rules/state-model.md). QA: the planner's `BLOCKERS` must be `none` and `CHECKS` ok.
Any miss → fix the input (DEV) or re-dispatch `plan` with the gap listed (QA).

## Gate
Present **Gate 2 — backlog write** per the gates.md registry in the canonical format. Only an explicit human approval
counts. Decline / stop → the registry's decline path; nothing is written.

## Write (after approval)

**DEV:** run `node ${CLAUDE_PLUGIN_ROOT}/bin/make-backlog.mjs .jairus/INTENT.md --out .jairus/product-backlog.json` (no
`--dry-run`), and for an approved upgrade `node ${CLAUDE_PLUGIN_ROOT}/bin/backlog.mjs .jairus/product-backlog.json upgrade
<ref>`. Then **verify** `node ${CLAUDE_PLUGIN_ROOT}/bin/validate-backlog.mjs .jairus/product-backlog.json --unblocked`: it
must print `OK <n> cards` with `n` equal to the intent's feature count plus the three reserved cards (plus an upgrade card
if added), and list the unblocked cards (`bootstrap` only at first).

**QA:** dispatch `planner` in mode `create` with the approved plan only; it returns JSON (`status`, `project_url`,
`project_number`, counts, `labels_applied`, `columns_verified`, `capability_tier`, `evidence`, `partial_failures`,
`blockers`). `failed` or blockers → stop and show them; `partial` → show `partial_failures` and re-run (idempotent). Read
the created objects back via github MCP and require `columns_verified: true`.

## Record and hand over
Write only through the state tool (`rules/transitions.md`), never by hand:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus next --command "/jairus:ship" --reason "card 1 (bootstrap) brings the starter in and proves it builds" --phase start --current "backlog approved"
node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus journal --command board --event "Gate 2 approved, <n> cards in Backlog" --next "/jairus:ship"
```

Also record `project.backlog.{store, url, number}` (DEV: `url: ".jairus/product-backlog.json"`; QA: the project URL and number).

```
✅ Backlog ready — <.jairus/product-backlog.json | GitHub Project URL> · <n> cards in Backlog · unblocked: <list>
Order: <the cards in order>
Plugins this backlog needs: <distinct plugin ids>
Next: /jairus:ship   (runs card 1, the starter bootstrap). Phase 2 and 3 commands are not in this build yet: see `phase-2-3/README.md`.
```

When invoked by `init`, return control to `init` instead of printing `Next:`.

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; re-run `/jairus:board` |
| `INTENT.md` missing, `draft`, or `check-intent --final` fails | Stop: "Run `/jairus:init` first — INTENT.md must be bootstrapped and valid." |
| No `.jairus/product-backlog.json` in DEV | Create the placeholder (Step 1), then continue |
| `validate-backlog.mjs` reports problems | Do not hand-edit around it; fix the intent or the card and re-run |
| QA: github MCP lacks `project` scope | Stop: "Run `/jairus:doctor` to fix GitHub credentials." |
| QA: planner returns an incomplete plan | Re-dispatch `plan` listing the unmapped features; do not present Gate 2 |
| QA: create returns `partial` / `failed` | Report what exists (read back via MCP); re-run — existing objects are reused |
