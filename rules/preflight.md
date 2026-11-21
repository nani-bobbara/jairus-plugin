# Preflight — the first step of every stage command

Every stage command runs this protocol **before** it verifies its input contract, dispatches an
agent, moves a card, or writes a control file. Any failure stops the command with the exact message
below. Nothing is dispatched on a failed preflight.

Three parts, run in order: **A** connectivity → **B** foundation green → **C** resume + version
check. Which parts a command runs is fixed by the [Stage applicability](#stage-applicability)
table. All parts are mode-aware (`rules/modes.md`): read `.jairus/jairus.json → mode` first.

## A — Connectivity (Step 0)

Required MCP servers per stage:

| Stage | Command | DEV | QA |
|---|---|---|---|
| 1 | `board` | — | github |
| 2 | `design` | neon | neon + github |
| 3 | `develop` | neon | neon + stripe + github |
| 4 | `review` | neon | neon + github |
| 5 | `deploy` | — (Gate P uses `gh`, checked at the gate) | vercel + github + stripe + neon |
| 6 | `extend` | — | github |

- Test each required server with **one lightweight read** (github: read the repo; neon: list
  projects/branches; stripe: list products; vercel: list projects).
- A required server fails → stop:

  ```
  MCP server <name> is not connected. Run /jairus:doctor to diagnose before continuing.
  ```

- DEV needs the neon MCP for read-only verification only; a DEV project never needs github,
  stripe or vercel connected.

## B — Foundation green

Read `.jairus/jairus.json → project.foundation.status`. It must equal `"green"`.

- Not green → find the first step in `F0 … F10, F-VERIFY` whose entry in
  `project.foundation.steps` is not `done`, `deferred` or `skipped`. Stop:

  ```
  Foundation is not green. Run /jairus:board --start to complete the bootstrap card
  (rules/foundation.md); next incomplete step: <F-step>.
  ```

- `.jairus/jairus.json` absent → stop with the C1 message below.
- `deploy` in QA additionally needs `project.foundation.scope == "release"`; otherwise stop with the
  next incomplete release step (F8–F10).
- Do not dispatch. Foundation gates are in `rules/gates.md`.

## C — Resume + version check

`.jairus/jairus.json` is a cursor + cache; the backlog is the status source of truth
(`rules/state-model.md`). Run C1–C3 on every preflight; run C4 on the first jairus command of a
session and after a compaction.

1. **Read `.jairus/jairus.json`** (the product's `.jairus/` folder). Absent → stop:

   ```
   This repo is not initialized. Run /jairus:init first.
   ```

   Exception: absent `.jairus/jairus.json` **and** a reachable backlog (`.jairus/product-backlog.json`, or the board in QA)
   → rebuild `.jairus/jairus.json` from the backlog + git/files and continue.

2. **Version check** — compare `.jairus/jairus.json → jairus_version` with `version` in
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`:

   | Result | Action |
   |---|---|
   | same | continue |
   | plugin newer, **patch or minor** | re-stamp `jairus_version`, note the bump in the command output |
   | plugin newer, **major** | **stop and prompt**: summarize what changed; re-stamp only on explicit human approval. A project whose `schema_version` is lower than the template's is never migrated silently: stop and say it must be re-initialized. |
   | plugin older than `jairus_version` | stop: "This project was last run with jairus <x>; update the plugin before continuing." |

3. **Reconcile against reality** — never trust the cursor/snapshot blindly:
   - Backlog reachable → refresh `snapshot` from it. **The backlog wins** on any disagreement.
   - Cross-check cheap ground truth: feature branch `feature/<name>` exists (only for cards in
     **Develop** or **Review**), the four design artifacts (PRD.md, DESIGN.md, ADR.md, spec.json) are in `.jairus/features/<name>/`, and every
     plugin a Design Approved card names is scaffolded (`plugins/<id>/`). A cursor that says a stage
     is done while its evidence is missing → surface the drift and stop.

4. **Report and resume** — read the last ~10 lines of `.jairus/journal.md` to learn where the previous
   session stopped and what it said should come next (a hint; the backlog and `jairus.json` still
   decide), then state what is completed, the active feature/stage, what is queued (in
   dependency order, `rules/transitions.md`), and the single next action.

### Degradation

| Situation | Behaviour |
|---|---|
| QA, no github MCP / no board yet | read the `.jairus/jairus.json` snapshot, say status is **last-known, not live**; block gate-dependent actions. Exempt: `init` and `board` while `project.backlog.url` is empty |
| `.jairus/jairus.json` missing, backlog exists | rebuild `.jairus/jairus.json` from the backlog + git/files |
| `.jairus/jairus.json` and backlog disagree | the backlog wins; re-stamp `.jairus/jairus.json` from it |

## Stage applicability

| Command | A — connectivity | B — foundation green | C — resume + version |
|---|---|---|---|
| `board` | github (QA) | — (it runs during Foundation) | yes |
| `design` | yes | yes | yes |
| `develop` | yes | yes | yes |
| `review` | yes | yes | yes |
| `deploy` | yes | yes | yes |
| `ship` | — (each card it runs checks what it needs) | — (it runs the bootstrap card that produces green) | yes, once at start |
| `extend` | github (QA) | yes | yes |
| `init` | — (own F0 checks) | — (intent only) | — (own `.jairus/jairus.json` detection) |
| `doctor`, `help` | — | — | — |

## Paste block

Every stage command's first step is exactly:

```
## Step 0 — Preflight
Run rules/preflight.md (stage: <name>) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.
```
