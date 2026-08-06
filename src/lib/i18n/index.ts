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

  // Input Monitoring onboarding banner (2026-07-07; stale-grant recovery 2026-07-08;
  // rewritten 2026-08-02 for DESIGN_FIRST_RUN 拍板点 3/4 — the resting line names what
  // still works, and the quit-and-reopen instruction waits until the user has gone for
  // the grant)
  '想在别的 app 里复制就存，需要开一个权限。在那之前 Spool 照样能用——在下面写笔记，或者在 Spool 里复制后双击 ⌥。':
    'Capturing from other apps needs one permission. Until then Spool still works — write notes below, or copy inside Spool and double-tap ⌥.',
  '打开捕捉': 'Turn on capture',
  '在系统设置里勾选 Spool，然后完全退出 Spool（托盘图标 → 退出）再重新打开。没看到系统弹窗？点右边打开设置。':
    'Tick Spool in System Settings, then fully quit Spool (tray icon → Quit) and reopen. No system dialog? Open Settings on the right.',
  '已授权 — 重启 Spool 后生效': 'Granted — takes effect after Spool restarts',
  '立即重启 Spool': 'Restart Spool now',
  '已授权却仍看到本条？旧授权可能已失效：在系统设置的列表中选中 Spool 按 − 删除，完全退出并重新打开 Spool，允许新弹窗后再退出重启一次。':
    'Granted but still seeing this? The old grant may be stale: select Spool in the System Settings list and press − to remove it, fully quit and reopen Spool, allow the new prompt, then quit and restart once more.',
  '打开系统设置': 'Open System Settings',

  // Sidebar
  '进行中': 'Active',
  '搁置': 'Parked',
  '沉睡': 'Dormant',
  '沉睡 {n} 条': '{n} dormant',
  '聚焦': 'Focus',
  '收件箱': 'Inbox',
  '未分类': 'Unsorted',
  '未命名': 'Untitled',
  '无标题': 'Untitled',
  '（无标题）': '(untitled)',
  '工作区': 'Workspace',
  '新建工作区': 'New workspace',
  '新建项目': 'New project',
  '删除工作区': 'Delete workspace',
  '删除项目': 'Delete project',
  '展开': 'Expand',
  '收起': 'Collapse',
  '+ 创建第一个项目': '+ Create the first project',
  '双击重命名': 'Double-click to rename',
  '当前捕捉目标': 'Current capture target',
  '设为捕捉目标': 'Set as capture target',
  '最近': 'Recent',
  '捕捉中': 'Capturing',
  '设为捕捉': 'Set capture',
  '捕捉到此': 'Capture here',
  '之后的 ⌘C+双击 ⌥ 捕捉都会落进这个项目': 'Future ⌘C + double-tap ⌥ captures land in this project',
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
  '更多操作': 'More actions',
  '摘要': 'Digest',
  '全记录': 'Full record',
  '清除截止日期': 'Clear deadline',
  '写一句话摘要…': 'Write a one-line summary…',
  '＋ 写一句话摘要': '+ Write a one-line summary',
  '写一句话摘要': 'Write a one-line summary',
  '点击编辑摘要': 'Click to edit summary',

  // Composer / mention
  '写一条草稿…（Enter 发送，Shift+Enter 换行，@ 引用项目）':
    'Write a draft… (Enter to send, Shift+Enter for newline, @ to reference a project)',

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
  '引用项目': 'Referenced project',
  '原项目已删除': 'Original project was deleted',
  '引用的块已删除': 'Cited block no longer exists',
  '跳转到这个项目': 'Jump to this project',
  '点击编辑来源': 'Click to edit source',
  '添加来源标签': 'Add source label',
  '标注来源': 'Label source',
  '+ 来源': '+ source',
  '打开引用的项目': 'Open referenced project',
  '引用的项目已删除': 'Referenced project was deleted',
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
  '复制所选 block 到另一个项目': 'Copy selected blocks to another project',
  '删除 {n} 个块？⌘Z 可逐个撤回': 'Delete {n} blocks? ⌘Z restores them one at a time',
  '删除所选 block': 'Delete selected blocks',
  '删除中…': 'Deleting…',
  '已删除 {n} 个块': 'Deleted {n} blocks',
  '已选 {n} 个': '{n} selected',
  '复制到… 搜索项目': 'Copy to… search projects',
  '没有匹配的项目': 'No matching projects',

  // Pack dialog
  '打包上下文': 'Pack context',
  '纯本地组装 · 直接粘贴给 AI 即可': 'Assembled locally · paste straight into an AI',
  '想让 AI 做什么?': 'What should the AI do?',
  '打包范围?': 'Pack range?',
  '全部': 'All',
  '仅置顶': 'Pinned only',
  '近 7 天': 'Last 7 days',
  '近 30 天': 'Last 30 days',
  '打包整个项目': 'Pack the whole project',
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
  '详情': 'Details',
  '复制到剪贴板': 'Copy to clipboard',
  '已复制': 'Copied',
  '{packed} / {total} 块 · {chars} 字符': '{packed} / {total} blocks · {chars} chars',

  // Search
  '搜索所有工作区与项目的内容…': 'Search all workspaces and projects…',
  '输入关键词，搜索任意项目里的内容与批注': 'Type keywords to search content and notes in any project',
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
  '捕捉第一条信息': 'to capture your first piece',
  '捕捉后可以顺手留一句想法；或在下方直接写。':
    'Each capture invites a quick note; or write below.',
  // Empty state without the Input Monitoring grant (DESIGN_FIRST_RUN 拍板点 2) — the
  // draft box is the one path that works with no permission at all.
  '先在下面写一条试试——打字、按 Enter 就存下来了，不需要任何权限。':
    "Try one below — type, press Enter, it's saved. No permission needed.",
  '想在别的 app 里复制就能存？那一步需要打开输入监听权限。':
    'Want copying in any app to save here? That step needs the Input Monitoring permission.',
  // One-time line under the first block a new user ever captured (拍板点 5)
  '这就是全部操作了。攒够几条，按 ⌘⇧P 打包粘给 AI。':
    "That's the whole gesture. Once you have a few, press ⌘⇧P to pack them for your AI.",
  '设置截止日期': 'Set deadline',
  '截止日期': 'Deadline',
  '排序：按时间 — 点击改为按来源': 'Sorted by time — click for by source',
  '排序：按来源 — 点击改为按时间': 'Sorted by source — click for by time',
  '查看更早的 {n} 条': 'Show {n} earlier blocks',
  'Spool 渲染崩了': 'Spool hit a rendering error',
  '从左侧选一个项目，或按 ⌘N 新建': 'Pick a project on the left, or press ⌘N to create one',
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
  '选择或新建一个项目': 'Select or create a project',

  // Settings
  '设置': 'Settings',
  '通用': 'General',
  '快捷键': 'Shortcuts',
  '高级': 'Advanced',
  '浏览器权限': 'Browser access',
  '开机启动': 'Launch at login',
  '登录时自动运行,捕捉快捷键随时可用': 'Runs at login so capture shortcuts are always ready',
  '自动提取附件文字内容': 'Auto-extract attachment text',
  'PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。':
    'Reads PDF / Word / plain-text attachments for pack output. Fully local, nothing uploaded.',
  'MCP 服务（实验）': 'MCP server (experimental)',
  '让支持 MCP 的 AI 工具（Claude、Cursor 等）直接读取项目打包——从「粘贴」到「零粘贴」。默认只读,仅本机。':
    'Lets MCP-capable AI tools (Claude, Cursor, …) pull project packs directly — from paste to zero-paste. Read-only by default, local only.',
  '你的 AI 工具不在上面？（Cherry Studio、DeepChat 等）复制这段配置，粘进它的 MCP 设置页':
    'Your AI tool not listed? (Cherry Studio, DeepChat, …) Copy this config and paste it into its MCP settings',
  '去下载': 'Get it',
  '装好后这里就能一键接入': 'Once installed, one-click connect works here',
  '用法就这一段：粘给 AI 直接能用，你自己读也看得懂':
    'This one paragraph is the whole how-to: paste it to your AI, or just read it yourself',
  '复制使用提示': 'Copy usage briefing',
  '这一块的编号 — AI 说「#12」指的就是它。点一下定位':
    'This block\u2019s number — when an AI says \u201c#12\u201d, this is what it means. Click to locate it',
  '我在用 Spool（思簿）记项目笔记，你现在已经能直接读到它了。\n\n你可以这样帮我：\n· 「我最近在忙什么？」——先看一份跨项目的近况简报\n· 「〈某个项目〉我卡在哪、定下来了什么？」——读那个项目的完整脉络\n· 「把刚才这段结论存进〈某个项目〉」——替我存回去（需要我在 Spool 里打开「允许 AI 写入」）\n\n两条规矩：跟我说话只用项目标题和块号（比如 #12），别把内部 id 说出来；你写进去的每一块都会自动带上来源标签，我随时看得出哪些是你写的。':
    'I keep my project notes in Spool, and you can read them directly now.\n\nThings you can do for me:\n· "What have I been up to?" — start with a briefing across all my projects\n· "Where am I stuck on <a project>, and what have I settled?" — read that project in full\n· "Save that conclusion into <a project>" — store it back for me (I have to turn on "Let AI write" in Spool first)\n\nTwo rules: refer to things by project title and block number (like #12), never by an internal id; and every block you write is labelled with your name automatically, so I can always see which ones are yours.',
  '示例用法：接好后在哪儿说、说什么': 'Examples: where to ask once connected, and what to say',
  '在哪儿说：Claude Desktop / ChatGPT 在聊天框里说；Claude Code 在终端里说；Cursor / Visual Studio Code / Windsurf 在编辑器的 AI 面板里说。':
    'Where to ask: in the chat box for Claude Desktop / ChatGPT; in the terminal for Claude Code; in the editor’s AI panel for Cursor / Visual Studio Code / Windsurf.',
  '不用回 Spool 操作——接好后 Spool 只负责把笔记递过去。':
    ' Nothing to do back in Spool — once connected, Spool just hands the notes over.',
  '「帮我复习〈某个项目〉，再考我两个问题」': '"Help me review the ⟨…⟩ project, then quiz me on it"',
  '——读整个项目（get_pack）': ' — reads the whole project (get_pack)',
  '「我最近一周在忙什么？」': '"What have I been working on this week?"',
  '——跨项目简报（get_digest）': ' — cross-project digest (get_digest)',
  '「把刚才这段结论存进〈某个项目〉，批注一句为什么重要」':
    '"File this conclusion into ⟨…⟩, with a note on why it matters"',
  '——归档（add_block，需允许 AI 写入）': ' — archives it (add_block; needs AI writes on)',
  '「这个主题我记在哪个项目？」': '"Which project did I file this topic under?"',
  '——全库检索（search_blocks）': ' — library-wide search (search_blocks)',
  '「帮我看看有没有重复收藏的内容」': '"Check whether I captured anything twice"',
  '——查重报告（find_similar_blocks）': ' — duplicate report (find_similar_blocks)',
  '「给我的思簿做个体检」': '"Give my library a checkup"',
  '——数据卫生报告（check_library）': ' — hygiene report (check_library)',
  '允许 AI 写入（实验）': 'Allow AI writes (experimental)',
  'AI 可新建项目、向项目追加信息块。写入的块始终带来源标注（如 Claude · MCP），不会伪装成你写的。':
    'AI can create projects and append blocks. Written blocks always carry a source label (e.g. Claude · MCP) — never disguised as your own writing.',
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
  '删除全部工作区、项目与信息块,不可恢复': 'Deletes every workspace, project and block. Irreversible.',
  '确认清除': 'Confirm clear',
  '清除中…': 'Clearing…',
  '清除': 'Clear',
  '语言 / Language': 'Language / 语言',
  '界面语言。切换立即生效。': 'UI language. Takes effect immediately.',

  // DESIGN_AI_ENGINE §1.4 / §3 / §7 — the on-machine engine slot (claude or codex).
  '本机 AI 引擎': 'On-machine AI engine',
  '检测到你装了 Claude Code 或 Codex 时，项目菜单里会多出「让 AI 维护」——用你自己已经登录的那个 CLI 跑，Spool 不存任何 API key，也不联网。':
    'When Claude Code or Codex is detected on this machine, a "Let AI maintain" group appears in the project menu. It runs through the CLI you are already logged into — Spool stores no API key and still never goes online.',
  '检测中…': 'Checking…',
  '✓ 已检测到': '✓ Found',
  '没检测到 Claude Code，也没检测到 Codex': 'Neither Claude Code nor Codex found',
  '装 Claude Code': 'Get Claude Code',
  '装 Codex': 'Get Codex',
  '、': ', ',
  '用哪个引擎': 'Engine to use',
  '两个都装了。跑的是哪个，用的就是那个账号的额度。':
    'Both are installed. Whichever runs is the account whose allowance gets spent.',
  'Codex 这条路有一处关不掉：它自带的终端工具没法摘掉（Claude Code 那边可以）。Spool 能做的是把它锁成只读——它读得到东西，但改不了你机器上的文件。':
    'One thing cannot be switched off on the Codex route: its built-in terminal tool has no off switch (Claude Code does). What Spool can do is lock it to read-only — it can look at things, but it cannot change files on your machine.',
  '安装方法': 'How to install',
  '在项目菜单里显示 AI 维护动作': 'Show AI maintenance actions in the project menu',
  '需要上面两个开关都打开——AI 维护的产出是写回一块，读权限不够用。':
    'Both switches above must be on — these actions write a block back, so read access alone is not enough.',
  '单次最长运行时间': 'Time limit per run',
  '超过就停下（已经写进去的块会留着——Spool 只追加，不回滚）。上限 10 分钟。':
    'Stops when it runs over. Blocks already written stay — Spool only ever appends, it never rolls back. 10 minutes maximum.',
  '分钟': 'min',
  '让 AI 维护': 'Let AI maintain',
  '提炼结论': 'Distil a conclusion',
  '整理去重': 'Tidy up duplicates',
  '生成周回顾': 'Write a weekly review',
  'AI 整理中…': 'AI working…',
  '用本机的 {engine} 把这条脉络提炼成一块结论':
    'Use the {engine} on this machine to distil this thread into one conclusion block',
  '让本机的 {engine} 查一遍重复块、失效引用，看摘要过没过期':
    'Have the {engine} on this machine look for duplicate blocks and dead citations, and judge whether the summary has gone stale',
  '让本机的 {engine} 回顾最近一周——跨所有项目，不只这一个':
    'Have the {engine} on this machine look back over the past week — across every project, not just this one',
  // DESIGN_FOLLOW_UP §3.2/§3.3 — the follow-up brief and the one action that goes outside.
  '联网跟进…': 'Follow up on the web…',
  '找找新进展': 'Look for news',
  '改要盯的东西': 'Change what to watch',
  '起草跟进目标': 'Draft what to watch',
  '定几行「要盯什么」，之后才能让 AI 出去查':
    'Set a few lines of "what to watch" before the AI can go looking',
  '照你定的那几行,让本机的 {engine} 出去查一遍有没有新进展':
    'Have the {engine} on this machine go and check for news, against the lines you set',
  '这个项目要盯什么': 'What should this project watch?',
  '写清楚要盯的几件事。以后每次「找找新进展」，AI 就照这几行出去查——它只找这几行说的东西。':
    'Name the things worth watching. Every "Look for news" run works from these lines — and looks for nothing else.',
  '一行一件事。比如：CMU 的申请截止日期和 GRE 要求有没有变。':
    'One per line. For example: whether CMU’s application deadline or GRE requirements have changed.',
  '让 AI 起个草': 'Let the AI draft it',
  'AI 在读这个项目…': 'The AI is reading this project…',
  '起草只读你库里的东西，不联网。': 'Drafting only reads your library. It does not go online.',
  '就按这个找': 'Use this',
  '关掉跟进': 'Turn it off',
  '清空就等于关掉跟进': 'Clearing the text turns follow-up off',
  '跟进目标已定好': 'Saved — this is what it will watch',
  '已关掉这个项目的跟进': 'Follow-up is off for this project',
  '存不下来：{msg}': 'Could not save: {msg}',
  '找找新进展：提了 {n} 条待你过目': 'Look for news: {n} item(s) waiting for you',
  '找找新进展：这次没有新东西': 'Look for news: nothing new this time',

  // M2 §1.2 — the running pill, and what the queue behind it says.
  '{action}中': '{action} running',
  '{action}中 · 还排着 {n} 个': '{action} running · {n} waiting',
  '点一下停下来（已经写进去的块会留着）':
    'Click to stop. Blocks already written stay — Spool only ever appends.',
  '这条脉络已经排上了，等它跑完': 'This project is already in the queue — let it finish',
  // §1.3 — how a finished run reports itself.
  '{action}：AI 归档了 {n} 块': '{action}: the AI filed {n} block(s)',
  '{action}：跑完了，没有新增块': '{action}: finished, nothing new was written',
  '已停止 {action}': 'Stopped {action}',
  '已停止 {action}；已经写进去的 {n} 块留着（Spool 只追加，不回滚）':
    'Stopped {action}. The {n} block(s) already written stay — Spool only appends, it never rolls back.',
  '{action} 没跑成': '{action} did not run',
  '{action} 没跑完；已经写进去的 {n} 块留着':
    '{action} did not finish. The {n} block(s) already written stay.',
  // '详情' already has a key above (the permission banner's).
  '收起详情': 'Hide details',

  // DESIGN_AI_ENGINE M3 — the "AI 活动" fold.
  'AI 活动': 'AI activity',
  'AI 活动 · 这个项目里有 {n} 块是 AI 写的':
    'AI activity · {n} block(s) here were written by an AI',
  '{source} · {when} · {n} 块': '{source} · {when} · {n} block(s)',
  '归档了 {n} 块': 'filed {n} block(s)',
  '没有新增块': 'nothing new',
  '被你停下了': 'you stopped it',
  '被你停下了，写进去的 {n} 块留着': 'you stopped it; the {n} block(s) written stay',
  '没跑成': 'did not run',
  '跳到这一块': 'Jump to this block',

  // DESIGN_MCP_WRITE_ROLE §4.3 — the review screen for AI proposals.
  'AI 提了 {n} 条待你过目（还没进你的库）':
    '{n} item(s) an AI proposed, waiting for you — not in your library yet',
  'AI 提的，等你过目': 'Proposed by an AI, waiting for you',
  '这些还没进你的库。你点头才存，点「都不要」就当没发生过。':
    'None of this is in your library yet. It is stored only if you say yes; "No thanks" makes it as if it never happened.',
  '没有待你过目的。': 'Nothing waiting for you.',
  '{client} 提了 {n} 条': '{client} proposed {n} item(s)',
  '{n} 天后作废': 'void in {n}d',
  '原文 — 会存进〈{title}〉，来源标着「{source}」':
    'Original passage — stored in ‹{title}›, labelled “{source}”',
  // §4.4-bis: the second half of the passage block's source label. Not decoration — it is
  // what tells a model reading the pack that these are the user's words, not the AI's.
  '用户原文': "user's own passage",
  '下面每条都会标注「出自这段」。这段本身也算一块。':
    'Each item below will cite this passage. The passage itself counts as one block too.',
  '进〈{title}〉': 'into ‹{title}›',
  '都存进去（{n} 块）': 'Store all {n} blocks',
  '存这 {n} 块': 'Store these {n} blocks',
  '都不要': 'No thanks',
  '直接扔掉，不留痕迹': 'Throws it away and leaves no trace',
  '{n} 批已过期（超过 7 天没处理），已经作废。':
    '{n} batch(es) expired after 7 days without review, and are void.',
  '清掉': 'Clear',
  '存进去了 {n} 块': 'Stored {n} block(s)',
  '存不进去：{msg}': 'Could not store: {msg}',

  // Capture overlay / undo card
  '剪贴板为空 — 先按 ⌘C 复制要捕捉的内容，再双击 ⌥': 'Clipboard is empty — copy something with ⌘C first, then double-tap ⌥',
  '没有捕捉目标 — 打开 Spool 在项目顶栏点「捕捉到此」': 'No capture target — open Spool and click "Capture here" in a project header',
  '捕捉失败': 'Capture failed',
  '已撤销': 'Undone',
  '已重做': 'Redone',
  '没有可撤销的操作': 'Nothing to undo',
  '重做刚才的撤销': 'Redo what was just undone',
  '重做': 'Redo',
  '捕获': 'capture',
  '高亮': 'highlight',
  // 删除项目 / 删除工作区 的撤销标签与侧栏按钮共用同一个键（见上）。
  '关闭 (Esc)': 'Close (Esc)',
  '留一句想法…（Enter 保存，Esc 跳过）': 'Leave a thought… (Enter saves, Esc skips)',
  '撤销刚才的捕捉': 'Undo this capture',
  '撤销': 'Undo',
  '改投到其它项目': 'Redirect to another project',
  '改投': 'Redirect',

  // Tray
  '当前目标：（无）': 'Current target: (none)',
  '当前目标:  ': 'Current target:  ',
  '切换捕捉目标': 'Switch capture target',
  '（暂无项目）': '(no projects yet)',
  '打开 Spool': 'Open Spool',
  '退出 Spool': 'Quit Spool',

  // Store / hook toasts
  '文件文字提取失败：{msg}': 'Text extraction failed: {msg}',
  '合并失败：所选 block 跨项目': 'Merge failed: selection spans projects',
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
  '内置手势：⌘C 复制后 10 秒内双击 ⌥ 捕捉剪贴板，弹窗里可直接打字留一句想法。以下快捷键可自定义。':
    'Built-in gesture: within 10 s of copying (⌘C), double-tap ⌥ to capture the clipboard — then just type in the popup to leave a note. The shortcuts below are customizable.',
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
