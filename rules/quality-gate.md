# Quality Gate — scoring and pass/fail rules

The reference for every scored review: design review (before Gate 3) and code review (before Gate
6). Gate format, fix-loop and caps: `${CLAUDE_PLUGIN_ROOT}/rules/gates.md`. Security policy behind
the security dimensions: `${CLAUDE_PLUGIN_ROOT}/rules/security.md`.

## How the gate works

1. The `reviewer` scores the producer's output **/10** across the stage's dimensions and returns a
   **score table** plus a **findings list** (format below).
2. **Pass (≥ 8/10, no BLOCKER):** the command presents the gate; on explicit human approval it moves
   the card (`rules/transitions.md`). Never a flag in `INTENT.md`.
3. **Fail:** findings go to the producer (designer or developer) → fix → re-score, within the cap in
   `rules/gates.md`.

## Pass threshold

**≥ 8/10** for design and code review. **Hard blocker rule:** any `[BLOCKER]` caps the overall score
at **7/10** — always a fail. A `[BLOCKER]` is a finding that, shipped as-is, would cause:

- **Core edited** — any diff under `packages/*` (the zone check), or a plugin importing outside its
  allow-list, a vendor SDK, another plugin or a `@product/*` package
- **Data exposure** — a query outside `withOrg`/`withUser`, a plugin table without `org_id` + RLS
  `ENABLE` + `FORCE` + the standard policies, a table missing from the manifest `tables`,
  `pnpm db:verify-rls` failing, an unguarded admin/system path, a secret exposed to the client
- **Security vulnerability** — SQL built from user input, missing Stripe signature verification, a
  hardcoded secret
- **Missing audit** — a mutation without its in-transaction audit write; a staff read of a specific
  org/user without its audit
- **Broken build** — any build check failing (`rules/gates.md` → Build checks), including the
  boundary lint and the coverage gate
- **Broken core functionality** — an AC from the PRD not implemented
- **Regulatory/legal risk** — PII logged or stored insecurely

## Fix-loop and escalation

Runs autonomously; protocol and cap: `rules/gates.md`. Every iteration is logged (score trend, what
changed, what remains). The reviewer scores the current state fresh; the command tracks the count.

```
⛔ ESCALATION — [feature] · [review type]
Score after the final iteration: [N/10]
Still blocking:
  [findings present in every iteration — highest priority]
  [findings present in most iterations]
  [findings present once]
Options:
  A) Give specific direction → the command re-runs the fix-loop with it
  B) Change the scope → the human edits the scope contract intentionally and moves the card back
     to Design themselves; commands never move cards backward
```

These are the only outcomes. A BLOCKER is never accepted at a gate. To drop the feature, the human
moves the card back to **Backlog**; commands and agents never invent that move.

## Reviewer behaviour

- Always read-only — never writes, edits or fixes code or artifacts. It returns its score, findings and
  evidence; the commands act on them.
- Scores what exists, not what was intended. Every finding carries an actionable fix.
- Checks live state when relevant: `pnpm db:verify-rls`, `pg_tables` / `pg_policies` via the neon MCP.

## Score table format

```
## Review Result — [feature] · [design|code] · Iteration [N]

| Dimension | Score | Finding |
|-----------|-------|---------|
| [Dimension 1] | N/10 | One-line summary or "No issues" |

**Overall: N/10** [PASS | FAIL]
[BLOCKER present: yes/no — if yes, which finding and why]

### Findings
**[BLOCKER|HIGH|MEDIUM|LOW]** `file/path:line` — [description]
Fix: [specific, actionable instruction]
```

## Design review dimensions (7)

Applied to `.jairus/features/<feature-name>/`. Score each dimension by the share of binary checks (the plugin's below plus the starter's `[review]` rules for the
folders the design touches) that
pass, scaled to 0–10. **A failed [BLOCKER] check caps that dimension at 0 and the overall at 7.**

### 1 · Completeness
- [ ] All four artifacts exist: PRD.md, DESIGN.md, ADR.md, spec.json; `bin/check-feature.mjs --final` passes
- [ ] No `<!-- NOTE:` placeholders or `{{…}}` left, no empty sections
- [ ] [BLOCKER] PRD has at least one user story and one numbered acceptance criterion

### 2 · Feasibility
- [ ] Every decision fits the starter (`rules/starter-contract.md`): Next.js App Router, strict TypeScript, `@jairus/ui`, Neon, Stripe
- [ ] Logic is placed per layer inside the named plugin (domain → application → repos); nothing needs a core edit
- [ ] No new package without an ADR entry; the data model in DESIGN.md agrees with the INTENT data model
- [ ] [BLOCKER] A dependency on a service or tool outside the stack without an approved ADR entry

### 3 · Security & access control
- [ ] Every entry point in spec.json states its guard (org guard + action / user guard / permission / staff / public / webhook signature), and every server action its audit action
- [ ] Every table the plan names (`tables` / `migrations` rows) is a plugin side table keyed by `org_id`, designed to the starter's standard business table (RLS enabled and forced, declared in the manifest `tables`) and accessed via `withOrg`
- [ ] Every mutation names its in-transaction audit write (`<id>.<entity>_<verb>`); staff reads of one org/user are audited
- [ ] Capability limits gate on the effective plan with `entitled()` / `limitOf()`; no plan names
- [ ] Stripe webhook specifies signature verification + idempotency (billing features); no secret in any artifact beyond env var names
- [ ] [BLOCKER] A table outside the plugin rules, data access outside the scoped ports, or an unguarded privileged path

### 4 · Testability
- [ ] Every AC-N has at least one given/when/then scenario; every entry point has happy, no-session, forbidden and invalid-input scenarios; every interactive component has an interaction scenario
- [ ] [BLOCKER] Any AC without a test scenario

### 5 · Scope fit
- [ ] Every user story maps to the feature `description`; every must-have has a story; nothing belongs to another feature
- [ ] [BLOCKER] Any `out_of_scope` item present in the artifacts

### 6 · Design system
- [ ] Every colour DESIGN.md names is a token; components come from `@jairus/ui` where one exists; no arbitrary Tailwind values
- [ ] WCAG AA pairings (or a noted exception); loading, empty and error states for every interactive component
- [ ] [BLOCKER] The theme/palette configuration the components depend on is missing

### 7 · Conformance
- [ ] Artifacts follow `${CLAUDE_PLUGIN_ROOT}/templates/feature/`, with no template sections removed, at `.jairus/features/<feature-name>/`; ADR documents at least one real decision; open questions answered or deferred with a reason
- [ ] [BLOCKER] **Extension plan:** spec.json `extension_plan` names the plugin id, has rows for every change in PRD.md and DESIGN.md, each with a contribution `point`, its files and the starter README read (points and files: the starter's `plugins/README.md`); no row is a core edit; every gap is a `requests` entry

## Code review dimensions (5)

Applied to the feature branch diff against the base branch. Same scoring and BLOCKER cap.

**The checks below are the plugin's floor, not the whole standard.** The starter owns its guidelines: every rule
tagged `[review]` in the README of a folder the diff touches is also a check, in the dimension it belongs to
(`rules/starter-contract.md` → How the starter's rules become review criteria); a violated one is HIGH, or a
`[BLOCKER]` when it falls under the BLOCKER definition above.

### 1 · Correctness
- [ ] Every AC-N is implemented and marked `// AC-N`; `bin/check-feature.mjs --built --root .` passes (each AC has `implemented_at` and `test_at`, the marker is on or above the export, the test names the criterion)
- [ ] Error paths return the safe shape; no silently swallowed errors
- [ ] [BLOCKER] An AC with no implementation and no `// AC-N`

### 2 · Security
An **UNVERIFIED** security finding (the reviewer could not confirm either way) is treated as **HIGH**
until verified; same for design review dimension 3.

- [ ] Every server action and route (except the auth route and verified webhooks) calls a guard first; input validated with zod before any data access
- [ ] Layer 1: business data only via `withOrg`, identity via `withUser`; Layer 2: every touched table has RLS `ENABLE` + `FORCE`; `db:verify-rls` exits 0 for any schema change
- [ ] Admin/system ports only behind permission guards and never in the portal; mutations write their audit entry in the same transaction
- [ ] Capability checks use the effective plan; `subscription` never hand-edited; Stripe webhook verifies and is idempotent
- [ ] No secrets in source: `grep -rn "sk_live_\|sk_test_\|whsec_" apps plugins branding` returns nothing
- [ ] [BLOCKER] Any unguarded action/route, any privileged path without a permission guard, data access outside the scoped ports, a plugin table without live RLS + FORCE, `db:verify-rls` failing, or a mutation without its audit write

### 3 · Design conformance
- [ ] Every ADR decision is reflected; entry points match spec.json (path, kind, guard, audit); the implementation follows the flows and component hierarchy of DESIGN.md
- [ ] Tokens only — `grep -rn "#[0-9a-fA-F]\{3,6\}" apps plugins` finds nothing relevant (a hardcoded colour is a quality finding, not a BLOCKER)
- [ ] [BLOCKER] An entry point deviating from its approved spec.json guard or audit
- [ ] [BLOCKER] **Extension plan:** the diff touches a contribution point not in spec.json `extension_plan`, omits a listed one or one of its files (a table missing from the manifest `tables`, a plugin missing from a plugin list, a permission with no role seed, an env var missing from `.env.example`), or changes anything under `packages/*`; the starter's own checks (`definePlugin`, `db:setup`/`verify-rls`, `pnpm gate:core`) decide whether the code meets its conventions

### 4 · Test coverage
- [ ] Every use-case and domain function has a unit test (fake ports); every action/route has happy + no-session + forbidden + invalid-input tests; every interactive component has a component test
- [ ] Every AC-N has a test that explicitly covers it; `pnpm gate:core` passes with coverage ≥ 90% on every package the diff touches
- [ ] [BLOCKER] Any AC-N with no test

### 5 · Standards
- [ ] Build checks pass (`rules/gates.md` → Build checks): type-check (no `any`, `as any`, `@ts-ignore`), lint incl. boundaries, builds, tests, zone check
- [ ] Public entry points only; no vendor SDK outside a provider; no `console.log` in production code
- [ ] Conventional commits `feat(<feature>): …`; JSDoc on every exported function
- [ ] [BLOCKER] Any build check failing, including the boundary lint, the coverage gate and the zone check
