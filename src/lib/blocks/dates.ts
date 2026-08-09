// 旧账 §5-3 — dates that live inside a block's TEXT.
//
// The debt, in Ocean's words: 「块正文里的截止日期没人管」. `threads.deadline` covers the date a
// user set on a project; nothing covered the date sitting in the middle of a captured block —
// and his 〈申请规划〉 has exactly that (a block full of Cornell application deadlines). It got
// bad enough that 周回顾's prompt now carries an explicit ban on mistaking one for the other:
// a prompt can stop the AI confusing them, but it cannot make anyone remember the date.
//
// ⚠️ Ocean 2026-08-13 chose 「只认写死的日期」 over also reading 「下周五」/「月底」: a relative
// phrase has to be resolved against the day the block was captured, which quietly turns into
// the wrong day once the block is a few weeks old — and a reminder on the wrong day is worse
// than no reminder. So: literal dates only.

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Longest first so `September` is never read as `Sep` + stray letters.
const MONTH_NAMES =
  'january|february|september|december|november|october|august|march|april|june|july|sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

// One pass, three shapes, tried in this order at every position — the year-bearing form has
// to win before the bare 月/日 form can claim the tail of `2026/8/13`.
//   1–3  2026-08-13 · 2026/8/13 · 2026年8月13日
//   4–5  8月13日 · 8/13            (no year — see resolveYear)
//   6–8  Aug 13 · August 13, 2026
const DATE_RE = new RegExp(
  [
    String.raw`(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?`,
    String.raw`(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[日号]?`,
    String.raw`(${MONTH_NAMES})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?`,
  ].join('|'),
  'gi',
);

export interface DateHit {
  /** Local midnight of the day named, ms epoch. */
  at: number;
  /** The literal exactly as the user wrote it — the reminder shows this, not a reformat. */
  text: string;
  /** The line it sits on, trimmed, so the reminder can say what the date was about. */
  line: string;
}

const localMidnight = (y: number, m: number, d: number): number | null => {
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  // Rejects 2月30日 and friends: JS rolls those over, so the round-trip catches them.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
};

/** A date written without a year means the next time that day comes round — counted from the
 *  day the block was written, which is the only anchor a captured line has. */
const resolveYear = (m: number, d: number, from: number): number | null => {
  const ref = new Date(from);
  ref.setHours(0, 0, 0, 0);
  const thisYear = localMidnight(ref.getFullYear(), m, d);
  if (thisYear !== null && thisYear >= ref.getTime()) return thisYear;
  return localMidnight(ref.getFullYear() + 1, m, d);
};

/** A match touching a digit or another slash is part of a longer run, not a date:
 *  `128/135` is a page, `12/13/14` is a version, `…/2026-12-01/` is a URL path. */
const runsOn = (c: string | undefined): boolean =>
  c !== undefined && ((c >= '0' && c <= '9') || c === '/');

/** The trimmed line a match sits on, capped so a reminder row stays one line. */
const lineAround = (content: string, index: number): string => {
  const start = content.lastIndexOf('\n', index) + 1;
  const nl = content.indexOf('\n', index);
  const line = content.slice(start, nl === -1 ? content.length : nl).trim();
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
};

/**
 * Every literal date in `content`, in the order it appears.
 *
 * `from` anchors year-less dates (see resolveYear) — pass the block's creation time.
 *
 * ⚠️ This deliberately over-matches: 「第 8/13 页」 is a date to this function. Ocean's answer to
 * that (2026-08-13) was to keep the detector simple and give every reminder a 「别再提这条」,
 * rather than ask him to confirm each date and have the feature do nothing until he does.
 * The one thing guarded here is a run of digits — `128/135` is not August 13th.
 */
export const findDates = (content: string, from: number): DateHit[] => {
  const out: DateHit[] = [];
  const seen = new Set<number>();
  DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(content)) !== null) {
    if (runsOn(content[m.index - 1]) || runsOn(content[m.index + m[0].length])) continue;

    let at: number | null = null;
    if (m[1] !== undefined) {
      at = localMidnight(Number(m[1]), Number(m[2]), Number(m[3]));
    } else if (m[4] !== undefined) {
      at = resolveYear(Number(m[4]), Number(m[5]), from);
    } else if (m[6] !== undefined) {
      const month = MONTHS[m[6].toLowerCase()]!;
      const day = Number(m[7]);
      at = m[8] !== undefined ? localMidnight(Number(m[8]), month, day) : resolveYear(month, day, from);
    }
    if (at === null || seen.has(at)) continue;
    seen.add(at);
    out.push({ at, text: m[0].trim(), line: lineAround(content, m.index) });
  }
  return out;
};

/** Whole days from `now` to `at`, both taken at local midnight (same rule as dueInDays). */
export const daysUntil = (at: number, now: number): number => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((at - today.getTime()) / 86_400_000);
};
