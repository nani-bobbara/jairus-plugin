// Tests for the doctor checks (bin/lib/doctor.mjs, bin/doctor.mjs). Run through scripts/test-bin.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exitCode, resolveStarter, runChecks } from '../bin/lib/doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const by = (checks, name) => checks.find((c) => c.name === name);
const okRun = (versions = {}) => (cmd) => ({ ok: true, out: versions[cmd] ?? `${cmd} version 99.0.0` });
const mkStarter = (pkg = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-doc-'));
  const s = path.join(dir, 'jairus-starter');
  fs.mkdirSync(s);
  fs.writeFileSync(path.join(s, 'package.json'), JSON.stringify({ name: 'jairus-starter', engines: { node: '>=22.13' }, packageManager: 'pnpm@10.10.0', ...pkg }));
  fs.writeFileSync(path.join(s, '.env.example'), '# ── Database ── portal\nDATABASE_URL=\n');
  return { dir, s };
};

test('DEV passes on a ready machine and checks no vendor tool or secret', () => {
  const { dir, s } = mkStarter();
  const checks = runChecks({ mode: 'dev', run: okRun({ pnpm: '10.10.0' }), env: {}, nodeVersion: 'v22.14.0', from: dir });
  assert.equal(exitCode(checks), 0);
  assert.ok(by(checks, 'local starter').detail.includes(s));
  assert.equal(by(checks, 'pnpm').level, 'pass', 'before init the starter prerequisites are read from the local starter');
  assert.equal(by(checks, 'starter runtime').level, 'pass');
  const noPm = runChecks({ mode: 'dev', run: (cmd) => ({ ok: cmd !== 'pnpm', out: `${cmd} 99.0.0` }), env: {}, nodeVersion: 'v22.14.0', from: dir });
  assert.equal(by(noPm, 'pnpm').level, 'warn', 'a missing starter prerequisite is only a heads-up before init');
  assert.match(by(noPm, 'pnpm').detail, /before init/);
  assert.equal(exitCode(noPm), 0, 'so init is not stopped by it');
  assert.ok(by(noPm, 'pnpm').fix);
  const post = runChecks({ mode: 'dev', run: okRun({ pnpm: '10.10.0' }), env: {}, nodeVersion: 'v22.14.0', from: dir, starterDir: s, scope: 'starter' });
  assert.equal(exitCode(post), 0);
  assert.equal(by(post, 'pnpm').level, 'pass');
  assert.match(by(post, 'starter env').detail, /1 variable/);
  assert.equal(by(post, 'node'), undefined, 'scope starter runs only the starter group');
  for (const n of ['neonctl', 'NEON_API_KEY', 'gh', 'vercel', 'VERCEL_TOKEN', 'stripe']) assert.equal(by(checks, n), undefined, n);
});

test('the plugin itself needs only Node 20, git and the starter; the starter sets the rest', () => {
  const { dir } = mkStarter();
  const nodeOk = runChecks({ mode: 'dev', run: okRun({ pnpm: '10.10.0' }), env: {}, nodeVersion: 'v20.5.0', from: dir, starterDir: path.join(dir, 'jairus-starter') });
  assert.equal(by(nodeOk, 'node').level, 'pass');
  assert.equal(by(nodeOk, 'starter runtime').level, 'fail', 'the starter wants 22.13');
  assert.match(by(nodeOk, 'starter runtime').fix, /does not install or pin Node/);
  const noGit = runChecks({ mode: 'dev', run: (cmd) => ({ ok: cmd !== 'git', out: `${cmd} 99.0.0` }), env: {}, nodeVersion: 'v22.14.0', from: dir });
  assert.equal(by(noGit, 'git').level, 'fail');
  assert.equal(by(runChecks({ mode: 'dev', run: okRun(), env: {}, nodeVersion: 'v18.0.0', from: dir }), 'node').level, 'fail');
});

test('the package manager comes from the starter, not from the plugin', () => {
  const { dir } = mkStarter({ packageManager: 'yarn@4.1.0' });
  const s = path.join(dir, 'jairus-starter');
  const checks = runChecks({ mode: 'dev', run: okRun({ yarn: '4.1.0' }), env: {}, nodeVersion: 'v22.14.0', from: dir, starterDir: s });
  assert.equal(by(checks, 'yarn').level, 'pass');
  assert.equal(by(checks, 'pnpm'), undefined);
  const wrong = runChecks({ mode: 'dev', run: okRun({ yarn: '1.22.0' }), env: {}, nodeVersion: 'v22.14.0', from: dir, starterDir: s });
  assert.match(by(wrong, 'yarn').detail, /declares yarn@4/);
  const missing = runChecks({ mode: 'dev', run: (cmd) => ({ ok: cmd !== 'yarn', out: '1.0.0' }), env: {}, nodeVersion: 'v22.14.0', from: dir, starterDir: s });
  assert.match(by(missing, 'yarn').fix, /npm install -g yarn@4\.1\.0/);
  for (const c of [...wrong, ...missing].filter((x) => x.level === 'fail')) assert.ok(c.fix, `${c.name} needs a fix`);
});

test('QA reads the starter it is given and adds no vendor checks', () => {
  const { s } = mkStarter();
  const checks = runChecks({ mode: 'qa', run: okRun({ pnpm: '10.10.0' }), env: {}, nodeVersion: 'v22.14.0', starterDir: s });
  assert.equal(exitCode(checks), 0);
  assert.equal(by(checks, 'local starter'), undefined);
  assert.equal(by(checks, 'starter runtime').level, 'pass');
  for (const n of ['gh', 'gh login', 'vercel', 'stripe']) assert.equal(by(checks, n), undefined, n);
});

test('starter resolution: env var wins, a sibling folder is found, a wrong folder is refused', () => {
  const { dir, s } = mkStarter();
  assert.equal(resolveStarter({ env: { JAIRUS_STARTER_PATH: s }, from: os.tmpdir() }).path, s);
  assert.match(resolveStarter({ env: { JAIRUS_STARTER_PATH: dir }, from: os.tmpdir() }).error, /not a jairus-starter/);
  const ws = path.join(dir, 'workspace', 'product');
  fs.mkdirSync(ws, { recursive: true });
  assert.equal(resolveStarter({ env: {}, from: path.join(dir, 'workspace') }).path, s);
  assert.equal(resolveStarter({ env: {}, from: ws }).path, s);
  assert.ok(resolveStarter({ env: {}, from: os.tmpdir() }).error);
  const none = runChecks({ mode: 'dev', run: okRun(), env: {}, nodeVersion: 'v22.14.0', from: os.tmpdir() });
  assert.equal(by(none, 'local starter').level, 'fail');
  assert.ok(by(none, 'local starter').fix);
});

test('plugin integrity is verified against the real repo', () => {
  const checks = runChecks({ mode: 'dev', run: okRun(), env: {}, nodeVersion: 'v22.14.0', pluginRoot: root, from: os.tmpdir() });
  for (const n of ['plugin manifest', 'command-skills', 'bin tools', 'hooks']) assert.equal(by(checks, n)?.level, 'pass', `${n}: ${by(checks, n)?.detail}`);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-empty-'));
  const broken = runChecks({ mode: 'dev', run: okRun(), env: {}, nodeVersion: 'v22.14.0', pluginRoot: empty, from: os.tmpdir() });
  assert.equal(by(broken, 'plugin manifest').level, 'fail');
  assert.equal(by(broken, 'command-skills').level, 'fail');
});

test('CLI: doctor prints lines and a fix for each failure', () => {
  const { s } = mkStarter();
  const r = spawnSync(process.execPath, [path.join(root, 'bin', 'doctor.mjs'), '--mode', 'dev', '--starter', s, '--from', os.tmpdir()], { encoding: 'utf8' });
  assert.ok([0, 1].includes(r.status));
  assert.match(r.stdout, /^(PASS|WARN|FAIL) node — /m);
  assert.match(r.stdout, /^(PASS|FAIL) starter runtime — /m);
  assert.equal(spawnSync(process.execPath, [path.join(root, 'bin', 'doctor.mjs')], { encoding: 'utf8' }).status, 2);
  const json = spawnSync(process.execPath, [path.join(root, 'bin', 'doctor.mjs'), '--mode', 'qa', '--json', '--from', os.tmpdir()], { encoding: 'utf8' });
  assert.ok(Array.isArray(JSON.parse(json.stdout)));
});

test('inside a project the starter group is found from the folder, and a missing package manager fails only that group', () => {
  const { dir } = mkStarter();
  const proj = path.join(dir, 'product');
  fs.mkdirSync(path.join(proj, '.jairus'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.jairus', 'jairus.json'), '{}');
  fs.copyFileSync(path.join(dir, 'jairus-starter', 'package.json'), path.join(proj, 'package.json'));
  const noPnpm = (cmd) => ({ ok: cmd !== 'pnpm', out: `${cmd} 99.0.0` });
  const all = runChecks({ mode: 'dev', run: noPnpm, env: {}, nodeVersion: 'v22.14.0', from: proj });
  assert.equal(by(all, 'node').level, 'pass');
  assert.equal(by(all, 'pnpm').level, 'fail');
  const plugin = runChecks({ mode: 'dev', run: noPnpm, env: {}, nodeVersion: 'v22.14.0', from: proj, scope: 'plugin' });
  assert.equal(exitCode(plugin), 0, JSON.stringify(plugin));
  const none = runChecks({ mode: 'dev', run: noPnpm, env: {}, nodeVersion: 'v22.14.0', from: os.tmpdir(), scope: 'starter' });
  assert.equal(by(none, 'starter requirements').level, 'fail');
});
