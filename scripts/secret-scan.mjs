#!/usr/bin/env node
// PreToolUse hook: block git commit/push when the changes about to be recorded or pushed contain likely secrets.
// Fails open: any internal error exits 0 with a note on stderr.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PATTERNS = [
  ['sk_live_ Stripe live key', /sk_live_[A-Za-z0-9]{10,}/],
  ['sk_test_ Stripe test key', /sk_test_[A-Za-z0-9]{10,}/],
  ['rk_ Stripe restricted key', /rk_(live|test)_[A-Za-z0-9]{10,}/],
  ['whsec_ Stripe webhook secret', /whsec_[A-Za-z0-9]{10,}/],
  ['re_ Resend API key', /\bre_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{20,}/],
  ['private key header', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Neon Postgres connection string with credentials', /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s/]*neon/],
];
const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const ENV_EXAMPLE = /(^|\/)\.env\.example$/;
const MAX_COMMITS = '200'; // cap for pushes without an upstream
const MAX_BYTES = 32 * 1024 * 1024;

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BYTES });
  return r.status === 0 ? r.stdout || '' : '';
}

function checkNames(names, hits, how) {
  for (const f of names.split(/\r?\n/).filter(Boolean)) {
    if (ENV_FILE.test(f) && !ENV_EXAMPLE.test(f)) hits.add(`env file ${how}: ${f}`);
  }
}

// Scans the added lines of a unified diff (also the output of `git log -p`).
function scanDiff(diff, hits) {
  let file = '(unknown)';
  for (const line of diff.split(/\r?\n/)) {
    const m = /^\+\+\+ b\/(.*)$/.exec(line);
    if (m) {
      file = m[1];
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) hits.add(`${name} in ${file}`);
    }
  }
}

try {
  let evt = {};
  try {
    evt = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  const command = evt && evt.tool_input && evt.tool_input.command;
  if (typeof command !== 'string' || !/\bgit\s+(commit|push)\b/.test(command)) process.exit(0);

  const cwd = typeof evt.cwd === 'string' && evt.cwd ? evt.cwd : process.cwd();
  const hits = new Set();

  checkNames(git(['diff', '--cached', '--name-only'], cwd), hits, 'staged');
  scanDiff(git(['diff', '--cached', '--no-color'], cwd), hits);

  if (/\bgit\s+push\b/.test(command)) {
    const up = spawnSync('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd, encoding: 'utf8' });
    if (up.status === 0) {
      checkNames(git(['diff', '--name-only', '@{upstream}..HEAD'], cwd), hits, 'in pushed commits');
      scanDiff(git(['diff', '--no-color', '@{upstream}..HEAD'], cwd), hits);
    } else {
      // No upstream yet (first push of a branch): scan the commits no remote has seen.
      const range = ['--max-count', MAX_COMMITS, 'HEAD', '--not', '--remotes'];
      checkNames(git(['log', '--no-color', '--name-only', '--format=', ...range], cwd), hits, 'in pushed commits');
      scanDiff(git(['log', '-p', '--no-color', '--format=', ...range], cwd), hits);
    }
  }

  if (hits.size > 0) {
    process.stderr.write(
      'BLOCKED: possible secret(s) detected (values masked):\n' +
        [...hits].map((h) => `  - ${h}: ****`).join('\n') +
        '\nRemove or unstage the sensitive content (rewrite unpushed commits if needed), then retry.\n',
    );
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`secret-scan hook error (ignored): ${err && err.message ? err.message : err}\n`);
  process.exit(0);
}
