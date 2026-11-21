---
name: review
description: "Review one feature before it merges: runs the build checks, the zone check and AC traceability, has the reviewer score the diff against the approved design, loops developer fixes to 8/10 or better, presents Gate 6, and on approval commits the control files and merges (locally in DEV; after CI on GitHub in QA), then unlocks dependents. Run /jairus:review [feature-name]."
argument-hint: "[feature-name]"
allowed-tools: Read, Edit, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git switch *), Bash(git checkout *), Bash(git branch *), Bash(git merge *), Bash(git rev-parse *), Bash(git show *), Bash(git init *), Bash(git fetch *), Bash(pnpm *), Bash(node *), Bash(gh pr view *), Bash(gh pr checks *), Bash(gh pr edit *), Bash(gh pr merge *), mcp__neon__*, mcp__github__*
---

# /jairus:review

**Owns:** the review of one feature: build precheck, `reviewer` dispatch, the fix-loop, Gate 6, the merge and the
Review → Review Passed transition. **Does NOT own** the fixes (the `developer` makes them) or releasing. `Edit` is
used only on control files — never on application code or artifacts.

Feature: **$ARGUMENTS** — if empty, infer it from `git branch --show-current` (strip `feature/`).

## Step 0 — Preflight
Run rules/preflight.md (stage: review) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.

## Step 1 — Verify input contract
Check [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md) → Stage 4 input contract: card in **Review**,
`feature/<f>` ahead of the base branch (QA: its PR open), the four artifacts present.

Switch to `feature/<f>` inside the stash rule (QA, [commit point 4](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#commit-points--working-tree));
stay on it for the checks and every fix pass. **Build precheck:** the
[build checks](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#build-checks) (install, `gate:core`, zone, spec traceability);
any failure → stop before dispatching the reviewer.

## Step 2 — Dispatch `reviewer` (mode `code`)
Verify the starter docs for this dispatch exist and dispatch the `reviewer` with a CRAFT envelope
([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)): **Resources** = the `reviewer` row of
[delegation.md](${CLAUDE_PLUGIN_ROOT}/rules/delegation.md) (rules to apply, tools), **Starter knowledge** = its `review` files, the full scope contract, the diff range
`<base>...feature/<f>`, the build precheck result and `iteration`. Dimensions and report format:
[quality-gate.md](${CLAUDE_PLUGIN_ROOT}/rules/quality-gate.md).

## Step 3 — Verify output + fix-loop
1. The reviewer returns JSON per its Return contract. `status: blocked` → stop, show `blockers`. An unverified
   security finding counts as HIGH.
2. Route on `score` + `blocker_count` and run the fix-loop with the `developer` in mode `fix` (passing `findings`;
   its Resources and `review` files per delegation.md) per the
   [Fix-Loop Protocol](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#fix-loop-protocol-shared-by-design-and-review) within
   its caps. After each fix: re-run the build checks, then the next reviewer pass (`extension_plan_followed: false` →
   its deviations go back as findings). `gate_required` → present that gate and relay the decision;
   `needs_confirmation` / `blocked` / `failed` → stop and show it; a `draft_issue` follows the Unplanned Work Protocol.

## Gate
Present **Gate 6 — review** per the [gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry) in the canonical
format (score trend, files changed, `findings_resolved`, remaining non-blocking findings, `ac_coverage`; QA also the PR
link and that approving covers the single push of commit point 2). Only an explicit human approval counts. Decline →
the registry's decline path and caps; the card stays in **Review**.

## Handover
On approval, in order:
1. Write the `review` row of the write table, then
   [commit point 2](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#commit-points--working-tree): commit the control files on
   `feature/<f>`.
2. **DEV:** merge `feature/<f>` into local `main` (`git switch main`, `git merge --no-ff feature/<f>`); the build checks
   are already green. **QA:** push the commit (covered by this approval), update the PR body from
   `node ${CLAUDE_PLUGIN_ROOT}/bin/render-feature.mjs …/spec.json`, **wait for CI** on the pushed head
   ([gates.md → CI wait](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#ci-wait-gate-6-qa); failure or timeout → stop, the card
   stays in Review), then merge via github MCP and read the merge back. A `.jairus/jairus.json` conflict with `main`
   follows transitions.md → `jairus.json` conflicts; any other conflict → stop.
3. Move the card Review → **Review Passed** (read back), report each newly unlocked dependent
   ([transitions.md → Dependency unlock](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#dependency-unlock)), journal line.

```
✅ Review passed and merged — <feature> · score N/10 · unlocked: <list|none>
Next: the next feature via /jairus:ship  ·  /jairus:deploy  (DEV: publish; QA: release everything merged)
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:review` |
| Card not in Review, or QA: no open PR | Stop: run `/jairus:develop <feature>` first |
| Build precheck fails | Stop: "Fix build failures first — run `/jairus:develop <feature>`." |
| Fix-loop cap reached | Escalate per [gates.md](${CLAUDE_PLUGIN_ROOT}/rules/gates.md); wait for human guidance |
| `ac_coverage` incomplete | Gate 6 cannot be approved; route to the developer via the fix-loop |
| QA: CI fails or times out | Stop; report the check; card stays in Review; fix via the developer, then rerun |
| Merge fails | Report the error; card stays in Review; resolve via the developer, then rerun |
