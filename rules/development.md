# Development Rules

The process rules for the `developer` and `extender` agents: what to read, what may change, how work is
verified and committed. **Conventions are the starter's**: where code goes, naming, layering, imports, testing,
UI and the standard table are in `AGENTS.md`, `CONTRIBUTING.md` and each folder README (read the ones you touch
first, `rules/delegation.md` says which); `pnpm gate:core` enforces what is tagged `[lint]`, `[type]`, `[test]`.
Security policy: `${CLAUDE_PLUGIN_ROOT}/rules/security.md`.

## Prerequisites

Before writing any code:
1. The card is in/past **Design Approved** (read from the backlog) and unblocked
   (`rules/transitions.md` → Dependency unlock).
2. The plugin the spec names exists and is enabled (`/jairus:extend` scaffolds it; the developer never does).
3. Branch `feature/<feature-name>` exists and is checked out (`develop` creates it; the developer never creates
   or switches branches).

Never implement without an approved design. If the design is ambiguous, or a need falls outside the contribution
points, return an AMBIGUITY (`rules/pipeline.md`; `kind: extension-request` for the latter).

## The core is closed

`packages/*` and `packages/infra/*` are read only. The diff of a feature branch touches only:
`plugins/<id>/**`, `branding/**`, route files and composition wiring in `apps/portal` / `apps/admin`,
`apps/cli/src/plugins.ts`, `.jairus/features/<f>/spec.json` (AC coverage) and the `.env.example` names the plugin
declares. Anything under `packages/*` fails the zone check. Never bypass a lint rule with a disable comment and
never weaken a test.

## The order of work

Inside-out, building exactly the spec's `extension_plan`: the plugin's domain and use-cases (with tests), its
repos and manifest, the migration (Gate 4), then route files and UI, then payments (QA, Gate 5), then tests and
traceability. The starter's `plugins/README.md` says where each of those goes and what it may import.

## Tests and traceability

- Tests follow the starter's testing rules (coverage gate included). **Name each test after the criterion it
  proves** (`AC-3`), so `bin/check-feature.mjs --built` can verify it.
- Put `// AC-N` on or above the export that satisfies each criterion, and fill that criterion's `implemented_at`
  (`<file>:<line>`) and `test_at` in `.jairus/features/<f>/spec.json`.

```typescript
// AC-3: a member can only delete their organization's items
export async function deleteItem(id: string) { ... }
```

## Backend changes (Gate 4)

1. Inspect the current schema (database MCP, read-only).
2. Write the migration in `plugins/<id>/migrations/` (SQL plus `meta/_journal.json`) from the starter's standard
   business table; declare the table in the manifest `tables`. Never alter a core table, policy, trigger or
   function, and never touch the auth provider's schema.
3. 🚦 **Gate 4** — signal it before applying (`rules/gates.md`).
4. After approval: `TARGET_ENV=development pnpm db:setup` (env from the gitignored files, never a connection
   string on a command line). No SQL through an MCP server.
5. Verify: exit 0 with `verify-rls` green, and the read-only MCP shows RLS enabled and forced with the policies.

## Git workflow

- Branch `feature/<feature-name>` (the card name), created once by `develop` (Step 1) from the base branch.
  DEV (local `main`, no remote):

  ```
  git switch main
  git switch -c feature/<feature-name>
  ```

  QA (the stash wraps the pull, `rules/transitions.md` → Commit points, point 4):

  ```
  git stash push -- .jairus
  git fetch origin && git switch main && git pull --ff-only
  git stash pop        # only if the push created a stash
  git switch -c feature/<feature-name>
  ```

  An existing branch is checked out, not re-created. `extend` uses the same sequence with `extension/<plugin-id>`.
- Conventional commits: `feat(<feature>): …`. Commit locally, per layer, in both modes; the hooks still run.
- **Pushing is a gate.** The developer never pushes; `develop` presents Gate P (branch) in QA and opens the PR;
  `review` merges at Gate 6 (locally in DEV, after CI in QA).

## Build checks

Before returning `complete`, all build checks pass — defined only in `rules/gates.md` → Build checks (install,
`pnpm gate:core`, the zone check, spec traceability, and `db:setup` when a table changed).

## Merge checklist

- [ ] Build checks pass; `db:setup` green if a table changed
- [ ] No secrets, no `console.log`, no `any`
- [ ] Every Extension plan row implemented, nothing outside it
- [ ] `spec.json` AC coverage complete; `check-feature.mjs --built` passes
- [ ] Conventional commits throughout
