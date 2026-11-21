#!/usr/bin/env node
// Checks a feature spec (.jairus/features/<f>/spec.json) against rules/design-workflow.md.
//   node check-feature.mjs <spec.json> [--final] [--intent <INTENT.md>] [--built --root <dir>]
// Without flags only the structure is checked (a draft). `--final` = the Gate 3 facts (status approved
// implies it). `--intent` checks the spec agrees with its card in INTENT.md (name, plugin). `--built`
// (after develop, with the project `--root`) checks AC traceability — `// AC-N` markers, test files
// naming the criterion, planned files existing — and that every AC has implemented_at and test_at.
// Output: `FAIL <problem>` lines then `OK`. Exit 0 ok · 1 problems · 2 misused.
import fs from 'node:fs';
import path from 'node:path';
import { parseIntent } from './lib/jairus.mjs';
import { checkFeatureBuilt, checkFeatureSpec } from './lib/feature.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !['--intent', '--root'].includes(args[i - 1]));
if (!file) { console.error('usage: check-feature.mjs <spec.json> [--final] [--intent <INTENT.md>] [--built --root <dir>]'); process.exit(2); }
if (args.includes('--built') && !opt('--root')) { console.error('--built needs --root <project dir>'); process.exit(2); }

let spec;
try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.log(`FAIL cannot read ${file}: ${e.message}`); process.exit(1); }

let card = null;
if (opt('--intent')) {
  try {
    const intent = parseIntent(fs.readFileSync(opt('--intent'), 'utf8'));
    card = (intent.features ?? []).find((f) => f.name === spec.feature);
    if (!card) { console.log(`FAIL "${spec.feature}" is not a feature in ${opt('--intent')}`); process.exit(1); }
  } catch (e) { console.log(`FAIL ${e.message}`); process.exit(1); }
}
const errors = [...checkFeatureSpec(spec, { final: args.includes('--final'), card })];
if (args.includes('--built')) errors.push(...checkFeatureBuilt(spec, path.resolve(opt('--root')), fs, path));
for (const e of errors) console.log(`FAIL ${e}`);
if (errors.length) { console.log(`${errors.length} problem(s)`); process.exit(1); }
console.log('OK');
