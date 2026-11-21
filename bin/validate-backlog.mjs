#!/usr/bin/env node
// Validates .jairus/product-backlog.json (rules/state-model.md) and optionally lists what is unblocked.
//   node validate-backlog.mjs <.jairus/product-backlog.json> [--unblocked]
// Output: `FAIL <problem>` lines then `OK <n> cards`; with --unblocked also `UNBLOCKED <card>` lines
// (Backlog cards whose depends_on are all Review Passed or Done). Exit 0 ok · 1 problems · 2 misused.
import fs from 'node:fs';
import { checkBacklog, unblockedCards } from './lib/jairus.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: validate-backlog.mjs <.jairus/product-backlog.json> [--unblocked]'); process.exit(2); }
let backlog;
try { backlog = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.log(`FAIL cannot read ${file}: ${e.message}`); process.exit(1); }
const errors = checkBacklog(backlog);
for (const e of errors) console.log(`FAIL ${e}`);
if (errors.length) { console.log(`${errors.length} problem(s)`); process.exit(1); }
console.log(`OK ${Object.keys(backlog.cards).length} cards${backlog.status === 'placeholder' ? ' (placeholder)' : ''}`);
if (args.includes('--unblocked')) for (const n of unblockedCards(backlog)) console.log(`UNBLOCKED ${n}`);
