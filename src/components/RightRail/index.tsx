import { CalendarRange, Globe, Inbox, PanelRightClose, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import RunCard from './RunCard';
import { createBlock } from '@/lib/db/blocks';
import type { EngineRun } from '@/lib/db/engineRuns';
import { spendSince } from '@/lib/db/engineRuns';
import { canShowEngineActions, engineActionsDisabled } from '@/lib/engine/gate';
import { useT } from '@/lib/i18n';
import { findOrCreateReviewThread, setAutoMaintain, type Thread } from '@/lib/db/threads';
import Toggle from '@/components/ui/Toggle';
import { useBlocksStore } from '@/stores/blocksStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import {
  ACTION_LABEL,
  ENGINE_LABEL,
  useEngineStore,
  type EngineAction,
  type EngineKind,
} from '@/stores/engineStore';
import { useProposalsStore } from '@/stores/proposalsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

// DESIGN_WORKBENCH §3 — the right rail.
//
// Ocean 2026-08-06, having finally used the engine slot: "很多交互方面的问题出在 spool 的
// 界面少了". He was right, and more structurally than it sounds. Everything to do with the
// engine had no home, so it went wherever there was a gap — the actions into a ⋯ overflow
// menu, the output into a toast that vanishes, the review queue into an 11px badge in the
// footer, the follow-up brief into a modal. Five surfaces, none of which can show you what
// the AI is doing or has done.
//
// This rail is that home. VS Code is the reference Ocean named, and the reason it works is
// the one already written down in HANDOFF §4.7: VS Code lets extensions touch your code
// because the Source Control panel shows you what they touched.
//
// Scoped to the open project, with one exception: 周回顾 reads the whole library and
// belongs to no project (§3.4), so its cards show wherever you are.

const ENGINE_ACTIONS: { action: EngineAction; hint: string }[] = [
  { action: 'distill', hint: '把这个项目提炼成一块结论' },
  { action: 'thread_health', hint: '查一遍重复块、失效引用，看摘要过没过期' },
];

interface Props {
  thread: Thread | null;
  onCollapse: () => void;
  onEditBrief: () => void;
}

export default function RightRail({ thread, onCollapse, onEditBrief }: Props) {
  const t = useT();
  const runs = useEngineStore((s) => s.runs);
  const status = useEngineStore((s) => s.status);
  const current = useEngineStore((s) => s.current);
  const queue = useEngineStore((s) => s.queue);
  const enqueue = useEngineStore((s) => s.enqueue);
  const cancel = useEngineStore((s) => s.cancel);
  const probe = useEngineStore((s) => s.probe);
  const loadRuns = useEngineStore((s) => s.loadRuns);
  const dismissRun = useEngineStore((s) => s.dismissRun);

  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const update = useSettingsStore((s) => s.update);

  const pending = useProposalsStore((s) => s.pendingCount);
  const openReview = useProposalsStore((s) => s.open);

  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);

  const [spend, setSpend] = useState<{ costUsd: number; runs: number } | null>(null);
  const [storing, setStoring] = useState<string | null>(null);

  // §4.3 — the per-project opt-out. Back to `null` rather than `true`, so a project the
  // user un-mutes goes back to following the master switch instead of being pinned on.
  const toggleThreadAuto = async (): Promise<void> => {
    if (!thread) return;
    await setAutoMaintain(thread.id, thread.autoMaintain === false ? null : false);
    await useThreadsStore.getState().loadAll();
  };

  useEffect(() => {
    if (status === null) void probe();
  }, [status, probe]);

  useEffect(() => {
    void loadRuns(thread?.id ?? null);
  }, [thread?.id, loadRuns]);

  // Seven days of Spool's own runs. Recomputed whenever a run lands, which is exactly when
  // the number changes — nothing else in the app spends money.
  useEffect(() => {
    void spendSince(Date.now() - 7 * 86_400_000)
      .then(setSpend)
      .catch((e) => console.warn('[rail] spend query failed', e));
  }, [runs]);

  const busyOnThisThread =
    current?.threadId === thread?.id || queue.some((q) => q.threadId === thread?.id);
  const gate = {
    cliAvailable: status?.available === true,
    mcpEnabled,
    mcpWriteEnabled,
    actionsEnabled,
    busyOnThisThread,
  };
  // Two gates, because the rail hosts two kinds of action. Per-project ones need a project
  // open; 周回顾 reads the whole library and must stay reachable with nothing selected
  // (§3.4 — putting it behind a project selection is the mistake this release corrects).
  const engineReady = canShowEngineActions(gate);
  const showActions = engineReady && thread !== null;
  const disabled = engineActionsDisabled(gate);
  const engineName = status?.selected ? ENGINE_LABEL[status.selected] : null;

  // §3.1 — this is the "user agrees" the prompts have always asked for. The block goes in
  // through the ordinary insert path with a source label, exactly like an MCP write: what
  // the AI wrote must never be able to pass as something the user typed.
  const store = async (run: EngineRun): Promise<void> => {
    if (!run.resultText) return;
    // §3.4: a weekly review belongs to no project, so it files into one of its own —
    // created on this click, which is the first moment a review actually exists. ⚠️ Never
    // at startup and never from a seed path (memory `spool-db-wipe-incident`).
    let target = run.threadId ?? thread?.id;
    if (run.action === 'weekly_review') {
      const ws = useWorkspacesStore.getState().workspaces[0];
      if (!ws) return;
      target = (await findOrCreateReviewThread(ws.id, t('回顾'))).id;
      await useThreadsStore.getState().loadAll();
    }
    if (!target) return;
    setStoring(run.id);
    try {
      await createBlock({
        threadId: target,
        content: run.resultText,
        annotation: t('{action} · {engine}', {
          action: t(ACTION_LABEL[run.action]),
          engine: ENGINE_LABEL[run.engine as EngineKind] ?? run.engine,
        }),
        source: `${ENGINE_LABEL[run.engine as EngineKind] ?? run.engine} · MCP`,
      });
      await dismissRun(run.id);
      const active = useBlocksStore.getState();
      if (thread?.id === target) await active.load(target);
      toast.notice(t('存好了'));
    } catch (e) {
      toast.error(t('存不下来：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setStoring(null);
    }
  };

  const visibleRuns = runs.filter(
    (r) => r.threadId === null || (thread !== null && r.threadId === thread.id),
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-paper-2/40">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-xs text-ink">{t('AI')}</div>
          <div className="mt-0.5 truncate text-[10px] text-muted">
            {engineName ?? t('没检测到引擎')}
            {/* §5: spend, never a balance. Neither CLI reports remaining quota. */}
            {spend && spend.costUsd > 0 && ` · ${t('近 7 天')} $${spend.costUsd.toFixed(2)}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title={t('收起')}
          aria-label={t('收起')}
          className="flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <PanelRightClose size={14} />
        </button>
      </header>

      {/* §7.4 — the picker, out of the settings page's basement and next to the thing it
          governs. Ocean could not find it there ("引擎无法切换"), and it showed the wire
          names `claude` / `codex` rather than the product names. */}
      {status && status.engines.length > 1 && (
        <div className="flex flex-none items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="text-[10px] text-muted">{t('用哪个')}</span>
          <select
            value={status.selected ?? ''}
            onChange={(e) =>
              void update({ aiEngine: e.target.value as EngineKind }).then(probe)
            }
            className="flex-none rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
          >
            {status.engines.map((e) => (
              <option key={e.kind} value={e.kind}>
                {ENGINE_LABEL[e.kind]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {/* §3.2 — the actions, out of the ⋯ menu. A menu closes on click, and these run for
            minutes, queue, and can be cancelled; they need somewhere that stays put. */}
        {showActions && (
          <div className="space-y-1">
            {ENGINE_ACTIONS.map(({ action, hint }) => (
              <button
                key={action}
                type="button"
                disabled={disabled}
                title={t(hint)}
                onClick={() => enqueue(thread.id, thread.title, action, timeoutSecs)}
                className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1.5 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
              >
                <Sparkles size={11} className="flex-none" />
                {t(ACTION_LABEL[action])}
              </button>
            ))}
            {/* The one action that goes outside, kept visually apart because it IS different
                in kind (DESIGN_FOLLOW_UP §3.3). Which entry shows depends on whether a brief
                has been settled — §6-2: nothing reaches the web until a human read the rules. */}
            <button
              type="button"
              disabled={disabled && thread.followUpBrief !== null}
              onClick={() =>
                thread.followUpBrief
                  ? enqueue(thread.id, thread.title, 'follow_up', timeoutSecs)
                  : onEditBrief()
              }
              title={
                thread.followUpBrief
                  ? t('照你定的那几行出去查一遍')
                  : t('定几行「要盯什么」，之后才能让 AI 出去查')
              }
              className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1.5 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
            >
              <Globe size={11} className="flex-none" />
              {thread.followUpBrief ? t('跟进') : t('联网跟进…')}
            </button>
            {thread.followUpBrief && (
              <button
                type="button"
                onClick={onEditBrief}
                className="w-full px-2 text-left text-[10px] text-muted transition-colors hover:text-accent"
              >
                {t('改要盯的东西')}
              </button>
            )}
          </div>
        )}

        {/* §3.4 — the whole-library half, kept visually apart from the per-project actions
            above. Ocean: "周回顾类似周报，是面对所有项目的动作，不允许和针对单个项目的动作
            放在一起". It files into a project of its own, created the first time one is
            actually stored. */}
        {engineReady && (
          <div className="space-y-1 border-t border-line pt-2">
            <div className="px-0.5 text-[10px] uppercase tracking-wide text-muted">
              {t('全部项目')}
            </div>
            <button
              type="button"
              disabled={current !== null}
              title={t('回顾最近一周——跨所有项目，存进「回顾」项目')}
              onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
              className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1.5 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
            >
              <CalendarRange size={11} className="flex-none" />
              {t(ACTION_LABEL.weekly_review)}
            </button>

            {/* §4.3 — the automation switch, where the runs it produces will appear rather
                than buried in settings. Default OFF: it spends real money on a subscription
                without asking again, and Ocean asked for 「让用户放心」 in the same breath
                as he asked for automation. */}
            <div className="flex items-start justify-between gap-2 pt-1">
              <div className="min-w-0">
                <div className="text-[11px] text-ink-2">{t('自动维护')}</div>
                <div className="mt-0.5 text-[10px] leading-relaxed text-muted">
                  {t('项目有新内容、放了一阵子之后，自动提炼一次。每个项目一天最多一次，周回顾一周一次。')}
                </div>
              </div>
              <Toggle
                checked={autoMaintain}
                onChange={(v) => void update({ aiAutoMaintain: v })}
              />
            </div>
            {autoMaintain && thread && (
              <button
                type="button"
                onClick={() => void toggleThreadAuto()}
                className="w-full px-0.5 text-left text-[10px] text-muted transition-colors hover:text-accent"
              >
                {thread.autoMaintain === false
                  ? t('这个项目：已关掉自动维护（点一下打开）')
                  : t('这个项目：跟着上面走（点一下单独关掉）')}
              </button>
            )}
          </div>
        )}

        {/* The running pill, where the actions are rather than in the title bar — Ocean
            could not tell that the header pill was the cancel button (#4). */}
        {current && (
          <button
            type="button"
            onClick={() => void cancel()}
            title={t('点一下停下来（已经写进去的块会留着）')}
            className="flex w-full items-center justify-between gap-2 rounded border border-accent/60 bg-accent-soft px-2 py-1.5 text-[11px] text-accent transition-colors hover:border-accent hover:bg-accent/15"
          >
            <span className="truncate">
              {queue.length > 0
                ? t('{action}中 · 还排着 {n} 个', {
                    action: t(ACTION_LABEL[current.action]),
                    n: queue.length,
                  })
                : t('{action}中', { action: t(ACTION_LABEL[current.action]) })}
            </span>
            <span className="flex-none">{t('停下')}</span>
          </button>
        )}

        {/* §3.3 — the review queue, always shown rather than appearing only when non-empty.
            ⚠️ It does NOT pop or steal focus: memory `capture-note-first` — the main window
            never jumps to the front, and the AI may have queued this while the user slept. */}
        <button
          type="button"
          onClick={() => void openReview()}
          disabled={pending === 0}
          className={`flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition-colors ${
            pending > 0
              ? 'border-accent/60 bg-accent-soft text-accent hover:border-accent hover:bg-accent/15'
              : 'cursor-default border-line bg-paper text-muted'
          }`}
        >
          <Inbox size={11} className="flex-none" />
          {pending > 0 ? t('{n} 条待你过目', { n: pending }) : t('没有待过目的')}
        </button>

        {/* §3.1 — what the AI said. The reason this rail exists. */}
        {visibleRuns.length === 0 ? (
          <p className="px-1 pt-2 text-[10px] leading-relaxed text-muted">
            {showActions
              ? t('这里会留下每次 AI 干活的结果，跑一次就知道了。')
              : t('装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。')}
          </p>
        ) : (
          visibleRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              busy={storing === run.id}
              onDismiss={(id) => void dismissRun(id)}
              onStore={run.action === 'follow_up' ? undefined : (r) => void store(r)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
