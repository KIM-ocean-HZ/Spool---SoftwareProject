// DESIGN_WORKBENCH §9.3 #4 — the caption under a running action.
//
// Ocean asked for 「像 vscode 的 ai 插件，正在打字的效果」, and the typing half is just the
// text deltas. This is the other half: when the run reaches for a tool, say which in words
// the user has any reason to recognise. The wire names do not qualify —
// `mcp__spool__find_similar_blocks` is Spool talking to itself.
//
// Everything unknown falls through to the bare name rather than to silence: a caption that
// says something slightly technical still tells you the run is alive, which is the whole
// complaint this answers (「等待中界面毫无变化」). Only the MCP prefix is stripped, because
// that part is never information.

/** The Chinese key for what a tool call is doing, for `t()`. */
export const toolCaption = (name: string): string => {
  switch (name) {
    // The read side — by far the most common thing a maintenance run does.
    case 'mcp__spool__get_pack':
    case 'mcp__spool__get_blocks':
      return '在读这个项目';
    case 'mcp__spool__get_digest':
    case 'mcp__spool__list_threads':
      return '在看所有项目';
    case 'mcp__spool__search_blocks':
    case 'mcp__spool__find_similar_blocks':
      return '在库里找';
    case 'mcp__spool__check_library':
    case 'mcp__spool__thread_health':
      return '在盘点';
    // The write side. Named apart from reading on purpose: what the AI puts in the library
    // is the thing the user most deserves to see happening.
    case 'mcp__spool__add_block':
      return '在存一块';
    case 'mcp__spool__propose_blocks':
      return '在排队等你过目';
    case 'mcp__spool__create_thread':
      return '在新建项目';
    case 'mcp__spool__set_thread_summary':
      return '在写摘要';
    // The one action that goes outside (DESIGN_FOLLOW_UP §2.5-3). Worth its own words:
    // "Spool never goes online" is the product's promise, and this is the user's own CLI
    // doing it, on an action they pressed.
    case 'WebSearch':
      return '在网上搜';
    case 'WebFetch':
      return '在读一个网页';
    default:
      return name.replace(/^mcp__spool__/, '');
  }
};
