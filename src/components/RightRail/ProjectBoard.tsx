import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import type { Thread } from '@/lib/db/threads';
import { useT } from '@/lib/i18n';
import { ACTION_LABEL, useEngineStore, type EngineAction } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

// DESIGN_WORKBENCH §9.4 — the project management area, pinned at the top of the rail.
//
// Ocean's own structure: the rail carries two kinds of thing, 当前项目 and 全部项目, and the
// second half had been squeezed into one cell labelled 「全部项目」 holding a single button.
// This is that half given a home — 「主页面显示各个项目的完成情况、DDL、周回顾等等……用户能在
// 这里直接快捷完成项目、总结项目」.
//
// ⚠️ §9.4's own warning, and the line this component must not cross: **it is not a second
// navigator.** The left sidebar answers "which project am I going to"; this answers "which
// project needs me". So a row's controls FINISH or COMPRESS a project — none of them changes
// what is on screen. The moment a row becomes a way to open a project, it is the redundancy
// R3 just deleted, rebuilt in a new place.
//
// Pinned but folded: §9.1 gives the main area to the streaming run and the review queue, so
// the resting state is one line that says whether anything is due. That line is the taking
// stock; opening it is the acting on it.

/** Inside this many days a deadline stops being a date and starts being a reason to look. */
const DUE_SOON_DAYS = 3;

const dayDiff = (deadline: number, now: number): number =>
  Math.ceil((deadline - now) / 86_400_000);

interface Props {
  /** Whether the engine actions can run at all (CLI present + both MCP switches on). */
  engineReady: boolean;
  /** True while any run holds the queue — the whole board's actions wait, since runs are
   *  serial by design (DESIGN_AI_ENGINE §1.2). */
  busy: boolean;
}

export default function ProjectBoard({ engineReady, busy }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [byDeadline, setByDeadline] = useState(true);

  // ⚠️ Subscribe to the map and flatten in a useMemo. NEVER `useThreadsStore(
  // selectAllThreadsFlat)` — a selector that builds a fresh array every call loops React
  // until it gives up, and the symptom is a white window (threadsStore's own note).
  const byWorkspace = useThreadsStore((s) => s.threadsByWorkspace);
  const setCompleting = useThreadsStore((s) => s.setCompleting);
  const enqueue = useEngineStore((s) => s.enqueue);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);
  const update = useSettingsStore((s) => s.update);

  const now = Date.now();
  const live = useMemo(() => {
    const all = Object.values(byWorkspace).flat().filter((th) => th.status !== 'done');
    return all.sort((a, b) => {
      if (byDeadline) {
        // A project with no deadline is not "due last", it is "not on the clock" — so it
        // sorts below everything that is, rather than at some invented far-future date.
        if (a.deadline !== b.deadline) {
          if (a.deadline === null) return 1;
          if (b.deadline === null) return -1;
          return a.deadline - b.deadline;
        }
      }
      return b.createdAt - a.createdAt;
    });
  }, [byWorkspace, byDeadline]);

  const pressing = live.filter(
    (th) => th.deadline !== null && dayDiff(th.deadline, now) <= DUE_SOON_DAYS,
  ).length;

  const run = (th: Thread, action: EngineAction): void => {
    enqueue(th.id, th.title, action, timeoutSecs);
  };

  return (
    <section className="flex-none border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-paper-2"
      >
        {open ? (
          <ChevronDown size={11} className="flex-none text-muted" />
        ) : (
          <ChevronRight size={11} className="flex-none text-muted" />
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
          {t('{n} 个项目在进行', { n: live.length })}
        </span>
        {/* The one number worth reading without opening anything. */}
        {pressing > 0 && (
          <span className="flex-none text-[10px]" style={{ color: 'var(--status-parked)' }}>
            {t('{n} 个快到期', { n: pressing })}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="text-[10px] uppercase tracking-wide text-muted">{t('全部项目')}</span>
            <button
              type="button"
              onClick={() => setByDeadline((v) => !v)}
              className="text-[10px] text-muted transition-colors hover:text-accent"
            >
              {byDeadline ? t('按截止日期') : t('按新建时间')}
            </button>
          </div>

          <ul className="space-y-0.5">
            {live.map((th) => {
              const days = th.deadline === null ? null : dayDiff(th.deadline, now);
              const colour =
                days === null
                  ? 'var(--muted)'
                  : days < 0
                    ? 'var(--urgent)'
                    : days <= DUE_SOON_DAYS
                      ? 'var(--status-parked)'
                      : 'var(--muted)';
              return (
                <li
                  key={th.id}
                  className="group flex items-center gap-1.5 rounded px-1 py-1 hover:bg-paper-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                    {th.title || t('无标题')}
                  </span>
                  {days !== null && (
                    <span className="flex-none font-mono text-[10px]" style={{ color: colour }}>
                      {days < 0
                        ? t('迟 {n} 天', { n: -days })
                        : days === 0
                          ? t('今天')
                          : t('{n} 天', { n: days })}
                    </span>
                  )}
                  {/* §9.4: 「直接快捷完成项目、总结项目」. Neither of these navigates. */}
                  {engineReady && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(th, 'distill')}
                      title={t('把这个项目压成一条结论')}
                      aria-label={t(ACTION_LABEL.distill)}
                      className="flex-none rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 disabled:opacity-0"
                    >
                      <Sparkles size={11} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCompleting(th.id)}
                    title={t('完成项目')}
                    aria-label={t('完成项目')}
                    className="flex-none rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                  >
                    <CheckCircle2 size={11} />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* §3.4 / §9.5 — the weekly review is a whole-library action, so this is the only
              place it belongs. It files into a 「回顾」 project of its own, created the first
              time one is actually stored. There is deliberately no per-project weekly review:
              that is 压缩 under another name (§9.5 conflict one, decided). */}
          {engineReady && (
            <button
              type="button"
              disabled={busy}
              onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
              title={t('回顾最近一周——跨所有项目，存进「回顾」项目')}
              className="mt-1.5 flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
            >
              <CalendarRange size={11} className="flex-none" />
              {t(ACTION_LABEL.weekly_review)}
            </button>
          )}

          {/* §4.3 — automation, where the runs it produces show up rather than buried in
              settings. Default OFF: it spends real money without asking again. */}
          {engineReady && (
            <label className="mt-1.5 flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-[11px] text-ink-2">{t('自动维护')}</span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
                  {t('项目有新内容、放了一阵子之后，自动压一次。每个项目一天最多一次，周回顾一周一次。')}
                </span>
              </span>
              <Toggle checked={autoMaintain} onChange={(v) => void update({ aiAutoMaintain: v })} />
            </label>
          )}
        </div>
      )}
    </section>
  );
}
