import { CalendarDays } from 'lucide-react';
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
import { useThreadsStore } from '@/stores/threadsStore';
import SpoolMeter from './SpoolMeter';

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
  /** Where 打个包 would go: whichever project today's newest capture landed in. */
  packTarget: string | undefined;
}

/** One number in the panel: what it is on the left, how much on the right. The value column
 *  is tabular so the digits line up down the card rather than dancing with the font's
 *  proportional widths. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd
        className={`flex-none tabular-nums ${strong ? 'text-xs text-ink' : 'text-[11px] text-ink-2'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function SpoolCard() {
  const t = useT();
  const setPacking = useThreadsStore((s) => s.setPacking);
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
        packTarget: today[0]?.threadId,
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
  const { packTarget } = stats;

  return (
    <div className="mb-2 rounded-md border border-line bg-paper px-3 py-2">
      {/* ⚠️ **Label left, number right — the numbers make a column against the right edge.**
          Ocean rejected two earlier versions of this text, and both faults are answered here
          (2026-08-10): three whole sentences stacked beside the meter left 「右边什么都没有,
          而左边很紧凑」, and a full-width reel with a 2×2 grid under it was 「太大个了」.
          What the panel needed was never more room — it was for the words to stop being
          sentences. Don't put 「你攒了 N 条」 back: a sentence has to end somewhere, and where
          it ends is the ragged left block he objected to. */}
      <div className="flex items-center gap-3">
        <SpoolMeter
          level={spool.level}
          full={spool.full}
          label={t('线轴：每 100 条捕捉缠满一轴')}
        />
        <dl className="min-w-0 flex-1 leading-snug">
          <Row label={t('你攒的')} value={t('{n} 条', { n: stats.captures })} strong />
          <Row label={t('AI 写回')} value={t('{n} 条', { n: stats.mcp })} />
          <Row label={t('我写的')} value={t('{n} 字', { n: stats.chars.toLocaleString() })} />
        </dl>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        {spool.full ? (
          <span className="truncate text-accent">{t('这一轴缠满了')}</span>
        ) : (
          <span className="truncate text-muted">
            {t('还差 {n} 条缠满', { n: untilFull(spool) })}
          </span>
        )}
        <span className="flex-none text-muted">{t('已缠满 {n} 轴', { n: spool.filled })}</span>
      </div>

      {stats.todayCount > 0 && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5">
          <CalendarDays size={12} className="flex-none text-muted" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
            {t('今天读了 {n} 条', { n: stats.todayCount })}
          </span>
          {packTarget !== undefined && (
            <button
              type="button"
              onClick={() => setPacking(packTarget)}
              className="flex-none rounded text-[11px] text-muted transition-colors hover:text-accent"
            >
              {t('打个包试试 →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
