// Tests for the starter-requirements reader and the pre-live list. Run through scripts/test-bin.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { envStatus, minVersion, parseEnvExample, readRequirements } from '../bin/lib/requirements.mjs';
import { add, blocking, checkPrelive, setStatus } from '../bin/lib/prelive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = `# Copy to apps/portal/.env.local, apps/cli/.env.local (never commit)
# ── Database (Neon) ─────────── portal, cli
# app_user, pooled.
DATABASE_URL=
# ── Authentication ───────────
# 32+ characters: openssl rand -base64 32     portal, admin
COOKIE_SECRET=
APP_URL=
`;
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-req-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 's', engines: { node: '>=22.13' }, packageManager: 'pnpm@10.10.0' }));
  fs.writeFileSync(path.join(d, '.nvmrc'), '24\n');
  fs.writeFileSync(path.join(d, '.env.example'), ENV);
  return d;
};

test('env example: sections, variables, consumers, generatable and the env files it names', () => {
  const p = parseEnvExample(ENV);
  assert.deepEqual(p.envFiles, ['apps/portal/.env.local', 'apps/cli/.env.local']);
  assert.deepEqual(p.sections.map((s) => s.name), ['Database (Neon)', 'Authentication']);
  const cookie = p.sections[1].vars[0];
  assert.equal(cookie.name, 'COOKIE_SECRET');
  assert.equal(cookie.generatable, true);
  assert.equal(cookie.consumers, 'portal, admin');
  assert.equal(p.sections[0].vars[0].generatable, false);
  assert.equal(p.sections[1].vars[1].generatable, false);
});

test('requirements read the runtime and package manager from the starter', () => {
  const r = readRequirements(mk());
  assert.equal(r.nodeEngines, '>=22.13');
  assert.equal(r.nvmrc, '24');
  assert.equal(r.packageManager, 'pnpm@10.10.0');
  assert.deepEqual(minVersion('>=22.13'), [22, 13]);
  assert.equal(minVersion('latest'), null);
  assert.equal(readRequirements(os.tmpdir()).name, null);
});

test('status is presence by name and never carries a value', () => {
  const d = mk();
  fs.mkdirSync(path.join(d, 'apps', 'portal'), { recursive: true });
  fs.writeFileSync(path.join(d, 'apps', 'portal', '.env.local'), 'DATABASE_URL=postgres://user:hunter2@host/db\nCOOKIE_SECRET=\n');
  const st = envStatus(d, readRequirements(d));
  assert.deepEqual(st.missing, ['COOKIE_SECRET', 'APP_URL']);
  assert.equal(st.files['apps/portal/.env.local'], true);
  assert.equal(st.files['apps/cli/.env.local'], false);
  assert.ok(!JSON.stringify(st).includes('hunter2'));
  const cli = spawnSync(process.execPath, [path.join(root, 'bin', 'starter-requirements.mjs'), d, '--status'], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /DATABASE_URL SET/);
  assert.match(cli.stdout, /COOKIE_SECRET EMPTY \(generatable\)/);
  assert.ok(!cli.stdout.includes('hunter2'));
  assert.equal(spawnSync(process.execPath, [path.join(root, 'bin', 'starter-requirements.mjs'), os.tmpdir()], { encoding: 'utf8' }).status, 1);
});

test('prelive: add, acknowledge, and what blocks each point', () => {
  const doc = { schema: 1, items: [] };
  const a = add(doc, { what: 'DATABASE_URL (Neon)', kind: 'env', before: 'develop' });
  const b = add(doc, { what: 'Stripe account', kind: 'account', before: 'deploy' });
  assert.deepEqual([a.id, b.id], ['P1', 'P2']);
  assert.deepEqual(checkPrelive(doc), []);
  assert.deepEqual(blocking(doc, 'develop').map((i) => i.id), ['P1']);
  assert.deepEqual(blocking(doc, 'deploy').map((i) => i.id), ['P1', 'P2']);
  setStatus(doc, 'P1', 'done');
  assert.deepEqual(blocking(doc, 'qa'), []);
  setStatus(doc, 'P2', 'acknowledged');
  assert.ok(checkPrelive(doc).some((e) => /needs a note/.test(e)));
  setStatus(doc, 'P2', 'acknowledged', 'will add after launch');
  assert.deepEqual(checkPrelive(doc), []);
  assert.deepEqual(blocking(doc, 'deploy'), []);
  assert.throws(() => setStatus(doc, 'P9', 'done'));
});

test('prelive CLI round trip', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-pre-')), 'prelive.json');
  const run = (...a) => spawnSync(process.execPath, [path.join(root, 'bin', 'prelive.mjs'), f, ...a], { encoding: 'utf8' });
  assert.equal(run('add', 'NEON_API_KEY for provisioning', '--kind', 'env', '--before', 'qa').status, 0);
  assert.equal(run('check', '--before', 'qa').status, 1);
  assert.equal(run('check', '--before', 'develop').status, 0);
  assert.equal(run('ack', 'P1').status, 2);
  assert.equal(run('ack', 'P1', 'human will supply').status, 0);
  assert.equal(run('check', '--before', 'deploy').status, 0);
  assert.equal(run('validate').status, 0);
  assert.equal(run('add', 'x', '--kind', 'bogus').status, 1);
});

test('env-set replaces or appends from stdin and never echoes the value', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jairus-envset-'));
  const a = path.join(d, 'a.env');
  const b = path.join(d, 'b.env');
  fs.writeFileSync(a, 'KEEP=1\nTOKEN=\n');
  const run = (key, value, ...files) => spawnSync(process.execPath, [path.join(root, 'bin', 'env-set.mjs'), key, ...files], { encoding: 'utf8', input: value });
  const r = run('TOKEN', 's3cret-value\n', a, b);
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes('s3cret-value'));
  assert.equal(fs.readFileSync(a, 'utf8'), 'KEEP=1\nTOKEN=s3cret-value\n');
  assert.equal(fs.readFileSync(b, 'utf8'), 'TOKEN=s3cret-value\n');
  run('EXTRA', 'x', a);
  assert.equal(fs.readFileSync(a, 'utf8'), 'KEEP=1\nTOKEN=s3cret-value\nEXTRA=x\n');
  assert.equal(run('TOKEN', '', a).status, 1);
  assert.equal(run('lower', 'x', a).status, 2);
});
