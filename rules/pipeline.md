# Pipeline — dispatcher, CRAFT envelope, stage contracts

The **contract registry** for the jairus pipeline. Every command reads its stage contract here
before dispatching an agent; every agent reads its section for the inputs it receives and the
outputs it returns.

Owned elsewhere (link, do not restate):

| Concern | Owner |
|---|---|
| DEV/QA modes, starter-source and backlog backends | `${CLAUDE_PLUGIN_ROOT}/rules/modes.md` |
| Preflight (connectivity, foundation green, resume + version) | `${CLAUDE_PLUGIN_ROOT}/rules/preflight.md` |
| Gate format, registry, Gate P, build checks, fix-loop, caps | `${CLAUDE_PLUGIN_ROOT}/rules/gates.md` |
| Card moves, control-file writes, dependency unlock, commit points | `${CLAUDE_PLUGIN_ROOT}/rules/transitions.md` |
| State layers, stages, `.jairus/product-backlog.json` shape | `${CLAUDE_PLUGIN_ROOT}/rules/state-model.md` |
| `.jairus/INTENT.md` schema | `${CLAUDE_PLUGIN_ROOT}/rules/intent-schema.md` |
| Starter facts, zones, plugins, env, commands | `${CLAUDE_PLUGIN_ROOT}/rules/starter-contract.md` |
| Foundation F-steps | `${CLAUDE_PLUGIN_ROOT}/rules/foundation.md` |
| Design artifacts and Extension plan | `${CLAUDE_PLUGIN_ROOT}/rules/design-workflow.md` |
| Implementation standards, git workflow | `${CLAUDE_PLUGIN_ROOT}/rules/development.md` |
| Scoring and escalation | `${CLAUDE_PLUGIN_ROOT}/rules/quality-gate.md` |
| Security policy | `${CLAUDE_PLUGIN_ROOT}/rules/security.md` |
| Who does what: agent registry (tools, rules), starter docs per dispatch | `${CLAUDE_PLUGIN_ROOT}/rules/delegation.md` |
| MCP usage | `${CLAUDE_PLUGIN_ROOT}/rules/mcp-usage.md` |

## Overview

```
Stage 0  init ──▶ intent (INTENT.md) ─▶ project from the starter ─▶ environment ─▶ proof
                  🚦 F1 · 🚦 F2 · (🚦 F10 QA) · 🚦 F-VERIFY ──▶ foundation green
                                                                    │
Stage 1  board ──Gate 2──▶ ┌──── Feature loop (dependency order) ────┐
         backlog           │ Stage 6 extend  (scaffold the plugin)    │
                           │ Stage 2 design  ──Gate 3──▶              │
                           │ Stage 3 develop ──Gate 4/5, P(branch)──▶ │ ──▶ Stage 5 deploy
                           │ Stage 4 review  ──Gate 6 (merge)──▶      │      DEV: Gate P (initial)
                           └──────────────────────────────────────────┘      QA : Gates 7, 8
```

Foundation runs once; Stages 2–6 refuse to run until it is green (preflight part B). `ship`
invokes the stage commands in dependency order; every 🚦 pauses for explicit human approval.
`extend` may be run by hand at any time after Foundation, and `develop` stops and asks for it when a
feature's plugin is missing.

## Dispatcher pattern — how every command works

```
STEP 0 — PREFLIGHT        rules/preflight.md (stage: <name>) — stop on any failure.
STEP 1 — VERIFY INPUT     check the stage's INPUT CONTRACT below; any miss → stop with the prescribed error.
STEP 2 — DISPATCH AGENT   one agent, CRAFT envelope, exactly the contract's inputs; wait for its structured return.
STEP 3 — VERIFY OUTPUT    check the OUTPUT CONTRACT / exit criteria; failing → fix-loop or cap (rules/gates.md).
STEP 4 — GATE + TRANSITION present the gate (canonical format); on approval make the move/write in rules/transitions.md.
```

The orchestrator **never** writes application code, design artifacts or tests; it verifies
contracts, presents gates and performs transitions. Agents return structured results; they never
move cards or write control files.

## CRAFT dispatch envelope

Every agent dispatch is a complete envelope — the agent never infers context, role or standards.

```
CRAFT DISPATCH
──────────────────────────────────────────────────────────────
Context  : • Plugin root: <absolute path — ${CLAUDE_PLUGIN_ROOT} resolved by the command>
           • Project root: <absolute path of the project repo>
           • Mode: dev | qa (rules/modes.md)
           • Project: <display_name> — <one_liner>
           • Feature: <name> — <description>; plugin: <id>
           • Stack: Next.js + Neon on the hexagonal monorepo from jairus-starter; the core is read
             only, the feature is the plugin above (rules/starter-contract.md)
           • Scope contract: description / out_of_scope[]
           • Current state · Live backend state (read-only MCP, if read)
           • Resources (from the agent's row in rules/delegation.md): rules to apply, tools it may use
           • Starter knowledge: <absolute project paths from rules/delegation.md —
             read FIRST; paths only, never pasted>
Role     : • You are the <designer | developer | reviewer | deployer | planner | extender>.
           • You own <artifact production | implementation | scoring | release | backlog plan | scaffold>.
           • You do NOT present gates, move cards, write control files or INTENT.md, edit the
             core (`packages/*`), or dispatch other agents.
Action   : • Produce: <outputs from the output contract> · Order · Blockers to signal back
Format   : • Return the output-contract JSON defined in your agent file; do not truncate findings;
             signal gates and extension requests through the return value, never by presenting them.
Tone     : • Rules files to apply (absolute paths) · pass threshold ≥ 8/10 (reviewer) · build checks
             green (rules/gates.md) · any BLOCKER stops the work.
──────────────────────────────────────────────────────────────
```

CRAFT invariants: absolute paths (agents have no shell expansion); full scope contract on every
design/review dispatch; the live backend state on designer/developer dispatches (read first); the
diff range on code review; resources and starter knowledge per `rules/delegation.md`; each role states
what it does NOT do; the return must match the agent's JSON or it is rejected and re-dispatched.

## Stage contract registry

### STAGE 0 — Intent (`init`); the bootstrap card is Stage 1 (`ship`)
**Agent(s):** orchestrator only; `init` hands over to `board`. **Rules:** `rules/foundation.md`, `rules/intent-schema.md`, `rules/modes.md`.

| Input | Requirement |
|---|---|
| Workspace | an empty directory (README, `.git`, `.claude/` allowed) or one holding a draft `.jairus/INTENT.md`; anything else → stop (below) |
| Mode | asked first: `dev` or `qa` |
| Credentials | none: `init` never asks for one |

| Output | Requirement |
|---|---|
| `.jairus/INTENT.md` | created by `init`, per `rules/intent-schema.md`, `status: bootstrapped` |
| `.jairus/jairus.json` | seeded per `rules/transitions.md` |
Nothing else: the starter copy, `.claude/settings.json`, `.mcp.json`, the environment and any infrastructure belong to the
`bootstrap` card (`rules/foundation.md`), run by `ship`.

Gate: F1. Exit: F1 approved. Next: `board` (backlog, card 1 = `bootstrap`), then `ship`; F-VERIFY approved → `foundation.status = "green"`. A non-empty workspace that is not a jairus project → stop and offer a new starter project in
a fresh directory; existing-repo adoption is not supported (README → Not supported).

### STAGE 1 — Backlog (`board`)
**Agent(s):** `planner` (plan mode; create mode in QA only). **Rules:** `rules/transitions.md`, `rules/state-model.md`.

| Input | Requirement |
|---|---|
| `.jairus/INTENT.md` | `status: bootstrapped` |
| QA | github MCP with `repo` + `project` scope |

| Output | Requirement |
|---|---|
| Backlog | DEV: `.jairus/product-backlog.json`: the reserved cards (`bootstrap`, `environment`, `branding`, written by `init` as a placeholder) then one card per INTENT feature, each depending on `bootstrap` and `branding`, in dependency `order`. QA: GitHub Project + milestones + issues, `blocked-by` labels, columns = the canonical stages |

Gate 2. Cards start in **Backlog**. Next: `design <first-unblocked-feature>` or `ship`.

### STAGE 2 — Design (`design <feature>`)
**Agent(s):** `designer` → `reviewer` (design) with the fix-loop. **Rules:** `rules/design-workflow.md`, `rules/quality-gate.md`, `rules/security.md`.

| Input | Requirement |
|---|---|
| Scope contract | feature `description` and `out_of_scope` present |
| Dependencies | unblocked (`rules/transitions.md`) |
| Stage | Backlog or Design; in/past Design Approved → stop |
| Project docs | the `design` files in `rules/delegation.md` exist |

| Output (`.jairus/features/<f>/`) | Verified |
|---|---|
| PRD.md | no `{{placeholder}}`; user stories name the AC ids they serve |
| DESIGN.md | flows, component hierarchy, a11y and security reasoning; no placeholder |
| ADR.md | at least one real decision |
| spec.json | `bin/check-feature.mjs --final --intent .jairus/INTENT.md` passes: the ACs, the Extension plan (the **plugin id**, contribution `point`s, files, the starter README read, extension requests), entry-point guards and audits |

Gate 3 → **Design Approved**. Next: `develop <feature>`.

### STAGE 3 — Develop (`develop <feature>`)
**Agent(s):** `developer`. **Rules:** `rules/development.md`, `rules/security.md`.

| Input | Requirement |
|---|---|
| Stage | Design Approved, Develop or Review; in/past Review Passed → stop |
| Artifacts | the four present and `spec.json` is `approved` |
| Plugin | `plugins/<id>/` exists and is enabled (named by spec.json); missing → stop: run `/jairus:extend <id>` |
| Branch | `feature/<name>` exists or is created at Step 1 (commit point 1) |

| Output | Requirement |
|---|---|
| Implementation | inside the plugin (domain → application → repos → manifest → migrations), `branding/` values, thin route files; **no diff under `packages/*`** |
| AC traceability | `// AC-N` on every export satisfying an AC, tests naming the criterion, and `implemented_at` / `test_at` filled in `spec.json` (`check-feature.mjs --built`) |
| Local commits | per layer on `feature/<name>` |
| QA | Gate P (branch) pushes it and opens the PR |

Conditional gates signalled before the irreversible step: **4** (any plugin table/migration/role/grant),
**5** (live Stripe, QA). Exit criteria: build checks green, every AC covered, gates 4/5 completed.
Pass → **Review**. Next: `review <feature>`.

### STAGE 4 — Review (`review [feature]`)
**Agent(s):** `reviewer` (code) → `developer` (fix) with the fix-loop. **Rules:** `rules/quality-gate.md`, `rules/security.md`, `rules/development.md`.

| Input | Requirement |
|---|---|
| Stage | Review |
| Branch | `feature/<name>` ahead of the base; QA: PR open |
| Build state | build checks green before the reviewer runs |

| Output | Requirement |
|---|---|
| Reviewer report | score table, findings, N/10 (`rules/quality-gate.md`) |
| QA | PR description updated |

Gate 6 → DEV: local merge; QA: push, CI `validate` green, merge → **Review Passed** → dependents unlock.
Merging never releases. Next: `deploy`, or the next feature in the `ship` loop.

### STAGE 5 — Release (`deploy [feature]`)
**Agent(s):** `deployer` (QA). **Rules:** `rules/security.md`, `rules/gates.md`.

| Mode | Behaviour |
|---|---|
| DEV | Gate P (initial): create the GitHub repo, push `main`, set `mode = "qa"`; the GitHub Project is then created from the DEV backlog (Phase 3). No card moves. |
| QA | needs foundation scope `release`; every card in Review Passed or Deploy is in scope. Phase `preview` → Gate 7 → phase `production` → Gate 8 → cards → **Done**. **Blocked** while the starter ships no deploy path (`rules/gates.md`). |

### STAGE 6 — Extend (`extend <plugin-id>`)
**Agent(s):** `extender`. **Rules:** `rules/development.md`, `rules/starter-contract.md` → Plugins.

| Input | Requirement |
|---|---|
| Foundation | green |
| Name | kebab-case plugin id, not a core namespace, not already in `project.plugins` or `plugins/` |

| Output | Requirement |
|---|---|
| Scaffold | `plugins/<id>/` per `plugins/README.md` (package, registry, manifest, index, empty domain/application/adapters, `migrations/_journal.json`), enabled in `branding/src/features.ts`, listed in the apps' and CLI's plugin lists, dependency added to the three apps — and nothing else |
| Checks | build checks green with the empty plugin |
| Branch | `extension/<id>` from the base; committed (DEV local; QA Gate P branch → PR) |

No card move; no domain logic: the feature itself is built by `develop`. Records `project.plugins`.

## Orchestration rules

- **One agent at a time.** One specialist per step; wait for its structured return.
- **Dependency order.** Never start a feature that is not unblocked.
- **Gate discipline.** Never advance past a gate without explicit human approval.
- **Contract violations block** with the prescribed error. **Caps** live in `rules/gates.md`.
- **The core is closed.** Any agent that finds a need the contribution points cannot meet returns an
  `extension-request` (Ambiguity Protocol); no command edits `packages/*`, and `CLAUDE.md` is the
  starter's — no command edits it.
- **Finished cards stay finished.** A change after Review Passed is a new card (Unplanned Work Protocol).

## "Created ≠ Done" — verification invariant

"The command succeeded" is not verification. Confirm the resulting state:

| Write | Required verification |
|---|---|
| Plugin migration applied | `pnpm db:verify-rls` exit 0 inside `db:setup`, and `pg_tables` / `pg_policies` via read-only neon MCP (`ENABLE` + `FORCE`) |
| Card move / backlog write | read the backlog back (file, or github MCP) |
| Repo, branch, PR (QA) | read the object back via github MCP |
| Vercel deployment (QA) | `READY` via vercel MCP |
| Stripe object (QA) | read it back via stripe MCP |
| Scaffold | the build checks pass and `composePlugins` loads it (the app's type-check + tests) |

A stage that cannot be verified is **not complete** — report the gap.

## Ambiguity protocol

When an agent cannot derive a decision from INTENT.md, the design artifacts, rules or the starter's docs:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  AMBIGUITY — [feature] · [agent role] · kind: question | extension-request
Need: [one specific question, or the core capability missing]
Options:
  A) [option] — [consequence]
  B) [option] — [consequence]
Recommend: [letter] — [one-line reason]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`kind: extension-request` means the contribution points cannot express the need: the options are
limited to *narrow the feature* or *record a `starter-gap` card* (Unplanned Work Protocol). No silent
default on anything affecting architecture, security or the data model.

## Unplanned Work Protocol

Work not in the backlog does not get started. When an agent discovers unplanned work:

1. The agent returns a draft card: title, why found, acceptance criteria, severity, type (`bug`,
   `change` — also for any change to a card already in Review Passed or Done — or `starter-gap`).
2. The command shows it and waits for the human to type `CREATE_ISSUE`.
3. On `CREATE_ISSUE`: the command creates it in **Backlog** (backlog file, or github MCP) and places it
   in the dependency graph. A `starter-gap` card is worked in the starter, never in this project.
4. Normal gated flow begins (except `starter-gap`).
