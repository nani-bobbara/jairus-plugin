# Foundation — the intent (init), the plan (board) and the bootstrap card (ship)

Foundation turns an empty workspace into a verified walking skeleton **before any product feature**, in three
parts and in this order:

1. **`init`** captures the intent (F0 plugin readiness, F1 interview → `.jairus/INTENT.md`) and scaffolds `.jairus/`: the
   `jairus.json` anchor, the journal and a **placeholder backlog** holding the reserved cards. It creates nothing else.
2. **`board`** plans: it adds one card per feature after the reserved cards (`bootstrap`, `environment`, `branding`), in
   dependency order, and presents Gate 2. It runs nothing.
3. **`ship`** runs the cards in order. **`bootstrap`** is first: bring the starter in, prove it builds, leave the environment
   the starter declares as empty files with a checklist (and, in QA, the accounts and hosting). **`environment`** is the card
   that completes it with the human in the loop, when they are ready. Every feature depends on `bootstrap` and `branding`.

Every command records where the project is, and the single next action, in `jairus.json → workflow` through `bin/state.mjs`;
`/jairus:help` reads it in any session.

Until F-VERIFY passes, stage commands refuse to run (`rules/preflight.md` part B). The scaffold is **copied or
cloned from the starter, never regenerated**; the core stays read only (`rules/starter-contract.md`).

Steps depend on the mode (`rules/modes.md`). A step that does not apply is recorded `skipped`.

## Configuration (`.jairus/jairus.json`)

| Key | Default | Meaning |
|---|---|---|
| `mode` | asked | `dev` or `qa` |
| `starter.source` | `local` in DEV, `github` in QA | where the starter comes from |
| `starter.path` | resolved (`rules/modes.md`) | local starter folder (DEV) |
| `starter.repo` / `starter.ref` | `Nani-Bobbara_CUDL/jairus-starter` / default branch | GitHub template (QA) |
| `starter.sha` / `starter.dirty` | recorded at F3 | the commit actually copied, and whether the tree was dirty |

## Steps and gates

Each step records `{step: done|deferred|failed|skipped, at, ref}` in `.jairus/jairus.json →
project.foundation.steps` (`rules/transitions.md`). Gate exit criteria: `rules/gates.md` registry.

| Step | Run by | DEV | QA |
|---|---|---|---|
| F0 plugin readiness | `init` | Node, git, plugin integrity, local starter | + MCP servers reachable |
| F1 intent 🚦 | `init` | interview → `.jairus/INTENT.md` | same |
| *(backlog)* 🚦 Gate 2 | `board` | card 1 `bootstrap` + one card per feature | same (QA ordering: see below) |
| F2 plan 🚦 | `ship` | the local copy only | + GitHub, Neon, Vercel, Stripe |
| F3 project | `ship` | local copy, `git init`, seed commit | template repo, branch protection, Environments |
| F4 prove build | `ship` | starter prerequisites, then install and the core gate | same |
| F5 Neon | `ship` | **deferred** (pre-live item) | project + `dev`, `preview`, `main` via the neon MCP (ids only) |
| F6 environment 🙋 | `ship` | **deferred**: empty env files and a checklist; the human fills them when ready | env files with the human, then the starter's setup command |
| F7 payments | `ship` | `skipped` | Stripe test products + webhook |
| F8 hosting | `ship` | `skipped` | two Vercel projects |
| F9 CI | `ship` | `skipped` | confirm workflows, secrets, protection |
| F10 first release 🚦 | `ship` | `skipped` | first production release (blocked until the starter ships a deploy path) |
| F-VERIFY 🚦 | `ship` | skeleton proof (scope `skeleton`) | + environment and deployed proof (scope `release`) |

**DEV defers the environment.** Neither `init` nor the bootstrap card asks for Neon, database or auth details.
After the build is proven (F4) the card creates the empty gitignored env files, writes one pre-live item per env
section the starter lists (`bin/prelive.mjs`, shaped by `templates/prelive.json`, `--before develop`) and tells the human which files to fill in, in their
own editor, when they are ready. the `environment` card (run by `/jairus:ship` when you are ready) completes F5–F6 later: it writes the neon MCP file, creates the
project, runs the starter's setup command and the environment proof, and marks the pre-live items `done`.

**QA ordering (open).** In QA the GitHub repo that holds the Project board is created by this card, so QA's repo must
exist before its backlog can: that ordering is settled when QA ships (Phase 3). DEV has no such constraint.

## Tools and who holds what

The plugin carries no vendor tool. It reads what the starter requires (`bin/starter-requirements.mjs`), reaches
each service through the workspace's MCP servers, and runs only the starter's own commands
(`rules/starter-contract.md` → Commands). Foundation writes no SQL.

| Task | Tool |
|---|---|
| What the starter needs: runtime, package manager, env variables | `node ${CLAUDE_PLUGIN_ROOT}/bin/starter-requirements.mjs . --status` (names only, never values) |
| Neon project and branches; non-secret ids | neon MCP (a gated write after F2; reads otherwise) |
| Database roles, schema, grants, seed, RLS proof, first admin | the starter's setup command, with the starter's env (`rules/starter-contract.md`) |
| GitHub repo, secrets/variables, Environments, protection (QA) | github MCP |
| Vercel projects and env (QA) | vercel MCP |
| Stripe test products and webhook | stripe MCP |
| A variable the starter's comment says to generate | `bin/env-set.mjs` fed by a node crypto one-liner |

## Secrets: the human supplies, the plugin never sees them

A secret value never enters the chat, a command-line argument, a Write/Edit call or a journal line (project
settings deny Read/Edit on `**/.env*`). Three routes, in this order:

1. **Generatable** — the starter's own comment says how (for example `openssl rand -base64 32`):
   `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" | node ${CLAUDE_PLUGIN_ROOT}/bin/env-set.mjs <KEY> <file>…`
   (one call per file when the starter says each app needs a different value).
2. **Non-secret ids** (a project id, a branch id, an auth URL, a local origin) — read through the MCP server or
   taken from the starter's comment, then `printf <value> | node ${CLAUDE_PLUGIN_ROOT}/bin/env-set.mjs <KEY> <file>…`.
3. **Everything else** (connection strings, API keys, passwords, tokens) — the **human** puts it in the env file in
   their own editor or terminal. The plugin lists the names and files, then checks presence with
   `starter-requirements.mjs . --status`. A name the human defers becomes a pre-live item
   (`bin/prelive.mjs`), not a blocker for the work that does not need it.

Which env files exist and which variables each takes come from the starter's `.env.example` header and tags,
never from this plugin. Tool output may still land in the session transcript: rotate any credential that was
ever shown if the transcript is shared.

## Step details

### F0 — Plugin readiness (`init`)
Run `node ${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs --mode <dev|qa> --scope plugin`: Node and git, the plugin's integrity
and, in DEV, the local starter. Every `fix:` line is the human's to act on; nothing here installs anything. **F0 is
`done` only with no `FAIL`**; otherwise `init` stops before F1. What the starter itself needs is not checked here: it
is checked at F4 against the project's own copy, and `doctor` shows it as a heads-up at any time.

### F1 — Intent + breakdown 🚦 (`init`)
Interview (idea, persona, 3–6 features, monetization, entities); stack and topology are fixed. No question about
databases, accounts, credentials or hosting. Write draft `.jairus/INTENT.md` per `rules/intent-schema.md`.
**Gate F1** seeds `.jairus/jairus.json` and `.jairus/journal.md`.

### The reserved cards (`init` writes them, `ship` runs them)
`init` writes the placeholder backlog with `bootstrap` (card 1), `environment` and `branding` (type = the card name, reserved
names, stage Backlog); `board` makes every feature depend on `bootstrap` and `branding`, so `bootstrap` is the only unblocked
card until it is `Done`. `bootstrap` and `environment` have no design, develop or review stage: `ship` runs them and moves them
**Backlog → Done** (`bin/backlog.mjs move`). `bootstrap` covers F2 to F4, the deferral of F5 to F7 and F-VERIFY (skeleton);
`environment` covers F5, F6 and the environment proof. `branding` is run by the Phase 2 build commands. If a step fails the
card stays in Backlog; re-run `/jairus:ship`, which resumes. A failure in the **starter's own code** is filed as a `starter-gap`
card with the evidence (`bin/backlog.mjs gap`) and never patched.

### F2 — Resource plan 🚦 (before any spend)
Show exactly what will be created, on which accounts:
```
DEV : local copy of <starter.path>@<sha> into this workspace (its own git repo, no remote)
QA  : GitHub repo <owner>/<name> (private) from <starter.repo>@<starter.ref> + Project board
      Neon: project <name>, branches dev / preview / main · Vercel: <name>-portal, <name>-admin
      Stripe: test-mode products per plan + webhook
```
**Gate F2.** Never create a billable resource before it.

### F3 — Project from the starter
The project is created **in place**: the workspace directory becomes the project root. By then it holds only the
seed files (the `.jairus/` folder with `INTENT.md`, `jairus.json`, `journal.md` and `product-backlog.json`, optionally
`README.md`, `.claude/` and `.git`); anything else stops the card. A seed file is never overwritten by a starter file
of the same name.
1. **Bring the starter in** by the starter-source backend (`rules/modes.md`). DEV first checks that `starter.path` exists
   and is a jairus-starter; if not (a mistyped or mangled path), re-resolve it (`JAIRUS_STARTER_PATH`, then the sibling
   search), ask only when that fails, and write the corrected path (forward slashes) back to `.jairus/jairus.json`.
   DEV: `node ${CLAUDE_PLUGIN_ROOT}/bin/copy-starter.mjs --starter <starter.path> --dest . --keep
   .jairus,.claude,README.md` — it prints `{sha, dirty, files, skipped}` and runs `git init -b main` when there is
   no `.git`.
   QA: `gh repo create <owner>/<name> --private --template <starter.repo>` (no clone), then in the
   workspace `git init -b main`, `git remote add origin <url>`, `git fetch origin <starter.ref>`
   (retry briefly: template generation is asynchronous) and `git checkout -B main origin/<starter.ref>`.
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/settings.json` to `.claude/settings.json` (skip if it exists),
   and in QA `${CLAUDE_PLUGIN_ROOT}/templates/mcp.json` to `.mcp.json`. Ensure `.gitignore` ignores `.env*` (except `.env.example`) and does
   **not** ignore `.jairus/` (it is versioned).
3. Record `starter.{source, path|repo, ref, sha, dirty}` (`rules/transitions.md`).
4. **Seed commit** `chore: jairus seed` of `.jairus/`, `.claude/settings.json`, `.mcp.json` (QA) and the
   lockfile if changed. DEV: local only. QA: push it — the last direct push to `main`.
5. **QA only:** enable branch protection on `main` (PR required, `required_approving_review_count:
   0` because the human's approval is Gate 6, required status check `validate`, `enforce_admins:
   true`) via `gh api -X PUT repos/<owner>/<name>/branches/main/protection`; create the Environment
   `database-ci` the starter's `db.yml` uses. If GitHub rejects a protection feature (plan limits),
   stop and tell the human — never skip silently. In QA a newly written `.mcp.json` means the human restarts Claude
   Code in this directory (servers load at session start) and re-runs `/jairus:ship`, which resumes here.

### F4 — Prove the copy builds
First the starter's prerequisites, read from the project's own copy: `node ${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs
--mode <dev|qa> --scope starter` (its runtime, package manager). A `FAIL` records F4 `failed` with its `fix:` line and
stops; the human fixes it and re-runs `/jairus:ship`, which resumes here. Then install and run the starter's
build checks (`rules/gates.md` → Build checks, `rules/starter-contract.md` → Commands): the first install after the
copy is the plain install (it rewrites the lockfile once, because `dev-tools/` is not in the copy; commit it), then the
core gate — all green. The starter's dev-tools gate is not run in a product. Do not scaffold or hand-wire anything.

### F5 — Neon project (neon MCP)
DEV: run only by the `environment` card, never by the `bootstrap` card. After Gate F2 (QA) or the human's go-ahead,
create the Neon project through the neon MCP (a gated write), then read back **only** its id and the default branch
id and record `project.neon` (`rules/transitions.md`). DEV keeps the default branch as `dev`; QA also creates
`preview` and `main` per the starter's own README. Connection strings and keys are **not** read: they follow the
Secrets route 3. If the human has no Neon access yet, record a pre-live item
(`bin/prelive.mjs add "Neon project and connection strings" --kind account --before develop`) and skip to F7.

### F6 — Environment with the human 🙋
DEV: steps 1 and 3 run at the end of the `bootstrap` card (empty files, checklist, pre-live items); steps 2 and 4
run only in the `environment` card.
1. Create each env file named by the starter's `.env.example` header as an empty gitignored copy of it
   (`cp`; skip if present). Confirm `.gitignore` covers them.
2. Fill what the plugin may: generatable variables and non-secret ids (Secrets routes 1 and 2).
3. Show the human the remaining names grouped by file, with the starter's own comment for each; the human fills
   them and says done. Re-run `starter-requirements.mjs . --status`; each name still empty is either deferred
   (`prelive.mjs add`) or asked again. Never print or read a value.
4. When the variables the setup needs are present, run **the starter's setup command** as its README and
   `rules/starter-contract.md` name it, with `TARGET_ENV=development`. Its refusals (exit 2 naming the missing
   variable groups) are authoritative: map each to a name, ask the human, retry. Require exit 0 and the RLS proof
   green; running it twice must change nothing. Record the final line as the step `ref`.
5. If the database cannot be reached yet (no credentials), the step is `skipped` with its pre-live items, and
   `develop` refuses any card that needs the database until `prelive.mjs check --before develop` is clear.

### F7 — Payments (Stripe)
QA: through the stripe MCP, test-mode products for each paid plan in `branding/src/plans.ts` (each
`price_…` id is a non-secret id: set it in its `STRIPE_PRICE_<PLAN>` variable) and a webhook endpoint to the portal's Stripe
webhook route (the signing secret `STRIPE_WEBHOOK_SECRET` is a secret: the human copies it from the Stripe dashboard, Secrets route 3). DEV: `skipped` — with no keys the apps boot on placeholders and checkout checks are
reported blocked. Live objects wait for a feature's Gate 5.

### F8 — Hosting (QA)
Create two Vercel projects, `<name>-portal` and `<name>-admin`, **without a Git connection**
(vercel MCP): nothing may deploy
on push or merge. If a project is Git-connected, disconnect it and confirm via MCP. Pick a stable `preview_alias` per
app (`<project>-preview.vercel.app`), record `project.vercel`, set each app's env per `.env.example`
tags (the portal never holds `DATABASE_URL_ADMIN`; Production → Neon `main`, Preview → Neon
`preview`), and turn on deployment protection for Preview deployments.

### F9 — CI (QA)
Confirm the starter's workflows exist (`ci.yml`, `db.yml`, `security.yml`), branch protection requires
`validate` with `enforce_admins`, and the secrets/variables exist — names only (github MCP).

### F10 — First release 🚦 (QA)
**Blocked** while `.github/workflows/` holds no deploy workflow (`rules/starter-contract.md` → CI):
report `blocked: the starter ships no deploy path (starter register)` and record the step `failed`.
When the starter provides one: **Gate F10**, then run it per the starter's README and poll each
Vercel build to `READY` via MCP.

### F-VERIFY — Prove it 🚦
Evidence, not claims (the checks are the `rules/gates.md` registry row). **Gate F-VERIFY** → `board` sets
`project.foundation.status = "green"` and `project.foundation.scope`, moves the `bootstrap` card **Backlog → Done**,
and lists the cards that are now unblocked.

## Resume & idempotency

On re-run skip `done`, `deferred` and `skipped` steps (a deferred step runs only in the `environment` card), retry `failed`,
and never re-create an existing resource (check first: local folder, repo, Neon project and branches, Vercel projects,
Stripe products). The starter's setup command is idempotent. A dead session resumes at the first step that is not
`done`, `deferred` or `skipped`.
