// Plain-text Markdown template per PLAN_EN.md §9.5. Keep it simple — the user will paste
// this into a chat tool, email, or document, so we err on the side of "obvious to a human
// reader scanning quickly," not "clever formatting."

export const PACK_HEADER = (title: string, dateStr: string, entryCount: number): string =>
  `# 项目：${title || '（无标题）'}\n` +
  `截至 ${dateStr}，共 ${entryCount} 条记录。\n`;

export const SECTION_KEY = '## 关键信息';
export const SECTION_LOG = '## 完整记录';
export const SECTION_FILES = '## 相关文件与链接';

export const EMPTY_DIGEST_LINE = '（暂无置顶的关键信息）';
export const EMPTY_LOG_LINE = '（暂无记录）';
