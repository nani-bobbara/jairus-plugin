---
name: deploy
description: "Release the work: in a DEV project it publishes — creates the private GitHub repo and pushes main after Gate P (initial), then the project becomes QA; in a QA project it runs staging (Gate 7) and production (Gate 8) through the starter's release path via the deployer (blocked until the starter ships one). Never pushes or releases without explicit approval. Run /jairus:deploy [feature-name]."
argument-hint: "[feature-name]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git switch *), Bash(git checkout *), Bash(git branch *), Bash(git merge *), Bash(git rev-parse *), Bash(git show *), Bash(git init *), Bash(git fetch *), Bash(git push *), Bash(pnpm *), Bash(node *), Bash(gh auth status), Bash(gh repo create *), Bash(gh repo view *), mcp__vercel__*, mcp__github__*, mcp__neon__*, mcp__stripe__*
disable-model-invocation: true
---

# /jairus:deploy

**Owns:** the release step, in two forms by mode (`rules/modes.md`): **DEV** — Gate P (initial), the first remote
action; **QA** — staging then production, Gates 7 and 8. **Does NOT own** merging (Gate 6 did), writing code, or the
release mechanics (the `deployer` and the starter's release path). The optional `[feature]` argument only focuses the
report: everything merged ships together.

Focus: **$ARGUMENTS**

## Step 0 — Preflight
Run rules/preflight.md (stage: deploy) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes. QA additionally needs
`project.foundation.scope == "release"`.

## Step 1 — Verify input contract
At least one card in **Review Passed** (QA also **Deploy**), merged into the base branch. Read `mode` from
`.jairus/jairus.json` and take the matching branch below. The base branch is clean and the build checks are green
([gates.md → Build checks](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#build-checks)).

## DEV — publish (Gate P, initial)
1. **Preconditions** ([gates.md → Gate P](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#gate-p--publish-procedure)): clean tree,
   `pnpm install --frozen-lockfile` and `pnpm gate:core` green, zone check clean, the secret scan finds nothing in the
   commits to push (`scripts/secret-scan.mjs`), no tracked `.env*` besides `.env.example`, `gh auth status` ok, and
   `gh repo view <owner>/<name>` fails (the name is free). Ask once for `<owner>` (default `gh api user --jq .login`;
   `<name>` is `project.name`).
2. Present **Gate P (initial)**: the repo to create (private), the commit count and last subjects (`git log --oneline`),
   what flips (mode → `qa`), and the preconditions as ✅/❌. Only an explicit approval counts; a decline leaves the local
   commits untouched.
3. On approval, per the Gate P procedure: `gh repo create <owner>/<name> --private --source . --remote origin`, then
   `git push -u origin main`; read the repo back. Write the `deploy` (DEV) row: `remote = {url, published_at}`,
   `mode = "qa"`; journal line. No card moves.
4. Offer `/jairus:board --import` (creates the GitHub Project from `.jairus/product-backlog.json`) and tell the human
   that the release foundation steps F8–F10 now remain for `/jairus:init` to resume.

## QA — staging and production
1. Move every Review Passed card to **Deploy** once ([transitions.md](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md)); cards
   already in Deploy stay.
2. **Phase `preview`:** verify the starter docs for this dispatch exist and dispatch the `deployer` (phase `preview`) with a
   CRAFT envelope ([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)): **Resources** = the
   `deployer` row of [delegation.md](${CLAUDE_PLUGIN_ROOT}/rules/delegation.md) (rules to apply, tools),
   **Starter knowledge** = its `deploy` files, the cards in scope and `project.vercel`. `blocked` with `the starter ships no
   deploy path` → stop and say so plainly: QA release is blocked until the starter provides one; nothing was changed.
3. Present **Gate 7 — staging** per the [gates.md registry](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#registry): every card in
   scope, the preview URLs (the `preview_alias`es), `main_sha`, build and database status. The human visits each URL.
   Failure or decline → fix and re-deploy within the caps; production untouched.
4. **Phase `production`** after Gate 7: present **Gate 8 — production** (every change listed, migrations marked
   irreversible, live Stripe names exist when a card has `gate5` ≠ `n/a`). On approval dispatch the `deployer` (phase
   `production`): SHA pin first (`main` moved → `blocked`), then the release path, then `READY` polled via the vercel MCP.
5. Move every listed card Deploy → **Done** and read it back; write the `deploy` (QA) row and a journal line; tick
   nothing in a checklist (there is none).

```
DEV : ✅ Published — <owner>/<name> · main pushed · mode is now QA
      Next: /jairus:board --import   ·   /jairus:init (release foundation F8–F10)
QA  : ✅ Released — <n> cards → Done · production READY · <urls>
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:deploy` |
| No card in Review Passed/Deploy | Stop: run `/jairus:ship` first |
| DEV: a Gate P precondition fails | The gate shows ❌ and cannot be approved; fix and rerun |
| DEV: `gh repo create` or the push fails | Report the error; the local state is unchanged — rerun to retry |
| QA: foundation scope is not `release` | Stop with the next incomplete release step (F8–F10) |
| QA: the starter ships no deploy path | `blocked`; nothing was changed; the register item is the starter's |
| QA: `main` moved since Gate 7 | `blocked`: rerun `/jairus:deploy` |
| QA: a production step fails at the cap | Escalate per [gates.md](${CLAUDE_PLUGIN_ROOT}/rules/gates.md); cards stay in Deploy |
