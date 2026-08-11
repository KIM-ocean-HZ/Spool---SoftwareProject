import { useEffect, useState } from 'react';
import { spoolState, untilFull } from '@/lib/blocks/spoolProgress';
import { countCaptures, countUserWrittenChars, listCapturesSince } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import SpoolMeter, { FilledSpools } from './SpoolMeter';

// 首日价值二期 (DESIGN_FIRST_DAY_VALUE) — 「我攒了多少」.
//
// 一期 answered 「我今天读了哪三条」 and Ocean's verdict on it was 「首日价值面板内容没什么价
// 值，不添加具体内容」: the card listed three things back to the person who had just read
// them. So the previews are GONE and the card answers a different question — how much has
// piled up: what you captured, how many characters are your own, and a spool that winds.
//
// ⚠️⚠️ **`AI 写入 N 条` used to be here and was cut on purpose** (Ocean 2026-08-11:
// 「把 AI 写入去掉，太多数字显得太乱」). The count itself is not gone — `countMcpBlocks()` still
// backs the engine run card, which is where a number about what an AI did belongs. Cutting it
// is also what leaves the panel with one subject: this is 「我攒了多少」, and every line in it
// is now about the user's own pile.
//
// ⚠️ Three decisions in here are Ocean's and cost something. Don't quietly undo them:
//
// 1. **Nothing is written.** Every number is a query (一期's rule, §5-1). §2.4's 满轴数 obeys
//    it too: floor(captures / 100), never a stored counter that a deleted block turns into
//    a lie.
// 2. **The card is always here** (拍板 3), where 一期's disappeared on a day with no captures.
//    He took the cost knowingly: 一期 had just made 「most days the sidebar looks exactly as
//    it did」 part of the design, and this overrides it. A progress bar that hides on the day
//    you did nothing is missing on precisely the day it had a job. Only the 今天 line still
//    comes and goes.
// 3. **A full spool says so in place** (拍板 4) — one line and one flash, never a dialog.
//    Every notice in this app is a line where the thing is; a dialog here would be the only
//    one in the product, and it would fire while the user was in another app.
const startOfToday = (): number => {
  // Local midnight, not UTC — 「今天」 is the user's day, the one they are living in.
  // (⚠️ NOT the rule for a block's `retrievedAt`/`recheckAfter`, which are UTC days on
  // purpose so a date reads the same on both sides of a timezone. HANDOFF §6.3-13.)
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

interface Stats {
  captures: number;
  todayCount: number;
  todayChars: number;
}

/** One fact, whole: the words and the number never get separated.
 *
 *  ⚠️ This panel has been laid out five times and every round is a rule here. Ocean, in order:
 *  「右边什么都没有,而左边很紧凑」 → 「太大个了」 → 「文字和数字放一起,不能拆分到距离这么远」
 *  → 「黑色字体和灰色字体交替摆放很乱」 → 「保证线轴左边只有两行字」. What is left standing:
 *
 *  1. **A phrase is never split.** No label pinned left with its number pinned right, and no
 *     fixed column grid — a column is what cuts a phrase in half.
 *  2. **One tone, no emphasis.** Two of these used to be `text-ink` and the rest `text-muted`,
 *     which put black beside grey in whatever order the lines happened to break — emphasis
 *     that said nothing and made the panel look striped. Rank is carried by WHERE a line sits;
 *     if something here ever has to stand out, move it rather than darken it.
 *  3. **Two lines beside the meter, and they are declared, not discovered** (2026-08-11).
 *     They used to be a wrapping flow, which was the right answer while the sidebar could be
 *     dragged to any width — the count of lines was then whatever the width produced. The rail
 *     is fixed now (lib/layout.ts), so the two lines can simply BE two lines, which is the only
 *     way 「只有两行字」 is a guarantee rather than a coincidence of the current numbers. */
function Fact({ text }: { text: string }) {
  return <span className="whitespace-nowrap text-[13px] text-ink-2">{text}</span>;
}

export default function SpoolCard() {
  const t = useT();
  // Every successful capture sets this, so it doubles as "something just landed, re-read".
  const flashBlockId = useCaptureStore((s) => s.flashBlockId);
  // …and this covers the rest of what moves the numbers: writing a note, editing a body,
  // deleting a block. It changes on thread switches too, which costs three small aggregates
  // over a table this size — cheaper than a number in the corner of the eye being stale.
  const byThread = useBlocksStore((s) => s.byThread);
  const [stats, setStats] = useState<Stats | null>(null);
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    let live = true;
    const since = startOfToday();
    void Promise.all([
      countCaptures(),
      listCapturesSince(since),
      countUserWrittenChars(since),
    ]).then(([captures, today, todayChars]) => {
      if (!live) return;
      setStats({
        captures,
        todayCount: today.length,
        todayChars,
      });
    });
    return () => {
      live = false;
    };
  }, [flashBlockId, byThread, refetch]);

  // Refreshing on focus is what carries the 今天 line over midnight: startOfToday() is
  // recomputed per query, so a window left open all night corrects itself the moment it is
  // looked at rather than showing yesterday's captures under 「今天」.
  useEffect(() => {
    const onFocus = (): void => setRefetch((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (stats === null) return null;

  const spool = spoolState(stats.captures);

  return (
    /* ⚠️ A frame, but still no fill — 变体 D, which Ocean picked out of B/C/D (HANDOFF §0.10 ①).
       The two halves of that are separate decisions and both have to hold:

       - **No fill.** A card lighter than the rail it sits in is a raised object, and this panel
         is a readout, not an object (Ocean 2026-08-11: 「简洁，安静，不抢眼」).
       - **A hairline border, added back.** Unframed, the panel's own 今天 rule sat a few pixels
         from 最近's section rule with nothing to say which side of it the 今天 row belonged to —
         two horizontal lines that close together read as one paragraph break. The frame is what
         makes the inner rule an internal division rather than a boundary in the rail. */
    <div className="mt-2.5 rounded-md border border-line px-3 py-2">
      <div className="flex items-center gap-3">
        <SpoolMeter
          level={spool.level}
          full={spool.full}
          label={t('线轴：每 100 条捕捉缠满一轴')}
        />
        {/* 累计 — the whole library, in exactly two lines (see Fact() rule 3). Both are about
            this spool: how much is on it, and how much more it takes. */}
        <div className="flex min-w-0 flex-1 flex-col gap-y-0.5 leading-snug">
          <Fact text={t('你捕捉了 {n} 条', { n: stats.captures })} />
          <div className="flex items-center gap-2">
            {spool.full ? (
              <span className="whitespace-nowrap text-[13px] text-accent">
                {t('这一轴缠满了')}
              </span>
            ) : (
              <Fact text={t('还差 {n} 条缠满', { n: untilFull(spool) })} />
            )}
            {/* 总线轴数 as the spools themselves (Ocean 2026-08-10). A number says how many;
                a shelf of them is the 成就感 he asked for in §2.4 — and it costs one more
                drawing of a mark that is already on screen. Absent at zero, like every other
                count-of-nothing here: an empty shelf is a hole, not a fact.

                ⚠️ It rides on the END of the 还差 line (Ocean 2026-08-11), which is what keeps
                the block beside the meter at two lines however many spools there are — past
                what fits, FilledSpools collapses to one mark and a × N. */}
            {spool.filled > 0 && (
              <FilledSpools count={spool.filled} label={t('已缠满 {n} 轴', { n: spool.filled })} />
            )}
          </div>
        </div>
      </div>
      {/* 今天 — the one line here that is not about the whole pile, so it is not IN the flow of
          lines that are (Ocean 2026-08-11: 「历史信息…今日信息…需要在排列上做区分」). It is set
          apart by position rather than by weight: its own row, across the full width, under a
          hairline. That hairline is the only rule in the panel, which is what makes it read as
          a boundary between two kinds of statement instead of decoration.

          ⚠️ It stays INSIDE the panel — 2026-08-10 Ocean moved it in from a strip below the
          card (「今天读了 XXX 写在面板里面」). Above the rule is 累计, below it is 今天; do not
          put it back outside.

          一期's rule survives here and only here: on a day with no captures the row is absent
          while everything above it stays (拍板 3). The character count rides WITH it and is
          today's too (Ocean 2026-08-11) — a cumulative number down here would put 历史 back
          on the 今日 side of the rule, which is the whole point of the rule. */}
      {stats.todayCount > 0 && (
        <div className="mt-2 flex items-baseline gap-x-3 border-t border-line pt-1.5">
          <Fact text={t('今天读了 {n} 条', { n: stats.todayCount })} />
          <Fact text={t('写了 {n} 字', { n: stats.todayChars.toLocaleString() })} />
        </div>
      )}
    </div>
  );
}
