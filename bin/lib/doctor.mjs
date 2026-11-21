// Readiness checks for /jairus:doctor (rules/modes.md, rules/foundation.md → F0): the plugin's own needs (Claude
// Code side: Node, git, plugin integrity, the local starter) and then what the starter itself declares it needs.
// Nothing vendor-specific is checked here: integrations are reached through the workspace MCP servers.
// Each check returns { level: 'pass' | 'warn' | 'fail', name, detail, fix }. Presence checks only:
// a secret's value is never read into the result.
import fs from 'node:fs';
import path from 'node:path';
import { minVersion, readRequirements } from './requirements.mjs';

export const MIN_NODE = [20, 0];
export const BIN_TOOLS = ['check-intent', 'copy-starter', 'make-backlog', 'validate-backlog', 'check-feature', 'render-feature', 'starter-requirements', 'prelive', 'env-set', 'state', 'backlog'];
export const SKILLS_SHIPPED = ['doctor', 'init', 'board', 'ship', 'help'];

const parseVersion = (s) => (/(\d+)\.(\d+)(?:\.(\d+))?/.exec(s ?? '') ?? []).slice(1, 4).map(Number);
const atLeast = (v, min) => v[0] > min[0] || (v[0] === min[0] && (v[1] ?? 0) >= min[1]);
const result = (level, name, detail, fix = '') => ({ level, name, detail, fix });

/** Resolve the local jairus-starter (rules/modes.md → Backend 1): env var, then walk up from `from`. */
export function resolveStarter({ env = process.env, from = process.cwd(), fsImpl = fs } = {}) {
  const isStarter = (dir) => {
    try { return JSON.parse(fsImpl.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'jairus-starter'; }
    catch { return false; }
  };
  if (env.JAIRUS_STARTER_PATH) {
    const dir = path.resolve(env.JAIRUS_STARTER_PATH);
    return isStarter(dir) ? { path: dir, via: 'JAIRUS_STARTER_PATH' } : { error: `JAIRUS_STARTER_PATH (${dir}) is not a jairus-starter` };
  }
  let dir = path.resolve(from);
  for (let i = 0; i < 8; i++) {
    for (const cand of [path.join(dir, 'jairus-starter'), dir]) if (path.basename(cand) === 'jairus-starter' && isStarter(cand)) return { path: cand, via: 'search' };
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { error: 'no jairus-starter found next to the workspace' };
}

/**
 * Run every check. `run(cmd, args)` returns { ok, out } (injected in tests); `pluginRoot` is the installed plugin
 * folder. `starterDir` (or, in DEV with none given, the resolved local starter) is read for what it requires.
 */
export function runChecks({ mode, run, env = process.env, nodeVersion = process.version, pluginRoot, from = process.cwd(), starterDir, scope = 'all', fsImpl = fs }) {
  const out = [];
  const nv = parseVersion(nodeVersion);
  const wantPlugin = scope !== 'starter';
  const local = mode === 'dev' ? resolveStarter({ env, from, fsImpl }) : null;

  // The plugin's own readiness: what must hold before init starts. The starter's prerequisites are NOT here: they
  // are checked after init against the project's copy (scope 'starter', run at F4 and by doctor inside a project).
  if (wantPlugin) {
    out.push(atLeast(nv, MIN_NODE) ? result('pass', 'node', nodeVersion) : result('fail', 'node', `${nodeVersion} (the plugin needs ≥ ${MIN_NODE.join('.')})`, 'install the current Node.js LTS or newer (a machine-level tool, not managed by jairus)'));
    const git = run('git', ['--version']);
    out.push(git.ok ? result('pass', 'git', git.out.trim().split('\n')[0]) : result('fail', 'git', 'git not found or failed', 'install git'));
    if (local) {
      out.push(local.path ? result('pass', 'local starter', `${local.path} (${local.via})`) : result('fail', 'local starter', local.error, 'set JAIRUS_STARTER_PATH to your jairus-starter folder or place it next to the workspace'));
    }
  }

  // What the starter declares it needs, read from the project's copy of it (never hardcoded here). Inside a project
  // its gaps are failures; before init, read from the local starter, they are warnings: a heads-up, not a blocker.
  const isProduct = (dir) => fsImpl.existsSync(path.join(dir, '.jairus', 'jairus.json')) && fsImpl.existsSync(path.join(dir, 'package.json'));
  const project = starterDir ?? (isProduct(from) ? from : null);
  const advisory = !project && local?.path ? local.path : null;
  const starterPath = project ?? advisory;
  const lvl = (l) => (advisory && l === 'fail' ? 'warn' : l);
  const note = advisory ? ' (heads-up before init, from the local starter)' : '';
  if (scope !== 'plugin' && !starterPath) {
    out.push(scope === 'starter'
      ? result('fail', 'starter requirements', 'no project with a starter copy here', 'run this inside the project folder, or pass --starter <dir>')
      : result('pass', 'starter requirements', 'no starter to read yet: set JAIRUS_STARTER_PATH, or run this inside a project'));
  }
  if (scope !== 'plugin' && starterPath) {
    const req = readRequirements(starterPath, fsImpl);
    const min = minVersion(req.nodeEngines);
    if (min) out.push(atLeast(nv, min) ? result('pass', 'starter runtime', `node ${nodeVersion} satisfies ${req.nodeEngines}`) : result(lvl('fail'), 'starter runtime', `node ${nodeVersion} does not satisfy the starter's ${req.nodeEngines}${note}`, `update Node.js on this machine to the current LTS or newer (the starter needs ${req.nodeEngines}); jairus does not install or pin Node`));
    const pm = /^([a-z]+)@(\d+)/.exec(req.packageManager ?? '');
    if (pm) {
      const r = run(pm[1], ['--version']);
      const have = parseVersion(r.out);
      if (!r.ok) out.push(result(lvl('fail'), pm[1], `${pm[1]} not found or failed (the starter declares ${req.packageManager})${note}`, `npm install -g ${req.packageManager} (or corepack enable, where corepack ships with your Node). If it is already installed, add the folder from \`npm config get prefix\` to your PATH`));
      else if (have[0] !== Number(pm[2])) out.push(result(lvl('fail'), pm[1], `${r.out.trim().split('\n')[0]} (the starter declares ${req.packageManager})${note}`, `npm install -g ${req.packageManager}`));
      else out.push(result('pass', pm[1], r.out.trim().split('\n')[0]));
    }
    const count = req.sections.reduce((n, s) => n + s.vars.length, 0);
    out.push(result('pass', 'starter env', `${count} variable(s) in ${req.sections.length} section(s); run starter-requirements.mjs --status for what is set`));
  }

  // plugin integrity
  if (pluginRoot && wantPlugin) {
    const at = (...p) => path.join(pluginRoot, ...p);
    const exists = (...p) => fsImpl.existsSync(at(...p));
    try {
      const pj = JSON.parse(fsImpl.readFileSync(at('.claude-plugin', 'plugin.json'), 'utf8'));
      out.push(pj.name && pj.version ? result('pass', 'plugin manifest', `${pj.name} ${pj.version}`) : result('fail', 'plugin manifest', 'name or version missing', 'reinstall the plugin'));
    } catch { out.push(result('fail', 'plugin manifest', 'missing or not valid JSON', 'reinstall the plugin: /plugin marketplace update jairus-plugin')); }
    const missing = SKILLS_SHIPPED.filter((s) => !exists('skills', s, 'SKILL.md'));
    out.push(missing.length ? result('fail', 'command-skills', `missing: ${missing.join(', ')}`, 'reinstall the plugin') : result('pass', 'command-skills', 'all present'));
    const bins = BIN_TOOLS.filter((b) => !exists('bin', `${b}.mjs`));
    out.push(bins.length ? result('fail', 'bin tools', `missing: ${bins.join(', ')}`, 'reinstall the plugin') : result('pass', 'bin tools', 'all present'));
    try {
      const hooks = JSON.parse(fsImpl.readFileSync(at('hooks', 'hooks.json'), 'utf8'));
      const named = [...JSON.stringify(hooks).matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]+)/g)].map((m) => m[1]);
      const gone = named.filter((f) => !exists(...f.split('/')));
      out.push(gone.length ? result('fail', 'hooks', `scripts missing: ${gone.join(', ')}`, 'reinstall the plugin') : result('pass', 'hooks', `${named.length} script reference(s) resolve`));
    } catch { out.push(result('fail', 'hooks', 'hooks/hooks.json missing or not valid JSON', 'reinstall the plugin')); }
  }
  return out;
}

export const exitCode = (checks) => (checks.some((c) => c.level === 'fail') ? 1 : 0);
