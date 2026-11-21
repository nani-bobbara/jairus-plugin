#!/usr/bin/env node
// Copies a local jairus-starter into a new project folder (DEV mode, rules/modes.md → Backend 1).
//   node copy-starter.mjs --starter <dir> --dest <dir> [--keep .jairus,.mcp.json,.claude,README.md]
// `--keep` lists top-level names the destination may already hold (init's seed files) so the project
// can be created in place; without it the destination must be empty or absent. Copies the tracked and untracked-but-not-ignored files (`git ls-files -co --exclude-standard`),
// excluding .git, node_modules and dev-tools/ (developer helpers never reach a product), then runs
// `git init` on branch main. It makes no commit. Prints one JSON line:
//   {"source":"local","path":…,"sha":…,"dirty":bool,"files":n,"dest":…}
// Exit 0 done · 1 failed · 2 misused.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const die = (code, msg) => { console.error(msg); process.exit(code); };

const starterArg = opt('--starter');
const destArg = opt('--dest');
if (!starterArg || !destArg) die(2, 'usage: copy-starter.mjs --starter <dir> --dest <dir> [--keep a,b,…]');
// Top-level names that may already exist in the destination (the seed files init wrote there). They
// are never overwritten: a starter file at the same path is skipped and reported.
const keep = new Set(['.git', ...(opt('--keep') ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
const starter = path.resolve(starterArg);
const dest = path.resolve(destArg);

const git = (cwd, gitArgs) => {
  const r = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
};

if (!fs.existsSync(path.join(starter, 'package.json'))) die(1, `not a jairus-starter: ${starter} has no package.json`);
const pkg = JSON.parse(fs.readFileSync(path.join(starter, 'package.json'), 'utf8'));
if (pkg.name !== 'jairus-starter') die(1, `not a jairus-starter: package name is "${pkg.name}"`);
if (!git(starter, ['rev-parse', '--verify', 'HEAD']).ok) die(1, `${starter} is not a git checkout with a commit`);
if (fs.existsSync(dest)) {
  const foreign = fs.readdirSync(dest).filter((n) => !keep.has(n));
  if (foreign.length > 0) die(1, `destination ${dest} is not empty (${foreign.slice(0, 5).join(', ')})`);
}
if (dest === starter || dest.startsWith(starter + path.sep)) die(1, 'destination must be outside the starter');

const sha = git(starter, ['rev-parse', 'HEAD']).out.trim();
const dirty = git(starter, ['status', '--porcelain']).out.trim() !== '';
const listed = git(starter, ['ls-files', '-co', '--exclude-standard', '-z']);
if (!listed.ok) die(1, `git ls-files failed: ${listed.err}`);

const excluded = (f) => f === '.git' || f.startsWith('.git/') || f.startsWith('dev-tools/') || f.includes('/node_modules/') || f.startsWith('node_modules/');
let copied = 0;
const skipped = [];
for (const f of new Set(listed.out.split('\0').filter(Boolean))) {
  if (excluded(f)) continue;
  const from = path.join(starter, ...f.split('/'));
  if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue; // tracked but deleted in the working tree
  const to = path.join(dest, ...f.split('/'));
  if (fs.existsSync(to)) { skipped.push(f); continue; } // a kept seed file wins
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

if (!fs.existsSync(path.join(dest, '.git'))) {
  let init = git(dest, ['init', '-b', 'main']);
  if (!init.ok) {
    init = git(dest, ['init']);
    if (init.ok) git(dest, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
  if (!init.ok) die(1, `git init failed: ${init.err}`);
}

console.log(JSON.stringify({ source: 'local', path: starter, sha, dirty, files: copied, skipped, dest }));
