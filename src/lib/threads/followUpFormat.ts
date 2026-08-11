// How the follow-up brief numbers itself as it is typed (Ocean 2026-08-11: 「跟进内容输入格式化，
// 用户打字时自动显示 1. 2. 3. 的数字，并且自动换行，保证每一点之间都有空行」).
//
// Why this is a pure function in its own file rather than a handler inside the panel: the
// rules below are the kind that go wrong at the edges (an Enter in the middle of the text, a
// selection being replaced, the very first character), and a function that takes a string and
// a caret can be tested for all of them in a way a textarea cannot.
//
// ⚠️ It formats WHILE TYPING and never reformats what is already there. Renumbering the whole
// box after every edit is the obvious next idea and it is the wrong one: the brief is prose the
// user (or a drafting AI) may have pasted in whole, and a formatter that rewrites the text
// under the cursor takes the document away from the person writing it.

/** Points already opened before the caret — the number the next one gets. */
const countPoints = (before: string): number => (before.match(/^\d+\.\s/gm) ?? []).length;

/** The blank line between points is the requirement, not decoration: 「保证每一点之间都有空行」. */
const opener = (n: number): string => `\n\n${n}. `;

/**
 * Enter inside the brief: close this point and open the next one, numbered.
 *
 * Returns the whole new value plus where the caret goes, because a textarea's caret does not
 * survive React replacing the value — the caller has to put it back.
 */
export const onEnter = (
  text: string,
  start: number,
  end: number,
): { text: string; caret: number } => {
  const before = text.slice(0, start);
  const insert = opener(countPoints(before) + 1);
  return { text: before + insert + text.slice(end), caret: start + insert.length };
};

/**
 * The first character typed into an empty brief opens point 1.
 *
 * Returns null when there is nothing to do, which is every other keystroke — the caller keeps
 * its plain onChange path, so nothing is rewritten once the box has content.
 */
export const onFirstChar = (previous: string, next: string): { text: string; caret: number } | null => {
  if (previous.length > 0 || next.length !== 1) return null;
  // A digit could be the user typing their own 「1.」; leave that alone rather than making 「1. 1」.
  if (/[\d\s]/.test(next)) return null;
  return { text: `1. ${next}`, caret: 3 + next.length };
};
