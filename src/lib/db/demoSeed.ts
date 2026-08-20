import type Database from '@tauri-apps/plugin-sql';
import { nanoid } from 'nanoid';
import type { SeedLanguage } from './client';

// WORKPLAN-2026-08-20 §2.3 「载入示例项目」.
//
// The problem this solves: on a brand-new install there is nothing to pack, so the one
// thing Spool is for — hand a whole project to an AI in one paste — cannot be shown until
// the user has spent a week filling it. This project is a week's worth of use, already
// filled in. It is the ONLY way to demonstrate accumulation without accumulating.
//
// ⚠️ The content is the「Machine learning course」project from scripts/seed-demo-library.sh
// (the isolated library the website screenshots are shot from), block for block. Keeping
// the two identical is the point: a visitor who read the pack excerpt on spoolapp.org and
// then installed Spool lands on the same project, and the screenshots keep matching the
// product. If you edit one, edit both.
//
// Why THIS project and not one of the other seven in that script: it is the only one that
// carries all four authority bands, which is what makes a pack rendered from it worth
// reading —
//   an institutional source (the course page) → 📖 Reference
//   another AI's explanation                  → 🧩 Synthesis
//   the user's own decision, no source        → 💭 Personal   (and now marked 💭 inline)
//   a block an AI filed back through MCP, citing the user's decision → the ↩ cites line
// A project of plain browser captures would render a pack that shows none of that.

export interface DemoBlock {
  content: string;
  annotation?: string;
  annotationBy?: 'user' | 'ai';
  source?: string;
  /** Index (0-based) of the earlier block in this same array that this block cites. */
  cites?: number;
}

export interface DemoProject {
  title: string;
  summary: string;
  /** Days from today, so a freshly seeded project always reads as current, never as 2026. */
  deadlineInDays: number;
  blocks: DemoBlock[];
}

// The demo project is user data, so it is seeded once in the language the install starts
// in — same rule as the tutorial (client.ts SeedLanguage). The Chinese is written, not
// translated: a course note reads differently in the two languages.
export const DEMO_PROJECT: Record<SeedLanguage, DemoProject> = {
  zh: {
    title: '示例项目：机器学习课',
    summary: '这是一个装好就带的示例，按 ⌘⇧P 看看打包出来什么样。不需要了整条删掉即可。',
    deadlineInDays: 9,
    blocks: [
      {
        content: '第 6 周讲过拟合。作业要的是一条验证曲线，不是只报一个准确率。',
        source: 'course.edu · Safari',
      },
      {
        content:
          '在训练数据上表现很好、换成新数据就变差，这就是过拟合。把模型做得更大解决不了它。',
        annotation: '这一段就是我上课一直没跟上的地方。',
        annotationBy: 'user',
        source: '第 7 讲课件 · Safari',
      },
      {
        content:
          '正则化相当于给「复杂」收一笔费：模型仍然可以去贴合数据，但每多弯一下都要付出代价，所以它只留下那些划得来的弯。',
        source: 'AI 对话 · Safari',
      },
      {
        content: '复习计划：拿「收费」这个说法重做一遍习题三，然后看第 8 讲。',
      },
      {
        content:
          '周五之前：习题三第 2 题就是讲过拟合的那道，小测多半会跟它同一个路子。用「收费」那个思路做，别用更大的模型。',
        source: 'Claude · MCP',
        cites: 3,
      },
    ],
  },
  en: {
    title: 'Sample project: Machine learning course',
    summary:
      'A sample that ships with Spool — press ⌘⇧P to see what a pack looks like. Delete the whole project when you are done with it.',
    deadlineInDays: 9,
    blocks: [
      {
        content:
          'Week 6 is about overfitting. The homework wants a validation curve, not just an accuracy number.',
        source: 'course.edu · Safari',
      },
      {
        content:
          'A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.',
        annotation: 'This is the part I never followed in class.',
        annotationBy: 'user',
        source: 'Lecture 7 slides · Safari',
      },
      {
        content:
          'Regularisation is a fee charged for complexity: the model can still bend to the data, but every extra bend costs it something, so it keeps only the ones that pay for themselves.',
        source: 'AI chat · Safari',
      },
      {
        content:
          'Revision plan: redo problem set 3 with the fee idea in hand, then watch lecture 8.',
      },
      {
        content:
          'Before Friday: problem set 3 question 2 is the overfitting one — that is the question the quiz will rhyme with. Do it with the fee idea, not with a bigger model.',
        source: 'Claude · MCP',
        cites: 3,
      },
    ],
  },
};

const DAY_MS = 86_400_000;

/**
 * Inserts the demo project into `wsId` and returns its thread id.
 *
 * ⚠️ This is an INSERT and nothing else. It never drops, rebuilds or migrates — unlike the
 * tutorial seed it is reachable from a POPULATED database (Settings → 载入示例项目), which
 * is exactly the situation the 2026-05-29 wipe came out of. Adding rows to a live library
 * is safe; anything in here that is not an INSERT is not.
 *
 * Timestamps are spread backwards from now so the project reads as a month of real use,
 * and `seq` is drawn the same way blocks.ts draws it (MAX(seq)+1 per thread) rather than
 * hardcoded — a seeded row a human cannot tell from one they captured themselves.
 */
export const insertDemoProject = async (
  db: Database,
  wsId: string,
  lang: SeedLanguage,
): Promise<string> => {
  const project = DEMO_PROJECT[lang];
  const now = Date.now();
  const threadId = nanoid();

  await db.execute(
    `INSERT INTO threads (id, workspace_id, title, summary, summary_source, deadline,
                          status, is_capture_target, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'user', $5, 'active', 0, $6, $7)`,
    [
      threadId,
      wsId,
      project.title,
      project.summary,
      now + project.deadlineInDays * DAY_MS,
      now - 30 * DAY_MS,
      now - 9 * DAY_MS,
    ],
  );

  // Ages, oldest first, matching the shape of the shell seed: captured over three weeks,
  // with the last two the same afternoon (the user's decision, then the AI's reply to it).
  const daysAgo = [14, 10, 10, 9, 9];
  const ids = project.blocks.map(() => nanoid());
  for (let i = 0; i < project.blocks.length; i++) {
    const b = project.blocks[i]!;
    const citesIdx = b.cites;
    await db.execute(
      `INSERT INTO blocks (id, thread_id, kind, content, annotation, annotation_by,
                           source, pinned, ref_block_id, ref_kind, seq, created_at)
       VALUES ($1, $2, 'text', $3, $4, $5, $6, 0, $7, $8,
               (SELECT COALESCE(MAX(seq), 0) + 1 FROM blocks WHERE thread_id = $2), $9)`,
      [
        ids[i]!,
        threadId,
        b.content,
        b.annotation ?? null,
        b.annotationBy ?? null,
        b.source ?? null,
        citesIdx === undefined ? null : ids[citesIdx]!,
        citesIdx === undefined ? null : 'cites',
        now - daysAgo[i]! * DAY_MS + i * 60_000,
      ],
    );
  }
  return threadId;
};

/**
 * The sample project follows the language switch, exactly like the tutorial threads
 * (client.ts retranslateTutorial, Ocean 2026-08-03「教程的语言…需要随切换语言变化」).
 * Without this a user whose machine reports an English locale, who then switches Spool to
 * 中文, gets a Chinese UI, a Chinese tutorial — and an English sample project sitting
 * between them, on the first screen they ever see.
 *
 * Same conservative rule as the tutorial's: rewrite ONLY while every block is still
 * character-for-character as seeded. One edited block and the whole project is left alone
 * — the moment the user touches it, it is theirs, not ours. Returns whether it changed
 * anything, so the caller knows whether to reload.
 */
export const retranslateDemoProject = async (
  db: Database,
  from: SeedLanguage,
  to: SeedLanguage,
): Promise<boolean> => {
  if (from === to) return false;
  const before = DEMO_PROJECT[from];
  const after = DEMO_PROJECT[to];
  // Parallel translations; if that ever stops being true, do nothing rather than pair
  // blocks up by the wrong index.
  if (before.blocks.length !== after.blocks.length) return false;

  const threads = await db.select<{ id: string; summary: string | null }[]>(
    'SELECT id, summary FROM threads WHERE title = $1 AND deleted_at IS NULL',
    [before.title],
  );
  const thread = threads[0];
  if (!thread) return false;

  const rows = await db.select<{ id: string; content: string; annotation: string | null }[]>(
    'SELECT id, content, annotation FROM blocks WHERE thread_id = $1 ORDER BY seq ASC',
    [thread.id],
  );
  // Matched positionally rather than by search: unlike the tutorial these blocks have
  // different sources from each other, so seq order is what pairs them up.
  if (rows.length !== before.blocks.length) return false;
  for (let i = 0; i < rows.length; i++) {
    const seeded = before.blocks[i]!;
    const row = rows[i]!;
    if (row.content !== seeded.content) return false;
    if ((row.annotation ?? null) !== (seeded.annotation ?? null)) return false;
  }

  for (let i = 0; i < rows.length; i++) {
    const target = after.blocks[i]!;
    await db.execute(
      'UPDATE blocks SET content = $1, annotation = $2, source = $3 WHERE id = $4',
      [target.content, target.annotation ?? null, target.source ?? null, rows[i]!.id],
    );
  }
  // The summary is editable on its own, so it only swaps while it is still the seeded one.
  if (thread.summary === before.summary) {
    await db.execute('UPDATE threads SET title = $1, summary = $2 WHERE id = $3', [
      after.title,
      after.summary,
      thread.id,
    ]);
  } else {
    await db.execute('UPDATE threads SET title = $1 WHERE id = $2', [after.title, thread.id]);
  }
  return true;
};
