#!/usr/bin/env node
// PostToolUse hook: after an edit to a TypeScript file in a pnpm workspace, run `pnpm -r type-check`; exit 2 on failure.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

try {
  let cwd = process.cwd();
  let filePath = '';
  const raw = readStdin().trim();
  if (raw) {
    try {
      const evt = JSON.parse(raw);
      if (evt && typeof evt.cwd === 'string' && evt.cwd) cwd = evt.cwd;
      const fp = evt && evt.tool_input && evt.tool_input.file_path;
      if (typeof fp === 'string') filePath = fp;
    } catch {
      // ignore malformed stdin
    }
  }

  if (!/\.(ts|tsx|mts|cts)$/i.test(filePath)) process.exit(0);

  if (!existsSync(join(cwd, 'pnpm-workspace.yaml'))) process.exit(0);

  const res = spawnSync('pnpm', ['-r', 'type-check'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (res.error) {
    process.stderr.write(`typecheck hook: could not run pnpm: ${res.error.message}\n`);
    process.exit(0);
  }
  if (res.status !== 0) {
    const out = `${res.stdout || ''}${res.stderr || ''}`.split(/\r?\n/);
    process.stderr.write(`Type-check failed (pnpm -r type-check):\n${out.slice(-40).join('\n')}\n`);
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`typecheck hook error (ignored): ${err && err.message ? err.message : err}\n`);
  process.exit(0);
}
