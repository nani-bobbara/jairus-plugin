# jairus plugin — architecture and delivery plan

Version `0.4.0` (a phased rebuild; the first release is cut when all three phases are verified). **The current build
is Phase 1 only** (`doctor`, `init`, `board`, `ship`, `help`); the Phase 2 and 3 drafts are parked in `phase-2-3/` and are
not loaded until their phase starts.

The plugin is a **control plane**: it takes an intent to a verified product built on
`jairus-starter`. It owns process and state; the starter owns the code. Rules
(`rules/`) are the contracts, the command-skills are thin dispatchers, agents do bounded work,
`bin/` holds the deterministic tools.

## The control chain

```
 doctor ─▶ init ─────────────────────────▶ board ─────────▶ extend ─▶ design ─▶ develop ─▶ review ─▶ deploy
 machine   mode · INTENT.md · .jairus/jairus.json   backlog         plugin     7 docs     code,      merge      DEV: publish (Gate P)
 ready     project from the starter         (cards)         scaffold              tests                 QA : staging, production
 └──────────── Phase 1 · Start ─────────────┘└──────────── Phase 2 · Build (per feature) ──────────┘└─ Phase 3 ─┘
                                                                   ship drives Phase 2 · help documents everything
```

The starter is copied **in place** (DEV: local folder · QA: GitHub template). Its core is read only;
every feature is a plugin; anything the core cannot express is an extension request.

## State (one owner each — `rules/state-model.md`)

All jairus metadata lives in the product repo's own **`.jairus/`** folder, isolated from the starter's
files, versioned, and removable without affecting the build. The plugin's own files stay in the plugin
cache (`${CLAUDE_PLUGIN_ROOT}`) and are never copied into a product. A new session resumes from
`.jairus/jairus.json`, the backlog and the tail of `.jairus/journal.md`.

| Layer | File | Written by |
|---|---|---|
| Intent seed | `.jairus/INTENT.md` | `init` (created by interview), final at Gate F1 |
| Backlog (stage = truth) | `.jairus/product-backlog.json` (DEV) · GitHub Project (QA) | `board`, then the commands that move cards |
| Control footprint | `.jairus/jairus.json` | commands per `rules/transitions.md` |
| Session log | `.jairus/journal.md` | every command appends one line per event; agents never |
| Feature design | `.jairus/features/<f>/` (PRD, DESIGN, ADR, `spec.json`) | `designer`; `design` sets the spec approved; `developer` fills AC coverage |
| Product code | `plugins/<id>/`, `branding/`, route files | `developer`, `extender` |

Modes (`rules/modes.md`): **dev** builds and tests locally (local starter, local git,
`.jairus/product-backlog.json`, Neon `dev` only); **qa** is GitHub-backed (template repo, Project board, PRs,
CI, Vercel, Stripe). DEV graduates to QA once, at Gate P (initial).

## The three phases — split by the nature of the order

| | Phase 1 · **Start** | Phase 2 · **Build** | Phase 3 · **Release & guide** |
|---|---|---|---|
| Nature | prepare, define, plan | the per-feature loop | deliver, orchestrate, document |
| Commands, in order | `doctor` → `init` → `board` | `extend` → `design` → `develop` → `review` | `deploy` → `ship` → `help` |
| Runs | once per machine; once per project | repeats per feature, in dependency order | `deploy` after review; `ship` drives Phase 2; `help` any time |
| Writes product code | no | **yes — the only phase that does** | no |
| Why this order | each command's input is the previous one's output: a ready machine → an intent and a project → a backlog | a plugin must exist before its feature is designed; design before code; review before merge | release needs merged work; `ship` composes Phase 2's commands so they must exist first; `help` is generated from all command files, so it comes last |
| Gates | F1, F2, F10 (QA), F-VERIFY, 2 | 3, 4, 5, 6, P (branch, QA) | P (initial, DEV), 7, 8 (QA) |
| Exit condition | foundation green and a valid backlog | a feature in Review Passed, merged, zone check clean | DEV: published; QA: released; the whole backlog drivable by `ship` |
| Status | the three command-skills and their tools are written and script-tested; live checks pending | the four command-skills, four agents and the rules are written; live checks pending | the three command-skills and the deployer are written; live checks pending, QA release blocked on the starter |

### Phase 1 — Start

| Command | Role | Owns (only) | Agent | Reads | Writes | Toolchain |
|---|---|---|---|---|---|---|
| `doctor` | readiness | plugin needs (node ≥ 20, git, integrity, local starter), what the starter declares, MCP connectivity | — | machine, starter, `.mcp.json` | nothing in a project | `bin/doctor`, `bin/starter-requirements`, `claude mcp` |
| `init` | intent | mode, the one-question-at-a-time interview, Gate F1; scaffolds `.jairus/` (`jairus.json`, journal, placeholder backlog) | — (invokes `board`) | templates, the local starter's path and sha | `.jairus/INTENT.md`, `.jairus/jairus.json`, `.jairus/journal.md`, `.jairus/product-backlog.json` (placeholder) | `bin/check-intent`, `bin/doctor --scope plugin`, `bin/state`, `bin/make-backlog --placeholder` |
| `board` | the backlog plan | reads the intent and the placeholder, adds the feature cards after the reserved ones in dependency order, Gate 2; offers an `upgrade` card when the starter has moved past the pin | `planner` (QA only) | `.jairus/INTENT.md`, the placeholder, the starter's HEAD | `.jairus/product-backlog.json` · GitHub Project | `bin/make-backlog`, `bin/backlog`, `bin/validate-backlog`, `bin/state` |
| `ship` | run the next card | the first unblocked card in order: `bootstrap` (starter in place, prerequisites, build proof, empty env files, pin and zones) and `environment` (Neon via MCP, env values with the human); cards for Phase 2 are named, not run; a defect in the starter becomes a `starter-gap` card | — | `.jairus/jairus.json`, the backlog | the starter copy, `.claude/settings.json`, env files, `.jairus/prelive.json`, `.mcp.json`; card moves | `bin/copy-starter`, `bin/doctor --scope starter`, `bin/starter-requirements`, `bin/env-set`, `bin/prelive`, `bin/state`, `bin/backlog`, the starter's own commands; neon MCP |

**Verification checklist (live, in a fresh empty workspace, DEV first):**
1. `doctor` prints ✓/✗ with the exact fix for the plugin's needs and the starter's declared requirements, and the env checklist.
2. `init`: mode → interview → `check-intent --final` passes → Gate F1 → `.jairus/` seeded, nothing else created.
3. `board`: Gate 2 → `validate-backlog` passes with the reserved cards first and every feature depending on `bootstrap` and `branding`.
4. `ship` (card `bootstrap`): Gate F2 → starter copied in place → pin and zones recorded → seed commit → `doctor --scope starter` → the starter's install and core gate green → empty env files and pre-live items → Gate F-VERIFY (scope `skeleton`) → `bootstrap` Done.
5. `ship` (card `environment`, after you fill the env files): Neon project via MCP; the starter's setup command green, a second run changes nothing; both apps start, the seeded admin signs in, `verify-rls` exit 0.
6. QA variant (Phase 3): template repo, protection, GitHub Project created from a DEV backlog.

Done so far (automated): `node scripts/test-bin.mjs` — 7 tests (intent parsing and checks, backlog
creation and validation, local copy incl. in place with kept seed files). Dry run against the real
starter (`HEAD` `15cfb14`): 557 files copied, clean, no `dev-tools/`, no `.env` file other than
`.env.example`, seed files untouched; 3 cards written, overwrite refused, unblocked listed.

### Phase 2 — Build

| Command | Role | Owns (only) | Agent | Gates | Reads | Writes | Toolchain |
|---|---|---|---|---|---|---|---|
| `extend` | scaffold a plugin | `plugins/<id>/` skeleton and its wiring, nothing else | `extender` | P (branch, QA) | `plugins/README`, plugin-kit README | plugin scaffold, `branding/src/features.ts`, plugin lists, app `package.json` | pnpm, git |
| `design` | design one feature | PRD, DESIGN, ADR and `spec.json` (ACs, Extension plan, entry points) | `designer`, `reviewer` | 3 | the card, project docs, neon (read-only) | `.jairus/features/<f>/` | neon MCP (read), templates |
| `develop` | implement one feature | branch, code inside the plugin, schema gate | `developer` | 4, 5, P (branch, QA) | design artifacts | `plugins/<id>/**`, `branding/**`, route files, commits | pnpm (`gate:core`, `db:setup`), git |
| `review` | review and merge | scored review, zone check, merge | `reviewer`, `developer` (fix) | 6 | the branch diff | merge (control files only) | pnpm `gate:core`, git; QA: PR, CI `validate` |

**Verification:** scaffold a plugin in a demo product; take one feature through design, develop and
review in DEV; the zone check shows no diff under `packages/*`; a plugin table passes `db:setup` and
`verify-rls`; a deliberate core edit is rejected at review.

### Phase 3 — Release & guide

| Command | Role | Owns (only) | Agent | Gates | Toolchain |
|---|---|---|---|---|---|
| `deploy` | release | DEV: publish (create repo, initial push, mode → qa). QA: staging then production | `deployer` (QA) | P (initial), 7, 8 | git, gh; QA: vercel, neon, the starter's release path (**blocked until the starter ships one**) |
| `ship` | sequencer | the order of the feature loop; `--plan` dry run | — (invokes the stages, incl. `extend` when a plugin is missing) | those of the stages | `bin/validate-backlog --unblocked` |
| `help` | documentation | generated reference | — | — | — |

Plugin-wide closing work: drift check and its forbidden strings, README, the first release version.
(`help` is generated from the command files at run time; the old generated command/resource map was
retired because it duplicated this file and `help`.)

**Verification:** `ship --plan` and a full DEV loop over a multi-feature backlog; Gate P (initial)
on a scratch repo; `help` generated from the command files; `claude plugin validate` strict.

## Agents

| Agent | Phase | Model class | Job |
|---|---|---|---|
| `planner` | 1 (QA) | Haiku | GitHub backlog CRUD from a plan |
| `extender` | 2 | Sonnet | scaffold a plugin per `plugins/README.md` |
| `designer` | 2 | Opus-class | the four design artifacts (PRD, DESIGN, ADR, `spec.json`) |
| `reviewer` | 2 | read-only scorer | design and code scoring, zone check |
| `developer` | 2 | Sonnet | implementation and fixes inside the plugin |
| `deployer` | 3 (QA) | Haiku/Sonnet | staging and production release |

Agents return structured JSON; only commands present gates, move cards and write control files.

## Repository layout (this repo)

A single-plugin repo: the **repo root is the plugin**, and the same repo is its own marketplace.

```
.claude-plugin/plugin.json        the plugin manifest (owner of the version)
.claude-plugin/marketplace.json   the marketplace (one plugin entry, source ./)
skills/                           the command-skills in this build (the starter's docs are the knowledge)
agents/                           the six leaf-worker subagents (resources: rules/delegation.md)
rules/ templates/ hooks/          single-owner contracts, generated artifacts, hooks
bin/                              deterministic tools
README.md                         the plugin and repo README, incl. maintainer guidance
scripts/                          hook scripts (typecheck, secret-scan) and maintainer checks
docs/                             architecture and design record
```

## Known starter limits the plugin states instead of hiding

Portal and admin screens are skeletons; no page/slot contributions; no `businessTable()` helper; **no
deploy workflows** (QA release blocked); registry undecided (D-1); product-template root files
unfinished (H-15, so `packages/*` is in the copy and the zone check enforces "core is read only").
