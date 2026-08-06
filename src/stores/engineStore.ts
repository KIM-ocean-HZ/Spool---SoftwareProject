import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { countMcpBlocks } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import { useBlocksStore } from './blocksStore';
import { useProposalsStore } from './proposalsStore';
import { useSettingsStore } from './settingsStore';
import { useThreadsStore } from './threadsStore';
import { toast } from './toastStore';

// DESIGN_AI_ENGINE §1.1–§1.3 — running the "让 AI 维护" actions.
//
// M2 turns M1's "one run, refuse the rest" into a real queue, and the reason is §1.2's:
// every action writes through MCP, and two `claude` processes appending to one library at
// the same moment is a race nobody asked for. So runs are strictly serial — a second
// click queues rather than starting, and the head pill says how many are waiting.
//
// One task per thread at a time, too. Two "distil this project" runs on the same project
// would produce two conclusion blocks off the same material, which is the noise the write
// gate (DESIGN_MCP_WRITE_ROLE §2) exists to keep out of the library.
//
// Detection is cached rather than re-probed per menu open: `which` + `--version` is two
// process spawns, and the answer only changes when the user installs something.

export type EngineAction = 'distill' | 'thread_health' | 'weekly_review';

// The name the user picked it by. Kept beside the action so a finished run can be
// reported in the words of the menu entry rather than of the MCP tool.
export const ACTION_LABEL: Record<EngineAction, string> = {
  distill: '提炼结论',
  thread_health: '整理去重',
  weekly_review: '生成周回顾',
};

/** §7: which CLI is behind the engine slot. The wire names match Rust's EngineKind. */
export type EngineKind = 'claude' | 'codex';

/** How each engine is written where the user reads it. Product names, so never translated
 *  — the same reason the source badge shows "Claude · MCP" in both languages. */
export const ENGINE_LABEL: Record<EngineKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export interface DetectedEngine {
  kind: EngineKind;
  version: string | null;
  path: string;
}

interface EngineStatus {
  available: boolean;
  /** The engine a run would use right now — the user's pick, or the only one installed. */
  selected: EngineKind | null;
  version: string | null;
  path: string | null;
  /** Every engine found. §7.4: the settings page offers a choice only when this has two. */
  engines: DetectedEngine[];
}

export interface EngineTask {
  id: number;
  threadId: string;
  threadTitle: string;
  action: EngineAction;
}

/** DESIGN_AI_ENGINE §5 M3 — one finished run, for the "AI 活动" fold. Session-only on
 *  purpose: the durable trace of a run is the blocks it wrote, which are in the database
 *  with their source labels and timestamps. This just names the action that caused them
 *  while the user is still in the session where they pressed it. */
export interface EngineRun {
  id: number;
  threadId: string;
  action: EngineAction;
  outcome: 'ok' | 'failed' | 'cancelled';
  /** How many blocks landed in the library across the whole run — counted, not claimed. */
  blocksWritten: number;
  finishedAt: number;
}

interface EngineState {
  status: EngineStatus | null;
  /** The run in flight, or null. §1.2: the head pill reads this. */
  current: EngineTask | null;
  /** Waiting their turn, in order. */
  queue: EngineTask[];
  runs: EngineRun[];
  probe: () => Promise<void>;
  /** Queue one action. Returns false when it was refused (already queued for this thread). */
  enqueue: (threadId: string, threadTitle: string, action: EngineAction, timeoutSecs: number) => boolean;
  /** Stop the running task and drop everything still waiting (§1.2 — the pill is one
   *  control, and a user stopping "the AI" does not mean "and then start the next one"). */
  cancel: () => Promise<void>;
}

// The Rust side returns this exact string when the user stopped the run. A cancel is not
// a failure and must not be reported as one (engine.rs CANCELLED_MARKER).
const CANCELLED_MARKER = 'spool:cancelled';

let nextTaskId = 1;
// Held outside the store: it is one number per queued task, not state anything renders.
const timeouts = new Map<number, number>();

export const useEngineStore = create<EngineState>((set, get) => {
  // Drain the queue one task at a time. Re-entrant by construction: it returns
  // immediately if something is already running, and calls itself when that finishes.
  const pump = async (): Promise<void> => {
    if (get().current) return;
    const [next, ...rest] = get().queue;
    if (!next) return;
    set({ current: next, queue: rest });
    const timeoutSecs = timeouts.get(next.id) ?? 300;
    timeouts.delete(next.id);

    // Counted before and after, because "AI 归档了 N 块" has to be true. The blocks are
    // written by a different process through MCP, and they may land in projects other
    // than this one (生成周回顾 files wherever the user's review belongs) — so the count
    // is library-wide, but narrowed to MCP-labelled rows so a capture the user made during
    // those same minutes is not reported back to them as the AI's work.
    let before = 0;
    try {
      before = await countMcpBlocks();
    } catch {
      before = -1; // unknown; reported as a plain "finished" below
    }

    let outcome: EngineRun['outcome'] = 'ok';
    let detail: string | null = null;
    try {
      await invoke<string>('ai_engine_run', {
        action: next.action,
        project: next.threadTitle,
        timeoutSecs,
        // Read at the moment the task starts, not when it was queued: a run that waited
        // out three others should use the engine the settings page says now.
        engine: useSettingsStore.getState().aiEngine,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      outcome = message.includes(CANCELLED_MARKER) ? 'cancelled' : 'failed';
      detail = outcome === 'failed' ? message : null;
    }

    // Whatever the outcome, blocks written before it stopped are in the library and stay
    // there (§2.3 — append-only, no rollback). So the reload and the count happen on
    // every path, not just the happy one.
    let written = 0;
    try {
      const after = await countMcpBlocks();
      written = before < 0 ? 0 : Math.max(0, after - before);
      await useThreadsStore.getState().loadAll();
      const active = useThreadsStore.getState().activeId;
      if (active) await useBlocksStore.getState().load(active);
      // An action may have queued proposals instead of writing (propose_blocks) — the
      // badge has to notice without waiting for a window focus.
      await useProposalsStore.getState().refresh();
    } catch (e) {
      console.warn('[engine] post-run reload failed', e);
    }

    const label = t(ACTION_LABEL[next.action]);
    if (outcome === 'ok') {
      toast.notice(
        written > 0
          ? t('{action}：AI 归档了 {n} 块', { action: label, n: written })
          : t('{action}：跑完了，没有新增块', { action: label }),
      );
    } else if (outcome === 'cancelled') {
      // Stopping is not undoing. If something already landed, say so — the user will
      // find it in the thread either way, and a silent partial result is worse.
      toast.notice(
        written > 0
          ? t('已停止 {action}；已经写进去的 {n} 块留着（Spool 只追加，不回滚）', {
              action: label,
              n: written,
            })
          : t('已停止 {action}', { action: label }),
      );
    } else {
      toast.error(
        written > 0
          ? t('{action} 没跑完；已经写进去的 {n} 块留着', { action: label, n: written })
          : t('{action} 没跑成', { action: label }),
        detail ?? undefined,
      );
    }

    set((s) => ({
      current: null,
      runs: [
        {
          id: next.id,
          threadId: next.threadId,
          action: next.action,
          outcome,
          blocksWritten: written,
          finishedAt: Date.now(),
        },
        ...s.runs,
      ].slice(0, 20),
    }));
    void pump();
  };

  return {
    status: null,
    current: null,
    queue: [],
    runs: [],

    probe: async () => {
      try {
        // The preference only decides anything when both CLIs are installed; Rust falls
        // back on its own when it names one that is not there (§7.4).
        const preferred = useSettingsStore.getState().aiEngine;
        set({ status: await invoke<EngineStatus>('ai_engine_status', { preferred }) });
      } catch (e) {
        // A failed probe is "no CLI", not an error to surface: §0 says absence is the
        // default state, and the menu group simply stays hidden.
        console.warn('[engine] status probe failed', e);
        set({ status: { available: false, selected: null, version: null, path: null, engines: [] } });
      }
    },

    enqueue: (threadId, threadTitle, action, timeoutSecs) => {
      const { current, queue } = get();
      // Same thread twice would distil the same material into two blocks. Same action on
      // a different thread is fine — it just waits.
      const busyOnThisThread =
        current?.threadId === threadId || queue.some((q) => q.threadId === threadId);
      if (busyOnThisThread) {
        toast.notice(t('这条脉络已经排上了，等它跑完'));
        return false;
      }
      const task: EngineTask = { id: nextTaskId++, threadId, threadTitle, action };
      timeouts.set(task.id, timeoutSecs);
      set({ queue: [...queue, task] });
      void pump();
      return true;
    },

    cancel: async () => {
      // Drop the waiting tasks first: if the kill lands while pump is between tasks, an
      // empty queue is what stops it from starting the next one.
      timeouts.clear();
      set({ queue: [] });
      try {
        await invoke<boolean>('ai_engine_cancel');
      } catch (e) {
        console.warn('[engine] cancel failed', e);
      }
    },
  };
});
