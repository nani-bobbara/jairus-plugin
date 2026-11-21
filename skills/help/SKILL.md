---
name: help
description: "Show the reference for the jairus commands (what is available now and what is planned), generated at run time from the command-skills' own frontmatter and bodies; pass a command name for detail on one. Never runs the pipeline or writes anything. Run /jairus:help [command]."
argument-hint: "[command-name]"
allowed-tools: Read, Glob
---

# /jairus:help

**Owns:** documentation generated at run time from the command-skills. **Does NOT own** any fact it prints: gates,
modes, the state model and the stack live in `rules/` and are only named here. It never runs the pipeline and writes
nothing. `skills/` holds the first-phase command-skills: `doctor`, `init`, `board`, `ship`, `help`. The later-phase commands
(`extend`, `design`, `develop`, `review`, `deploy`) are parked in `phase-2-3/` and listed from its README. The
plugin carries no other skills: the starter's own docs are the knowledge.

All paths are under `${CLAUDE_PLUGIN_ROOT}`. Keep the output scannable — no long prose.

## Step 0 — Preflight
None (exempt per `rules/preflight.md` → Stage applicability).

## Step 1 — One command (argument given)
If `$ARGUMENTS` is one of the command-skills in `skills/`, Read `skills/$ARGUMENTS/SKILL.md` and print:
- **Usage:** `/jairus:$ARGUMENTS <argument-hint>` (frontmatter)
- **What it does:** two or three lines from `description` and the *Owns / Does NOT own* lines
- **Preflight:** the Step 0 summary (which parts of `rules/preflight.md` it runs)
- **Agents dispatched:** the agents its body names (their resources are in `rules/delegation.md`)
- **Gates:** the gate ids its `## Gate` section names (meaning: `rules/gates.md`)
- **Next:** the `Next:` line of its `## Handover`
- **Model invocation:** whether `disable-model-invocation` is set (you must type it yourself)

Then stop — do not print the full reference.

## Step 2 — Full reference (no argument)
0. **Where you are** (when `.jairus/jairus.json` exists in the current directory): run `node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus show` and
   print its lines first — mode, foundation, the current step, the **next action** and why, any blocker, the backlog status and
   the unblocked cards, and any `note:` line (a disagreement between `jairus.json` and the backlog, with the command that fixes
   it). That block is the answer to "what is current and what is next" in any session; the backlog stays authoritative for stages.
1. Read `version` from `.claude-plugin/plugin.json`.
2. Read the frontmatter (`description`, `argument-hint`, `disable-model-invocation`) of each `skills/<name>/SKILL.md`, and `phase-2-3/README.md` for the planned commands.
3. Print, building every line from what you read (nothing hand-copied):

```
Jairus v<version> — agentic micro-SaaS control plane (human approval at every 🚦 gate)

PHASE 1 · START   (available)
  doctor  <argument-hint>   <first sentence of description>
  init    …
  board   …
  ship    …
  help    …
PHASE 2 · BUILD   (planned — not in this build)
  <command>  <purpose from phase-2-3/README.md>   (extend, design, develop, review)
PHASE 3 · RELEASE (planned — not in this build)
  <command>  <purpose from phase-2-3/README.md>   (deploy)

TYPICAL FLOW
  New project : /jairus:doctor → /jairus:init (mode → intent) → /jairus:board (backlog) → /jairus:ship (run card 1, then the environment card when you are ready)
  Any time    : /jairus:doctor (readiness and every dependency, safe to repeat) · /jairus:help (where you are and what is next)
  Details     : /jairus:help <command>

RULES (the owners — read these, not this help)
  modes · state-model · transitions · gates · preflight · foundation · delegation · starter-contract · security   (rules/<name>.md)
```

- The order is fixed as above. A Phase 1 name with no file → print `(missing)` on its line; planned commands are never `(missing)`.
- Never print gate tables, stack tables, the state model, counts of commands, agents, skills or rules, or per-agent model lists:
  the output names the owning rules file instead.

## On error
| Error | Recovery |
|---|---|
| The named command is not one of the four in `skills/` | "Command `$ARGUMENTS` not found." then list the available commands (a planned one: say it is not in this build yet, per `phase-2-3/README.md`) |
| `plugin.json` unreadable | Print `Jairus (version unknown)` and continue; suggest `/jairus:doctor` |
| No `.jairus/` in the current directory | Print the full reference; note at top: "No jairus project here. Run `/jairus:init` in an empty workspace." |
