# Transitions — card moves and control-file writes

The backlog is the status source of truth; `.jairus/jairus.json` is the cursor + cache
(`rules/state-model.md`). This file lists every allowed card move and every control-file write.
Anything not listed here is not allowed.

## Journal — every command appends one line per event

Besides its rows below, every command appends a line to `.jairus/journal.md` (format and events:
`rules/state-model.md` → `.jairus/journal.md`) when a stage starts, a gate is presented, approved or
declined, the command stops (with the reason), and when a session resumes. The line ends with
`next: <the single next action>`. Agents never write it; it never holds a secret. It is committed with
the rest of `.jairus/` at the commit points.

## Hard rule — commands write, agents return

- **Only commands** move cards and write `.jairus/jairus.json` / `.jairus/product-backlog.json`.
- **Agents never do either.** An agent returns a structured result (artifacts, findings, gate
  signal, URLs); the command verifies it, presents the gate, then makes the move/write below.
- A gate move happens only after explicit human approval (`rules/gates.md` → Approval rule).
- "The backlog" is `.jairus/product-backlog.json` (DEV) or the GitHub Project (QA), `rules/modes.md`. Every move is
  read back from the store before the command reports success (the file, or github MCP).

## Card transition table

Stage names: `rules/state-model.md`.

| Command | Trigger | Gate | From | To |
|---|---|---|---|---|
| `board` | Gate 2 approved (create mode) | 2 | — (new cards, `bootstrap` first) | Backlog |
| `ship` | Gate F-VERIFY approved | F-VERIFY | Backlog (card `bootstrap` only) | Done |
| `ship` | environment proof passes | F-VERIFY | Backlog (card `environment` only) | Done |
| `design` | preflight + input contract pass | — | Backlog | Design |
| `design` | Gate 3 approved | 3 | Design | Design Approved |
| `develop` | preflight + input contract pass | — | Design Approved | Develop |
| `develop` | exit criteria pass | — | Develop | Review |
| `review` | Gate 6 approved (merged) | 6 | Review | Review Passed |
| `deploy` (QA) | preflight + input contract pass | — | Review Passed (every such card; cards already in Deploy stay) | Deploy |
| `deploy` (QA) | Gate 8 approved and production `READY` | 8 | Deploy (every card listed at Gate 7) | Done |
| any stage command | human typed `CREATE_ISSUE` (Unplanned Work Protocol, `rules/pipeline.md`) | — | — (new card, type `bug`, `change` or `starter-gap`) | Backlog |

Rules:
- Declines and stops never move a card; it stays where it is.
- Never move a card backward and never skip a stage. Only a human moves a card backward.
- `deploy` is re-runnable: a card moves Review Passed → Deploy once.
- DEV `deploy` (Gate P, initial) moves no card.
- `ship` and `init` move no card themselves; they invoke `design`/`develop`/`review` and `board`. `ship` moves only the `bootstrap` card, Backlog → Done, at Gate F-VERIFY.

## Changes after Review Passed

A card in **Review Passed**, **Deploy** or **Done** is never re-opened, re-designed or patched. A
change it needs becomes a **new card** (`bug` or `change`) via the Unplanned Work Protocol and
follows the full gated flow. `design` stops on a card in/past Design Approved and `develop` stops
on a card in/past Review Passed.

## Feature artifacts

`.jairus/features/<f>/` holds PRD.md, DESIGN.md, ADR.md and `spec.json` (`rules/design-workflow.md`). The
`designer` writes them. The only other writers: the `design` command sets `spec.json` `status:
"approved"` after Gate 3 (its only artifact edit), and the `developer` fills each acceptance
criterion's `implemented_at` / `test_at` in `spec.json` as it builds. `review` and `deploy` edit only control
files, never application code or artifacts. There is no checklist file: stage is the backlog, gate
decisions are in the journal, AC coverage is in `spec.json`.

## Dependency unlock

A feature is **unblocked** when every feature in its `depends_on` is in **Review Passed or Done**.
Gate 6 merges the work (locally in DEV, on GitHub in QA), so a dependent can build on merged code
before the dependency is released. Read stages from the backlog, never from `INTENT.md`.

## Control-file write table

Every write bumps `updated_at`. Commands write `jairus.json` and the journal only through `bin/state.mjs`, and the backlog only through `bin/make-backlog.mjs` and `bin/backlog.mjs`: never by hand (a hand edit lost the backslashes of a Windows path and batched timestamps). Shapes: `${CLAUDE_PLUGIN_ROOT}/templates/jairus.json` (the control file) and `rules/state-model.md` (the backlog file, which `bin/make-backlog.mjs` writes); the template carries every `jairus.json` field named below.

| Command | When | Fields written |
|---|---|---|
| any stage command (preflight) | version check / reconcile | `jairus_version` (patch/minor re-stamp; major only after approval), `snapshot.features`, `snapshot.refreshed_at`; full rebuild from the backlog + git/files when `.jairus/jairus.json` is missing and the backlog exists |
| `init` | Gate F1 approved | seeds `.jairus/jairus.json`: `schema_version`, `jairus_version`, `created_with`, `created_at`, `mode`, `project.{name, backend, topology, plugins: [], backlog: {store, url: "", number: null}, neon, vercel}`, `starter = {source, path, repo, ref, sha: "", dirty: false}`, `remote = null`, `project.foundation = {status: "pending", scope: "", steps: {F0, F1}}`, `cursor`, and the `workflow` block (`phase`, `current`, `next = {command, reason}`, `blockers`); also the placeholder `.jairus/product-backlog.json` (the reserved cards `bootstrap`, `environment`, `branding`, `status: "placeholder"`) |
| every command | it finishes (or stops) | `workflow` (the current step and the **single next action**, written through `bin/state.mjs next`) and one journal line (`bin/state.mjs journal`): this is what `/jairus:help` reads in the next session |
| `board` | Gate 2 approved | `.jairus/product-backlog.json`: the feature cards added after the reserved ones, `order` recomputed, `status: "approved"` (`bin/make-backlog.mjs`); an `upgrade-<ref>` card when the starter is past the pin (`bin/backlog.mjs upgrade`) |
| `init`, `ship` | each F-step finishes | `project.foundation.steps.<F-step> = {step: done\|deferred\|failed\|skipped, at, ref}` |
| `ship` | F3 | `starter.{source, path, repo, ref, sha, dirty}` as copied/cloned; QA also `remote = {url, published_at}` |
| `ship` | F5 | `project.neon = {project_id, branches: {dev, preview, main}}` (branch ids; DEV records only `dev`) |
| `init`, `develop`, `deploy` | a human defers a need, or clears one | `.jairus/prelive.json` through `bin/prelive.mjs` only (add, done, ack): names, never values |
| `ship` | F8 (QA) | `project.vercel = {org_id, portal: {id, name, preview_alias}, admin: {id, name, preview_alias}}` |
| `ship` | Gate F-VERIFY approved | `project.foundation.status = "green"`, `project.foundation.scope = "skeleton"` (DEV) \| `"release"` (QA), `cursor.active_stage = "board"` |
| `board` | Gate 2 approved, objects verified | `project.backlog.{store, url, number}`, `.jairus/product-backlog.json` (DEV create/import), `snapshot.features`, `snapshot.refreshed_at` |
| `design` | start | `.jairus/product-backlog.json` card stage (DEV), `snapshot.features.<f>` |
| `design` | Gate 3 approved | `cursor = {active_feature: <f>, active_stage: develop}`, `snapshot.features.<f>` incl. `plugin` (the plugin id the design names) |
| `develop` | exit criteria pass | `cursor = {active_feature: <f>, active_stage: review}`, `snapshot.features.<f>` incl. `gate5` = `done` \| `deferred` \| `n/a`; DEV/QA: `backlog` card `branch` and `pr` |
| `review` | Gate 6 approved | `cursor = {active_feature: <f>, active_stage: deploy}`, `snapshot.features.<f>` and each newly unlocked dependent |
| `deploy` (DEV) | Gate P (initial) approved and pushed | `remote = {url, published_at}`, `mode = "qa"` |
| `deploy` (QA) | Gate 8 approved, production `READY` | `cursor` → next unblocked feature (or clear `active_stage`), `snapshot.features.<f>` for every card moved to Done |
| `extend` | scaffold verified | `project.plugins` (append `{id, scaffolded_at}`; never remove) |
| `ship` | a card it runs finishes | through `bin/state.mjs` and `bin/backlog.mjs` only: the step records, `workflow`, the journal line and the card move of that card |
| `doctor`, `help` | — | never |

`INTENT.md` is never written after Gate F1 (`rules/intent-schema.md`). No command writes progress
into it, and plugins are recorded only in `project.plugins`.

## Commit points & working tree

Control files and `.jairus/features/` are versioned in the project repo but committed only at these
points (the only definition; other files link here). Between them, command writes are uncommitted
working-tree changes. The *base branch* is local `main` in DEV and `origin/main` in QA, where `main`
is branch-protected after F3 so nothing is pushed to it directly.

1. **`develop` Step 1** — right after creating the feature branch (`rules/development.md` → Git
   workflow), commit `.jairus/features/` (all of it, ride-along ticks included) + `.jairus/jairus.json` (+
   `.jairus/product-backlog.json` in DEV): `docs(<f>): approved design`.
2. **`review`, before merging at Gate 6** — commit the control files to the feature branch. DEV: merge it into local `main` after the build checks and `pnpm gate:core`
   are green. QA: push (Gate P, branch), wait for CI (`rules/gates.md` → CI wait), then merge.
3. **After the merge** — changes `deploy` makes on `main` and Foundation writes after the F3 seed
   commit stay uncommitted on `main` and ride along in the next commit point 1.
4. **Before any `git pull` (QA only)** — `git stash push -- .jairus/jairus.json .jairus/features`, pull, then
   `git stash pop` (only if the push created a stash). On a pop conflict take `main`'s `.jairus/jairus.json`
   and re-run preflight part C reconcile (the backlog wins). DEV has no remote and never pulls.
5. **The deployer never switches branches in the user's working tree** (QA). It builds from a
   temporary clean worktree of `origin/main` and removes it afterwards.
6. **`extend`** — before the extender runs, the command creates `extension/<id>` from the base branch
   (the `rules/development.md` → Git workflow sequence). After the scaffold checks pass it commits
   the scaffold + control files. DEV: it stays local; the human merges it with `git`. QA: Gate P
   (branch) pushes it and opens a PR for the human to merge. No other gate, no card move.

**`.jairus/jairus.json` conflicts** (QA only): merge `origin/main` into the branch, take `main`'s
`.jairus/jairus.json`, re-run preflight part C reconcile (the backlog wins), re-commit, push, and — at
point 2 — wait for CI again. Any other conflicted file → stop and report.
