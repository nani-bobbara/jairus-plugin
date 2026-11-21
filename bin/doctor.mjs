#!/usr/bin/env node
// Readiness for /jairus:doctor: the plugin's own needs (Node, git, plugin integrity, local starter) and what the
// starter declares (runtime, package manager, env variable count), read from the starter.
//   node doctor.mjs --mode dev|qa [--from <dir>] [--starter <dir>] [--scope all|plugin|starter] [--json]
// Prints one line per check: `PASS|WARN|FAIL <name> — <detail>` and, for a failure, `  fix: <command>`.
// No vendor tool or secret is checked; MCP connectivity is not checked here (the doctor skill does it with one
// read per server). Exit 0 no failure · 1 a failure · 2 misused.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitCode, runChecks } from './lib/doctor.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const mode = opt('--mode');
if (!['dev', 'qa'].includes(mode)) { console.error('usage: doctor.mjs --mode dev|qa [--from <dir>] [--starter <dir>] [--scope all|plugin|starter] [--json]'); process.exit(2); }

const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32', timeout: 20000 });
  return { ok: !r.error && r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scope = opt('--scope') ?? 'all';
if (!['all', 'plugin', 'starter'].includes(scope)) { console.error('--scope must be all, plugin or starter'); process.exit(2); }
const checks = runChecks({ mode, run, pluginRoot, from: opt('--from') ?? process.cwd(), starterDir: opt('--starter'), scope });

if (args.includes('--json')) console.log(JSON.stringify(checks, null, 2));
else {
  for (const c of checks) {
    console.log(`${c.level.toUpperCase()} ${c.name} — ${c.detail}`);
    if (c.level !== 'pass' && c.fix) console.log(`  fix: ${c.fix}`);
  }
}
process.exit(exitCode(checks));
