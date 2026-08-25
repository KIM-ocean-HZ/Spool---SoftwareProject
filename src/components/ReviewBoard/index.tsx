import { CalendarRange, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { MarkdownContent } from '@/lib/blocks/MarkdownContent';
import { listRunsForAction, recordRun, type EngineRun } from '@/lib/db/engineRuns';
import { loadApiKey, weeklyReviewViaApi } from '@/lib/ai/compress';
import { toast } from '@/stores/toastStore';
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
  const cancel = useEngineStore((s) => s.cancel);
  const engineStatus = useEngineStore((s) => s.status);
  const probe = useEngineStore((s) => s.probe);

  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);
  const update = useSettingsStore((s) => s.update);

  const [reviews, setReviews] = useState<EngineRun[] | null>(null);

  // ⭐⭐ 2026-08-25（Ocean）——「CLI 只支持 codex 和 claude，这两个模型太贵了
  // （gemini 的能力有限，且额度少），加入 deepseek 的周总结，总结的 model 可以让用户自行选择」。
  //
  // ⚠️ **两条路并存，不是替换。** CLI 那条（形态 B）一分钱不花、一个 key 不填；
  // 这一条（形态 C）用用户自己填的端点和模型 —— 设置里那个「模型」框本来就是他的，
  // ⛔ 这里不再发明第二套模型设置。
  const apiOn = useSettingsStore((s) => s.apiEngineEnabled);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const apiModel = useSettingsStore((s) => s.apiModel);
  const apiReasoning = useSettingsStore((s) => s.apiReasoning);
  const apiTimeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);
  const [apiRunning, setApiRunning] = useState(false);


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

  /** 用 API 跑一次周回顾。
   *
   *  ⚠️ 材料**不在这儿拼** —— Rust 那边自己开库拼（digest 当历史 + 本周新加的块当新动作，
   *  ⭐ 范围是 Ocean 拍的：「不是整个 pack」）。前端只负责端点、key、模型和记账。
   *
   *  ⚠️ 记进 `engine_runs` 走的是和 CLI 那条**同一张表**，所以跑完之后这一页的列表
   *  自己就有了，⛔ 不需要第二套显示。 */
  const runViaApi = useCallback(async (): Promise<void> => {
    if (apiRunning) return;
    setApiRunning(true);
    const startedAt = Date.now();
    try {
      const key = await loadApiKey();
      const out = await weeklyReviewViaApi({
        baseUrl: apiBaseUrl,
        apiKey: key,
        model: apiModel,
        reasoning: apiReasoning,
        timeoutSecs: apiTimeoutSecs,
      });
      await recordRun({
        action: 'weekly_review',
        // 周回顾读的是整个库，不属于任何一个项目 —— 和 CLI 那条一样。
        threadId: null,
        // ⚠️ 记「实际跑的是哪个模型」而不是一句「api」：按次付费的时候，
        // 「我以为在用 Flash」和「实际在用 Pro」差好几倍，而端点会回报真名。
        engine: out.model ?? apiModel,
        outcome: out.ok ? 'ok' : 'failed',
        resultText: out.text.trim() || null,
        detail: out.ok ? null : (out.message ?? null),
        blocksWritten: 0,
        proposalsQueued: 0,
        usage: {
          model: out.model ?? apiModel,
          costUsd: null,
          inputTokens: out.inputTokens || null,
          outputTokens: out.outputTokens || null,
        },
        startedAt,
        finishedAt: Date.now(),
      });
      // ⚠️「有回话」，⛔ 不是「写好了」—— 2026-08-11 那条纪律：Spool 判断不了一段散文
      // 是回顾还是道歉，所以不许替它宣称。
      toast.notice(
        out.ok
          ? t('周回顾跑完了，就在下面')
          : t('周回顾没跑成'),
      );
    } catch (e) {
      toast.error(t('周回顾没跑成'), e instanceof Error ? e.message : String(e));
    } finally {
      setApiRunning(false);
      load();
    }
  }, [apiRunning, apiBaseUrl, apiModel, apiReasoning, apiTimeoutSecs, load, t]);

  const engineReady = canShowEngineActions({
    cliAvailable: engineStatus?.available === true,
    mcpEnabled,
    mcpWriteEnabled,
    actionsEnabled,
  });
  const running = current?.action === 'weekly_review';
  /** 装着的那个 CLI 叫什么。⚠️ 两条路并排摆着的时候，光写「回顾这一周」两遍
   *  用户分不出哪个是哪个 —— 按钮上必须说出跑的是谁。 */
  const cliName = engineStatus?.selected
    ? (ENGINE_LABEL[engineStatus.selected] ?? engineStatus.selected)
    : null;

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

      {/* ⭐ 2026-08-25：**两条路并存**，所以这根条子的闸是「随便哪条准备好了」，
          ⛔ 不再只认 CLI。以前只认 `engineReady`，于是一个没装 CLI、但填了 API key 的用户
          在这一屏上看不到任何可以点的东西。 */}
      {(engineReady || apiOn) && (
        <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2">
          {engineReady && (
          <button
            type="button"
            disabled={current !== null || apiRunning}
            onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
            title={t('回顾最近一周——读一遍所有项目')}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:bg-paper-2 enabled:hover:text-accent disabled:text-muted disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={12} className="flex-none animate-spin" />
            ) : (
              <CalendarRange size={12} className="flex-none" />
            )}
            {running
              ? t('正在回顾…')
              : cliName
                ? t('回顾这一周（用 {engine}）', { engine: cliName })
                : t('回顾这一周')}
          </button>
          )}

          {/* ⭐⭐ Ocean 2026-08-25：「加入 deepseek 的周总结，总结的 model 可以让用户自行选择」。
              ⚠️ 模型是**设置里那个「模型」框**（`apiModel`），⛔ 这里不再做第二个选择器 ——
              按钮上把它的名字说出来，用户点之前就知道这一下花的是谁的钱。 */}
          {apiOn && (
            <button
              type="button"
              disabled={apiRunning || current !== null}
              onClick={() => void runViaApi()}
              title={t('用你自己填的端点和模型跑一次（按字数计费）')}
              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:bg-paper-2 enabled:hover:text-accent disabled:text-muted disabled:opacity-50"
            >
              {apiRunning ? (
                <Loader2 size={12} className="flex-none animate-spin" />
              ) : (
                <CalendarRange size={12} className="flex-none" />
              )}
              {apiRunning
                ? t('正在回顾…')
                : t('回顾这一周（用 {engine}）', { engine: apiModel })}
            </button>
          )}

          {/* ⭐ 2026-08-25（Ocean:「周回顾没法暂停」）—— 停下的按钮以前**只长在右边栏的
              LiveRun 卡片上**，而钉住的视图（项目管理 / 周回顾）根本不挂右边栏（App.tsx:
              `pinnedView ? null : …`）。所以从这一屏点「回顾这一周」的人，看着它转，
              没有任何地方能停。⛔ 别用「跳回项目再停」搪塞：他就在这一屏。
              ⚠️ 停下不是暂停 —— 停了不能续跑，再点一次是从头跑（已经写进去的留着）。 */}
          {running && (
            <button
              type="button"
              onClick={() => void cancel()}
              title={t('点一下停下来（停了不能续跑，再点就是从头再来）')}
              className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {t('停下')}
            </button>
          )}

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
