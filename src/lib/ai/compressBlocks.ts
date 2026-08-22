// 按**块**核对压缩稿（WORKPLAN-2026-08-20 §9.6.5）。
//
// # 病根
//
// 第一版核对界面比的是**两大坨 pack 纯文本的行**。Ocean 用完之后的原话：
// 「删除内容划线的可视化我认可，但是前后文本一一对应仍然不够直觉性，用户可能看不懂删了什么」。
//
// 他说得对，而且原因是结构性的：**用户脑子里的单位不是行，是块。** 一行一行对齐读，
// 本来就读不出「第 3 块被合并进第 2 块了」这种事 —— 行级 diff 只会显示第 3 块整段划掉，
// 而它其实还在，在别的地方。
//
// # 改法：一块对一块
//
// pack 里每一条都以 `#N [时间 · from 来源]` 开头，`countPackEntries` 已经认得这一行。
// 这里把两边都按这一行切开，**用 `#N` 配对**，然后一对一对地摆。
//
// ⚠️⚠️ **配不上必须是一个看得见的结果，不是一个异常。**
// 压缩稿回来是纯文本，模型完全可能不守规矩（漏一块、改一个编号、把两块并成一块）。
// 所以：
//
//   * 某一块在压缩稿里找不到 → 这一对照样列出来，右边写「第 N 块在压缩稿里找不到」；
//   * 压缩稿里多出来一个原文没有的 `#N` → 单独列出来，标成「原文里没有这一块」；
//   * **整份都切不出块**（模型完全没照格式写）→ `compareByEntry` 返回 `null`，
//     界面退回整份文本对照，并且**说出来**为什么退回。⛔ 不许静默跳过。

import {
  ANY_NOTE_RE,
  diffLines,
  ENTRY_RE,
  HIGHLIGHT_RE,
  lineHasNumber,
  missingNumbersBetween,
  normLoose,
  packLines,
  PACK_SECTIONS,
  pairRewrites,
  RENDERED_NOTE_RE,
  uniq,
  type NoteRewrite,
} from './compress';

/** pack 里的一条。`raw` 是这一条的全部原文（头行 + 正文），核对用的就是它。 */
export interface PackEntry {
  /** `#N` 里的 N。⚠️ 这是**块自己的编号**（seq），不是它在 pack 里排第几。 */
  seq: number;
  /** 头行上印着的记号：`📌` 置顶、`💭` 用户自己写的、`🗜` 压缩稿。 */
  marks: string[];
  /** 方括号里那一截，例如 `2026-08-20 13:50 · from 重新设计Spool宣传物料和视频 - Claude`。 */
  bracket: string;
  /** 来源标签（`· from ` 之后那一截）。null = 没有来源 = 用户自己写的。 */
  source: string | null;
  /** 时间戳那一截。 */
  time: string;
  /** 头行上 `]` 之后的正文第一段，加上后面所有续行。**渲染用这个。** */
  body: string;
  /** 这一条所属的 `## ` 小节，例如 `Full Record (chronological)`。 */
  section: string;
  raw: string;
}

// ⚠️⚠️ **只认 pack 自己的那几个小节标题（`PACK_SECTIONS`），不认任何 `## `。**
//
// 块的正文是 markdown，里面本来就有 `## 研究线` 这种标题。按 `^## ` 一刀切的话，
// 一块正文里出现一个二级标题，这一块就在那儿被截断，后面的正文归给「没有块」。
// 2026-08-21 实测撞见了：〈Flux〉#3（一份 README）在原文侧被截成 473 字符，
// 而压缩稿侧完整，于是核对报「这一块被撑大到 254%」——**是切错了，不是它写多了**。
const SECTION_RE = /^##\s+(.+?)\s*$/;
const HEAD_RE = /^((?:(?:📌|💭|🗜)\s+)*)#(\d+)\s+\[([^\]]*)\]\s?(.*)$/;
const FROM = ' · from ';

/** 把一份 pack 切成条目。切不出来就是空数组 —— 调用方要把这件事显示出来。 */
export const splitPackEntries = (packText: string): PackEntry[] => {
  const lines = packLines(packText);
  const out: PackEntry[] = [];
  let section = '';
  let cur: { entry: PackEntry; body: string[] } | null = null;
  const close = () => {
    if (!cur) return;
    cur.entry.body = [cur.entry.body, ...cur.body].join('\n').replace(/\s+$/, '');
    cur.entry.raw = cur.entry.raw + (cur.body.length ? '\n' + cur.body.join('\n') : '');
    out.push(cur.entry);
    cur = null;
  };
  for (const line of lines) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      close();
      section = sec[1];
      continue;
    }
    if (ENTRY_RE.test(line)) {
      close();
      const m = HEAD_RE.exec(line);
      if (!m) {
        // ⛔ **绝不静默跳过。** ENTRY_RE 已经认出这是一条了，只是头行细节没解析出来
        // （方括号里带 `]`，之类）。宁可给一条字段不全的记录，也不能让这一块从核对面上消失。
        out.push({
          seq: Number(/#(\d+)/.exec(line)?.[1] ?? 0),
          marks: (line.match(/📌|💭|🗜/g) ?? []) as string[],
          bracket: '',
          time: '',
          source: null,
          body: line,
          section,
          raw: line,
        });
        continue;
      }
      const bracket = m[3];
      const at = bracket.indexOf(FROM);
      cur = {
        entry: {
          seq: Number(m[2]),
          marks: (m[1].match(/📌|💭|🗜/g) ?? []) as string[],
          bracket,
          time: at >= 0 ? bracket.slice(0, at) : bracket,
          source: at >= 0 ? bracket.slice(at + FROM.length) : null,
          body: m[4],
          section,
          raw: line,
        },
        body: [],
      };
      continue;
    }
    if (cur) cur.body.push(line);
  }
  close();
  return out;
};

/** 这一块里，「一字不改保留」的东西还在不在。整份那一版（`auditCompression`）报的是
 *  「少了 2 条批注」，而按块之后**能直接指到是哪一块少的** —— 那才是能拿去核对的粒度。 */
export interface EntryAudit {
  missingNotes: string[];
  missingHighlights: string[];
  /** 这一块的 `↩ cites:` / `↩ replaces` / `↩ corrects` 连线掉了几条。见 compress.ts。 */
  missingRelations: string[];
  /** ⚠️⚠️ 这一块里再也找不到的数字/日期。整份报「丢了 9 个」看不出是谁丢的。见 compress.ts。 */
  missingNumbers: string[];
  /** ⚠️ 「编」比「丢」更坏：一行编出来的批注穿的是用户自己的权威。见 compress.ts。 */
  fabricatedNotes: string[];
  /** ⚠️ 第三类：被改写的批注（D4-b）。一条被改写 ≠ 丢了一条 + 编了一条。见 `pairRewrites`。 */
  rewrittenNotes: NoteRewrite[];
}

const noteLines = (text: string): string[] =>
  uniq(
    packLines(text)
      .map((l) => ANY_NOTE_RE.exec(l)?.[1])
      .filter((s): s is string => !!s)
      .map(normLoose),
  );

export const auditEntry = (before: PackEntry | null, after: PackEntry | null): EntryAudit => {
  const src = before?.raw ?? '';
  const dst = after?.raw ?? '';
  // ⚠️ 宽的那一档：换了引号算还在。喊一次假的「编造」，整个核对就失信了 —— 见 compress.ts。
  const hay = normLoose(dst);
  const gone = (xs: string[]): string[] => xs.filter((x) => !hay.includes(normLoose(x)));
  const originals = new Set(noteLines(src));
  // ⚠️ 查「丢」用窄的那条（只认 Spool 自己渲染出来的两种批注行），查「添」用宽的。
  // 两个方向要的精度不一样 —— 理由写在 compress.ts 的 RENDERED_NOTE_RE 上面。
  const missingNotes = gone(
    uniq(
      packLines(src)
        .map((l) => RENDERED_NOTE_RE.exec(l)?.[1])
        .filter((x): x is string => !!x),
    ),
  );
  // D4-b：同一条被改写，不是「丢了一条」加「编了一条」。⚠️ 按块配对比整份更准 ——
  // 能配上的两条本来就该在同一块里，跨块配对只会把不相干的两条说成一对。
  const paired = pairRewrites(missingNotes, noteLines(dst).filter((x) => !originals.has(x)));
  return {
    missingNotes: paired.missing,
    rewrittenNotes: paired.rewrites,
    missingHighlights: gone(uniq([...src.matchAll(HIGHLIGHT_RE)].map((m) => m[1]))),
    missingNumbers: missingNumbersBetween(src, dst),
    missingRelations: gone(
      uniq(
        packLines(src)
          .map((l) => /^\s*↩\s*(.+)$/.exec(l)?.[1])
          .filter((x): x is string => !!x),
      ),
    ),
    fabricatedNotes: paired.fabricated,
  };
};

export const entryHasLosses = (a: EntryAudit): boolean =>
  a.missingNotes.length > 0 ||
  a.rewrittenNotes.length > 0 ||
  a.missingHighlights.length > 0 ||
  a.missingRelations.length > 0 ||
  a.missingNumbers.length > 0 ||
  a.fabricatedNotes.length > 0;

/** 一对。`after === null` = **这一块在压缩稿里找不到**；`before === null` = 压缩稿凭空多出来的。 */
export interface EntryPair {
  /** ⚠️ 配对的键是**小节 + 编号**，不是编号。见 `compareByEntry`。 */
  key: string;
  section: string;
  seq: number;
  before: PackEntry | null;
  after: PackEntry | null;
  audit: EntryAudit;
}

export interface BlockCompare {
  pairs: EntryPair[];
  /** 原文有几块 / 压缩稿有几块。⚠️ 两个数都是 **Spool 自己数的**，不问模型。 */
  before: number;
  after: number;
  /** 压缩稿里找不到的块数。>0 的时候界面顶部要变红。 */
  dropped: number;
  /** 原文里没有、压缩稿凭空多出来的块数。 */
  invented: number;
  /** ⚠️⚠️ 压缩稿里**重复出现**的编号。
   *
   *  这不是假想的失败：2026-08-21 第二轮实测第 7 次，模型把**整份 pack 原样输出了两遍**
   *  —— 22 块变 44 块，压完剩 **194%**。按 `#N` 配对的时候如果只留最后一个，
   *  这件事会**看起来完全正常**（22 对，一对不缺），而用户拿到的是一份两倍长的东西。
   *  所以重复编号必须单独数出来，并且在界面上说。 */
  duplicated: number[];
}

/** 按 `#N` 配对。
 *
 *  ⚠️ 返回 `null` = **这一份没法按块对照**（压缩稿一条都切不出来，模型没照格式写）。
 *  界面收到 null 要退回整份文本对照，并且把「为什么退回」说出来 —— §9.6.5 点名要求
 *  解析失败是一个**可见的结果**，不是一个被吞掉的异常。 */
export const compareByEntry = (original: string, compressed: string): BlockCompare | null => {
  const a = splitPackEntries(original);
  const b = splitPackEntries(compressed);
  if (a.length === 0) return null;
  if (b.length === 0) return null;

  // ⚠️⚠️ **键是「小节 + 编号」，不是编号。**
  //
  // 置顶的块在 pack 里**本来就出现两次**：`## Pinned Blocks` 里是全文，`## Full Record`
  // 里是一行占位（`(pinned — full text in "Pinned Blocks" above)`）。只按 `#N` 配对的话，
  // 任何有置顶块的项目都会被报成「它把同一块写了两遍」——2026-08-21 实测在〈Flux〉上撞见了，
  // 而那一份压缩稿完全正常。**一个每次都误报的警告，等于把真正的重复也一起藏了。**
  const key = (e: PackEntry): string => `${e.section}#${e.seq}`;

  const byKey = new Map<string, PackEntry>();
  const seen = new Set<string>();
  const duplicated: number[] = [];
  for (const e of b) {
    if (seen.has(key(e))) {
      if (!duplicated.includes(e.seq)) duplicated.push(e.seq);
      continue; // 配对留第一份；重复的那几份由 `duplicated` 报出去。
    }
    seen.add(key(e));
    byKey.set(key(e), e);
  }

  const pairs: EntryPair[] = [];
  for (const before of a) {
    const after = byKey.get(key(before)) ?? null;
    byKey.delete(key(before));
    pairs.push({
      key: key(before),
      section: before.section,
      seq: before.seq,
      before,
      after,
      audit: auditEntry(before, after),
    });
  }
  // 剩下的是压缩稿里凭空多出来的编号。⛔ 不许静默丢掉。
  for (const after of byKey.values()) {
    pairs.push({
      key: key(after),
      section: after.section,
      seq: after.seq,
      before: null,
      after,
      audit: auditEntry(null, after),
    });
  }
  // 小节内按编号排，小节之间按它们在原文里出现的先后 —— 读起来和 pack 一样。
  const order = new Map<string, number>();
  for (const e of a) if (!order.has(e.section)) order.set(e.section, order.size);
  pairs.sort(
    (x, y) =>
      (order.get(x.section) ?? 99) - (order.get(y.section) ?? 99) || x.seq - y.seq,
  );

  return {
    pairs,
    before: a.length,
    after: b.length,
    dropped: pairs.filter((p) => p.before && !p.after).length,
    invented: pairs.filter((p) => !p.before && p.after).length,
    duplicated,
  };
};

/** 一块压完剩百分之几。两边都在才有意义。 */
export const entryPercent = (p: EntryPair): number | null => {
  if (!p.before || !p.after) return null;
  return Math.round((p.after.raw.length / Math.max(1, p.before.raw.length)) * 100);
};

// ---------------------------------------------------------------------------------------
// D7 · 把丢掉的数字/日期加回去（2026-08-22，Ocean）
// ---------------------------------------------------------------------------------------
//
// 封锁写入的理由是：**它压得动的时候会丢日期，它不丢日期的时候等于没压。**
// 原来给的解法是硬闸门（`numbersGateOpen`）—— 丢了就不许存，只能重跑，而重跑要再花一次钱、
// 再等一分钟，还不保证这次不丢。
//
// ⭐ Ocean 这条给的是第三条路，比重跑好：**丢了就补回去。**
// 那个数字和它所在的那一行**在原文里都还在** —— 这是纯本地、不出网、不花钱、不问模型的动作。
//
// ⚠️⚠️ **难在插哪儿。** 三条规矩，每一条都是为了不让「补救」自己变成新的损坏：
//
//   1. **补回去的是整行，不是"带数字的那一句"。** 一行本来就是 diff 的单位，而且整行拿回来
//      永远是合法的 markdown（列表记号、`💭 note:` 前缀、标题都跟着回来）。
//      ⛔ 抠句子会把一个日期塞进半截话里 —— 那正是这个功能要修的毛病。
//   2. **落脚点是「它前面最后一个原样留下来的行」。** 插在那一行后面，顺序就还是原文的顺序。
//      前面一行都没留下来（整段被改写）→ 插在这一块的头行后面，⛔ **绝不会跑到别的块里去**。
//   3. **补不回去的必须报出来**（`failed`）。整块不见了、或者这一份根本切不出块的时候，
//      没有落脚点 —— ⛔ 那时候假装"全补上了"，就是核对界面自己在撒谎。
const RELATION_LINE = /^\s*↩/;
/** `templates.ts::truncationMarker` 印出来的那一行。里面那个数是渲染器算的字数，不是内容。 */
const TRUNCATION_LINE = /^\s*\[\.\.\. truncated, \d+ more chars not shown \.\.\.\]\s*$/;

export interface AddBackResult {
  /** 补完之后的压缩稿全文。⚠️ 一处都没补的时候原样返回，不是空串。 */
  text: string;
  /** 真的补回去了的那些数字/日期。 */
  added: string[];
  /** ⭐ 真的插回去的那几**行**原文。界面靠它把「你加回去的」标出来 ——
   *  ⛔ 不标的话用户看不见自己刚才那一下做了什么，也不知道它落在了哪儿。 */
  lines: string[];
  /** ⛔ 没能补回去的。必须报给用户 —— 见上面第 3 条。 */
  failed: string[];
  /** ⭐ 接在**小节末尾**、而不是接进某一块里的那几行（附件正文、整块不见了的那几行）。
   *  ⚠️ 界面必须说出这个数：这几行不在任何一张块卡片上，右栏那个「你加回去的」标不到它们
   *  —— 不说的话，用户按了一下、屏幕上却什么都没变，那正是 R2 第 3 条骂的那件事。 */
  outsideBlocks: number;
}

/** 把压缩稿里丢掉的数字/日期，连着它在原文里的那一行一起补回去。纯本地，不问模型。
 *
 *  `only` = 只补这几个数字（界面上一块一块地补、一处一处地补，走的就是它）。
 *  不传 = 这一份里丢掉的全补。 */
export const addBackNumbers = (
  original: string,
  compressed: string,
  only?: readonly string[],
): AddBackResult => {
  const all = missingNumbersBetween(original, compressed);
  const missing = only ? all.filter((n) => only.includes(n)) : all;
  const cmp = missing.length > 0 ? compareByEntry(original, compressed) : null;
  // 整份切不出块（模型没照 pack 的格式写）= 一个块级落脚点都没有。
  // ⛔ 不许在整份文本上瞎猜位置，但**按小节更正回去**那一路仍然走得通 —— 走它。
  if (!cmp) {
    const added0: string[] = [];
    const lines0: string[] = [];
    const patch0 =
      missing.length > 0 ? correctBySection(original, compressed, missing, added0, lines0) : null;
    return {
      text: patch0 ? applySectionPatch(compressed, patch0) : compressed,
      added: added0,
      lines: lines0,
      failed: missing.filter((n) => !added0.includes(n)),
      outsideBlocks: lines0.length,
    };
  }

  // key（小节 + 编号）→（after 正文的行下标 → 插在它后面的那几行）
  const plan = new Map<string, Map<number, string[]>>();
  const added: string[] = [];
  const lines: string[] = [];
  for (const p of cmp.pairs) {
    if (!p.before || !p.after) continue;
    const here = missing.filter((n) => p.audit.missingNumbers.includes(n));
    if (here.length === 0) continue;
    const perAnchor = new Map<number, string[]>();
    // after 那一侧的行下标：0 = 头行（`#N […]` 那一行的尾巴），往后依次 +1。
    let afterIdx = -1;
    let lastSame = -1;
    for (const l of diffLines(p.before.body, p.after.body)) {
      if (l.op !== 'cut') {
        afterIdx++;
        if (l.op === 'same') lastSame = afterIdx;
        continue;
      }
      // ⛔ `↩ cites:` 那种预览行不是正文，它是别的块开头几十个字、还被 `…` 截断了。
      // 把它补回来等于往稿子里插一句半截话。那一类由 `missingRelations` 管。
      if (RELATION_LINE.test(l.text)) continue;
      const hits = here.filter((n) => !added.includes(n) && lineHasNumber(l.text, n));
      if (hits.length === 0) continue;
      const anchor = Math.max(lastSame, 0);
      const at = perAnchor.get(anchor) ?? [];
      if (!at.includes(l.text)) at.push(l.text);
      perAnchor.set(anchor, at);
      if (!lines.includes(l.text)) lines.push(l.text);
      added.push(...hits);
    }
    if (perAnchor.size > 0) plan.set(p.key, perAnchor);
  }

  // ⭐ 第二条路：**块里插不进去的，按小节更正回去**（2026-08-22，Ocean 原话「文本无法插回去了，
  // 如果插不回去就添加一个文本更正，把原文更正回去」）。
  //
  // 上面那一路只认「原文和压缩稿里都还在的那一块」。真实语料上量过，剩下的两类都补不了：
  //   ① 那一行**根本不属于任何一块** —— 附件抽出来的正文住在 `## Related Files & Links`，
  //      那一节里没有 `#N`，所以一个落脚点都找不到；
  //   ② 那一块**整块不见了** —— 块都没了，自然没有「它前面最后一个原样留下来的行」。
  //
  // ⛔ 那时候原来的做法是弹一句「补不回去，重压一次吧」——让用户再花一次钱、再等一分钟，
  //    而那一行原文**就在手边**。现在改成：把那几行原文按**它原来所在的小节**接回去。
  // ⚠️ 接在小节末尾，不往块里塞：塞进别的块就是把一句话安到了不属于它的出处上。
  const stillMissing = missing.filter((n) => !added.includes(n));
  const patch =
    stillMissing.length > 0
      ? correctBySection(original, compressed, stillMissing, added, lines)
      : null;

  const failed = missing.filter((n) => !added.includes(n));
  // ⚠️ 只数**散行**：整条放回去的那些在核对面上就是一张块卡片，看得见，不用另外说。
  const outsideBlocks = patch ? [...patch.loose.values()].reduce((n, at) => n + at.length, 0) : 0;
  if (plan.size === 0 && !patch)
    return { text: compressed, added, lines, failed, outsideBlocks: 0 };
  const spliced = plan.size > 0 ? spliceBack(compressed, plan) : compressed;
  return {
    text: patch ? applySectionPatch(spliced, patch) : spliced,
    added,
    lines,
    failed,
    outsideBlocks,
  };
};

/** 要接回压缩稿的东西，按小节收拢。⚠️ 键是小节名；`''` = 不属于任何小节。 */
interface SectionPatch {
  /** 整块不见了 → 把**那一整条原文**（头行 + 正文）放回去。⚠️ 按 `seq` 插回原来的位置。 */
  entries: Map<string, PackEntry[]>;
  /** 不属于任何一块的行（附件抽出来的正文那种）→ 接在这一节末尾。 */
  loose: Map<string, string[]>;
}

/** 把补不进块里的那几行，按它们**在原文里所属的小节**收拢起来。
 *
 *  两类分开办，因为「放回去」的正确形状不一样：
 *
 *   - **整块不见了** → 放回**整条**（头行 + 正文），按 `seq` 插回原来的位置。
 *     ⛔ 只放回带数字的那一行是不行的：一条裸行接在最后一块后面，`splitPackEntries` 会把它
 *     算成**上一块的正文**，于是核对面上那一块凭空长出一句不属于它的话。
 *   - **那一行根本不属于任何一块**（附件正文住在 `## Related Files & Links`，那一节里没有
 *     `#N`）→ 接在这一节末尾就是对的位置。
 *
 *  ⚠️ 同时把补上的数字记进 `added`、把行记进 `lines` —— 界面靠 `lines` 标「你加回去的」。 */
const correctBySection = (
  original: string,
  compressed: string,
  wanted: readonly string[],
  added: string[],
  lines: string[],
): SectionPatch | null => {
  const key = (e: PackEntry): string => `${e.section}#${e.seq}`;
  const present = new Set(splitPackEntries(compressed).map(key));
  const patch: SectionPatch = { entries: new Map(), loose: new Map() };

  // ① 整块不见了的那些。
  for (const e of splitPackEntries(original)) {
    if (present.has(key(e))) continue;
    const hits = wanted.filter((n) => !added.includes(n) && lineHasNumber(e.raw, n));
    if (hits.length === 0) continue;
    const at = patch.entries.get(e.section) ?? [];
    at.push(e);
    patch.entries.set(e.section, at);
    added.push(...hits);
  }

  // ② 剩下的：不属于任何一块的行。
  const have = new Set(packLines(compressed).map((l) => l.trim()));
  let section = '';
  let inEntry = false;
  for (const line of packLines(original)) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      section = sec[1];
      inEntry = false;
      continue;
    }
    if (ENTRY_RE.test(line)) {
      inEntry = true;
      continue;
    }
    // 属于某一块的正文行，上面那一路已经管过了（那一块要么还在，要么整条被放回去）。
    if (inEntry) continue;
    // ⛔ Spool 自己印的那两类行不补：`↩` 预览行是别的块开头的半截话，
    // 截断标记里那个数是渲染器算出来的字数。两类都不是用户的字。
    if (RELATION_LINE.test(line) || TRUNCATION_LINE.test(line)) continue;
    const hits = wanted.filter((n) => !added.includes(n) && lineHasNumber(line, n));
    if (hits.length === 0) continue;
    // 这一行压缩稿里原样还在（只是那个数被别处的判断算成了丢）—— 不重复接一遍。
    if (have.has(line.trim())) continue;
    const at = patch.loose.get(section) ?? [];
    at.push(line);
    patch.loose.set(section, at);
    if (!lines.includes(line)) lines.push(line);
    added.push(...hits);
  }

  return patch.entries.size > 0 || patch.loose.size > 0 ? patch : null;
};

/** 把 `SectionPatch` 接进压缩稿。
 *
 *  整条放回去的按 `seq` 插回原来的位置（⚠️ 排在第一个编号比它大的同节条目前面）；
 *  散行接在这一节的末尾（下一个 `## ` 之前）。
 *
 *  ⚠️ 压缩稿里没有这一节的时候，连小节标题一起补在整份末尾 —— ⛔ 不许把它们裸接在最后一块
 *  后面：`splitPackEntries` 会把裸行算成最后那一块的正文，于是核对面上那一块凭空长出几行。 */
const applySectionPatch = (compressed: string, patch: SectionPatch): string => {
  const out: string[] = [];
  const doneLoose = new Set<string>();
  const pending = new Map<string, PackEntry[]>();
  for (const [sec, list] of patch.entries) pending.set(sec, [...list].sort((a, b) => a.seq - b.seq));
  let section = '';
  const drainEntries = (upTo: number): void => {
    const list = pending.get(section);
    if (!list) return;
    while (list.length > 0 && list[0].seq < upTo) out.push(...packLines(list.shift()!.raw));
  };
  const flush = (): void => {
    drainEntries(Number.POSITIVE_INFINITY);
    const at = patch.loose.get(section);
    if (at && !doneLoose.has(section)) {
      doneLoose.add(section);
      out.push(...at);
    }
  };
  for (const line of packLines(compressed)) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      flush();
      section = sec[1];
      out.push(line);
      continue;
    }
    if (ENTRY_RE.test(line)) drainEntries(Number(/#(\d+)/.exec(line)?.[1] ?? 0));
    out.push(line);
  }
  flush();
  // 压缩稿里根本没有的小节：标题跟着一起补。
  for (const sec of new Set([...patch.entries.keys(), ...patch.loose.keys()])) {
    const left = pending.get(sec) ?? [];
    const loose = doneLoose.has(sec) ? [] : patch.loose.get(sec) ?? [];
    if (left.length === 0 && loose.length === 0) continue;
    if (sec) out.push('', `## ${sec}`, '');
    for (const e of left) out.push(...packLines(e.raw));
    out.push(...loose);
  }
  return out.join('\n');
};

/** 照 `plan` 把几行插回压缩稿。⚠️ 走的是和 `splitPackEntries` 同一套切法（同样的头行、
 *  同样只认 pack 自己的小节标题），否则行下标会和上面算出来的落脚点错位。 */
const spliceBack = (compressed: string, plan: Map<string, Map<number, string[]>>): string => {
  const out: string[] = [];
  let section = '';
  let key: string | null = null;
  let bodyIdx = -1;
  const seen = new Set<string>();
  const insertAfter = (idx: number): void => {
    if (key) out.push(...(plan.get(key)?.get(idx) ?? []));
  };
  for (const line of packLines(compressed)) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      section = sec[1];
      key = null;
      out.push(line);
      continue;
    }
    if (ENTRY_RE.test(line)) {
      const k = `${section}#${Number(/#(\d+)/.exec(line)?.[1] ?? 0)}`;
      // 重复编号只补第一份 —— `compareByEntry` 配对时留的也是第一份，两边要一致。
      key = seen.has(k) ? null : k;
      seen.add(k);
      bodyIdx = 0;
      out.push(line);
      insertAfter(0);
      continue;
    }
    out.push(line);
    if (key !== null) {
      bodyIdx++;
      insertAfter(bodyIdx);
    }
  }
  return out.join('\n');
};

/** D-c · 这一份坏到「不该拿给用户看」的程度吗（2026-08-22）。
 *
 *  ⭐ 十次里有三四次属于这一类，而它们的共同点是：**用户看一眼就知道要重来**，
 *  中间那一步（看懂坏在哪、找到按钮、再点一次、再等一分钟）纯属摩擦。
 *
 *  ⚠️ 四条判据都是**结构性的**，不是「质量不够好」这种要人判断的话：
 *   - 整份切不出块（模型没照 pack 的格式写）；
 *   - 同一个编号出现不止一次（实测撞见过整份原样写两遍，压完剩 194%）；
 *   - 块数对不上（有块整块不见了，或者它编了原文没有的编号）；
 *   - 压完还剩 95% 以上 —— 钱花了，等了一分钟，拿到一份和原文差不多长的东西。
 *
 *  ⛔ **丢数字不在这四条里**，那一类现在有 `addBackNumbers` 补，不该再花第二笔钱。 */
export const worthRetrying = (original: string, compressed: string): boolean => {
  const c = compareByEntry(original, compressed);
  if (!c) return true;
  if (c.duplicated.length > 0 || c.dropped > 0 || c.invented > 0) return true;
  return compressed.length > original.length * 0.95;
};


/** 这几个丢掉的数字，各自住在原文的哪一行（⭐ 界面要指到文字上，不能只报一个编号）。
 *
 *  ⚠️⚠️ **和 `addBackNumbers` 必须是同一条判断** —— 屏幕上让用户看的那一行，
 *  就是点下去会被插回压缩稿的那一行。两边各算各的，用户看到 A、补进去 B，
 *  而这个界面存在的全部理由就是让人**看见**会发生什么。 */
export const missingNumberLines = (
  before: PackEntry,
  after: PackEntry,
  numbers: readonly string[],
): { line: string; numbers: string[] }[] => {
  const out: { line: string; numbers: string[] }[] = [];
  const taken = new Set<string>();
  for (const l of diffLines(before.body, after.body)) {
    if (l.op !== 'cut' || RELATION_LINE.test(l.text)) continue;
    const hits = numbers.filter((n) => !taken.has(n) && lineHasNumber(l.text, n));
    if (hits.length === 0) continue;
    for (const n of hits) taken.add(n);
    out.push({ line: l.text.trim(), numbers: hits });
  }
  return out;
};
