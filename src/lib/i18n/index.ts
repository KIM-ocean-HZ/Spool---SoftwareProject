// UI language switch (2026-07-07, Ocean-requested; relaxes PLAN §18 rule 11 from
// "Chinese only" to "Chinese default, English switchable").
//
// Design: the CHINESE STRING IS THE KEY. zh returns the key itself; en looks it up in
// the map below and falls back to the Chinese source when a translation is missing —
// so an unconverted or newly-added string degrades to Chinese instead of a key token,
// and there is exactly one source of truth for the zh copy (the call site).
//
// Interpolation uses {name} slots: t('已复制 {n} 个块', { n: 3 }).
//
// React components subscribe via useT() so a language switch re-renders; stores /
// toasts / non-React code call t() directly (they read the store imperatively — a
// transient toast produced mid-switch may use the previous language, which is fine).

import { useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

export type Language = 'zh' | 'en';

const interpolate = (s: string, vars?: Record<string, string | number>): string =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

export const t = (key: string, vars?: Record<string, string | number>): string => {
  const lang = useSettingsStore.getState().language;
  const s = lang === 'en' ? (EN[key] ?? key) : key;
  return interpolate(s, vars);
};

// Reactive variant for components: re-renders on language change.
export const useT = (): typeof t => {
  const lang = useSettingsStore((s) => s.language);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const s = lang === 'en' ? (EN[key] ?? key) : key;
      return interpolate(s, vars);
    },
    [lang],
  );
};

export const useLanguage = (): Language => useSettingsStore((s) => s.language);

// BCP-47 locale for Intl date formatting (day dividers, block timestamps). Callers
// sit inside components that already re-render on language change via useT.
export const dateLocale = (): string =>
  useSettingsStore.getState().language === 'en' ? 'en-US' : 'zh-CN';

// ---------------------------------------------------------------------------------------
// English dictionary. Keys are the verbatim Chinese strings used at call sites.
// ---------------------------------------------------------------------------------------
const EN: Record<string, string> = {
  // App / shell
  '加载中…': 'Loading…',
  '数据库初始化失败': 'Database initialization failed',
  '打开 DevTools（右键 → Inspect）→ Console 看完整堆栈。':
    'Open DevTools (right-click → Inspect) → Console for the full stack trace.',
  '界面出错了': 'Something went wrong',
  '重新加载': 'Reload',

  // Input Monitoring onboarding banner (2026-07-07; stale-grant recovery 2026-07-08)
  '双击 ⌥ 捕捉需要「输入监听」权限 — 授权后完全退出 Spool（托盘图标 → 退出）再重新打开':
    'Double-tap ⌥ capture needs the Input Monitoring permission — after granting, fully quit Spool (tray icon → Quit) and reopen',
  '已授权 — 完全退出 Spool（托盘图标 → 退出）并重新打开后生效':
    'Granted — takes effect after fully quitting Spool (tray icon → Quit) and reopening',
  '已授权却仍看到本条？旧授权可能已失效：在系统设置的列表中选中 Spool 按 − 删除，完全退出并重新打开 Spool，允许新弹窗后再退出重启一次。':
    'Granted but still seeing this? The old grant may be stale: select Spool in the System Settings list and press − to remove it, fully quit and reopen Spool, allow the new prompt, then quit and restart once more.',
  '打开系统设置': 'Open System Settings',

  // Sidebar
  '进行中': 'Active',
  '本周到期': 'Due this week',
  '搁置': 'Parked',
  '聚焦': 'Focus',
  '收件箱': 'Inbox',
  '未分类': 'Unsorted',
  '未命名': 'Untitled',
  '无标题': 'Untitled',
  '（无标题）': '(untitled)',
  '工作区': 'Workspace',
  '新建工作区': 'New workspace',
  '新建脉络': 'New thread',
  '删除工作区': 'Delete workspace',
  '删除脉络': 'Delete thread',
  '展开': 'Expand',
  '收起': 'Collapse',
  '+ 创建第一条脉络': '+ Create the first thread',
  '双击重命名': 'Double-click to rename',
  '当前捕捉目标': 'Current capture target',
  '设为捕捉目标': 'Set as capture target',
  '移动到工作区': 'Move to workspace',
  '没有其他工作区': 'No other workspaces',
  '搜索全部内容 (⌘⇧F)': 'Search everything (⌘⇧F)',
  '设置 (⌘,)': 'Settings (⌘,)',
  '点下方 + 工作区开始': 'Click + Workspace below to start',

  // Thread header
  '打包': 'Pack',
  '打包上下文（⌘⇧P）': 'Pack context (⌘⇧P)',
  '完成项目': 'Complete project',
  '重新打开': 'Reopen',
  '重新打开（清除完成时间和结论）': 'Reopen (clears completion time and conclusion)',
  '捕捉目标': 'Capture target',
  '设为目标': 'Set as target',
  '摘要': 'Digest',
  '全记录': 'Full record',
  '清除截止日期': 'Clear deadline',
  '写一句话摘要…': 'Write a one-line summary…',
  '＋ 写一句话摘要': '+ Write a one-line summary',
  '写一句话摘要': 'Write a one-line summary',
  '点击编辑摘要': 'Click to edit summary',

  // Composer / mention
  '写一条草稿…（Enter 发送，Shift+Enter 换行，@ 引用脉络）':
    'Write a draft… (Enter to send, Shift+Enter for newline, @ to reference a thread)',

  // Block item / actions
  '展开全部': 'Show all',
  '批注（可选）': 'Note (optional)',
  '完成': 'Done',
  '双击编辑（含批注）': 'Double-click to edit (incl. note)',
  '双击编辑批注': 'Double-click to edit note',
  '标为重点?': 'Highlight?',
  '取消重点?': 'Remove highlight?',
  '取消选择': 'Deselect',
  'Shift 点击可范围选择': 'Shift-click for range select',
  '选择此 block': 'Select this block',
  'https://…  （Enter 添加，Esc 取消）': 'https://…  (Enter to add, Esc to cancel)',
  '置顶': 'Pin',
  '取消置顶': 'Unpin',
  '编辑': 'Edit',
  '附加文件': 'Attach file',
  '附加链接': 'Attach link',
  '标为重点': 'Highlight',
  '取消重点': 'Remove highlight',
  '批注': 'Annotate',
  '添加批注': 'Add note',
  '编辑文本': 'Edit text',
  '复制内容': 'Copy content',
  '复制': 'Copy',
  '删除': 'Delete',
  '先选中要标重点的文字': 'Select text to highlight first',
  '取消重点（移除 ==…==）': 'Remove highlight (strip ==…==)',
  '标为重点（包裹 ==选区==）': 'Highlight (wrap ==selection==)',
  '引用脉络': 'Referenced thread',
  '原脉络已删除': 'Original thread was deleted',
  '跳转到这条脉络': 'Jump to this thread',
  '点击编辑来源': 'Click to edit source',
  '添加来源标签': 'Add source label',
  '标注来源': 'Label source',
  '+ 来源': '+ source',
  '打开引用的脉络': 'Open referenced thread',
  '引用的脉络已删除': 'Referenced thread was deleted',
  '加入 Pack': 'Include in pack',
  '无法打开附件': 'Could not open attachment',
  '（文本已加入 Pack）': '(text included in pack)',
  '收起提取的文本': 'Collapse extracted text',
  '展开提取的文本': 'Expand extracted text',
  '字符': 'chars',
  '此文本会随打包 / 状态摘要一起发送给 AI —— 点击取消': 'This text is sent to the AI with packs / status summaries — click to opt out',
  '勾选后，此文本会随打包 / 状态摘要一起发送给 AI': 'When on, this text is sent to the AI with packs / status summaries',
  '已完成': 'Done',
  '已提取文字': 'Text extracted',
  '展开预览': 'Expand preview',
  '收起预览': 'Collapse preview',
  '移除附件': 'Remove attachment',
  '确认删除': 'Confirm delete',
  '取消': 'Cancel',

  // Merge toolbar / thread picker
  '已选': 'Selected',
  '个': '', // measure word — dropped in English (rendered by sentence-level keys below)
  '合并 {n} 个为一个？可 ⌘Z 撤销': 'Merge {n} into one? ⌘Z to undo',
  '确认': 'Confirm',
  '再想想': 'Not yet',
  '合并': 'Merge',
  '合并中…': 'Merging…',
  '合并所选 block': 'Merge selected blocks',
  '至少选择两个 block 才能合并': 'Select at least two blocks to merge',
  '复制到…': 'Copy to…',
  '复制所选 block 到另一个脉络': 'Copy selected blocks to another thread',
  '已选 {n} 个': '{n} selected',
  '复制到… 搜索脉络': 'Copy to… search threads',
  '没有匹配的脉络': 'No matching threads',

  // Pack dialog
  '打包上下文': 'Pack context',
  '纯本地组装 · 直接粘贴给 AI 即可': 'Assembled locally · paste straight into an AI',
  '想让 AI 做什么?': 'What should the AI do?',
  '打包范围?': 'Pack range?',
  '全部': 'All',
  '仅置顶': 'Pinned only',
  '近 7 天': 'Last 7 days',
  '近 30 天': 'Last 30 days',
  '打包整条脉络': 'Pack the whole thread',
  '只打包标了置顶的信息块': 'Pack only pinned blocks',
  '只打包最近 7 天捕捉的内容': 'Pack only the last 7 days',
  '只打包最近 30 天捕捉的内容': 'Pack only the last 30 days',
  '纯上下文': 'Context only',
  '只交付上下文，不附加任务（当前默认）': 'Deliver context only, no task attached (default)',
  '复习资料': 'Revision materials',
  '让 AI 据此生成复习材料': 'Ask the AI to generate revision materials',
  '组合零散对话': 'Combine fragments',
  '把碎片整合成一份去重的干净总结': 'Synthesize fragments into one deduplicated summary',
  '关闭': 'Close',
  '复制到剪贴板': 'Copy to clipboard',
  '已复制': 'Copied',
  '{packed} / {total} 块 · {chars} 字符': '{packed} / {total} blocks · {chars} chars',

  // Search
  '搜索所有工作区与脉络的内容…': 'Search all workspaces and threads…',
  '输入关键词，搜索任意脉络里的内容与批注': 'Type keywords to search content and notes in any thread',
  '没有找到 —— 换个关键词试试？': 'Nothing found — try other keywords?',
  '搜索出错：{msg}': 'Search failed: {msg}',
  '{n} 条结果': '{n} results',
  '全文搜索 · 纯本地': 'Full-text search · fully local',
  '↑↓ 选择 · ↵ 跳转 · esc 关闭': '↑↓ select · ↵ jump · esc close',
  '块内查找': 'Find in block',
  '块内查找…': 'Find in block…',
  '无匹配': 'No matches',
  '所有包含该文字的块（全部工作区）': 'Every block containing this text (all workspaces)',
  '所有匹配的块': 'All matching blocks',
  '上一个匹配 (⇧⌘G / ⇧↵)': 'Previous match (⇧⌘G / ⇧↵)',
  '上一个匹配': 'Previous match',
  '下一个匹配 (⌘G / ↵)': 'Next match (⌘G / ↵)',
  '下一个匹配': 'Next match',
  '全局快捷键': 'Global shortcuts',
  '浏览器自动化权限': 'Browser automation access',

  // Complete / digest
  '这个项目结束了。': 'This project is done.',
  '要不要加一段结论？': 'Add a conclusion?',
  '一句话写下这个项目的结论…（可以留空）': 'Write a one-line conclusion… (can be left empty)',
  '先给重要的信息块加上置顶标记': 'Pin the important blocks first',
  '从置顶的信息块生成一段结论草稿': 'Draft a conclusion from the pinned blocks',
  '总结中…': 'Summarizing…',
  '让 AI 总结': 'Let AI summarize',
  '结论': 'Conclusion',
  '置顶的信息块': 'Pinned blocks',
  '文件与链接': 'Files & links',
  '这个项目没有标记过的重点。翻翻完整记录？': 'No marked highlights in this project. Browse the full record?',
  '查看完整记录': 'View full record',

  // Digest / feed / misc
  '这个项目没有标记重点。要看完整记录吗？': 'No marked highlights in this project. Browse the full record?',
  '看完整记录': 'View full record',
  '重点': 'Highlights',
  '松开以新建第一个块': 'Release to create the first block',
  '松开以新建一个块': 'Release to create a block',
  '⌘C 复制后双击': 'Copy with ⌘C, then double-tap',
  '捕捉第一条信息；长按': 'to capture your first piece; long-press',
  '连续收集；或在下方直接写。': 'to collect in batches; or write below.',
  '排序': 'Sort',
  '按时间': 'By time',
  '按来源': 'By source',
  '查看更早的 {n} 条': 'Show {n} earlier blocks',
  'Spool 渲染崩了': 'Spool hit a rendering error',
  '从左侧选一条脉络，或按 ⌘N 新建': 'Pick a thread on the left, or press ⌘N to create one',
  '{n}天后': 'in {n}d',
  // Thread content size footnote (2026-07-07)
  '{n} 字': '{n} chars',
  '{n} 字 · 内容较多': '{n} chars · getting long',
  '内容过多可能导致打包不准确 — 点击打包，可选择范围':
    'This much content can make packs less accurate — click to pack with a range',
  '全部块内容 + 批注 + 已加入 Pack 的附件文本':
    'All block content + annotations + attachment text included in packs',
  '今天': 'today',
  '逾期{n}天': '{n}d overdue',
  '刚刚': 'just now',
  '{n} 分钟前': '{n} min ago',
  '{n} 小时前': '{n} h ago',
  '{n} 天前': '{n} d ago',

  // Empty states
  '双击 ⌥ 捕捉第一条信息，或在下方直接写。': 'Double-tap ⌥ to capture your first piece, or write below.',
  '选择或新建一条脉络': 'Select or create a thread',

  // Settings
  '设置': 'Settings',
  '通用': 'General',
  '快捷键': 'Shortcuts',
  '浏览器权限': 'Browser access',
  '开机启动': 'Launch at login',
  '登录时自动运行,捕捉快捷键随时可用': 'Runs at login so capture shortcuts are always ready',
  '自动提取附件文字内容': 'Auto-extract attachment text',
  'PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。':
    'Reads PDF / Word / plain-text attachments for pack output. Fully local, nothing uploaded.',
  'MCP 服务（实验）': 'MCP server (experimental)',
  '让支持 MCP 的 AI 工具（Claude、Cursor 等）直接读取脉络打包——从「粘贴」到「零粘贴」。默认只读,仅本机。':
    'Lets MCP-capable AI tools (Claude, Cursor, …) pull thread packs directly — from paste to zero-paste. Read-only by default, local only.',
  '高级：手动粘贴到其它 MCP 客户端的配置里': 'Advanced: paste into another MCP client’s config',
  '接入后，把一段「怎么用 Spool 帮我」的提示粘给 AI，体验更顺':
    'Once connected, paste the AI a short "how to use Spool for me" briefing for a smoother start',
  '复制使用提示': 'Copy usage briefing',
  '我用 Spool（思簿）管理项目上下文，你可以通过它的 MCP 工具直接读写：用 list_threads 了解我的项目；search_blocks 定位主题在哪条脉络；get_pack 读完整上下文（大脉络先看 approx_pack_chars，优先 range=pinned）。我让你「记住/归档」结论时，用 add_block 存进对应脉络；新课题用 create_thread；读完新材料可用 set_thread_summary 更新一句话摘要；find_similar_blocks 可以帮我找重复捕捉。对我说话永远用脉络标题指代，绝不要输出内部 id。你写入的内容会自动带你的来源标签。':
    'I manage my project context in Spool. You can read and write it through its MCP tools: list_threads to survey my projects; search_blocks to locate which thread a topic lives in; get_pack for the full briefing (check approx_pack_chars first; prefer range=pinned for big threads). When I ask you to remember/archive a conclusion, file it with add_block; start new topics with create_thread; refresh a thread’s one-line summary with set_thread_summary after new material lands; find_similar_blocks helps spot duplicate captures. Always refer to threads by their titles when talking to me — never output internal ids. Everything you write is automatically labeled with your source.',
  '允许 AI 写入（实验）': 'Allow AI writes (experimental)',
  'AI 可新建脉络、向脉络追加信息块。写入的块始终带来源标注（如 Claude · MCP），不会伪装成你写的。':
    'AI can create threads and append blocks. Written blocks always carry a source label (e.g. Claude · MCP) — never disguised as your own writing.',
  '解析可执行路径…': 'Resolving executable path…',
  '✓ 已接入': '✓ Connected',
  '已写入 — 重启后生效': 'Written — restart the client',
  '路径已变': 'Path changed',
  '未检测到': 'Not found',
  '写入中…': 'Writing…',
  '更新配置': 'Update config',
  '一键接入': 'Connect',
  '当前是开发构建 — 安装正式版后需重新接入': 'This is a dev build — reconnect after installing the release app',
  '清除所有数据': 'Clear all data',
  '删除全部工作区、脉络与信息块,不可恢复': 'Deletes every workspace, thread and block. Irreversible.',
  '确认清除': 'Confirm clear',
  '清除中…': 'Clearing…',
  '清除': 'Clear',
  '语言 / Language': 'Language / 语言',
  '界面语言。切换立即生效。': 'UI language. Takes effect immediately.',

  // Capture overlay / undo card
  '剪贴板为空 — 先按 ⌘C 复制要捕捉的内容，再双击 ⌥': 'Clipboard is empty — copy something with ⌘C first, then double-tap ⌥',
  '没有捕捉目标脉络 — 打开 Spool 在脉络顶栏点"设为目标"': 'No capture target — open Spool and click "Set as target" in a thread header',
  '捕捉失败': 'Capture failed',
  '已撤销': 'Undone',
  '已重做': 'Redone',
  '没有可撤销的操作': 'Nothing to undo',
  '重做刚才的撤销': 'Redo what was just undone',
  '重做': 'Redo',
  '捕获': 'capture',
  '暂存合并': 'staged merge',
  '高亮': 'highlight',
  '删除项目': 'thread delete',
  '关闭 (Esc)': 'Close (Esc)',
  '双击添加批注': 'Double-click to add a note',
  '撤销刚才的捕捉': 'Undo this capture',
  '撤销': 'Undo',
  '改投到其它脉络': 'Redirect to another thread',
  '改投': 'Redirect',

  // Tray
  '当前目标：（无）': 'Current target: (none)',
  '当前目标:  ': 'Current target:  ',
  '切换捕捉目标': 'Switch capture target',
  '（暂无脉络）': '(no threads yet)',
  '打开 Spool': 'Open Spool',
  '退出 Spool': 'Quit Spool',

  // Collect panel
  '正在收集': 'Collecting',
  '已加入': 'Added',
  '撤销刚加入的一条': 'Undo the item just added',
  '发送': 'Send',
  '发送中…': 'Sending…',
  '发送（{n} 条已批注）': 'Send ({n} annotated)',
  '展开面板': 'Expand panel',
  '单击 ⌥ 收起': 'Tap ⌥ to collapse',
  '收起为小标签（或单击 ⌥）': 'Collapse to a pill (or tap ⌥)',
  '暂存中。下次 ⌥-捕获将加入这里。': 'Staging. The next ⌥ capture lands here.',
  '丢弃 {n} 条暂存内容？': 'Discard {n} staged items?',
  '确认丢弃': 'Confirm discard',
  '丢弃': 'Discard',
  '标为重点（发送后整块会置顶）': 'Mark as key (the merged block will be pinned)',
  '移除此项': 'Remove this item',
  '移除': 'Remove',

  // Store / hook toasts
  '文件文字提取失败：{msg}': 'Text extraction failed: {msg}',
  '合并失败：所选 block 跨脉络': 'Merge failed: selection spans threads',
  '合并失败：{msg}': 'Merge failed: {msg}',
  '复制失败：{msg}': 'Copy failed: {msg}',
  '附加失败：{msg}': 'Attach failed: {msg}',
  '捕捉失败：{msg}': 'Capture failed: {msg}',
  '双击 ⌥ 捕捉已停止 — 请重启 Spool 重新启用。':
    'Double-tap ⌥ capture stopped — restart Spool to re-enable.',
  '已复制 {n} 个块到「{target}」': 'Copied {n} blocks to “{target}”',

  // Settings sub-panels
  '请按下 ⌘ / ⌃ / ⌥ 之一，再加一个普通键': 'Press ⌘ / ⌃ / ⌥ plus a regular key',
  '两个快捷键不能相同': 'The two shortcuts must differ',
  '系统拒绝了该快捷键：{msg}': 'The system rejected this shortcut: {msg}',
  '按键中…': 'Press keys…',
  '捕捉快捷键': 'Capture shortcut',
  '内置手势：⌘C 复制后 10 秒内双击 ⌥ 捕捉剪贴板；长按 ⌥ 打开收集面板。以下快捷键可自定义。':
    'Built-in gestures: within 10 s of copying (⌘C), double-tap ⌥ to capture the clipboard; long-press ⌥ to open the collect panel. The shortcuts below are customizable.',
  '可选 — 双击 ⌥ 之外的备用捕捉键': 'Optional — a fallback capture key besides double-tap ⌥',
  '未设置': 'Not set',
  '清除捕捉快捷键': 'Clear the capture shortcut',
  '搜索快捷键': 'Search shortcut',
  '打开全文搜索': 'Open full-text search',
  '按下新的组合键，或按 Esc 取消': 'Press a new combination, or Esc to cancel',
  '✓ 已授权': '✓ Granted',
  '✗ 未授权': '✗ Denied',
  '⚪ 未测试': '⚪ Untested',
  '首次从浏览器捕捉时，macOS 会请求"自动化"权限。允许后，捕捉的来源会显示标签页标题；否则只会显示浏览器名。点击"测试"可重新触发该提示。':
    'The first capture from a browser makes macOS ask for Automation access. When granted, captures show the tab title as their source; otherwise just the browser name. Click "Test" to re-trigger the prompt.',
  '测试中…': 'Testing…',
  '测试': 'Test',
};
