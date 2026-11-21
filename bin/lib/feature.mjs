// Feature spec (.jairus/features/<f>/spec.json): checks, build traceability and rendering.
// It holds only what the starter cannot: the acceptance criteria and their traceability, the
// Extension plan (which contribution points the feature uses and in which files), extension
// requests, and the security decisions of each entry point. Naming rules, table classes, RLS and
// the rest are the starter's: definePlugin / composePlugins / db:setup / pnpm gate:core enforce them
// when the code exists. Narrative stays in PRD.md, DESIGN.md and ADR.md.
import { RESERVED_PLUGIN_IDS } from './jairus.mjs';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Contribution points an Extension plan row may name. The first group is the `definePlugin`
 * contribution fields of @jairus/plugin-kit (plugins/README.md → What a plugin contributes); the
 * rest are the product-zone places a feature may also touch.
 */
export const PLUGIN_KIT_POINTS = ['permissions', 'nav', 'tables', 'migrations', 'emails', 'jobs', 'on', 'env', 'audit', 'orgActions', 'roles', 'repos', 'features'];
export const CONTRIBUTION_POINTS = [...PLUGIN_KIT_POINTS, 'code', 'branding', 'route', 'cli'];
const ENTRY_KINDS = ['server-action', 'route-handler', 'read'];

const isList = (v) => Array.isArray(v);

/**
 * Problems in a feature spec. Options: `final` (the Gate 3 facts; status approved implies it) and
 * `card` ({name, plugin} from INTENT.md: the spec must agree with it).
 */
export function checkFeatureSpec(spec, { final = false, card = null } = {}) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (spec?.schema_version !== 1) bad('schema_version must be 1');
  if (typeof spec?.feature !== 'string' || !KEBAB.test(spec.feature)) bad('feature must be kebab-case');
  const plugin = spec?.plugin ?? null;
  if (plugin !== null && (typeof plugin !== 'string' || !KEBAB.test(plugin))) bad('plugin must be kebab-case or null');
  if (plugin && RESERVED_PLUGIN_IDS.includes(plugin)) bad(`plugin "${plugin}" is a core namespace`);
  if (!['draft', 'approved'].includes(spec?.status)) bad('status must be draft or approved');
  if (card) {
    if (card.name && spec?.feature !== card.name) bad(`feature "${spec?.feature}" is not the card "${card.name}"`);
    if ((card.plugin ?? null) !== plugin) bad(`plugin "${plugin}" differs from the card's plugin "${card.plugin ?? null}"`);
  }
  const isFinal = final || spec?.status === 'approved';

  // acceptance criteria
  const acs = isList(spec?.acceptance_criteria) ? spec.acceptance_criteria : [];
  if (!isList(spec?.acceptance_criteria)) bad('acceptance_criteria must be a list');
  if (isFinal && acs.length === 0) bad('acceptance_criteria needs at least one entry');
  const acIds = new Set();
  for (const a of acs) {
    if (!/^AC-\d+$/.test(a?.id ?? '')) bad(`acceptance criterion id "${a?.id}" must look like AC-1`);
    else if (acIds.has(a.id)) bad(`duplicate acceptance criterion ${a.id}`);
    else acIds.add(a.id);
    if (!a?.text || /\{\{/.test(a.text)) bad(`${a?.id}: text is empty or a placeholder`);
  }

  // extension plan
  const plan = spec?.extension_plan;
  const rows = isList(plan?.rows) ? plan.rows : [];
  if (!plan || typeof plan !== 'object') bad('extension_plan is required');
  else {
    if ((plan.plugin ?? null) !== plugin) bad(`extension_plan.plugin must equal plugin (${plugin})`);
    if (!isList(plan.rows)) bad('extension_plan.rows must be a list');
    if (isFinal && rows.length === 0) bad('extension_plan.rows needs at least one entry');
    for (const [i, r] of rows.entries()) {
      const at = `extension_plan.rows[${i}]`;
      if (!r?.change || /\{\{/.test(r.change)) bad(`${at}: change is empty or a placeholder`);
      if (!CONTRIBUTION_POINTS.includes(r?.point)) bad(`${at}: point "${r?.point}" is not a contribution point (${CONTRIBUTION_POINTS.join(', ')})`);
      if (!isList(r?.files) || r.files.length === 0) bad(`${at}: files needs at least one project-relative path`);
      else {
        for (const f of r.files) {
          if (typeof f !== 'string' || f.startsWith('/') || f.includes('..')) bad(`${at}: file "${f}" must be project-relative`);
          else if (f.startsWith('packages/')) bad(`${at}: "${f}" is under packages/* — the core is read only (record an extension request instead)`);
        }
      }
      if (!isList(r?.read) || r.read.length === 0) bad(`${at}: read needs the starter README or doc consulted`);
      if (plugin === null && r?.point !== 'branding') bad(`${at}: a config card may only change branding, not "${r?.point}"`);
    }
    if (!isList(plan.requests)) bad('extension_plan.requests must be a list (empty when none)');
    else for (const [i, q] of plan.requests.entries()) if (!q?.need || !q?.why) bad(`extension_plan.requests[${i}] needs "need" and "why"`);
  }

  // entry points: the guard and the audit write are the security decisions the design review blocks on
  const entries = isList(spec?.entry_points) ? spec.entry_points : [];
  if (spec?.entry_points !== undefined && !isList(spec.entry_points)) bad('entry_points must be a list');
  if (plugin === null && entries.length) bad('a config card has no entry points');
  if (entries.length && !rows.some((r) => r?.point === 'route')) bad('entry points live in route files: extension_plan.rows needs a "route" row');
  for (const e of entries) {
    const at = `entry point ${e?.name}`;
    if (!e?.name) bad('every entry point needs a name');
    if (!ENTRY_KINDS.includes(e?.kind)) bad(`${at}: kind must be ${ENTRY_KINDS.join(' | ')}`);
    if (!e?.path) bad(`${at}: path is required`);
    if (!e?.guard) bad(`${at}: guard is required (org guard + action, user guard, permission, staff, public or webhook signature)`);
    if (e?.kind === 'server-action' && !e?.audit) bad(`${at}: audit is required (a mutation without its audit write is a BLOCKER)`);
  }
  return errors;
}

/** AC traceability after develop: file:line markers, tests naming the criterion, planned files, against a project root. */
export function checkFeatureBuilt(spec, root, fs, path) {
  const errors = [];
  const at = (rel) => path.join(root, ...rel.split('/'));
  const read = (rel) => { try { return fs.readFileSync(at(rel), 'utf8'); } catch { return null; } };
  for (const a of spec.acceptance_criteria ?? []) {
    const m = /^(.+):(\d+)$/.exec(a.implemented_at ?? '');
    if (!m) errors.push(`${a.id}: implemented_at must be <file>:<line>`);
    else {
      const text = read(m[1]);
      if (text === null) errors.push(`${a.id}: implemented_at file ${m[1]} does not exist`);
      else {
        const lines = text.split(/\r?\n/);
        const n = Number(m[2]);
        if (!(lines[n - 1] ?? '').includes(a.id) && !(lines[n - 2] ?? '').includes(a.id)) errors.push(`${a.id}: no "// ${a.id}" marker on or above ${m[1]}:${n}`);
      }
    }
    if (!a.test_at) errors.push(`${a.id}: test_at is required`);
    else {
      const f = String(a.test_at).replace(/:\d+$/, '');
      const text = read(f);
      if (text === null) errors.push(`${a.id}: test file ${f} does not exist`);
      else if (!text.includes(a.id)) errors.push(`${a.id}: test file ${f} never mentions ${a.id} (name the test after the criterion)`);
    }
  }
  for (const r of spec.extension_plan?.rows ?? []) {
    for (const f of r.files ?? []) if (!fs.existsSync(at(f))) errors.push(`extension plan file ${f} does not exist`);
  }
  return errors;
}

/** Markdown for an issue or PR body, generated from a spec (no agent re-summarising prose). */
export function renderFeature(spec) {
  const out = [];
  out.push(`## ${spec.feature}${spec.plugin ? ` · plugin \`${spec.plugin}\`` : ' · config'}`);
  out.push('', '### Acceptance criteria');
  for (const a of spec.acceptance_criteria ?? []) {
    const done = a.implemented_at && a.test_at;
    out.push(`- [${done ? 'x' : ' '}] **${a.id}** ${a.text}${done ? ` — \`${a.implemented_at}\` · test \`${a.test_at}\`` : ''}`);
  }
  out.push('', '### Extension plan', '| Change | Point | Files |', '|---|---|---|');
  for (const r of spec.extension_plan?.rows ?? []) out.push(`| ${r.change} | ${r.point} | ${(r.files ?? []).map((f) => `\`${f}\``).join('<br>')} |`);
  if ((spec.extension_plan?.requests ?? []).length) {
    out.push('', '**Extension requests (`starter-gap`):**');
    for (const q of spec.extension_plan.requests) out.push(`- ${q.need} — ${q.why}`);
  }
  if ((spec.entry_points ?? []).length) {
    out.push('', '### Entry points', '| Name | Kind | Guard | Audit |', '|---|---|---|---|');
    for (const e of spec.entry_points) out.push(`| ${e.name} | ${e.kind} | ${e.guard} | ${e.audit ?? '—'} |`);
  }
  return out.join('\n') + '\n';
}
