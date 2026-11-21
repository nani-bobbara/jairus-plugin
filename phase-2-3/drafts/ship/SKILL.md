---
name: ship
description: "Run the feature loop over the backlog in dependency order by invoking the other command-skills: extend when a plugin is missing, then design, develop and review for each feature, each pausing at its own gates. It never releases (deploy is separate). Pass --plan for a dry run with per-feature status. Run /jairus:ship [--plan] [feature-name]."
argument-hint: "[--plan] [feature-name]"
allowed-tools: Read, Glob, Grep, Skill, Bash(node *), mcp__github__*
disable-model-invocation: true
---

# /jairus:ship

**Owns:** sequencing the feature loop only — pick the next unblocked card and invoke `extend` (if its plugin is
missing), `design`, `develop`, `review` for it. **Does NOT own** any stage, agent, gate, card move or control-file write:
those belong to the invoked skills. It never runs `deploy` and never calls an agent directly.

Target: **$ARGUMENTS** — empty = the whole backlog · `<feature>` = that card only · `--plan` = dry run.

## Step 0 — Preflight
Run rules/preflight.md (stage: ship) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
For `ship` that is part C once at start. Each invoked skill runs its own full preflight; `ship` writes nothing.

## Step 1 — Build the queue
1. Read the backlog: DEV `node ${CLAUDE_PLUGIN_ROOT}/bin/validate-backlog.mjs .jairus/product-backlog.json --unblocked`
   (validates it and lists the unblocked Backlog cards); QA the GitHub Project via github MCP. A card's stage is its status;
   the backlog wins ([state-model.md](${CLAUDE_PLUGIN_ROOT}/rules/state-model.md)).
2. Topologically sort `depends_on`; a cycle → stop and report it. Unblocked = per
   [transitions.md → Dependency unlock](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#dependency-unlock).
3. Reconcile each card: its stage vs the artifacts in `.jairus/features/<f>/`, the branch `feature/<f>` (and, QA, its PR).
   On a disagreement the backlog wins; show the drift.
4. Order ties by the `INTENT.md` order. `starter-gap` cards are never queued (worked in the starter).

## Step 2 — `--plan` (dry run, then stop)
Print, without invoking anything:

```
SHIP PLAN — <display_name>  (<dev|qa>)
 # card           stage            plugin      artifacts  branch/PR     blocked by
 1 <f>            <stage>          <plugin>    4/4 | n/4  <state>       —
Plugins to scaffold: <ids not in project.plugins>
Drift: <card: what disagrees with the backlog, or "none">
Gates that will pause the run, per card: 3 · 4 if a table changes · 5 if live Stripe (QA) · 6 · P (branch, QA)
Next action: /jairus:<skill> <feature>
```

Gate ids and meaning: the [gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry); do not restate them.

## Step 3 — Run the loop
For each card in queue order (or only the named one):
1. Skip what the backlog says is done: **Review Passed**, **Deploy** or **Done**. Otherwise start at the first stage not yet
   reached: plugin missing (`feature` card) → `extend`; Backlog/Design → `design`; Design Approved/Develop → `develop`;
   Review → `review`. Resuming is rerunning `ship`.
2. Invoke the skill with the Skill tool — `jairus:extend`, `jairus:design`, `jairus:develop`, `jairus:review` — with
   `args: <plugin-id | feature>`. It runs its own preflight, agent dispatch, gates and transitions.
3. Wait for its outcome, then re-read the card stage: advanced as expected → invoke the next skill (or the next card
   after `review`); otherwise (gate declined, escalation, failed checks, a question put to the human, a stop) → stop the run.
4. After each review print one line: `✓ <feature> → Review Passed · unlocked: <list|none>`.

Never invoke a stage for a card that is not unblocked.

## Gate
None of its own; the invoked skills present Gates 3–6 and P. `ship` only waits for each outcome.

## Handover
No card move or control-file write of its own besides the journal line for the run. When every `feature` and `config` card
is in or past Review Passed:

```
All planned features reviewed and merged: <list>
Next: /jairus:deploy   (DEV: publish to GitHub · QA: staging and production)
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:ship` |
| Backlog unreadable (QA, board unreachable) | `--plan` shows the last-known snapshot; the loop does not start |
| Dependency cycle | Stop; fix `depends_on`, then `/jairus:board --refresh` |
| A skill stops (decline, escalation, build failure) | The run shows where; fix and rerun `/jairus:<skill> <feature>` or `/jairus:ship` |
| Drift between the backlog and the artifacts or branch | Stop at that card; resolve, then rerun |
