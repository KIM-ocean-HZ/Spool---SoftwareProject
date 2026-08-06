import { CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import StatusDot from '@/components/ui/StatusDot';
import { countBlocksByThread } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { DUE_SOON_DAYS, dueInDays } from '@/lib/threads/deadline';
import { dateLocale, useT } from '@/lib/i18n';
import { useThreadsStore } from '@/stores/threadsStore';

// DESIGN_WORKBENCH §9.4 — 项目管理's own workspace: the project matrix.
//
// Ocean 2026-08-07, correcting the first attempt: 「它的工作区用来存放项目矩阵」. The first
// version put this in the right rail, folded — 「没有占据位置，用户并不会使用」, and sharing a
// panel with the current project's own things 「会有歧义」. Both are fixed by it being here:
// this is the only surface in the app wide enough for a matrix, and it is unambiguously
// about ALL projects because it replaces the one project you would otherwise be reading.
//
// What a card carries, and why each earns its space:
//   * 完成情况 — the status dot plus how many blocks are in it. "How much is in there" is
//     the cheapest honest answer to "how far along is this".
//   * DDL — coloured by urgency, because that is the whole reason to sort by it.
//   * 摘要 — Ocean asked for it here explicitly. It is the project's own one-line card, so
//     the board reads as a shelf of catalogue cards rather than a list of names.
//
// ⚠️ **No 总结项目 button.** It was in the first version and Ocean cut it: 「总结项目去掉,
// 没有用」. 压缩 stays where it belongs — the right rail of the project it compresses.
//
// ⚠️ Clicking a card JUMPS to that project (§9.4). That is a deliberate reversal of this
// section's original warning about not becoming a second navigator: the warning was written
// when this lived in the rail beside the sidebar. Now it *is* reached from the sidebar, and
// a card you cannot open would be a dead end.

type Sort = 'deadline' | 'created';

export default function ProjectBoard() {
  const t = useT();
  const byWorkspace = useThreadsStore((s) => s.threadsByWorkspace);
  const select = useThreadsStore((s) => s.select);
  const setCompleting = useThreadsStore((s) => s.setCompleting);
  const [sort, setSort] = useState<Sort>('deadline');
  const [counts, setCounts] = useState<Record<string, number>>({});

  // One grouped scan for the whole board. Re-read when the project list changes, which is
  // also when a block was written by anything this window knows about.
  useEffect(() => {
    void countBlocksByThread()
      .then(setCounts)
      .catch((e) => console.warn('[board] block counts failed', e));
  }, [byWorkspace]);

  const now = Date.now();
  // ⚠️ Subscribe to the map and flatten here — `selectAllThreadsFlat` as a hook selector
  // returns a fresh array every call and loops React until it gives up (threadsStore's note).
  const { live, done } = useMemo(() => {
    const all = Object.values(byWorkspace).flat();
    const cmp = (a: Thread, b: Thread): number => {
      if (sort === 'deadline') {
        const da = dueInDays(a, now);
        const db = dueInDays(b, now);
        // A project with no deadline is not "due last", it is not on the clock at all — so
        // it sits below everything that is, rather than at some invented far-future date.
        if (da !== db) {
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        }
      }
      return b.createdAt - a.createdAt;
    };
    return {
      live: all.filter((th) => th.status !== 'done').sort(cmp),
      done: all.filter((th) => th.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    };
  }, [byWorkspace, sort, now]);

  const card = (th: Thread, dim: boolean) => {
    const days = dueInDays(th, now);
    const colour =
      days === null
        ? 'var(--muted)'
        : days < 0
          ? 'var(--urgent)'
          : days <= DUE_SOON_DAYS
            ? 'var(--status-parked)'
            : 'var(--muted)';
    const n = counts[th.id] ?? 0;
    return (
      <li key={th.id}>
        <div
          onClick={() => select(th.id)}
          className={`group flex h-full cursor-pointer flex-col rounded-lg border border-line bg-paper p-3 transition-colors hover:border-accent/60 ${
            dim ? 'opacity-55' : ''
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-[7px] flex-none">
              <StatusDot status={th.status} />
            </span>
            <span className="min-w-0 flex-1 truncate font-serif text-base text-ink">
              {th.title.trim() || t('无标题')}
            </span>
            {th.status !== 'done' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCompleting(th.id);
                }}
                title={t('完成项目')}
                aria-label={t('完成项目')}
                className="invisible flex-none rounded p-0.5 text-muted transition-colors hover:text-accent group-hover:visible"
              >
                <CheckCircle2 size={13} />
              </button>
            )}
          </div>

          {/* 摘要 — the project's own catalogue card, written by hand or by a connected AI. */}
          <p className="mt-1.5 line-clamp-3 min-h-[2.4em] text-[11px] italic leading-relaxed text-muted">
            {th.status === 'done' ? th.digest || th.summary || '' : th.summary || ''}
          </p>

          <div className="mt-2 flex items-baseline justify-between gap-2 text-[10px]">
            <span className="font-mono text-muted">{t('{n} 块', { n })}</span>
            {th.status === 'done' ? (
              <span className="text-muted">
                {th.completedAt
                  ? t('{when} 完成', {
                      when: new Date(th.completedAt).toLocaleDateString(dateLocale(), {
                        month: 'short',
                        day: 'numeric',
                      }),
                    })
                  : t('已完成')}
              </span>
            ) : (
              days !== null && (
                <span className="font-mono" style={{ color: colour }}>
                  {days < 0
                    ? t('迟 {n} 天', { n: -days })
                    : days === 0
                      ? t('今天到期')
                      : t('还有 {n} 天', { n: days })}
                </span>
              )
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-none items-baseline justify-between gap-3 border-b border-line px-6 py-3">
        <h2 className="font-serif text-2xl text-ink">{t('项目管理')}</h2>
        <div className="flex items-center gap-1 text-xs">
          {(['deadline', 'created'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                sort === k ? 'text-ink' : 'text-muted hover:text-ink-2'
              }`}
            >
              {k === 'deadline' ? t('按截止日期') : t('按新建时间')}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {live.length === 0 && done.length === 0 ? (
          <p className="pt-12 text-center text-sm text-muted">{t('还没有项目。按 ⌘N 新建一个。')}</p>
        ) : (
          <>
            {/* The matrix. Auto-fill rather than a fixed column count: this view lives in the
                centre column, which the user resizes by dragging either rail. */}
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {live.map((th) => card(th, false))}
            </ul>
            {done.length > 0 && (
              <>
                <div className="mb-2 mt-6 text-[10px] uppercase tracking-wide text-muted">
                  {t('已完成')}
                </div>
                <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                  {done.map((th) => card(th, true))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
