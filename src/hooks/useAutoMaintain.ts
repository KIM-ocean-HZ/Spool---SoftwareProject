import { useEffect, useRef } from 'react';
import { lastWeeklyAttemptAt, weeklyReviewDue } from '@/lib/db/engineRuns';
import { WEEKLY_REVIEW_PERIOD_MS } from '@/lib/weeks';
import { runWeeklyReviewViaApi } from '@/lib/ai/weeklyReview';
import { canShowEngineActions, effectiveAutoRoute } from '@/lib/engine/gate';
import { useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useBalanceStore } from '@/stores/balanceStore';

// DESIGN_WORKBENCH §4.3 / §11.2 — automatic maintenance.
//
// Ocean 2026-08-06: "我倾向于ai维护自动化,且必须节约token…让用户放心并且有开关",
// and the decision he took was 「只在项目真变了才跑」.
//
// ⚠️ **2026-08-11: there is only ONE automatic action left — 周回顾.** The automatic
// per-project 压缩 that used to live here went with the action itself (§11.2): Ocean judged
// what it wrote 「总结性的语句没什么用，如果放在上下文里只会造成冗余」, and an automatic run
// producing it was that verdict on a timer, spending money without being asked twice.
//
// What that removes along with it: SETTLE and COOLDOWN (both existed to decide WHICH project
// was worth distilling), and the per-project opt-out (a review reads every project, so there
// is no "this one" to opt out of). What is left is one question asked every tick.
//
//  * WEEKLY — 周回顾 is a weekly thing; it says so in its name. ⚠️ The number itself lives
//    in lib/weeks beside the OTHER week ruler (the display one), so the two can be read
//    side by side — see that file for why they are deliberately different.
//  * TICK — how often this even looks. The check is one indexed query against SQLite, so
//    the cost of looking is nothing; the cost of ACTING is what WEEKLY bounds.
const TICK_MS = 10 * 60_000;
//  * RETRY — ⛔ **踩刹车的那一条,别删。** `weeklyReviewDue` 只认跑成的,所以一次失败之后
//    它一直是 true,而这个循环每十分钟问一次。CLI 那边这只是白转;⚠️ 08-26 起自动这条路
//    可以走 API,而 API 按字数计费 —— key 填错一个字符、或者端点半死不活地超时,就会变成
//    每十分钟烧一次钱,用户什么都看不见。所以两次**尝试**之间至少隔这么久。
const RETRY_MS = 60 * 60_000;

export function useAutoMaintain(): void {
  const enabled = useSettingsStore((s) => s.aiAutoMaintain);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const cliAvailable = useEngineStore((s) => s.status?.available === true);
  // W2 — which of the two roads the automatic run takes, and everything the API road needs
  // to travel. ⚠️ The API road has NO model setting of its own: `apiModel` is the same box
  // the manual button reads, on purpose (settingsStore's `autoReviewRoute` note).
  const route = useSettingsStore((s) => s.autoReviewRoute);
  const apiOn = useSettingsStore((s) => s.apiEngineEnabled);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const apiModel = useSettingsStore((s) => s.apiModel);
  const apiReasoning = useSettingsStore((s) => s.apiReasoning);
  const apiTimeoutSecs = useSettingsStore((s) => s.apiTimeoutSecs);

  // Held in a ref so the interval below never has to be town down and rebuilt when a
  // setting changes mid-cycle — the tick reads the latest values when it fires.
  const gate = useRef({
    enabled, mcpEnabled, mcpWriteEnabled, actionsEnabled, cliAvailable, timeoutSecs,
    route, apiOn, apiBaseUrl, apiModel, apiReasoning, apiTimeoutSecs,
  });
  gate.current = {
    enabled, mcpEnabled, mcpWriteEnabled, actionsEnabled, cliAvailable, timeoutSecs,
    route, apiOn, apiBaseUrl, apiModel, apiReasoning, apiTimeoutSecs,
  };

  useEffect(() => {
    let stopped = false;

    const tick = async (): Promise<void> => {
      const g = gate.current;
      if (stopped || !g.enabled) return;
      // W2 — one gate per road, because they are gated by different things.
      //
      // ⚠️ The CLI road keeps the three-way gate the manual actions render behind: without
      // the write switch those runs cannot store what they produce, so starting one would be
      // spending money on an answer with nowhere to go.
      //
      // ⚠️ The API road does NOT go through that gate, and that is not an oversight: it never
      // touches MCP. It gets one prompt in and one piece of prose out, `weekly_review_via_api`
      // writes nothing into the library at all, and the result lands in `engine_runs` like the
      // CLI's does. Requiring 「允许 AI 写入」 for it would gate a road on a door it never opens.
      const cliReady = canShowEngineActions({
        cliAvailable: g.cliAvailable,
        mcpEnabled: g.mcpEnabled,
        mcpWriteEnabled: g.mcpWriteEnabled,
        actionsEnabled: g.actionsEnabled,
      });
      // ⚠️ The preference may name a road that is not walkable today (CLI uninstalled, API
      // switched off). `effectiveAutoRoute` falls back to the one that is — and ReviewBoard
      // prints which one it will be, because the other road bills per token.
      const route = effectiveAutoRoute(g.route, cliReady, g.apiOn);
      if (route === null) return;
      const viaApi = route === 'api';
      // Something is already running or waiting: adding to the queue now would spend on
      // work whose predecessor the user has not seen yet.
      const { current, queue, enqueue } = useEngineStore.getState();
      if (current || queue.length > 0) return;

      try {
        // §3.4: it belongs to no project. The title is only what the queue displays; the
        // run itself reads the whole library.
        const now = Date.now();
        if (!(await weeklyReviewDue(now, WEEKLY_REVIEW_PERIOD_MS))) return;
        // The brake (RETRY_MS). ⚠️ It can only ever bite AFTER a failure: a run that
        // succeeded already turned the check above off for a week.
        const attempted = await lastWeeklyAttemptAt();
        if (attempted !== null && now - attempted < RETRY_MS) return;
        if (viaApi) {
          // ⚠️ Runs right here rather than through the queue: the queue is the CLI's
          // (it holds one child process group so 停下 has something to aim at), and this
          // road has no child of Spool's to stop. The row it writes is the same shape,
          // which is why 周回顾 that page needs no second list.
          await runWeeklyReviewViaApi({
            apiBaseUrl: g.apiBaseUrl,
            apiModel: g.apiModel,
            apiReasoning: g.apiReasoning,
            apiTimeoutSecs: g.apiTimeoutSecs,
          });
          // Same argument the queue passes when a CLI run lands, so 周回顾's list (which
          // watches `runs`) re-reads without polling.
          await useEngineStore.getState().loadRuns(useThreadsStore.getState().activeId);
          // 「跑完顺带刷一次」（X 批）—— 这次出网已经发生了。
          void useBalanceStore.getState().refresh();
        } else {
          enqueue('', '', 'weekly_review', g.timeoutSecs);
        }
      } catch (e) {
        // A failed check is not worth telling the user about: nothing was promised, and the
        // next tick tries again.
        console.warn('[auto-maintain] check failed', e);
      }
    };

    // Not on mount: launching the app is not a reason to spend money, and the settle window
    // means anything genuinely due will still be due one tick from now.
    const id = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);
}
