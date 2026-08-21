import { describe, expect, it } from 'vitest';
import { localDay, nightlyDue } from './compressStore';

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
