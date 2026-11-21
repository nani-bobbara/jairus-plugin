#!/usr/bin/env node
// Drift check for the jairus plugin. Dependency-free; Node >= 20.
// Usage: node scripts/check-drift.mjs [repoRoot]
// Output: one line per violation `FAIL <rule> <path>[:line] <detail>`, then `OK` or `<N> violation(s)`.
// Set DRIFT_SUMMARY=1 to also print per-rule counts to stderr.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const PLUGIN = '.';

const fwd = (p) => p.split(path.sep).join('/');
const abs = (rel) => path.join(ROOT, ...rel.split('/'));
const exists = (rel) => fs.existsSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8');
const listDir = (rel) => (exists(rel) ? fs.readdirSync(abs(rel), { withFileTypes: true }) : []);
const listMd = (rel) => listDir(rel).filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => `${rel}/${d.name}`).sort();

const violations = []; // { rule, file, line, detail }
const fail = (rule, file, detail, line) => violations.push({ rule, file, line, detail });

// ---------- frontmatter ----------
// Top-level `key:` lines only. Returns null when there is no frontmatter block.
function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return null;
  const keys = new Map();
  let current = null;
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (m) {
      current = m[1];
      keys.set(current, m[2].trim());
    } else if (current && lines[i].trim() !== '') {
      keys.set(current, `${keys.get(current)} ${lines[i].trim()}`.trim());
    }
  }
  return { keys, bodyStart: end + 1 };
}

const unquote = (s) => s.replace(/^["']|["']$/g, '');

// Split a tool list on top-level commas (ignore commas inside parentheses).
function splitTools(value) {
  let v = value.trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(unquote);
}

// ---------- 1. forbidden strings ----------
const FORBIDDEN = [
  ['@app/db'], ['@app/core'], ['packages/db'], ['packages/core'], ['npm run'], ['npm test'],
  ['requireAdmin'], ['Gate 1'], ['/jairus:adopt'], ['forced first-login'], ['mustResetPassword'],
  ['localMarketplaces'],
  ['docs/INTENT.md'], ['docs/features'],
  // the plugin is product-agnostic: no invented sample domain in shipped docs (the starter's docs name no product either)
  ['invoicing'], ['freelanc'], ['supabase', true], ['firebase', true],
  // the plugin carries no vendor CLI or credential: services are reached through MCP, secrets stay with the human
  ['neonctl'], ['NEON_API_KEY'], ['VERCEL_TOKEN'], ['apps/cli/.env'],
];
const SCAN_EXT = new Set(['.md', '.json', '.mjs', '.yml', '.yaml', '.svg', '.txt', '.sh']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.superpowers']);
const SKIP_PREFIX = ['docs/superpowers/'];
const SKIP_FILES = new Set(['scripts/check-drift.mjs', 'scripts/test-doctor.mjs', 'scripts/test-requirements.mjs']);
const HIT_CAP = 3;

function* walk(rel) {
  for (const d of listDir(rel)) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      if (SKIP_DIRS.has(d.name) || SKIP_PREFIX.some((p) => `${r}/`.startsWith(p))) continue;
      yield* walk(r);
    } else if (d.isFile()) yield r;
  }
}

function checkForbidden() {
  for (const rel of walk('')) {
    if (SKIP_FILES.has(rel) || !SCAN_EXT.has(path.extname(rel).toLowerCase())) continue;
    const lines = read(rel).split(/\r?\n/);
    for (const [term, ci] of FORBIDDEN) {
      let shown = 0;
      const needle = ci ? term.toLowerCase() : term;
      lines.forEach((line, i) => {
        if (!(ci ? line.toLowerCase() : line).includes(needle)) return;
        if (shown++ < HIT_CAP) fail('forbidden-string', rel, `contains "${term}"`, i + 1);
        else violations.push({ rule: 'forbidden-string', hidden: true });
      });
    }
  }
}

// ---------- 2. agent frontmatter + the delegation registry ----------
// rules/delegation.md owns what each agent gets; the agent files must carry exactly that.
function registryRows() {
  const rel = `${PLUGIN}/rules/delegation.md`;
  if (!exists(rel)) { fail('delegation', rel, 'file missing'); return {}; }
  const rows = {};
  const names = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  let inTable = false;
  for (const line of read(rel).split(/\r?\n/)) {
    if (/^## Agent registry/.test(line)) inTable = true;
    else if (/^## /.test(line)) inTable = false;
    const m = inTable && /^\| `([a-z]+)` \|/.exec(line);
    if (!m) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    rows[m[1]] = { model: cells[2], tools: cells[3].split(',').map((s) => s.replace(/`/g, '').trim()).filter(Boolean) };
  }
  return rows;
}
function checkAgents() {
  const registry = registryRows();
  const files = agentFiles();
  for (const rel of files) {
    const name = path.posix.basename(rel, '.md');
    if (SHIPPED_AGENTS.includes(name) !== rel.startsWith(`${PLUGIN}/agents/`)) fail('phase', rel, SHIPPED_AGENTS.includes(name) ? 'a Phase 1 agent must be in agents/' : `a parked agent must stay in ${PARKED}/agents/ until its phase starts`);
    const fm = parseFrontmatter(read(rel));
    if (!fm) { fail('agent-frontmatter', rel, 'missing frontmatter'); continue; }
    for (const k of ['name', 'description', 'tools', 'model']) {
      if (!fm.keys.has(k)) fail('agent-frontmatter', rel, `missing required key "${k}"`);
    }
    for (const k of ['allowed-tools', 'hooks', 'mcpServers', 'permissionMode']) {
      if (fm.keys.has(k)) fail('agent-frontmatter', rel, `forbidden key "${k}"`);
    }
    // Agent tools are bare tool names or mcp__<server>__*; permission patterns like Bash(git *) belong in command-skills.
    if (fm.keys.has('tools') && fm.keys.get('tools').includes('(')) {
      fail('agent-tools-no-patterns', rel, 'tools: contains "(" (use bare tool names, e.g. Bash)');
    }
    // Leaf workers: no agent may spawn another.
    if (!splitTools(fm.keys.get('disallowedTools') ?? '').includes('Agent')) fail('agent-leaf', rel, 'disallowedTools must include Agent (agents never dispatch agents)');
    // The registry row and the file agree.
    const row = registry[name];
    if (!row) { fail('delegation', rel, `agent "${name}" has no row in rules/delegation.md → Agent registry`); continue; }
    const tools = splitTools(fm.keys.get('tools') ?? '').sort().join(', ');
    if (tools !== [...row.tools].sort().join(', ')) fail('delegation', rel, `tools differ from the registry: file [${tools}] vs registry [${[...row.tools].sort().join(', ')}]`);
    if (fm.keys.has('skills')) fail('delegation', rel, 'agents preload no skills: the starter\'s docs are the knowledge (rules/delegation.md)');
    if (unquote(fm.keys.get('model') ?? '') !== row.model) fail('delegation', rel, `model differs from the registry (${fm.keys.get('model')} vs ${row.model})`);
  }
  const have = new Set(files.map((f) => path.posix.basename(f, '.md')));
  for (const name of Object.keys(registry)) if (!have.has(name)) fail('delegation', `${PLUGIN}/rules/delegation.md`, `registry names agent "${name}" with no agent file`);
}

// ---------- 3. command-skills ----------
// The ten commands are skills (the documented standard for new plugin work); the rest of skills/ is knowledge.
const COMMAND_SKILLS = ['doctor', 'init', 'board', 'extend', 'design', 'develop', 'review', 'deploy', 'ship', 'help'];
// Phase 1 is what ships. The rest are parked in phase-2-3/ (not loaded by Claude Code) until their phase starts.
const SHIPPED_SKILLS = ['doctor', 'init', 'board', 'ship', 'help'];
const SHIPPED_AGENTS = ['planner'];
const PARKED = 'phase-2-3';
const skillPath = (name) => (SHIPPED_SKILLS.includes(name) ? `${PLUGIN}/skills/${name}/SKILL.md` : `${PLUGIN}/${PARKED}/skills/${name}/SKILL.md`);
const agentFiles = () => [...listMd(`${PLUGIN}/agents`), ...listMd(`${PLUGIN}/${PARKED}/agents`)];
const MODEL_INVOCATION_OFF = new Set(['init', 'doctor', 'deploy', 'ship']);
function checkCommandSkills() {
  if (exists(`${PLUGIN}/commands`)) fail('command-skills', `${PLUGIN}/commands`, 'the commands/ folder must not exist: the ten commands are skills/<name>/SKILL.md');
  for (const name of COMMAND_SKILLS) {
    const rel = skillPath(name);
    if (!exists(rel)) { fail('command-skills', rel, 'missing'); continue; }
    if (!SHIPPED_SKILLS.includes(name) && exists(`${PLUGIN}/skills/${name}/SKILL.md`)) fail('phase', `${PLUGIN}/skills/${name}/SKILL.md`, `${name} is parked: keep it in ${PARKED}/skills/ until its phase starts`);
    const fm = parseFrontmatter(read(rel));
    if (!fm) { fail('command-skills', rel, 'missing frontmatter'); continue; }
    for (const k of ['name', 'description', 'argument-hint', 'allowed-tools']) {
      if (!fm.keys.has(k)) fail('command-skills', rel, `missing required key "${k}"`);
    }
    if (fm.keys.has('name') && unquote(fm.keys.get('name')) !== name) fail('command-skills', rel, 'name must equal the folder name');
    if (fm.keys.has('allowed-tools') && splitTools(fm.keys.get('allowed-tools')).includes('Bash')) {
      fail('command-skills', rel, 'bare "Bash" in allowed-tools (use Bash(<cmd> *))');
    }
    if (fm.keys.has('user-invocable') && unquote(fm.keys.get('user-invocable')) === 'false') fail('command-skills', rel, 'a command-skill must be user-invocable');
    const dmi = fm.keys.has('disable-model-invocation') ? unquote(fm.keys.get('disable-model-invocation')) : null;
    if (MODEL_INVOCATION_OFF.has(name)) {
      if (dmi !== 'true') fail('command-skills', rel, 'disable-model-invocation: true required');
    } else if (dmi === 'true') {
      fail('command-skills', rel, 'disable-model-invocation: true not allowed on this command');
    }
  }
}

// ---------- 4. skills ----------
function skillDirs() {
  return listDir(`${PLUGIN}/skills`).filter((d) => d.isDirectory() && exists(`${PLUGIN}/skills/${d.name}/SKILL.md`)).map((d) => d.name).sort();
}
function checkSkills() {
  for (const s of skillDirs()) {
    const rel = `${PLUGIN}/skills/${s}/SKILL.md`;
    const text = read(rel);
    const n = text.replace(/\r?\n$/, '').split(/\r?\n/).length;
    if (n > 500) fail('skill-size', rel, `${n} lines (max 500)`);
    const fm = parseFrontmatter(text);
    if (!fm) { fail('skill-size', rel, 'missing frontmatter'); continue; }
    for (const k of ['name', 'description']) {
      if (!fm.keys.has(k)) fail('skill-size', rel, `missing required key "${k}"`);
    }
    if (!COMMAND_SKILLS.includes(s)) {
      // Knowledge skill: loaded by description or preloaded by an agent, never a slash command.
      if (unquote(fm.keys.get('user-invocable') ?? '') !== 'false') fail('knowledge-skill', rel, 'a knowledge skill must set user-invocable: false (it is not a command)');
      if (unquote(fm.keys.get('disable-model-invocation') ?? '') === 'true') fail('knowledge-skill', rel, 'disable-model-invocation would stop agents from preloading it');
    }
  }
}

// ---------- 5. doc counts ----------
function checkDocCounts() {
  const real = {
    command: COMMAND_SKILLS.length,
    agent: agentFiles().length,
    skill: COMMAND_SKILLS.length,
    rule: listMd(`${PLUGIN}/rules`).length,
  };
  for (const rel of ['README.md', `${PLUGIN}/skills/help/SKILL.md`, `${PLUGIN}/skills/doctor/SKILL.md`]) {
    if (!exists(rel)) continue;
    read(rel).split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/\b(\d+)\s+(commands?|agents?|skills?|rules?)\b/g)) {
        const kind = m[2].replace(/s$/, '');
        if (Number(m[1]) !== real[kind]) {
          fail('doc-counts', rel, `says "${m[0]}" but filesystem has ${real[kind]} ${kind}(s)`, i + 1);
        }
      }
    });
  }
}

// ---------- 6. command-skill preflight ----------
const STAGE_COMMANDS = ['board', 'design', 'develop', 'review', 'deploy', 'ship', 'extend'];
function checkPreflight() {
  for (const name of STAGE_COMMANDS) {
    const rel = skillPath(name);
    if (exists(rel) && !read(rel).includes('rules/preflight.md')) {
      fail('command-preflight', rel, 'does not reference rules/preflight.md');
    }
  }
  for (const name of COMMAND_SKILLS) {
    const rel = skillPath(name);
    if (!exists(rel)) continue;
    read(rel).split(/\r?\n/).forEach((line, i) => {
      for (const bad of ['CRAFT DISPATCH', 'DATABASE_URL_ADMIN']) {
        if (line.includes(bad)) fail('command-preflight', rel, `contains "${bad}"`, i + 1);
      }
    });
  }
}

// ---------- 7. agents never write state ----------
function checkAgentWrites() {
  const writeRe = /(update|write|set)[^.\n]*jairus\.json/i;
  const moveRe = /move[^.\n]*card/i;
  for (const rel of agentFiles()) {
    read(rel).split(/\r?\n/).forEach((line, i) => {
      if (/\b(never|not|no|nor|cannot|without)\b/i.test(line)) return; // a prohibition is not an instruction
      if (writeRe.test(line)) fail('agent-writes', rel, 'jairus.json write instruction', i + 1);
      if (moveRe.test(line)) fail('agent-writes', rel, 'board card move instruction', i + 1);
    });
  }
}

// ---------- 8. manifests ----------
function readJson(rel, rule) {
  if (!exists(rel)) { fail(rule, rel, 'file missing'); return null; }
  try { return JSON.parse(read(rel)); } catch (e) { fail(rule, rel, `invalid JSON: ${e.message}`); return null; }
}
function checkManifests() {
  const pjRel = `${PLUGIN}/.claude-plugin/plugin.json`;
  const mpRel = '.claude-plugin/marketplace.json';
  const pj = readJson(pjRel, 'manifest');
  const mp = readJson(mpRel, 'manifest');
  if (pj) {
    for (const k of ['minClaudeCodeVersion', 'private']) {
      if (k in pj) fail('manifest', pjRel, `forbidden key "${k}"`);
    }
  }
  if (mp) {
    const scan = (obj, where) => {
      for (const k of ['autoUpdate', 'version']) {
        if (obj && typeof obj === 'object' && k in obj) fail('manifest', mpRel, `forbidden key "${k}" in ${where}`);
      }
    };
    scan(mp, 'root');
    (mp.plugins ?? []).forEach((p, i) => scan(p, `plugins[${i}]`));
  }
  if (pj?.version) {
    if (exists('README.md')) {
      const lines = read('README.md').split(/\r?\n/);
      const idx = lines.findIndex((l) => /^#\s/.test(l));
      const m = idx >= 0 ? /\bv(\d+\.\d+\.\d+[^\s`]*)/.exec(lines[idx]) : null;
      if (!m) fail('manifest', 'README.md', 'first heading has no v<semver>', idx >= 0 ? idx + 1 : undefined);
      else if (m[1] !== pj.version) fail('manifest', 'README.md', `header v${m[1]} != plugin.json version ${pj.version}`, idx + 1);
    }
    for (const [rel, re, what] of [['README.md', /^> \*\*Version (\S+):/m, 'Version line'], ['docs/ARCHITECTURE.md', /^Version `([^`]+)`/m, 'Version line']]) {
      if (!exists(rel)) continue;
      const m = re.exec(read(rel));
      if (!m) fail('manifest', rel, `${what} not found`);
      else if (m[1] !== pj.version) fail('manifest', rel, `${what} ${m[1]} != plugin.json version ${pj.version}`);
    }
  } else if (pj) {
    fail('manifest', pjRel, 'missing "version"');
  }
}

// ---------- 9. templates ----------
function checkTemplates() {
  if (!exists(`${PLUGIN}/templates/feature/spec.json`)) {
    fail('templates', `${PLUGIN}/templates/feature/spec.json`, 'must exist');
  }
  // Orphan guard: every template must be named (as templates/<path>) by some other plugin file, so a
  // template nobody reads cannot linger. The feature templates are named as a folder.
  const corpus = [];
  for (const rel of walk('')) {
    if (rel.startsWith('templates/') || rel.startsWith('docs/') || rel.startsWith('scripts/')) continue;
    if (!SCAN_EXT.has(path.extname(rel).toLowerCase())) continue;
    corpus.push(read(rel));
  }
  const text = corpus.join('\n');
  const found = [];
  const collect = (dir) => {
    for (const d of listDir(dir)) {
      const r = `${dir}/${d.name}`;
      if (d.isDirectory()) collect(r);
      else found.push(r);
    }
  };
  collect('templates');
  for (const f of found) {
    const rel = f.replace(/^templates\//, '');
    const named = text.includes(`templates/${rel}`) || (rel.startsWith('feature/') && text.includes('templates/feature/'));
    if (!named) fail('templates', f, 'orphan: no plugin file names it');
  }
}

// ---------- 10. hooks ----------
function checkHooks() {
  const rel = `${PLUGIN}/hooks/hooks.json`;
  const json = readJson(rel, 'hooks');
  if (!json) return;
  const text = read(rel);
  const commands = [];
  const collect = (o) => {
    if (Array.isArray(o)) o.forEach(collect);
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'command' && typeof v === 'string') {
          commands.push(Array.isArray(o.args) ? [v, ...o.args].join(' ') : v);
        }
        else collect(v);
      }
    }
  };
  collect(json);
  const lineOf = (needle) => {
    const i = text.split(/\r?\n/).findIndex((l) => l.includes(needle.slice(0, 40)));
    return i >= 0 ? i + 1 : undefined;
  };
  for (const c of commands) {
    if (!c.includes('${CLAUDE_PLUGIN_ROOT}')) fail('hooks', rel, `command lacks \${CLAUDE_PLUGIN_ROOT}: ${c}`, lineOf(c));
    if (/\|\|\s*true/.test(c)) fail('hooks', rel, `command swallows failures with "|| true": ${c}`, lineOf(c));
  }
}

// ---------- 11. plugin-root links + Vercel CLI usage ----------
// Commands link rules through ${CLAUDE_PLUGIN_ROOT}, never relative paths. `vercel link` can re-connect
// Git, so no shipped file or doc may instruct it (deploys pass VERCEL_ORG_ID / VERCEL_PROJECT_ID instead).
function checkLinksAndVercel() {
  for (const rel of COMMAND_SKILLS.map(skillPath).filter((r) => exists(r))) {
    read(rel).split(/\r?\n/).forEach((line, i) => {
      if (line.includes('](../rules/')) fail('command-rule-links', rel, 'relative "](../rules/" link (use ${CLAUDE_PLUGIN_ROOT}/rules/)', i + 1);
    });
  }
  const linkRe = /vercel(@latest)?\s+link\b/;
  for (const rel of walk('')) {
    if (SKIP_FILES.has(rel) || !SCAN_EXT.has(path.extname(rel).toLowerCase())) continue;
    read(rel).split(/\r?\n/).forEach((line, i) => {
      if (linkRe.test(line)) fail('no-vercel-link', rel, 'instructs "vercel link" (pass VERCEL_ORG_ID / VERCEL_PROJECT_ID instead)', i + 1);
    });
  }
}

// ---------- 12. encoding ----------
// A PowerShell Set-Content without -Encoding double-encodes UTF-8 (â€”, â†’, Â·) and can add a BOM.
function checkEncoding() {
  for (const rel of walk('')) {
    if (!SCAN_EXT.has(path.extname(rel).toLowerCase()) || rel === 'scripts/check-drift.mjs') continue;
    const buf = fs.readFileSync(abs(rel));
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail('encoding', rel, 'starts with a UTF-8 BOM');
    const text = buf.toString('utf8');
    const m = /\u00e2\u20ac|\u00e2\u2020|\u00c2\u00b7|\u00c3[\u0080-\u00bf]/.exec(text);
    if (m) fail('encoding', rel, `mojibake (double-encoded UTF-8) near "${text.slice(Math.max(0, m.index - 10), m.index + 12).replace(/\n/g, ' ')}"`);
  }
}

// ---------- 13. no dangling skill references ----------
// The plugin ships only the ten command-skills; a path or `jairus:<name>` naming any other skill is stale.
function checkSkillRefs() {
  const known = new Set(COMMAND_SKILLS);
  for (const rel of walk('')) {
    if (path.extname(rel).toLowerCase() !== '.md' || rel.startsWith('docs/superpowers/') || rel === 'README.md') continue;
    read(rel).split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/(?:skills\/|jairus:)([a-z][a-z-]*)\b/g)) {
        if (!known.has(m[1]) && !/^(skills|name|SKILL)$/.test(m[1]) && !/\*/.test(line.slice(m.index, m.index + m[0].length + 2))) fail('skill-ref', rel, `names the skill "${m[1]}", which the plugin does not ship`, i + 1);
      }
    });
  }
}

// ---------- run ----------
checkForbidden();
checkAgents();
checkCommandSkills();
checkSkills();
checkDocCounts();
checkPreflight();
checkAgentWrites();
checkManifests();
checkTemplates();
checkHooks();
checkLinksAndVercel();
checkEncoding();
checkSkillRefs();

for (const v of violations) {
  if (v.hidden) continue;
  console.log(`FAIL ${v.rule} ${fwd(v.file)}${v.line ? `:${v.line}` : ''} ${v.detail}`);
}
if (process.env.DRIFT_SUMMARY) {
  const counts = {};
  for (const v of violations) counts[v.rule] = (counts[v.rule] ?? 0) + 1;
  for (const [r, n] of Object.entries(counts).sort()) console.error(`  ${r}: ${n}`);
}
if (violations.length === 0) {
  console.log('OK');
} else {
  console.log(`${violations.length} violation(s)`);
  process.exitCode = 1;
}
