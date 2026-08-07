#!/usr/bin/env node
// Hard rule 12 (language, both sides) has no compiler behind it — a Chinese string that
// never reaches the dictionary simply shows up as Chinese to an English user, and English
// is the DEFAULT language (memory `ui-language-follows-system`). That is how the whole
// right rail shipped untranslated on 2026-08-06 and nobody noticed for a window.
//
// This used to be a snippet pasted into HANDOFF.md. It is a file now for one reason: the
// pasted version only matched `t('…')` with SINGLE quotes, so every string in a file
// Prettier had left double-quoted was invisible to it — the check reported clean while
// three strings were missing (found 2026-08-07). A checker that under-reports is worse than
// no checker, and a checker that lives in a document cannot be fixed once.
//
//   node scripts/i18n-check.mjs          → missing keys, or "(none)"
//   node scripts/i18n-check.mjs --dead   → also list dictionary keys nothing uses any more
//
// Exit code is 1 when something is missing, so it can gate a commit if that is ever wanted.
//
// ⚠️ It only sees STRING LITERALS passed to t()/ts(). A call like `t(SOME_CONST)` is beyond
// it — those are usually label tables (engineStore's ACTION_LABEL, pack templates), whose
// values must be in the dictionary too. Check those by eye when you add one.
import fs from 'node:fs';
import path from 'node:path';

const DICT = 'src/lib/i18n/index.ts';

const sources = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) sources.push(p);
  }
})('src');

const dict = fs.readFileSync(DICT, 'utf8');
const hasChinese = (s) => /[一-鿿]/.test(s);
// Quoted key, either quote style, escapes honoured; `\s*` covers a call broken over lines.
const CALL = /\bts?\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
const inDict = (key) => dict.includes(`'${key}'`) || dict.includes(`"${key}"`);

const used = new Map();
for (const file of sources) {
  if (path.normalize(file) === path.normalize(DICT)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(CALL)) {
    if (hasChinese(m[2]) && !used.has(m[2])) used.set(m[2], file);
  }
}

const missing = [...used].filter(([key]) => !inDict(key));
for (const [key, file] of missing) console.log(`MISSING  ${key}\t${file}`);

if (process.argv.includes('--dead')) {
  const declared = [...dict.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]);
  const body = sources
    .filter((f) => path.normalize(f) !== path.normalize(DICT))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  for (const key of declared) {
    if (!body.includes(`'${key}'`) && !body.includes(`"${key}"`)) console.log(`DEAD     ${key}`);
  }
}

if (missing.length === 0) console.log('(none missing)');
process.exit(missing.length === 0 ? 0 : 1);
