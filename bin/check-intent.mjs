#!/usr/bin/env node
// Checks .jairus/INTENT.md against rules/intent-schema.md.
//   node check-intent.mjs <INTENT.md> [--final]
// Without --final only the structure is checked (draft). --final = the Gate F1 exit criteria.
// Output: `FAIL <problem>` lines then `OK <n> features`. Exit 0 ok · 1 problems · 2 misused.
import fs from 'node:fs';
import { checkIntent, parseIntent } from './lib/jairus.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: check-intent.mjs <INTENT.md> [--final]'); process.exit(2); }
let intent;
try { intent = parseIntent(fs.readFileSync(file, 'utf8')); }
catch (e) { console.log(`FAIL ${e.message}`); process.exit(1); }
const errors = checkIntent(intent, { final: args.includes('--final') });
for (const e of errors) console.log(`FAIL ${e}`);
if (errors.length) { console.log(`${errors.length} problem(s)`); process.exit(1); }
console.log(`OK ${(intent.features ?? []).length} features`);
