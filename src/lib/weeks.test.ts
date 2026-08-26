import { describe, expect, it } from 'vitest';
import { endOfWeek, groupByWeek, startOfWeek } from './weeks';

// ⚠️ 这些测试全是**本地时区**的：`startOfWeek` 用的是本地日历，因为格子标题印的也是
// 本地日期。跨时区跑 CI 的那天，断言要跟着改的是「哪一天」，不是「周一为始」这条规矩。
const at = (iso: string): number => new Date(iso).getTime();

describe('startOfWeek', () => {
  it('周一为一周之始', () => {
    const mon = startOfWeek(at('2026-08-26T13:00:00')); // 周三
    expect(new Date(mon).getDay()).toBe(1);
    expect(new Date(mon).getDate()).toBe(24);
    expect(new Date(mon).getHours()).toBe(0);
  });

  it('⛔ 周日不是新一周的开始 —— 它属于前一格', () => {
    // 2026-08-30 是周日。周日起算会把它推进下一格，和它总结的那五个工作日分开。
    const sun = startOfWeek(at('2026-08-30T23:30:00'));
    expect(new Date(sun).getDate()).toBe(24);
  });

  it('周一本身就是自己那一周的开始', () => {
    const mon = startOfWeek(at('2026-08-24T00:00:00'));
    expect(new Date(mon).getDate()).toBe(24);
  });
});

describe('endOfWeek', () => {
  it('停在周日的最后一毫秒，⛔ 不跨进下一周', () => {
    const start = startOfWeek(at('2026-08-26T13:00:00'));
    const end = new Date(endOfWeek(start));
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(30);
    expect(startOfWeek(end.getTime())).toBe(start);
  });
});

describe('groupByWeek', () => {
  it('一周一格,一格装得下好几条', () => {
    // 自动跑一次 + 手动点两次,同一周 —— ⛔ 不是「一周一条」。
    const runs = [
      { id: 'a', ts: at('2026-08-24T09:00:00') },
      { id: 'b', ts: at('2026-08-26T01:20:00') },
      { id: 'c', ts: at('2026-08-25T21:32:00') },
      { id: 'old', ts: at('2026-08-08T11:16:00') },
    ];
    const weeks = groupByWeek(runs, (r) => r.ts);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].items.map((r) => r.id)).toEqual(['b', 'c', 'a']); // 新的在前
    expect(weeks[1].items.map((r) => r.id)).toEqual(['old']);
  });

  it('新的一周在前', () => {
    const weeks = groupByWeek(
      [{ ts: at('2026-08-08T11:00:00') }, { ts: at('2026-08-26T11:00:00') }],
      (r) => r.ts,
    );
    expect(weeks[0].start).toBeGreaterThan(weeks[1].start);
  });

  it('没有运行的那几周不占格子', () => {
    // 08-08 和 08-26 之间隔着两个整周,列表里不该冒出空格子。
    const weeks = groupByWeek(
      [{ ts: at('2026-08-08T11:00:00') }, { ts: at('2026-08-26T11:00:00') }],
      (r) => r.ts,
    );
    expect(weeks).toHaveLength(2);
  });

  it('一条都没有就是一格都没有', () => {
    expect(groupByWeek([], (r: { ts: number }) => r.ts)).toEqual([]);
  });
});
