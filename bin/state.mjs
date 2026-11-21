#!/usr/bin/env node
// The only writer of .jairus/jairus.json and .jairus/journal.md for the commands, and the status reader for help.
//   node state.mjs <.jairus dir> step <F-step> <done|deferred|failed|skipped> [--ref <text>]
//   node state.mjs <.jairus dir> next --command <cmd> [--reason <text>] [--phase <p>] [--current <step>] [--blocker <text>]...
//   node state.mjs <.jairus dir> starter [--path <p>] [--ref <r>] [--sha <40hex>] [--dirty true|false] [--source <s>] [--core <a,b>] [--product <a,b>]
//   node state.mjs <.jairus dir> foundation [--status pending|green] [--scope <scope>]
//   node state.mjs <.jairus dir> journal --command <cmd> --event <text> [--card <name>] [--next <text>]
//   node state.mjs <.jairus dir> show [--json]
// Paths are stored with forward slashes. Writes are atomic. Exit 0 ok · 1 refused · 2 misused.
import fs from 'node:fs';
import { appendJournal, load, save, setFoundation, setNext, setStarter, setStep, stateFiles, status } from './lib/state.mjs';

const [dir, op, ...rest] = process.argv.slice(2);
const usage = () => { console.error('usage: state.mjs <.jairus dir> step|next|starter|foundation|journal|show …'); process.exit(2); };
if (!dir || !op) usage();
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const all = (n) => rest.flatMap((a, i) => (a === n ? [rest[i + 1]] : []));
const list = (v) => (v === undefined ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean));
const f = stateFiles(dir);

try {
  if (op === 'journal') {
    appendJournal(f.journal, { command: opt('--command'), card: opt('--card'), event: opt('--event'), next: opt('--next') });
    console.log('journal updated');
  } else if (op === 'show') {
    const j = load(f.json);
    const backlog = fs.existsSync(f.backlog) ? JSON.parse(fs.readFileSync(f.backlog, 'utf8')) : null;
    const s = status(j, backlog);
    if (rest.includes('--json')) console.log(JSON.stringify(s, null, 2));
    else {
      console.log(`mode: ${s.mode} · foundation: ${s.foundation}${s.workflow.phase ? ` · phase: ${s.workflow.phase}` : ''}`);
      console.log(`current: ${s.workflow.current || '—'}`);
      console.log(`next: ${s.workflow.next?.command || '—'}${s.workflow.next?.reason ? ` — ${s.workflow.next.reason}` : ''}`);
      for (const b of s.workflow.blockers ?? []) console.log(`blocker: ${b}`);
      if (s.backlog) console.log(`backlog: ${s.backlog.status} · ${s.backlog.cards} cards · unblocked: ${s.backlog.unblocked.join(', ') || 'none'}`);
      for (const n of s.notes) console.log(`note: ${n}`);
    }
  } else {
    const j = load(f.json);
    if (op === 'step') setStep(j, rest[0], rest[1], opt('--ref') ?? '');
    else if (op === 'next') setNext(j, { command: opt('--command'), reason: opt('--reason'), phase: opt('--phase'), current: opt('--current'), blockers: rest.includes('--blocker') ? all('--blocker').filter(Boolean) : undefined });
    else if (op === 'starter') setStarter(j, { path: opt('--path'), ref: opt('--ref'), sha: opt('--sha'), dirty: opt('--dirty'), source: opt('--source'), core: list(opt('--core')), product: list(opt('--product')) });
    else if (op === 'foundation') setFoundation(j, { status: opt('--status'), scope: opt('--scope') });
    else usage();
    save(f.json, j);
    console.log(`${op} recorded`);
  }
} catch (e) { console.log(`FAIL ${e.message}`); process.exit(1); }
