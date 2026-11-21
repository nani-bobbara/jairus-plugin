---
name: ship
description: "Run the next card. Reads where the project is (.jairus/jairus.json) and the backlog, takes the first unblocked card in order and runs it by type: bootstrap (the starter in place, its prerequisites checked, the build proven, empty env files and pre-live items) or environment (infrastructure and env values, when you are ready). A card that needs the Phase 2 build commands is named, not run. Run /jairus:ship [card-name]."
argument-hint: "[card-name]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git rev-parse *), Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git init *), Bash(git checkout *), Bash(git switch *), Bash(node *), Bash(pnpm *), Bash(cp *), Bash(printf *), Bash(gh auth status), Bash(gh repo create *), Bash(gh repo view *), Bash(gh api *), mcp__neon__*, mcp__github__*, mcp__vercel__*, mcp__stripe__*
disable-model-invocation: true
---

# /jairus:ship

**Owns:** running one card at a time, in the order the backlog sets: picking it, running its procedure, moving it, recording
the result. **Does NOT own:** the backlog plan (`board`), the intent (`init`), or the build commands of Phase 2
(`extend`, `design`, `develop`, `review`). Where a card needs those, `ship` names it and stops.

All `rules/`, `templates/` and `bin/` paths below are under `${CLAUDE_PLUGIN_ROOT}`. Card to run: **$ARGUMENTS** (empty =
the next unblocked card). **Banner:** print `Jairus v<version> — ship`, `version` from `.claude-plugin/plugin.json`.

## Step 0 — Preflight
Run rules/preflight.md (stage: ship) — stop on any failure. No card move or control-file write before it passes.

## Step 1 — Where are we, which card
1. `node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus show` — print it. A `note:` line (a placeholder backlog, no backlog)
   → stop and say what to run (`/jairus:board`, `/jairus:init`).
2. The card: `$ARGUMENTS`, or `node ${CLAUDE_PLUGIN_ROOT}/bin/backlog.mjs .jairus/product-backlog.json next`
   (`NEXT none` → say so: everything unblocked is done or waiting; show `state.mjs show`).
3. Dispatch on the card's `type`:

| Card type | What `ship` does |
|---|---|
| `bootstrap` | the **bootstrap procedure** below |
| `environment` | the **environment procedure** below, only when the human says they are ready |
| `branding`, `feature`, `config`, `upgrade`, `bug`, `change` | `Card <name> needs the Phase 2 build commands, which are not in this build yet (phase-2-3/README.md).` Record that as the next action (Step 4) and stop |
| `starter-gap` | never run: it is an extension request for the starter; say so |

## Bootstrap procedure (card `bootstrap`) — `rules/foundation.md` F2 to F-VERIFY
Record each step with `node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus step <F-step> <status> --ref <text>`; never edit
`jairus.json` by hand. Resume: skip steps already `done`, `deferred` or `skipped`.

1. **Gate F2** (resource plan, DEV: the local copy only) before anything is created. First confirm `starter.path` exists
   and is a jairus-starter; if not, re-resolve it (`JAIRUS_STARTER_PATH`, then the sibling search) and record the corrected
   path (the state tool stores forward slashes).
2. **F3** the project in place: `bin/copy-starter.mjs --starter <path> --dest . --keep .jairus,.claude,README.md`; copy
   `templates/settings.json` to `.claude/settings.json` if absent; make sure `.gitignore` ignores `.env*` except
   `.env.example` and not `.jairus/`. Record the pin with
   `state.mjs .jairus starter --path <path> --sha <40 hex> --dirty <bool> --core <core zones> --product <product zones>`
   (the zones are the Core and Product rows of `rules/starter-contract.md` → Zones). The workspace's existing `.git` history
   (if any) is reported to the human, not rewritten. Commit `chore: jairus seed`. Step F3 `done`.
3. **F4** prove the copy builds: `node ${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs --mode dev --scope starter` (a `FAIL`: print its
   `fix:` line, step F4 `failed`, go to Step 4 — the human fixes it and re-runs `/jairus:ship`), then the starter's install and
   core gate (`rules/gates.md` → Build checks). **If the gate fails in the starter's own code** (a lint, type or test failure
   in files the product did not write), step F4 `failed`, file it with
   `node ${CLAUDE_PLUGIN_ROOT}/bin/backlog.mjs .jairus/product-backlog.json gap "<short title>" --evidence "<command and first error>"`
   and stop: never patch the starter.
4. **Environment deferred (DEV):** create each env file the starter's `.env.example` names as an empty gitignored copy
   (`cp`), and one pre-live item per env section (`bin/prelive.mjs`, `--before develop`; shape `templates/prelive.json`).
   Steps F5 and F6 `deferred`, F7 to F10 `skipped`. Never ask for a credential, a connection string or a database detail.
5. **Gate F-VERIFY** (skeleton): `state.mjs .jairus foundation --status green --scope skeleton`, then
   `node ${CLAUDE_PLUGIN_ROOT}/bin/backlog.mjs .jairus/product-backlog.json move bootstrap Done`.

## Environment procedure (card `environment`) — `rules/foundation.md` F5 and F6
Ask once: "Have you filled the env files, or do you want to do it now?" Not ready → stop; the card stays in Backlog and
the next action says so. Ready:
1. Write `templates/mcp.dev.json` to `.mcp.json` if absent; a new file means one restart of Claude Code here, then re-run
   `/jairus:ship`.
2. **F5** create the Neon project through the neon MCP (a gated write: show it, then do it), read back **only** the project
   id and the default branch id, record them under `project.neon`.
3. **F6** fill what the plugin may (generatable variables and non-secret ids through `bin/env-set.mjs`), show the human the
   remaining names per file, check presence with `node ${CLAUDE_PLUGIN_ROOT}/bin/starter-requirements.mjs . --status`, then run
   the starter's setup command (`rules/starter-contract.md`). Its refusals name what is missing: ask, retry.
4. The environment proof (`rules/gates.md` → F-VERIFY), mark the pre-live items `done`, record F5 and F6 `done`, and move the
   card: `backlog.mjs … move environment Done`.

Secrets: generated values go through `bin/env-set.mjs`, everything else is supplied by the human
(`rules/foundation.md` → Secrets). No secret is ever read, printed or written by this command.

## Step 4 — Record and hand over
Whatever happened, finish with the state tool so any later session can pick up:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus next --command "<the single next command>" --reason "<why>" --phase start --current "<what just finished>" [--blocker "<what is blocking>"]
node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus journal --command ship --card <card> --event "<what happened>" --next "<next>"
```

```
✅ <card> — <result> · <the next card, or "needs the Phase 2 build commands">
Next: <command>
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message |
| `state.mjs show` prints a note (placeholder / no backlog) | Stop and name the command to run |
| `doctor --scope starter` reports a `FAIL` | Print its `fix:` line; F4 `failed`; re-run `/jairus:ship` once fixed |
| The core gate fails in the starter's code | File a `starter-gap` card with the evidence; stop; never patch the starter |
| A step fails | Record it `failed` with the reason; re-running resumes at that step |
| Gate declined / stopped | Follow the registry row's on-decline in `rules/gates.md`; nothing further is created |
