# jairus rebuild — design record: DEV/QA modes, local backlog, publish gate, plugin-based domains

> **Status:** accepted direction, delivered in phases (see `docs/ARCHITECTURE.md` for the current
> architecture and phase status). This file records *why*; the rules in `rules/` are the
> contracts and win on any difference.

## 1. Why a rewrite: the plugin targeted a starter that no longer exists

The 5.0 plugin was verified against an older starter. The starter has since been rebuilt:

| Topic | Plugin 5.0 assumed | Starter now |
|---|---|---|
| Packages | `@app/*` | closed `@jairus/*` core (`packages/*`, `packages/infra/*`), never edited by a product |
| Where a feature goes | `packages/application`, `packages/adapters`, `apps/*/app/(app)` | a plugin: `plugins/<id>` = `@product/plugin-<id>`, built with `definePlugin` |
| Product values | `packages/config` | `branding/` = `@product/branding` |
| Auth | Better Auth in adapters | Neon Managed Better Auth behind ports, `@jairus/guards`, mandatory `proxy.ts` |
| Database setup | `db-setup.yml`, `db-migrations.yml` workflows | `apps/cli`: `db:setup`, `auth:setup`, `env:setup` with `TARGET_ENV` |
| CI | `ci-validate`, `cd-*`, `db-setup` | `ci.yml`, `db.yml`, `security.yml`; **no deploy workflows** |
| Gate | `pnpm -r type-check/lint`, `turbo build` | `pnpm gate:core`, coverage ≥ 90% per package |

The starter is itself unfinished (portal/admin are skeletons, no page/slot contributions, no
`businessTable()` helper, registry decision D-1 and product-template root files H-15 open). The plugin
states these limits (`rules/starter-contract.md`) instead of hiding them.

## 2. Decisions

| # | Decision | Where it lives |
|---|---|---|
| 1 | Ten commands stay ten. Existing-repo adoption is removed; `init` works only in an empty workspace. | `commands/init.md`, `rules/pipeline.md` |
| 2 | Two modes: **dev** (local starter copy, local git, `.jairus/product-backlog.json`, Neon `dev` only) and **qa** (GitHub template, Project board, PR + CI, Vercel, Stripe). DEV graduates to QA once, at Gate P (initial). | `rules/modes.md` |
| 3 | `init` creates `.jairus/INTENT.md` through an interview (never hand-written), then the project **in place** from the starter. | `rules/foundation.md`, `rules/intent-schema.md`, `bin/copy-starter.mjs` |
| 4 | The intent holds only `feature` (lives in a named plugin) and `config` (branding only) cards; no bootstrap/auth/billing features. | `rules/intent-schema.md` |
| 5 | The backlog is `.jairus/product-backlog.json` in DEV and the GitHub Project in QA, with identical stages and moves. | `rules/state-model.md`, `rules/transitions.md`, `bin/make-backlog.mjs` |
| 6 | **Gate P — publish:** the first remote action and every branch push need explicit approval; local commits are free. | `rules/gates.md` |
| 7 | **The core is closed.** A feature is a plugin; a need the core cannot express is an `extension-request` (a `starter-gap` card), never a workaround; review fails any diff under `packages/*`. | `rules/starter-contract.md`, `rules/development.md`, `rules/quality-gate.md` |
| 8 | DEV is never fully offline: Managed Better Auth exists only on Neon. | `rules/modes.md` |
| 9 | QA release (Gates 7–8, F10) is blocked until the starter ships a deploy path. | `rules/gates.md` |

## 3. Open points carried forward

- `extend <plugin-id>` becomes the plugin scaffolder (Phase 2); it replaces the old ai/email/flags
  installer, whose extension points no longer exist in the product zone.
- Upgrading a product to a new `@jairus/*` version is not a command in the rebuild (the ten-command
  architecture stays); it needs the registry decision (D-1) first.
- PR granularity in QA: one PR per feature (the default used by the rules).
