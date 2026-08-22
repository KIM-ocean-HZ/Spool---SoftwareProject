import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  cancelCompress,
  compressPack,
  loadApiKey,
  PROGRESS_EVENT,
  type CompressLevel,
  type CompressOutcome,
  type CompressProgress,
} from '@/lib/ai/compress';
import { addBackNumbers } from '@/lib/ai/compressBlocks';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { assemble } from '@/lib/pack/assemble';
import { buildThreadPack } from '@/lib/pack/forThread';
import { t } from '@/lib/i18n';
import { toast } from './toastStore';
import { useSettingsStore } from './settingsStore';
import { useThreadsStore } from './threadsStore';

// 压缩这件事的运行态（WORKPLAN-2026-08-20 §9.6.2 / §9.6.4 / §9.6.6）。
//
// # 为什么它从对话框里搬出来变成一个 store
//
// Ocean 的原话：「压缩功能不要放在 pack 里面，放到右边栏，他不是和 pack 绑定的工作。」
// 他是对的 —— **压缩改的是库里的块，不是那一次打包**。挂在打包对话框里等于说
// 「只有你要粘贴的时候才需要压缩」，而实际上是反过来的：压缩过的库，每一次读都受益。
//
// 搬出去之后有三个地方要看到同一件事，于是它必须住在组件外面：
//
//   * **右侧栏**：动作和状态（在跑没跑、跑完了几份等着核对）；
//   * **中间区域**：核对桌本身（并排比对塞不进 `railWidth` 那么窄的一栏）；
//   * **块自己的菜单**：单块压缩（§9.6.6）。
//
// ⛔ **一个字都不往库里写。** §6.4.1 的 `supersedes` 写入那一段仍然锁着，条件没变。
//    所以这里没有「用这一份」，只有「复制走」。

export type CompressTarget =
  | { kind: 'project'; threadId: string; title: string }
  /** ⚠️ 单块压缩**不是「项目压缩缩小版」**（§9.6.6）：压缩干的主要活是合并重复，
   *  而重复是跨块的。单独压一块，它看不见别的块，也就删不掉重复。界面要说这句话。 */
  | { kind: 'block'; threadId: string; title: string; blockId: string; seq: number | null };

export interface CompressSession {
  target: CompressTarget;
  /** 真的送出去的那份原文。核对、算比例、按块配对，用的都是它。 */
  source: string;
  /** 原文那一侧的块。⚠️ 四带记号从**原块**取，不从压缩稿猜（§9.6.5）。 */
  blocks: Block[];
  /** ⚠️ 这一次**实际用的**设置，在按下开始的那一刻定格 —— 不是现读设置。
   *  2026-08-20 那轮实测差点被这件事污染：人是「跑一次 → 改设置 → 再跑」这样试的。 */
  level: CompressLevel;
  reasoning: string;
  outcome: CompressOutcome | null;
  /** D7：把丢掉的数字/日期从原文补回去之后的压缩稿。null = 一处都没补过。
   *
   *  ⚠️ 核对、按块比对、复制走，有它就用它 —— 但**报账那一行照旧读 `outcome`**：
   *  补一行字是纯本地动作，不花钱，把它算进这一次的账里就成了假话。 */
  patched: string | null;
  /** 补回去了的那几个数字/日期。⚠️ **必须说出来**：稿子里从此有一行不是模型写的。 */
  addedBack: string[];
  startedAt: number;
}

interface CompressState {
  /** 核对桌开着的那一份。null = 桌子没开。 */
  session: CompressSession | null;
  running: boolean;
  progress: CompressProgress | null;
  /** 跑之前就失败了的（比如没填 key），和信封里的失败分开 —— 那个在 outcome 里。 */
  startError: string | null;

  /** ⑥ 夜里跑完、等着早上核对的那些。⚠️ **只在内存里**，见文件末尾那段。 */
  results: CompressSession[];
  /** 夜里跑的时候，某个项目失败了记在这儿 —— ⛔ 一次失败不能拖垮整批，
   *  也不许让用户早上看到一张空桌子然后自己猜发生了什么。 */
  failures: { title: string; why: string }[];
  batchRunning: boolean;
  /** 排进队的项目各有多大（pack 字符数）。⚠️ 睡前那张单子上「多大 + 大概多少钱」
   *  就是它算出来的 —— **授权发生在花钱之前，而没有数字的授权不是授权。** */
  sizes: Record<string, number>;
  measureQueue: () => Promise<void>;

  openProject: (thread: Thread) => Promise<void>;
  openBlock: (thread: Thread, block: Block) => Promise<void>;
  openResult: (index: number) => void;
  close: () => void;
  run: () => Promise<void>;
  cancel: () => Promise<void>;
  /** D7 · 把这一份丢掉的数字/日期从原文补回去。纯本地，不出网、不花钱。 */
  addBack: () => void;

  runQueue: () => Promise<void>;
  dropResult: (index: number) => void;
}

/** 一份只装一个块的 pack。
 *
 *  ⚠️ 走的仍然是 `assemble`，不是手拼一段文本 —— 提示词认的是 pack 的格式
 *  （`#N [时间 · from 来源]`、`💭 note:`、整节骨架），而按块核对那一侧也照这个格式切。
 *  自己拼一份「差不多」的，两头都会跟着错。 */
const buildBlockPack = (thread: Thread, block: Block): string =>
  assemble({
    thread,
    blocks: [block],
    attachments: [],
    refTitles: new Map(),
    refBlocks: new Map(),
    instructions: useSettingsStore.getState().packInstructions,
    outputLanguage: useSettingsStore.getState().language === 'en' ? 'en' : 'zh',
  });

/** 本地日期 `YYYY-MM-DD`。⚠️ 用本地时区 —— 「今晚」是用户的今晚，不是 UTC 的。 */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 到点了没有：`HH:MM` 已经过去，而且今天还没跑过。
 *
 *  ⛔ 这就是整个「调度器」——没有 launchd，没有后台常驻。应用开着的时候到点跑；
 *  到点没开，下次启动时这个判断为真，于是补跑。 */
export const nightlyDue = (at: string, lastRunDay: string, now: Date): boolean => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return false;
  if (lastRunDay === localDay(now)) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= Number(m[1]) * 60 + Number(m[2]);
};

const freshSession = (target: CompressTarget, source: string, blocks: Block[]): CompressSession => {
  const s = useSettingsStore.getState();
  return {
    target,
    source,
    blocks,
    level: s.apiCompressLevel,
    reasoning: s.apiReasoning,
    outcome: null,
    patched: null,
    addedBack: [],
    startedAt: 0,
  };
};

export const useCompressStore = create<CompressState>((set, get) => ({
  session: null,
  running: false,
  progress: null,
  startError: null,
  results: [],
  failures: [],
  batchRunning: false,
  sizes: {},

  openProject: async (thread) => {
    try {
      const { text, blocks } = await buildThreadPack(thread);
      set({
        session: freshSession({ kind: 'project', threadId: thread.id, title: thread.title }, text, blocks),
        startError: null,
      });
    } catch (e) {
      // 组 pack 要读库。⛔ 读失败也要说出来 —— 一个点了没反应的按钮是这个项目最怕的东西。
      // ⚠️ 走 toast 而不是 `startError`：这一步失败的话核对桌**根本没开**，
      // 而 `startError` 只在桌子上显示 —— 那就等于没说。
      toast.error(t('这个项目的上下文组不出来：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  },

  openBlock: async (thread, block) => {
    set({
      session: freshSession(
        { kind: 'block', threadId: thread.id, title: thread.title, blockId: block.id, seq: block.seq },
        buildBlockPack(thread, block),
        [block],
      ),
      startError: null,
    });
  },

  openResult: (index) => {
    const r = get().results[index];
    if (r) set({ session: r, startError: null });
  },

  close: () => set({ session: null, progress: null, startError: null }),

  run: async () => {
    const session = get().session;
    if (!session || get().running) return;
    const s = useSettingsStore.getState();
    // 定格：这一次用的是**现在**设置里的值，之后改设置不再影响这一次的记录。
    const frozen: CompressSession = {
      ...session,
      level: s.apiCompressLevel,
      reasoning: s.apiReasoning,
      outcome: null,
      // ⚠️ 重压一次，上一次补回去的那几行也跟着作废 —— 它们补的是**那一份**稿子。
      patched: null,
      addedBack: [],
      startedAt: Date.now(),
    };
    set({ session: frozen, running: true, progress: { stage: 'starting' }, startError: null });
    try {
      const outcome = await compressPack({
        packText: frozen.source,
        level: frozen.level,
        baseUrl: s.apiBaseUrl,
        apiKey: await loadApiKey(),
        model: s.apiModel,
        reasoning: frozen.reasoning,
        timeoutSecs: s.apiTimeoutSecs,
      });
      set((st) => (st.session ? { session: { ...st.session, outcome } } : {}));
    } catch (e) {
      // invoke 自己抛（比如那道「已经在跑了」的闸）。⛔ 也要说出来，不能静默。
      set({ startError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: false, progress: null });
    }
  },

  cancel: async () => {
    await cancelCompress();
  },

  // D7（2026-08-22，Ocean）：丢掉的数字/日期给一个「加回去」。
  //
  // ⭐ 它是**纯本地**的：那几行在原文里都还在，不问模型、不出网、不花钱。补完这一份就过得了
  // 数字硬闸门（`numbersGateOpen`）—— 见 compress.ts 上那段。
  // ⛔ 一处都补不回去的时候必须说出来：一个点了没反应的按钮是这个项目最怕的东西。
  addBack: () => {
    const s = get().session;
    if (!s?.outcome?.ok) return;
    const before = s.patched;
    const r = addBackNumbers(s.source, s.patched ?? s.outcome.text);
    if (r.added.length === 0) {
      toast.error(
        t('这 {n} 个补不回去：在压缩稿里找不到该把它们插在哪儿。重压一次吧。', {
          n: r.failed.length,
        }),
      );
      return;
    }
    const next: CompressSession = {
      ...s,
      patched: r.text,
      addedBack: [...s.addedBack, ...r.added],
    };
    // ⚠️ 夜里那一批的收件箱里躺的是**同一个对象**（`openResult` 直接把它设成 session），
    // 只换 session 的话，关掉桌子再从右栏点回来，补回去的那几行就没了。
    set((st) => ({ session: next, results: st.results.map((x) => (x === s ? next : x)) }));
    toast.undo(
      t('从原文加回去了 {n} 处数字/日期', { n: r.added.length }),
      t('撤销'),
      () => {
        const cur = get().session;
        if (!cur) return;
        const back: CompressSession = { ...cur, patched: before, addedBack: s.addedBack };
        set((st) => ({ session: back, results: st.results.map((x) => (x === cur ? back : x)) }));
      },
    );
  },

  // ---------------------------------------------------------------------------------
  // ⑥ 睡前选项目、起床核对（§9.6.4）
  // ---------------------------------------------------------------------------------

  /** 串行跑完整队。
   *
   *  ⛔ **一次失败不能拖垮整批**：某个项目失败了，记下原因，继续下一个，早上一起报。
   *  ⛔ **不排 launchd、不常驻后台**：这个函数只在应用开着的时候被调用（到点跑；
   *     到点没开，下次启动补跑）。这样整个「调度器」表面根本不用长出来 ——
   *     v0.7 §10.4 已经把提醒调度器定为唯一真正新增的表面并且排在最后，
   *     而这台机器上 launchd 碰 `~/Desktop` 会永久卡死。 */
  runQueue: async () => {
    if (get().batchRunning) return;
    // ⚠️ 队列的**唯一**权威是 settings.json 里那一份 —— 它就是「授权」，而授权必须
    // 熬得过一次重启（§9.6.4：睡前勾、夜里跑、起床核对，中间隔着一整夜）。
    const queue = useSettingsStore.getState().compressQueue;
    if (queue.length === 0) return;
    set({ batchRunning: true, failures: [] });
    const byId = new Map<string, Thread>();
    for (const list of Object.values(useThreadsStore.getState().threadsByWorkspace)) {
      for (const th of list) byId.set(th.id, th);
    }
    for (const id of queue) {
      const thread = byId.get(id);
      if (!thread) {
        // ⛔ 也要报出来。早上看到一张空桌子然后自己猜，正是这一条要防的。
        set((st) => ({ failures: [...st.failures, { title: id, why: t('这个项目已经不在了') }] }));
        continue;
      }
      try {
        const s = useSettingsStore.getState();
        const { text, blocks } = await buildThreadPack(thread);
        const session: CompressSession = {
          ...freshSession({ kind: 'project', threadId: thread.id, title: thread.title }, text, blocks),
          startedAt: Date.now(),
        };
        set({ running: true, progress: { stage: 'starting' } });
        const outcome = await compressPack({
          packText: text,
          level: s.apiCompressLevel,
          baseUrl: s.apiBaseUrl,
          apiKey: await loadApiKey(),
          model: s.apiModel,
          reasoning: s.apiReasoning,
          timeoutSecs: s.apiTimeoutSecs,
        });
        if (outcome.ok) {
          set((st) => ({ results: [...st.results, { ...session, outcome }] }));
        } else {
          set((st) => ({
            failures: [...st.failures, { title: thread.title, why: outcome.kind ?? 'http' }],
          }));
        }
      } catch (e) {
        set((st) => ({
          failures: [
            ...st.failures,
            { title: thread.title, why: e instanceof Error ? e.message : String(e) },
          ],
        }));
      } finally {
        set({ running: false, progress: null });
      }
    }
    // 跑完清空队列，并记下今天已经跑过 —— 补跑判断只看这一个数（一天只跑一次）。
    await useSettingsStore.getState().update({
      compressQueue: [],
      compressLastRunDay: localDay(new Date()),
    });
    set({ batchRunning: false });
  },

  /** 把队里每个项目的 pack 组一遍，只为了拿字符数。⚠️ 纯本地，不出网、不花钱。 */
  measureQueue: async () => {
    const ids = useSettingsStore.getState().compressQueue;
    const byId = new Map<string, Thread>();
    for (const list of Object.values(useThreadsStore.getState().threadsByWorkspace)) {
      for (const th of list) byId.set(th.id, th);
    }
    for (const id of ids) {
      if (get().sizes[id] !== undefined) continue;
      const thread = byId.get(id);
      if (!thread) continue;
      try {
        const { text } = await buildThreadPack(thread);
        set((st) => ({ sizes: { ...st.sizes, [id]: text.length } }));
      } catch {
        // 量不出来就不显示这一行的数字 —— ⛔ 不编一个。
      }
    }
  },

  dropResult: (index) =>
    set((st) => ({ results: st.results.filter((_, i) => i !== index) })),
}));

// 子进程报回来的进度（在思考 / 在写 / 已经多少字）。⚠️ 这两个数字是「它还在正常干活」的
// 唯一证据 —— 之前那次 180 秒超时，界面上分不出「在写」和「卡死」，就是因为没有它们。
// ⚠️ `.catch` 不能省：这个模块在 vitest 里也会被 import（`nightlyDue` 有测试），
// 而那里没有 Tauri 的事件桥，`listen` 会 reject。一个进度订阅失败不该让整个 store 炸掉。
void listen<CompressProgress>(PROGRESS_EVENT, (e) => {
  useCompressStore.setState({ progress: e.payload });
}).catch(() => {});

// ⚠️⚠️ **`results` 只在内存里，Spool 一关就没了。**
//
// 这是 v1 的一个已知代价，不是漏掉的：夜里跑出来的压缩稿是一份**没进库的 AI 产物**，
// 把它落到磁盘上等于在库之外开一个新的存放面 —— 而 §6.4.1 那条真正该收它的路
// （`supersedes` 存成块、指向原块）**现在还锁着**，条件是 Ocean 说质量认可。
// 与其现在发明第二个存放面、等解锁之后再拆掉，不如把这条限制说出来：
// **核对完再关 Spool。** 解锁之后结果直接进待审面，持久化跟着白拿。
