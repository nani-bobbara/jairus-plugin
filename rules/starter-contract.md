# Starter contract — the interface the plugin relies on

The **starter carries all guidelines and the whole tech stack**: layers, conventions, security model, vendors,
UI, data, CI. The plugin is a control plane over it and **copies none of that**. This file lists only what the
plugin *reads from* or *calls on* the starter, so a change there is a one-line fix here. Everything else is
answered by the product's own docs, which win at runtime: `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, and
the README of every folder you touch (their *Where things go*, *Boundaries*, *Rules* and *How to extend*).

`node scripts/check-starter-refs.mjs` verifies the paths named here against a starter checkout.

## What the plugin reads

| Need | Where in the starter | Used by |
|---|---|---|
| Is it a starter, and which commit | root `package.json` `name` = `jairus-starter`; `starter.sha` in `jairus.json` | `copy-starter`, `init` |
| Runtime and package manager | root `package.json` `engines` and `packageManager`, `.nvmrc` | `init` (F4), `doctor` |
| Environment variables | `.env.example` (names, grouped by section and consumer) and the env matrix in `packages/config/README.md` | `init` (F5–F6) |
| What is still missing | the starter CLI refuses with exit 2 before touching anything and names the missing groups (`apps/cli/README.md`) | `init` (F6) |
| Where a change goes, zones, rules | `CONTRIBUTING.md` (the table and *Zones*), each folder README, rules tagged `[lint]` `[type]` `[test]` `[review]` | designer, developer, reviewer |
| Plugin authoring | `plugins/README.md`, `packages/plugin-kit/README.md` | designer, developer, extender |
| Product configuration | `branding/README.md` | designer, developer |

## What the plugin calls

```
pnpm install
pnpm gate:core                        # the build checks (rules/gates.md); gate:dev needs dev-tools/, absent in a product
pnpm dev
TARGET_ENV=<env> pnpm db:setup        # also db:migrate | db:provision | db:seed | db:verify-rls
pnpm auth:setup --yes · pnpm env:setup --yes
```

CI shipped by the starter: `ci.yml` (required check `validate`), `db.yml`, `security.yml`. It ships **no
deploy workflow**: QA release (`rules/gates.md` Gates 7–8, F10) is blocked until it does.

## What the plugin edits when it scaffolds or enables a plugin

`plugins/<id>/` (a new package), `branding/src/features.ts`, the plugin lists `apps/portal/src/server/plugins.ts`
and `apps/cli/src/plugins.ts`, the admin app's list (create `plugins.ts` beside its `composition.ts`: the
starter has none yet), and `"@product/plugin-<id>": "workspace:*"` in the three apps' `package.json`.
The contribution kinds of `definePlugin` are the Extension plan vocabulary (`bin/lib/feature.mjs`).

## Zones and the closed core

| Zone | Folders | Rule for every agent |
|---|---|---|
| Core | `packages/*`, `packages/infra/*` | **read only.** Never edited; extended only through configuration, ports, props, slots and plugin contributions |
| Product | `plugins/*`, `branding/`, `apps/*` (route files and wiring), `neon.ts` | editable |
| Developer helpers | `dev-tools/` | never copied, never used |

Until the registry and the product template are settled (starter register D-1, H-15) a copy still carries
`packages/*` in-tree, so the plugin enforces the rule: any diff under `packages/*` is a `[BLOCKER]`
(`rules/gates.md` → Build checks). A need the core cannot express is never worked around: it is an
**extension request**, recorded as a `starter-gap` card (`rules/pipeline.md`).

## How the starter's rules become review criteria

Every starter README tags each rule with how it is enforced. The reviewer treats the rules tagged
**`[review]`** (and any `[test]` the build does not run) in the READMEs of the folders a diff touches as its
checklist, in addition to the plugin's own checks (`rules/quality-gate.md`). `[lint]`, `[type]` and `[test]`
rules are enforced by `pnpm gate:core`.

## Known starter limits the plugin states instead of hiding

Portal and admin screens are skeletons; page and slot contributions do not exist; there is no `businessTable()`
helper (plugins write the standard table by hand); no deploy workflow; no machine-readable requirements
manifest (the plugin parses `.env.example`); no command that derives local connection strings from the Neon API
key; the registry decision and product-template root files are open.
