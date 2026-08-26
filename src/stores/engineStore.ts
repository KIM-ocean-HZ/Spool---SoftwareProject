import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { countMcpBlocks } from '@/lib/db/blocks';
import {
  listRecentRuns,
  listRunsForThread,
  markReviewed,
  recordRun,
  type EngineRun,
  type RunUsage,
} from '@/lib/db/engineRuns';
import { dropProposals, listBatchesCreatedSince } from '@/lib/db/proposals';
import { getFollowUpState, setFollowUpState } from '@/lib/db/threads';
import {
  parseFollowUpState,
  rememberProposals,
  serializeFollowUpState,
  siftProposals,
} from '@/lib/engine/followUp';
import { toolCaption } from '@/lib/engine/progress';
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

export type EngineAction =
  | 'distill'
  | 'thread_health'
  | 'weekly_review'
  | 'follow_up_brief'
  | 'follow_up';

// The name the user picked it by. Kept beside the action so a finished run can be
// reported in the words of the menu entry rather than of the MCP tool.
export const ACTION_LABEL: Record<EngineAction, string> = {
  distill: '压缩',
  thread_health: '去重',
  weekly_review: '周回顾',
  follow_up_brief: '找出还没解决的问题',
  follow_up: '跟进',
};

/** §7: which CLI is behind the engine slot. The wire names match Rust's EngineKind. */
export type EngineKind = 'claude' | 'codex' | 'gemini';

/** How each engine is written where the user reads it. Product names, so never translated
 *  — the same reason the source badge shows "Claude · MCP" in both languages. */
export const ENGINE_LABEL: Record<EngineKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
};

/** DESIGN_AI_ENGINE §7.8.5-2 — 跟进 is withheld on Gemini. It is the only multi-turn agentic
 *  action, and 2026-08-10 measured it burning a whole day of the free tier's 20 requests
 *  without finishing. Rust refuses it too (`supports_web`); this is what keeps the button
 *  from appearing in the first place, the same quiet withholding §1.1 uses when no CLI is
 *  installed at all. */
export const engineSupportsWeb = (kind: EngineKind | null): boolean => kind !== 'gemini';

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

/** DESIGN_FOLLOW_UP §3.2: 找出还没解决的问题 is the one action whose OUTPUT is the point — the
 *  draft brief comes back as text for the user to read and edit, and nothing is stored
 *  until they say so. Every other action's product is blocks or proposals, which the run
 *  has already put in the database by the time it returns. */
type ResultHandler = (result: string) => void;

/** What one run hands back. DESIGN_WORKBENCH §4.1: this used to be a bare string, and the
 *  string was thrown away for every action but 找出还没解决的问题 — which is why a weekly review
 *  the AI had fully written came back to the user as "跑完了，没有新增块" (§1.1). */
interface EngineRunResult {
  result: string;
  /** Which engine actually ran — resolved in Rust, since a preference naming an
   *  uninstalled engine falls back (§7.4). */
  engine: string;
  usage: RunUsage;
}

/** DESIGN_WORKBENCH §9.3 #4 — what the rail shows WHILE a run is going.
 *
 *  Ocean's second-round verdict put this at the centre of the UI ("以 ai 的流式进度…为主体"),
 *  and it is the one thing the old shape could not do at all: the run handed back a single
 *  string when the process exited, so there was nothing to show in between. */
export interface RunProgress {
  /** Everything the model has typed this run, tail-trimmed (see PROGRESS_TAIL_CHARS). */
  text: string;
  /** The tool it reached for most recently, already in the user's words. Null before the
   *  first one — a run that is still thinking has nothing honest to caption. */
  caption: string | null;
}

/** The typed text is a live view, not a record: the run's real answer arrives at the end and
 *  goes to the database. Keeping the whole transcript would grow without limit on a long
 *  agentic run, so only the tail is held — that is what a "currently typing" panel shows. */
const PROGRESS_TAIL_CHARS = 4_000;

interface EngineState {
  status: EngineStatus | null;
  /** The run in flight, or null. §1.2: the head pill reads this. */
  current: EngineTask | null;
  /** Live output of `current`, or null when nothing is running. */
  progress: RunProgress | null;
  /** Waiting their turn, in order. */
  queue: EngineTask[];
  /** Finished runs, newest first — read from `engine_runs`, not held in memory.
   *  DESIGN_WORKBENCH §4.1: these used to be session-only, on the reasoning that "the
   *  durable trace of a run is the blocks it wrote". That reasoning only held for runs that
   *  wrote blocks; two of the three actions produce a paragraph and nothing else, and
   *  closing the window threw away a review that had cost real money to produce. */
  runs: EngineRun[];
  probe: () => Promise<void>;
  /** Load the runs the right rail shows: this project's, plus the library-wide ones
   *  (周回顾 belongs to no project — §3.4). */
  loadRuns: (threadId: string | null) => Promise<void>;
  /** The user answered a run card. The row stays either way — what the AI said and what it
   *  cost is the audit trail, and dropping it on dismissal would make the total lie. */
  dismissRun: (id: string) => Promise<void>;
  /** Queue one action. Returns false when it was refused (already queued for this thread).
   *  `onResult` runs only when the action finishes cleanly — see ResultHandler. */
  enqueue: (
    threadId: string,
    threadTitle: string,
    action: EngineAction,
    timeoutSecs: number,
    onResult?: ResultHandler,
  ) => boolean;
  /** Stop the running task and drop everything still waiting (§1.2 — the pill is one
   *  control, and a user stopping "the AI" does not mean "and then start the next one"). */
  cancel: () => Promise<void>;
  /** Whether the follow-up brief editor is open. Held here rather than in each caller
   *  because DESIGN_WORKBENCH §3.2 kept the ⋯ menu entry alive alongside the new one in
   *  the right rail — two local `useState`s would be two independent panels, and opening
   *  one from each surface would stack two modals on top of each other. */
  briefOpen: boolean;
  setBriefOpen: (open: boolean) => void;
}

// The Rust side returns this exact string when the user stopped the run. A cancel is not
// a failure and must not be reported as one (engine.rs CANCELLED_MARKER).
const CANCELLED_MARKER = 'spool:cancelled';

let nextTaskId = 1;
// Held outside the store: one number and one callback per queued task, neither of which is
// state anything renders.
const timeouts = new Map<number, number>();
const resultHandlers = new Map<number, ResultHandler>();

/**
 * DESIGN_FOLLOW_UP §2.4 (M3) — the dedup gate, run between the follow-up finishing and the
 * user hearing about it.
 *
 * M2 asked the model not to repeat itself and gave it nothing to compare against; the
 * prompt now carries the list of URLs already proposed (mcp.rs follow_up_seen_block), and
 * this is the half that does not depend on the model complying. §1.1 is why it has to be
 * both: Follow up is an INTAKE valve on a product whose value is that the library stays
 * clean, and "three familiar links every week" is how a user learns to distrust it.
 *
 * Returns how many genuinely new proposals survived — 0 means the honest, quiet result
 * §2.4 is built around, not a failure.
 */
const siftFollowUp = async (threadId: string, runStartedAt: number): Promise<number> => {
  const state = parseFollowUpState(await getFollowUpState(threadId));
  const now = Date.now();
  // Runs are serial, so the batches born during this run's window are this run's.
  const batches = await listBatchesCreatedSince(runStartedAt);
  const items = batches.flatMap((b) => b.items);
  if (items.length === 0) {
    // Still record the run: 「上次跑过」 is true whether or not it found anything, and M4's
    // timer will need it.
    await setFollowUpState(threadId, serializeFollowUpState({ ...state, lastRunAt: now }));
    return 0;
  }
  const { fresh, repeats } = siftProposals(items, state, now);
  if (repeats.length > 0) {
    await dropProposals(repeats.map((r) => r.id));
  }
  await setFollowUpState(threadId, serializeFollowUpState(rememberProposals(state, fresh, now)));
  return fresh.length;
};

export const useEngineStore = create<EngineState>((set, get) => {
  // Drain the queue one task at a time. Re-entrant by construction: it returns
  // immediately if something is already running, and calls itself when that finishes.
  const pump = async (): Promise<void> => {
    if (get().current) return;
    const [next, ...rest] = get().queue;
    if (!next) return;
    // Cleared here rather than when the last run finished: the panel keeps the previous
    // run's words up until there is something new to put there.
    set({ current: next, queue: rest, progress: { text: '', caption: null } });
    const timeoutSecs = timeouts.get(next.id) ?? 300;
    timeouts.delete(next.id);
    const onResult = resultHandlers.get(next.id);
    resultHandlers.delete(next.id);

    // Counted before and after, because "AI 归档了 N 块" has to be true. The blocks are
    // written by a different process through MCP, and they may land in projects other
    // than this one (周回顾 files wherever the user's review belongs) — so the count
    // is library-wide, but narrowed to MCP-labelled rows so a capture the user made during
    // those same minutes is not reported back to them as the AI's work.
    let before = 0;
    try {
      before = await countMcpBlocks();
    } catch {
      before = -1; // unknown; reported as a plain "finished" below
    }

    // A follow-up files proposals, not blocks, so the block count it moves is zero and
    // "finished, nothing new" would be the wrong thing to tell the user about a run that
    // just queued five items for review (§3.4).
    const isFollowUp = next.action === 'follow_up';

    const startedAt = Date.now();
    let outcome: EngineRun['outcome'] = 'ok';
    let detail: string | null = null;
    let resultText = '';
    // What the engine slot resolved to. Only Rust knows for sure — a preference naming an
    // uninstalled engine falls back (§7.4) — so this is what ran, not what was asked for.
    // Typed as a plain string, not EngineKind: it is stored verbatim, and the third engine
    // (DESIGN_AI_ENGINE §7.7) will arrive here before this side has a name for it.
    // ⚠️ The PROBE's answer, not the setting — and that difference is a bug found on
    // 2026-08-26 in Ocean's own library: three failed 周回顾 rows are labelled `codex`
    // while the stream inside them is unmistakably claude's. `run_action` resolves the
    // engine again by calling `detect()`, and a preference naming an uninstalled engine
    // FALLS BACK; on the success path `answer.engine` reports what really ran, but on the
    // failure path nothing overwrote this line, so the list showed the preference instead.
    // That is exactly the reading that produced 「周回顾为什么没有 codex」 — several of
    // those runs were never codex at all. `status.selected` comes from the same `detect()`,
    // so it is the same answer the run will reach.
    let ranOn: string =
      get().status?.selected ?? useSettingsStore.getState().aiEngine ?? 'claude';
    let usage: RunUsage = {
      model: null,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
    };
    try {
      const answer = await invoke<EngineRunResult>('ai_engine_run', {
        action: next.action,
        project: next.threadTitle,
        timeoutSecs,
        // Read at the moment the task starts, not when it was queued: a run that waited
        // out three others should use the engine the settings page says now.
        engine: useSettingsStore.getState().aiEngine,
        // W3-c. Null means "the account's default" and Rust omits the flag entirely.
        //
        // §9.13.6-bis: the picker is back (2026-08-10, with the third engine), so this reads
        // the setting again — per engine, because the two catalogues share no names.
        //
        // ⚠️ Sending the WRONG engine's name is harmless by construction: `run_action`
        // filters the value against the catalogue of the engine that actually runs, which is
        // not always the one asked for (a preference naming an uninstalled engine falls
        // back). That is also what neutralises an `opus` left in settings.json by a build
        // from 2026-08-07 — it is no longer in any catalogue, so it is dropped.
        model:
          useSettingsStore.getState().aiEngine === 'gemini'
            ? useSettingsStore.getState().aiModelGemini
            : useSettingsStore.getState().aiModelClaude,
        // §9.13. Same shape, different door: effort has no CLI flag, so Rust turns this
        // into `CLAUDE_CODE_EFFORT_LEVEL` on the child's env (engine.rs claude_effort_env).
        effort: useSettingsStore.getState().aiEffortClaude,
        // See probe(): the run resolves the engine again, so it needs the same extra place
        // to look.
        manualPath: useSettingsStore.getState().aiEnginePath,
      });
      resultText = answer.result;
      ranOn = answer.engine;
      usage = answer.usage;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      outcome = message.includes(CANCELLED_MARKER) ? 'cancelled' : 'failed';
      detail = outcome === 'failed' ? message : null;
    }

    // §2.4 (M3): the dedup gate runs BEFORE the reload below, so what the user's badge and
    // review screen see is already the sifted set — a repeat must never flash into the
    // queue and vanish. It runs on cancelled/failed follow-ups too: whatever the model
    // managed to queue before it stopped is in the database, and it is proposals like any
    // other.
    let queued = 0;
    if (isFollowUp) {
      try {
        queued = await siftFollowUp(next.threadId, startedAt);
      } catch (e) {
        console.warn('[engine] follow-up dedup failed', e);
      }
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
    if (outcome === 'ok' && next.action === 'follow_up_brief') {
      // Nothing was stored and nothing should be announced: the draft goes to the panel
      // the user is looking at, and they decide whether it becomes the brief (§6-2).
      onResult?.(resultText);
    } else if (outcome === 'ok' && isFollowUp) {
      // §2.4: "nothing new" is a legitimate, quiet result — not a failure and not an
      // apology. Saying it plainly is what keeps the feature from feeling broken on the
      // weeks when the world genuinely did not move. M3 makes the sentence true rather
      // than hopeful: `queued` counts what survived the dedup gate, so a run that brought
      // back five links the user has already seen says exactly this.
      toast.notice(
        queued > 0
          ? t('跟进：提了 {n} 条待你过目', { n: queued })
          : t('跟进：这次没有新东西'),
      );
    } else if (outcome === 'ok') {
      // DESIGN_WORKBENCH §1.1 — the sentence this replaces was the whole bug. 压缩 and
      // 去重 are told to say their conclusion and store it only once the user agrees;
      // headless, nobody can agree, so writing nothing is CORRECT and "没有新增块" described
      // it as if the AI had idled. What it produced is on the run card now, so point there.
      //
      // ⚠️ 「有回话」, not 「写好了」 — 2026-08-11. A weekly review that came back saying it had
      // REFUSED to write one ("读取被取消了…我先不拼凑回顾") was announced as 「AI 写好了」, so
      // Ocean stored a non-review believing it was a review. Spool cannot judge whether prose
      // is an answer or an apology, and must therefore not claim it is either.
      toast.notice(
        written > 0
          ? t('{action}：AI 归档了 {n} 块', { action: label, n: written })
          : !resultText.trim()
            ? t('{action}：跑完了，没有新增块', { action: label })
            : // A review is not in the rail any more — it is in its own view (ReviewBoard),
              // so pointing right would point at nothing.
              next.action === 'weekly_review'
              ? t('周回顾跑完了，在左边「周回顾」里')
              : t('{action}：AI 有回话，在右边等你过目', { action: label }),
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

    // The run goes to the database before the queue moves on. 找出还没解决的问题 is the one
    // exception: its draft is already in the panel the user is staring at, and it is not a
    // finding — storing every discarded draft would bury the cards that do want an answer.
    if (next.action !== 'follow_up_brief') {
      try {
        await recordRun({
          action: next.action,
          // 周回顾 reads the whole library, so it belongs to no project (§3.4).
          threadId: next.action === 'weekly_review' ? null : next.threadId,
          engine: ranOn,
          outcome,
          resultText: resultText.trim() || null,
          detail,
          blocksWritten: written,
          proposalsQueued: queued,
          usage,
          startedAt,
          finishedAt: Date.now(),
        });
      } catch (e) {
        // A run that finished but could not be filed is still a run that happened; the
        // toast above already said so. Losing the card is bad, losing the queue is worse.
        console.error('[engine] could not record the run', e);
      }
    }

    set({ current: null, progress: null });
    await get().loadRuns(useThreadsStore.getState().activeId);
    void pump();
  };

  return {
    status: null,
    current: null,
    progress: null,
    queue: [],
    runs: [],
    briefOpen: false,
    setBriefOpen: (open) => set({ briefOpen: open }),

    loadRuns: async (threadId) => {
      try {
        // Two reads, merged: this project's runs, and the library-wide ones (周回顾 has
        // no project). De-duplicated by id because the recent feed also carries this
        // project's rows when they are among the newest in the library.
        const [mine, recent] = await Promise.all([
          threadId ? listRunsForThread(threadId) : Promise.resolve([]),
          listRecentRuns(),
        ]);
        const byId = new Map<string, EngineRun>();
        for (const r of [...mine, ...recent.filter((r) => r.threadId === null)]) {
          byId.set(r.id, r);
        }
        set({
          runs: [...byId.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 20),
        });
      } catch (e) {
        console.warn('[engine] loading runs failed', e);
      }
    },

    dismissRun: async (id) => {
      try {
        await markReviewed(id, Date.now());
      } catch (e) {
        console.warn('[engine] marking a run reviewed failed', e);
      }
      set((s) => ({
        runs: s.runs.map((r) => (r.id === id ? { ...r, reviewedAt: Date.now() } : r)),
      }));
    },

    probe: async () => {
      try {
        // The preference only decides anything when both CLIs are installed; Rust falls
        // back on its own when it names one that is not there (§7.4).
        const preferred = useSettingsStore.getState().aiEngine;
        // The hand-typed path (Settings → AI 引擎). Sent on the probe AND on the run below,
        // because Rust re-detects at run time — a page that found an engine the run cannot
        // find would be worse than not offering the field at all.
        const manualPath = useSettingsStore.getState().aiEnginePath;
        set({ status: await invoke<EngineStatus>('ai_engine_status', { preferred, manualPath }) });
      } catch (e) {
        // A failed probe is "no CLI", not an error to surface: §0 says absence is the
        // default state, and the menu group simply stays hidden.
        console.warn('[engine] status probe failed', e);
        set({ status: { available: false, selected: null, version: null, path: null, engines: [] } });
      }
    },

    enqueue: (threadId, threadTitle, action, timeoutSecs, onResult) => {
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
      if (onResult) resultHandlers.set(task.id, onResult);
      set({ queue: [...queue, task] });
      void pump();
      return true;
    },

    cancel: async () => {
      // Drop the waiting tasks first: if the kill lands while pump is between tasks, an
      // empty queue is what stops it from starting the next one.
      timeouts.clear();
      resultHandlers.clear();
      set({ queue: [], progress: null });
      try {
        await invoke<boolean>('ai_engine_cancel');
      } catch (e) {
        console.warn('[engine] cancel failed', e);
      }
    },
  };
});

/** What Rust sends on `engine:progress` — engine.rs's `Progress`, over the wire. */
type ProgressEvent = { kind: 'delta'; text: string } | { kind: 'tool'; text: string };

// W4. The reader thread in Rust emits these while the CLI is still talking, which is the
// whole feature: before this, the first thing the UI heard about a run was that it had
// finished.
//
// Module scope, like the settings listener below it: the store is a singleton per window, so
// this is too. Events that arrive between runs are dropped — `progress` is null then, and a
// straggler from a run that just ended must not reopen the panel.
void listen<ProgressEvent>('engine:progress', ({ payload }) => {
  const { progress } = useEngineStore.getState();
  if (!progress) return;
  if (payload.kind === 'tool') {
    useEngineStore.setState({ progress: { ...progress, caption: toolCaption(payload.text) } });
    return;
  }
  const text = (progress.text + payload.text).slice(-PROGRESS_TAIL_CHARS);
  useEngineStore.setState({ progress: { ...progress, text } });
}).catch(() => {
  // Non-Tauri context (tests): no event system, so a run simply shows no live text.
});
