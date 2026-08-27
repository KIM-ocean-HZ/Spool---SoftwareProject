// 划词之后按 ⌘F，查的就是划中的那个词（2026-08-27, Ocean:「直接划词再点 cmd f 也需要能调出
// 查找，查找划取的词」）—— 这是每个编辑器和浏览器都有的那条路。
//
// 两处选区，不是一处：页面上划的（window.getSelection）和输入框里划的（textarea/input 有
// 自己的 selectionStart/End，⚠️ 它们的内容**不出现在** window.getSelection 里）。摊开编辑
// 那个面板就是一个 textarea，所以少了后半边，正在编辑的那一块反而划不动。

/** 太长的一段不是关键词，是一整段文字 —— 拿它去查只会一条都查不到，还把搜索框塞满。 */
const MAX_CHARS = 80;

/** 划中的那段文字够不够格当搜索词。空串 = 不预填，照常开一个空的搜索框（⛔ 不是报错）。
 *  单拎出来是为了能测：三条规则（空、跨行、太长）都是纯字符串判断，而取选区那一半要 DOM。 */
export const usableSearchTerm = (raw: string): string => {
  // 跨行的选区是「一段」不是「一个词」，和编辑器里的行为一致：不预填。
  if (raw.includes('\n')) return '';
  const text = raw.trim();
  return text.length === 0 || text.length > MAX_CHARS ? '' : text;
};

/** 当前选中的、可以拿去当搜索词的那段文字。 */
export const selectedSearchText = (): string => {
  const el = document.activeElement;
  let raw = '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const { selectionStart: from, selectionEnd: to } = el;
    if (from != null && to != null && to > from) raw = el.value.slice(from, to);
  }
  if (!raw) raw = globalThis.getSelection?.()?.toString() ?? '';
  return usableSearchTerm(raw);
};
