// 手动排版三档 —— 标题 / 正文 / 斜体（2026-08-27，Ocean）。
//
// 背景：在这之前，块正文的**第一段会被自动加重**（`withSpine`，contentRuns 里那个 spine）。
// 那是渲染器替用户做的决定 —— 用户没写过任何记号，字却粗了，而且想让它不粗做不到。
// Ocean 要去掉这个默认，换成他自己点：标题比正文大一点，正文和斜体一样大。
//
// ⛔ **不新开数据库字段**（Ocean 明说的）。块正文本来就是 markdown（lib/blocks/markdown.ts
// 认 `#`，contentRuns 认 `*…*`），所以这三档就是往正文里写那两个记号 —— 存进去的还是
// 一段字，AI 拿到的 pack 里也还是一段字，⛔ 没有第二套「格式」需要谁去同步。
//
// ⚠️ 尺寸不在这儿定，在 tokens.css：标题是 `1.13em`（MarkdownContent 的 HEADING_CLS），
// 而那个 em 是相对 `--block-text` 的 ⇒ 用户换大中小三档，标题自己跟着走。
// ⛔ 别在这里或那里写死 px。
//
// 纯函数：进去一段字加一个选区，出来一段字加一个新选区。⛔ 不碰 DOM、不碰 store ——
// 这样「选区跨了两行会怎样」这类事才测得到，而不是要在编辑框里用手试。

export type BlockFormat = 'heading' | 'body' | 'italic';

export interface FormatResult {
  text: string;
  /** 改完之后光标 / 选区落在哪儿。⚠️ 一定要给：不给的话浏览器会把光标扔到末尾，
   *  而用户刚刚才划中那句话。 */
  selectionStart: number;
  selectionEnd: number;
}

/** `# ` / `## ` … 那个前缀。⚠️ 和 markdown.ts 的 HEADING 认的是同一个形状。 */
const HEADING_PREFIX = /^(#{1,6})[ \t]+/;

/** 选区所在的那几行的 [起, 止)。⚠️ 排版是**整行**的事：光标停在一行中间按「标题」，
 *  要变的是这一行，⛔ 不是从光标那个字开始。 */
const lineSpan = (text: string, start: number, end: number): { from: number; to: number } => {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  return { from, to: nl === -1 ? text.length : nl };
};

/** 一行里的斜体记号全部去掉（`*abc*` → `abc`）。⚠️ 只认成对的，⛔ 落单的 `*` 是用户的字。 */
const stripItalic = (line: string): string => line.replace(/\*([^*\n]+)\*/g, '$1');

/**
 * 把 `format` 套在 `text` 的选区上。
 *
 * - `heading`：整行前面加 `# `。已经是标题就**只换级别**，⛔ 不叠成 `## #`。
 * - `body`：把这几行的 `#` 和 `*…*` 都摘掉 —— 「正文」就是「什么记号都没有」。
 * - `italic`：把选中的那段包成 `*…*`；没划选区就包整行。已经是斜体就取消。
 */
export const applyBlockFormat = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: BlockFormat,
): FormatResult => {
  const { from, to } = lineSpan(text, selectionStart, selectionEnd);
  const before = text.slice(0, from);
  const after = text.slice(to);
  const chunk = text.slice(from, to);

  if (format === 'heading') {
    const lines = chunk.split('\n').map((line) => {
      const bare = stripItalic(line.replace(HEADING_PREFIX, ''));
      // 空行不给它一个孤零零的 `#`：那会在读的那一面画出一个空标题。
      return bare.trim().length === 0 ? line : `# ${bare}`;
    });
    const next = lines.join('\n');
    return {
      text: before + next + after,
      selectionStart: from,
      selectionEnd: from + next.length,
    };
  }

  if (format === 'body') {
    const next = chunk
      .split('\n')
      .map((line) => stripItalic(line.replace(HEADING_PREFIX, '')))
      .join('\n');
    return {
      text: before + next + after,
      selectionStart: from,
      selectionEnd: from + next.length,
    };
  }

  // italic —— 这一档跟着**选区**走（划中半句就只斜半句），没划才退回整行。
  const hasSelection = selectionEnd > selectionStart;
  const targetFrom = hasSelection ? selectionStart : from;
  const targetTo = hasSelection ? selectionEnd : to;
  const target = text.slice(targetFrom, targetTo);
  if (target.trim().length === 0) {
    return { text, selectionStart, selectionEnd };
  }

  // 已经是斜体 → 取消。⚠️ 认两种：选区正好是 `*abc*`，或者选中的是 `*abc*` 里面的 `abc`。
  const wrappedInside =
    text.slice(targetFrom - 1, targetFrom) === '*' && text.slice(targetTo, targetTo + 1) === '*';
  if (/^\*[^*\n]+\*$/.test(target)) {
    const inner = target.slice(1, -1);
    return {
      text: text.slice(0, targetFrom) + inner + text.slice(targetTo),
      selectionStart: targetFrom,
      selectionEnd: targetFrom + inner.length,
    };
  }
  if (wrappedInside) {
    return {
      text: text.slice(0, targetFrom - 1) + target + text.slice(targetTo + 1),
      selectionStart: targetFrom - 1,
      selectionEnd: targetFrom - 1 + target.length,
    };
  }

  // ⚠️ 标题行上按斜体：先把 `#` 摘掉。一行不能既是标题又是斜体 —— 三档是互斥的，
  // 这也正是 Ocean 说的「标题 / 正文 / 斜体」三选一。
  const headed = HEADING_PREFIX.exec(text.slice(from, to));
  if (headed && !hasSelection) {
    const bare = chunk.replace(HEADING_PREFIX, '');
    const next = `*${bare}*`;
    return {
      text: before + next + after,
      selectionStart: from,
      selectionEnd: from + next.length,
    };
  }

  const next = `*${target}*`;
  return {
    text: text.slice(0, targetFrom) + next + text.slice(targetTo),
    selectionStart: targetFrom,
    selectionEnd: targetFrom + next.length,
  };
};

/** 光标那一行现在是哪一档 —— 三个按钮里哪一个亮着。 */
export const formatAt = (text: string, selectionStart: number, selectionEnd: number): BlockFormat => {
  const { from, to } = lineSpan(text, selectionStart, selectionEnd);
  const line = text.slice(from, to);
  if (HEADING_PREFIX.test(line)) return 'heading';
  const selected = selectionEnd > selectionStart ? text.slice(selectionStart, selectionEnd) : line;
  if (/^\*[^*\n]+\*$/.test(selected.trim())) return 'italic';
  return 'body';
};
