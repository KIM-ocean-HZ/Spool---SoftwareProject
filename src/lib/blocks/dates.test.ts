import { describe, expect, it } from 'vitest';
import { daysUntil, findDates, noticeStage } from './dates';

// 旧账 §5-3. The detector decides which dates a user gets reminded about, so the cases that
// matter are the two failure directions: missing the deadline that was the whole point
// (Ocean's 〈申请规划〉 block), and firing on a number that was never a date.

const at = (y: number, m: number, d: number): number => new Date(y, m - 1, d).setHours(0, 0, 0, 0);
const FROM = at(2026, 8, 9); // the day the block was captured

describe('findDates', () => {
  it('reads the year-bearing shapes, Chinese and ISO alike', () => {
    expect(findDates('截止 2026-12-01 前交', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
    expect(findDates('deadline 2026/12/1', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
    expect(findDates('2026年12月1日截止', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
  });

  it('reads English month names, with or without a year', () => {
    expect(findDates('Due December 1, 2026', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
    expect(findDates('Due Dec 1', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
    expect(findDates('applications open Sept 15', FROM).map((h) => h.at)).toEqual([at(2026, 9, 15)]);
  });

  it('resolves a year-less date to the next time that day comes round', () => {
    // Later this year.
    expect(findDates('12月1日交材料', FROM).map((h) => h.at)).toEqual([at(2026, 12, 1)]);
    // Already past on the capture day, so it means next year — the case that makes a
    // January deadline captured in December work at all.
    expect(findDates('1月5日面试', at(2026, 12, 20)).map((h) => h.at)).toEqual([at(2027, 1, 5)]);
    // The capture day itself counts as "not yet past".
    expect(findDates('8月9日', FROM).map((h) => h.at)).toEqual([at(2026, 8, 9)]);
  });

  it('finds every date in a block that is nothing but deadlines (the 〈申请规划〉 case)', () => {
    const block = [
      'Cornell MEng — 2026-12-01',
      'MIT — 2027年1月5日',
      'CMU — Jan 15, 2027',
    ].join('\n');
    expect(findDates(block, FROM).map((h) => h.at)).toEqual([
      at(2026, 12, 1),
      at(2027, 1, 5),
      at(2027, 1, 15),
    ]);
  });

  it('keeps the literal and the line it sat on, for the reminder to show', () => {
    const [hit] = findDates('随手记的\nCornell 的截止日期是 2026-12-01，别忘了', FROM);
    expect(hit?.text).toBe('2026-12-01');
    expect(hit?.line).toBe('Cornell 的截止日期是 2026-12-01，别忘了');
  });

  it('does not read a date out of a longer run of digits', () => {
    expect(findDates('第 128/135 页', FROM)).toEqual([]);
    expect(findDates('版本 12/13/14', FROM)).toEqual([]);
  });

  it('rejects days that do not exist', () => {
    expect(findDates('2026-02-30', FROM)).toEqual([]);
    expect(findDates('2026年13月1日', FROM)).toEqual([]);
  });

  it('reports one reminder per day, not one per mention', () => {
    expect(findDates('2026-12-01 交，也就是 2026年12月1日', FROM)).toHaveLength(1);
  });

  it('does not let the bare 月/日 shape eat the tail of a full date', () => {
    // If the year-bearing branch did not win, `2026/8/13` would also yield August 13th
    // twice — once whole, once as `8/13`.
    expect(findDates('2026/8/13', FROM).map((h) => h.at)).toEqual([at(2026, 8, 13)]);
  });
});

// 「两个月，一个月，一周」(Ocean 2026-08-13). What these tests pin is not the three numbers but
// the comparison built on them: a date silenced at one stage has to come back at the next.
describe('noticeStage', () => {
  it('says nothing while the date is beyond two months', () => {
    expect(noticeStage(114)).toBeNull(); // his Cornell 12/1, as of 08-09
    expect(noticeStage(61)).toBeNull();
  });

  it('reports the tightest stage the date has entered', () => {
    expect(noticeStage(60)).toBe(60);
    expect(noticeStage(45)).toBe(60);
    expect(noticeStage(31)).toBe(60);
    expect(noticeStage(30)).toBe(30);
    expect(noticeStage(8)).toBe(30);
    expect(noticeStage(7)).toBe(7);
    expect(noticeStage(0)).toBe(7);
  });

  it('gives a dismissal somewhere to expire: each stage is tighter than the last', () => {
    // Silenced two months out, the row is due back when the date reaches one month, and again
    // at one week — that comparison is the whole mechanism, so it gets its own assertion.
    expect(noticeStage(20)!).toBeLessThan(noticeStage(45)!);
    expect(noticeStage(3)!).toBeLessThan(noticeStage(20)!);
  });
});

describe('daysUntil', () => {
  it('counts calendar days, so "today" is 0 rather than a fraction', () => {
    const now = new Date(2026, 7, 9, 23, 30).getTime(); // late on the 9th
    expect(daysUntil(at(2026, 8, 9), now)).toBe(0);
    expect(daysUntil(at(2026, 8, 10), now)).toBe(1);
    expect(daysUntil(at(2026, 8, 8), now)).toBe(-1);
  });
});
