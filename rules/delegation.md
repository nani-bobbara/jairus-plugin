# Delegation — what each agent receives

Single owner of **who does what and with which resources**. The command-skills orchestrate (preflight, input
contract, gates, transitions); the six agents execute one bounded task and return a structured result;
`rules/` hold the contracts; **the starter's own docs are the knowledge** (`rules/starter-contract.md`). A
command-skill never restates an agent's resources: it dispatches by name, and this file says what the agent gets.

## Division of responsibility

| Layer | Owns | Never |
|---|---|---|
| **Command-skill** (`skills/<command>/`) | preflight, input contract, dispatch, verifying the return, presenting gates, card moves and control-file writes, MCP reads and gated writes, git commits at commit points | writes application code, design artifacts or tests |
| **Agent** (`agents/<name>.md`) | one procedure and its return JSON | presents a gate, moves a card, writes a control file or `INTENT.md`, edits `packages/*`, dispatches another agent |
| **Rules** (`rules/`) | the process contracts, each stated once | procedure for one agent; copies of starter guidance |
| **Starter docs** (in the product) | stack, conventions, security model, how to extend | — they are read, never copied into the plugin |
| **`bin/` tools** | deterministic checks and writes | judgment |

## Agent registry

Only `planner` is in `agents/` in the current build; the other five are parked in `phase-2-3/agents/` (not loaded) until
their phase, and keep their rows here so the contract is written once.

`tools` must equal the agent's frontmatter (the drift check compares them). All agents are **leaf workers**:
`disallowedTools: Agent`, so no agent can spawn another. Bash cannot be scoped in frontmatter (agent `tools` takes bare names; a `Bash(…)` entry would remove the whole tool), so
each agent file has a *Command discipline* paragraph listing the commands it may run and the project's
`permissions` (`templates/settings.json`) hold the hard limits. Command names in agent files are the starter's
(`rules/starter-contract.md` → Commands); if the starter renames them, that file is the one place to update. MCP tools are for read-only checks an agent
must repeat itself; gated writes are the command's (`rules/mcp-usage.md`).

| Agent | Dispatched by | Model | Tools | Rules to read | May write |
|---|---|---|---|---|---|
| `planner` | `board` (QA only) | haiku | Read, Glob, Grep, Bash, `mcp__github__*` | `state-model`, `transitions` | GitHub objects of the approved plan |
| `designer` | `design` | opus | Read, Write, Edit, Glob, Grep, Bash | `design-workflow`, `quality-gate`, `security` | `.jairus/features/<f>/` only |
| `developer` | `develop`; `review` (fix mode) | sonnet | Read, Write, Edit, Glob, Grep, Bash, `mcp__neon__*`, `mcp__stripe__*` | `development`, `security`, `gates` | `plugins/<id>/`, `branding/`, route files, tests, AC coverage in `spec.json`; local commits on the feature branch |
| `reviewer` | `design` (design mode); `review` (code mode) | opus | Read, Glob, Grep, Bash, `mcp__neon__*` | `quality-gate`, `security`, `development` | nothing (read-only) |
| `extender` | `extend` | sonnet | Read, Write, Edit, Glob, Grep, Bash | `development` | the plugin scaffold and its wiring (`rules/pipeline.md` → Stage 6) |
| `deployer` | `deploy` (QA only) | sonnet | Read, Glob, Grep, Bash, `mcp__vercel__*`, `mcp__neon__*`, `mcp__github__*`, `mcp__stripe__*` | `gates`, `security` | nothing in the repo (a temporary worktree only) |

No agent has `WebFetch`: the starter's READMEs are the documentation. Every agent reads the starter docs below
**first**, before the rules, and never asks the human for a fact those docs state.

## What a dispatch carries

Every dispatch is a CRAFT envelope (`rules/pipeline.md`) with, in its Context and Tone:

1. the agent's registry row: the **rules** to apply (absolute paths under `${CLAUDE_PLUGIN_ROOT}`) and the
   **tools** it may use;
2. **`Starter knowledge:`** the project docs below, as absolute paths (paths only, never pasted);
3. the stage's inputs (feature, scope contract, mode, diff range, live backend state read by the command) and its
   return contract (the agent file).

## Starter knowledge — project docs per dispatch

Paths are relative to the product root. Placeholders the command resolves before the check: `<f>` = the feature
name; `<plan-read>` = each doc named in the `read` column of `.jairus/features/<f>/spec.json`
`extension_plan.rows`; `<touched-dir>` = each folder in that plan's `files` that holds its own `README.md`.

| Command | Agent | Project files to pass (read first) |
|---|---|---|
| design | designer | `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `plugins/README.md`, `packages/plugin-kit/README.md`, `branding/README.md`, `packages/ui/README.md` |
| design | reviewer | `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `plugins/README.md`, `packages/plugin-kit/README.md`, `branding/README.md` |
| develop | developer | `AGENTS.md`, `CONTRIBUTING.md`, `.jairus/features/<f>/spec.json`, `.jairus/features/<f>/DESIGN.md`, `<plan-read>`, `<touched-dir>/README.md` (optional) |
| review | reviewer | `AGENTS.md`, `CONTRIBUTING.md`, `.jairus/features/<f>/spec.json`, `<plan-read>`, `<touched-dir>/README.md` (their `[review]` rules are the checklist) |
| review | developer | `AGENTS.md`, `CONTRIBUTING.md`, `.jairus/features/<f>/spec.json`, `.jairus/features/<f>/DESIGN.md`, `<touched-dir>/README.md` (optional) |
| deploy | deployer | `README.md`, `.env.example`, `.github/workflows/ci.yml`, `.github/workflows/db.yml` |
| extend | extender | `AGENTS.md`, `plugins/README.md`, `packages/plugin-kit/README.md`, `apps/cli/README.md`, `branding/README.md` |
| board | planner | — (it works from `INTENT.md` and the backlog) |

### Orchestrator protocol

Before every dispatch listed above, the command-skill (never the agent):

1. **Verifies** each listed file exists. A missing **required** file stops the command with:
   `Starter knowledge missing: <path>. The project does not look like a jairus-starter copy — run /jairus:doctor or re-run Foundation.`
   A missing **optional** file is noted in the output and skipped.
2. **Lists** the existing paths (absolute, under the product root) in the envelope under `Starter knowledge:`.
3. **Relies on the agent** to read them FIRST. A genuine gap goes through the Ambiguity Protocol
   (`rules/pipeline.md`).

### Precedence

For starter facts: the product's docs win over anything in the plugin. For protocol (gates, transitions,
envelopes, caps) the rules own it.
