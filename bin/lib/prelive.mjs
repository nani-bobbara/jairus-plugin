// .jairus/prelive.json — what a human must still supply or decide before something live happens (rules/state-model.md).
// Items name a need (an env variable by name, an account, a decision); a value is never stored here.
import fs from 'node:fs';

export const BEFORE = ['develop', 'qa', 'deploy'];
export const KINDS = ['env', 'account', 'decision'];
export const STATUSES = ['open', 'done', 'acknowledged'];

export function load(file, fsImpl = fs) {
  try { return JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch { return { schema: 1, items: [] }; }
}

export const save = (file, doc, fsImpl = fs) => fsImpl.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);

export function checkPrelive(doc) {
  const errors = [];
  if (doc.schema !== 1) errors.push('schema must be 1');
  const ids = new Set();
  for (const [i, it] of (doc.items ?? []).entries()) {
    const at = `items[${i}]`;
    if (!it.id || ids.has(it.id)) errors.push(`${at}: id missing or duplicated`);
    ids.add(it.id);
    if (!it.what) errors.push(`${at}: what is empty`);
    if (!KINDS.includes(it.kind)) errors.push(`${at}: kind must be one of ${KINDS.join(', ')}`);
    if (!BEFORE.includes(it.before)) errors.push(`${at}: before must be one of ${BEFORE.join(', ')}`);
    if (!STATUSES.includes(it.status)) errors.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
    if (it.status === 'acknowledged' && !it.note) errors.push(`${at}: an acknowledged item needs a note (the human's reason)`);
  }
  return errors;
}

export function add(doc, { what, kind = 'env', before = 'qa' }) {
  const n = Math.max(0, ...doc.items.map((i) => Number(/^P(\d+)$/.exec(i.id)?.[1] ?? 0))) + 1;
  const item = { id: `P${n}`, what, kind, before, status: 'open' };
  doc.items.push(item);
  return item;
}

export function setStatus(doc, id, status, note) {
  const it = doc.items.find((i) => i.id === id);
  if (!it) throw new Error(`no item ${id}`);
  it.status = status;
  if (note) it.note = note;
  return it;
}

/** Items still open that must be clear before `point`: those due at that point or any earlier one. */
export function blocking(doc, point) {
  const cut = BEFORE.indexOf(point);
  return doc.items.filter((i) => i.status === 'open' && BEFORE.indexOf(i.before) <= cut);
}
