import { describe, it, expect } from 'vitest';
import { relationAlreadySettled, wouldOverwriteRelation } from './staleGuards';
import type { Block } from '@/lib/db/blocks';

/** 只造这两道闸看得见的那几个字段。 */
const block = (id: string, refBlockId: string | null = null, refKind: Block['refKind'] = null): Block =>
  ({ id, seq: 1, refBlockId, refKind, threadId: 't', kind: 'text', content: '', annotation: null,
     annotationBy: null, refThreadId: null, source: null, pinned: false, createdAt: 0,
     staleAt: null, sourceUrl: null, retrievedAt: null, recheckAfter: null,
     correctedQuote: null, originalContent: null, compressedAt: null });

const OLD = block('old');

describe('relationAlreadySettled —— 库里已经有这条关系，就别再问一遍', () => {
  it('新块带着 corrects 指着旧块 = 已经决定过', () => {
    expect(relationAlreadySettled(OLD, block('new', 'old', 'corrects'))).toBe(true);
  });

  it('新块带着 supersedes 指着旧块 = 也已经决定过', () => {
    expect(relationAlreadySettled(OLD, block('new', 'old', 'supersedes'))).toBe(true);
  });

  // ⛔⛔ 这一条是这个文件存在的理由（2026-08-24 第六轮 0d）。
  // `cites` 存的是 refBlockId 有值 + refKind 是 null。按 refKind 判的话它漏过去，
  // 用户于是被问一件他自己已经连过线的事。
  it('⛔ 新块用 cites 指着旧块（refKind 是 null）—— 同样是已经决定过', () => {
    expect(relationAlreadySettled(OLD, block('new', 'old', null))).toBe(true);
  });

  it('指着别的块 = 没决定过这一条，该拿出来问', () => {
    expect(relationAlreadySettled(OLD, block('new', 'somewhere-else', 'corrects'))).toBe(false);
  });

  it('谁也没指 = 该问', () => {
    expect(relationAlreadySettled(OLD, block('new'))).toBe(false);
  });

  it('有一块不在了 = 不当成已决定（后面那道闸会拦）', () => {
    expect(relationAlreadySettled(undefined, block('new', 'old', 'corrects'))).toBe(false);
    expect(relationAlreadySettled(OLD, undefined)).toBe(false);
  });
});

describe('wouldOverwriteRelation —— 写下去会冲掉新块上已有的那条', () => {
  // ⛔⛔ 第六轮实测那 30 次里，模型提的 6 条有 4 条正好是这个形状：
  // UCLA #10 指着「申请帮助 #12」，refKind 是 null。按 refKind 判，这道闸不触发，
  // setBlockSupersession 就把那条引用**悄悄改写掉了，界面不报错**。
  it('⛔ 新块用 cites 指着别的块（refKind 是 null）—— 必须拒绝', () => {
    expect(wouldOverwriteRelation(OLD, block('new', 'another-block', null))).toBe(true);
  });

  it('新块带着 corrects 指着别的块 —— 拒绝', () => {
    expect(wouldOverwriteRelation(OLD, block('new', 'another-block', 'corrects'))).toBe(true);
  });

  it('新块谁也没指 —— 放行（没有东西会被冲掉）', () => {
    expect(wouldOverwriteRelation(OLD, block('new'))).toBe(false);
  });

  it('新块正指着这个旧块 —— 放行（那一条在上一道闸就被摘走了）', () => {
    expect(wouldOverwriteRelation(OLD, block('new', 'old', 'corrects'))).toBe(false);
  });

  it('新块不在了 —— 不由这道闸报（调用处另有一句「这两块里有一块已经不在了」）', () => {
    expect(wouldOverwriteRelation(OLD, undefined)).toBe(false);
  });

  // ⭐ 两道闸合起来必须是**互斥且穷尽**的：一条提议要么被摘走、要么被拒、要么放行，
  // ⛔ 不许出现「既没摘走也没拒、但会冲掉东西」的缝 —— 那正是 0d 抓到的那条缝。
  it('⭐ 新块只要指着谁，就一定被这两道闸之一挡住', () => {
    for (const kind of ['corrects', 'supersedes', null] as const) {
      const pointsAtOld = block('new', 'old', kind);
      const pointsElse = block('new', 'elsewhere', kind);
      expect(relationAlreadySettled(OLD, pointsAtOld) || wouldOverwriteRelation(OLD, pointsAtOld)).toBe(true);
      expect(relationAlreadySettled(OLD, pointsElse) || wouldOverwriteRelation(OLD, pointsElse)).toBe(true);
    }
  });
});
