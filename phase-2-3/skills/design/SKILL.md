---
name: design
description: "Design one feature before any code: checks its card, scope contract and dependencies, dispatches the designer to produce PRD, DESIGN, ADR and the structured spec.json (acceptance criteria, Extension plan, entry-point guards), runs the design-review fix-loop to 8/10 or better, then presents Gate 3. Run /jairus:design <feature-name>."
argument-hint: "<feature-name>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git switch *), Bash(git checkout *), Bash(git branch *), Bash(git merge *), Bash(git rev-parse *), Bash(git show *), Bash(git init *), Bash(git fetch *), Bash(node *), mcp__neon__*, mcp__github__*
---

# /jairus:design

**Owns:** the design of one feature: input checks, `designer` + `reviewer` dispatch, Gate 3 and the Design →
Design Approved transition. **Does NOT own** application code, the backlog layout or the scoring rules. The
orchestrator writes no artifact itself, except setting `spec.json` `status: "approved"` after Gate 3.

Feature: **$ARGUMENTS**

## Step 0 — Preflight
Run rules/preflight.md (stage: design) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.

## Step 1 — Verify input contract
Check [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md) → Stage 2 input contract:
1. **Scope contract** — `$ARGUMENTS` is a card in `.jairus/INTENT.md` with a non-empty `description` and an
   `out_of_scope` list (`node ${CLAUDE_PLUGIN_ROOT}/bin/check-intent.mjs .jairus/INTENT.md --final`). Missing →
   stop; the human edits the intent.
2. **Dependencies** — every `depends_on` card is unblocked per
   [transitions.md → Dependency unlock](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#dependency-unlock)
   (`bin/validate-backlog.mjs --unblocked` in DEV).
3. **Stage** — Backlog or Design. In/past Design Approved → stop (the human moves the card back first).
   In/past Review Passed → a change is a new card (Unplanned Work Protocol,
   [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#unplanned-work-protocol)).
4. **Plugin** — a `feature` card names its plugin; a missing `plugins/<id>/` is fine here (the design records
   `extend` as a prerequisite).

Move the card Backlog → Design ([transitions.md](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md)); read it back.

## Step 2 — Dispatch `designer`
Verify the starter docs for this dispatch exist (missing required → stop with the message in
[delegation.md](${CLAUDE_PLUGIN_ROOT}/rules/delegation.md#orchestrator-protocol)) and dispatch the `designer`
(mode `design`) with a CRAFT envelope ([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)):
**Resources** = the `designer` row of delegation.md (rules to apply, tools),
**Starter knowledge** = its `design` files, the full scope contract, the card, the templates path
(`${CLAUDE_PLUGIN_ROOT}/templates/feature/`) and the live backend state. Standards:
[design-workflow.md](${CLAUDE_PLUGIN_ROOT}/rules/design-workflow.md),
[security.md](${CLAUDE_PLUGIN_ROOT}/rules/security.md).

By `Status` of `DESIGNER RETURN`: `blocked` → stop, show `Blockers`; `partial` → re-dispatch with the missing items;
`complete` → Step 3. Answer `Open questions` first; any `[BLOCKS GATE]` one blocks Gate 3. Carry `Schema change`
and `Billing` into the gate summary (they predict Gates 4 and 5), and each `Extension requests` entry becomes a
`starter-gap` card by the Unplanned Work Protocol.

## Step 3 — Verify output + review fix-loop
1. Verify the output contract: the four artifacts exist with no `{{` or `<!-- NOTE:` left, and
   `node ${CLAUDE_PLUGIN_ROOT}/bin/check-feature.mjs .jairus/features/$ARGUMENTS/spec.json --final --intent .jairus/INTENT.md`
   prints `OK`. Anything else → re-dispatch the designer listing it.
2. Dispatch the `reviewer` (mode `design`; Resources from its row, `Starter knowledge:` its `design` files);
   `status: blocked` → stop. Route on `score` + `blocker_count`, passing `findings` to the `designer` (mode `fix`),
   per the [Fix-Loop Protocol](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#fix-loop-protocol-shared-by-design-and-review)
   within its caps.

## Gate
Present **Gate 3 — design handover** per the [gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry) in the
canonical format: score trend, the four artifacts, and the Extension plan from
`node ${CLAUDE_PLUGIN_ROOT}/bin/render-feature.mjs .jairus/features/$ARGUMENTS/spec.json`. Only an explicit human
approval counts. Decline → the registry's decline path and caps; the card stays in **Design**.

## Handover
On approval: set `spec.json` `status: "approved"` (the only artifact edit); move the card Design → **Design
Approved** and read it back; write the `design` rows of the write table (cursor → develop, snapshot incl. `plugin`)
and a journal line. The artifacts stay uncommitted until `develop` commit point 1.

```
✅ Design approved — $ARGUMENTS · score N/10 · plugin <id> · .jairus/features/$ARGUMENTS/
Next: /jairus:extend <id>   (plugin not scaffolded yet)   ·   /jairus:develop $ARGUMENTS
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:design $ARGUMENTS` |
| Card missing, empty `description` or no `out_of_scope` | Stop: edit `.jairus/INTENT.md`, then rerun |
| A dependency is not in Review Passed or Done | Stop: list each blocking card and its stage |
| Card in/past Design Approved | Stop: the human moves it back first; past Review Passed: new card |
| Designer `blocked` / `partial` | Show blockers / re-dispatch with the exact missing items |
| `check-feature.mjs` fails | Re-dispatch the designer with the `FAIL` lines; never present Gate 3 |
| Fix-loop cap reached | Escalate per [gates.md](${CLAUDE_PLUGIN_ROOT}/rules/gates.md); wait for human guidance |
