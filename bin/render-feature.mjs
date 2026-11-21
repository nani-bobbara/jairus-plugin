#!/usr/bin/env node
// Renders a feature spec as Markdown for a GitHub issue or PR body (QA mode: Gate P).
//   node render-feature.mjs <spec.json>
// Deterministic: the body is generated from the structured facts, never re-summarised from prose.
import fs from 'node:fs';
import { renderFeature } from './lib/feature.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: render-feature.mjs <spec.json>'); process.exit(2); }
let spec;
try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }
process.stdout.write(renderFeature(spec));
