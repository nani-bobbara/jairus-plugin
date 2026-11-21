// Deterministic writes to .jairus/jairus.json and .jairus/journal.md (rules/state-model.md, rules/transitions.md).
// Commands call bin/state.mjs instead of hand-editing JSON, so paths, timestamps and shapes are exact.
import fs from 'node:fs';
import path from 'node:path';
import { STAGES, unblockedCards } from './jairus.mjs';

export const STEP_STATUSES = ['done', 'deferred', 'failed', 'skipped'];
const STEP_NAME = /^F(\d+|-VERIFY)$/;

/** Windows paths are stored with forward slashes: a backslash in JSON is lost or doubled by hand edits. */
export const normalizePath = (p) => String(p).replace(/\\/g, '/');

const emptyWorkflow = () => ({ phase: '', current: '', next: { command: '', reason: '' }, blockers: [], updated_at: '' });

export function load(file, fsImpl = fs) {
  const j = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  if (j.schema_version !== 1) throw new Error('jairus.json: schema_version must be 1');
  return j;
}

export function save(file, j, now = new Date().toISOString(), fsImpl = fs) {
  j.updated_at = now;
  const tmp = `${file}.tmp`;
  fsImpl.writeFileSync(tmp, `${JSON.stringify(j, null, 2)}\n`);
  fsImpl.renameSync(tmp, file);
}

export function setStep(j, step, status, ref = '', now = new Date().toISOString()) {
  if (!STEP_NAME.test(step)) throw new Error(`step must look like F0..F10 or F-VERIFY, got "${step}"`);
  if (!STEP_STATUSES.includes(status)) throw new Error(`step status must be one of ${STEP_STATUSES.join(', ')}`);
  j.project.foundation.steps[step] = { step: status, at: now, ref };
  return j;
}

export function setNext(j, { command, reason = '', phase, current, blockers }, now = new Date().toISOString()) {
  if (!command) throw new Error('next needs a command');
  const w = { ...emptyWorkflow(), ...(j.workflow ?? {}) };
  w.next = { command, reason };
  if (phase !== undefined) w.phase = phase;
  if (current !== undefined) w.current = current;
  if (blockers !== undefined) w.blockers = blockers;
  w.updated_at = now;
  j.workflow = w;
  return j;
}

export function setStarter(j, { path: p, ref, sha, dirty, source, core, product }) {
  const s = j.starter;
  if (p !== undefined) s.path = normalizePath(p);
  if (ref !== undefined) s.ref = ref;
  if (sha !== undefined) {
    if (sha !== '' && !/^[0-9a-f]{40}$/.test(sha)) throw new Error('sha must be 40 hex characters');
    s.sha = sha;
  }
  if (dirty !== undefined) s.dirty = dirty === true || dirty === 'true';
  if (source !== undefined) s.source = source;
  if (core !== undefined || product !== undefined) s.zones = { core: core ?? s.zones?.core ?? [], product: product ?? s.zones?.product ?? [] };
  return j;
}

export function setFoundation(j, { status, scope }) {
  if (status !== undefined) {
    if (!['pending', 'green'].includes(status)) throw new Error('foundation status must be pending or green');
    j.project.foundation.status = status;
  }
  if (scope !== undefined) j.project.foundation.scope = scope;
  return j;
}

/** One journal line: `<UTC time> · <command> · <card or —> · <event> · next: <the single next action>`. */
export function journalLine({ command, card = '—', event, next = '' }, now = new Date().toISOString()) {
  if (!command || !event) throw new Error('journal needs a command and an event');
  return `${now} · ${command} · ${card} · ${event} · next: ${next || '—'}`;
}

export function appendJournal(file, entry, now, fsImpl = fs) {
  const text = fsImpl.existsSync(file) ? fsImpl.readFileSync(file, 'utf8') : '';
  fsImpl.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${journalLine(entry, now)}\n`);
}

/** Where the project is and what comes next, from jairus.json checked against the backlog (the stage authority). */
export function status(j, backlog) {
  const out = { mode: j.mode, foundation: j.project?.foundation?.status ?? 'pending', workflow: j.workflow ?? emptyWorkflow(), notes: [] };
  if (backlog) {
    const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const c of Object.values(backlog.cards ?? {})) counts[c.stage] = (counts[c.stage] ?? 0) + 1;
    out.backlog = { status: backlog.status ?? 'approved', cards: Object.keys(backlog.cards ?? {}).length, stages: counts, unblocked: unblockedCards(backlog) };
    const next = out.workflow.next?.command ?? '';
    if (out.backlog.status === 'placeholder' && !/board/.test(next)) out.notes.push('the backlog is still a placeholder: run /jairus:board');
    if (out.backlog.status !== 'placeholder' && out.backlog.unblocked.length === 0 && Object.values(backlog.cards).some((c) => c.stage !== 'Done')) out.notes.push('no card is unblocked: check the cards in progress');
  } else out.notes.push('no backlog file: run /jairus:init');
  if (!out.workflow.next?.command) out.notes.push('no next action recorded: run /jairus:help or the last command again');
  return out;
}

export const stateFiles = (dir) => ({ json: path.join(dir, 'jairus.json'), journal: path.join(dir, 'journal.md'), backlog: path.join(dir, 'product-backlog.json') });
