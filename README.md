# jairus v0.4.0 — agentic micro-SaaS control plane for Claude Code

jairus is a Claude Code plugin that takes a product **intent** to a verified micro-SaaS. In an empty workspace,
`/jairus:init` interviews you one question at a time and writes `INTENT.md`; `/jairus:board` turns it into an ordered backlog;
`/jairus:ship` runs the cards, the first of which creates the project from the
[`jairus-starter`](https://github.com/Nani-Bobbara_CUDL/jairus-starter) template and proves it builds. MCP servers reach every
service, you supply every credential, and you approve at every 🚦 gate. The designed loop for each feature
(design → develop → review, then release) is drafted and arrives phase by phase.

The starter's core is **closed**: a product never edits it. Every domain feature is a **plugin**
(`plugins/<id>`) on top of it, product values live in `branding/`, and anything the core cannot
express becomes an extension request, never a workaround.

> **Version 0.4.0: a phased rebuild. This build is Phase 1 only** (`doctor`, `init`, `board`, `ship`, `help`). Phase 2 (build)
> and Phase 3 (release) are designed and their drafts are parked in [phase-2-3/](phase-2-3/README.md), not loaded, until
> Phase 1 is verified live. Architecture, roles, resources and toolchain per command:
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The first release is cut when all three phases are verified.

---

## Install & share

### Prerequisites

- Claude Code with plugin support, a current Node.js (LTS or newer, installed on your machine; jairus never installs or pins it) and `git`. That is all the plugin itself needs: everything the
  product needs (its Node range, package manager and environment variables) is read from the starter, and
  `/jairus:doctor` reports it.
- Accounts the starter uses (Neon always; GitHub, Vercel and Stripe for QA mode), reached through the MCP servers
  in the workspace; you authenticate each in `/mcp`.
- **A `jairus-starter` to copy.** DEV mode copies a local folder (found through `JAIRUS_STARTER_PATH` or a
  sibling `jairus-starter` directory); QA mode clones `Nani-Bobbara_CUDL/jairus-starter` (private: you
  need read access).
- **Credentials stay with you.** The plugin never asks for, reads or prints a secret value: it lists the
  variable names the starter needs, generates only what the starter says to generate, and you put the rest in
  the gitignored env files yourself. Anything you defer is tracked in `.jairus/prelive.json`.

### Install for yourself

The marketplace lives in the **private** repo `Nani-Bobbara_CUDL/jairus-plugin`; installing it needs
read access. This repo is both the plugin and its marketplace.

```
/plugin marketplace add https://github.com/Nani-Bobbara_CUDL/jairus-plugin.git
/plugin install jairus@jairus-plugin
```

From a terminal: `claude plugin marketplace add https://github.com/Nani-Bobbara_CUDL/jairus-plugin.git`, then
`claude plugin install jairus@jairus-plugin`. From a local clone: `/plugin marketplace add ./path/to/jairus-plugin`.
The plugin is installed once at user level and works from any workspace; Claude Code keeps it in its
own plugin cache, and nothing of it is copied into your products.

### Share with a team

The bootstrap card writes this into the product's `.claude/settings.json`; teammates who trust the folder
are prompted to add the marketplace and enable the plugin:

```json
{
  "extraKnownMarketplaces": {
    "jairus-plugin": { "source": { "source": "git", "url": "https://github.com/Nani-Bobbara_CUDL/jairus-plugin.git" } }
  },
  "enabledPlugins": { "jairus@jairus-plugin": true }
}
```

---

## How it works

```
empty workspace ──/jairus:init──▶ mode · INTENT.md (interview) · .jairus/ scaffold with a placeholder backlog
                ──/jairus:board─▶ the plan: reserved cards (bootstrap, environment, branding), then a card per feature, in order
                ──/jairus:ship──▶ runs the next card: bootstrap (starter in place · build proven · empty env files),
                                  then environment (infra and env values, when you are ready)
   planned      ──extend · design · develop · review──▶ per feature, in dependency order      (Phase 2, not in this build)
   planned      ──deploy──▶ DEV: publish to GitHub (Gate P) · QA: staging, production           (Phase 3, not in this build)
   any time     ──/jairus:doctor · /jairus:help──▶ readiness and every dependency · where you are and what is next
```

### Two modes

| | **dev** — build and test locally | **qa** — GitHub-backed |
|---|---|---|
| Starter | local `jairus-starter` folder, copied | GitHub template repo |
| Backlog | `.jairus/product-backlog.json` | GitHub Project board |
| Git | local only; no push until you approve Gate P | PR flow with CI; every push is Gate P |
| Cloud | Neon `dev` branch only | Neon, Vercel, Stripe |

`init` asks once. DEV becomes QA exactly once, when you approve Gate P (initial): the repo is created,
the work so far is pushed, and the GitHub Project can then be built from the DEV backlog (Phase 3).
Rules: [rules/modes.md](rules/modes.md).

### What `init` leaves in your product

Everything jairus keeps lives in the product's own **`.jairus/`** folder, isolated from the starter's
files, versioned, and removable without affecting the build (rules: [rules/state-model.md](rules/state-model.md)):

```
.jairus/INTENT.md              the seed, created by the interview
.jairus/jairus.json            the anchor: version, mode, starter pin and zones, foundation, and `workflow` (the current step and next action)
.jairus/product-backlog.json   the DEV backlog, a placeholder from init until board plans it (QA: the GitHub Project)
.jairus/prelive.json           what you still have to supply or decide before something live (names, never values)
.jairus/features/<f>/          PRD, DESIGN, ADR and spec.json of each feature (Phase 2)
.jairus/journal.md             append-only session log
```

`.mcp.json` and `.claude/settings.json` stay at the project root, where Claude Code needs them. The
backlog is the source of truth for each card's stage; `jairus.json → workflow` records where the project is and the single next
action, so a new session starts with `/jairus:help`. Commands write these files only through `bin/state.mjs`,
`bin/make-backlog.mjs` and `bin/backlog.mjs`, never by hand.

---

## The commands, in three phases

| Phase | Commands, in order | What it does | Status |
|---|---|---|---|
| **1 · Start** | `doctor`, `help` (any time) · `init` → `board` → `ship` | readiness and reference; the intent; the ordered backlog; running the next card (bootstrap, environment) | **in this build**; script-tested, live checks pending |
| **2 · Build** | `extend` → `design` → `develop` → `review` | scaffold a plugin; design, implement and review one feature | parked in `phase-2-3/` (drafted) |
| **3 · Release** | `deploy` | release (DEV: publish · QA: staging + production); `ship` then dispatches the later-phase build and release commands per card | parked in `phase-2-3/` (drafted; QA release blocked on the starter) |

Each command owns one responsibility: preflight → input contract → dispatch → verify → gate →
transition. `init`, `doctor` and `ship` have side effects and are never run by Claude on their own: type them yourself.

### Quick start (Phase 1)

`/jairus:doctor` and `/jairus:help` can be run at any time, in any folder: `doctor` reports the plugin's own needs and every dependency of the starter (a heads-up before init, a hard check inside a project); `help` shows what is available and planned.

```
mkdir my-product && cd my-product   # an empty workspace
claude
/jairus:init                        # mode → interview (one question at a time) → INTENT.md → board (the plan)
/jairus:ship                        # card 1: the starter in place, build proven, empty env files
/jairus:ship                        # later, when you have filled the env files: the environment card
/jairus:help                        # any time: where you are and what is next
```

`init` never asks for Neon, database or credential details. The `bootstrap` card (`/jairus:ship`) brings the starter in, checks
its prerequisites, proves the build and leaves empty gitignored env files with a pre-live checklist; fill them in your editor
when you are ready, then run `/jairus:ship` again for the `environment` card. A failure in the starter's own code is filed as a
`starter-gap` card and never patched. Re-running any command resumes.

### Gates

Foundation: `F1` intent · `F2` resource plan · `F10` first release (QA) · `F-VERIFY` skeleton proof.
Feature: `2` backlog · `3` design · `4` schema · `5` live Stripe · `6` review/merge · `7` staging · `8`
production · **`P` publish**. Only an explicit human message approves a gate; reviews are scored /10 and
below 8 triggers an autonomous fix-loop. Registry and caps: [rules/gates.md](rules/gates.md).

### Stack

A pnpm + turbo hexagonal monorepo from the starter: Next.js apps (portal, admin, cli) over a closed
`@jairus/*` core, Neon Postgres with row-level security and Managed Better Auth, Stripe, and the
product's own `plugins/*` and `branding/`. Every starter fact the plugin assumes:
[rules/starter-contract.md](rules/starter-contract.md); the product's own README and `CONTRIBUTING.md` win at runtime.

---

## Safety notes

- **Human gates.** No gate is approved implicitly, and nothing leaves your machine before Gate P.
- **The core is read only.** Review fails any diff under `packages/*`; gaps are `starter-gap` cards.
- **Secrets.** The plugin never asks for, reads, prints or writes a secret value. It generates only what the starter says to
  generate (through `bin/env-set.mjs`, never echoed), and you put every other value in the gitignored env files yourself.
  `.env*` is never committed. A secret-scan hook blocks `git commit` and `git push` when it finds key shapes (a safety net,
  not a guarantee). If you share a transcript, rotate any credential that was ever shown in it.
- **Databases.** Agents write no SQL through the Neon MCP (read-only verification). A product changes a
  database only through the starter's CLI against the dev branch; production credentials never reach an agent.
- **QA hosting.** Vercel projects are never Git-connected, and preview deployments keep deployment
  protection on.

### Hooks

Two hooks run in **every** repo where the plugin is enabled, each acting only on its own trigger:
**type-check on edit** (after an Edit/Write to a TypeScript file, runs `pnpm -r type-check` when the
root has a `pnpm-workspace.yaml`) and **secret scan** (on `git commit` / `git push`, scans the staged or
unpushed changes for likely secrets and `.env` files).

## Known limitations

- **Starter.** Portal and admin screens are skeletons; there are no page/slot contributions or
  `businessTable()` helper yet; the registry decision is open, so a product copy still carries
  `packages/*` in-tree (the zone check enforces "read only").
- **QA release is blocked.** The starter ships no deploy workflows, so Gates F10, 7 and 8 stop with a
  clear message until it does.
- **DEV is not fully offline.** Neon Managed Better Auth exists only on Neon.
- **Not yet exercised live:** the interview and MCP restart flow, the build checks on a copy, the
  environment flow, and all of QA.
- **Hook `if` filters are best-effort:** a compound command (`cd x && git commit`) may bypass the secret scan.

## Not supported

- **Adopting an existing repository.** `init` works only in an empty workspace; it stops and offers a
  new directory otherwise.
- **Projects made by the pre-reset 5.x line** are not migrated; re-initialize them. That line's
  history is in the git log.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Edits to the plugin don't show up | `/reload-plugins`; for a marketplace install, `/plugin marketplace update jairus-plugin` (the cache holds the installed copy) |
| `MCP server <name> is not connected` | `claude mcp login <name>` (or `/mcp`), then re-run |
| `This repo is not initialized` | run `/jairus:init` in the product workspace |
| Local starter not found | set `JAIRUS_STARTER_PATH` or place `jairus-starter` next to the workspace |
| Plugin or marketplace rejected | `claude plugin validate . --strict` |
| Docs and plugin disagree | `node scripts/check-drift.mjs` (maintainers) |

---

## Maintaining this repo

This repo is a single-plugin repo: **the repo root is the plugin** and the same repo is its own
marketplace. It is the control plane, not a product: there is no app code here.

```
.claude-plugin/plugin.json        the plugin manifest (owner of the version and description)
.claude-plugin/marketplace.json   the marketplace (one plugin entry, source ./)
skills/                           the command-skills in this build (thin dispatchers; the others are parked in phase-2-3/); the starter's docs are the knowledge
agents/                           the leaf-worker subagents in this build; rules/delegation.md says what each gets
rules/  templates/  hooks/        single-owner contracts, generated artifacts, hooks
bin/                              deterministic tools: doctor, state, backlog, make-backlog, validate-backlog, check-intent, copy-starter, starter-requirements, env-set, prelive (and check-feature, render-feature for Phase 2)
scripts/                          hook scripts the hooks call (typecheck, secret-scan) and maintainer checks (check-drift, check-starter-refs, test-bin)
docs/                             architecture and design record
```

Claude Code copies the whole repo into its plugin cache on install; `docs/` and the maintainer checks in
`scripts/` ship too and are inert. Plugin files refer to each other with `${CLAUDE_PLUGIN_ROOT}/…`, never relative paths.

**Two kinds of work.** *Build a product*: run `/jairus:*` in an empty product workspace; output goes
into that project, never into this repo. *Edit the harness*: change files here and `/reload-plugins`;
do not enable the plugin while editing it (you would run the cached copy), load it with
`claude --plugin-dir .` instead.

**Single owners** (state a fact once, link everywhere else):

- `rules/modes.md` — DEV/QA and the starter-source and backlog backends
- `rules/state-model.md` — the `.jairus/` folder, stages, backlog shape, journal
- `rules/transitions.md` — card moves, control-file writes, dependency unlock, commit points
- `rules/gates.md` — gate format and registry, Gate P, build checks, fix-loop, caps
- `rules/preflight.md` — connectivity, foundation-green, resume + version check
- `rules/foundation.md` (F-steps) · `rules/intent-schema.md` · `rules/pipeline.md` (dispatcher, CRAFT envelope, stage contracts)
- `rules/starter-contract.md` — every fact about the starter: zones, plugins, env, commands
- `rules/design-workflow.md` · `rules/development.md` · `rules/quality-gate.md` · `rules/security.md`

Only **commands** write `.jairus/jairus.json`, `.jairus/product-backlog.json` and `.jairus/journal.md`
and move cards; agents return structured results. Agent `tools:` list bare tool names and
`mcp__<server>__*` only; `Bash(<cmd> *)` patterns belong in command `allowed-tools`.

**Checks** (run them before committing; there is no CI yet):

```
node scripts/check-drift.mjs          # stale strings, frontmatter, counts, manifests, hooks, links
node scripts/test-bin.mjs             # tests of bin/ (intent, backlog, local starter copy)
node scripts/check-starter-refs.mjs   # starter paths named in the plugin exist in ../jairus-starter HEAD (local only)
claude plugin validate . --strict     # the plugin and the marketplace
```

Bump the version with every change set that should reach installed copies, because Claude Code updates an
installed plugin only when the version changes: `node scripts/bump-version.mjs patch|minor|major` (patch for fixes
and docs, minor for new capability) writes `plugin.json`, the README heading and `docs/ARCHITECTURE.md`; the drift
check fails if they disagree. The version stays `0.x` until all three phases are verified.

**Non-negotiables.** Never skip a 🚦 gate. The starter's core is read only for every agent: a feature
is a plugin, a gap is an extension request. Never write code before Gate 3, push before Gate P, or
release to production before Gate 8. Never commit secrets or `.env*` files. Docs never hand-count
parts (commands, agents, skills, rules) and never copy tables owned by a rules file. No retired names
or paths; the drift check lists the forbidden strings.
