#!/usr/bin/env node
// Verifies that starter paths named in the plugin's knowledge files exist in the starter's committed HEAD.
// A path missing at HEAD but present in the starter's working tree is a NOTE (uncommitted), not a FAIL;
// a path at HEAD but deleted in the working tree is a NOTE too (about to disappear).
//   node scripts/check-starter-refs.mjs                    check against ../jairus-starter (SKIP if absent)
//   node scripts/check-starter-refs.mjs --starter <dir>    check against another starter checkout
//   node scripts/check-starter-refs.mjs --strict           a missing starter (or git) is a failure
//   node scripts/check-starter-refs.mjs --file <md> ...    check these files instead of the defaults
// Not run in CI: the private starter is not checked out there.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PLUGIN_KIT_POINTS } from '../bin/lib/feature.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const starter = path.resolve(root, opt('--starter') || path.join('..', 'jairus-starter'))

const DEFAULT_FILES = [
  ['rules/delegation.md', false],
  ['rules/starter-contract.md', true],
]
const fileArgs = args.flatMap((a, i) => (args[i - 1] === '--file' ? [a] : []))
const files = fileArgs.length ? fileArgs.map((f) => [f, true]) : DEFAULT_FILES

const PREFIXES = ['packages/', 'apps/', 'plugins/', 'branding/', 'docs/', '.github/']
const EXACT = new Set(['AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'turbo.json', 'package.json', '.env.example'])
const PATTERN = /[<*{…\s]/
const isStarterPath = (t) => EXACT.has(t) || PREFIXES.some((p) => t.startsWith(p) && t.length > p.length)

function git(gitArgs) {
  const r = spawnSync('git', ['-C', starter, ...gitArgs], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return { ok: !r.error && r.status === 0, missingGit: r.error && r.error.code === 'ENOENT' }
}

function skip(why) {
  console.log(`SKIP ${why}`)
  process.exit(strict ? 1 : 0)
}
const shown = path.relative(root, starter).split(path.sep).join('/') || starter
if (!fs.existsSync(starter) || !fs.statSync(starter).isDirectory()) skip(`starter not found at ${shown}`)
const head = git(['rev-parse', '--verify', '--quiet', 'HEAD'])
if (head.missingGit) skip(`git not found (starter at ${shown})`)
if (!head.ok) skip(`starter not found at ${shown} (not a git checkout with a HEAD commit)`)

const targets = []
const fails = []
for (const [rel, required] of files) {
  const abs = path.resolve(root, rel)
  if (!fs.existsSync(abs)) {
    if (required) fails.push([rel, '(file missing)'])
    else console.log(`NOTE ${rel} not present — skipped`)
    continue
  }
  const text = fs.readFileSync(abs, 'utf8')
  const seen = new Set()
  for (const m of text.matchAll(/`([^`\r\n]+)`/g)) {
    const tok = m[1].trim()
    if (!isStarterPath(tok) || PATTERN.test(tok) || seen.has(tok)) continue
    seen.add(tok)
    targets.push([rel, tok])
  }
}

// Local-only files the starter gitignores (e.g. apps/portal/.env.local) are never committed; they are
// reported as ignored instead of failing.
const ignored = []
const uncommitted = []
const deleted = []
const inTree = (p) => fs.existsSync(path.join(starter, ...p.split('/')))
for (const [rel, tok] of targets) {
  const p = tok.replace(/\/+$/, '')
  if (git(['cat-file', '-e', `HEAD:${p}`]).ok) {
    if (!inTree(p)) deleted.push(tok)
    continue
  }
  if (git(['check-ignore', '-q', '--no-index', '--', p]).ok) ignored.push(tok)
  else if (inTree(p)) uncommitted.push(tok)
  else fails.push([rel, tok])
}
for (const tok of new Set(ignored)) console.log(`NOTE gitignored in starter (not checked): ${tok}`)
for (const tok of new Set(uncommitted)) console.log(`NOTE uncommitted in starter: ${tok}`)
for (const tok of new Set(deleted)) console.log(`NOTE deleted in starter working tree (still at HEAD): ${tok}`)

// The Extension plan vocabulary (bin/lib/feature.mjs) must be the starter's own contribution kinds: each point is a
// row of plugins/README.md → What a plugin contributes (nav.portal and nav.admin count as `nav`) or a named definePlugin field.
const pluginsReadme = path.join(starter, 'plugins', 'README.md')
if (fs.existsSync(pluginsReadme)) {
  const text = fs.readFileSync(pluginsReadme, 'utf8')
  const kinds = new Set([...text.matchAll(/^\| `([A-Za-z.]+)` \|/gm)].map((m) => m[1].split('.')[0]))
  for (const p of PLUGIN_KIT_POINTS) {
    if (!kinds.has(p) && !text.includes('`' + p + '`')) fails.push(['bin/lib/feature.mjs', `contribution point "${p}" is not in the starter's plugins/README.md`])
  }
  for (const k of kinds) if (!PLUGIN_KIT_POINTS.includes(k)) console.log(`NOTE the starter contributes "${k}", which the Extension plan vocabulary does not list`)
  console.log(`NOTE contribution points checked against ${shown}/plugins/README.md (${PLUGIN_KIT_POINTS.length} points)`)
}
for (const [rel, tok] of fails) console.log(`FAIL ${rel} ${tok}`)
const distinct = new Set(targets.map(([, t]) => t)).size
const tail = `(${distinct} distinct, ${ignored.length} gitignored, ${new Set(uncommitted).size} uncommitted) against ${shown}@HEAD+working tree`
if (fails.length) {
  console.log(`${fails.length} missing of ${targets.length} paths checked ${tail}`)
  process.exit(1)
}
console.log(`OK ${targets.length} paths checked ${tail}`)
