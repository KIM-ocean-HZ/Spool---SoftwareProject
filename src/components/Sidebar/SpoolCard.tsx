import { useEffect, useState } from 'react';
import { spoolState, untilFull } from '@/lib/blocks/spoolProgress';
import {
  countCaptures,
  countMcpBlocks,
  countUserWrittenChars,
  listCapturesSince,
} from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import SpoolMeter, { FilledSpools } from './SpoolMeter';

// 首日价值二期 (DESIGN_FIRST_DAY_VALUE) — 「我攒了多少」.
//
// 一期 answered 「我今天读了哪三条」 and Ocean's verdict on it was 「首日价值面板内容没什么价
// 值，不添加具体内容」: the card listed three things back to the person who had just read
// them. So the previews are GONE and the card answers a different question — how much has
// piled up — with four numbers he asked for by name (§1): what you captured, how much of it
// an AI wrote back through MCP, how many characters are your own, and a spool that winds.
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
  mcp: number;
  chars: number;
  todayCount: number;
}

/** One fact, whole: the words and the number never get separated.
 *
 *  ⚠️ This is the third layout of this panel and every earlier one is in here as a rule.
 *  Ocean, 2026-08-10, in order: 「右边什么都没有,而左边很紧凑」 (three sentences stacked in a
 *  narrow column beside the meter), then 「太大个了」 (a full-width reel with a 2×2 grid under
 *  it), then 「文字和数字放一起,不能拆分到距离这么远」 (label pinned left, number pinned right).
 *
 *  What satisfies all three at once is a **flow of complete phrases**: each stays whole, they
 *  sit side by side while there is room, and a narrow sidebar drops one to the next line
 *  instead of truncating it. Nothing here may go back to splitting a label from its number,
 *  and nothing may go back to a fixed column count — a fixed grid is what forces a phrase to
 *  be cut when the rail is dragged narrow. */
function Fact({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <span className={`whitespace-nowrap text-[11px] ${strong ? 'text-ink' : 'text-muted'}`}>
      {text}
    </span>
  );
}

export default function SpoolCard() {
  const t = useT();
  // Every successful capture sets this, so it doubles as "something just landed, re-read".
  const flashBlockId = useCaptureStore((s) => s.flashBlockId);
  // …and this covers the rest of what moves the numbers: writing a note, editing a body,
  // deleting a block. It changes on thread switches too, which costs four small aggregates
  // over a table this size — cheaper than a number in the corner of the eye being stale.
  const byThread = useBlocksStore((s) => s.byThread);
  const [stats, setStats] = useState<Stats | null>(null);
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([
      countCaptures(),
      countMcpBlocks(),
      countUserWrittenChars(),
      listCapturesSince(startOfToday()),
    ]).then(([captures, mcp, chars, today]) => {
      if (!live) return;
      setStats({
        captures,
        mcp,
        chars,
        todayCount: today.length,
      });
    });
    return () => {
      live = false;
    };
  }, [flashBlockId, byThread, refetch]);

  // Refreshing on focus is what carries the 今天 line over midnight: startOfToday() is
  // recomputed per query, so a window left open all night corrects itself the moment it is
  // looked at rather than showing yesterday's captures under 「今天」. It is also the only
  // thing that notices what an AI wrote through MCP — that happens in another process.
  useEffect(() => {
    const onFocus = (): void => setRefetch((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (stats === null) return null;

  const spool = spoolState(stats.captures);

  return (
    <div className="mb-2 rounded-md border border-line bg-paper px-3 py-2">
      <div className="flex items-center gap-3">
        <SpoolMeter
          level={spool.level}
          full={spool.full}
          label={t('线轴：每 100 条捕捉缠满一轴')}
        />
        {/* One wrapping flow, not a grid — see Fact() above for why. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 leading-snug">
          <Fact strong text={t('你捕捉了 {n} 条', { n: stats.captures })} />
          <Fact text={t('AI 写入 {n} 条', { n: stats.mcp })} />
          <Fact text={t('我一共写了 {n} 字', { n: stats.chars.toLocaleString() })} />
          {/* 一期's rule survives here and only here: on a day with no captures this one
              phrase is absent, while everything else in the panel stays (拍板 3). */}
          {stats.todayCount > 0 && (
            <Fact strong text={t('今天读了 {n} 条', { n: stats.todayCount })} />
          )}
          {spool.full ? (
            <span className="whitespace-nowrap text-[11px] text-accent">
              {t('这一轴缠满了')}
            </span>
          ) : (
            <Fact text={t('还差 {n} 条缠满', { n: untilFull(spool) })} />
          )}
          {/* 总线轴数 as the spools themselves (Ocean 2026-08-10). A number says how many;
              a shelf of them is the 成就感 he asked for in §2.4 — and it costs one more
              drawing of a mark that is already on screen. Absent at zero, like every other
              count-of-nothing here: an empty shelf is a hole, not a fact. */}
          {spool.filled > 0 && (
            <FilledSpools count={spool.filled} label={t('已缠满 {n} 轴', { n: spool.filled })} />
          )}
        </div>
      </div>
    </div>
  );
}
