import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

// DESIGN_AI_ENGINE §1.2/§1.3 — run state for the "让 AI 维护" actions.
//
// One run per thread, and (M1) one run globally: the actions write through MCP, and
// serialising them is what keeps two agents from interleaving writes into the same
// library. M2 turns this into a real queue; for now a second request while one is in
// flight is simply refused, which the menu already prevents by disabling itself.
//
// Detection is cached here rather than re-probed per menu open: `which` + `--version` is
// two process spawns, and the answer only changes when the user installs something.

export type EngineAction = 'distill';

interface EngineStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

interface EngineState {
  status: EngineStatus | null;
  /** Thread id currently being worked on, or null. §1.2: the head pill reads this. */
  runningThreadId: string | null;
  /** Last outcome, for the §1.3 toast. Cleared once shown. */
  lastResult: { threadId: string; ok: boolean; message: string } | null;
  probe: () => Promise<void>;
  run: (threadId: string, projectTitle: string, timeoutSecs: number) => Promise<void>;
  clearResult: () => void;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  status: null,
  runningThreadId: null,
  lastResult: null,

  probe: async () => {
    try {
      set({ status: await invoke<EngineStatus>('ai_engine_status') });
    } catch (e) {
      // A failed probe is "no CLI", not an error to surface: §0 says absence is the
      // default state, and the menu group simply stays hidden.
      console.warn('[engine] status probe failed', e);
      set({ status: { available: false, version: null, path: null } });
    }
  },

  run: async (threadId, projectTitle, timeoutSecs) => {
    if (get().runningThreadId) return; // §1.2 serial; the menu is disabled meanwhile
    set({ runningThreadId: threadId, lastResult: null });
    try {
      const message = await invoke<string>('ai_engine_run', {
        action: 'distill' satisfies EngineAction,
        project: projectTitle,
        timeoutSecs,
      });
      set({ lastResult: { threadId, ok: true, message } });
    } catch (e) {
      // §1.3: never a half-finished state. Blocks the AI already wrote stay (append-only,
      // §2.3) — the message says it stopped, not that it was undone.
      set({
        lastResult: { threadId, ok: false, message: e instanceof Error ? e.message : String(e) },
      });
    } finally {
      set({ runningThreadId: null });
    }
  },

  clearResult: () => set({ lastResult: null }),
}));
