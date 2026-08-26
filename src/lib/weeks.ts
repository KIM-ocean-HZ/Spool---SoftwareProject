/**
 * 「一周」这条线 —— `W4`（Ocean 2026-08-26：「周回顾每周的新进展应该组合在一起，以周为单位
 * 呈现，现在周回顾是线性的」）。
 *
 * ⭐⭐ **这条线和自动回顾判「该跑了没有」用的不是同一种尺子，而那是 Ocean 拍的（甲）。**
 * `engineRuns.weeklyReviewDue` 判的是「距上一次**成功**满 7 天」——一根跟着上次成功走的
 * 滚动线，它划不出固定的格子：同一条运行，昨天属于「最近 7 天」，明天就不属于了。
 * 而「以周为单位呈现」要的正是固定的格子。
 *
 * 所以两边分工：**这里管看得见的分组（自然周），`weeklyReviewDue` 管花钱的时机（滚动 7 天）。**
 * ⚠️ 代价是「这一周」那一格可能空着、而自动回顾还没到点 —— 界面因此必须自己把话说明白，
 * 见 `ReviewBoard` 上那句「下次自动回顾：还有 N 天」。⛔ 别让用户从一个空格子里去猜。
 *
 * ⚠️ 周一为一周之始。中英文场合里「这一周」都更常从周一算起，而且它让「周末补跑的那一次」
 * 和它总结的那五个工作日待在同一格里 —— 周日起算会把周日那次跑推进下一格。
 */

/** 这个时刻所在那一周的**周一零点**（本地时区）。 */
export const startOfWeek = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // getDay(): 周日 = 0。周一为始 ⇒ 周日要退 6 天，不是 0 天。
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
};

/** 那一周的最后一刻（周日 23:59:59.999），只用来印标题上的日期范围。
 *  ⚠️ 不是 `start + 7 天`：夏令时的那两周只有 167 或 169 小时，加满 7 天会跨进邻周。 */
export const endOfWeek = (weekStart: number): number => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7);
  return d.getTime() - 1;
};

export interface Week<T> {
  /** 周一零点，也是这一组的 key。 */
  start: number;
  items: T[];
}

/**
 * 按自然周分组，**新的在前**，组内也是新的在前。
 *
 * ⚠️ 一周里会有好几条：自动跑一次 + 手动点几次 + 失败重试，都落在同一张表里。
 * ⛔ 所以这里是「一周一格」，不是「一周一条」。
 * ⚠️ 没有运行的那几周**不占格子** —— 空格子除了把列表拉长什么也没说。
 */
export const groupByWeek = <T>(items: readonly T[], at: (item: T) => number): Week<T>[] => {
  const byStart = new Map<number, T[]>();
  for (const item of items) {
    const key = startOfWeek(at(item));
    const bucket = byStart.get(key);
    if (bucket) bucket.push(item);
    else byStart.set(key, [item]);
  }
  return [...byStart.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([start, group]) => ({ start, items: [...group].sort((a, b) => at(b) - at(a)) }));
};

/**
 * 自动回顾的周期 —— ⚠️ **和上面那把尺子不是一回事**，这是「距上次成功多久算到点」，
 * 判它的是 `engineRuns.weeklyReviewDue`。放在这个文件里，是为了让两把尺子并排看得见。
 *
 * ⛔ 界面上印「还有 N 天」和自动那条判「该跑了没有」必须读同一个常量：两个 7 天写在
 * 两个文件里，哪天有人改了一个，用户是发现不了的。
 */
export const WEEKLY_REVIEW_PERIOD_MS = 7 * 24 * 60 * 60_000;
