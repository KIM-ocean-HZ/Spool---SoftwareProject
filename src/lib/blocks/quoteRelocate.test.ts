import { describe, expect, it } from 'vitest';
import { relocateQuote } from './quoteRelocate';

describe('relocateQuote', () => {
  it('压缩稿里一字不差还在 —— 库里不用改', () => {
    const before = '前面一段。GT MS-HCI 的暑期窗口不计入必修实习位。后面一段。';
    const after = 'GT MS-HCI 的暑期窗口不计入必修实习位。';
    expect(relocateQuote(before, after, 'GT MS-HCI 的暑期窗口不计入必修实习位。')).toEqual({
      kind: 'kept',
    });
  });

  // ⭐ T4 修的那一半：压缩顺手把全角标点换成半角（实测〈申请规划〉换掉了 46%）。
  // 折叠找得到 → 换成压缩稿里的那一句，让库里存的引文对得上现在的正文。
  it('只有标点被改写 —— 换成压缩稿里的那一句', () => {
    const before = '结论：不要把任何学校称为真正保底。';
    const after = '结论:不要把任何学校称为真正保底.';
    const fate = relocateQuote(before, after, '结论：不要把任何学校称为真正保底。');
    expect(fate).toEqual({ kind: 'rewritten', quote: '结论:不要把任何学校称为真正保底.' });
    // ⚠️ 折叠长度守恒，所以换过去的那一句和原来一样长 —— 这条性质塌了，取词就错。
    if (fate.kind === 'rewritten') {
      expect(fate.quote).toHaveLength('结论：不要把任何学校称为真正保底。'.length);
    }
  });

  // ⭐⭐ S3 要修的**就是这一条**：〈申请帮助〉#5 在 2026-08-24 11:20:51 被压缩，
  //   正文 362 → 134 字，措辞被改写。折叠救不了它 —— 变的是词，不是标点。
  it('措辞被压缩改写 —— 定不到，退回只报块号', () => {
    const before = '关于必修实习位这件事，需要说明的是：NEU 的 co-op 属于培养方案内的必修实习。';
    const after = 'NEU co-op 是必修实习。';
    expect(relocateQuote(before, after, 'NEU 的 co-op 属于培养方案内的必修实习')).toEqual({
      kind: 'lost',
    });
  });

  // ⛔⛔ 分开这一档是必须的：压缩前就对不上的引文，**不是这次压缩干的**。
  //    把它一起清掉，等于毁掉证据、还赖在压缩头上。
  it('⛔ 压缩前就对不上的，一个字都不许动', () => {
    expect(relocateQuote('现在的正文', '压完的正文', '一句谁也对不上的话')).toEqual({
      kind: 'untouched',
    });
  });

  it('空引文当没有', () => {
    expect(relocateQuote('正文', '压完', '')).toEqual({ kind: 'untouched' });
  });

  // ⛔ 不许 `.trim()` 或任何「顺手归一化一下就对上了」的放宽 —— 首尾空白也算。
  //    这一条钉的是：放宽之后测试照样绿，所以放宽必须在这儿变红。
  it('⛔ 首尾空白不归一化：差一个空格就是定不到', () => {
    const before = '句首 有空格的引文 句尾';
    const after = '句首有空格的引文句尾';
    expect(relocateQuote(before, after, ' 有空格的引文 ')).toEqual({ kind: 'lost' });
  });
});
