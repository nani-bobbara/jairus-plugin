---
name: extend
description: "Scaffold one plugin on the starter so a feature has a home: dispatches the extender to create plugins/<id>/ (manifest, registry, index, empty layers, one test), enable it in branding and wire it into the portal, admin and CLI plugin lists, then verifies the build and commits the scaffold on extension/<id>. No domain logic. Run /jairus:extend <plugin-id>; develop asks for it when a feature's plugin is missing."
argument-hint: "<plugin-id>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git add *), Bash(git commit *), Bash(git switch *), Bash(git checkout *), Bash(git branch *), Bash(git merge *), Bash(git rev-parse *), Bash(git show *), Bash(git init *), Bash(git fetch *), Bash(git push *), Bash(pnpm *), Bash(node *), mcp__github__*
---

# /jairus:extend

**Owns:** scaffolding one plugin and recording it in `project.plugins`: input checks, the `extension/<id>`
branch, the `extender` dispatch, verification and the scaffold commit. **Does NOT own** the scaffold's
contents (the `extender` and the starter's `plugins/README.md`), any feature design or code, or merging.

Plugin id: **$ARGUMENTS**

## Step 0 — Preflight
Run rules/preflight.md (stage: extend) — stop on any failure.
Path: ${CLAUDE_PLUGIN_ROOT}/rules/preflight.md · parts per its Stage applicability table.
No dispatch, card move or control-file write before preflight passes.

## Step 1 — Verify input contract
Check [pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md) → Stage 6 input contract:
1. `$ARGUMENTS` is a kebab-case id and not a core namespace (`rules/intent-schema.md`).
2. Not already in `.jairus/jairus.json → project.plugins` and no `plugins/$ARGUMENTS/` folder. Present → say
   so and stop (scaffolding is not repeated; the feature builds inside the existing plugin).
3. The id is named by at least one card in the backlog, or the human confirms they want it now.

## Step 2 — Branch, then dispatch `extender`
1. Create `extension/$ARGUMENTS` from the base branch with the sequence in
   [development.md → Git workflow](${CLAUDE_PLUGIN_ROOT}/rules/development.md#git-workflow) (stash rule in QA).
2. Verify the starter docs for this dispatch exist and dispatch the `extender` (mode `add`) with a CRAFT
   envelope ([pipeline.md](${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md#craft-dispatch-envelope)):
   Resources = the `extender` row of [delegation.md](${CLAUDE_PLUGIN_ROOT}/rules/delegation.md) (rules to apply, tools), `Starter knowledge:` = its `extend` files, plus the plugin id and the label (the card's display name).
3. By `status`: `needs_confirmation` → show its ambiguity, re-dispatch only with the human's answer; an
   `extension-request` becomes a `starter-gap` card by the Unplanned Work Protocol; `failed` → repair
   (Step 3.3); `blocked` → show `blockers`; `complete` → Step 3.

## Step 3 — Verify
1. Run the [build checks](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#build-checks) — they must agree with the
   returned `checks`.
2. Verify the diff touches only `plugins/$ARGUMENTS/`, `branding/src/features.ts`, the three plugin lists and the
   three `package.json` files (the zone check plus this list) and contains no domain logic or migration.
3. Failure → re-dispatch the `extender` in mode `fix` with the failing output, within the
   [caps](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#caps-the-only-place-caps-are-defined), then escalate. Nothing is
   recorded while checks fail.

## Gate
No gate of its own. QA: pushing `extension/$ARGUMENTS` and opening its PR is **Gate P (branch)**
([gates.md](${CLAUDE_PLUGIN_ROOT}/rules/gates.md#gate-p--publish-procedure)).

## Handover
1. Commit the scaffold and `.jairus/` on `extension/$ARGUMENTS` (`feat(ext): scaffold plugin $ARGUMENTS`),
   per [commit point 6](${CLAUDE_PLUGIN_ROOT}/rules/transitions.md#commit-points--working-tree).
2. Write the `extend` row of the write table (append `{id, scaffolded_at}` to `project.plugins`) and a journal line.
3. DEV: the branch stays local; the human merges it with `git` (or run `/jairus:ship`, which continues from it
   once merged). QA: present Gate P (branch), push, open the PR (`bin/render-feature.mjs` is not used here), read it back.
   Merging is the human's decision outside the pipeline.

```
✅ Plugin scaffolded: $ARGUMENTS · extension/$ARGUMENTS · build checks green · merge it, then
Next: /jairus:design <feature>  (a feature that lives in this plugin)
```

## On error
| Error | Recovery |
|---|---|
| Preflight fails | Follow its message; rerun `/jairus:extend $ARGUMENTS` |
| Invalid or reserved id, or already scaffolded | Stop; show the rule |
| Extender `failed` / `needs_confirmation` | Show `blockers` / the ambiguity; nothing recorded; rerun after resolving |
| Checks still fail at the cap | Escalate with output; `project.plugins` unchanged; nothing committed |
| Push or PR creation fails (QA) | Report the error; the commit is local on the branch — rerun to retry |
