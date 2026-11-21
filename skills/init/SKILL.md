---
name: init
description: "Project entry point (Stage 0). In an empty workspace: asks the mode (dev or qa) and interviews you to create .jairus/INTENT.md, then hands the feature list to board, whose first card is the starter bootstrap. Creates the intent only: the starter copy, the build proof, the environment and any infrastructure are the bootstrap card's work, never init's. Run once per project; re-running resumes."
argument-hint: "[optional context, e.g. 'dev mode']"
allowed-tools: Read, Write, Edit, Glob, Grep, Skill, AskUserQuestion, Bash(git rev-parse *), Bash(git status *), Bash(git log *), Bash(node *), Bash(cp *)
disable-model-invocation: true
---

# /jairus:init

**Owns:** routing a workspace into the pipeline (Stage 0): the mode choice, the interview that creates
`.jairus/INTENT.md`, Gate F1 and the scaffolding of `.jairus/`: `jairus.json`, `journal.md` and the placeholder
`product-backlog.json` (the reserved cards only).
**Does NOT own:** the starter copy, the build proof, env files or infrastructure (the bootstrap card, run by
`ship`, `rules/foundation.md`), the backlog plan and Gate 2 (`board`), the modes (`rules/modes.md`), or readiness
(`doctor`). `init` creates no git repository, copies no starter and asks for no credential.

All `rules/`, `templates/` and `bin/` paths below are under `${CLAUDE_PLUGIN_ROOT}`. User context:
"$ARGUMENTS". **Banner:** print `Jairus v<version> — init`, `version` read from
`.claude-plugin/plugin.json` (never hardcoded). Stage contract: `rules/pipeline.md` → STAGE 0.

## Step 0 — Preflight

`init` runs no part of `rules/preflight.md` on a fresh workspace. It runs the plugin-level checks (Step 3) and
never blocks on anything the starter needs: those are checked when the bootstrap card runs.

## Step 1 — Detect context

Checked in order:

| Condition | Route |
|---|---|
| `.jairus/jairus.json` in the current directory | **Resume.** Run `rules/preflight.md` part C, then report state and the single next action: no backlog yet → invoke `board`; otherwise run `node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus show` and print it (the recorded current step and next action); the next action is usually `/jairus:ship`. Never re-interview unless the user explicitly asks. |
| `.jairus/INTENT.md` with `status: bootstrapped`, no `.jairus/jairus.json` | Re-run the Gate F1 write (below), then invoke `board`. |
| `.jairus/INTENT.md` with `status: draft` | Resume the interview from the draft (show it; ask what to confirm or change). |
| the directory is empty, or holds only README, `.git`, `.claude/` | **NEW** → Step 2. If `.git` already has commits, tell the human ("this folder already has git history; the project will be committed on top of it") and continue only if they accept. |
| anything else (an `app/`, `src/`, `package.json`, …) | **Stop.** This is not an empty workspace and adopting an existing repo is not supported (README → Not supported). Offer: create the project in a new empty directory. Never touch the existing files. |

## Step 2 — Choose the mode

Ask once with AskUserQuestion (options dev, recommended, and qa), recommending DEV for building and testing the product (`rules/modes.md` has the table):

- **dev** — local copy of the starter, local git, `.jairus/product-backlog.json`; nothing touches GitHub, Vercel,
  Stripe or Neon until you choose to.
- **qa** — GitHub repo from the starter template, GitHub Project board, PR flow with CI.

For DEV also resolve the local starter (`rules/modes.md` → Backend 1): `JAIRUS_STARTER_PATH`, then a
`jairus-starter` folder found by walking up from here; show the path and the starter's `HEAD` sha
(`git -C <path> rev-parse HEAD`), and ask only if it is not found. Keep `mode` (and the starter path) in the
draft intent (Step 4).

## Step 3 — F0: the plugin's own readiness

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs --mode <dev|qa> --scope plugin` (Node, git, plugin integrity and, in
DEV, the local starter). **Any `FAIL` stops `init` here, before the interview:** print its `fix:` line, record
nothing, and have the human re-run `/jairus:init` once fixed. What the starter itself needs (its runtime, package
manager, env variables) is **not** checked here: `doctor` shows it as a heads-up at any time and the bootstrap
card checks it against the project's copy. No MCP server is needed or written by `init`.

## Step 4 — F1: the interview creates `.jairus/INTENT.md`

`init` creates the file; the human never writes it by hand. Create the `.jairus/` folder, then copy
`templates/INTENT.md` to `.jairus/INTENT.md` (`status: draft`, `mode` from Step 2).

**Ask one question at a time, with the AskUserQuestion tool, never the whole list in one go.** Every question offers 2–4
concrete options built from what the human has already said ("$ARGUMENTS" and earlier answers), the recommended option
first and marked "(Recommended)", and the human can always pick **Other** and type their own answer. After each answer,
write it into the draft before asking the next, so a dropped session resumes from the draft. Skip any question that
"$ARGUMENTS" or an earlier answer already settles (confirm it in one line instead).

Order of questions:

1. **The product in a sentence** (free text via Other; offer two or three phrasings of "$ARGUMENTS" if given) →
   `one_liner` (≤ 120 chars: what, for whom). Then derive and offer `project_name` (kebab-case, ≤ 32 chars) and
   `display_name` as options to accept or change, one question each.
2. **Who it is for** (the persona) — options: the two or three most likely personas for that product, plus Other.
3. **The problem it solves** — options drawn from the persona and one-liner, plus Other.
4. **Features, one at a time** (3–6 slices). For each: *name* (options: suggestions from the product, plus Other);
   *what it does and why it matters, in 1–2 sentences* (options: a drafted sentence to accept, plus Other);
   *plan tier* (free / basic / pro / all); *depends on* (options: the features already added, or none);
   *explicitly out of scope* (options: two likely exclusions, none, plus Other). After each, ask "Add another feature?"
   (options: add another / that is all). Group slices into business domains: each `feature` names its **plugin** id
   (a domain such as `example`, shared by its slices; never a core namespace — `rules/intent-schema.md`); propose the id
   as an option. The name `bootstrap` is reserved: board adds that card itself.
5. **Monetization** — options: free only · free plus paid tiers · one-time purchase · usage-based. A monetized product
   gets a `config` card (e.g. `plans`) for its plan catalog; there are no bootstrap, auth or billing features — the
   starter provides them.
6. **Key data entities** — options: the entities implied by the features, plus Other.
7. **Which feature to build first** — options: the features that have no dependencies.

A blank `description` or empty `out_of_scope` blocks design (Phase 2), so never move on from a feature without both.
Fill the frontmatter and the prose sections. **Do not ask about databases, accounts, credentials or hosting:**
infrastructure and environment are part of the bootstrap card and are filled in by the human later.
Verify with `node ${CLAUDE_PLUGIN_ROOT}/bin/check-intent.mjs .jairus/INTENT.md` (structure) and, before the gate,
`node ${CLAUDE_PLUGIN_ROOT}/bin/check-intent.mjs .jairus/INTENT.md --final`; fix every `FAIL` with the human.

## Gate F1

Present **Gate F1** per `rules/gates.md` (summary, mode, the dependency-ordered feature tree with each
card's plugin; criteria = `check-intent.mjs --final` output plus the interview facts). On approval:
set `status: bootstrapped` (never written again), then scaffold `.jairus/`:

1. Copy `templates/jairus.json` to `.jairus/jairus.json` and fill the fixed fields by Edit — `jairus_version` and
   `created_with` from `plugin.json`, `created_at`, `mode`, `project.name`, `project.backlog.store` (`file` in DEV, `github`
   in QA), `starter.source` (`local` / `github`) and `starter.repo` / `starter.ref` (QA). Copy `templates/journal.md` to
   `.jairus/journal.md`.
2. Record the rest **only through the state tool**, never by hand: `node ${CLAUDE_PLUGIN_ROOT}/bin/state.mjs .jairus starter --path <starter path> --source local`
   (DEV; it stores forward slashes, so a Windows backslash is never lost), then
   `state.mjs .jairus step F0 done --ref "doctor --scope plugin"` and `state.mjs .jairus step F1 done --ref ".jairus/INTENT.md"`.
3. Create the placeholder backlog: `node ${CLAUDE_PLUGIN_ROOT}/bin/make-backlog.mjs --placeholder --out .jairus/product-backlog.json`
   (the reserved cards `bootstrap`, `environment`, `branding`; the features are added by `board`).
4. Record where the project is: `state.mjs .jairus next --command "/jairus:board" --reason "plan the backlog from the intent" --phase start --current "intent approved"` and
   `state.mjs .jairus journal --command init --event "Gate F1 approved, .jairus scaffolded" --next "/jairus:board"`.

## Step 5 — Hand over to board

Invoke `board` with the Skill tool (`jairus:board`, no args). It reads the intent and the placeholder, presents Gate 2 and
returns control here. `init` never presents Gate 2 and never runs a card (`ship` does).

## Writes (per `rules/transitions.md`; `init` is the only writer of these rows)

- Gate F1: `.jairus/INTENT.md` → `status: bootstrapped`; `.jairus/jairus.json`, `.jairus/journal.md` and the placeholder
  `.jairus/product-backlog.json`.
- Control-file writes go through `bin/state.mjs` (`jairus.json`, the journal) and `bin/make-backlog.mjs` (the backlog).
- F0 and F1: `project.foundation.steps.<F-step>`; and the `workflow` block: the next action is `/jairus:board`.
- Nothing else: no starter file, no `.mcp.json`, no `.claude/settings.json`, no git commit, no env file (all of that is
  the bootstrap card's, run by `ship`, `rules/foundation.md`). Everything jairus keeps about the project lives in `.jairus/`
  (`rules/state-model.md`).

## Handover

After `board` returns: print the mode, the backlog location (`.jairus/product-backlog.json` or the board URL) and
`Next: /jairus:ship` — it runs card 1, the starter bootstrap (starter in place, prerequisites checked, build proven, empty
env files). `/jairus:help` shows the current step and next action in any later session. Phase 2 and 3 commands are not in this
build yet: see `phase-2-3/README.md`.

## On error

| Error | Recovery |
|---|---|
| Not an empty workspace | Stop with the Step 1 message; touch nothing |
| Local starter not found / not a jairus-starter | Ask for the path; set `JAIRUS_STARTER_PATH` |
| `check-intent.mjs` reports problems | Fix them with the human; never present Gate F1 with a `FAIL` |
| `doctor --scope plugin` reports a `FAIL` | Print its `fix:` line, stop; the human fixes it and re-runs `/jairus:init` |
| Gate declined / stopped | Follow the registry row's on-decline in `rules/gates.md` |
