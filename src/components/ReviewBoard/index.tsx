import { CalendarRange, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { listRunsForAction, type EngineRun } from '@/lib/db/engineRuns';
import { canShowEngineActions } from '@/lib/engine/gate';
import { dateLocale, useT } from '@/lib/i18n';
import { ACTION_LABEL, ENGINE_LABEL, useEngineStore, type EngineKind } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CENTRE_HEADER_HEIGHT } from '@/lib/layout';

// 周回顾 — its own pinned view, beside 项目管理.
//
// Ocean 2026-08-11, after finding a project called 「回顾」 sitting inside his 升学 workspace:
//
//   「周回顾出现在了升学规划区？是对应每个规划区一个回顾吗？还是什么逻辑？
//     周回顾在左侧边栏的位置应该和项目管理一起吧，作为独立工作区出现」
//
// He was reading a bug correctly. A review reads the WHOLE library, and the old code had
// nowhere to put one, so it improvised twice over:
//
//   * the run card filed its text into `workspaces[0]` — whichever workspace happened to sort
//     first. That is how 「回顾」 ended up under 升学: not a rule, an accident.
//   * the card itself was shown in every project's right rail, because a run belonging to no
//     project was treated as belonging to all of them. Read from inside one project, that is
//     indistinguishable from "this project has a review".
//
// Both are gone. A review is not a block and not a project: it is the record of a week, it
// lives in `engine_runs` where it has always been durable, and this view is where it is read.
// Nothing is written into the library for it at all — which also means no find-or-create runs
// against the user's threads, the shape of thing memory `spool-db-wipe-incident` is about.
//
// ⚠️ This is the honest half of a bigger open question. Ocean's verdict the same day was that
// 周回顾 is the action worth building on ("他会告诉用户每个项目做了什么，还有什么没做，可以和
// 截止日期放在一起，作为日程进度的回报") — pairing it with deadlines is NOT built here, and is
// written up in DESIGN_WORKBENCH §11 rather than guessed at.

/** §5 — spend, never remaining quota; same rule and same reason as RunCard's. */
const money = (usd: number | null): string | null =>
  usd === null ? null : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;

export default function ReviewBoard() {
  const t = useT();
  const current = useEngineStore((s) => s.current);
  const runs = useEngineStore((s) => s.runs);
  const enqueue = useEngineStore((s) => s.enqueue);
  const engineStatus = useEngineStore((s) => s.status);
  const probe = useEngineStore((s) => s.probe);

  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);
  const update = useSettingsStore((s) => s.update);

  const [reviews, setReviews] = useState<EngineRun[] | null>(null);

  useEffect(() => {
    if (engineStatus === null) void probe();
  }, [engineStatus, probe]);

  const load = useCallback(() => {
    void listRunsForAction('weekly_review')
      .then(setReviews)
      .catch((e) => {
        console.warn('[review] loading reviews failed', e);
        setReviews([]);
      });
  }, []);

  // Re-read when a run lands. `runs` is the store's feed, which engineStore refreshes at the
  // end of every run — so this follows a review finishing without polling for it.
  useEffect(load, [load, runs]);

  const engineReady = canShowEngineActions({
    cliAvailable: engineStatus?.available === true,
    mcpEnabled,
    mcpWriteEnabled,
    actionsEnabled,
  });
  const running = current?.action === 'weekly_review';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Same height as ThreadView's header — see ProjectBoard for why. ⚠️ The rule that lands
          on the panel's top edge is THIS one; the 引擎 bar below keeps its own smaller height,
          because what is being aligned is the view's title bar, not everything above the list. */}
      <header
        className="flex flex-none items-baseline justify-between gap-3 border-b border-line px-6 py-6"
        style={{ minHeight: CENTRE_HEADER_HEIGHT }}
      >
        <h2 className="font-serif text-2xl text-ink">{t(ACTION_LABEL.weekly_review)}</h2>
        <span className="text-[11px] text-muted">{t('跨所有项目，不属于任何一个')}</span>
      </header>

      {engineReady && (
        <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2">
          <button
            type="button"
            disabled={current !== null}
            onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
            title={t('回顾最近一周——读一遍所有项目')}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:bg-paper-2 enabled:hover:text-accent disabled:text-muted disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={12} className="flex-none animate-spin" />
            ) : (
              <CalendarRange size={12} className="flex-none" />
            )}
            {running ? t('正在回顾…') : t('回顾这一周')}
          </button>

          {/* §4.3's master switch, moved here from 项目管理 (2026-08-11). It used to govern
              two things and now governs one: with per-project 压缩 retired, a weekly review is
              the only thing automation still runs — so it belongs beside the action, not beside
              the projects it no longer touches.

              ⚠️ Still default OFF, and that stays a deliberate reading of a request that pulled
              two ways: Ocean asked for automation AND for 「必须节约token」/「让用户放心」 in one
              breath, and this switch spends real money without asking again. */}
          <label className="flex cursor-pointer items-center gap-2">
            <Toggle checked={autoMaintain} onChange={(v) => void update({ aiAutoMaintain: v })} />
            <span className="text-xs text-ink-2">{t('每周自动回顾一次')}</span>
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {reviews === null ? null : reviews.length === 0 ? (
          <p className="pt-12 text-center text-sm text-muted">
            {/* ⚠️ The second line is now reachable only one way: a CLI IS installed and the
                「允许 AI 写入」 switch is off — because with no CLI at all the left rail no
                longer shows a door to this screen (Sidebar, 2026-08-17). It is kept for that
                case, where it names a switch the user can actually flip. */}
            {engineReady
              ? t('还没有回顾。点上面那一下，AI 会读一遍所有项目，说说这一周做了什么、还剩什么。')
              : t('装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。')}
          </p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <Review key={r.id} run={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One past review, read rather than answered — so it has no buttons and never collapses on
 *  being dealt with. A failed run still gets an entry: 「那一周我按了但它没跑成」 is itself part
 *  of the record, and hiding it would make the gaps unexplainable. */
function Review({ run }: { run: EngineRun }) {
  const t = useT();
  const when = new Date(run.finishedAt).toLocaleString(dateLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const engineName = ENGINE_LABEL[run.engine as EngineKind] ?? run.engine;
  const cost = money(run.usage.costUsd);
  const text = (run.resultText ?? '').trim();

  return (
    <li className="border-b border-line pb-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[10px] text-muted">
        <span className="font-mono text-ink-2">{when}</span>
        <span>· {engineName}</span>
        {run.usage.model && <span>· {run.usage.model}</span>}
        <span>· {cost ?? t('花费未知')}</span>
      </div>
      {text ? (
        // §10.1 — a review is the longest Markdown any AI writes into Spool (「## 截止日期」,
        // one section per project), and it was the last surface still showing the raw `##`.
        // Same renderer as the block feed: its sizes are in em, so the hierarchy survives the
        // step down to 13px here.
        <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
          <MarkdownContent content={text} />
        </div>
      ) : (
        <div className="mt-1.5 text-xs italic text-muted">
          {run.outcome === 'cancelled' ? t('被你停下了') : t('这次什么也没回来')}
        </div>
      )}
      {/* §2.3 — the CLI's own words when it failed, never a Spool paraphrase. */}
      {run.detail && (
        <div className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted">
          {run.detail}
        </div>
      )}
    </li>
  );
}
