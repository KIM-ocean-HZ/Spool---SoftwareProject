import { CalendarClock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysUntil, findDates, TEXT_DATE_NOTICE_DAYS } from '@/lib/blocks/dates';
import type { Block } from '@/lib/db/blocks';
import { dismissDate, listDismissals } from '@/lib/db/dateDismissals';
import { useT } from '@/lib/i18n';
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

// Rows past this fold into a "+N more" count: the strip is a line above the feed, not a panel.
const MAX_ROWS = 3;

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
        // Today through the notice window. A date that has already gone by is not raised:
        // there is nothing left to do about it, and a project full of last year's dates
        // would bury the one that still matters.
        if (days < 0 || days > TEXT_DATE_NOTICE_DAYS) continue;
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

  const when = (days: number): string =>
    days === 0 ? t('今天') : days === 1 ? t('明天') : t('{n}天后', { n: days });

  return (
    <div className="flex-none border-b border-line bg-paper-2 px-6 py-1.5">
      {notices.slice(0, MAX_ROWS).map((n) => (
        <div key={`${n.blockId}:${n.at}`} className="flex items-center gap-2 py-0.5 text-xs">
          <CalendarClock size={12} className="flex-none text-accent" />
          <span className="flex-none font-medium text-ink">{when(n.days)}</span>
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
