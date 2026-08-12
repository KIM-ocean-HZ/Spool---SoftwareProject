import { Bot, ChevronDown, ChevronRight, Globe, Inbox } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LiveRun from "./LiveRun";
import McpBar from "./McpBar";
import ProjectFiles from "./ProjectFiles";
import RunCard from "./RunCard";
import { createBlock } from "@/lib/db/blocks";
import type { EngineRun } from "@/lib/db/engineRuns";
import { groupAiActivity, visibleRuns } from "@/lib/engine/activity";
import { canShowEngineActions, engineActionsDisabled } from "@/lib/engine/gate";
import { dateLocale, useT } from "@/lib/i18n";
import type { Thread } from "@/lib/db/threads";
import { useBlocksStore } from "@/stores/blocksStore";
import { useSearchStore } from "@/stores/searchStore";
import {
  ACTION_LABEL,
  ENGINE_LABEL,
  engineSupportsWeb,
  useEngineStore,
  type EngineKind,
} from "@/stores/engineStore";
import { useProposalsStore } from "@/stores/proposalsStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "@/stores/toastStore";

// DESIGN_WORKBENCH §9.13 — the right rail, third pass.
//
// §9.9's rail inverted the ratio (results big, controls small) and that part stands. What
// Ocean said after living with THAT one is the whole brief for this pass:
//
//   「目前的 uiux 还是凌乱，矩形结构太多，没有空间呼吸感。按钮很大很长不美观……
//     做了过多了隐藏抽拉的设计，看似简洁，实则摩擦巨大」
//
// Three concrete changes, and one deletion:
//
//   1. **The folds are gone.** 「让 AI 维护这个项目」 was a disclosure triangle in front of two
//      buttons — one extra click, every time, to reach the thing the rail exists for. The
//      actions are now a fixed row at the bottom, always visible. (One fold survives: the
//      list of blocks an AI wrote, at the very end. It is reference material you consult,
//      not an action you take — and unfolded it is unbounded in length.)
//   2. **No more bordered full-width buttons.** Every control was a rectangle the width of
//      the rail; a column of them reads as a form, not a panel. The actions are icon + word,
//      sharing one line, with whitespace instead of borders doing the separating.
//   3. **Nothing renders to say it is empty.** 「没有待过目的」 was a permanently-present grey
//      rectangle that never did anything. A count of zero now takes zero pixels.
//
// And the deletion: **the whole-library half is gone from this file.** Ocean, twice:
// 「把它单独放在左侧边栏的置顶位置，而不是在右侧边栏中和每个项目共用」 and
// 「去掉项目汇总的右边栏」. 周回顾 and the 自动维护 master switch now live in 项目管理's own
// workspace (ProjectBoard), and this rail is per-project or it is not there at all — App
// does not mount it while the board is open.

// ⚠️ **压缩 and 去重 are gone from this rail (2026-08-11, Ocean's call after living with them).**
//
// Not a UI tidy-up — he read what they actually produced in 〈Flux〉 #9/#10 and judged both
// unfit, each for its own structural reason:
//
//   * **压缩**: 「最有用的是能告诉我还有什么没做…但是总结性的语句没什么用，如果放在上下文里
//     只会造成冗余」. Half of what it wrote was already in the library, so distilling it back
//     in made the pack bigger without making it say more. 周回顾 gives him the useful half
//     「并且更加简洁」, so he retired this one into it.
//   * **去重**: 「AI 引擎没办法帮我把新块指向过期块里面的那句话，没什么用」. That is a limit
//     no prompt can lift — Spool merges nothing, rewrites nothing, deletes nothing by design
//     (DESIGN_MCP_WRITE_ROLE), so this action could only ever report and then ask him to go do
//     it himself. Paying a model to find duplicates is now replaced by finding them locally
//     for free, on the row where he can act on them (ProjectBoard).
//
// ⚠️ **The MCP tools and prompts of the same names are UNTOUCHED**, and deliberately so: they
// serve a chat client, where a human really is present to answer the closing 「你同意吗？」 that
// made both actions useless here. What was wrong is running them with nobody in the loop.
//
// So this rail is now one action wide: 联网搜索 (below), the one that brings in something the
// library does not already contain.

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

  const [storing, setStoring] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (status === null) void probe();
  }, [status, probe]);

  useEffect(() => {
    void loadRuns(thread?.id ?? null);
  }, [thread?.id, loadRuns]);

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
  const engineReady = canShowEngineActions(gate);
  const showActions = engineReady && thread !== null;
  const disabled = engineActionsDisabled(gate);

  // §3.1 — this is the "user agrees" the prompts have always asked for. The block goes in
  // through the ordinary insert path with a source label, exactly like an MCP write: what
  // the AI wrote must never be able to pass as something the user typed.
  // ⚠️ There is no weekly-review branch here any more, and that is the fix, not an omission.
  // It used to find-or-create a project called 「回顾」 inside `workspaces[0]` — whichever
  // workspace happened to sort first — which is how one appeared inside Ocean's 升学 workspace
  // and made him ask 「是对应每个规划区一个回顾吗？」. A review is not a block; it lives in
  // `engine_runs` and is read in its own view (components/ReviewBoard), so nothing needs to be
  // guessed about where it belongs.
  const store = async (run: EngineRun): Promise<void> => {
    if (!run.resultText) return;
    const target = run.threadId ?? thread?.id;
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

  // ⚠️ Ocean 2026-08-07: 「跟进没法删除，也不会消失」. Two separate faults, both here.
  //
  //   * A dismissed card used to STAY, greyed out, for ever — so a rail you had answered
  //     everything in still looked full. `reviewedAt !== null` now means gone from view.
  //     The row itself is untouched in the database: it is what makes the 7-day spend
  //     total true, and deleting it would make the number lie (engineRuns.markReviewed).
  //   * 跟进 files proposals rather than prose, so a follow-up run often comes back with no
  //     text at all — and the old card only rendered its buttons for `outcome === 'ok' &&
  //     hasText`. A textless run had no ✕. RunCard gives every card a ✕ now, unconditionally.
  const shown = visibleRuns(runs, thread?.id ?? null);
  // R2: the durable half of "what did the AI put in my library". ⚠️ Unlike the cards, this
  // does NOT go away when answered: a block an AI wrote stays a block an AI wrote.
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
      {/* §9.4 丙 (2026-08-11, Ocean:「MCP 才是主要的对话写入工具，放在最顶上」). The CLI
          engine used to hold this row; it now lives inside the follow-up editor, beside the
          only thing that spends it.
          2026-08-12: it also became the way INTO those clients — the title is what a click
          carries across (components/mcp/ClientMenu). */}
      <McpBar threadTitle={thread?.title ?? null} onCollapse={onCollapse} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* §9.1 主体, in order of how much it wants you right now. */}
        <LiveRun />

        {/* §3.3 — the review queue. ⚠️ It does NOT pop or steal focus: memory
            `capture-note-first` — the main window never jumps to the front, and the AI may
            have queued this while the user slept. Absent at zero (§9.13 #3). */}
        {pending > 0 && (
          <button
            type="button"
            onClick={() => void openReview()}
            className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] text-accent transition-colors hover:bg-accent-soft"
          >
            <Inbox size={12} className="flex-none" />
            <span className="min-w-0 flex-1 truncate">
              {t("{n} 条待你过目", { n: pending })}
            </span>
            <ChevronRight size={12} className="flex-none" />
          </button>
        )}

        {/* §3.1 — what the AI said. The reason this rail exists at all (§1.1: the text used
            to be thrown away and reported as "跑完了，没有新增块"). */}
        {/* ⚠️ With an engine ready and nothing to show, this renders NOTHING (Ocean 2026-08-11:
            「跑一次，结果留在这里等你过目。这句提示删掉」). That restores §9.13 #3 — 「Nothing
            renders to say it is empty」 — which the line had been quietly breaking: it was a
            permanent grey sentence in a rail whose whole rule is that a count of zero takes
            zero pixels.
            The other branch stays. It is not an empty state, it is the only place that says
            what to install to make this column exist at all. */}
        {shown.length === 0 && !current ? (
          showActions ? null : (
            <p className="px-1 text-[12px] leading-relaxed text-muted">
              {t("装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。")}
            </p>
          )
        ) : (
          shown.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              busy={storing === run.id}
              onDismiss={(id) => void dismissRun(id)}
              onStore={
                run.action === "follow_up" ? undefined : (r) => void store(r)
              }
            />
          ))
        )}

        {/* §9.3 #2 — 新进展. The first level shows the target itself, permanently visible
            rather than only inside the editor; 「改」 is a quiet link into the second. */}
        {/* ⚠️ A frame rather than a top rule (Ocean 2026-08-11: 「右侧边栏的跟进窗口做成有框线的」).
            Same treatment as the sidebar's value panel: a hairline border and no fill of its
            own, so it reads as one thing without becoming a raised card. It earns the frame for
            the same reason that one did — everything else in this column is a run that came and
            will go, and this is a standing statement of what the project is watching for. */}
        {showActions && (
          <div className="space-y-1 rounded-md border border-line p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] uppercase tracking-wide text-muted">
                {t("跟进内容")}
              </span>
              <button
                type="button"
                onClick={onEditBrief}
                className="flex-none text-[12px] text-muted transition-colors hover:text-accent"
              >
                {thread.followUpBrief ? t("编辑") : t("定一个")}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-2">
              {thread.followUpBrief ? (
                thread.followUpBrief
              ) : (
                <span className="text-muted">
                  {t("还没定。定几行「要盯什么」，之后才能让 AI 出去查。")}
                </span>
              )}
            </p>
            {/* §7.8.5-2 — the button is withheld, not disabled, on an engine that cannot
                carry this action; a greyed control invites a hunt for the switch that turns
                it on, and there isn't one. The brief itself stays visible and editable:
                switching to a subscription engine later should find it already written. */}
            {/* ⚠️ A rule above it and a border around it (2026-08-12, Ocean: 「联网搜索的按钮
                和上面的跟进内容之间划一条线，或者把它做成一个按钮，不然不明显」). It was bare
                text with an icon, sitting flush under the brief in the same frame — so the one
                control in this panel that reaches the open web read as one more line of the
                brief. Both halves of what he offered, because they fix different halves of the
                problem: the rule separates it from the text above, the border says it is a
                thing you press. It stays inline-width, not a full-width bar (§9.13 #2). */}
            {thread.followUpBrief &&
              (engineSupportsWeb(status?.selected ?? null) ? (
                <div className="mt-2 border-t border-line pt-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      enqueue(thread.id, thread.title, "follow_up", timeoutSecs)
                    }
                    title={t("照你定的那几行联网搜索")}
                    className="flex items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-[13px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted disabled:opacity-60"
                  >
                    <Globe size={12} className="flex-none" />
                    {t("联网搜索")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">
                  {t("联网搜索这一项 Gemini CLI 跑不了——它的免费额度一次跟进就用完了。换成 Claude Code 或 Codex 才有。")}
                </p>
              ))}
          </div>
        )}

        {/* ⚠️ **「跟进用的」 is no longer in this column** (2026-08-12, Ocean: 「『选择跟进用的
            AI』，把这个选择键放到编辑的面板里面，这个按钮不常用」). It moved into the follow-up
            editor (ThreadView/FollowUpPanel) — one panel deeper, reached by 编辑, which is
            where you already are when you are deciding what a follow-up should do.
            ⚠️ It cost the thing the 2026-08-11 note here defended: with no engine installed
            the 跟进 block does not render, so 「没检测到引擎」 has nowhere to appear in the rail.
            That trade is deliberate and it is not a silent one — the 「装了 Claude Code 或
            Codex…」 line further up this column already tells a user with no engine what to
            install, and Settings → AI still reports what was detected. A permanently-visible
            picker for a decision taken once is what he asked to be rid of. */}

        {/* DESIGN_PROJECT_FILES §3.2 — the project's files. Always present (a project with
            no files says so and offers the ＋), because this is now the ONLY place a file can
            be added or seen: the block action bar's 📎 and 🔗 are gone. */}
        {thread && <ProjectFiles threadId={thread.id} />}

        {/* R2's durable half — the one surviving fold, and the only thing in the rail that
            is reference rather than action. Absent entirely in a project no AI has touched
            (§2.5 安静原则 — a thread the user keeps to themselves grows no AI panel). */}
        {writtenCount > 0 && (
          <div className="border-t border-line pt-2.5">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-muted transition-colors hover:text-ink-2"
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
                    <div className="text-[11px] text-muted">
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
                              <span className="flex-none font-mono text-[11px] text-muted">
                                #{b.seq}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
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
      </div>

      {/* ⚠️ The bottom action row is gone with the two actions it held (see the note at the
          top of this file), and so is the per-project 自动维护 switch that sat under it: the
          only thing automation still runs is 周回顾, which reads every project and therefore
          cannot be opted out of one at a time. That switch now lives, library-wide, in the
          view that owns the action (components/ReviewBoard). */}
    </aside>
  );
}
