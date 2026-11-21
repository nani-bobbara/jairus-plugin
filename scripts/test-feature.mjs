// Tests for the feature spec tools (bin/lib/feature.mjs, check-feature, render-feature).
// Run through scripts/test-bin.mjs, which imports this file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRIBUTION_POINTS, PLUGIN_KIT_POINTS, checkFeatureBuilt, checkFeatureSpec, renderFeature } from '../bin/lib/feature.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name, ...args) => spawnSync(process.execPath, [path.join(root, 'bin', name), ...args], { encoding: 'utf8' });
const clone = (o) => JSON.parse(JSON.stringify(o));

const GOOD = {
  schema_version: 1,
  feature: 'item-create',
  plugin: 'example',
  status: 'approved',
  acceptance_criteria: [{ id: 'AC-1', text: 'Given a member, when they save, then the item is stored', implemented_at: null, test_at: null }],
  extension_plan: {
    plugin: 'example',
    rows: [
      { change: 'domain and use-cases', point: 'code', files: ['plugins/example/src/application/'], read: ['plugins/README.md'] },
      { change: 'item table', point: 'tables', files: ['plugins/example/src/manifest.ts'], read: ['plugins/README.md'] },
      { change: 'page and action', point: 'route', files: ['apps/portal/src/app/(workspace)/items/actions.ts'], read: ['README.md'] },
    ],
    requests: [],
  },
  entry_points: [{ name: 'createItem', kind: 'server-action', path: 'apps/portal/src/app/(workspace)/items/actions.ts', guard: 'org guard + example:write', audit: 'example.item_created' }],
};
const problems = (mutate, opts) => { const s = clone(GOOD); mutate(s); return checkFeatureSpec(s, opts); };
const has = (errs, needle) => errs.some((e) => e.includes(needle));

test('a complete spec passes; the points are the starter\'s contribution kinds plus four product-zone places', () => {
  assert.deepEqual(checkFeatureSpec(GOOD), []);
  assert.deepEqual(PLUGIN_KIT_POINTS, ['permissions', 'nav', 'tables', 'migrations', 'emails', 'jobs', 'on', 'env', 'audit', 'orgActions', 'roles', 'repos', 'features']);
  assert.deepEqual(CONTRIBUTION_POINTS.slice(PLUGIN_KIT_POINTS.length), ['code', 'branding', 'route', 'cli']);
});

test('only process facts are checked; the starter owns naming, classes and RLS', () => {
  assert.ok(has(problems((s) => { s.schema_version = 2; }), 'schema_version'));
  assert.ok(has(problems((s) => { s.plugin = 'billing'; s.extension_plan.plugin = 'billing'; }), 'core namespace'));
  assert.ok(has(problems((s) => { s.acceptance_criteria.push({ id: 'AC-1', text: 'dup' }); }), 'duplicate'));
  assert.ok(has(problems((s) => { s.acceptance_criteria[0].text = '{{outcome}}'; }), 'placeholder'));
  // no naming regexes of ours: an unusual name is the starter's to reject when definePlugin runs
  assert.deepEqual(problems((s) => { s.entry_points[0].audit = 'whatever.name_here'; }), []);
});

test('the core is closed and the plan uses known contribution points', () => {
  assert.ok(has(problems((s) => { s.extension_plan.rows[0].files = ['packages/domain/src/x.ts']; }), 'core is read only'));
  assert.ok(has(problems((s) => { s.extension_plan.rows[0].point = 'core-edit'; }), 'not a contribution point'));
  assert.ok(has(problems((s) => { s.extension_plan.rows[0].files = ['../escape.ts']; }), 'project-relative'));
  assert.ok(has(problems((s) => { s.extension_plan.rows[0].read = []; }), 'read needs'));
  assert.ok(has(problems((s) => { s.extension_plan.requests = [{ need: 'AI provider' }]; }), 'needs "need" and "why"'));
  assert.deepEqual(problems((s) => { s.extension_plan.requests = [{ need: 'AI provider', why: 'no vendor port in the core' }]; }), []);
});

test('entry points need a guard, mutations need an audit, and they need a route row', () => {
  assert.ok(has(problems((s) => { s.entry_points[0].guard = ''; }), 'guard is required'));
  assert.ok(has(problems((s) => { s.entry_points[0].audit = ''; }), 'audit is required'));
  assert.ok(has(problems((s) => { s.extension_plan.rows = s.extension_plan.rows.filter((r) => r.point !== 'route'); }), '"route" row'));
  assert.deepEqual(problems((s) => { s.entry_points.push({ name: 'listItems', kind: 'read', path: 'x', guard: 'org guard' }); }), []);
  assert.ok(has(problems((s) => { s.entry_points[0].kind = 'rpc'; }), 'kind must be'));
});

test('a draft may be incomplete, an approved spec may not; a config card only touches branding', () => {
  const draft = { schema_version: 1, feature: 'a', plugin: 'x', status: 'draft', acceptance_criteria: [], extension_plan: { plugin: 'x', rows: [], requests: [] } };
  assert.deepEqual(checkFeatureSpec(draft), []);
  assert.ok(has(checkFeatureSpec(draft, { final: true }), 'acceptance_criteria needs'));
  const config = { schema_version: 1, feature: 'plans', plugin: null, status: 'approved', acceptance_criteria: [{ id: 'AC-1', text: 'Plans exist' }], extension_plan: { plugin: null, rows: [{ change: 'plans', point: 'branding', files: ['branding/src/plans.ts'], read: ['branding/README.md'] }], requests: [] } };
  assert.deepEqual(checkFeatureSpec(config), []);
  config.extension_plan.rows[0].point = 'tables';
  assert.ok(has(checkFeatureSpec(config), 'may only change branding'));
  config.extension_plan.rows[0].point = 'branding';
  config.entry_points = [{ name: 'x', kind: 'read', path: 'p', guard: 'g' }];
  assert.ok(has(checkFeatureSpec(config), 'no entry points'));
});

test('the spec must agree with its INTENT card', () => {
  assert.ok(has(checkFeatureSpec(GOOD, { card: { name: 'item-create', plugin: 'scheduling' } }), 'differs from the card'));
  assert.ok(has(checkFeatureSpec(GOOD, { card: { name: 'other', plugin: 'example' } }), 'is not the card'));
  assert.deepEqual(checkFeatureSpec(GOOD, { card: { name: 'item-create', plugin: 'example' } }), []);
});

test('AC traceability after develop is checked against the project files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-feat-'));
  const w = (rel, text) => { const f = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  w('plugins/example/src/application/create.ts', '// AC-1: members can save\nexport async function createItem() {}\n');
  w('plugins/example/src/application/create.test.ts', "it('AC-1 stores the item', () => {})\n");
  w('plugins/example/src/manifest.ts', 'x');
  w('apps/portal/src/app/(workspace)/items/actions.ts', 'x');
  const built = clone(GOOD);
  built.acceptance_criteria[0].implemented_at = 'plugins/example/src/application/create.ts:2';
  built.acceptance_criteria[0].test_at = 'plugins/example/src/application/create.test.ts:1';
  assert.deepEqual(checkFeatureBuilt(built, dir, fs, path), []);

  const noMarker = clone(built); noMarker.acceptance_criteria[0].implemented_at = 'plugins/example/src/application/create.ts:9';
  assert.ok(has(checkFeatureBuilt(noMarker, dir, fs, path), 'no "// AC-1" marker'));
  w('plugins/example/src/application/create.test.ts', "it('stores the item', () => {})\n");
  assert.ok(has(checkFeatureBuilt(built, dir, fs, path), 'never mentions AC-1'));
  assert.ok(has(checkFeatureBuilt(clone(GOOD), dir, fs, path), 'implemented_at must be'));
  fs.rmSync(path.join(dir, 'plugins/example/src/manifest.ts'));
  assert.ok(has(checkFeatureBuilt(built, dir, fs, path), 'does not exist'));
});

test('render produces a deterministic body from the facts', () => {
  const md = renderFeature(GOOD);
  assert.match(md, /^## item-create · plugin `example`/);
  assert.match(md, /- \[ \] \*\*AC-1\*\* Given a member/);
  assert.match(md, /\| item table \| tables \|/);
  assert.match(md, /\| createItem \| server-action \| org guard \+ example:write \| example\.item_created \|/);
  assert.equal(renderFeature(GOOD), md);
});

test('CLI: check-feature and render-feature', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-featcli-'));
  const specFile = path.join(dir, 'spec.json');
  fs.writeFileSync(specFile, JSON.stringify(GOOD));
  assert.equal(bin('check-feature.mjs', specFile, '--final').status, 0);
  const intent = path.join(dir, 'INTENT.md');
  fs.writeFileSync(intent, '---\nschema_version: "3.0"\nfeatures:\n  - name: item-create\n    plugin: example\n    type: feature\n---\n');
  assert.equal(bin('check-feature.mjs', specFile, '--intent', intent).status, 0);
  fs.writeFileSync(intent, '---\nschema_version: "3.0"\nfeatures:\n  - name: item-create\n    plugin: scheduling\n    type: feature\n---\n');
  assert.equal(bin('check-feature.mjs', specFile, '--intent', intent).status, 1);
  const bad = clone(GOOD); bad.extension_plan.rows[0].files = ['packages/application/src/x.ts'];
  fs.writeFileSync(specFile, JSON.stringify(bad));
  const r = bin('check-feature.mjs', specFile);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL .*core is read only/);
  assert.equal(bin('check-feature.mjs', specFile, '--built').status, 2); // --built needs --root
  fs.writeFileSync(specFile, JSON.stringify(GOOD));
  const out = bin('render-feature.mjs', specFile);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /### Extension plan/);
});

test('the shipped spec.json template fails while unfilled and passes once its placeholders are filled', () => {
  const raw = fs.readFileSync(path.join(root, 'templates', 'feature', 'spec.json'), 'utf8');
  const tpl = JSON.parse(raw);
  assert.equal(tpl.schema_version, 1);
  const unfilled = checkFeatureSpec(tpl);
  assert.ok(has(unfilled, 'placeholder'), 'placeholders must be reported');
  assert.ok(has(unfilled, 'plugin must be kebab-case'), 'an unfilled plugin id must be reported');
  const fill = { feature: 'item-create', plugin: 'example', entity: 'item', Feature: 'ItemCreate' };
  const filled = raw.replace(/\{\{([^}]*)\}\}/g, (_, key) => fill[key.trim()] ?? 'filled in');
  const spec = JSON.parse(filled);
  spec.status = 'approved';
  assert.deepEqual(checkFeatureSpec(spec), []);
  for (const r of tpl.extension_plan.rows) assert.ok(CONTRIBUTION_POINTS.includes(r.point), `template row point ${r.point}`);
});
