#!/usr/bin/env node
// What a starter (or a product copy of it) requires, read from its own files.
//   node starter-requirements.mjs <dir> [--status] [--json]
// Prints the runtime and package manager (package.json engines/packageManager, .nvmrc), the env files its
// .env.example names, and every variable by section with the starter's own comment and consumers; marks the
// ones its comment says to generate. `--status` adds SET or EMPTY per variable by reading the named env files
// by name only: a value is never printed. Exit 0 ok · 1 not a starter · 2 misused.
import { envStatus, readRequirements } from './lib/requirements.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: starter-requirements.mjs <dir> [--status] [--json]'); process.exit(2); }

const req = readRequirements(dir);
if (!req.name) { console.log(`FAIL ${dir} has no package.json`); process.exit(1); }
const status = args.includes('--status') ? envStatus(dir, req) : null;

if (args.includes('--json')) {
  console.log(JSON.stringify({ ...req, status: status && { files: status.files, missing: status.missing } }, null, 2));
  process.exit(0);
}
console.log(`STARTER ${req.name}`);
console.log(`runtime: node ${req.nodeEngines ?? '(unspecified)'}${req.nvmrc ? ` (.nvmrc ${req.nvmrc})` : ''} · package manager: ${req.packageManager ?? '(unspecified)'}`);
console.log(`env files: ${req.envFiles.join(', ') || '(none named in .env.example)'}${status ? ` — present: ${req.envFiles.filter((f) => status.files[f]).join(', ') || 'none'}` : ''}`);
const byName = status ? new Map(status.variables.map((v) => [v.name, v])) : null;
for (const s of req.sections) {
  console.log(`\nSECTION ${s.name}${s.consumers ? `  [${s.consumers}]` : ''}`);
  for (const v of s.vars) {
    const mark = byName ? (byName.get(v.name).setIn.length ? ' SET' : ' EMPTY') : '';
    console.log(`  ${v.name}${mark}${v.generatable ? ' (generatable)' : ''} — ${v.consumers || 'any'} — ${v.comment || '(no comment)'}`);
  }
}
if (status) console.log(`\n${status.missing.length} variable(s) empty or absent: ${status.missing.join(', ') || 'none'}`);
