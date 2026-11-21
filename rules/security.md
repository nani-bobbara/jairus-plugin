# Security — the control plane's safety policy

What the plugin does and never does while it drives agents and tools. **How code must be secure is the
starter's**: its data-access and tenancy model, authentication, RBAC, audit, input validation and delivery
rules are in `README.md` (security and data sections), `CONTRIBUTING.md` and the README of each folder, tagged
`[lint]` `[type]` `[test]` `[review]`. The reviewer enforces the `[review]` ones (`rules/starter-contract.md`);
`pnpm gate:core` enforces the rest. Nothing of that is copied here.

## Secrets

- **Never print, log, paste or pass on a command line** a secret or a connection string. A secret reaches a
  file only through a shell pipe or redirect into the product's gitignored env files, never through Read, Write
  or Edit (the product's `.claude/settings.json` denies them on `**/.env*`).
- **Presence, never value.** Checks ask "is `NAME` set?" by exit code or by name; no value is read into output
  or into a result.
- **The human supplies what only the human can get** (vendor API keys, tokens); the plugin generates what it
  safely can (random secrets by a shell pipe). Neither enters the chat.
- **Never route a secret through an MCP tool result**: a tool that returns a connection string or key puts it in
  the transcript. MCP does the non-secret work (project, branch and repo ids, read-only checks).
- **`.env*` is never committed** (only `.env.example`). A secret-scan hook blocks `git commit` and `git push`
  when it finds key shapes: a safety net, not a guarantee. If a transcript is shared, rotate what Foundation
  provisioned.

## Databases

- Agents write **no SQL** through an MCP server; the database MCP is read-only verification (schema, policies).
- A product changes a database only through the starter's CLI (`TARGET_ENV=<env> pnpm db:setup`, and so on)
  against the dev branch, reading the gitignored env files. Its refusals are authoritative.
- **Production credentials and production database changes never reach an agent**: they run only through the
  starter's release path (`rules/gates.md` → Database changes).
- Any change to roles, connection strings, schema or policies requires `pnpm db:verify-rls` to exit 0.

## Publishing and delivery

- **Nothing leaves the machine before Gate P** (`rules/gates.md`): no repo creation, no push, no PR. Never
  force-push; never push to `main` except the single initial check-in; in QA changes reach `main` only through a
  PR with the required check green and Gate 6.
- **The core is read only** for every agent (`rules/starter-contract.md` → Zones); any diff under `packages/*`
  is a `[BLOCKER]`.
- **Gated writes only after approval:** Gate 4 (schema on the dev branch), Gate 5 (live payment objects), Gates
  7–8 (staging, production), Gate P. Every write is read back to verify it.
- **Hosting (QA):** projects are never Git-connected, so no push or merge can deploy; preview deployments keep
  deployment protection on because they serve whatever data their env points at; production deploys only through
  the starter's release path after Gate 8.
- Agents never approve a gate, move a card or write a control file (`rules/delegation.md`).

## Review severity

An unverified security finding is treated as HIGH until verified. A `[BLOCKER]` is defined in
`rules/quality-gate.md`; any of: a core edit, a secret in source, a data-access or privileged-path violation of the
starter's rules, a missing audit write, a failing build check.
