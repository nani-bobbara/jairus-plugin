#!/usr/bin/env node
// Set one variable in one or more env files from stdin, so a value never passes through a command line, the
// chat or a Write/Edit call.
//   <producer> | node env-set.mjs <KEY> <file>...
// Replaces the KEY= line or appends it; creates a missing file with mode 0600; prints nothing about the value.
// Exit 0 ok · 1 empty value · 2 misused.
import fs from 'node:fs';

const [key, ...files] = process.argv.slice(2);
if (!/^[A-Z][A-Z0-9_]*$/.test(key ?? '') || !files.length) { console.error('usage: <producer> | env-set.mjs <KEY> <file>...'); process.exit(2); }
const value = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (!value || /[\r\n]/.test(value)) { console.error(`env-set: ${key} needs a single-line, non-empty value on stdin`); process.exit(1); }

for (const file of files) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  if (lines.at(-1) === '') lines.pop();
  const at = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (at >= 0) lines[at] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(`${key} set in ${file}`);
}
