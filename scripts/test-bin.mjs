#!/usr/bin/env node
// Tests for the plugin's deterministic scripts in bin/ (dependency-free; Node >= 20).
//   node scripts/test-bin.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAGES, addGap, addUpgrade, checkBacklog, checkIntent, fillBacklog, makeBacklog, moveCard, nextCard, parseIntent, parseYaml, placeholderBacklog, unblockedCards } from '../bin/lib/jairus.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name, ...args) => spawnSync(process.execPath, [path.join(root, 'bin', name), ...args], { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-test-'));

const INTENT = (features) => `---
schema_version: "3.0"
project_name: acme-notes          # a comment
display_name: "Acme Notes"
one_liner: Notes for teams
status: draft
mode: dev
backend: neon
features:
${features}
---

# Product Intent
`;
const F = (name, extra = '') => `  - name: ${name}
    display_name: ${name}
    description: "Does ${name}."
    out_of_scope: [nothing else]
    type: feature
    plugin: notes
    plan: all
    depends_on: []
${extra}`;

test('parseYaml handles maps, lists, flow lists, quotes and comments', () => {
  const y = parseYaml('a: 1  # c\nb: "x # not a comment"\nc: [p, "q, r"]\nd:\n  - e: 1\n    f: [ ]\n  - g\n');
  assert.deepEqual(y, { a: '1', b: 'x # not a comment', c: ['p', 'q, r'], d: [{ e: '1', f: [] }, 'g'] });
});

// moves a card forward one stage at a time, as the build commands will
const walk = (b, name, stage) => { while (b.cards[name].stage !== stage) moveCard(b, name, STAGES[STAGES.indexOf(b.cards[name].stage) + 1]); };

test('a valid intent passes the final check and yields cards', () => {
  const intent = parseIntent(INTENT(`${F('notes')}${F('sharing').replace('depends_on: []', 'depends_on: [notes]')}`));
  assert.deepEqual(checkIntent(intent, { final: true }), []);
  const b = makeBacklog(intent, '2026-01-01T00:00:00Z');
  assert.deepEqual(b.order, ['bootstrap', 'environment', 'branding', 'notes', 'sharing'], 'reserved cards first, then the features in dependency order');
  assert.equal(b.status, 'approved');
  assert.equal(b.cards.sharing.plugin, 'notes');
  assert.deepEqual(b.cards.notes.depends_on, ['bootstrap', 'branding']);
  assert.deepEqual(b.cards.environment.depends_on, ['bootstrap']);
  assert.deepEqual(checkBacklog(b), []);
  assert.deepEqual(unblockedCards(b), ['bootstrap'], 'only the bootstrap card is unblocked at first');
  moveCard(b, 'bootstrap', 'Done');
  assert.deepEqual(unblockedCards(b), ['environment', 'branding']);
  assert.equal(nextCard(b), 'environment');
  walk(b, 'branding', 'Review Passed');
  assert.deepEqual(unblockedCards(b), ['environment', 'notes']);
  assert.throws(() => moveCard(b, 'notes', 'Review'), /not the next stage/);
  assert.throws(() => moveCard(b, 'notes', 'Done'), /not the next stage/);
  const skipped = structuredClone(b);
  skipped.cards.notes.depends_on = [];
  assert.ok(checkBacklog(skipped).some((e) => e.includes('bootstrap and branding')));
  delete skipped.cards.bootstrap;
  assert.ok(checkBacklog(skipped).some((e) => e.includes('no bootstrap card')));
  for (const name of ['bootstrap', 'environment', 'branding', 'upgrade-x', 'gap-y']) assert.ok(checkIntent(parseIntent(INTENT(F(name)))).some((e) => e.includes('reserved')), name);
});

test('the placeholder holds only the reserved cards, board fills it, and a rerun adds only what is missing', () => {
  const p = placeholderBacklog('2026-01-01T00:00:00Z');
  assert.equal(p.status, 'placeholder');
  assert.deepEqual(Object.keys(p.cards), ['bootstrap', 'environment', 'branding']);
  assert.deepEqual(checkBacklog(p), []);
  assert.deepEqual(unblockedCards(p), ['bootstrap']);
  p.cards.stray = structuredClone(p.cards.bootstrap);
  p.cards.stray.type = 'feature';
  p.cards.stray.plugin = 'x';
  assert.ok(checkBacklog(p).some((e) => e.includes('placeholder')));
  const intent = parseIntent(INTENT(F('notes')));
  const filled = fillBacklog(placeholderBacklog('2026-01-01T00:00:00Z'), intent, '2026-01-02T00:00:00Z');
  moveCard(filled, 'bootstrap', 'Done', '2026-01-03T00:00:00Z');
  const more = fillBacklog(filled, parseIntent(INTENT(`${F('notes')}${F('extra')}`)), '2026-01-04T00:00:00Z');
  assert.deepEqual(more.order.slice(-2), ['notes', 'extra']);
  assert.equal(more.cards.bootstrap.stage, 'Done', 'existing cards are never changed');
  assert.equal(more.cards.notes.history.length, 1);
});

test('upgrade and starter-gap cards: an upgrade waits for work in progress, a gap never leaves Backlog', () => {
  const b = makeBacklog(parseIntent(INTENT(F('notes'))), '2026-01-01T00:00:00Z');
  moveCard(b, 'bootstrap', 'Done');
  walk(b, 'branding', 'Review Passed');
  addUpgrade(b, 'v1.4.0');
  assert.ok(b.cards['upgrade-v1-4-0']);
  assert.ok(unblockedCards(b).includes('upgrade-v1-4-0'));
  moveCard(b, 'notes', 'Design');
  assert.ok(!unblockedCards(b).includes('upgrade-v1-4-0'), 'no upgrade while a card is in progress');
  addGap(b, 'Portal lint fails on a test file', 'pnpm gate:core portal#lint');
  assert.ok(b.cards['gap-portal-lint-fails-on-a-test-file']);
  assert.throws(() => moveCard(b, 'gap-portal-lint-fails-on-a-test-file', 'Design'), /never leaves Backlog/);
  assert.deepEqual(checkBacklog(b), []);
  assert.equal(checkBacklog({ ...b, order: ['notes'] }).filter((e) => e.includes('order')).length, 1);
});

test('backlog problems are reported', () => {
  const b = { schema_version: 1, cards: { a: { stage: 'Nope', type: 'feature', plugin: 'x', depends_on: ['z'], history: [{ stage: 'Backlog' }] } } };
  const errs = checkBacklog(b);
  assert.ok(errs.some((e) => e.includes('unknown stage')));
  assert.ok(errs.some((e) => e.includes('"z"')));
  assert.ok(errs.some((e) => e.includes('does not match')));
  assert.ok(errs.some((e) => e.includes('no bootstrap card')));
});

test('CLI: check-intent, make-backlog (placeholder, then fill), validate-backlog, backlog', () => {
  const dir = tmp();
  const intentFile = path.join(dir, 'INTENT.md');
  fs.writeFileSync(intentFile, INTENT(F('notes')));
  assert.equal(bin('check-intent.mjs', intentFile, '--final').status, 0);
  const out = path.join(dir, 'product-backlog.json');
  assert.equal(bin('make-backlog.mjs', '--placeholder', '--out', out).status, 0);
  assert.equal(bin('make-backlog.mjs', '--placeholder', '--out', out).status, 1, 'never replaces an existing backlog');
  assert.match(bin('validate-backlog.mjs', out, '--unblocked').stdout, /OK 3 cards \(placeholder\)/);
  const dry = bin('make-backlog.mjs', intentFile, '--out', out, '--dry-run');
  assert.equal(dry.status, 0, dry.stdout);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).status, 'placeholder', 'a dry run writes nothing');
  const made = bin('make-backlog.mjs', intentFile, '--out', out);
  assert.equal(made.status, 0, made.stdout);
  assert.match(made.stdout, /notes/);
  const v = bin('validate-backlog.mjs', out, '--unblocked');
  assert.equal(v.status, 0);
  assert.match(v.stdout, /UNBLOCKED bootstrap/);
  assert.ok(!/UNBLOCKED notes/.test(v.stdout));
  assert.match(bin('backlog.mjs', out, 'next').stdout, /NEXT bootstrap/);
  assert.equal(bin('backlog.mjs', out, 'move', 'notes', 'Done').status, 1);
  assert.equal(bin('backlog.mjs', out, 'move', 'bootstrap', 'Done').status, 0);
  assert.match(bin('backlog.mjs', out, 'next').stdout, /NEXT environment/);
  assert.equal(bin('backlog.mjs', out, 'gap', 'Lint fails', '--evidence', 'gate:core').status, 0);
  assert.equal(bin('backlog.mjs', out, 'upgrade', 'main').status, 0);
  assert.equal(bin('validate-backlog.mjs', out).status, 0);
  fs.writeFileSync(intentFile, INTENT(F('a').replace('out_of_scope: [nothing else]', 'out_of_scope: []')));
  assert.equal(bin('check-intent.mjs', intentFile, '--final').status, 1);
  assert.equal(bin('make-backlog.mjs', intentFile, '--out', path.join(dir, 'x.json')).status, 1); // refuses a non-final intent
});

test('intent problems are reported', () => {
  const cyc = parseIntent(INTENT(`${F('a').replace('depends_on: []', 'depends_on: [b]')}${F('b').replace('depends_on: []', 'depends_on: [a]')}`));
  assert.ok(checkIntent(cyc).some((e) => e.includes('cycle')));
  const reserved = parseIntent(INTENT(F('a').replace('plugin: notes', 'plugin: billing')));
  assert.ok(checkIntent(reserved).some((e) => e.includes('core namespace')));
  const noScope = parseIntent(INTENT(F('a').replace('out_of_scope: [nothing else]', 'out_of_scope: []')));
  assert.deepEqual(checkIntent(noScope), []); // a draft is structural only
  assert.ok(checkIntent(noScope, { final: true }).some((e) => e.includes('out_of_scope')));
  const missingDep = parseIntent(INTENT(F('a').replace('depends_on: []', 'depends_on: [ghost]')));
  assert.ok(checkIntent(missingDep).some((e) => e.includes('ghost')));
  const config = parseIntent(INTENT(F('plans').replace('type: feature', 'type: config')));
  assert.ok(checkIntent(config).some((e) => e.includes('no plugin')));
});

test('CLI: copy-starter copies tracked + untracked files, skips dev-tools and ignored files, reports sha and dirty', () => {
  const dir = tmp();
  const starter = path.join(dir, 'jairus-starter');
  const sh = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  fs.mkdirSync(path.join(starter, 'dev-tools'), { recursive: true });
  fs.mkdirSync(path.join(starter, 'apps', 'portal'), { recursive: true });
  fs.mkdirSync(path.join(starter, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(starter, 'package.json'), JSON.stringify({ name: 'jairus-starter' }));
  fs.writeFileSync(path.join(starter, '.gitignore'), 'node_modules\n.env.local\n');
  fs.writeFileSync(path.join(starter, 'dev-tools', 'x.md'), 'x');
  fs.writeFileSync(path.join(starter, 'apps', 'portal', 'a.ts'), 'a');
  fs.writeFileSync(path.join(starter, 'gone.txt'), 'g');
  fs.writeFileSync(path.join(starter, 'node_modules', 'x', 'i.js'), 'i');
  sh(starter, 'init', '-q');
  sh(starter, 'add', '-A');
  sh(starter, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  fs.rmSync(path.join(starter, 'gone.txt')); // tracked, deleted in the tree
  fs.writeFileSync(path.join(starter, 'untracked.txt'), 'u');
  fs.writeFileSync(path.join(starter, '.env.local'), 'SECRET=1'); // ignored: never copied

  const dest = path.join(dir, 'product');
  const r = bin('copy-starter.mjs', '--starter', starter, '--dest', dest);
  assert.equal(r.status, 0, r.stderr);
  const info = JSON.parse(r.stdout);
  assert.equal(info.source, 'local');
  assert.equal(info.dirty, true);
  assert.match(info.sha, /^[0-9a-f]{40}$/);
  const has = (f) => fs.existsSync(path.join(dest, ...f.split('/')));
  assert.ok(has('package.json') && has('apps/portal/a.ts') && has('untracked.txt'));
  assert.ok(!has('dev-tools/x.md') && !has('node_modules/x/i.js') && !has('gone.txt') && !has('.env.local'));
  assert.ok(has('.git'));
  assert.equal(sh(dest, 'symbolic-ref', '--short', 'HEAD').stdout.trim(), 'main');
  assert.equal(bin('copy-starter.mjs', '--starter', starter, '--dest', dest).status, 1); // non-empty destination
  fs.writeFileSync(path.join(starter, 'package.json'), JSON.stringify({ name: 'other' }));
  assert.equal(bin('copy-starter.mjs', '--starter', starter, '--dest', path.join(dir, 'p2')).status, 1); // not a starter
});

test('CLI: copy-starter in place keeps the seed files and refuses foreign content', () => {
  const dir = tmp();
  const starter = path.join(dir, 'jairus-starter');
  const sh = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  fs.mkdirSync(starter, { recursive: true });
  fs.writeFileSync(path.join(starter, 'package.json'), JSON.stringify({ name: 'jairus-starter' }));
  fs.writeFileSync(path.join(starter, 'README.md'), 'starter readme');
  sh(starter, 'init', '-q'); sh(starter, 'add', '-A');
  sh(starter, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');

  const ws = path.join(dir, 'workspace');
  fs.mkdirSync(path.join(ws, '.jairus'), { recursive: true });
  fs.writeFileSync(path.join(ws, '.jairus', 'INTENT.md'), 'seed');
  fs.writeFileSync(path.join(ws, '.jairus', 'jairus.json'), '{}');
  fs.writeFileSync(path.join(ws, 'README.md'), 'mine');
  const keep = '.jairus,.mcp.json,README.md';
  const r = bin('copy-starter.mjs', '--starter', starter, '--dest', ws, '--keep', keep);
  assert.equal(r.status, 0, r.stderr);
  const info = JSON.parse(r.stdout);
  assert.deepEqual(info.skipped, ['README.md']);
  assert.equal(fs.readFileSync(path.join(ws, 'README.md'), 'utf8'), 'mine');
  assert.equal(fs.readFileSync(path.join(ws, '.jairus', 'INTENT.md'), 'utf8'), 'seed');
  assert.ok(fs.existsSync(path.join(ws, 'package.json')) && fs.existsSync(path.join(ws, '.git')));

  const busy = path.join(dir, 'busy');
  fs.mkdirSync(busy);
  fs.writeFileSync(path.join(busy, 'something.txt'), 'x');
  assert.equal(bin('copy-starter.mjs', '--starter', starter, '--dest', busy, '--keep', keep).status, 1);
});

import './test-feature.mjs';
import './test-doctor.mjs';
import './test-requirements.mjs';
import './test-state.mjs';
