# INTENT.md Schema v3.0

`.jairus/INTENT.md` is the **write-once seed**: the confirmed idea and the first feature breakdown. It
is **created by `/jairus:init`** (the feature name `bootstrap` is reserved: `board` always adds that card first) from `templates/INTENT.md` during the F1 interview — the human never
hand-writes it from scratch. It carries **no progress**: stage status lives in the backlog
(`rules/state-model.md`) and the resume cursor in `.jairus/jairus.json`. Never add `design_approved`,
`code_review_passed`, a per-feature `status` or any other progress field.

The file starts with a `---` frontmatter block (the machine-read part, a YAML subset: maps, block
and flow lists, quoted or plain scalars, `#` comments) followed by prose sections for humans.

```yaml
schema_version: "3.0"
project_name: ""           # kebab-case, ≤ 32 chars
display_name: ""
one_liner: ""              # ≤ 120 chars
status: draft              # draft | bootstrapped — seed lifecycle only
mode: dev                  # dev | qa — the workflow mode (rules/modes.md)
backend: neon              # fixed
features:
  - name: ""               # kebab-case card id; branch and docs folder name
    display_name: ""
    description: ""        # 1–2 sentences — required before /jairus:design
    out_of_scope: []       # ≥ 1 explicit exclusion — required before /jairus:design
    type: feature          # feature | config
    plugin: ""             # plugin id for type feature (the business domain); omitted for config
    plan: all              # free | basic | pro | all
    depends_on: []
```

## Cards, plugins and the starter

- A **`feature`** is a slice of a business domain and lives in the plugin named by `plugin`
  (`plugins/<plugin>/`, `@product/plugin-<plugin>`). Several features may share one plugin; the
  plugin is scaffolded once by `extend`. The id is kebab-case and may not be a core namespace
  (`app core org auth audit billing email features jobs members user admin portal plugin`).
- A **`config`** card changes only product values in `branding/` (brand, plans and prices, staff
  roles, policies): it has no plugin.
- There are no `bootstrap-app`, `auth` or `billing` features: the starter already provides the apps,
  authentication, organizations, billing flows and the admin console (`rules/starter-contract.md`).
  A monetized product adds a `config` card (for example `plans`) for its plan catalog.

## `status` — the only enum

| Value | Meaning | Set by |
|---|---|---|
| `draft` | working copy during the interview, before Gate F1 | `init` |
| `bootstrapped` | Gate F1 approved; the seed is final | `init`, once |

After the backlog is created `INTENT.md` is **archival**: it keeps `status: bootstrapped` forever and
is read only for the seed (feature list, scope contract, `depends_on` graph).

## Field rules

- `description` and `out_of_scope` empty or missing = `/jairus:design` blocked (no scope anchor means
  non-deterministic output). `depends_on` must name existing features and form a DAG; the unlock rule
  is in `rules/transitions.md`.
- `plan` is the plan tier that entitles the feature; gating in code uses `entitled()` / `limitOf()`,
  never plan names.
- `mode` is the choice made at init; once `.jairus/jairus.json` exists it is the authority
  (`rules/modes.md`).
- **Plugins are not stored here** beyond each feature's `plugin` id: scaffolded plugins are recorded in
  `.jairus/jairus.json → project.plugins` by `extend`.

## Checks

`node ${CLAUDE_PLUGIN_ROOT}/bin/check-intent.mjs .jairus/INTENT.md` checks the structure of a draft;
with `--final` it checks the Gate F1 exit criteria (`rules/gates.md`): every field valid, every
feature has a `description` and an `out_of_scope` entry, `depends_on` is a DAG, plugin ids are valid.
Consumers: `board` requires `status: bootstrapped`; `design` reads the scope contract; `ship` and
`board` read the `depends_on` graph.
