// R5 · **批注根本不发给 AI**（2026-08-22 第二轮第 5 条，`COMPRESS-UX-R2-2026-08-22.md` §5）。
//
// Ocean 的原话：「禁止批注被 AI 修改，**直接不发送批注就行**，发送给压缩时选定正文部分发送……
// 含有替代关系和引用关系的文字可以用**映射关系**来确保压缩不会碰到被引用的内容。」
// 配套那句：「除了数字丢了（可以自动加回去）之外，**其他警告 100% 禁止发生**。」
//
// # 为什么这一条比「再改一遍提示词」高一个量级
//
// 核对面报的六类警告里，有**五类**根源是同一件事：**那些字被送出去了**。
//
//   批注少了 · 批注被改写 · 编了批注 · 高亮没了 · 引用关系断了
//
// 提示词里已经写了三遍「一字不改地保留」，而四轮实测里它照样改。⛔ 这不是措辞问题：
// **只要那几行在模型眼前，它就有可能动它们。** 唯一能把「可能」变成「不可能」的做法是
// 让它根本看不见 —— 摘下来，压完按映射原样放回去。
//
// # 摘什么、怎么放回去
//
// | 摘什么 | 送出去时 | 放回去 |
// |---|---|---|
// | `💭 note:` / `ai note:` 整行 | 整行拿掉 | 按**块**放回**该块末尾** |
// | `↩ cites:` / `↩ replaces` / `↩ corrects` 整行 | 整行拿掉 | 同上 |
// | `↗ 出处 · retrieved 日期` 整行 | 整行拿掉 | 同上 |
// | `⚠️ 这一块有一点后来被更正了 — 见 #6` | 整行拿掉 | 同上 |
// | `==划的重点==` | 换成 `⟦H3⟧` 这样的占位符 | 占位符换回**原文连 `==` 一起** |
//
// ⚠️ 前两类是**整行**、而且明确属于某一块，所以「放回哪儿」没有歧义 —— 这是它们能被
// 结构性护住的原因。高亮是**行内的**，位置由模型写的那句话决定，所以只能留一个占位符
// 占着位子；⛔ 占位符没回来就是真的没了，那时候必须报出来（`lostSpans`），不许静默。
//
// ⚠️⚠️ **摘掉不等于不用再核对。** `auditCompression` 那一整套检查一条都没删（第 5c 条
// 明写「检查是最后一道网」）：核对比的仍然是**原文** 对 **放回去之后的稿子**。
// 摘的是「让它不可能发生」，不是「不再看」。

import { ENTRY_RE, HIGHLIGHT_RE, PACK_SECTIONS, packLines, RENDERED_NOTE_RE } from './compress';

/** 占位符的形状。⚠️ 三条硬要求：
 *
 *  1. **用户的库里不可能出现** —— `⟦⟧`（U+27E6/U+27E7）不是任何输入法打得出来的常用字符，
 *     而 pack 里唯一用到它的地方（`⟦SPOOL:MATERIAL⟧` 界标）提示词里已经点名说了别抄；
 *  2. **短**，塞在一句话中间不至于把那句话读坏；
 *  3. **里面没有语义**，模型没有东西可以「压缩」它。
 *
 *  ⛔ 别改成中文方括号或 `[[...]]`：前者用户会打出来，后者和 markdown / wiki 链接撞。 */
const SPAN_TOKEN = (n: number): string => `⟦H${n}⟧`;
const SPAN_TOKEN_RE = /⟦H(\d+)⟧/g;

/** ⚠️ **Spool 自己画在块下面的那几行**，一条不落：
 *
 *  | 行 | 谁写的 | 为什么不能给模型碰 |
 *  |---|---|---|
 *  | `↩ cites:` / `↩ replaces` / `↩ corrects` | Spool | 块和块之间的连线，实测 45 次里 19 次被压没 |
 *  | `↗ https://… · retrieved 2026-08-09` | Spool | 出处和**日期**，被压掉就成了「丢了一个数字」 |
 *  | `⚠️ one point in this block was corrected later — see #6` | Spool | 指向更正它的那一块 |
 *
 *  ⭐ 摘掉这几行还有第二个好处，R1（压缩稿写回库）直接靠它：**摘完之后，一条 pack 条目的
 *  正文就恰好等于那一块的 `content`** —— 写回库的时候不用再从压缩稿里猜哪几行是装饰。 */
const DECORATION_LINE = /^\s*(?:↩|↗ |⚠️ one point in this block was corrected later)/;

/** 从某一块上摘下来的那几整行。⚠️ `key` 和 `compareByEntry` 用的是同一套（小节 + 编号）——
 *  两边各算一套键，放回去就会放到别的块上，而那正是这件事最不能出的错。 */
export interface HeldLines {
  key: string;
  lines: string[];
}

export interface Held {
  /** 按块摘下来的整行（批注 + 引用/替代关系行）。 */
  byEntry: HeldLines[];
  /** 高亮：占位符编号 → 原文（**连 `==` 一起**）。 */
  spans: string[];
}

export interface Shielded {
  /** 摘掉之后、真正送出去的那一份。⚠️ 核对**不**拿它当原文 —— 原文永远是没摘之前那份。 */
  text: string;
  held: Held;
}

/** 摘之前先看看有没有东西可摘。⚠️ 一样都没有的时候整条路要能被跳过 ——
 *  没有必要为了一份不含批注的 pack 走一遍拆装。 */
export const isEmptyHeld = (h: Held): boolean => h.byEntry.length === 0 && h.spans.length === 0;

/** 一行属于哪一块的键。⚠️ 和 `compressBlocks.ts::compareByEntry` 同一套。 */
const entryKey = (section: string, line: string): string =>
  `${section}#${Number(/#(\d+)/.exec(line)?.[1] ?? 0)}`;

const SECTION_RE = /^##\s+(.+?)\s*$/;

/** 把不该给 AI 看的东西摘下来。返回真正要送出去的那份 pack + 放回去要用的映射。 */
export const shieldPack = (packText: string): Shielded => {
  const out: string[] = [];
  const byEntry = new Map<string, string[]>();
  const spans: string[] = [];
  let section = '';
  let key: string | null = null;

  for (const line of packLines(packText)) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      section = sec[1];
      key = null;
      out.push(line);
      continue;
    }
    if (ENTRY_RE.test(line)) {
      key = entryKey(section, line);
      out.push(hideSpans(line, spans));
      continue;
    }
    // ⛔ 只摘**块里**的那几行。块外面出现 `note:` 的话（附件正文里抄了一句），
    //    它没有块可以放回去 —— 摘了就再也放不回原位，那时候宁可让它照旧送出去。
    //
    // ⚠️⚠️ 用**窄**的那条（只认 `💭 note:` / `ai note:`，Spool 自己渲染出来的两种），
    //    ⛔ 不许用宽的 `ANY_NOTE_RE`。真实语料上撞到过：〈宣发〉那份 pack 的**正文里**
    //    有一行 `↪ note: AI回复` —— 那是用户当初粘进来的原文的一部分，不是批注。
    //    宽的那条会把它从正文中间摘走，而放回去只放得到块尾 —— 一句正文就这样挪了位置。
    if (key !== null && (RENDERED_NOTE_RE.test(line) || DECORATION_LINE.test(line))) {
      const at = byEntry.get(key) ?? [];
      at.push(line);
      byEntry.set(key, at);
      continue;
    }
    out.push(hideSpans(line, spans));
  }

  return {
    text: out.join('\n'),
    held: { byEntry: [...byEntry].map(([k, lines]) => ({ key: k, lines })), spans },
  };
};

/** 把这一行里的 `==…==` 换成占位符，原文（连 `==`）记进 `spans`。 */
const hideSpans = (line: string, spans: string[]): string =>
  line.replace(HIGHLIGHT_RE, (whole) => {
    spans.push(whole);
    return SPAN_TOKEN(spans.length - 1);
  });

export interface Unshielded {
  text: string;
  /** ⛔ 块整个不见了、于是那几行没处放的。⚠️ **必须报出来** —— 静默丢掉批注，
   *  就是这一整条改动本来要根除的那件事换了个地方发生。 */
  orphaned: HeldLines[];
  /** ⛔ 占位符没回来的那几处高亮（原文，连 `==`）。同上，必须报。 */
  lostSpans: string[];
}

/** 把摘下来的东西按映射放回压缩稿。
 *
 *  ⚠️ 整行的那两类放回**它自己那一块的末尾**，顺序照原样。⛔ 不放到块外面去：
 *  一条批注安在不属于它的块上，比丢掉它更糟 —— 它会穿着别人的出处被下一个 AI 读到。
 *
 *  ⚠️ 占位符**没回来也不许硬塞**：那句话已经被模型改写过了，我们不知道该塞在哪儿。
 *  如实记进 `lostSpans`，界面照旧报「少了 N 处你划的重点」。 */
export const unshieldPack = (compressed: string, held: Held): Unshielded => {
  const want = new Map(held.byEntry.map((h) => [h.key, h.lines]));
  /** 压缩稿里出现过的块。⚠️ 出现过 = 那几行放回去了；没出现过 = 那一块整个不见了。 */
  const used = new Set<string>();
  const out: string[] = [];
  let section = '';

  // ⚠️⚠️ 放回**这一块的末尾**，不是头行下面。
  //
  // 渲染器把整块正文（可能好几行）当成**一个**元素推进去，批注和关系行推在它后面 ——
  // 所以在 pack 里它们落在这一块的**最后**。放回头行下面的话，一块多行正文的 pack
  // 会整个错位一次，而错位之后 diff 会把没变的正文报成「删了又加」。
  // ⚠️ 块尾那几行**间隔**要留在最后：空行、以及小节之间那条 `---`。
  //    批注插在它们后面就跑到下一节头上了 —— 真实语料上撞到过（〈宣发〉最后一块）。
  let key: string | null = null;
  const isGap = (l: string): boolean => l.trim() === '' || l.trim() === '---';
  const flush = (): void => {
    const lines = key === null ? undefined : want.get(key);
    if (key !== null) used.add(key);
    key = null;
    if (!lines) return;
    const tail: string[] = [];
    while (out.length > 0 && isGap(out[out.length - 1])) tail.push(out.pop()!);
    out.push(...lines, ...tail.reverse());
  };
  for (const line of packLines(compressed)) {
    const sec = SECTION_RE.exec(line);
    if (sec && PACK_SECTIONS.has(sec[1])) {
      flush();
      section = sec[1];
      out.push(line);
      continue;
    }
    if (ENTRY_RE.test(line)) {
      flush();
      const k = entryKey(section, line);
      // 重复编号只放回第一份 —— `compareByEntry` 配对留的也是第一份，两边要一致。
      key = used.has(k) ? null : k;
      used.add(k);
      out.push(line);
      continue;
    }
    out.push(line);
  }
  flush();

  const text = out.join('\n');
  const seen = new Set<number>();
  const restored = text.replace(SPAN_TOKEN_RE, (whole, n: string) => {
    const i = Number(n);
    const span = held.spans[i];
    if (span === undefined) return whole;
    seen.add(i);
    return span;
  });

  return {
    text: restored,
    orphaned: held.byEntry.filter((h) => !used.has(h.key)),
    lostSpans: held.spans.filter((_, i) => !seen.has(i)),
  };
};

/** ⭐ v24（R1 · 压缩稿写回库）：从一条 pack 条目的正文里，取出**属于块 `content` 的那部分**。
 *
 *  一条 pack 条目 = 块的 `content` + Spool 画在它下面的那几行（批注 / 关系 / 出处 / 更正指针）。
 *  写回库的时候只能写 `content` —— 把那几行一起写进去，下一次渲染会**再画一遍**，
 *  于是每压一次，块尾就多长出一份批注副本。
 *
 *  ⚠️ 传进来的 `held` 就是 `shieldPack` 从**这一块**摘下来的那几行（`unshieldPack` 原样接
 *  回块尾的也是它们）。按**原文**减，不按形状猜 —— ⛔ 用正则去认「像装饰的行」会误伤正文里
 *  真的以 `↩` 开头的一句话。 */
export const contentFromEntryBody = (body: string, held: readonly string[] = []): string => {
  const left = [...held];
  const kept = packLines(body).filter((l) => {
    const at = left.indexOf(l);
    if (at === -1) return true;
    left.splice(at, 1);
    return false;
  });
  return kept.join('\n').replace(/\s+$/, '');
};
