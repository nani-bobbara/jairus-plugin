# State Model — the control plane

Where pipeline state lives. Every command and agent follows it. The resume + version check that
reads this state is `${CLAUDE_PLUGIN_ROOT}/rules/preflight.md` part C.

## The `.jairus/` folder of a product

`init` creates `.jairus/` in the product repo and **all jairus metadata lives there, isolated from
the starter's files**. It is versioned (so work follows you across machines and sessions), inert to
the build, and deleting it strips every trace of the process: the product still builds and runs.

```
<product>/
├─ .jairus/
│  ├─ INTENT.md              the seed: idea, persona, first feature breakdown (rules/intent-schema.md)
│  ├─ jairus.json            the anchor: version, mode, starter pin and zones, foundation, plugins, and `workflow` (the current step and next action that /jairus:help reads)
│  ├─ product-backlog.json   the DEV backlog (QA: the GitHub Project instead)
│  ├─ features/<f>/          PRD, DESIGN, ADR and spec.json of each feature (rules/design-workflow.md)
│  ├─ prelive.json           what a human still must supply or decide before something live (names, never values)
│  └─ journal.md             append-only session log: the handoff between sessions
├─ .mcp.json, .claude/settings.json     where Claude Code requires them (project root)
└─ the starter's files, plugins/<id>/, branding/ …     the product itself
```

The plugin's own files (commands, rules, templates, `bin/`) stay in the plugin cache and are read
through `${CLAUDE_PLUGIN_ROOT}`; they are never copied into the product. Paths in the rules are
relative to the product root.

## The control chain

```
intent ─▶ .jairus/INTENT.md ─▶ .jairus/jairus.json ─▶ backlog ─▶ .jairus/features/<f>/ ─▶ plugins/<id>/ (+ branding, route files)
 (init)    the seed             the cursor              the status   the design             the product's code, built on the starter
```

The product itself is the copied `jairus-starter` (`rules/starter-contract.md`): the core is read
only, a feature is a plugin, values go in `branding/`.

## The state layers (own different things — never duplicate)

| Layer | Owns | Lifecycle | Authoritative for |
|---|---|---|---|
| **`.jairus/INTENT.md`** | the **seed** | created by `init` (draft) → final at Gate F1 → archival | the original intent only |
| **Backlog** (`.jairus/product-backlog.json` in DEV, GitHub Project in QA — `rules/modes.md`) | the **living backlog**: every card and its stage | the whole project lifetime | **feature + stage status (the source of truth)** |
| **`.jairus/jairus.json`** | the plugin's **control footprint**: version, mode, starter pin, remote, foundation steps, backlog pointer, plugins list, `workflow` (the current step and the single next action: the session anchor that `/jairus:help` reads), resume cursor, cached snapshot | seeded at Gate F1, updated by commands per `rules/transitions.md` | where the project is and what is next (reconciled against the backlog, which stays authoritative for every card's stage) |
| **`.jairus/prelive.json`** | the **pre-live list**: env variables by name, accounts and decisions the human deferred (`bin/prelive.mjs`) | created at the first deferral; cleared before the point each item names | nothing: a checklist that gates `develop` (`develop`), the first QA step (`qa`) and release (`deploy`) |
| **`.jairus/journal.md`** | the **session log**: what each command did, each gate decision, the next action | created at Gate F1, appended by commands | nothing: a human- and agent-readable handoff, never read as state |

**Consequences**
- No progress flag (`design_approved`, `code_review_passed`, a per-feature `status`) in `INTENT.md`.
- The built app never depends on anything in `.jairus/`.
- Only commands write `.jairus/jairus.json`, `.jairus/product-backlog.json`, `.jairus/prelive.json` and `.jairus/journal.md`
  and move cards; agents return structured results (the designer writes only its own
  `.jairus/features/<f>/` artifacts).
- `.jairus/` is committed only at the commit points in `rules/transitions.md`.
- Stage status is read from the backlog (file, or github MCP in QA), never from `INTENT.md` or the journal.

## Canonical stages (board columns)

The single list; use these names exactly:

```
Backlog → Design → Design Approved → Develop → Review → Review Passed → Deploy → Done
```

- Gate stages: **Design Approved** (Gate 3), **Review Passed** (Gate 6), **Done** (Gate 8). Every
  other move is stage progress; the move table is in `rules/transitions.md`.
- Preconditions (`develop` needs Design Approved, `deploy` needs Review Passed or Deploy) are checked
  on the card's stage, never by reading `INTENT.md`.
- In DEV there is no Deploy → Done: `deploy` only publishes (Gate P); cards stay in **Review Passed**
  until the project is QA and released (`rules/modes.md`).

## `.jairus/product-backlog.json` (DEV store)

```json
{
  "schema_version": 1,
  "updated_at": "",
  "cards": {
    "<card>": {
      "stage": "Backlog",
      "type": "bootstrap | environment | branding | upgrade | feature | config | bug | change | starter-gap",
      "depends_on": [],
      "plugin": "<plugin-id> | null",
      "labels": [],
      "branch": "",
      "pr": null,
      "history": [{ "stage": "Backlog", "at": "" }]
    }
  }
}
```

`cards` starts as the **placeholder** `init` writes (`"status": "placeholder"`: the reserved cards `bootstrap`, `environment`
and `branding` only; a top-level `"order"` lists every card, dependencies first). `board` adds the intent's features after them
(`"status": "approved"`), each depending on `bootstrap` and `branding`. The reserved names, `upgrade-*` and `gap-*` belong to
jairus. `bootstrap` and `environment` go Backlog → Done directly (run by `ship`); an `upgrade` card waits until no card is
in progress; a card's `plugin` is the business-domain plugin named by
the intent. A `starter-gap` card is an extension request (`rules/starter-contract.md`): it never
leaves Backlog and is worked in the starter, not here.

## `.jairus/journal.md`

One line per event, appended (never edited) by the command that did it:

```
2026-10-24T09:15Z · board · — · Gate 2 approved: 4 cards in Backlog · next: /jairus:extend <plugin-id>
```

Format: `<UTC time> · <command> · <feature or —> · <event> · next: <the single next action>`. Events:
stage start, gate presented / approved / declined, stop with its reason, resume. It never holds
secrets. A new session reads its last lines (`rules/preflight.md` part C4) to learn where the last
one stopped; the backlog and `jairus.json` still decide the state.

## Dependency unlock

When a dependent feature is unblocked is defined once in `rules/transitions.md` → Dependency unlock.
