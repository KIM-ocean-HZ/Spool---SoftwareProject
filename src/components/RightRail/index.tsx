import {
  Bot,
  ChevronDown,
  ChevronRight,
  Globe,
  Inbox,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BoardRail from "./BoardRail";
import EngineBar from "./EngineBar";
import LiveRun from "./LiveRun";
import RunCard from "./RunCard";
import { createBlock } from "@/lib/db/blocks";
import type { EngineRun } from "@/lib/db/engineRuns";
import { spendSince } from "@/lib/db/engineRuns";
import { groupAiActivity } from "@/lib/engine/activity";
import { canShowEngineActions, engineActionsDisabled } from "@/lib/engine/gate";
import { dateLocale, useT } from "@/lib/i18n";
import {
  findOrCreateReviewThread,
  setAutoMaintain,
  type Thread,
} from "@/lib/db/threads";
import { useBlocksStore } from "@/stores/blocksStore";
import { useSearchStore } from "@/stores/searchStore";
import { useThreadsStore } from "@/stores/threadsStore";
import { useWorkspacesStore } from "@/stores/workspacesStore";
import {
  ACTION_LABEL,
  ENGINE_LABEL,
  useEngineStore,
  type EngineAction,
  type EngineKind,
} from "@/stores/engineStore";
import { useProposalsStore } from "@/stores/proposalsStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "@/stores/toastStore";

// DESIGN_WORKBENCH §9 — the right rail, rebuilt.
//
// §3 gave everything to do with the engine a home here, and that part was right. What was
// wrong is what Ocean said after living with it: 「目前的 ui 被无用的按钮堆砌满了」. Five
// cells, four of them controls. This version inverts the ratio (§9.1):
//
//   主体 — the run that is going (LiveRun), what is waiting for your eyes, what changed.
//   附属 — engine, model, the maintenance buttons, the automation switch: one line each,
//          folded, and never above the thing they operate on.
//
// ⚠️ **The rail is about whatever is open on the left, and nothing else** (Ocean 2026-08-07).
// The first attempt kept a folded 「全部项目」 strip in here alongside the current project's
// things; his verdict was 「和每个项目共用……会有歧义，且没有占据位置，用户并不会使用」. So the
// whole-library half left entirely: it is the 项目管理 view's own rail now (BoardRail), and
// what remains below is one project's — 「普通项目就是三个维护按钮，加上他自己的流式进度，
// 和他自己的待过目」.
//
// Order top to bottom: engine bar → live run → your inbox → follow-up → the maintenance
// buttons, folded away last because they are the least of it.

const ENGINE_ACTIONS: { action: EngineAction; hint: string }[] = [
  { action: "distill", hint: "把这个项目压成一条结论" },
  { action: "thread_health", hint: "查一遍重复块、失效引用，看摘要过没过期" },
];

interface Props {
  thread: Thread | null;
  /** True when 项目管理 owns the main area — the rail then belongs to all projects, not one. */
  boardOpen: boolean;
  onCollapse: () => void;
  onEditBrief: () => void;
}

export default function RightRail({
  thread,
  boardOpen,
  onCollapse,
  onEditBrief,
}: Props) {
  const t = useT();
  const runs = useEngineStore((s) => s.runs);
  const status = useEngineStore((s) => s.status);
  const current = useEngineStore((s) => s.current);
  const queue = useEngineStore((s) => s.queue);
  const enqueue = useEngineStore((s) => s.enqueue);
  const probe = useEngineStore((s) => s.probe);
  const loadRuns = useEngineStore((s) => s.loadRuns);
  const dismissRun = useEngineStore((s) => s.dismissRun);

  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);

  const pending = useProposalsStore((s) => s.pendingCount);
  const openReview = useProposalsStore((s) => s.open);
  const highlight = useSearchStore((s) => s.highlight);

  const [spend, setSpend] = useState<number | null>(null);
  const [storing, setStoring] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
      .then((s) => setSpend(s.costUsd))
      .catch((e) => console.warn("[rail] spend query failed", e));
  }, [runs]);

  const busyOnThisThread =
    current?.threadId === thread?.id ||
    queue.some((q) => q.threadId === thread?.id);
  const gate = {
    cliAvailable: status?.available === true,
    mcpEnabled,
    mcpWriteEnabled,
    actionsEnabled,
    busyOnThisThread,
  };
  // Two gates, because the rail hosts two kinds of action. Per-project ones need a project
  // open; the board's reach the whole library and stay usable with nothing selected.
  const engineReady = canShowEngineActions(gate);
  const showActions = engineReady && thread !== null;
  const disabled = engineActionsDisabled(gate);

  // §4.3 — the per-project opt-out. Back to `null` rather than `true`, so a project the
  // user un-mutes goes back to following the master switch instead of being pinned on.
  const toggleThreadAuto = async (): Promise<void> => {
    if (!thread) return;
    await setAutoMaintain(
      thread.id,
      thread.autoMaintain === false ? null : false,
    );
    await useThreadsStore.getState().loadAll();
  };

  // §3.1 — this is the "user agrees" the prompts have always asked for. The block goes in
  // through the ordinary insert path with a source label, exactly like an MCP write: what
  // the AI wrote must never be able to pass as something the user typed.
  const store = async (run: EngineRun): Promise<void> => {
    if (!run.resultText) return;
    // §3.4: a weekly review belongs to no project, so it files into one of its own —
    // created on this click, which is the first moment a review actually exists. ⚠️ Never
    // at startup and never from a seed path (memory `spool-db-wipe-incident`).
    let target = run.threadId ?? thread?.id;
    if (run.action === "weekly_review") {
      const ws = useWorkspacesStore.getState().workspaces[0];
      if (!ws) return;
      target = (await findOrCreateReviewThread(ws.id, t("回顾"))).id;
      await useThreadsStore.getState().loadAll();
    }
    if (!target) return;
    setStoring(run.id);
    try {
      await createBlock({
        threadId: target,
        content: run.resultText,
        annotation: t("{action} · {engine}", {
          action: t(ACTION_LABEL[run.action]),
          engine: ENGINE_LABEL[run.engine as EngineKind] ?? run.engine,
        }),
        source: `${ENGINE_LABEL[run.engine as EngineKind] ?? run.engine} · MCP`,
      });
      await dismissRun(run.id);
      const active = useBlocksStore.getState();
      if (thread?.id === target) await active.load(target);
      toast.notice(t("存好了"));
    } catch (e) {
      toast.error(
        t("存不下来：{msg}", {
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setStoring(null);
    }
  };

  const visibleRuns = runs.filter(
    (r) => r.threadId === null || (thread !== null && r.threadId === thread.id),
  );
  // R2: the "AI 活动" fold used to be a strip inside the thread view. It is the durable half
  // of the same question the cards above answer — what did the AI put in my library — so it
  // moved in beside them. ⚠️ Unlike the cards, this does NOT go away when answered: a block
  // an AI wrote stays a block an AI wrote.
  const blocks = useBlocksStore((s) =>
    thread ? s.byThread[thread.id] : undefined,
  );
  const written = useMemo(() => groupAiActivity(blocks ?? []), [blocks]);
  const writtenCount = written.reduce((n, g) => n + g.blocks.length, 0);
  const when = (ms: number): string =>
    new Date(ms).toLocaleString(dateLocale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-paper-2/40">
      <EngineBar onCollapse={onCollapse} spendUsd={spend} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {/* §9.1 主体, in order of how much it wants you right now. A run started from the
            board is still a run — it shows on either side. */}
        <LiveRun />

        {boardOpen ? (
          <BoardRail engineReady={engineReady} />
        ) : (
          <>
            {/* §3.3 — the review queue, always shown rather than appearing only when non-empty.
            ⚠️ It does NOT pop or steal focus: memory `capture-note-first` — the main window
            never jumps to the front, and the AI may have queued this while the user slept. */}
            <button
              type="button"
              onClick={() => void openReview()}
              disabled={pending === 0}
              className={`flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-[11px] transition-colors ${
                pending > 0
                  ? "border-accent/60 bg-accent-soft text-accent hover:border-accent hover:bg-accent/15"
                  : "cursor-default border-line bg-paper text-muted"
              }`}
            >
              <Inbox size={11} className="flex-none" />
              {pending > 0
                ? t("{n} 条待你过目", { n: pending })
                : t("没有待过目的")}
            </button>

            {/* §3.1 — what the AI said. The reason this rail exists at all (§1.1: the text used
            to be thrown away and reported as "跑完了，没有新增块"). */}
            {visibleRuns.length === 0 && !current ? (
              <p className="px-1 pt-1 text-[10px] leading-relaxed text-muted">
                {showActions
                  ? t("这里会留下每次 AI 干活的结果，跑一次就知道了。")
                  : t(
                      "装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。",
                    )}
              </p>
            ) : (
              visibleRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  busy={storing === run.id}
                  onDismiss={(id) => void dismissRun(id)}
                  onStore={
                    run.action === "follow_up"
                      ? undefined
                      : (r) => void store(r)
                  }
                />
              ))
            )}

            {/* R2's durable half. Folded, and absent entirely in a project no AI has touched
            (§2.5 安静原则 — a thread the user keeps to themselves grows no AI panel). */}
            {writtenCount > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex w-full items-center gap-1.5 text-left text-[10px] text-muted transition-colors hover:text-ink-2"
                >
                  {historyOpen ? (
                    <ChevronDown size={10} className="flex-none" />
                  ) : (
                    <ChevronRight size={10} className="flex-none" />
                  )}
                  <Bot size={10} className="flex-none" />
                  <span className="truncate">
                    {t("这个项目里有 {n} 块是 AI 写的", { n: writtenCount })}
                  </span>
                </button>
                {historyOpen && (
                  <div className="mt-1 space-y-1.5">
                    {written.map((g) => (
                      <div key={`${g.source}-${g.at}`}>
                        <div className="text-[10px] text-muted">
                          {t("{source} · {when} · {n} 块", {
                            source: g.source,
                            when: when(g.at),
                            n: g.blocks.length,
                          })}
                        </div>
                        <ul className="mt-0.5 space-y-0.5">
                          {g.blocks.map((b) => (
                            <li key={b.id}>
                              {/* Clicking scrolls to it and flashes it — the same path a search
                              result takes, so "go look and change your mind" is one click
                              from the audit line. */}
                              <button
                                type="button"
                                onClick={() => highlight(b.id)}
                                title={t("跳到这一块")}
                                className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-paper-2"
                              >
                                {b.seq !== null && (
                                  <span className="flex-none font-mono text-[10px] text-muted">
                                    #{b.seq}
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-[10px] text-ink-2">
                                  {b.content}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* §9.3 #2 — 新进展. Ocean named three faults in the old row: the edit control was
            unclear, what it MEANT was unclear, and it was redundant at the top level. So the
            first level shows the target itself — a read-only line of what this project is
            watching, permanently visible rather than only inside the editor — and 「改」 is a
            quiet link into the second level. */}
            {showActions && (
              <div className="space-y-1 border-t border-line pt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {t("在盯什么")}
                  </span>
                  <button
                    type="button"
                    onClick={onEditBrief}
                    className="flex-none text-[10px] text-muted transition-colors hover:text-accent"
                  >
                    {thread.followUpBrief ? t("改") : t("定一个")}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-ink-2">
                  {thread.followUpBrief ? (
                    thread.followUpBrief
                  ) : (
                    <span className="text-muted">
                      {t("还没定。定几行「要盯什么」，之后才能让 AI 出去查。")}
                    </span>
                  )}
                </p>
                {thread.followUpBrief && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      enqueue(thread.id, thread.title, "follow_up", timeoutSecs)
                    }
                    title={t("照你定的那几行出去查一遍")}
                    className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
                  >
                    <Globe size={11} className="flex-none" />
                    {t(ACTION_LABEL.follow_up)}
                  </button>
                )}
              </div>
            )}

            {/* §9.3 #1 — 「不要太显眼」. These are the附属 layer, so they sit last and folded.
            Two of them: 周回顾 is a whole-library action and lives in the board (§9.5). */}
            {showActions && (
              <div className="border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => setActionsOpen((v) => !v)}
                  className="flex w-full items-center gap-1.5 text-left text-[10px] text-muted transition-colors hover:text-ink-2"
                >
                  {actionsOpen ? (
                    <ChevronDown size={10} className="flex-none" />
                  ) : (
                    <ChevronRight size={10} className="flex-none" />
                  )}
                  <Sparkles size={10} className="flex-none" />
                  {t("让 AI 维护这个项目")}
                </button>
                {actionsOpen && (
                  <div className="mt-1 space-y-1">
                    {ENGINE_ACTIONS.map(({ action, hint }) => (
                      <button
                        key={action}
                        type="button"
                        disabled={disabled}
                        title={t(hint)}
                        onClick={() =>
                          enqueue(thread.id, thread.title, action, timeoutSecs)
                        }
                        className="flex w-full items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
                      >
                        <Sparkles size={11} className="flex-none" />
                        {t(ACTION_LABEL[action])}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void toggleThreadAuto()}
                      className="w-full px-0.5 text-left text-[10px] text-muted transition-colors hover:text-accent"
                    >
                      {thread.autoMaintain === false
                        ? t("这个项目：已关掉自动维护（点一下打开）")
                        : t("这个项目：跟着总开关走（点一下单独关掉）")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
