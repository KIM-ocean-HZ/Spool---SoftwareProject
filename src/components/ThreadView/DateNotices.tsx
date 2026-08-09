import { CalendarClock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysUntil, findDates } from '@/lib/blocks/dates';
import type { Block } from '@/lib/db/blocks';
import { dismissDate, listDismissals } from '@/lib/db/dateDismissals';
import { dateLocale, useT } from '@/lib/i18n';
import { useSearchStore } from '@/stores/searchStore';

// 旧账 §5-3 — 「块正文里的截止日期没人管」, closed 2026-08-13.
//
// The date a user sets on a project has had a home since 08-07 (项目管理 sorts by it, cards
// colour, 周回顾 opens with it). The date sitting inside a captured block had none — and
// Ocean's 〈申请规划〉 holds a block that is nothing but Cornell application deadlines.
//
// ⚠️ Ocean chose the shape (2026-08-13), against a launch-time popup: 「不弹窗，只在项目顶上挂
// 一条」. So this is a strip above the feed, visible while the project is open, and it never
// interrupts. The cost he accepted with that choice is real and worth remembering: a project
// he does not open still says nothing.
//
// ⚠️ He also chose auto-detect + 「别再提这条」 over asking him to confirm each date, on the
// grounds that a feature which does nothing until you click something does nothing. Which
// means over-matching is EXPECTED here (「第 8/13 页」 is a date to the detector) and the ✕ is
// the designed answer to it, not a fallback.

// ⚠️ There is NO cutoff on how far ahead a date may be, and that is a decision, not an
// omission (Ocean 2026-08-13, second round). The first build only raised dates within 7 days;
// run against his real library that showed **nothing at all** — his nearest date was 23 days
// out and the application deadlines this feature exists for are 114–170 days out. A window
// wide enough for those is indistinguishable from no window, so the window went instead.
//
// What keeps it from becoming wallpaper is the row cap plus the ✕, not a date range: a project
// shows its THREE nearest upcoming dates and says how many more it is holding.
const MAX_ROWS = 3;

// Display only — how far ahead still reads better as a countdown than as a date. Nothing is
// hidden by this; 「12/1」 is more use than 「114天后」, and 「3天后」 more use than 「8/12」.
const COUNTDOWN_DAYS = 7;

interface Props {
  threadId: string;
  blocks: readonly Block[];
}

interface Notice {
  blockId: string;
  at: number;
  line: string;
  days: number;
}

export default function DateNotices({ threadId, blocks }: Props) {
  const t = useT();
  const highlight = useSearchStore((s) => s.highlight);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void listDismissals(threadId).then((s) => {
      if (live) setDismissed(s);
    });
    return () => {
      live = false;
    };
  }, [threadId]);

  const notices = useMemo<Notice[]>(() => {
    const now = Date.now();
    const out: Notice[] = [];
    for (const b of blocks) {
      for (const hit of findDates(b.content, b.createdAt)) {
        const days = daysUntil(hit.at, now);
        // Today onwards. A date that has already gone by is not raised: there is nothing left
        // to do about it, and his library is full of them (every source line carries the day
        // it was captured), which would bury the ones that still matter.
        if (days < 0) continue;
        if (dismissed.has(`${b.id}:${hit.at}`)) continue;
        out.push({ blockId: b.id, at: hit.at, line: hit.line, days });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }, [blocks, dismissed]);

  if (notices.length === 0) return null;

  const onDismiss = (n: Notice): void => {
    // Optimistic: the row goes now, the row stays gone. A failed write would only mean it
    // comes back next launch, which is a far smaller harm than a ✕ that appears not to work.
    setDismissed((prev) => new Set(prev).add(`${n.blockId}:${n.at}`));
    void dismissDate(n.blockId, n.at);
  };

  const when = (n: Notice): string => {
    if (n.days === 0) return t('今天');
    if (n.days === 1) return t('明天');
    if (n.days <= COUNTDOWN_DAYS) return t('{n}天后', { n: n.days });
    const d = new Date(n.at);
    // The year only earns its space when it is not this one — most of his deadlines are
    // 2026, and 「2027/1/5」 among them is exactly the one that needs saying.
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(
      dateLocale(),
      sameYear
        ? { month: 'numeric', day: 'numeric' }
        : { year: 'numeric', month: 'numeric', day: 'numeric' },
    );
  };

  return (
    <div className="flex-none border-b border-line bg-paper-2 px-6 py-1.5">
      {notices.slice(0, MAX_ROWS).map((n) => (
        <div key={`${n.blockId}:${n.at}`} className="flex items-center gap-2 py-0.5 text-xs">
          <CalendarClock size={12} className="flex-none text-accent" />
          <span className="flex-none font-medium text-ink">{when(n)}</span>
          <button
            type="button"
            onClick={() => highlight(n.blockId)}
            title={t('去看这一块')}
            className="min-w-0 flex-1 truncate text-left text-ink-2 transition-colors hover:text-accent"
          >
            {n.line}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(n)}
            title={t('别再提这条')}
            aria-label={t('别再提这条')}
            className="flex-none rounded p-0.5 text-muted transition-colors hover:text-accent"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {notices.length > MAX_ROWS && (
        <div className="pl-5 text-[11px] text-muted">
          {t('还有 {n} 个日子在这个项目里', { n: notices.length - MAX_ROWS })}
        </div>
      )}
    </div>
  );
}
