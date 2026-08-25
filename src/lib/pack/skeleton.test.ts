import { describe, expect, it } from 'vitest';
import { isPackSkeletonLine, stripInventedSkeleton } from './skeleton';
import {
  EMPTY_LOG_LINE,
  EMPTY_PINNED_LINE,
  PACK_BEGIN,
  PACK_END,
  PINNED_SEE_ABOVE,
  SECTION_FILES,
  SECTION_LOG,
  SECTION_PINNED,
  staleOmittedLine,
  truncationMarker,
} from './templates';

describe('isPackSkeletonLine', () => {
  // ⚠️ 这一条钉的是「模板串改了、这边的正则没跟着改」那种漂移 —— 拿 `templates.ts` 的
  // **真输出**去喂，不是抄一份字面量。
  it('认得出 templates.ts 真的印出来的每一条骨架行', () => {
    for (const line of [
      PACK_BEGIN,
      PACK_END,
      SECTION_PINNED,
      SECTION_LOG,
      SECTION_FILES,
      EMPTY_PINNED_LINE,
      EMPTY_LOG_LINE,
      PINNED_SEE_ABOVE,
      staleOmittedLine(1),
      staleOmittedLine(2),
      staleOmittedLine(17),
      truncationMarker(0),
      truncationMarker(4213),
    ]) {
      expect(isPackSkeletonLine(line), line).toBe(true);
    }
  });

  // ⛔ 这张表只收 **pack 级**的行。块自己的渲染行由 `shieldPack` 按原文减掉，
  //    在这里再认一遍就是拿形状猜正文 —— 会误伤真的以 `↩` 开头的一句话。
  it('⛔ 不认块自己的那几行，也不认用户的散文', () => {
    for (const line of [
      '↩ cites: 某一块的预览',
      '📌 #12 [2026-07-02 14:30] 置顶的话',
      '🗜 #4 [2026-08-01 09:00] 压过的话',
      '    💭 note: 用户自己的批注',
      '## Pinned Blocks 这几个字出现在一句话中间的时候',
      '我今天读到 [... truncated] 这个说法',
      '',
      '   ',
    ]) {
      expect(isPackSkeletonLine(line), line).toBe(false);
    }
  });
});

describe('stripInventedSkeleton', () => {
  // ⭐ 真库里发生过的那一次：〈申请规划〉seq 21 / seq 24，压缩稿正文里多出一行
  //   `staleOmittedLine(2)`，而 `original_content` 干净。
  it('剔掉压缩发明出来的那一行', () => {
    const before = '选校名单第一版：NEU、UCSD、GT。';
    const after = `选校名单第一版：NEU、UCSD、GT。\n${staleOmittedLine(2)}`;
    const r = stripInventedSkeleton(before, after);
    expect(r.content).toBe('选校名单第一版：NEU、UCSD、GT。');
    expect(r.removed).toEqual([staleOmittedLine(2)]);
  });

  // ⛔⛔ 这一条是整个模块的判据：**按来历减，不按形状减**。用户的块里真的可能有一行
  //    `## Related Files & Links`，压缩把它带过来不是发明，是保真。
  it('⛔ 压缩前就有的那一行，一个字都不许动', () => {
    const before = `我的笔记\n${SECTION_FILES}\n- a.pdf`;
    const after = `我的笔记\n${SECTION_FILES}\n- a.pdf`;
    const r = stripInventedSkeleton(before, after);
    expect(r.content).toBe(after);
    expect(r.removed).toEqual([]);
  });

  it('压缩前有一份、压缩稿抄成两份 —— 只剔多出来的那一份', () => {
    const before = `${SECTION_LOG}\n正文`;
    const after = `${SECTION_LOG}\n正文\n${SECTION_LOG}`;
    const r = stripInventedSkeleton(before, after);
    expect(r.content).toBe(`${SECTION_LOG}\n正文`);
    expect(r.removed).toEqual([SECTION_LOG]);
  });

  it('什么都没剔的时候，压缩稿一个字节都不改（连排版都不碰）', () => {
    const after = '第一段\n\n\n第二段  ';
    expect(stripInventedSkeleton('原文', after)).toEqual({ content: after, removed: [] });
  });

  it('剔掉整行之后，原地留下的空档收一次', () => {
    const before = '上半句。\n\n下半句。';
    const after = `上半句。\n\n${PACK_END}\n\n下半句。`;
    expect(stripInventedSkeleton(before, after).content).toBe('上半句。\n\n下半句。');
  });

  it('整段都是骨架行的压缩稿，剔完是空的 —— 调用方据此不写这一块', () => {
    const r = stripInventedSkeleton('用户的原话', `${PACK_BEGIN}\n${PACK_END}`);
    expect(r.content.trim()).toBe('');
    expect(r.removed).toHaveLength(2);
  });
});
