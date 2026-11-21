# MCP usage — how the plugin uses a workspace's servers

The plugin does its integration work through **MCP servers configured per workspace**, in the product's
`.mcp.json` (the starter's stack: a database server, a repo host, a hosting server, a payments server). They
authenticate through the browser (`claude mcp login <server>` or `/mcp`), so no token lives in the plugin or in
the machine environment. Which servers a step needs is in `rules/preflight.md` part A. What each server can do
is in that server's own tool descriptions: the plugin does not duplicate vendor documentation.

## Golden rule

Before a shell command for a platform operation, ask: **can an MCP tool do this?** If yes, use it. A CLI is an
optional fallback, never a requirement (`rules/starter-contract.md` lists the only commands the plugin calls:
the starter's own).

## Read before write, verify after write

1. **Read current state** before proposing any change.
2. **Write only after the gate for that operation is approved:**

   | Operation | Gate |
   |---|---|
   | Foundation provisioning (database project and branch, repo, hosting, payments test objects) | F2 (resource plan) |
   | Schema, RLS, role or grant change on the dev branch | Gate 4 |
   | Live payment objects | Gate 5 (or at Gate 8 if deferred) |
   | First repo creation and push, and every branch push | Gate P |
   | Backlog (GitHub Project) creation | Gate 2 |
   | Merging a feature PR | Gate 6 |
   | Staging and production release | Gates 7 and 8 |

3. **Verify the new state** by reading it back through the server. "The tool returned success" is not verification.

## Rules that hold for every server

- **Secrets never travel through a tool result** (`rules/security.md`): use the server for ids and reads; a
  connection string or key is placed by the human or by a shell pipe, never by an MCP response.
- **The database server is read-only for agents:** schema, branches and policies; never SQL writes. Database
  changes go through the starter's CLI (`rules/gates.md` → Database changes).
- **Hosting:** nothing deploys on push or merge; previews and production go through the starter's release path
  after the gates. Do not ask the user to copy URLs or logs from a dashboard: read them through the server.
- **Repo host:** card moves and board objects are changed only by commands (`rules/transitions.md`); never
  force-push, never bypass CI.
- **Payments:** test mode during development; live objects only after Gate 5; never log card data or PII.
- **Main thread vs agents:** MCP reads and gated writes are made by the command-skill; agents receive the
  results in their envelope (`rules/delegation.md`). An agent holds an MCP server only for read-only checks it
  must repeat itself (`rules/delegation.md` → Agent registry).
- A server that is not connected stops the command with the message in `rules/preflight.md` part A.
