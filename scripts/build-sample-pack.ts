/* Renders site/sample-pack.md — the "try it without installing anything" file
   (WORKPLAN-2026-08-20 §2.4).

   Run: npx vite-node scripts/build-sample-pack.ts

   ⚠️ The whole point is that this file is NOT written by hand. It goes through the same
   assemble() the app's ⌘⇧P goes through, from the same rows Spool seeds into a fresh
   install (lib/db/demoSeed.ts). So the thing a visitor pastes into their AI is byte-for-byte
   what they would get after installing — including the instruction header, the 💭 markers
   and the ↩ cites line. A hand-written "example pack" would drift from the renderer within
   one release, and the first person to notice would be someone who had already installed.

   Dates are pinned (see NOW below) rather than relative: the file is committed, and a
   generator whose output changes every day would show up as a diff on every run.
*/
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Block } from '../src/lib/db/blocks';
import { DEMO_PROJECT } from '../src/lib/db/demoSeed';
import type { SeedLanguage } from '../src/lib/db/client';
import type { Thread } from '../src/lib/db/threads';
import { assemble } from '../src/lib/pack/assemble';

// ⚠️ Set BEFORE any Date is formatted. The pack prints LOCAL wall-clock times, so without
// this the committed file would differ per machine — the same class of bug as regenerating
// the pack golden in the wrong zone (see that commit). UTC keeps it machine-independent.
process.env.TZ = 'UTC';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// A fixed "today" so re-running the script produces no diff. The clock times below are the
// ones the shell seed uses, so the story reads like a month of ordinary study days.
const DAY = '2026-08-20';
const NOW = Date.parse(`${DAY}T17:00:00Z`);
const at = (day: string, hhmm: string): number => Date.parse(`${day}T${hhmm}:00Z`);
const CAPTURED = [
  at('2026-08-06', '10:20'),
  at('2026-08-10', '11:40'),
  at('2026-08-10', '14:05'),
  at('2026-08-11', '16:30'),
  at('2026-08-11', '16:42'),
];

const render = (lang: SeedLanguage): string => {
  const project = DEMO_PROJECT[lang];
  const ids = project.blocks.map((_, i) => `sample-${i + 1}`);

  const thread: Thread = {
    id: 'sample-thread',
    title: project.title,
    summary: project.summary,
    summarySource: 'user',
    deadline: NOW + project.deadlineInDays * 86_400_000,
  } as Thread;

  const blocks: Block[] = project.blocks.map((b, i) => ({
    id: ids[i]!,
    kind: 'text',
    seq: i + 1,
    content: b.content,
    annotation: b.annotation ?? null,
    annotationBy: b.annotationBy ?? null,
    source: b.source ?? null,
    pinned: false,
    refBlockId: b.cites === undefined ? null : ids[b.cites]!,
    refKind: b.cites === undefined ? null : 'cites',
    createdAt: CAPTURED[i]!,
  })) as Block[];

  // Without this the ↩ cites line renders as "(cited block no longer exists)": assemble()
  // takes the cited block's text from the caller, because a citation may point outside the
  // project being packed. Here every citation is internal, so the map is built from the
  // same array.
  const refBlocks = new Map(
    blocks.map((b) => [b.id, { content: b.content, createdAt: b.createdAt, annotation: b.annotation }]),
  );

  return assemble({ thread, blocks, refBlocks, now: NOW });
};

// Under site/assets/ rather than site/ because build-site-zh.mjs rewrites exactly one
// shape of relative path — `assets/…` → `../assets/…` — when it bakes the pages one
// directory down. A bare `sample-pack.md` href would resolve to site/zh/sample-pack.md
// and 404 on the Chinese site only, which is the kind of break nobody sees for weeks.
for (const [lang, file] of [
  ['en', 'sample-pack.md'],
  ['zh', 'sample-pack.zh.md'],
] as const) {
  const pack = render(lang);
  const out = join(ROOT, 'site', 'assets', file);
  writeFileSync(out, pack);
  console.log(`wrote site/assets/${file} — ${pack.length} chars`);
}
