---
name: develop
description: "Implement one feature from its approved design inside its plugin: creates the feature branch, commits the approved design, dispatches the developer (domain to UI to tests), raises Gate 4 (schema) and Gate 5 (live Stripe, QA) only when signalled, checks the build and AC traceability, and in QA presents Gate P to push and open the PR. Needs the card in Design Approved, Develop or Review. Run /jairus:develop <feature-name>."
argument-hint: "<feature-name>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git switch *), Bash(git checkout *), Bash(git branch *), Bash(git merge *), Bash(git rev-parse *), Bash(git show *), Bash(git init *), Bash(git fetch *), Bash(git push *), Bash(pnpm *), Bash(node *), Bash(gh pr create *), mcp__neon__*, mcp__stripe__*, mcp__github__*
---

# /jairus:develop

**Owns:** the implementation of one feature: branch, design commit, `developer` dispatch, Gates 4 and 5 when
signalled, exit checks, Gate P (branch, QA) and the Develop → Review transition. **Does NOT own** design
artifacts, code review, merging or releasing. The orchestrator never writes application code itself.

Feature: **$ARGUMENTS**

## Step 0 — Preflight
Run rules/preflight.md (stage: develop) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.
If the card needs the database and `node ${CLAUDE_PLUGIN_ROOT}/bin/prelive.mjs .jairus/prelive.json check --before develop`
lists open items, stop and name them: the human clears or acknowledges them first.

## Step 1 — Verify input contract, branch, commit the design
Check [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md) → Stage 3 input contract:
1. Card in **Design Approved**, **Develop** or **Review**; in/past **Review Passed** → stop (a change to a finished
   feature is a new `bug`/`change` card via the Unplanned Work Protocol).
2. The four artifacts exist and `check-feature.mjs .jairus/features/$ARGUMENTS/spec.json --final --intent
   .jairus/INTENT.md` prints `OK` with `status: "approved"`.
3. The spec's plugin exists and is enabled (`plugins/<id>/`, listed in `project.plugins`). Missing → stop:
   `Run /jairus:extend <id> first.` A `config` card has no plugin.
4. Dependencies unblocked ([transitions.md](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#dependency-unlock)).

Then:
1. **Branch** `feature/$ARGUMENTS` from the base branch exactly as
   [development.md → Git workflow](${CLAUDE_PLUGIN_ROOT}/rules/development.md#git-workflow) defines (DEV: local
   `main`; QA: fresh `origin/main` with the stash rule). It already exists → switch to it inside the same rule.
2. **Commit point 1** ([transitions.md](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#commit-points--working-tree)):
   on a new branch, commit `.jairus/` (this design + ride-alongs): `docs($ARGUMENTS): approved design`.
3. Move the card Design Approved → Develop; read it back; journal line.

## Step 2 — Dispatch `developer`
Verify the starter docs for this dispatch exist and dispatch the `developer` (mode `implement`) with a CRAFT
envelope ([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)): **Resources** = the
`developer` row of [delegation.md](${CLAUDE_PLUGIN_ROOT}/rules/delegation.md) (rules to apply, tools), **Starter knowledge** = its `develop` files (the plan's `read` docs and touched-folder
READMEs resolved from `spec.json`), the scope contract, the plugin id, the branch (already checked out — the agent
never creates or switches branches), and the live backend state. Standards:
[development.md](${CLAUDE_PLUGIN_ROOT}/rules/development.md), [security.md](${CLAUDE_PLUGIN_ROOT}/rules/security.md).

## Step 3 — Route the developer's `status`
- `gate_required: "gate4"` → present **Gate 4 — schema** per the
  [gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry); `"gate5"` (QA only) → **Gate 5 — live Stripe**.
  Re-dispatch with the decision (`gate4: approved`, `gate5: approved | deferred`). No signal → no gate. Gate 4
  changes only the dev branch, through `TARGET_ENV=development pnpm db:setup`, with `verify-rls` evidence.
- `needs_confirmation` → stop; show its ambiguity; re-dispatch with the human's answer. A `kind:
  extension-request` becomes a `starter-gap` card (Unplanned Work Protocol); the feature continues only with what
  the contribution points allow.
- `blocked` → stop; show `blockers` (and `draft_issue`). `failed` → repair per Step 4.3. `complete` → Step 4.

## Step 4 — Verify output contract
1. Run the [build checks](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#build-checks) at the root, including the zone check
   and `check-feature.mjs … --built --root .`; they must agree with the returned `checks`.
2. Verify `ac_coverage` is N/N, `gate4` applied if a table changed, `gate5` created or deferred (QA),
   `extension_plan_followed: true` (false → its `extension_plan_deviations` are failing output).
3. Any failure → re-dispatch the developer in mode `fix` with the failing output, within the
   [build-check repair cap](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#caps-the-only-place-caps-are-defined); cap reached → stop.

## Gate
None at exit. Gates 4 and 5 are raised mid-stage when signalled. **QA only:** present **Gate P (branch)**
([gates.md](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#gate-p--publish-procedure)) before anything is pushed.

## Handover
1. DEV: nothing leaves the machine; the commits are local on `feature/$ARGUMENTS`. QA: after Gate P is approved,
   push the branch and open the PR via github MCP (`Bash(gh pr create *)` only if the MCP is unavailable) with
   `node ${CLAUDE_PLUGIN_ROOT}/bin/render-feature.mjs .jairus/features/$ARGUMENTS/spec.json` as the body, read it back;
   a PR already open is updated, never duplicated.
2. Move the card Develop → **Review**; make the `develop` row of the write table (cursor → review, snapshot incl.
   `gate5` = `done | deferred | n/a`, the card's `branch` and `pr`); journal line.

```
✅ Development complete — $ARGUMENTS · build checks green · Gate 4 <applied|n/a> · Gate 5 <live|deferred|n/a> · <local commits | PR #n>
Next: /jairus:review $ARGUMENTS
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:develop $ARGUMENTS` |
| Card before Design Approved, artifacts missing or spec not approved | Stop: run `/jairus:design $ARGUMENTS` |
| Plugin not scaffolded | Stop: run `/jairus:extend <id>` |
| Card in/past Review Passed | Stop: new `bug`/`change` card via the Unplanned Work Protocol |
| `git pull --ff-only` fails or the stash pop conflicts (QA) | Stop; follow commit point 4 |
| Gate 4/5 declined or stopped | Development pauses at that step; rerun to resume |
| Build or traceability checks still fail at the cap | Stop; show the full failing output |
| PR creation fails (QA) | Report the github error; the branch is pushed — rerun to retry |
