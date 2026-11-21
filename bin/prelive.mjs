#!/usr/bin/env node
// The pre-live list: what a human still has to supply or decide before something live happens.
//   node prelive.mjs <file> add "<what>" [--kind env|account|decision] [--before develop|qa|deploy]
//   node prelive.mjs <file> list | done <id> | ack <id> "<reason>" | validate | check --before <point>
// `check` exits 1 listing every open item due at or before the point (acknowledged and done items pass).
// Items name needs, never values. Exit 0 ok · 1 blocking/invalid · 2 misused.
import { add, blocking, BEFORE, checkPrelive, load, save, setStatus } from './lib/prelive.mjs';

const [file, cmd, ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
const usage = () => { console.error('usage: prelive.mjs <file> add|list|done|ack|validate|check …'); process.exit(2); };
if (!file || !cmd) usage();

const doc = load(file);
const line = (i) => `${i.id} [${i.status}] ${i.kind} before ${i.before}: ${i.what}${i.note ? ` — ${i.note}` : ''}`;
try {
  if (cmd === 'add') {
    if (!positional[0]) usage();
    const item = add(doc, { what: positional[0], kind: opt('--kind'), before: opt('--before') });
    const errors = checkPrelive(doc);
    if (errors.length) { errors.forEach((e) => console.log(`FAIL ${e}`)); process.exit(1); }
    save(file, doc); console.log(line(item));
  } else if (cmd === 'done' || cmd === 'ack') {
    if (!positional[0] || (cmd === 'ack' && !positional[1])) usage();
    const item = setStatus(doc, positional[0], cmd === 'done' ? 'done' : 'acknowledged', positional[1]);
    save(file, doc); console.log(line(item));
  } else if (cmd === 'list') {
    doc.items.forEach((i) => console.log(line(i)));
    if (!doc.items.length) console.log('(none)');
  } else if (cmd === 'validate') {
    const errors = checkPrelive(doc);
    errors.forEach((e) => console.log(`FAIL ${e}`));
    if (!errors.length) console.log(`OK ${doc.items.length} item(s)`);
    process.exit(errors.length ? 1 : 0);
  } else if (cmd === 'check') {
    const point = opt('--before');
    if (!BEFORE.includes(point)) usage();
    const open = blocking(doc, point);
    open.forEach((i) => console.log(`OPEN ${line(i)}`));
    if (!open.length) console.log(`OK nothing open before ${point}`);
    process.exit(open.length ? 1 : 0);
  } else usage();
} catch (e) { console.error(e.message); process.exit(2); }
