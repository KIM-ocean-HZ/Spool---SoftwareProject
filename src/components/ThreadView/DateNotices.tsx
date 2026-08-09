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
// 一条」. So it never interrupts — it is part of the project's own page. The cost he accepted
// with that choice is real: a project he does not open still says nothing.
//
// ⚠️ He also chose auto-detect + a ✕ over confirming each date, on the grounds that a feature
// which does nothing until you click something does nothing. So over-matching is EXPECTED here
// (「第 8/13 页」 is a date to the detector) and the ✕ is the designed answer, not a fallback.
//
// ⚠️ It does NOT sit at the top of the window — 「不要固定在顶部，需要可以跟随 blocks 滑动」
// (third round). It is rendered inside the feed's scroll container, above the first block, so
// it scrolls away like anything else on the page. That is why it is a card with its own margin
// rather than a full-width bar with a bottom border.

// How far ahead a date starts being raised — 「在一个月前再弹出提醒吧」 (Ocean, third round,
// after living with a version that had no cutoff at all and showed every project three
// permanent rows). ⚠️ The history behind this number is worth keeping: the FIRST build used 7
// days, which against his real library showed nothing at all — his nearest date was 23 days out
// and the application deadlines this exists for are 114–170 days out. So 7 was too tight to
// ever fire and unbounded was too loud; 30 is his answer after seeing both.
const NOTICE_WINDOW_DAYS = 30;

// Rows past this fold into a "+N more" count: it is a note above the feed, not a panel.
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
        // Today through the month ahead. A date that has already gone by is not raised: there
        // is nothing left to do about it, and his library is full of them (every source line
        // carries the day it was captured), which would bury the ones that still matter.
        if (days < 0 || days > NOTICE_WINDOW_DAYS) continue;
        if (dismissed.has(`${b.id}:${hit.at}`)) continue;
        out.push({ blockId: b.id, at: hit.at, line: hit.line, days });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }, [blocks, dismissed]);

  if (notices.length === 0) return null;

  const onDismiss = (n: Notice): void => {
    // Optimistic: the row goes now. A failed write would only mean it comes back sooner than a
    // week, which is a far smaller harm than a ✕ that appears not to work.
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
    <div
      // Warm and translucent (「做一个暖色，透明一点的」): a wash over the paper, no filled
      // background and no full-width rule, so it sits ON the feed instead of capping it.
      style={{
        background: 'var(--notice-warm)',
        borderColor: 'var(--notice-warm-edge)',
      }}
      className="mb-2 rounded-md border px-3 py-1.5"
    >
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
            title={t('先收起，一周后再提醒我')}
            aria-label={t('先收起，一周后再提醒我')}
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
