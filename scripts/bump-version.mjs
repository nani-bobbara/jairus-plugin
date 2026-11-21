#!/usr/bin/env node
// Bump the plugin version everywhere it is written, in one step.
//   node scripts/bump-version.mjs patch|minor|major|<x.y.z>
// Claude Code updates an installed plugin only when its version changes, so every change set that should reach
// installed copies bumps it: patch for fixes and docs, minor for new capability, major for a breaking change.
// Writes .claude-plugin/plugin.json, the README heading and its Version line, and docs/ARCHITECTURE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (...p) => path.join(root, ...p);
const how = process.argv[2];
const pj = JSON.parse(fs.readFileSync(file('.claude-plugin', 'plugin.json'), 'utf8'));
const [maj, min, pat] = pj.version.split('.').map(Number);
const next = { patch: [maj, min, pat + 1], minor: [maj, min + 1, 0], major: [maj + 1, 0, 0] }[how]?.join('.') ?? (/^\d+\.\d+\.\d+$/.test(how ?? '') ? how : null);
if (!next) { console.error('usage: bump-version.mjs patch|minor|major|<x.y.z>'); process.exit(2); }

const sub = (rel, re, to) => {
  const f = file(...rel.split('/'));
  const text = fs.readFileSync(f, 'utf8');
  if (!re.test(text)) throw new Error(`${rel}: version text not found`);
  fs.writeFileSync(f, text.replace(re, to));
};
sub('.claude-plugin/plugin.json', /"version": "[^"]+"/, `"version": "${next}"`);
sub('README.md', /^# jairus v\S+/m, `# jairus v${next}`);
sub('README.md', /^> \*\*Version \S+:/m, `> **Version ${next}:`);
sub('docs/ARCHITECTURE.md', /^Version `[^`]+`/m, `Version \`${next}\``);
console.log(`${maj}.${min}.${pat} -> ${next}`);
