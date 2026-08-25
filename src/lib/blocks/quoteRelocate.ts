// S3（2026-08-24，Ocean 选乙）—— **压缩不许悄悄打掉引文。**
//
// 已经发生了：〈申请帮助〉#11 那条更正的 `corrected_quote`，在 2026-08-24 11:20:51 被一次
// 压缩打断 —— 目标块正文从 362 字压成 134 字，那句引文对得上 `original_content`、
// 对不上现在的 `content`。屏幕上什么都不划，也不报错。
//
// ⭐ `quoteFold.ts` 的头注释 08-23 就把这条路写出来了。**T4 修的是标点那一半**
// （真库 seq 23 / seq 25 就是靠折叠救回来的），**压缩改写措辞这一半没修** ——
// 折叠救不了它：变的是词，不是标点。
//
// ⛔ **两条不许**（`schema.sql` 和 `WORKPLAN §2.S3` 上都写着理由）：
//  ① 不许把引文改成偏移量 —— 偏移会在用户改一个字之后**悄悄**指错，
//     「指错地方比不指更糟」；
//  ② 不许 `.trim()` 或任何「顺手归一化一下就对上了」的放宽 —— 要归一化只走
//     `quoteFold.ts` 那一套（而它必须和 `api_engine.rs::fold_char` 逐项一致）。
//
// ⭐ **所以这里没有模糊匹配。** 找得到就换成压缩稿里的那一句，找不到就退回只报块号 ——
// 退回是安全的（pack 和界面都还说得出「#N 里有一处被更正了」，只是不划哪一句），
// 而猜一句划上去是不安全的。这条不对称就是不做近似匹配的全部理由。

import { locateQuote, quoteIsInBlock } from './quoteFold';

export type QuoteFate =
  /** 压缩前就对不上 —— ⛔ **不是这次压缩干的，别动它**。
   *  （分开这一档是必须的：把本来就断的引文清掉，等于毁掉证据、还赖在压缩头上。） */
  | { kind: 'untouched' }
  /** 压缩稿里一字不差还在。库里不用改。 */
  | { kind: 'kept' }
  /** 还在，但标点被压缩改写过 —— 换成压缩稿里的那一句，让存的引文对得上现在的正文。 */
  | { kind: 'rewritten'; quote: string }
  /** 找不回来 —— 退回「只报块号」：清掉引文，关系留着，并且**在界面上说一句**。 */
  | { kind: 'lost' };

/** 压完，这一条更正的引文该怎么办。
 *
 *  `before` = 这一块压缩前的正文，`after` = 压缩稿，`quote` = 库里存着的 `corrected_quote`。
 *
 *  ⚠️ `after.slice(at, at + quote.length)` 取得准，靠的是折叠**长度守恒**
 *  （`quoteFold.ts`：表里每一项都是单码元 → 单码元）。⛔ 那条性质塌了，这一行就错。 */
export const relocateQuote = (before: string, after: string, quote: string): QuoteFate => {
  if (quote === '') return { kind: 'untouched' };
  if (!quoteIsInBlock(before, quote)) return { kind: 'untouched' };
  const at = locateQuote(after, quote);
  if (at === -1) return { kind: 'lost' };
  const literal = after.slice(at, at + quote.length);
  return literal === quote ? { kind: 'kept' } : { kind: 'rewritten', quote: literal };
};
