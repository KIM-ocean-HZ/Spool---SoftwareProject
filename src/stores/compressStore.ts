import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import {
  cancelCompress,
  compressPack,
  duplicateProbe,
  loadApiKey,
  mergeOutcomes,
  staleScan,
  PROGRESS_EVENT,
  type CompressLevel,
  type CompressOutcome,
  type CompressProgress,
  type DuplicateProbe,
  type StaleDropped,
  type StaleProposal,
} from '@/lib/ai/compress';
import { auditCompression, numbersGateOpen } from '@/lib/ai/compress';
import { addBackNumbers, compareByEntry, worthRetrying } from '@/lib/ai/compressBlocks';
import { relationAlreadySettled, wouldOverwriteRelation } from '@/lib/blocks/staleGuards';
import {
  contentFromEntryBody,
  isEmptyHeld,
  shieldPack,
  unshieldPack,
  type Unshielded,
} from '@/lib/ai/shield';
import {
  applyCompression,
  setCorrectedQuote,
  setBlockSupersession,
  type Block,
} from '@/lib/db/blocks';
import { PINNED_SEE_ABOVE } from '@/lib/pack/templates';
import {
  deleteSupersedeProposal,
  listSupersedeProposals,
  purgeExpiredSupersedeProposals,
  type SupersedeProposal,
} from '@/lib/db/supersedeProposals';
import { stripInventedSkeleton } from '@/lib/pack/skeleton';
import type { Thread } from '@/lib/db/threads';
import { assemble } from '@/lib/pack/assemble';
import { buildThreadPack } from '@/lib/pack/forThread';
import { t } from '@/lib/i18n';
import { useBlocksStore } from './blocksStore';
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
//    ⚠️ 2026-08-22 晚 Ocean 明说要解这条锁（R2 文档 §1），但那一条（写回库 + 原文跟着块走）
//    还没做 —— **在做完之前这里仍然一个字都不写**。
//
// ⭐ **R4（2026-08-22 晚）：整理状态按项目存。**
// 原来这里是**全局一个 `session`**，于是 Ocean 撞到两件事：「点击退出压缩工作区就无法回去」、
// 「进入一个项目的压缩面板之后，就无法访问其他项目的 block 内容」。根子是同一个：
// 一份整理稿占着整个中间区，而它又不属于任何一个项目。
// 现在每个项目自己拿着自己的那一份（`sessions[threadId]`），页签在项目里切 ——
// **互不干扰，而且永远回得去**。

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
  /** 补回去了的那几个数字/日期。⚠️ **必须说出来**：稿子里从此有几行不是模型写的。 */
  addedBack: string[];
  /** ⭐ 真的插回去的那几**行**原文。核对面靠它把「你加回去的」当场标出来 ——
   *  Ocean 2026-08-22:「加回去用户根本看不到这个动作，不知道到底加在哪里」。 */
  restoredLines: string[];
  /** D-c：第一次的结果不合格、自动重压过一次的时候记在这儿。null = 没重压过。
   *  ⚠️ 屏幕上必须说出来 —— 不然「这一次花了多少」那个数会莫名其妙翻倍。 */
  retry: { secondOk: boolean } | null;
  /** R5：摘下来的批注/高亮**没能原样放回去**的那些。null = 这一份没走摘除那条路
   *  （里面本来就没有批注、关系行、高亮）。
   *
   *  ⚠️⚠️ **放回失败必须报出来，不能静默**（R2 文档 §5a 明写）：静默丢掉一条批注，
   *  正是「不发给 AI」这一整条改动本来要根除的那件事换了个地方发生。 */
  shield: { orphaned: number; lostSpans: string[] } | null;
  /** D-a：这个项目里有多少重复，**压之前**就算好。null = 还没算出来（或者算不出来 ——
   *  ⛔ 那时候界面上什么都不说，不编一个数）。⚠️ 只有整项目压缩有它：重复是跨块的，
   *  单独压一块本来就看不见别的块。 */
  probe: DuplicateProbe | null;
  /** ⭐ v24（R2 §1e）：因为**已经压过**而没进这一份的块数。
   *  ⚠️ 界面要说出这个数：pack 里少了几块，而用户没做过任何选择。 */
  skippedCompressed: number;
  startedAt: number;
}

/** 项目里的三个页签。
 *
 *  ⭐ **2026-08-23（Ocean 真手指验收第 3 条）：原来只有「内容」和「整理」两个。**
 *  他的原话：「整理面板：把两个功能拆出来，变成内容，压缩，和一个新的。」
 *
 *  「整理」那一个面里塞着两件毫不相干的事 —— **把话说短**（压缩）和
 *  **找出被后面的块取代的旧块**（查旧块）—— 而它们还在抢同一屏高度：
 *  查旧块那一段顶在最上面，核对面被挤到半屏以下，正是上一轮挨骂的那件事。
 *  ⛔ 别再把它们并回一个页签。 */
export type ProjectTab = 'content' | 'compress' | 'stale';

interface CompressState {
  /** 每个项目自己那一份整理稿。⚠️ 键是 threadId。 */
  sessions: Record<string, CompressSession>;
  /** 每个项目停在哪个页签。没记过 = `content`。 */
  tabs: Record<string, ProjectTab>;
  running: boolean;
  /** 正在跑的是哪个项目 —— ⚠️ 只有它那个页签该显示进度，别的项目不该跟着转圈。 */
  runningThreadId: string | null;
  /** ⭐⭐ **2026-08-23（Ocean）：正在跑的是哪一件事。**
   *
   *  他撞到的样子：「点击查旧块会把运行信息写在压缩里面，显示『压缩（在跑）』」。
   *  病根是这两件事共用一把「在跑」的锁（Rust 那边确实只允许一个 sidecar），
   *  而界面**只问了「在不在跑」，没问「跑的是哪一件」** —— 于是过期检测一跑，
   *  压缩那一页跟着转圈、跟着显示「正在写压缩稿…」、按钮变成「停下」。
   *
   *  ⛔ 别用「哪个面板挂着 session」去猜：两件事可以同时有各自的历史结果。 */
  runningKind: 'compress' | 'stale' | null;
  progress: CompressProgress | null;
  /** 压缩跑之前就失败了的（比如没填 key），按项目记。和信封里的失败分开 —— 那个在 outcome 里。 */
  startErrors: Record<string, string>;
  /** ⚠️ **过期检测自己那一份错误，⛔ 不许和压缩共用 `startErrors`。**
   *  共用的后果是实打实的：查一遍失败之后，**压缩那一页会顶着一条它没干过的错**，
   *  而且因为那一页现在靠 `startErrors` 判断要不要自己开桌子，它会永远停在「正在读…」。 */
  staleErrors: Record<string, string>;

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

  setTab: (threadId: string, tab: ProjectTab) => void;
  openProject: (thread: Thread) => Promise<void>;
  /** ⭐ 2026-08-23（Ocean 真手指验收第 6 条）：**这个项目的块变了，就把这一份重新组一遍。**
   *
   *  他撞到的样子：把所有块都还原成未压缩的了，压缩面上那句「这个项目里 5 块已经压过了，
   *  这一次跳过它们」还在。⚠️ **看得见的是那句话，真正危险的是它底下那份 pack** ——
   *  `source` 是开桌子那一刻组的，不重组的话，按「开始压缩」发出去的仍然是**少了那 5 块**
   *  的旧 pack：钱照花，压的却不是屏幕上那个项目。
   *
   *  ⛔ 只重组「还没跑出结果」的整项目那一份 —— 已经有压缩稿的那一份是核对面上的证据。 */
  refreshSession: (threadId: string) => Promise<void>;
  openBlock: (thread: Thread, block: Block) => Promise<void>;
  openResult: (index: number) => void;
  /** 「不要这一份了」。⚠️ 页签不会因此消失 —— 它是项目的一部分，不是一个会关掉的窗口。 */
  clearSession: (threadId: string) => void;
  run: (threadId: string) => Promise<void>;
  cancel: () => Promise<void>;
  /** D7 · 把丢掉的数字/日期从原文补回去。纯本地，不出网、不花钱。
   *  `only` = 只补这几个（界面上一处一处地补）；不传 = 全补。 */
  addBack: (threadId: string, only?: readonly string[]) => void;

  /** ⭐ R1（2026-08-22）：**用这一份** —— 把压缩稿写回库。
   *
   *  ⛔ 三道闸，都在这个函数里，⛔ 一道都不许挪到界面上去（界面会被绕过）：
   *  数字硬闸门 · 块数结构没坏 · 一块的正文真的变了。 */
  useDraft: (threadId: string) => Promise<void>;

  runQueue: () => Promise<void>;
  dropResult: (index: number) => void;

  // -------------------------------------------------------------------------------
  // E3 · 作废检测（COMPRESS-UX-R2 §7 / WORKPLAN §2.E3）
  // -------------------------------------------------------------------------------
  /** 每个项目自己那一批「可能已经过期」的提议。⚠️ 和整理稿一样按项目存。 */
  stale: Record<string, StaleSession>;
  /** 查一遍这个项目里有没有被后面的块整条取代的旧块。 */
  runStaleScan: (threadId: string) => Promise<void>;
  /** 对一条提议下决定。⛔ 三个动作的语义写在 `StaleAction` 上，别在界面里另解释一遍。 */
  decideStale: (threadId: string, index: number, action: StaleAction) => Promise<void>;
  /** ⭐ S2：把 AI 提的「整条取代」读进这个项目的那张卡。
   *  ⚠️ 它**不花钱、不起 sidecar** —— 只是读库，所以打开这一页就可以跑一次。 */
  loadProposedStale: (threadId: string) => Promise<void>;
}

/** ⭐ 界面**不许叫「作废」**（WORKPLAN §2.E3 写死的）。理由是实测的失败形状：
 *  39 条提议里 **35 条**是「同一件事、**旧块还剩很多**」—— 点一下「作废」会让一个
 *  **内容仍然有效**的块退出以后每一份 pack，而用户不会发现。
 *
 *  所以问的是三件事，不是一件：
 *
 *  - `merge`  = **合并**（2026-08-23 Ocean 在两种读法里选的 A）：新块标成「更正了旧块」，
 *    ⛔ **旧块不退、正文一个字不改**。用的是库里已经有的那套关系（v13 的 `corrects`），
 *    ⚠️ 代价说清楚：pack 不会因此变短。
 *  - `retire` = **只退旧的**：旧块写 `stale_at` + 新块写 `ref_kind='supersedes'`。
 *    ⛔ **两个一起写**，只写一半是负收益（+212 字符，第四轮量过）。
 *  - `keep`   = **不动**：什么都不写，这一条从单子上划掉。 */
export type StaleAction = 'merge' | 'retire' | 'keep';

/** 卡片上的一条。⭐ S2：**同一张卡上有两个来路** —— 花钱扫出来的，和正在聊天的那个 AI
 *  顺手提的。⚠️ 判断是同一个判断，所以三个按钮、三条护栏完全一样；
 *  ⛔ 差别只在卡片上要说清楚「这条是谁提的」，别的一处都不许分叉。 */
export interface StaleEntry extends StaleProposal {
  origin: 'scan' | 'mcp';
  /** `mcp` 才有：谁提的、以及它在 `supersede_proposals` 里那一行的 id（下完决定要删）。 */
  client?: string;
  rowId?: string;
}

export interface StaleSession {
  /** 送出去的那份 pack。⚠️ 提议里的 `#N` 是照它数的。
   *  ⚠️ 只有花钱扫过才有；纯 MCP 提案的会话这里是空串。 */
  source: string;
  blocks: Block[];
  proposals: StaleEntry[];
  /** ⛔ 引文对不上、被整条丢掉的那几条 —— ⚠️ **连它说了什么一起摆出来**（Ocean 第 8 条：
   *  「不允许」Spool 知道而不告诉他）。闸挡的是「拿它去动库」，不是「不给看」。 */
  dropped: StaleDropped[];
  /** ⭐ T2：库里**已经有这条关系**、于是没拿出来问的条数。⚠️ 同样要说出来 ——
   *  「一条都没找到」和「找到的那几条你去年就处理过了」是两件事。 */
  already: number;
  outcome: CompressOutcome | null;
  /** 已经下过决定的那几条（下标）。⚠️ 留在单子上但划掉，不是删掉 ——
   *  用户要看得见自己刚才做了什么。 */
  decided: Record<number, StaleAction>;
  startedAt: number;
}

/** 这一份压缩稿要往库里写哪几块。
 *
 *  ⚠️⚠️ **置顶的块在 pack 里出现两次**：`## Pinned Blocks` 里是全文，`## Full Record` 里
 *  是一行占位（`(pinned — full text …)`）。⛔ 拿占位那一条去写库，会把一块置顶的正文
 *  换成一句「全文在上面」—— 那是这条路上最贵的一个错，所以占位那一条在这里被明确排掉。
 *
 *  ⚠️ 写回去的是**块的 `content`**，不是条目的正文：Spool 画在块下面的那几行（批注、关系、
 *  出处、更正指针）是渲染出来的，写进 `content` 的话，下一次渲染会再画一遍。 */
const draftWrites = (session: CompressSession, compressed: string) => {
  const cmp = compareByEntry(session.source, compressed);
  if (!cmp) return null;
  const heldFor = new Map(shieldPack(session.source).held.byEntry.map((h) => [h.key, h.lines]));
  const bySeq = new Map<number, Block>();
  for (const b of session.blocks) if (b.seq !== null) bySeq.set(b.seq, b);

  const writes = new Map<string, string>();
  // S7①：压缩发明出来的 pack 骨架行剔在这儿（`skeleton.ts` 上写着为什么按「压缩前有没有」减）。
  const skeletonLines: string[] = [];
  for (const p of cmp.pairs) {
    if (!p.before || !p.after) continue;
    // 占位那一条：认它的是**原文侧**那一行（压缩稿侧可能被改写成别的话）。
    if (p.before.body.trimEnd().endsWith(PINNED_SEE_ABOVE)) continue;
    const block = bySeq.get(p.seq);
    if (!block) continue;
    const stripped = stripInventedSkeleton(
      block.content,
      contentFromEntryBody(p.after.body, heldFor.get(p.key)),
    );
    skeletonLines.push(...stripped.removed);
    const content = stripped.content;
    // ⚠️ 剔完才判空 —— 一条整段都是骨架行的压缩稿，剔完是空的，⛔ 那一块不许写。
    if (content.trim().length === 0) continue;
    if (content === block.content) continue;
    writes.set(block.id, content);
  }
  return {
    writes: [...writes].map(([id, content]) => ({ id, content })),
    skeletonLines,
  };
};

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

/** 去掉一个键，返回新对象。⚠️ zustand 的状态是不可变的，`delete` 改不动它。 */
const omit = <T,>(m: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in m)) return m;
  const { [key]: _gone, ...rest } = m;
  return rest;
};

/** 从项目树里按 id 找一个项目。⚠️ 侧边栏那份是全量的，⛔ 别为这件事再读一次库。 */
const threadById = (threadId: string): Thread | null => {
  for (const list of Object.values(useThreadsStore.getState().threadsByWorkspace)) {
    for (const th of list) if (th.id === threadId) return th;
  }
  return null;
};

const freshSession = (
  target: CompressTarget,
  source: string,
  blocks: Block[],
  skippedCompressed = 0,
): CompressSession => {
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
    restoredLines: [],
    retry: null,
    shield: null,
    probe: null,
    skippedCompressed,
    startedAt: 0,
  };
};

// D-c（2026-08-22）：**坏结果自动重跑一次，不拿给用户看。**
//
// 结构性的坏结果（切不出块 / 重复编号 / 块数对不上 / 压完比原文还长）用户看一眼就知道
// 要重来 —— 中间那一步纯属摩擦。判据见 `worthRetrying`。
//
// ⚠️ **T1（2026-08-23）：判据收窄过一次。** 原来还有一条「压完还剩 95% 以上」，
// 而默认档压完就是剩 98% —— 十次里七八次会自动再发一次，钱翻倍、结果还是 98%。
// ⛔ 那条现在只对「压到最短」成立，理由和实测数写在 `worthRetrying` 上面。
//
// ⚠️⚠️ **两次的账要加起来报**（`mergeOutcomes`）。只报第二次那笔，界面上那句
// 「这一次花了多少」就成了假话 —— 钱是两次都花了的。
// ⛔ **只重跑一次。** 再坏也就这一次，剩下的交给用户按「再压一次」。
const runCompress = async (
  source: string,
  level: CompressLevel,
  reasoning: string,
): Promise<{
  outcome: CompressOutcome;
  retry: { secondOk: boolean } | null;
  shield: { orphaned: number; lostSpans: string[] } | null;
}> => {
  const s = useSettingsStore.getState();
  // ⭐⭐ R5（2026-08-22，Ocean：「禁止批注被 AI 修改，直接不发送批注就行」）：
  // **送出去的是摘掉批注/关系行/高亮之后的那一份**，回来之后按映射原样放回。
  // ⚠️ `source` 一个字都没变 —— 核对、按块比对、算比例，用的仍然是没摘之前那份原文。
  // 摘的是「让它不可能被改」，⛔ 不是「不再核对」（`auditCompression` 一条检查都没删）。
  const shielded = shieldPack(source);
  const bare = isEmptyHeld(shielded.held);
  const req = {
    packText: shielded.text,
    level,
    baseUrl: s.apiBaseUrl,
    apiKey: await loadApiKey(),
    model: s.apiModel,
    reasoning,
    timeoutSecs: s.apiTimeoutSecs,
  };
  // 回来一份就当场放回去一份 —— ⚠️ 后面所有判断（值不值得重跑、核对、按块比对）
  // 看到的都必须是**放回去之后**那一份，否则它们会以为批注真的没了。
  let lost: Unshielded | null = null;
  const put = (o: CompressOutcome): CompressOutcome => {
    if (!o.ok || bare) return o;
    const back = unshieldPack(o.text, shielded.held);
    lost = back;
    return { ...o, text: back.text };
  };
  const report = () =>
    lost === null
      ? null
      : {
          orphaned: (lost as Unshielded).orphaned.reduce((n, h) => n + h.lines.length, 0),
          lostSpans: (lost as Unshielded).lostSpans,
        };

  const first = put(await compressPack(req));
  if (!first.ok || !worthRetrying(source, first.text, level))
    return { outcome: first, retry: null, shield: report() };
  const second = put(await compressPack(req));
  // ⛔ 用户在**自动重跑**那一次上按了停下：整件事就当停下了。
  // ⚠️ 不这么写的话，`mergeOutcomes(second, first)` 会把**第一次**那份端上桌 ——
  // 他按了停下，屏幕上却冒出一份稿子，看起来就是「停下没起作用」。
  // ⭐ 丢掉的那一份本来就是 `worthRetrying` 判定为结构性坏的（切不出块 / 编号重复 /
  //    块数对不上 / 比原文还长），⛔ 不是什么可惜的东西。
  if (!second.ok && second.kind === 'cancelled') return { outcome: second, retry: null, shield: report() };
  return {
    // 第二次没跑成就还是拿第一次那份给用户 —— 手里有一份坏的，总好过只剩一句报错。
    outcome: second.ok ? mergeOutcomes(first, second) : mergeOutcomes(second, first),
    retry: { secondOk: second.ok },
    shield: report(),
  };
};

export const useCompressStore = create<CompressState>((set, get) => ({
  sessions: {},
  tabs: {},
  running: false,
  runningThreadId: null,
  runningKind: null,
  progress: null,
  startErrors: {},
  staleErrors: {},
  stale: {},
  results: [],
  failures: [],
  batchRunning: false,
  sizes: {},

  setTab: (threadId, tab) => set((st) => ({ tabs: { ...st.tabs, [threadId]: tab } })),

  openProject: async (thread) => {
    try {
      const { text, blocks, skippedCompressed } = await buildThreadPack(thread, true);
      const fresh = freshSession(
        { kind: 'project', threadId: thread.id, title: thread.title },
        text,
        blocks,
        skippedCompressed,
      );
      set((st) => ({
        sessions: { ...st.sessions, [thread.id]: fresh },
        tabs: { ...st.tabs, [thread.id]: 'compress' },
        startErrors: omit(st.startErrors, thread.id),
      }));
      // D-a：压之前先在本地数一遍这个项目有多少重复（只读、不出网、不花钱）。
      // ⚠️ **不挡开桌子**：桌子先开，数出来了再填上去。
      // ⛔ 数不出来就什么都不显示 —— 界面上宁可少一行，也不编一个数。
      try {
        const probe = await duplicateProbe(thread.id);
        // ⚠️ 比对象身份，不比 threadId：这中间用户可能已经重开了一份，
        // 填错一份比不填更糟。
        set((st) =>
          st.sessions[thread.id] === fresh
            ? { sessions: { ...st.sessions, [thread.id]: { ...fresh, probe } } }
            : {},
        );
      } catch {
        // 见上。
      }
    } catch (e) {
      // 组 pack 要读库。⛔ 读失败也要说出来 —— 一个点了没反应的按钮是这个项目最怕的东西。
      // ⚠️ 2026-08-23：除了 toast 还要落进 `startErrors` —— 压缩页签现在是**自己开桌子**的
      //    （不再由右栏那个按钮开），一条只闪一下的 toast 会让那一页永远停在「正在读…」。
      const msg = e instanceof Error ? e.message : String(e);
      set((st) => ({ startErrors: { ...st.startErrors, [thread.id]: msg } }));
      toast.error(t('这个项目的上下文组不出来：{msg}', { msg }));
    }
  },

  refreshSession: async (threadId) => {
    const s = get().sessions[threadId];
    if (!s || s.outcome || s.target.kind !== 'project' || get().running) return;
    const thread = threadById(threadId);
    if (!thread) return;
    try {
      const { text, blocks, skippedCompressed } = await buildThreadPack(thread, true);
      // 一个字都没变就什么都不做 —— ⛔ 每次重组都换一次对象，会让下面那次 probe 无限重来。
      if (text === s.source && skippedCompressed === s.skippedCompressed) return;
      const fresh: CompressSession = { ...s, source: text, blocks, skippedCompressed, probe: null };
      set((st) => (st.sessions[threadId] === s ? { sessions: { ...st.sessions, [threadId]: fresh } } : {}));
      // 重复度也跟着重数一遍：块变了，「有几组重复」这个数就跟着变了。
      try {
        const probe = await duplicateProbe(threadId);
        set((st) =>
          st.sessions[threadId] === fresh
            ? { sessions: { ...st.sessions, [threadId]: { ...fresh, probe } } }
            : {},
        );
      } catch {
        // 数不出来就什么都不说 —— ⛔ 不编一个数。
      }
    } catch {
      // 组不出来就保留手上这一份：一份旧的 pack 好过把核对面清空。
      // ⛔ 不弹错 —— 这条路是**跟着块变化自动跑**的，弹一次就会跟着每一次编辑弹一次。
    }
  },

  openBlock: async (thread, block) => {
    set((st) => ({
      sessions: {
        ...st.sessions,
        [thread.id]: freshSession(
          { kind: 'block', threadId: thread.id, title: thread.title, blockId: block.id, seq: block.seq },
          buildBlockPack(thread, block),
          [block],
        ),
      },
      tabs: { ...st.tabs, [thread.id]: 'compress' },
      startErrors: omit(st.startErrors, thread.id),
    }));
  },

  /** 夜里那一批的收件箱：点一条 → **先切到它自己的项目**，再把它摆到那个项目的整理页签上。
   *  ⛔ 绝不把别人的整理稿摆在你现在这个项目里（D2 那条，R4 之后仍然成立）。 */
  openResult: (index) => {
    const r = get().results[index];
    if (!r) return;
    const id = r.target.threadId;
    set((st) => ({
      sessions: { ...st.sessions, [id]: r },
      tabs: { ...st.tabs, [id]: 'compress' },
      startErrors: omit(st.startErrors, id),
    }));
    useThreadsStore.getState().select(id);
  },

  clearSession: (threadId) =>
    set((st) => ({ sessions: omit(st.sessions, threadId), startErrors: omit(st.startErrors, threadId) })),

  run: async (threadId) => {
    const session = get().sessions[threadId];
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
      restoredLines: [],
      retry: null,
      shield: null,
      startedAt: Date.now(),
    };
    set((st) => ({
      sessions: { ...st.sessions, [threadId]: frozen },
      running: true,
      runningThreadId: threadId,
      runningKind: 'compress',
      progress: { stage: 'starting' },
      startErrors: omit(st.startErrors, threadId),
    }));
    try {
      const { outcome, retry, shield } = await runCompress(
        frozen.source,
        frozen.level,
        frozen.reasoning,
      );
      // ⛔⛔ **用户按了「停下」不是一个结果**（2026-08-23，Ocean）。
      // 把它当结果落进 session，核对面上就会立起一张红牌，写着「找不到 spool-ai，
      // 重装一次 Spool 应该能修好」—— 而他只是点了停止。
      // ⚠️ 这里干脆什么都不落：桌子回到「还没跑」，和他按之前一模一样。
      if (outcome.kind === 'cancelled') {
        // ⚠️ ⛔ 不说「没花钱」：已经吐出来的那一段，厂商那边照样算。⛔ 也不编一个数。
        toast.notice(t('已经停下了。已经跑出去的那一段，模型厂商那边可能照样算钱。'));
        return;
      }
      set((st) =>
        st.sessions[threadId]
          ? {
              sessions: {
                ...st.sessions,
                [threadId]: { ...st.sessions[threadId], outcome, retry, shield },
              },
            }
          : {},
      );
    } catch (e) {
      // invoke 自己抛（比如那道「已经在跑了」的闸）。⛔ 也要说出来，不能静默。
      set((st) => ({
        startErrors: { ...st.startErrors, [threadId]: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      set({ running: false, runningThreadId: null, runningKind: null, progress: null });
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
  addBack: (threadId, only) => {
    const s = get().sessions[threadId];
    if (!s?.outcome?.ok) return;
    const before = s.patched;
    const beforeLines = s.restoredLines;
    const r = addBackNumbers(s.source, s.patched ?? s.outcome.text, only);
    // ⛔ 2026-08-22（Ocean：「这 0 个补不回去……什么意思」）：这里原来只看 `added === 0`，
    // 于是**一处都不缺**的时候也走这一路，屏幕上印出「这 0 个补不回去」。
    // 那句话是真的会出现的：点了同一行两次、或者那几个数字刚才已经跟着别的行补回去了。
    // ⚠️ 两件事要分开说 —— 「没什么可补的」和「有东西补不回去」不是同一件事。
    if (r.added.length === 0 && r.failed.length === 0) {
      toast.notice(t('这几处已经在压缩稿里了，不用再加。'));
      return;
    }
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
      restoredLines: [...s.restoredLines, ...r.lines],
    };
    // ⚠️ 夜里那一批的收件箱里躺的是**同一个对象**（`openResult` 直接把它摆上去），
    // 只换 sessions 的话，从右栏点回来那几行就没了。
    set((st) => ({
      sessions: { ...st.sessions, [threadId]: next },
      results: st.results.map((x) => (x === s ? next : x)),
    }));
    toast.undo(
      r.outsideBlocks > 0
        ? // ⚠️ 这几行不在任何一张块卡片上（附件正文、或者整块不见了的那几行），
          // 右栏那个「你加回去的」标不到它们 —— ⛔ 所以这里必须点名说清楚它们去哪儿了。
          t('从原文加回去了 {n} 处数字/日期，其中 {m} 行接在了它原来所在的那一节末尾（不在块里）', {
            n: r.added.length,
            m: r.outsideBlocks,
          })
        : t('从原文加回去了 {n} 处数字/日期', { n: r.added.length }),
      t('撤销'),
      () => {
        const cur = get().sessions[threadId];
        if (!cur) return;
        const back: CompressSession = {
          ...cur,
          patched: before,
          addedBack: s.addedBack,
          restoredLines: beforeLines,
        };
        set((st) => ({
          sessions: { ...st.sessions, [threadId]: back },
          results: st.results.map((x) => (x === cur ? back : x)),
        }));
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
  // ⭐⭐ R1 · 「用这一份」（2026-08-22，Ocean 解了「库里一个字都不动」那条锁）。
  //
  // ⛔ 三道闸全在这儿，⛔ 一道都不许挪到界面上：
  //  ① **数字硬闸门**（`numbersGateOpen`）—— 丢了数字/日期的稿子不许进库，
  //     ⛔ 写入解锁之后这条也不放宽，⛔ 而且不许「用户点了确认」就放行；
  //  ② **结构没坏** —— 少了块、多了编号、同一块写了两遍，都不写；
  //  ③ **真的变了** —— 一个字没短的块不该被标成「压过」（那个记号会印进以后每一份 pack）。
  useDraft: async (threadId) => {
    const s = get().sessions[threadId];
    if (!s?.outcome?.ok || get().running) return;
    const text = s.patched ?? s.outcome.text;
    if (!numbersGateOpen(auditCompression(s.source, text))) {
      toast.error(t('这一份丢了数字或日期，不能进库 —— 先用上面那个「加回去」。'));
      return;
    }
    const cmp = compareByEntry(s.source, text);
    if (!cmp || cmp.dropped > 0 || cmp.invented > 0 || cmp.duplicated.length > 0) {
      toast.error(t('这一份的块对不上（有块不见了、或者多了编号），不能进库。重压一次吧。'));
      return;
    }
    const draft = draftWrites(s, text);
    if (!draft || draft.writes.length === 0) {
      toast.notice(t('没有哪一块真的变短了 —— 库里什么都没改。'));
      return;
    }
    const keep = useSettingsStore.getState().compressKeepOriginal;
    try {
      const { changed: n, quotesLost } = await applyCompression(draft.writes, keep, Date.now());
      // ⚠️ 写完把这个项目的块重读一遍 —— 不重读的话屏幕上还是压之前那份，
      // 而用户刚刚按的按钮上写着「用这一份」。
      await useBlocksStore.getState().load(threadId);
      set((st) => ({ sessions: omit(st.sessions, threadId), tabs: { ...st.tabs, [threadId]: 'content' } }));
      toast.notice(
        keep
          ? t('{n} 块换成了压缩稿。压缩前的原文留在每一块上，块的工具条上有个入口能打开看，也能换回去。', { n })
          : t('{n} 块换成了压缩稿。⚠️ 你关掉了「备份压缩前的原文」，原来的字没有了。', { n }),
      );
      // S7①：剔掉了 Spool 自己的骨架行。⚠️ 说一句就够了 —— 它没进库，不用用户做什么。
      if (draft.skeletonLines.length > 0) {
        toast.notice(
          t('压缩稿里有 {n} 行是 Spool 自己印的说明，不是你的字 —— 没有写进库。', {
            n: draft.skeletonLines.length,
          }),
        );
      }
      // ⭐ S3：⛔ 这一句不许省。压缩打断一条更正的引文，在 08-24 那次是**完全无声**的 ——
      // 屏幕上什么都不划，也不报错。更正本身还在库里（关系没动），丢的是「指哪一句」。
      if (quotesLost.length > 0) {
        const one = quotesLost[0];
        toast.error(
          quotesLost.length === 1
            ? t('#{c} 更正的是 #{b} 里的一句话 —— #{b} 压完之后那句话找不回来了。更正还留着，只是不再划出是哪一句。', {
                c: one.correctionSeq ?? '?',
                b: one.targetSeq ?? '?',
              })
            : t('有 {n} 条更正指的那句话，压完之后找不回来了。更正都还留着，只是不再划出是哪一句。', {
                n: quotesLost.length,
              }),
        );
      }
    } catch (e) {
      // ⛔ 写库失败必须说出来。一个点了没反应的按钮，在这条路上意味着用户不知道
      //    自己的库到底改没改。
      toast.error(t('写不进去：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  },

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
        const { text, blocks, skippedCompressed } = await buildThreadPack(thread, true);
        const session: CompressSession = {
          ...freshSession(
            { kind: 'project', threadId: thread.id, title: thread.title },
            text,
            blocks,
            skippedCompressed,
          ),
          startedAt: Date.now(),
        };
        set({ running: true, runningThreadId: thread.id, runningKind: 'compress', progress: { stage: 'starting' } });
        // 夜里那一批也走同一条路（坏了自动重跑一次）——⛔ 早上起来看到一份结构性的坏结果，
        // 那一趟等于白跑，而重跑的钱和现在这一笔是同一个量级。
        const { outcome, retry, shield } = await runCompress(
          text,
          s.apiCompressLevel,
          s.apiReasoning,
        );
        if (outcome.ok) {
          set((st) => ({ results: [...st.results, { ...session, outcome, retry, shield }] }));
        } else if (outcome.kind === 'cancelled') {
          // 停下不是「没压成」—— ⛔ 别把它记进早上那张失败单子里。
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
        set({ running: false, runningThreadId: null, runningKind: null, progress: null });
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

  // ---------------------------------------------------------------------------------
  // E3 · 作废检测（2026-08-23）
  // ---------------------------------------------------------------------------------
  //
  // ⚠️ 提示词、请求、和回来之后那道**引文逐字闸**全在 Rust 那一侧（`api_engine.rs`）。
  // ⛔ 这边不另写一道闸 —— 界面上放行的和 Rust 放行的必须是同一批。
  runStaleScan: async (threadId) => {
    if (get().running) return;
    const byId = new Map<string, Thread>();
    for (const list of Object.values(useThreadsStore.getState().threadsByWorkspace)) {
      for (const th of list) byId.set(th.id, th);
    }
    const thread = byId.get(threadId);
    if (!thread) return;
    set((st) => ({
      running: true,
      runningThreadId: threadId,
      runningKind: 'stale',
      progress: { stage: 'starting' },
      staleErrors: omit(st.staleErrors, threadId),
    }));
    try {
      // ⚠️ 查的是**完整**的 pack，⛔ 不跳过压过的块：压过不等于没过期，
      // 而「压过的只能被检测语义是否废除」正是他自己写的那一句。
      const { text, blocks } = await buildThreadPack(thread);
      const s = useSettingsStore.getState();
      const scan = await staleScan({
        packText: text,
        baseUrl: s.apiBaseUrl,
        apiKey: await loadApiKey(),
        model: s.apiModel,
        reasoning: s.apiReasoning,
        timeoutSecs: s.apiTimeoutSecs,
      });
      // ⛔⛔ T2（2026-08-23，第五轮实测）：**先把库里已经有的那几条摘出去。**
      //
      // 实测撞到的是最难看的一种：5 次里最稳的那条提议（4/5）指的关系**库里本来就有**
      // —— `#23` 早就带着 `corrects → #21`。于是用户被要求批准一件他已经批准过的事，
      // 点「合并」是空操作（pack 一个字符都没变）。
      //
      // ⛔ 而另一半更糟：他要是点「只退旧的」，`setBlockSupersession` 会把那条
      // `corrects` **降级成 `supersedes`、把 `#21` 整条退掉** —— 而 `corrects`
      // 当初就是因为「旧块还成立、只有一点要更正」才选的。三条提议里 2 条是这种。
      // ⛔ 判断住在 `lib/blocks/staleGuards.ts` —— 拆出去是为了它测得到，
      //    以及为了改掉「按 refKind 认」那个错（`cites` 会整类漏过去，见那个文件）。
      const bySeq = new Map<number, Block>();
      for (const b of blocks) if (b.seq !== null) bySeq.set(b.seq, b);
      const settled = (p: (typeof scan.proposals)[number]): boolean =>
        relationAlreadySettled(bySeq.get(p.staleSeq), bySeq.get(p.bySeq));
      // ⛔ 和压缩那一条同一个道理：按了停下就当没跑过，⛔ 不在这一页立一张红牌。
      if (scan.outcome.kind === 'cancelled') {
        toast.notice(t('已经停下了。已经跑出去的那一段，模型厂商那边可能照样算钱。'));
        return;
      }
      const fresh: StaleEntry[] = scan.proposals
        .filter((p) => !settled(p))
        .map((p) => ({ ...p, origin: 'scan' as const }));
      // ⭐ S2：AI 提的那几条**留在同一张卡上** —— 花钱扫一遍不该把它们冲掉。
      // ⚠️ 排在扫描结果前面：它们等的时间更久（7 天就过期）。
      // ⚠️ 库里已经有这条关系的照样摘走（`settled`），⛔ 两个来路同一把尺子。
      const proposed = (await listSupersedeProposals(threadId, Date.now()))
        .map(toStaleEntry)
        .filter((p) => !settled(p));
      set((st) => ({
        stale: {
          ...st.stale,
          [threadId]: {
            source: text,
            blocks,
            proposals: [...proposed, ...fresh],
            dropped: scan.dropped,
            already: scan.proposals.length - fresh.length,
            outcome: scan.outcome,
            decided: {},
            startedAt: Date.now(),
          },
        },
      }));
    } catch (e) {
      set((st) => ({
        staleErrors: { ...st.staleErrors, [threadId]: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      set({ running: false, runningThreadId: null, runningKind: null, progress: null });
    }
  },

  decideStale: async (threadId, index, action) => {
    const sess = get().stale[threadId];
    const p = sess?.proposals[index];
    if (!sess || !p || sess.decided[index]) return;
    const bySeq = new Map<number, Block>();
    for (const b of sess.blocks) if (b.seq !== null) bySeq.set(b.seq, b);
    const oldBlock = bySeq.get(p.staleSeq);
    const newBlock = bySeq.get(p.bySeq);
    if (action !== 'keep' && (!oldBlock || !newBlock)) {
      // ⛔ 不静默：块在这中间被删了，用户点了没反应会以为库改了。
      toast.error(t('这两块里有一块已经不在了，这一条做不了。'));
      return;
    }
    // ⛔⛔ T2（2026-08-23）：`setBlockSupersession` 是**覆盖式**写入 —— 一块只存得下
    // 一条关系。新块要是已经指着**别的**块，写下去等于把那条悄悄删了。
    // ⚠️ 指着同一块的那种在扫描时就摘走了（`settled`），走到这里的只剩「指着别处」。
    if (action !== 'keep' && wouldOverwriteRelation(oldBlock, newBlock)) {
      toast.error(
        t('第 {n} 块已经指着另一块了，一块只记得住一条这样的关系。要改的话先在那一块上撤掉原来那条。', {
          n: p.bySeq,
        }),
      );
      return;
    }
    try {
      if (action === 'merge' && oldBlock && newBlock) {
        // ⭐ A（Ocean 2026-08-23）：**只连线不动字**。新块标成「更正了旧块」，
        // ⛔ 旧块不退、正文一个字不改。⚠️ `corrects` 不写 `stale_at` —— 那正是它和
        // 「只退旧的」的全部区别（`setBlockSupersession` 只在 supersedes 时才写）。
        await setBlockSupersession(newBlock.id, oldBlock.id, 'corrects', Date.now());
        // ⭐ 引文正好是 v21 那个字段要的东西：「新块更正的是旧块里的哪一句」。
        // 它过了逐字闸，所以「存进去的必然逐字出现在那一块里」这条不变量成立。
        await setCorrectedQuote(newBlock.id, p.quoteStale);
      } else if (action === 'retire' && oldBlock && newBlock) {
        // ⛔ `stale_at` + `ref_kind` **一起写**，只写一半是负收益（+212 字符，量过）。
        // `setBlockSupersession` 在 supersedes 这一档里两样都写。
        await setBlockSupersession(newBlock.id, oldBlock.id, 'supersedes', Date.now());
      }
      if (action !== 'keep') await useBlocksStore.getState().load(threadId);
      // ⭐ S2：AI 提的那一条，活干完了就把库里那一行删掉。
      // ⚠️ 「不动」也删 —— **「不动」是一个决定，不是「还没决定」**；留着的话下次打开
      // 又问一遍，正是 T2 那条「要求用户批准他已经批准过的事」。
      // ⛔ 不留拒绝日志（和 `proposals` 同一条理由：拒绝日志会把队列变成垃圾堆）。
      if (p.rowId) await deleteSupersedeProposal(p.rowId);
      set((st) => {
        const cur = st.stale[threadId];
        if (!cur) return {};
        return {
          stale: {
            ...st.stale,
            [threadId]: { ...cur, decided: { ...cur.decided, [index]: action } },
          },
        };
      });
    } catch (e) {
      toast.error(t('写不进去：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  },

  // ⭐ S2（2026-08-24，Ocean 拍板）：AI 提的「整条取代」读进这个项目那张卡。
  //
  // ⛔ **并进 E3 那张卡，不新开一张** —— 判断是同一个判断（这一块是不是被后面那块整条
  // 取代了），只是发现它的人不同：E3 是花钱让 sidecar 扫一遍，这条是正在聊天的那个 AI
  // 顺手提的。**并进去用户只学一套话；分开就是两套。**
  //
  // ⚠️ 这个函数**不花钱、不起 sidecar**，所以它不碰 `running` 那把锁，
  // 也不写 `outcome` —— 那一行报账的格子只属于真花过钱的那一次。
  loadProposedStale: async (threadId) => {
    const now = Date.now();
    try {
      await purgeExpiredSupersedeProposals(now);
      const rows = await listSupersedeProposals(threadId, now);
      const blocks = useBlocksStore.getState().byThread[threadId] ?? [];
      const bySeq = new Map<number, Block>();
      for (const b of blocks) if (b.seq !== null) bySeq.set(b.seq, b);
      // ⛔⛔ T2 那条尺子照用：库里**已经有这条关系**的不再问一遍。
      // ⚠️ 块还没读进来的时候（`blocks` 空）一条都摘不掉 —— 那是对的：
      // 宁可多问一条，也不许因为读慢了就把一条真提议悄悄吞掉。
      const fresh = rows
        .map(toStaleEntry)
        .filter(
          (p) =>
            blocks.length === 0 ||
            !relationAlreadySettled(bySeq.get(p.staleSeq), bySeq.get(p.bySeq)),
        );
      set((st) => {
        const cur = st.stale[threadId];
        // 扫描出来的那几条留着，AI 提的整批换成刚读到的（库是唯一的真相）。
        const scanned = (cur?.proposals ?? []).filter((p) => p.origin === 'scan');
        const decidedRows = new Set(
          Object.entries(cur?.decided ?? {})
            .map(([i]) => cur?.proposals[Number(i)]?.rowId)
            .filter((x): x is string => !!x),
        );
        const next = [...fresh.filter((p) => !decidedRows.has(p.rowId!)), ...scanned];
        if (next.length === 0 && !cur) return {};
        return {
          stale: {
            ...st.stale,
            [threadId]: {
              source: cur?.source ?? '',
              blocks: cur?.blocks ?? blocks,
              proposals: next,
              dropped: cur?.dropped ?? [],
              already: cur?.already ?? 0,
              outcome: cur?.outcome ?? null,
              // ⚠️ 单子重排了，下标跟着变 —— ⛔ 旧的 `decided`（按下标记的）不能留，
              // 留着会把「已决定」的划线画到别的条目上。已经决定过的那几行本来就删掉了。
              decided: {},
              startedAt: cur?.startedAt ?? now,
            },
          },
        };
      });
    } catch (e) {
      console.info('[stale] 读不到 AI 提的整条取代', e);
    }
  },
}));

/** 库里那一行 → 卡片上那一条。⚠️ 两个来路在卡片上共用同一个形状，
 *  ⛔ 除了「谁提的」以外一处都不许分叉。 */
const toStaleEntry = (r: SupersedeProposal): StaleEntry => ({
  staleSeq: r.staleSeq,
  bySeq: r.bySeq,
  why: r.why,
  quoteStale: r.quoteStale,
  quoteNew: r.quoteNew,
  retyped: r.retyped,
  origin: 'mcp',
  client: r.client,
  rowId: r.id,
});

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
