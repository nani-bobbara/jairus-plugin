# Parked: Phase 2 and Phase 3

These files are the drafts of the commands and agents that are **not part of the current build**. Claude Code
loads only `skills/` and `agents/`, so nothing here is callable. They stay in the repository, unedited, so each
phase starts from its draft instead of from nothing. The rules they rely on stay in `rules/`.

When a phase starts: move its skills to `skills/` and its agents to `agents/`, add the names to `SHIPPED_SKILLS` /
`SHIPPED_AGENTS` in `scripts/check-drift.mjs` and to `bin/lib/doctor.mjs`, verify them live, and update the README.

| Phase | Command | Purpose | Agent |
|---|---|---|---|
| 2 · Build | `extend` | scaffold the empty plugin a feature will live in | `extender` |
| 2 · Build | `design` | turn a card into PRD, DESIGN, ADR and a structured spec | `designer`, `reviewer` |
| 2 · Build | `develop` | implement one designed feature inside its plugin | `developer` |
| 2 · Build | `review` | score the diff against the quality gate and merge | `reviewer`, `developer` (fixes) |
| 3 · Release | `deploy` | publish (Gate P) and, in QA, staging and production | `deployer` |
Phase 1 (`doctor`, `init`, `board`, `ship`, `help`) is what ships and what gets verified first. `ship` is in the build in a minimal
form: it runs the `bootstrap` and `environment` cards and names the cards that need the Phase 2 commands. Its full
version (dispatching `extend`, `design`, `develop`, `review` and `deploy` for each card type) is drafted in
`phase-2-3/drafts/ship/SKILL.md`.

Cards the Phase 2 commands will run: `branding` (the product's identity applied to the starter's `branding/`, then reinstall and
the core gate), every feature and config card, and `upgrade-<ref>` (replace the core zones only, reinstall, run the core
gate and every plugin's tests, then review). `board --import` (graduating a DEV backlog to a GitHub Project) is parked with
the QA flow in Phase 3.
