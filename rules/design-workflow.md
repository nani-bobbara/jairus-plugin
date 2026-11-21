# Design Workflow Rules

What the `designer` must produce before any code is written. Gate definitions:
`${CLAUDE_PLUGIN_ROOT}/rules/gates.md`. Scoring: `${CLAUDE_PLUGIN_ROOT}/rules/quality-gate.md`. Stage
contract: `${CLAUDE_PLUGIN_ROOT}/rules/pipeline.md` → Stage 2.

## Core principle

**No code is written before Gate 3 (design handover) is approved.** Design-first surfaces security,
feasibility and scope problems before anyone builds against a flawed model. The design also decides
**where the feature lives in the starter**: a feature is a plugin; the core is closed
(`rules/starter-contract.md` → Zones).

**The starter owns the how.** Code conventions, naming rules, the standard RLS table, UI components and
tokens are documented by the starter's own READMEs (`plugins/README.md`, `packages/plugin-kit/README.md`,
`branding/README.md`, each folder's README) and enforced by `definePlugin`, `composePlugins`,
`db:setup`/`verify-rls` and `pnpm gate:core`. The design points at them (`read`) and never copies them;
it records only the per-feature decisions the starter cannot know.

## The four artifacts

All four live in `.jairus/features/<feature-name>/`, complete before design review can pass — no
placeholders, `TODO`/`TBD` or empty sections. Templates: `${CLAUDE_PLUGIN_ROOT}/templates/feature/`.

| Artifact | Format | Holds |
|---|---|---|
| `PRD.md` | Markdown | the problem, the user stories (each naming the AC ids it serves), success metrics, dependencies, out of scope (mirrors INTENT.md), open questions |
| `DESIGN.md` | Markdown | the narrative: user flows, component hierarchy and data flow, state, error handling, accessibility, performance, security reasoning (which plane, what is audited, why). It does not restate the Extension plan, entry points or ACs |
| `ADR.md` | Markdown | one entry per significant decision: context, decision, ≥ 2 alternatives, consequences. No novel decision → one entry saying so. Every new package needs one |
| `spec.json` | JSON | the structured facts, below; checked by `bin/check-feature.mjs` |

### `spec.json` — the single owner of the structured facts

Schema and an example: `templates/feature/spec.json`; rules: `bin/lib/feature.mjs`. It holds:

- **`acceptance_criteria`** — `AC-1…` with testable text (Given/When/Then preferred). The designer writes
  the text; after develop the developer fills `implemented_at` (`<file>:<line>` of the export, with a
  `// AC-n` marker on or above it) and `test_at` (a test file that names the criterion). PRD.md refers to
  ids and does not restate the text.
- **`extension_plan`** — `plugin` (new → scaffolded by `extend` before `develop`; existing), `rows`
  (`change` · `point` · `files` · `read`) and `requests`. `point` is a contribution kind of
  `@jairus/plugin-kit` (`permissions nav tables migrations emails jobs on env audit orgActions roles
  repos features`) or `code` (domain and use-case code), `branding`, `route` (route files), `cli`;
  mechanics and files per point: the starter's `plugins/README.md` and `packages/plugin-kit/README.md`. `read` names the starter README
  consulted. A need no point can meet is an **extension request** (`rules/pipeline.md`): listed in
  `requests`, becomes a `starter-gap` card, never worked around. A config card (no plugin) uses only
  `branding`. No file under `packages/*`.
- **`entry_points`** — each server action, route handler or read: `name`, `kind`, `path`, `guard` (org
  guard + action, user guard, permission, staff, public or webhook signature) and, for a mutation, the
  `audit` action written in the same transaction. These are the security decisions design review blocks on.

`check-feature.mjs` validates the facts the starter cannot (the plan, the closed core, entry-point
guards and audits, agreement with the INTENT card, and — after develop — AC traceability). Everything
else is validated by the starter when the code exists.

## Data design

Inspect the live backend (neon MCP, read-only) before designing a table. A feature's data lives in
side tables owned by its plugin, keyed by `org_id`, declared under the `tables` and `migrations` points
(`plugins/README.md` has the standard business table and its policies). Name the tables and the
mutations to audit in the `spec.json` plan rows and explain the model in `DESIGN.md`; the SQL is
written at develop from the starter's recipe, not copied into the design. Policy:
`rules/security.md` → Data access.

## Design system rules

Visual source of truth: the palette and tokens `@jairus/ui` provides, selected in `@product/branding`
(the starter's `packages/ui/README.md` and `branding/README.md`). `DESIGN.md` references **token names**, never raw values. **Prohibited:** raw
hex/rgb, arbitrary Tailwind values, colours outside the tokens, hardcoded brand strings.
**Required:** token classes, `@jairus/ui` components (a missing primitive is an extension request),
WCAG AA contrast (4.5:1 normal, 3:1 large), mobile-native layouts.

## Open questions

**Any unresolved open question blocks Gate 3.** Format:

```
> ❓ OPEN QUESTION: [question]
> Options: A) [option] B) [option]
> Recommend: [option + reason]
```

The designer returns them to the command, which presents them to the human before scheduling the
design review. Open questions fail Completeness.

## Stage 2 exit criteria (summary)

1. PRD.md, DESIGN.md, ADR.md and spec.json present; `check-feature.mjs --final` passes (with
   `--intent` for the card)
2. All open questions resolved; every starter gap recorded in `extension_plan.requests`
3. Any table designed after inspecting the live backend
4. Design review ≥ 8/10, no BLOCKER, within the fix-loop cap (`rules/gates.md`)
5. 🚦 Gate 3 approved by the human; the `design` command then sets `status: "approved"` in `spec.json`
   (its only artifact edit)
