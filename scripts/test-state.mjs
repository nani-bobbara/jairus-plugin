// Tests for the state tool (bin/state.mjs, bin/lib/state.mjs). Run through scripts/test-bin.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { journalLine, normalizePath, setNext, setStarter, setStep, status } from '../bin/lib/state.mjs';
import { placeholderBacklog } from '../bin/lib/jairus.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = () => JSON.parse(fs.readFileSync(path.join(root, 'templates', 'jairus.json'), 'utf8'));
const mkDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-state-'));
  fs.writeFileSync(path.join(dir, 'jairus.json'), JSON.stringify(template(), null, 2));
  fs.writeFileSync(path.join(dir, 'journal.md'), '# Jairus journal\n');
  return dir;
};
const state = (dir, ...a) => spawnSync(process.execPath, [path.join(root, 'bin', 'state.mjs'), dir, ...a], { encoding: 'utf8' });
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'jairus.json'), 'utf8'));

test('a Windows path is stored with forward slashes', () => {
  assert.equal(normalizePath('C:\\Sandbox\\github\\jairus\\jairus-starter'), 'C:/Sandbox/github/jairus/jairus-starter');
  const j = setStarter(template(), { path: 'C:\\x\\y', sha: 'a'.repeat(40), dirty: 'false', core: ['packages/*'], product: ['plugins/*', 'branding/'] });
  assert.equal(j.starter.path, 'C:/x/y');
  assert.deepEqual(j.starter.zones, { core: ['packages/*'], product: ['plugins/*', 'branding/'] });
  assert.throws(() => setStarter(template(), { sha: 'abc' }), /40 hex/);
});

test('steps and the next action are validated and timestamped when written', () => {
  const j = setStep(template(), 'F4', 'failed', 'portal lint', '2026-01-01T00:00:00Z');
  assert.deepEqual(j.project.foundation.steps.F4, { step: 'failed', at: '2026-01-01T00:00:00Z', ref: 'portal lint' });
  assert.throws(() => setStep(template(), 'X1', 'done'), /must look like/);
  assert.throws(() => setStep(template(), 'F4', 'nope'), /must be one of/);
  setNext(j, { command: '/jairus:ship', reason: 'bootstrap is next', phase: 'start', current: 'init done' });
  assert.equal(j.workflow.next.command, '/jairus:ship');
  assert.throws(() => setNext(j, { reason: 'x' }), /needs a command/);
  assert.match(journalLine({ command: 'init', event: 'Gate F1 approved', next: '/jairus:board' }, '2026-01-01T00:00:00Z'), /^2026-01-01T00:00:00Z · init · — · Gate F1 approved · next: \/jairus:board$/);
});

test('status reads jairus.json against the backlog and says what is next', () => {
  const j = setNext(template(), { command: '/jairus:board', reason: 'the backlog is a placeholder' });
  const s = status(j, placeholderBacklog());
  assert.equal(s.backlog.status, 'placeholder');
  assert.deepEqual(s.backlog.unblocked, ['bootstrap']);
  assert.deepEqual(s.notes, []);
  assert.ok(status(template(), placeholderBacklog()).notes.some((n) => /no next action/.test(n)));
  assert.ok(status(template(), null).notes.some((n) => /no backlog/.test(n)));
});

test('CLI: step, next, starter, foundation, journal and show', () => {
  const dir = mkDir();
  assert.equal(state(dir, 'step', 'F0', 'done', '--ref', 'doctor --scope plugin').status, 0);
  assert.equal(state(dir, 'step', 'F1', 'bogus').status, 1);
  assert.equal(state(dir, 'starter', '--path', 'C:\\Sandbox\\jairus-starter', '--sha', 'b'.repeat(40), '--core', 'packages/*', '--product', 'plugins/*,branding/').status, 0);
  assert.equal(state(dir, 'foundation', '--status', 'green', '--scope', 'skeleton').status, 0);
  assert.equal(state(dir, 'next', '--command', '/jairus:ship', '--reason', 'run bootstrap', '--phase', 'start', '--current', 'backlog approved', '--blocker', 'pnpm missing').status, 0);
  assert.equal(state(dir, 'journal', '--command', 'init', '--event', 'Gate F1 approved', '--next', '/jairus:board').status, 0);
  const j = read(dir);
  assert.equal(j.starter.path, 'C:/Sandbox/jairus-starter');
  assert.equal(j.project.foundation.status, 'green');
  assert.deepEqual(j.workflow.blockers, ['pnpm missing']);
  assert.equal(j.project.foundation.steps.F0.ref, 'doctor --scope plugin');
  assert.ok(!fs.existsSync(path.join(dir, 'jairus.json.tmp')), 'writes are atomic');
  assert.match(fs.readFileSync(path.join(dir, 'journal.md'), 'utf8'), /init · — · Gate F1 approved · next: \/jairus:board\n$/);
  fs.writeFileSync(path.join(dir, 'product-backlog.json'), JSON.stringify(placeholderBacklog()));
  const show = state(dir, 'show');
  assert.equal(show.status, 0);
  assert.match(show.stdout, /next: \/jairus:ship — run bootstrap/);
  assert.match(show.stdout, /blocker: pnpm missing/);
  assert.match(show.stdout, /backlog: placeholder · 3 cards · unblocked: bootstrap/);
  assert.equal(JSON.parse(state(dir, 'show', '--json').stdout).workflow.phase, 'start');
  assert.equal(state(path.join(os.tmpdir(), 'no-such-dir'), 'show').status, 1);
  assert.equal(state(dir, 'nope').status, 2);
});
