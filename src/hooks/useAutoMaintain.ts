import { useEffect, useRef } from 'react';
import { threadsDueForMaintenance, weeklyReviewDue } from '@/lib/db/engineRuns';
import { canShowEngineActions } from '@/lib/engine/gate';
import { useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';

// DESIGN_WORKBENCH §4.3 — automatic maintenance.
//
// Ocean 2026-08-06: "我倾向于ai维护自动化,且必须节约token…让用户放心并且有开关",
// and the decision he took was 「只在项目真变了才跑」.
//
// Every number below is a spending decision, so they are named and gathered here rather
// than buried in a query:
//
//  * SETTLE — how long a project must sit still before it counts as "changed". Capturing
//    is bursty; five clips in a minute are one thought, and distilling after the first
//    bills for a half-written project and is stale by the time it returns.
//  * COOLDOWN — a hard per-project ceiling. Whatever else happens, one project cannot cost
//    more than one automatic run a day.
//  * WEEKLY — 生成周回顾 is a weekly thing; it says so in its name.
//  * TICK — how often this even looks. The check is two indexed queries against SQLite, so
//    the cost of looking is nothing; the cost of ACTING is what the three above bound.
//
// ONE project per tick, deliberately. Runs are serial anyway (engineStore's queue), so
// enqueueing five would not make them finish sooner — it would just commit to spending on
// all five before the user has seen what the first one produced.
const SETTLE_MS = 10 * 60_000;
const COOLDOWN_MS = 24 * 60 * 60_000;
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
        const now = Date.now();
        // The library-wide review first — it is the one that is about time passing rather
        // than about a project moving, so a busy week must not crowd it out forever.
        if (await weeklyReviewDue(now, WEEKLY_MS)) {
          // §3.4: it belongs to no project. The title is only what the queue displays; the
          // run itself reads the whole library.
          enqueue('', '', 'weekly_review', g.timeoutSecs);
          return;
        }
        const due = await threadsDueForMaintenance(now, SETTLE_MS, COOLDOWN_MS);
        const next = due[0];
        if (next) enqueue(next.id, next.title, 'distill', g.timeoutSecs);
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
