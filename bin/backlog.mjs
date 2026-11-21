#!/usr/bin/env node
// Deterministic changes to .jairus/product-backlog.json by the commands (rules/transitions.md); agents never run this.
//   node backlog.mjs <file> move <card> <stage>          one stage forward; bootstrap and environment may go Backlog → Done
//   node backlog.mjs <file> next                         the card ship runs next (the first unblocked in order)
//   node backlog.mjs <file> upgrade <ref>                add an upgrade card for a newer starter ref
//   node backlog.mjs <file> gap <title> --evidence <text>   add a starter-gap card (a defect in the starter's own code)
// Every write is validated first. Exit 0 ok · 1 refused · 2 misused.
import fs from 'node:fs';
import { addGap, addUpgrade, checkBacklog, moveCard, nextCard } from './lib/jairus.mjs';

const [file, op, ...rest] = process.argv.slice(2);
const usage = () => { console.error('usage: backlog.mjs <file> move|next|upgrade|gap …'); process.exit(2); };
if (!file || !op) usage();
let backlog;
try { backlog = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`FAIL cannot read ${file}: ${e.message}`); process.exit(1); }
const ev = rest.indexOf('--evidence');
const arg = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--evidence');

try {
  if (op === 'next') { const n = nextCard(backlog); console.log(n ? `NEXT ${n} [${backlog.cards[n].type}]` : 'NEXT none'); process.exit(0); }
  if (op === 'move') { if (arg.length < 2) usage(); moveCard(backlog, arg[0], arg.slice(1).join(' ')); }
  else if (op === 'upgrade') { if (!arg[0]) usage(); addUpgrade(backlog, arg[0]); }
  else if (op === 'gap') { if (!arg[0] || ev < 0) usage(); addGap(backlog, arg.join(' '), rest[ev + 1]); }
  else usage();
  const problems = checkBacklog(backlog);
  if (problems.length) { for (const p of problems) console.log(`FAIL ${p}`); process.exit(1); }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(backlog, null, 2)}\n`);
  fs.renameSync(tmp, file);
  console.log(`${op} ok`);
} catch (e) { console.log(`FAIL ${e.message}`); process.exit(1); }
