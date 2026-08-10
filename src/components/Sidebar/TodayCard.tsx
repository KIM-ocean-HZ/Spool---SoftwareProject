import { CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildPreview, useCaptureStore } from '@/stores/captureStore';
import type { Block } from '@/lib/db/blocks';
import { listCapturesSince } from '@/lib/db/blocks';
import { useT } from '@/lib/i18n';
import { useSearchStore } from '@/stores/searchStore';
import { useThreadsStore } from '@/stores/threadsStore';

// 首日价值 (DESIGN_NEXT_STAGE §4.5) — 「今天读了什么」.
//
// The gap it closes: a new user captures three things and then has no reason to open Spool
// again, because nothing in the window says the day added up to anything. This says it, and
// puts the one action that pays off (打个包) next to the evidence.
//
// ⚠️ Ocean chose the shape twice, 2026-08-10, and neither was the recommendation:
//
// 1. **It is a view, not a block.** Nothing is written. The alternative — one assembled block
//    per day — would have cost 365 blocks a year against a project's pack budget
//    (DESIGN_CONTEXT_HYGIENE, HANDOFF §4-8) to record mostly nothing. The cost he took: the
//    card is gone tomorrow and cannot be looked up again.
// 2. **It lives in the left sidebar, not above the block feed.** The feed was the cheaper
//    build (DateNotices already owns that slot and its scroll behaviour) but is only visible
//    inside one project; he wanted it unavoidable. The cost he took: the sidebar is a list of
//    projects, and this is the first thing in it that is not one.
//
// It renders nothing at all when the day has no captures, so on most days the sidebar is
// exactly what it was.
const MAX_ROWS = 3;

// Local midnight, not UTC — 「今天」 here is the user's day, the one they are living in.
// (⚠️ NOT the rule for a block's `retrievedAt`/`recheckAfter`, which are UTC days on purpose
// so a date reads the same on both sides of a timezone. HANDOFF §6.3-13.)
const startOfToday = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function TodayCard() {
  const t = useT();
  const select = useThreadsStore((s) => s.select);
  const setPacking = useThreadsStore((s) => s.setPacking);
  const highlight = useSearchStore((s) => s.highlight);
  // Every successful capture sets this, so it doubles as "something just landed, re-read".
  const flashBlockId = useCaptureStore((s) => s.flashBlockId);
  const [captures, setCaptures] = useState<readonly Block[]>([]);
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    let live = true;
    void listCapturesSince(startOfToday()).then((rows) => {
      if (live) setCaptures(rows);
    });
    return () => {
      live = false;
    };
  }, [flashBlockId, refetch]);

  // Refreshing on focus is what carries the card over midnight: startOfToday() is recomputed
  // per query, so a window left open all night corrects itself the moment it is looked at
  // rather than showing yesterday's three under 「今天」.
  useEffect(() => {
    const onFocus = (): void => setRefetch((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (captures.length === 0) return null;

  const goTo = (b: Block): void => {
    if (b.threadId !== useThreadsStore.getState().activeId) select(b.threadId);
    highlight(b.id);
  };

  // Whichever project the newest capture landed in — with a single capture target that is
  // the same project for all of them, and after a move it is still the one they are in now.
  const packTarget = captures[0]?.threadId;

  return (
    <div className="mb-2 rounded-md border border-line bg-paper px-3 py-2">
      <div className="flex items-center gap-2">
        <CalendarDays size={12} className="flex-none text-muted" />
        <span className="min-w-0 flex-1 truncate text-xs text-ink">
          {t('今天读了 {n} 条', { n: captures.length })}
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
      {captures.slice(0, MAX_ROWS).map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => goTo(b)}
          title={t('去看这一块')}
          className="flex w-full items-baseline gap-1.5 py-0.5 pl-5 text-left text-[11px] transition-colors hover:text-accent"
        >
          {b.source !== null && <span className="flex-none text-muted">{b.source}</span>}
          <span className="min-w-0 flex-1 truncate text-ink-2">{buildPreview(b.content, 24)}</span>
        </button>
      ))}
      {captures.length > MAX_ROWS && (
        <div className="pl-5 text-[11px] text-muted">
          {t('还有 {n} 条', { n: captures.length - MAX_ROWS })}
        </div>
      )}
    </div>
  );
}
