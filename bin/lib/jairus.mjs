// Shared, dependency-free helpers for the plugin's deterministic scripts (Node >= 20).
// INTENT.md parsing and checks, .jairus/product-backlog.json creation and validation.
// Rules they implement: rules/intent-schema.md, rules/state-model.md, rules/gates.md (Gates F1, 2).

export const STAGES = ['Backlog', 'Design', 'Design Approved', 'Develop', 'Review', 'Review Passed', 'Deploy', 'Done'];
export const CARD_TYPES = ['bootstrap', 'environment', 'branding', 'upgrade', 'feature', 'config', 'bug', 'change', 'starter-gap'];
export const INTENT_FEATURE_TYPES = ['feature', 'config'];
export const PLANS = ['free', 'basic', 'pro', 'all'];
export const MODES = ['dev', 'qa'];
// Namespaces a plugin id may not use (the core owns them).
export const RESERVED_PLUGIN_IDS = ['app', 'core', 'org', 'auth', 'audit', 'billing', 'email', 'features', 'jobs', 'members', 'user', 'admin', 'portal', 'plugin'];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// ---------- a YAML subset: maps, block lists, flow lists, quoted/plain scalars, # comments ----------
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function splitFlow(s) {
  const out = [];
  let cur = '';
  let q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; }
    else if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function scalar(v) {
  v = v.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(scalar);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/)
    .map((raw) => ({ s: stripComment(raw).replace(/\s+$/, '') }))
    .filter((l) => l.s.trim() !== '')
    .map((l) => ({ ...l, indent: l.s.length - l.s.trimStart().length }));
  let pos = 0;
  const isDash = (l) => l.s.trim() === '-' || l.s.trim().startsWith('- ');

  function block(indent) {
    if (pos >= lines.length || lines[pos].indent < indent) return null;
    return isDash(lines[pos]) ? list(lines[pos].indent) : map(lines[pos].indent);
  }
  function map(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !isDash(lines[pos])) {
      const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[pos].s.trim());
      if (!m) throw new Error(`unsupported YAML at "${lines[pos].s.trim()}"`);
      pos++;
      if (m[2] !== '') obj[m[1]] = scalar(m[2]);
      else {
        const next = lines[pos];
        if (next && next.indent > indent) obj[m[1]] = block(next.indent);
        else if (next && next.indent === indent && isDash(next)) obj[m[1]] = list(indent);
        else obj[m[1]] = null;
      }
    }
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && isDash(lines[pos])) {
      const rest = lines[pos].s.trim().slice(1).trim();
      if (rest === '') { pos++; arr.push(block(lines[pos]?.indent ?? indent + 2)); }
      else if (/^[A-Za-z0-9_-]+:(\s|$)/.test(rest)) {
        lines[pos] = { s: ' '.repeat(indent + 2) + rest, indent: indent + 2 };
        arr.push(map(indent + 2));
      } else { pos++; arr.push(scalar(rest)); }
    }
    return arr;
  }
  const result = block(0);
  if (pos < lines.length) throw new Error(`unsupported YAML at "${lines[pos].s.trim()}"`);
  return result ?? {};
}

// ---------- INTENT.md ----------
export function parseIntent(markdown) {
  const lines = markdown.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') throw new Error('INTENT.md must start with a "---" frontmatter block');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) throw new Error('INTENT.md frontmatter is not closed with "---"');
  return parseYaml(lines.slice(1, end).join('\n'));
}

function findCycle(graph) {
  const state = {};
  const stack = [];
  const visit = (n) => {
    if (state[n] === 2) return null;
    if (state[n] === 1) return [...stack.slice(stack.indexOf(n)), n];
    state[n] = 1; stack.push(n);
    for (const d of graph[n] ?? []) {
      if (!(d in graph)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop(); state[n] = 2;
    return null;
  };
  for (const n of Object.keys(graph)) { const c = visit(n); if (c) return c; }
  return null;
}

/** Returns a list of problems. `final` = the Gate F1 criteria; otherwise only structure is checked. */
export function checkIntent(intent, { final = false } = {}) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (intent.schema_version !== '3.0') bad(`schema_version must be "3.0" (got ${JSON.stringify(intent.schema_version)})`);
  if (typeof intent.project_name !== 'string' || !KEBAB.test(intent.project_name) || intent.project_name.length > 32) bad('project_name must be kebab-case, at most 32 characters');
  if (!intent.display_name) bad('display_name is empty');
  if (!intent.one_liner) bad('one_liner is empty');
  else if (String(intent.one_liner).length > 120) bad('one_liner is longer than 120 characters');
  if (!['draft', 'bootstrapped'].includes(intent.status)) bad('status must be draft or bootstrapped');
  if (!MODES.includes(intent.mode)) bad('mode must be dev or qa');
  if (intent.backend !== 'neon') bad('backend must be neon');
  const features = Array.isArray(intent.features) ? intent.features : [];
  if (final && features.length === 0) bad('features is empty');
  const names = new Set();
  const graph = {};
  for (const [i, f] of features.entries()) {
    const at = `features[${i}]${f?.name ? ` (${f.name})` : ''}`;
    if (typeof f?.name !== 'string' || !KEBAB.test(f.name)) { bad(`${at}: name must be kebab-case`); continue; }
    if (RESERVED_NAMES.includes(f.name) || /^(upgrade|gap)-/.test(f.name)) bad(`${at}: "${f.name}" is reserved (jairus creates those cards itself)`);
    if (names.has(f.name)) bad(`${at}: duplicate name`);
    names.add(f.name);
    graph[f.name] = Array.isArray(f.depends_on) ? f.depends_on : [];
    if (!INTENT_FEATURE_TYPES.includes(f.type)) bad(`${at}: type must be one of ${INTENT_FEATURE_TYPES.join(' | ')}`);
    if (!PLANS.includes(f.plan)) bad(`${at}: plan must be one of ${PLANS.join(' | ')}`);
    if (!Array.isArray(f.depends_on)) bad(`${at}: depends_on must be a list`);
    if (f.type === 'feature') {
      if (typeof f.plugin !== 'string' || !KEBAB.test(f.plugin)) bad(`${at}: a feature needs a kebab-case plugin id`);
      else if (RESERVED_PLUGIN_IDS.includes(f.plugin)) bad(`${at}: plugin id "${f.plugin}" is a core namespace`);
    } else if (f.type === 'config' && f.plugin) bad(`${at}: a config card has no plugin`);
    if (final) {
      if (!f.display_name) bad(`${at}: display_name is empty`);
      if (!f.description) bad(`${at}: description is empty (blocks /jairus:design)`);
      if (!Array.isArray(f.out_of_scope) || f.out_of_scope.length === 0) bad(`${at}: out_of_scope needs at least one entry (blocks /jairus:design)`);
    }
  }
  for (const [n, deps] of Object.entries(graph)) {
    for (const d of deps) {
      if (d === n) bad(`${n}: depends on itself`);
      else if (!names.has(d)) bad(`${n}: depends_on "${d}" is not a feature`);
    }
  }
  const cycle = findCycle(graph);
  if (cycle) bad(`depends_on has a cycle: ${cycle.join(' → ')}`);
  return errors;
}

// ---------- .jairus/product-backlog.json ----------
// Reserved cards come first in every backlog and are created by init (a placeholder) before any feature exists.
export const RESERVED_CARDS = {
  bootstrap: { type: 'bootstrap', depends_on: [] }, // the starter in place, proven to build
  environment: { type: 'environment', depends_on: ['bootstrap'] }, // infrastructure and env values, run when the human is ready
  branding: { type: 'branding', depends_on: ['bootstrap'] }, // the product's identity applied to the starter (Phase 2 runs it)
};
export const RESERVED_NAMES = Object.keys(RESERVED_CARDS);
const IN_PROGRESS = ['Design', 'Design Approved', 'Develop', 'Review', 'Deploy'];
const DIRECT_DONE = ['bootstrap', 'environment'];

const card = (type, depends_on, plugin, labels, now, extra = {}) => ({
  stage: 'Backlog', type, depends_on, plugin, labels, branch: '', pr: null, history: [{ stage: 'Backlog', at: now }], ...extra,
});

/** Dependencies first; among equals, reserved cards and then the intent's own order. */
export function orderCards(cards) {
  const names = Object.keys(cards);
  const placed = [];
  const left = new Set(names);
  while (left.size) {
    const ready = names.filter((n) => left.has(n) && (cards[n].depends_on ?? []).every((d) => !left.has(d)));
    if (!ready.length) break; // a cycle: checkBacklog reports it
    placed.push(ready[0]);
    left.delete(ready[0]);
  }
  return [...placed, ...left];
}

/** The placeholder init writes: the reserved cards only. board fills in the features. */
export function placeholderBacklog(now = new Date().toISOString()) {
  const cards = {};
  for (const [name, r] of Object.entries(RESERVED_CARDS)) cards[name] = card(r.type, [...r.depends_on], null, [`type:${r.type}`], now);
  return { schema_version: 1, status: 'placeholder', updated_at: now, order: orderCards(cards), cards };
}

/** Add the intent's features to a backlog (a placeholder or an approved one): existing cards are never changed. */
export function fillBacklog(backlog, intent, now = new Date().toISOString()) {
  const next = structuredClone(backlog);
  for (const f of intent.features ?? []) {
    if (next.cards[f.name]) continue;
    next.cards[f.name] = card(f.type, ['bootstrap', 'branding', ...(f.depends_on ?? [])], f.type === 'feature' ? f.plugin : null, [`type:${f.type}`, `plan:${f.plan}`], now);
  }
  next.status = 'approved';
  next.updated_at = now;
  next.order = orderCards(next.cards);
  return next;
}

export const makeBacklog = (intent, now = new Date().toISOString()) => fillBacklog(placeholderBacklog(now), intent, now);

export function checkBacklog(backlog) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (backlog?.schema_version !== 1) bad('schema_version must be 1');
  const cards = backlog?.cards;
  if (!cards || typeof cards !== 'object' || Array.isArray(cards)) return [...errors, 'cards must be an object'];
  if (backlog.status !== undefined && !['placeholder', 'approved'].includes(backlog.status)) bad(`status must be placeholder or approved, got "${backlog.status}"`);
  const graph = {};
  for (const name of RESERVED_NAMES) {
    if (!cards[name]) bad(`the backlog has no ${name} card`);
    else if (cards[name].type !== RESERVED_CARDS[name].type) bad(`${name}: must have type ${RESERVED_CARDS[name].type}`);
  }
  for (const [name, c] of Object.entries(cards)) {
    const reservedType = RESERVED_NAMES.find((n) => RESERVED_CARDS[n].type === c.type);
    if (reservedType && name !== reservedType) bad(`${name}: only the card named "${reservedType}" may have type ${c.type}`);
    if (!KEBAB.test(name)) bad(`${name}: card id must be kebab-case`);
    if (!STAGES.includes(c.stage)) bad(`${name}: unknown stage "${c.stage}"`);
    if (!CARD_TYPES.includes(c.type)) bad(`${name}: unknown type "${c.type}"`);
    if (!Array.isArray(c.depends_on)) bad(`${name}: depends_on must be a list`);
    if (c.type === 'feature' && !c.plugin) bad(`${name}: a feature card needs a plugin id`);
    if (c.type === 'starter-gap' && c.stage !== 'Backlog') bad(`${name}: a starter-gap card never leaves Backlog`);
    if (!Array.isArray(c.history) || c.history.length === 0) bad(`${name}: history is empty`);
    else if (c.history.at(-1).stage !== c.stage) bad(`${name}: last history entry (${c.history.at(-1).stage}) does not match stage (${c.stage})`);
    graph[name] = Array.isArray(c.depends_on) ? c.depends_on : [];
  }
  if (backlog.status === 'placeholder') {
    for (const name of Object.keys(cards)) if (!RESERVED_NAMES.includes(name)) bad(`${name}: a placeholder backlog holds only the reserved cards`);
  }
  for (const [n, deps] of Object.entries(graph)) {
    for (const d of deps) if (!(d in cards)) bad(`${n}: depends_on "${d}" is not a card`);
  }
  const cycle = findCycle(graph);
  if (cycle) bad(`depends_on has a cycle: ${cycle.join(' → ')}`);
  else {
    const reaches = (n, target, seen = new Set()) => n === target || (!seen.has(n) && seen.add(n) && (graph[n] ?? []).some((d) => reaches(d, target, seen)));
    for (const [n, c] of Object.entries(cards)) {
      if (['feature', 'config'].includes(c.type) && !['bootstrap', 'branding'].every((t) => reaches(n, t))) bad(`${n}: must depend (even transitively) on the bootstrap and branding cards`);
    }
    if (backlog.order !== undefined) {
      const order = backlog.order;
      if (!Array.isArray(order) || order.length !== Object.keys(cards).length || new Set(order).size !== order.length || !order.every((n) => n in cards)) bad('order must list every card exactly once');
      else order.forEach((n, i) => { for (const d of graph[n] ?? []) if (order.indexOf(d) > i) bad(`order: ${n} comes before its dependency ${d}`); });
    }
  }
  return errors;
}

/** Backlog cards that may start: dependencies Review Passed or Done (rules/transitions.md); an upgrade also waits for work in progress. */
export function unblockedCards(backlog) {
  const done = new Set(['Review Passed', 'Done']);
  const busy = Object.values(backlog.cards).some((c) => IN_PROGRESS.includes(c.stage));
  const names = backlog.order ?? Object.keys(backlog.cards);
  return names
    .filter((name) => backlog.cards[name])
    .filter((name) => {
      const c = backlog.cards[name];
      if (c.stage !== 'Backlog' || c.type === 'starter-gap') return false;
      if (c.type === 'upgrade' && busy) return false;
      return c.depends_on.every((d) => done.has(backlog.cards[d]?.stage));
    });
}

/** The card ship runs next: the first unblocked card in the backlog's order. */
export const nextCard = (backlog) => unblockedCards(backlog)[0] ?? null;

export function moveCard(backlog, name, stage, now = new Date().toISOString()) {
  const c = backlog.cards[name];
  if (!c) throw new Error(`no card ${name}`);
  if (!STAGES.includes(stage)) throw new Error(`unknown stage "${stage}"`);
  if (c.type === 'starter-gap') throw new Error('a starter-gap card never leaves Backlog');
  const from = STAGES.indexOf(c.stage);
  const to = STAGES.indexOf(stage);
  const direct = stage === 'Done' && c.stage === 'Backlog' && DIRECT_DONE.includes(name);
  if (!direct && to !== from + 1) throw new Error(`${name}: ${c.stage} → ${stage} is not the next stage`);
  c.stage = stage;
  c.history.push({ stage, at: now });
  backlog.updated_at = now;
  return backlog;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** A starter bump as a card: the plugin offers it when the starter's HEAD is past the recorded pin. */
export function addUpgrade(backlog, ref, now = new Date().toISOString()) {
  const name = `upgrade-${slug(ref)}`;
  if (!slug(ref)) throw new Error('upgrade needs a ref');
  if (backlog.cards[name]) return backlog;
  backlog.cards[name] = card('upgrade', [], null, ['type:upgrade'], now, { target_ref: ref });
  backlog.order = orderCards(backlog.cards);
  backlog.updated_at = now;
  return backlog;
}

/** A defect in the starter's own code, found while building: an extension request that never leaves Backlog. */
export function addGap(backlog, title, evidence, now = new Date().toISOString()) {
  const name = `gap-${slug(title)}`;
  if (!slug(title)) throw new Error('a gap needs a title');
  if (backlog.cards[name]) return backlog;
  backlog.cards[name] = card('starter-gap', [], null, ['type:starter-gap'], now, { evidence });
  backlog.order = orderCards(backlog.cards);
  backlog.updated_at = now;
  return backlog;
}
