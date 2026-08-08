import { useEffect, useRef } from 'react';
import { weeklyReviewDue } from '@/lib/db/engineRuns';
import { canShowEngineActions } from '@/lib/engine/gate';
import { useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';

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
//  * WEEKLY — 周回顾 is a weekly thing; it says so in its name.
//  * TICK — how often this even looks. The check is one indexed query against SQLite, so
//    the cost of looking is nothing; the cost of ACTING is what WEEKLY bounds.
const WEEKLY_MS = 7 * 24 * 60 * 60_000;
const TICK_MS = 10 * 60_000;

export function useAutoMaintain(): void {
  const enabled = useSettingsStore((s) => s.aiAutoMaintain);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const cliAvailable = useEngineStore((s) => s.status?.available === true);

  // Held in a ref so the interval below never has to be town down and rebuilt when a
  // setting changes mid-cycle — the tick reads the latest values when it fires.
  const gate = useRef({ enabled, mcpEnabled, mcpWriteEnabled, actionsEnabled, cliAvailable, timeoutSecs });
  gate.current = { enabled, mcpEnabled, mcpWriteEnabled, actionsEnabled, cliAvailable, timeoutSecs };

  useEffect(() => {
    let stopped = false;

    const tick = async (): Promise<void> => {
      const g = gate.current;
      if (stopped || !g.enabled) return;
      // The same three-way gate the manual actions render behind: without the write switch
      // these runs cannot store what they produce, so starting one would be spending money
      // on an answer with nowhere to go.
      if (
        !canShowEngineActions({
          cliAvailable: g.cliAvailable,
          mcpEnabled: g.mcpEnabled,
          mcpWriteEnabled: g.mcpWriteEnabled,
          actionsEnabled: g.actionsEnabled,
        })
      ) {
        return;
      }
      // Something is already running or waiting: adding to the queue now would spend on
      // work whose predecessor the user has not seen yet.
      const { current, queue, enqueue } = useEngineStore.getState();
      if (current || queue.length > 0) return;

      try {
        // §3.4: it belongs to no project. The title is only what the queue displays; the
        // run itself reads the whole library.
        if (await weeklyReviewDue(Date.now(), WEEKLY_MS)) {
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
