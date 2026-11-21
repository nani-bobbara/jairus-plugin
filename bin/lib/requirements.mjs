// What a starter requires, read from the starter itself at run time (rules/starter-contract.md → What the
// plugin reads): runtime and package manager from package.json and .nvmrc, the environment variables from
// .env.example. Nothing about a starter is hardcoded here, and no value of any variable is ever read into a
// result: status is presence by name only.
import fs from 'node:fs';
import path from 'node:path';

const VAR = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const GENERATABLE = /openssl rand|random|generate/i;

/** Parse .env.example into sections of variables with the starter's own comments and consumer tags. */
export function parseEnvExample(text) {
  const lines = text.split(/\r?\n/);
  const envFiles = [...new Set(lines.slice(0, 8).join('\n').match(/[A-Za-z0-9_./-]*\.env(?:\.local)?\b/g) ?? [])].filter((f) => f.includes('/'));
  const sections = [];
  let section = { name: '(general)', consumers: '', vars: [] };
  let comments = [];
  const flush = () => { if (section.vars.length) sections.push(section); };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const header = /^#\s*──\s*(.+?)\s*─{2,}\s*(.*)$/.exec(line);
    if (header) { flush(); section = { name: header[1].trim(), consumers: header[2].trim(), vars: [] }; comments = []; continue; }
    if (line.startsWith('#')) { comments.push(line.replace(/^#\s?/, '')); continue; }
    const v = VAR.exec(line);
    if (v) {
      const last = comments.at(-1) ?? '';
      const tail = /\S\s{2,}(\S.*)$/.exec(last);
      const consumers = tail ? tail[1].trim() : section.consumers;
      const comment = comments.map((c) => c.replace(/\s{2,}\S.*$/, '').trim()).filter(Boolean).join(' ');
      section.vars.push({ name: v[1], comment, consumers, generatable: GENERATABLE.test(comments.join(' ')) });
      comments = [];
      continue;
    }
    if (line.trim() === '') comments = [];
  }
  flush();
  return { envFiles, sections };
}

/** Read package.json, .nvmrc and .env.example of a starter (or a product copy of it). */
export function readRequirements(dir, fsImpl = fs) {
  const read = (...p) => { try { return fsImpl.readFileSync(path.join(dir, ...p), 'utf8'); } catch { return null; } };
  const pkgText = read('package.json');
  const pkg = pkgText ? JSON.parse(pkgText) : null;
  const env = read('.env.example');
  const parsed = env ? parseEnvExample(env) : { envFiles: [], sections: [] };
  return {
    dir,
    name: pkg?.name ?? null,
    nodeEngines: pkg?.engines?.node ?? null,
    nvmrc: read('.nvmrc')?.trim() ?? null,
    packageManager: pkg?.packageManager ?? null,
    envFiles: parsed.envFiles,
    sections: parsed.sections,
  };
}

/** The lowest version an engines range such as ">=22.13" allows, as [major, minor]; null when not simple. */
export function minVersion(range) {
  const m = /(\d+)(?:\.(\d+))?/.exec(range ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}

/** Which variables are set, by name only. Env files are read for `KEY=value` lines; values are discarded. */
export function envStatus(dir, req, fsImpl = fs) {
  const setIn = new Map();
  const files = {};
  for (const rel of req.envFiles) {
    let text = null;
    try { text = fsImpl.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'); } catch { /* absent */ }
    files[rel] = text !== null;
    if (text === null) continue;
    for (const line of text.split(/\r?\n/)) {
      const m = VAR.exec(line.trim());
      if (m && m[2].trim() !== '') setIn.set(m[1], [...(setIn.get(m[1]) ?? []), rel]);
    }
  }
  const variables = req.sections.flatMap((s) => s.vars.map((v) => ({ section: s.name, ...v, setIn: setIn.get(v.name) ?? [] })));
  return { files, variables, missing: variables.filter((v) => v.setIn.length === 0).map((v) => v.name) };
}
