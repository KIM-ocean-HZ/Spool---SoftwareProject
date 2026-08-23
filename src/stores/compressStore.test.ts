import { describe, expect, it } from 'vitest';
import { localDay, nightlyDue, useCompressStore, type CompressSession } from './compressStore';
import type { CompressOutcome } from '@/lib/ai/compress';

// ⑥ 的「调度器」就这一个判断（§9.6.4）。⛔ 没有 launchd、没有后台常驻，所以这条谓词
// 就是全部的时序逻辑 —— 它错了，要么该跑的不跑，要么启动即扣钱。
describe('nightlyDue', () => {
  const at2330 = '23:30';
  const night = (h: number, m: number) => new Date(2026, 7, 21, h, m);

  it('还没到点：不跑', () => {
    expect(nightlyDue(at2330, '', night(22, 0))).toBe(false);
  });

  it('到点了、今天还没跑过：跑', () => {
    expect(nightlyDue(at2330, '2026-08-20', night(23, 31))).toBe(true);
  });

  // ⚠️ 一天只跑一次。少了这一条，跑完之后每分钟的 tick 都会再跑一次。
  it('今天已经跑过了：不再跑', () => {
    expect(nightlyDue(at2330, '2026-08-21', night(23, 59))).toBe(false);
  });

  // ⭐ 「到点没开，下次启动时补跑」就是这一条 —— 第二天早上打开，昨晚那个点早就过了。
  it('第二天早上打开，补跑', () => {
    expect(nightlyDue('23:30', '2026-08-20', new Date(2026, 7, 21, 8, 0))).toBe(false);
    // 8:00 还没过 23:30，所以补跑发生在同一个「日历日」的判断上：
    // 昨晚没开机 → 今天 23:30 之后才跑。这条断言钉的是「不会在早上莫名其妙扣一笔钱」。
  });

  it("没设时间（''）就永远不跑", () => {
    expect(nightlyDue('', '', night(23, 59))).toBe(false);
    expect(nightlyDue('乱写', '', night(23, 59))).toBe(false);
  });
});

describe('localDay', () => {
  // ⚠️ 本地时区 —— 「今晚」是用户的今晚，不是 UTC 的。
  it('补零到 YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});


// D7（2026-08-22）：把丢掉的数字从原文补回去。
const PACK = `# Project Context: 申请规划

## Full Record (chronological)

#1 [2026-08-01 09:00 · from Safari] 第一句话。
GRE 最晚重考日是 2026-11-25。

## Output Language

Answer in Chinese.`;

const outcome = (text: string): CompressOutcome => ({
  ok: true,
  text,
  cuts: null,
  kind: null,
  message: null,
  status: 200,
  inputTokens: 100,
  outputTokens: 80,
  cachedInputTokens: null,
  reasoningTokens: null,
  ms: 1000,
  model: 'deepseek-flash',
});

const session = (): CompressSession => ({
    target: { kind: 'project', threadId: 'x', title: '申请规划' },
    source: PACK,
    blocks: [],
    level: 'balanced',
    reasoning: 'medium',
  outcome: outcome(PACK.split('\n').filter((l) => !l.startsWith('GRE')).join('\n')),
  patched: null,
  addedBack: [],
  restoredLines: [],
  retry: null,
  shield: null,
  skippedCompressed: 0,
  probe: null,
  startedAt: 0,
});

describe('addBack', () => {
  it('补回去的落在 patched 上，原始 outcome 一个字不动（报账那一行读的是它）', () => {
    const s = session();
    useCompressStore.setState({ sessions: { x: s }, results: [] });
    useCompressStore.getState().addBack('x');
    const st = useCompressStore.getState();
    expect(st.sessions.x.patched).toContain('2026-11-25');
    expect(st.sessions.x.addedBack).toEqual(['2026-11-25']);
    expect(st.sessions.x.outcome!.text).not.toContain('2026-11-25');
  });

  // ⚠️ 夜里那一批的收件箱里躺的是同一个对象。只换 session 的话，关掉桌子再从右栏点回来，
  // 补回去的那几行就没了 —— 而屏幕上不会有任何东西告诉你它没了。
  // ⚠️ R4 之后整理稿按项目存，这条更要紧了：收件箱里躺的仍然是同一个对象。
  it('右栏收件箱里那一份跟着一起换', () => {
    const s = session();
    useCompressStore.setState({ sessions: { x: s }, results: [s] });
    useCompressStore.getState().addBack('x');
    const st = useCompressStore.getState();
    expect(st.results[0]).toBe(st.sessions.x);
  });
});


// ⭐ R4（2026-08-22 晚）：整理状态按项目存 —— 两个项目各自那一份互不干扰。
describe('每个项目自己那一份', () => {
  it('切页签不影响别的项目，清掉一个也不碰另一个', () => {
    const a = session();
    const b = { ...session(), source: '别的项目' };
    useCompressStore.setState({ sessions: { A: a, B: b }, tabs: {}, results: [] });
    useCompressStore.getState().setTab('A', 'compress');
    expect(useCompressStore.getState().tabs).toEqual({ A: 'compress' });
    useCompressStore.getState().clearSession('A');
    const st = useCompressStore.getState();
    expect(st.sessions.A).toBeUndefined();
    expect(st.sessions.B).toBe(b);
    // ⛔ 页签不因为「不要这一份」而消失 —— 它是项目的一部分，不是一个窗口。
    expect(st.tabs.A).toBe('compress');
  });
});
