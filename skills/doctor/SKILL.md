---
name: doctor
description: "Check that this machine is ready for jairus and say exactly how to fix what is not: the plugin's own needs (Node, git, plugin integrity, the local starter), what the starter itself declares (runtime, package manager, env variables) and MCP connectivity per workspace server. Never asks for or reads a secret. Safe to run anytime. Run /jairus:doctor [--mode dev|qa] [--check]."
argument-hint: "[--mode dev|qa] [--check]"
allowed-tools: Read, Glob, Bash(node *), Bash(claude mcp *), mcp__neon__*, mcp__github__*, mcp__vercel__*, mcp__stripe__*
disable-model-invocation: true
---

# /jairus:doctor

**Owns:** readiness only — the plugin's needs, what the starter declares it needs, plugin integrity, MCP
connectivity. **Does NOT own** project state, resume or version checks (`rules/preflight.md` part C), feature
status, provisioning, or any secret: it never asks for one, reads one into output, or writes one.

Arguments: **$ARGUMENTS** — `--mode dev|qa` picks the profile (default: the project's mode from
`.jairus/jairus.json` when run inside a project, otherwise ask once); `--check` is non-interactive and only reports.

## Step 0 — Preflight
None: doctor runs with no project and no MCP servers (exempt per `rules/preflight.md` → Stage applicability).

## Step 1 — Plugin readiness and the starter's requirements
Run `node ${CLAUDE_PLUGIN_ROOT}/bin/doctor.mjs --mode <dev|qa>` and show its lines as they are. It checks the plugin's
own needs (a current Node.js on your machine, git, the plugin's manifest, the shipped command-skills, the `bin/` tools and hook scripts, and in
DEV the local starter via `JAIRUS_STARTER_PATH` or a sibling `jairus-starter`), then what the **starter** declares:
its Node range, its package manager and the count of env variables. Run it **any time**: before init the starter's
needs are read from the local starter and a gap is a `WARN` (a heads-up); inside a project they are read from the
project's own copy and a gap is a `FAIL` (the bootstrap card runs that check at F4). `--scope plugin|starter` runs one group. No
vendor tool or token is checked: those belong to the starter and the MCP servers. Each problem prints its `fix:`
line. Exit code 1 means at least one failure.
Then run `node ${CLAUDE_PLUGIN_ROOT}/bin/starter-requirements.mjs <starter>` and show the env sections (names only):
the checklist the human works through at Foundation F6.

## Step 2 — MCP connectivity
Required servers per mode ([preflight.md](${CLAUDE_PLUGIN_ROOT}/rules/preflight.md) part A, [modes.md](${CLAUDE_PLUGIN_ROOT}/rules/modes.md)):
DEV needs **neon**; QA needs **github, neon, stripe, vercel**. The workspace `.mcp.json` decides which exist: a server it does not declare is not checked. For each, make **one lightweight read**
(neon: list projects; github: read the repo; stripe: list products; vercel: list projects) and report ✅ / ❌.
A server that is not connected → `claude mcp login <server>` (or `/mcp`); project servers load only at session
start, so after `init` writes `.mcp.json` the human restarts Claude Code first. `claude mcp list` is the fallback
when a read cannot be made.

## Step 3 — Report
Print one summary: ✅ ready (DEV | QA) or the list of ❌ with their fixes. Credentials are never requested here: the
human supplies them at Foundation F6 (`rules/foundation.md` → Secrets). Nothing is written to any file.

```
Jairus doctor — <dev|qa> · node ✅ git ✅ starter runtime ✅ pnpm ❌ … · MCP: neon ✅
Next: fix the ❌ above, then /jairus:init   (an existing project: /jairus:help)
```

## On error
| Error | Recovery |
|---|---|
| `bin/doctor.mjs` itself fails or is missing | The plugin install is damaged: `/plugin marketplace update jairus-plugin`, then `/reload-plugins` |
| Mode unknown outside a project | Ask once: dev or qa (`rules/modes.md`) |
| An MCP read cannot be made | Report ❌ for that server with `claude mcp login <server>`; do not block the rest |
