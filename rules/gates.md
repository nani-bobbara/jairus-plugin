# Gates — format, registry, fix-loop, approval

One gate scheme for the whole plugin. Commands present gates; agents never do (they signal a gate
through their structured return). Card moves and control-file writes on approval are in
`rules/transitions.md`. Mode differences: `rules/modes.md`.

- **Foundation gates**: `F1` (run by `init`); `F2`, `F10`, `F-VERIFY` (run by `ship`, the bootstrap card).
- **Feature gates** (numbered): `2` backlog · `3` design · `4` schema (conditional) · `5` live Stripe
  (conditional) · `6` review · `7` staging (QA) · `8` production (QA).
- **Gate P — publish**: the first remote action of a project and every push of a branch
  (`rules/modes.md`). Two variants: **P-initial** (no remote yet, raised by `deploy` in DEV) and
  **P-branch** (remote exists, raised by `develop` and `extend` in QA).
- Foundation gates are never renumbered into the feature sequence.

## Canonical gate format

Every gate uses this exact structure — no variation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE [ID] — [NAME]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode     : [dev | qa]
Stage    : [Stage Name]
Feature  : [feature-name or "all features"]
Agent    : [agent that produced this output]

OUTPUT CONTRACT — Exit Criteria
  ✅ / ❌  [criterion 1]
  ...

REVIEW SCORE (where applicable)
  [dimension table — from quality-gate.md]
  Overall: N/10 — PASS ≥ 8 | FAIL < 8

ARTIFACTS / CHANGES (what was produced)
  [files, migrations, commits, URLs, …]

BLOCKING ISSUES (any ❌ or BLOCKER finding)
  [list — each one prevents approval]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Exact yes/no question — Yes = approve and advance, No = decline]

✅ Approved → [next stage / action]
❌ Changes needed → [what to revise; which command to re-run]
❌ Stop → [what remains blocked]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- An ❌ in any exit criterion is a blocking issue — the gate cannot be approved.
- A BLOCKER finding caps the overall score at 7/10 — the gate cannot be approved.

## Approval rule

- Only an **explicit human message** ("approved", "yes", "✅") approves a gate.
- Implicit, inferred or default approval is never valid. A message from an agent is never approval.
- No card move, control-file write or remote action tied to a gate happens before that approval.

## Build checks

"Build checks" means, at the project root, all green:

1. `pnpm install --frozen-lockfile` (the first install after the copy is plain `pnpm install`, which
   rewrites the lockfile once `dev-tools/` is gone; that lockfile is committed)
2. `pnpm gate:core` — themes, type-check, lint (includes the boundary rules), package and app builds,
   unit tests with coverage ≥ 90% per package (`rules/starter-contract.md` → Commands).
3. **Zone check** — `git diff --stat <seed-commit>..HEAD -- packages/` is empty (the core is read
   only, `rules/starter-contract.md` → Zones). Any line is a `[BLOCKER]`.
4. When a plugin table, migration, role or grant changed: `TARGET_ENV=development pnpm db:setup`
   exits 0 with `verify-rls` green.
5. **Spec traceability** (a feature in develop or review) — `node ${CLAUDE_PLUGIN_ROOT}/bin/check-feature.mjs
   .jairus/features/<f>/spec.json --built --root .` passes: every AC has `implemented_at` and `test_at`, a
   `// AC-n` marker on or above the export, a test file that names the criterion, and every planned file exists.

This is the only definition of the build checks; other files link here. `pnpm gate` (with
`gate:dev`) is not run in a product: it needs `dev-tools/`.

## Database changes (Gate 4, Gates 7 and 8)

Agents never write SQL through the neon MCP; it is read-only verification (branches, schema,
`pg_tables.rowsecurity` / `forcerowsecurity`, `pg_policies`). A product changes a database only
through the starter's CLI, which reads the gitignored env files and refuses unsafe input:

| When | Command | Success |
|---|---|---|
| Gate 4 — plugin schema on the dev branch | `TARGET_ENV=development pnpm db:setup` | exit 0, `verify-rls` green |
| Gate 7 — staging data plane (QA) | `TARGET_ENV=preview pnpm db:setup` after the `preview` branch is reset from production | exit 0, `verify-rls` green |
| Gate 8 — production (QA) | `TARGET_ENV=production pnpm db:setup --production`, run only by the starter's release path | exit 0, `verify-rls` green |

Application-first migrations and the two-release rule: the `db-postgres` README and `apps/cli`
README. Production credentials never reach an agent: Gates 7–8 run only through the starter's
release path, which holds them in GitHub (`rules/starter-contract.md` → CI). Until that path exists
`deploy` is blocked (Gate F10 and Gates 7–8 are defined here as the contract it must meet).

## CI wait (Gate 6, QA)

After the branch is pushed (Gate P, branch), wait for the PR's required checks on the pushed head
SHA (github MCP check runs, or `gh pr checks <n> --required --watch`; the required check is
`validate`). Merge only on `success`. Failure or timeout → stop: no merge, the card stays in
**Review**. A PR behind `main` without a conflict: update the branch and wait again.

## Gate 8 SHA pin and no-Git re-verify (QA)

At Gate 7 the deployer returns `main_sha`. Before Gate 8 runs anything: `git fetch origin`; if
`origin/main` ≠ `main_sha` → `blocked` ("main moved since Gate 7 — re-run /jairus:deploy"). Before
Gate 7 and again before Gate 8 the deployer confirms via the vercel MCP that neither Vercel project
has a Git connection.

## Gate P — publish procedure

Preconditions, all checked **before** the gate is presented (any miss → the gate shows ❌ and cannot
be approved): working tree clean · `pnpm install --frozen-lockfile` and `pnpm gate:core` green · zone
check clean · the secret scan finds nothing in the commits to be pushed (`scripts/secret-scan.mjs`)
· no tracked `.env*` other than `.env.example` · `gh auth status` ok · `node ${CLAUDE_PLUGIN_ROOT}/bin/prelive.mjs .jairus/prelive.json check --before qa` clear (an open item is
cleared or acknowledged by the human first).

- **P-initial:** `gh repo view <owner>/<name>` must fail (the name is free). On approval:
  `gh repo create <owner>/<name> --private --source . --remote origin`, then `git push -u origin main`
  (the single initial check-in), record `remote` and set `mode = "qa"` (`rules/transitions.md`),
  then the GitHub Project is created from the DEV backlog (Phase 3).
- **P-branch:** shows the commits since the base, the diff summary, the branch and the PR title. On
  approval: `git push -u origin <branch>` and open the PR (github MCP; `gh pr create` only if the MCP
  is unavailable); read it back.
- Never force-push. Never push to `main` except P-initial. A declined or failed gate leaves the
  local commits untouched.

## Registry

| Gate | Raised by | Presents | Exit criteria (all must hold) | On approve | On decline |
|---|---|---|---|---|---|
| **F1** — intent + breakdown | `init` | project summary; fixed stack (Neon + hexagonal monorepo from jairus-starter; domains as plugins); mode; dependency-ordered feature tree | intent captured (`project_name`, `display_name`, `one_liner`, persona, `mode`) · `check-intent.mjs --final` passes: `depends_on` forms a DAG, every feature has a non-empty `description` and an `out_of_scope` entry, every `feature` names a valid plugin id · a monetized product has a `config` card for its plans | `init` finalizes `.jairus/INTENT.md` (`status: bootstrapped`) and seeds `.jairus/jairus.json`; → F2 | revise and re-present — up to 2 additional passes (Caps), then escalate. Stop: nothing written |
| **F2** — resource plan | `ship` | exactly what will be created, on which accounts, for the mode (`rules/foundation.md` → F2); starter source shown | every resource listed with its account · starter source shown · nothing billable created yet | `ship` runs F3–F9, recording each step | adjust and re-present. Stop: nothing provisioned |
| **F10** — first release (QA) | `ship` | both Vercel projects, build status, migration status | F3–F9 `done` · build checks green · a starter deploy path exists | `ship` runs it and polls each build `READY` | fix and re-present. Stop: resume from F10 |
| **F-VERIFY** — skeleton proof | `ship` | evidence per check, each ✅/❌ | DEV (scope `skeleton`): build checks green · backlog valid · empty env files in place with their pre-live items · no tracked secret. **Environment proof** (DEV, run by `board --env`, scope `release` needs QA): both apps start (`pnpm dev`); portal landing and `/sign-up` render and the auth route answers · the seeded admin (`ADMIN_EMAIL`) signs in to admin and admin sign-up returns 404 · a member account is refused by admin and a staff account by the portal · `pnpm db:verify-rls` exit 0 and RLS `ENABLE` + `FORCE` confirmed on the dev branch via read-only neon MCP · no tracked secret. QA adds: both deploys `READY`, neither Vercel project Git-connected, Preview protection on (scope `release`). Flows that need an emailed link are reported `blocked: validated last (starter register)`, never ✅ | `board` sets `foundation.status = "green"` and `scope`, and the `bootstrap` card → Done | fix the failing check and re-present. Stop: foundation stays `pending` |
| **2** — backlog write | `board` | the plan: feature cards with type, `depends_on`, stage Backlog; DEV: `.jairus/product-backlog.json` to be written; QA: GitHub Project, milestones, labels | plan previewed read-only · every INTENT feature mapped to a card · `depends_on` (DEV) / `blocked-by` labels (QA) on every dependent · nothing written yet | `board` writes `.jairus/product-backlog.json` (DEV) or dispatches the planner in create mode and verifies every object via github MCP (QA); cards start in **Backlog** | revise the INTENT feature list and re-run `/jairus:board`. Stop: backlog deferred |
| **3** — design handover | `design` | feature, score + trend, the four artifacts, the Extension plan (from `spec.json`), the plugin it names, open questions (must be empty) | PRD.md, DESIGN.md, ADR.md and `spec.json` present, no `{{placeholder}}` · `check-feature.mjs --final --intent` passes (ACs, plan rows on known contribution points, no core edit, entry-point guards and audits) · no unresolved open question · design review ≥ 8/10 · no BLOCKER · no `out_of_scope` item | `design` sets `spec.json` `status: "approved"`; card → **Design Approved** | up to 2 additional passes (Caps), then escalate. Stop: card stays in **Design** |
| **4** — schema (conditional: any plugin table, migration, role or grant) | `develop` (developer signals `gate4`) | the plugin's migration SQL and `_journal.json`, the class of each new table, the RLS policies, the manifest `tables` entries (grants), reversibility | SQL shown · every table is class `business` with `org_id` + RLS `ENABLE` + `FORCE` and the standard policies · declared in the manifest `tables` · no statement touches a core table or `neon_auth` · reversibility noted | the developer runs `TARGET_ENV=development pnpm db:setup` (Database changes, above) and reports `verify-rls` green; production waits for Gate 8 | developer revises and re-signals — up to 2 additional passes, then escalate. Stop: develop pauses at the schema step |
| **5** — live Stripe (conditional: payments + live mode; QA) | `develop` (developer signals `gate5`) | live products, prices, webhooks to create; test-mode status; irreversibility warning | live objects listed · tested in test mode first · irreversibility acknowledged | developer creates the live objects via stripe MCP; `develop` records `gate5: done` | stay in test mode; `gate5: deferred`. Stop: no live Stripe wiring |
| **6** — review | `review` | feature, branch, score + trend, files changed, findings resolved, remaining non-blocking findings, build check summary; QA adds the PR link | build checks pass (incl. the spec traceability check) · code review ≥ 8/10 · no BLOCKER · no hardcoded secrets · no `any` · zone check clean · every Extension plan row implemented | DEV: commit point 2, **local merge** to `main`. QA: commit point 2, Gate P (branch), CI wait, **merge**. Card → **Review Passed**; dependents unlock | up to 2 additional passes (Caps), then escalate. Stop: card stays in **Review** |
| **7** — staging (QA) | `deploy` (deployer phase `preview`) | every card in Review Passed or Deploy; preview URL per changed app (vercel MCP non-production deploy from merged `main`), `main_sha`, build status, migrations pending, Stripe test-mode status | build checks pass · `preview` branch reset from production and `TARGET_ENV=preview pnpm db:setup` green incl. `verify-rls` · RLS `ENABLE` + `FORCE` confirmed on `preview` via read-only neon MCP · Vercel preview `READY` per changed app · no ERROR lines in build logs · Preview deployment protection ON (preview serves production data) · no Git connection (re-verify) · `main_sha` recorded · human visited each preview URL | present Gate 8 | protection off or a Git connection → `blocked`, no gate. Otherwise investigate, re-deploy and re-present — up to 2 additional passes, then escalate. Stop: production untouched |
| **8** — production (QA) | `deploy` | every card listed at Gate 7, staging approval, migrations (irreversible), live Stripe objects if any | Gate 7 approved · every change listed · human reviewed staging · live Stripe env names exist in Vercel Production when any listed card has `gate5` ≠ `n/a` (names only, never values) | the starter's release path runs, in order: SHA pin + no-Git re-verify → production DB step → live Stripe objects (if approved) → app deploys; poll `READY` via MCP; `deploy` moves every listed card → **Done** | no production change; cards stay in **Deploy**. Stop: same |
| **P** — publish | `deploy` (P-initial, DEV) · `develop`, `extend` (P-branch, QA) | commits to push, diff summary, target repo and branch, what flips (P-initial: mode → qa) | Gate P preconditions (above) all ✅ | the push, repo creation and PR per the Gate P procedure | nothing pushed; local commits remain. Stop: nothing leaves the machine |

## Card moves

Only **Gates 3, 6 and 8** move cards — to **Design Approved**, **Review Passed** and **Done**.
Gates 4, 5, 7 and P are mid-stage, the F-gates are foundation, and Gate 2 creates the cards. Non-gate
moves (stage start/exit) are in `rules/transitions.md`.

## Fix-Loop Protocol (shared by `design` and `review`)

```
iteration = 1
LOOP:
  dispatch reviewer → score N/10 + findings
  if score ≥ 8 AND no BLOCKER → proceed to gate presentation
  else if iteration < 3:
    iteration += 1; dispatch producer (designer for design, developer for review) with the findings
    → LOOP
  else → ESCALATE (all findings grouped by iteration, recurring BLOCKERs marked; wait for the human)
```

The loop runs **autonomously** between iterations; the human sees only the gate (score ≥ 8) or the
escalation.

### Caps (the only place caps are defined)

| Cap | Value | Applies to |
|---|---|---|
| Reviewer fix-loop | **3 iterations**, then escalate | `design` (Gate 3), `review` (Gate 6) |
| Post-gate-decline allowance | **max 2 additional passes**, then escalate | after a human declines Gate F1, 3, 4 or 6 (each pass = producer fix + re-score or re-signal); build-check repair in `develop` and `extend` |
| Preview failure before Gate 7 | **max 2 additional passes**, then escalate | deployer phase `preview` fails before Gate 7 is presented |
| Production failure | **max 2 additional passes**, then escalate | after Gate 8, a release step ends without `success` or production is not `READY`; each pass = read the logs + re-run that step (never a direct production deploy command); cards stay in **Deploy** |

Escalation outcomes are fixed in `rules/quality-gate.md` → Escalation; a BLOCKER is never accepted
at a gate.
