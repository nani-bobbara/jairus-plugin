# Modes — DEV and QA

Single owner of the two workflow modes and of the two backends that hide the difference from the
commands. `.jairus/jairus.json → mode` is `"dev"` or `"qa"`. `init` asks once (F0) and records it; every
other command reads it and never asks again.

| | **DEV** — build and test locally | **QA** — GitHub-backed delivery |
|---|---|---|
| Starter source | a local `jairus-starter` folder, copied | a GitHub template repo, cloned |
| Backlog | `.jairus/product-backlog.json` | GitHub Project board |
| Git remote | none until Gate P (initial) | created at F3 |
| Commits | free, local, per stage and layer | feature branch + PR; every push is Gate P (branch) |
| Gate 6 | review score + build checks, then a **local merge** to local `main` | review score, PR, CI `validate` green, merge on GitHub |
| Neon | one project, `dev` branch (Neon Managed Better Auth exists only on Neon, so DEV is never fully offline) | `dev` / `preview` / `main` |
| Stripe | optional test keys; placeholders pass env validation | test keys; live objects at Gate 5 |
| Vercel | none; the starter's own dev and build commands | two projects, Gates 7 and 8 |
| Production release | refused | Gates 7 and 8 (blocked until the starter ships a deploy path) |
| MCP servers needed | neon (read-only) | github, neon, stripe, vercel |

**Graduation.** DEV becomes QA exactly once, at Gate P (initial): the human approves creating the
GitHub repo and pushing the work so far, `.jairus/jairus.json → mode` becomes `"qa"`, `remote` is recorded,
and the GitHub Project is created from `.jairus/product-backlog.json` (cards keep their stage; Phase 3). The release
foundation steps (F8–F10, `rules/foundation.md`) then remain for `ship` to resume. There is no QA → DEV path.

## Backend 1 — starter source

| `starter.source` | Behaviour (`rules/foundation.md` → F3) |
|---|---|
| `local` | resolve `starter.path`, copy the tracked and untracked-but-not-ignored files (`git ls-files -co --exclude-standard`) **excluding** `.git`, `node_modules`, build output and `dev-tools/`; `git init`; record `starter.sha` (the starter's `HEAD`) and `starter.dirty` (true when its working tree had uncommitted changes) |
| `github` | `gh repo create <owner>/<name> --private --template <starter.repo> --clone` (or clone `starter.ref` and re-init); record the cloned `starter.sha` |

Resolution order for `starter.path`: the value in `.jairus/jairus.json` → env `JAIRUS_STARTER_PATH` → walk up
from the workspace to a folder named `jairus-starter` whose `package.json` `name` is
`jairus-starter`. Not found → stop and ask for the path. The product is created **in place**: the
workspace where `init` runs becomes the project root and gets its own `.git`
(`node ${CLAUDE_PLUGIN_ROOT}/bin/copy-starter.mjs`, `rules/foundation.md` → F3).

## Backend 2 — backlog store

| `project.backlog.store` | Source of truth for feature stage | Written by |
|---|---|---|
| `file` | `.jairus/product-backlog.json` (committed) | `board` (create), the commands that move cards |
| `github` | the GitHub Project | `board` through the planner agent, the commands that move cards |

Both stores use the same stage names (`rules/state-model.md`) and the same moves
(`rules/transitions.md`). Commands call "the backlog" and never branch on the store themselves;
only `board` and the card-move step know the difference.

## Rules

- A command never runs a GitHub, Vercel or Stripe operation while `mode` is `"dev"`; it stops with
  `This is a DEV project: <operation> is a QA step (see rules/modes.md).`
- DEV never refuses to commit locally; it never pushes. The only first remote action is Gate P.
- DEV Gate 6 merges into local `main` with a merge commit; no PR exists.
- The mode is never inferred from the presence of a remote or a board; `.jairus/jairus.json` decides.
- QA-only steps skipped in DEV are recorded as `skipped` (not `done`) in
  `project.foundation.steps`, so graduation knows what remains.
