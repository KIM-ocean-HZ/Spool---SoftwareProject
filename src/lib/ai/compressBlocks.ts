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
  ENTRY_RE,
  HIGHLIGHT_RE,
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
