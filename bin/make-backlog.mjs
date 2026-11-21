#!/usr/bin/env node
// Creates or completes .jairus/product-backlog.json (the DEV backlog store).
//   node make-backlog.mjs --placeholder --out <.jairus/product-backlog.json>   (init: the reserved cards only)
//   node make-backlog.mjs <INTENT.md> --out <.jairus/product-backlog.json> [--dry-run]   (board: add the features)
// With an INTENT the backlog is created if missing, or completed if it exists: the intent's features that have no card are
// added (existing cards are never changed), the status becomes approved and the order is recomputed. Refuses a draft or
// invalid intent. --dry-run prints the cards without writing. Exit 0 written · 1 refused · 2 misused.
import fs from 'node:fs';
import { checkBacklog, checkIntent, fillBacklog, parseIntent, placeholderBacklog } from './lib/jairus.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const out = opt('--out');
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!out || (!file && !args.includes('--placeholder'))) { console.error('usage: make-backlog.mjs (--placeholder | <INTENT.md>) --out <.jairus/product-backlog.json> [--dry-run]'); process.exit(2); }

const show = (backlog) => {
  for (const name of backlog.order) {
    const c = backlog.cards[name];
    console.log(`${name}  [${c.type}${c.plugin ? ` · plugin ${c.plugin}` : ''}]  depends_on: ${c.depends_on.join(', ') || '—'}`);
  }
};
const finish = (backlog, label) => {
  const problems = checkBacklog(backlog);
  if (problems.length) { for (const p of problems) console.log(`FAIL ${p}`); process.exit(1); }
  if (!args.includes('--dry-run')) fs.writeFileSync(out, `${JSON.stringify(backlog, null, 2)}\n`);
  show(backlog);
  console.log(`OK ${Object.keys(backlog.cards).length} cards (${label}) → ${out}${args.includes('--dry-run') ? ' (dry run, nothing written)' : ''}`);
};

if (args.includes('--placeholder')) {
  if (fs.existsSync(out)) { console.log(`FAIL ${out} exists`); process.exit(1); }
  finish(placeholderBacklog(), 'placeholder');
} else {
  let intent;
  try { intent = parseIntent(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`FAIL ${e.message}`); process.exit(1); }
  const problems = checkIntent(intent, { final: true });
  if (problems.length) { for (const p of problems) console.log(`FAIL ${p}`); process.exit(1); }
  let existing;
  try { existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : placeholderBacklog(); } catch (e) { console.log(`FAIL cannot read ${out}: ${e.message}`); process.exit(1); }
  finish(fillBacklog(existing, intent), existing.status === 'placeholder' || !fs.existsSync(out) ? 'created' : 'completed');
}
