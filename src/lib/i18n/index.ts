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
import { localizeKeyCaps } from '@/lib/platform';
import { useSettingsStore } from '@/stores/settingsStore';

export type Language = 'zh' | 'en';

const interpolate = (s: string, vars?: Record<string, string | number>): string =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

// One pass, at the exit of the only function every visible string goes through. The copy
// is written once with Mac symbols (they are the shortest way to write a chord, and this
// is a Mac-first product); off macOS the symbols are spelled out as the words those
// keyboards actually print. ⌘N really is Ctrl+N there — the handlers have always read
// `metaKey || ctrlKey` — so this makes the LABEL true, it does not change any behaviour.
//
// ⚠️ It cannot fix a sentence that describes a gesture Windows does not have. Anything
// mentioning the double-tap ⌥ trigger or a macOS permission needs its own copy, chosen at
// the call site by IS_MAC — a mechanical substitution there would produce a fluent
// instruction for something that cannot be done.
const render = (key: string, lang: Language, vars?: Record<string, string | number>): string =>
  localizeKeyCaps(interpolate(lang === 'en' ? (EN[key] ?? key) : key, vars));

export const t = (key: string, vars?: Record<string, string | number>): string =>
  render(key, useSettingsStore.getState().language, vars);

// Reactive variant for components: re-renders on language change.
export const useT = (): typeof t => {
  const lang = useSettingsStore((s) => s.language);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => render(key, lang, vars),
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
  // Windows onboarding (2026-08-18): no TCC grant to ask for, but also no default
  // capture chord — Ocean chose to have the first launch ask for one instead.
  '想在别的 app 里复制就存，先给捕捉定一个快捷键。在那之前 Spool 照样能用——在下面直接写笔记。':
    'To save things you copy in other apps, pick a capture shortcut first. Until then Spool still works — just write notes below.',
  '设一个快捷键': 'Pick a shortcut',
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
  '在里面新建工作区': 'New workspace inside',
  '移到最外层': 'Move to top level',
  '移进工作区': 'Move into workspace',
  '删除工作区': 'Delete workspace',
  '删除工作区（连同里面的工作区）': 'Delete workspace (and the ones inside it)',
  '删除项目': 'Delete project',
  '删除多个项目': 'Delete projects',
  '选中的 {n} 个项目': '{n} projects selected',
  '{n} 个项目': '{n} projects',
  '删除这 {n} 个项目': 'Delete these {n} projects',
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
  '之后捕捉到的内容都会落进这个项目': 'Anything captured from now on lands in this project',
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
  // v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板乙): the badge on a note an AI wrote. The pack's
  // own `ai note:` marker stays English in every locale — it is a contract with the
  // receiving model (交接 §6.4) — but this one is read by the user, so it follows the app.
  'AI 批注': 'AI note',
  '标为重点?': 'Highlight?',
  '取消重点?': 'Remove highlight?',
  '取消选择': 'Deselect',
  'Shift 点击可范围选择': 'Shift-click for range select',
  '选择此 block': 'Select this block',
  'https://…  （Enter 添加，Esc 取消）': 'https://…  (Enter to add, Esc to cancel)',
  '置顶': 'Pin',
  '取消置顶': 'Unpin',
  '编辑': 'Edit',
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

  // DESIGN_CONTEXT_HYGIENE §3.1 — supersession. The wording carries the whole promise:
  // a retired block leaves the CONTEXT, not the library, and every string here has to say
  // so, or 「不作数了」 reads as 「删掉了」 and nobody presses it.
  '这条不作数了（不再进上下文，但留在库里）': 'No longer holds (drops out of context, stays in your library)',
  '还是作数的（重新放回上下文）': 'It holds after all (put it back into context)',
  '已标记「不作数了」· {when} 起不再进上下文（还在库里，搜得到）':
    'Marked as no longer holding · out of context since {when} (still in your library, still searchable)',
  '它更正了哪一条？': 'Which one does this correct?',
  '取消这条更正关系': 'Undo this correction link',
  '取代了': 'replaces',
  '更正了其中一处：': 'corrects one point in:',
  '其中一处已被更正：': 'one point in this was corrected:',
  '点一下跳到那一块': 'Click to jump to that block',
  '这一条更正了项目里的哪一条？': 'Which block in this project does this one correct?',
  '输入几个字找那一条': 'Type a few words to find it',
  '没有匹配的块': 'No block matches',
  '换一条': 'Pick another',
  '那条整条都不作数了': 'That whole block no longer holds',
  '那一条整条退出上下文，这一条顶上。它还留在库里，搜得到':
    'That block drops out of context and this one takes its place. It stays in your library and stays searchable.',
  '只有其中一处要改': 'Only one point in it is wrong',
  '那一条原文照旧，底下多一行说明「其中一处已被这条更正」':
    'That block is left exactly as it is, with one line under it saying this block corrected a point in it.',
  '跳转到这个项目': 'Jump to this project',
  '点击编辑来源': 'Click to edit source',
  '添加来源标签': 'Add source label',
  '标注来源': 'Label source',
  '+ 来源': '+ source',
  '打开引用的项目': 'Open referenced project',
  '引用的项目已删除': 'Referenced project was deleted',
  '无法打开附件': 'Could not open attachment',
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
  '打包范围?': 'Pack range?',
  // DESIGN_CONTEXT_HYGIENE §1.1 — on by default (Ocean 2026-08-08), so the row states what
  // unticking it drops, not just what it is.
  '带上「怎么读这份上下文」的说明': 'Include the "how to read this" instructions',
  '告诉对方哪些是权威资料、哪些只是别的 AI 写的。会长 {n} 字符':
    'Tells the other AI which parts are authoritative and which are just another AI’s writing. Adds {n} characters',
  '全部': 'All',
  '仅置顶': 'Pinned only',
  '近 7 天': 'Last 7 days',
  '近 30 天': 'Last 30 days',
  '打包整个项目': 'Pack the whole project',
  '只打包标了置顶的信息块': 'Pack only pinned blocks',
  '只打包最近 7 天捕捉的内容': 'Pack only the last 7 days',
  '只打包最近 30 天捕捉的内容': 'Pack only the last 30 days',
  '关闭': 'Close',
  '详情': 'Details',
  '复制到剪贴板': 'Copy to clipboard',

  // Workspace pack — DESIGN_WORKSPACE_PACK §1. ⚠️ The subtitle deliberately does NOT say
  // 「直接粘贴」 like the single-project one: this produces a folder, and §2.3 says handing the
  // AI one file out of it walks past the rules in INDEX.md.
  '打包整个工作区': 'Pack this whole workspace',
  '打包「{name}」': 'Pack “{name}”',
  '纯本地组装 · 导出成一个文件夹，整个交给 AI':
    'Assembled locally · exported as a folder — give the AI the whole folder',
  '（子工作区）': '(sub-workspace)',
  '{projects} 个项目 / {files} 个文件 · {chars} 字符':
    '{projects} projects / {files} files · {chars} characters',
  '导出文件夹': 'Export folder',
  '正在导出…': 'Exporting…',
  '导出到哪个文件夹？': 'Export into which folder?',
  '已导出 {n} 个文件': 'Exported {n} files',
  '打开文件夹': 'Open folder',
  '读不出项目内容，导出取消了': 'Could not read the projects — export cancelled',
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
  // DESIGN_PROJECT_FILES §3.2 — 「项目文件」, the right rail panel that replaced the block
  // action bar's 📎 and 🔗.
  '项目文件': 'Project files',
  '加文件': 'Add file',
  '从文件选择器里加一个文件': 'Add a file through the file picker',
  '这个项目还没有文件。加进来的文件默认谁都不读，打包时也不会带上正文。':
    'No files in this project yet. Anything you add here is read by nobody by default, and its text stays out of packs.',
  '从这个项目里去掉（文件本身不动）': 'Remove from this project (the file itself is untouched)',
  '打包时带上这个文件的文字': 'Include this file\u2019s text when packing',
  // DESIGN_PROJECT_FILES §5.1 ① — the standing grant, shown where the file is listed
  // because that is the only place it can be taken back.
  'AI 可以读这个文件': 'An AI may read this file',
  'AI 不能读这个文件': 'No AI may read this file',
  '关掉之后，AI 想再读它就得重新问你一次。':
    'Turn it off and an AI has to ask you again before it can read this file.',
  '添加文件失败：{msg}': 'Could not add the file: {msg}',
  '这次更新去掉了「附加链接」，你原来加的 {n} 个链接已经删掉了。':
    'This update removed the \u201cattach link\u201d feature. The {n} link(s) you had added have been deleted.',
  '这个项目没有标记过的重点。翻翻完整记录？': 'No marked highlights in this project. Browse the full record?',
  '查看完整记录': 'View full record',

  // Digest / feed / misc
  '这个项目没有标记重点。要看完整记录吗？': 'No marked highlights in this project. Browse the full record?',
  '看完整记录': 'View full record',
  '重点': 'Highlights',
  '松开以新建第一个块': 'Release to create the first block',
  '松开以新建一个块': 'Release to create a block',
  '⌘C 复制后双击': 'Copy with ⌘C, then double-tap',
  '复制之后按': 'Copy, then press',
  '捕捉第一条信息': 'to capture your first piece',
  '捕捉后可以顺手留一句想法；或在下方直接写。':
    'Each capture invites a quick note; or write below.',
  // Empty state without the Input Monitoring grant (DESIGN_FIRST_RUN 拍板点 2) — the
  // draft box is the one path that works with no permission at all.
  '先在下面写一条试试——打字、按 Enter 就存下来了，不需要任何权限。':
    "Try one below — type, press Enter, it's saved. No permission needed.",
  '想在别的 app 里复制就能存？在设置里给捕捉定一个快捷键。':
    'Want to save what you copy in other apps? Pick a capture shortcut in Settings.',
  '想在别的 app 里复制就能存？那一步需要打开输入监听权限。':
    'Want copying in any app to save here? That step needs the Input Monitoring permission.',
  '设置截止日期': 'Set deadline',
  '截止日期': 'Deadline',
  '排序：按时间 — 点击改为按来源': 'Sorted by time — click for by source',
  '排序：按来源 — 点击改为按时间': 'Sorted by source — click for by time',
  '只看我写的：你自己写的块，加上你亲手批注过的':
    'Only what I wrote: the blocks you wrote yourself, plus any you annotated by hand',
  '只看我写的：开着 — 点击看全部': 'Only what I wrote: on — click to show everything',
  '这个项目里还没有你自己写下的东西。': "You haven't written anything into this project yet.",
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
  '明天': 'tomorrow',
  // 首日价值: the sidebar card (二期 — 「我攒了多少」, DESIGN_FIRST_DAY_VALUE) and the
  // one-time line the third capture earns under it in the feed.
  '你捕捉了 {n} 条': 'You captured {n}',
  '线轴：每 100 条捕捉缠满一轴': 'One spool holds 100 captures',
  '还差 {n} 条缠满': '{n} more to fill it',
  '这一轴缠满了': 'This spool is full',
  '已缠满 {n} 轴': '{n} spools filled',
  '今天读了 {n} 条': '{n} read today',
  '写了 {n} 字': '{n} chars written',
  '现在够打一个包了 —— 按 ⌘⇧P 打包，粘给任何 AI 试试。':
    'Enough to pack now — press ⌘⇧P and paste it to any AI.',
  // 旧账 §5-3: dates found inside a block's own text (DateNotices).
  '去看这一块': 'Go to this block',
  '先收起 —— 两个月前、一个月前、一周前各提醒一次':
    'Hide for now — every date is raised at two months, one month and one week out',
  '还有 {n} 个日子在这个项目里': '{n} more dates in this project',
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
  '让支持 MCP 的 AI 工具（Claude、Cursor 等）直接读取项目打包——从「粘贴」到「零粘贴」。只在本机,不出网。':
    'Lets MCP-capable AI tools (Claude, Cursor, …) pull project packs directly — from paste to zero-paste. Stays on this machine, nothing goes online.',
  '你的 AI 工具不在上面？（Cherry Studio、DeepChat 等）复制这段配置，粘进它的 MCP 设置页':
    'Your AI tool not listed? (Cherry Studio, DeepChat, …) Copy this config and paste it into its MCP settings',
  '去下载': 'Get it',
  '装好后这里就能一键接入': 'Once installed, one-click connect works here',
  '这一块的编号 — AI 说「#12」指的就是它。点一下定位':
    'This block\u2019s number — when an AI says \u201c#12\u201d, this is what it means. Click to locate it',
  '示例用法：接好后在哪儿说、说什么': 'Examples: where to ask once connected, and what to say',
  '在哪儿说：Claude Desktop、ChatGPT 里的 Codex 对话在聊天框里说；Claude Code 在终端里说；Cursor / Visual Studio Code / Windsurf 在编辑器的 AI 面板里说。':
    'Where to ask: in the chat box for Claude Desktop and for a Codex conversation in ChatGPT; in the terminal for Claude Code; in the editor’s AI panel for Cursor / Visual Studio Code / Windsurf.',
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
  '还没连上过': 'never connected',
  '跟进用的': 'Follow-up uses',
  'MCP 没开': 'MCP is off',
  '还没有 AI 连过': 'No AI has connected yet',
  '还有 {name} 连过 · {when}': '{name} also connected · {when}',
  // 2026-08-12 — the one client row whose product name covers two different capabilities.
  // "Codex" alone is accurate and unfindable; this is what keeps the word ChatGPT on the row
  // while saying which half of it works.
  'ChatGPT 桌面端里的 Codex 对话、Codex CLI、编辑器插件共用这份配置；ChatGPT 的普通对话连不上本机，用不了 Spool':
    'Codex in the ChatGPT desktop app, the Codex CLI and the editor extensions share this config. An ordinary ChatGPT chat cannot reach your machine, so it cannot use Spool.',
  '把这个项目的问题复制好，并跳到 {app}': 'Copy the question about this project and jump to {app}',
  '接入 Codex 和 Claude Code 时，还会往它们的说明文件（~/.codex/AGENTS.md、~/.claude/CLAUDE.md）里写一段,告诉 AI 你说的项目名先来 Spool 查一次、别去改同名的本地文档。写之前会自动备份;删掉 spool:begin 和 spool:end 之间那段就能移除。':
    'Hooking up Codex and Claude Code also appends a section to their instruction files (~/.codex/AGENTS.md, ~/.claude/CLAUDE.md), telling the AI to look a named project up in Spool before editing a local document that happens to share its name. The file is backed up first; delete everything between spool:begin and spool:end to remove it.',
  '未检测到': 'Not found',
  '写入中…': 'Writing…',
  '更新配置': 'Update config',
  '一键接入': 'Connect',
  '当前是开发构建 — 安装正式版后需重新接入': 'This is a dev build — reconnect after installing the release app',
  '文件夹名': 'Folder name',
  // 换机器 — 导出/导入整个库 (DESIGN_LIBRARY_TRANSFER)
  '换机器': 'Moving to another machine',
  '导出整个库': 'Export the whole library',
  '存成一个文件,换机器的时候用它把东西带过去':
    'Saves everything to one file — carry it to the other machine and import it there.',
  '导出中…': 'Exporting…',
  '导出': 'Export',
  '导入一个库': 'Import a library',
  '把另一台机器导出的文件合并进来,这台机器上现有的东西一条都不会被改':
    'Merges a library exported elsewhere into this one. Nothing already here is changed.',
  '导入中…': 'Importing…',
  '导入': 'Import',
  '已导出,{size}': 'Exported, {size}',
  '带进来 {workspaces} 个工作区、{threads} 个项目、{blocks} 条信息':
    'Brought in {workspaces} workspaces, {threads} projects, {blocks} blocks',
  '这个文件里的东西,这台机器上已经都有了': 'Everything in that file was already on this machine',
  '有 {n} 条这台机器上已经有了,跳过了': '{n} rows were already here and were skipped',
  '有 {n} 个文件在这台机器上找不到 —— 文字都还在,只是点开会失败':
    "{n} files are not on this machine — their text came across; only opening the file will fail",
  '重新载入,看带进来的东西': 'Reload to see what arrived',
  '这就是这台机器上正在用的那个库': 'That is the library this machine is already using',
  '这个文件不是 Spool 的库': 'That file is not a Spool library',
  '这份库来自更新的 Spool(v{theirs}),这台机器上的只认到 v{ours},请先更新 Spool':
    'That library comes from a newer Spool (v{theirs}); this one only understands v{ours}. Update Spool first.',
  '没做成,这台机器上的库没有被改动': "That didn't go through — the library on this machine is unchanged",
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
  '没检测到 Claude Code、Codex 或 Gemini CLI': 'No Claude Code, Codex or Gemini CLI found',
  '装 Claude Code': 'Get Claude Code',
  '装 Codex': 'Get Codex',
  '装 Gemini CLI': 'Get Gemini CLI',
  '装了 Claude Code、Codex 或 Gemini CLI 之后，右侧栏里就能让它替你整理项目——用你自己已经登录的那个 CLI 跑，Spool 不存任何 API key，也不联网。':
    'Once Claude Code, Codex or the Gemini CLI is installed, the right-hand rail can put it to work tidying your projects. It runs through the CLI you are already signed into — Spool stores no API key and still never goes online itself.',
  // DESIGN_AI_ENGINE §7.8 — measured, not hedged: 20 requests per model per day, and one
  // follow-up run spends all of them. Per §7.4 the word 免费 never stands alone.
  'Gemini CLI 走的是 Gemini API 的免费额度：每个模型每天大约 20 次请求。压缩和体检够用，联网跟进不够——所以那一项在这个引擎上不出现。API key 配在 gemini 自己那里（~/.gemini/.env），Spool 不存、也读不到。':
    "The Gemini CLI runs on the Gemini API's free allowance: roughly 20 requests per model per day. That is enough for Compress and Check over, and not enough for a web follow-up — so that one action does not appear on this engine. Your API key lives in the CLI's own config (~/.gemini/.env); Spool neither stores it nor can read it.",
  'Gemini 免费额度按模型分开算，每个每天大约 20 次。用完了换一个模型还能接着跑。':
    "Gemini's free allowance is counted per model — about 20 runs a day each. When one is used up, switching model gets you going again.",
  '联网搜索这一项 Gemini CLI 跑不了——它的免费额度一次跟进就用完了。换成 Claude Code 或 Codex 才有。':
    'The Gemini CLI cannot carry a web follow-up — one run uses up its whole free allowance. Switch to Claude Code or Codex for this one.',
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
  // Ocean 2026-08-06 深夜: 「让所有功能变得精明扼要」— the action names are one word each
  // now. They also read correctly inside the running pill ('{action}中' → 「压缩中」).
  // ⚠️ These are LABELS only. The MCP tool / prompt names (distill, thread_health,
  // weekly_review) and the `engine_runs.action` values are unchanged — those are contracts
  // other clients read, not words the user picked the action by.
  '压缩': 'Compress',
  '去重': 'Dedupe',
  '周回顾': 'Weekly review',
  'AI 整理中…': 'AI working…',
  '用本机的 {engine} 把这条脉络提炼成一块结论':
    'Use the {engine} on this machine to distil this thread into one conclusion block',
  '让本机的 {engine} 查一遍重复块、失效引用，看摘要过没过期':
    'Have the {engine} on this machine look for duplicate blocks and dead citations, and judge whether the summary has gone stale',
  '让本机的 {engine} 回顾最近一周——跨所有项目，不只这一个':
    'Have the {engine} on this machine look back over the past week — across every project, not just this one',
  // DESIGN_FOLLOW_UP §3.2/§3.3 — the follow-up brief and the one action that goes outside.
  '联网跟进…': 'Follow up on the web…',
  '跟进': 'Follow up',
  '改要盯的东西': 'Change what to watch',
  // §11.2-E (Ocean 2026-08-11): it used to call itself 「起草跟进目标」, which reads like
  // paperwork. Same mechanism, named after what it is FOR — the AI reads the project and
  // says what is still open.
  '找出还没解决的问题': 'Find what is still unresolved',
  '定几行「要盯什么」，之后才能让 AI 出去查':
    'Set a few lines of "what to watch" before the AI can go looking',
  '照你定的那几行,让本机的 {engine} 联网搜索有没有新进展':
    'Have the {engine} on this machine search the web for news, against the lines you set',
  '这个项目跟进什么': 'What should this project watch?',
  '一行一件事。比如：CMU 的申请截止日期和 GRE 要求有没有变。':
    'One per line. For example: whether CMU’s application deadline or GRE requirements have changed.',
  '让 AI 看看还缺什么': 'Let the AI see what is missing',
  'AI 在读这个项目…': 'The AI is reading this project…',
  '这一步只读你库里的东西，不联网。': 'This step only reads your library. It does not go online.',
  '存不下来：{msg}': 'Could not save: {msg}',
  '跟进：提了 {n} 条待你过目': 'Follow up: {n} item(s) waiting for you',
  '跟进：这次没有新东西': 'Follow up: nothing new this time',

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
  // v14 (§9.3 拍板甲): approving this item also marks one point in an existing block as
  // corrected. The old block keeps its text and stays in every pack — but the user is
  // agreeing to something beyond "store this", so the screen has to say so.
  '更正已有的一块': 'corrects an existing block',
  '都存进去（{n} 块）': 'Store all {n} blocks',
  '存这 {n} 块': 'Store these {n} blocks',
  '都不要': 'No thanks',
  '直接扔掉，不留痕迹': 'Throws it away and leaves no trace',
  '{n} 批已过期（超过 7 天没处理），已经作废。':
    '{n} batch(es) expired after 7 days without review, and are void.',
  '清掉': 'Clear',
  '存进去了 {n} 块': 'Stored {n} block(s)',
  '存不进去：{msg}': 'Could not store: {msg}',
  // DESIGN_PROJECT_FILES §3.4 — an AI asking to read files the user put in a project.
  '{client} 想读〈{title}〉里的 {n} 个文件': '{client} wants to read {n} file(s) in ‹{title}›',
  '它说要干什么': 'What it says it needs them for',
  '答应了就是长期的：以后它随时能读这几个文件。要收回，去这个项目右边的「项目文件」里点掉那一行。':
    'Saying yes is standing permission: it can read these files from now on. To take it back, untick the file under “Project files” on the right of this project.',
  '可以读': 'Let it read them',
  '不给': 'No',
  '{n} 个文件现在 AI 可以读了。随时可以在项目文件那一栏点掉。':
    '{n} file(s) are now readable by an AI. You can untick them under Project files at any time.',
  '没能打开权限：{msg}': 'Could not grant it: {msg}',

  // DESIGN_FOLLOW_UP §8.4 — an AI proposing ONE line for a project's follow-up list. This is
  // approval of a line that will tell the NEXT conversation what to go looking for, so it is
  // read one at a time rather than as a rewrite of the whole list.
  '{client} 想给〈{title}〉加一条要跟进的': '{client} wants to add something for ‹{title}› to watch',
  '加进去之后是「永久跟进」，不会因为查到一次答案就消失。想改去项目里的「这个项目跟进什么」。':
    'Once added, this is watched for good — answering it once does not retire it. To edit it later, open “What this project watches for” inside the project.',
  '加进去之后，AI 查到答案就会把它收起来——收起来还看得见，也能再打开。':
    'Once added, an AI can put it away as soon as it has an answer — put away is still visible, and can be reopened.',
  '加进去': 'Add it',
  '不用': 'No thanks',
  '加进跟进清单了': 'Added to the follow-up list',

  // §8.2 / §8.7 — the follow-up list itself: one list, two kinds of line.
  '一行一件事，AI 以后就照这几行去查。「单次跟进」查到答案就结束；「永久跟进」会一直查下去，只有你能结束。':
    'One thing per line — follow-ups search by these. A one-off ends once it is answered; a permanent one keeps being checked, and only you can end it.',
  '还没定。写一条要跟进的，之后 AI 才知道该去查什么。':
    'Nothing yet. Write one thing to watch, so an AI knows what to go and check.',
  '再加一条。比如：我在用的这个工具出没出新版本，有没有不兼容的改动。':
    'Add one more. For example: whether the tool I depend on has shipped a new version, and whether anything in it breaks.',
  '加上': 'Add',
  '回车＝加一条；⇧回车在同一条里换行。': 'Enter adds it; ⇧Enter breaks a line inside one.',
  'AI 加了 {n} 条，你可以改也可以删': 'The AI added {n} line(s) — edit or delete any of them',
  // The kind picker. Both options are always on screen: a lone chip naming the current one
  // reads as a label rather than a control (Ocean 2026-08-17).
  '这一条跟进到什么时候': 'How long to follow this one up',
  '单次跟进': 'One-off',
  '永久跟进': 'Permanent',
  '查到答案就结束——AI 替你查到了，也可以替你结束它':
    'Ends once it is answered — an AI that finds the answer may end it for you',
  '一直查下去。AI 结束不了它，只有你能':
    'Checked for good. An AI can never end this one — only you can',
  '已解决': 'Solved',
  '结束跟进': 'Stop following',
  '这条已经有答案了，收进下面「不再跟进的」，随时能重新跟进':
    'This one has its answer — files it under “no longer followed”, and you can pick it back up any time',
  '不用再跟进了，收进下面「不再跟进的」，随时能重新跟进':
    'No longer worth following — files it under “no longer followed”, and you can pick it back up any time',
  '不跟进这个了，直接删掉': 'Stop watching this — delete it',
  '删掉了': 'Deleted',
  '收起不再跟进的': 'Hide the ones no longer followed',
  '不再跟进的（{n}）': 'No longer followed ({n})',
  '重新跟进': 'Follow it again',


  // Capture overlay / undo card
  '剪贴板为空 — 先按 ⌘C 复制要捕捉的内容，再双击 ⌥': 'Clipboard is empty — copy something with ⌘C first, then double-tap ⌥',
  '剪贴板为空 — 先复制要捕捉的内容，再按一次捕捉快捷键':
    'Clipboard is empty — copy what you want to capture, then press the capture shortcut again',
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
  '撤销刚才的捕捉 · ⌘Z': 'Undo this capture · ⌘Z',
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
  '复制之后按下面这个快捷键，就能把剪贴板存进来，弹窗里可直接打字留一句想法。':
    'Copy something, then press the shortcut below to save the clipboard. You can type a thought straight into the popup.',
  '从别的软件里捕捉，全靠这个键': 'The only way to capture from another app',
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

  // ---------------------------------------------------------------------------------------
  // DESIGN_WORKBENCH — the two rails (§3) and their rebuild (§9).
  //
  // ⚠️ This whole block was missing until 2026-08-07. English is the DEFAULT language
  // (memory `ui-language-follows-system`), so every string the right rail shipped with was
  // rendering as Chinese to the default user. Rule 12 is not a formality — an untranslated
  // string does not look untranslated, it looks like a broken build.
  // ---------------------------------------------------------------------------------------
  '展开项目列表': 'Show projects',
  '展开 AI 面板': 'Show the AI panel',
  '拖动改变 AI 面板宽度': 'Drag to resize the AI panel',

  // The engine bar (§9.3 #3).
  '没检测到引擎': 'No engine found',
  'Spool 自己跑的这些运行，近 7 天一共花了这么多。剩多少额度 Spool 看不到。':
    'What Spool’s own runs have cost over the last 7 days. How much of your plan is left is something Spool cannot see.',
  '用哪个': 'Engine',
  '用哪个模型': 'Model',
  '默认': 'Default',
  // §9.13 effort. Named 「想多久」 / "Thinking" rather than "effort": the word the CLI uses
  // internally is not a word the user has any way to interpret.
  '想多久': 'Thinking',
  '想得越久越贵，也越慢': 'Thinking longer costs more, and takes longer',
  // 2026-08-08 (Ocean): the two notes that used to sit here explained why Codex has no
  // model picker and why no remaining-quota figure is shown. Both were developer voice —
  // they answered questions only someone building this would ask. What the user does need
  // to know is whose allowance a run spends.
  '用的是你自己 CLI 账号的额度。': 'Runs on your own CLI account’s allowance.',

  // The live run (§9.3 #4).
  '停下': 'Stop',
  '正在想…': 'Thinking…',
  '还排着 {n} 个': '{n} more queued',
  '{action} · {project}': '{action} · {project}',
  '点一下打开右边，看它在写什么': 'Click to open the panel and watch it write',
  '在读这个项目': 'Reading this project',
  '在看所有项目': 'Looking across your projects',
  '在库里找': 'Searching your library',
  '在盘点': 'Taking stock',
  '在存一块': 'Storing a block',
  '在排队等你过目': 'Queuing something for you to review',
  '在新建项目': 'Creating a project',
  '在写摘要': 'Writing a summary',
  '在网上搜': 'Searching the web',
  '在读一个网页': 'Reading a web page',

  // 项目管理 — the pinned sidebar entry and its project matrix (§9.4).
  '项目管理': 'Projects',
  '{n} 块': '{n} blocks',
  '今天到期': 'due today',
  '还有 {n} 天': '{n}d left',
  '{when} 完成': 'done {when}',
  '还没有项目。按 ⌘N 新建一个。': 'No projects yet. Press ⌘N to make one.',

  // The project board (§9.4, rebuilt as expandable rows in §9.13).
  '{n} 个项目在进行': '{n} projects in progress',
  '{n} 个快到期': '{n} due soon',
  '按截止日期': 'By deadline',
  '按新建时间': 'By date created',
  '迟 {n} 天': '{n}d late',
  '{n} 天': '{n}d',
  '{n} 块 · {chars} 字': '{n} blocks · {chars} chars',
  '{n} 块重复': '{n} duplicate(s)',
  '这个项目里有一模一样的块。打开项目自己处理——Spool 不会替你合并或删除。':
    'This project has byte-identical blocks. Open it and decide yourself — Spool never merges or deletes for you.',
  '跳转': 'Open',

  // 周回顾 as its own pinned view (components/ReviewBoard, 2026-08-11).
  '跨所有项目，不属于任何一个': 'Across every project — belonging to none of them',
  '回顾最近一周——读一遍所有项目': 'Look back over the past week — reads every project',
  '回顾这一周': 'Review this week',
  '每周自动回顾一次': 'Review automatically once a week',
  '正在回顾…': 'Reviewing…',
  '还没有回顾。点上面那一下，AI 会读一遍所有项目，说说这一周做了什么、还剩什么。':
    'No reviews yet. Press the button above and the AI reads every project, then says what moved this week and what is still open.',
  '这次什么也没回来': 'nothing came back this time',

  // 「问 AI」 (§9.13) — the row's one-click question.
  '把这个项目的问题复制好，并跳到你的 AI 软件':
    'Copy a question about this project and bring your AI app to the front',
  '只复制': 'copy only',
  '问题已复制，{app} 已经在前面了——⌘V 回车就行':
    'Question copied, and {app} is in front — just ⌘V and hit return',
  '问题已复制——在你的终端里粘上就行':
    'Question copied — paste it in your terminal',
  '读一下我 Spool 里「{title}」这个项目的完整脉络，然后告诉我三件事：我卡在哪、已经定下来了什么、接下来该做什么。':
    'Read the full thread of my Spool project “{title}”, then tell me three things: where I am stuck, what I have already settled, and what to do next.',

  // Run cards (§3.1) and the inbox (§3.3 / §9.2 R2).
  '提了 {n} 条待你过目': 'proposed {n} item(s) for you to review',
  '有回话，等你过目': 'replied, waiting for you',
  '这次没有新东西': 'nothing new this time',
  '花费未知': 'cost unknown',
  '存成一块': 'Store as a block',
  '从这里去掉（记录和花费仍然留着）':
    'Remove from here (the record and its cost stay)',
  '存好了': 'Stored',
  '{action} · {engine}': '{action} · {engine}',
  '{n} 条待你过目': '{n} waiting for you',
  '装了 Claude Code 或 Codex，并打开「允许 AI 写入」之后，这里才有东西。':
    'This fills up once Claude Code or Codex is installed and “Let AI write” is on.',
  // The rail's third section heading. It is a heading now rather than a sentence, because
  // all three sections share one shape (RightRail/RailSection) — the count moved to the
  // right of the line, where 编辑 and 加文件 sit on the other two.
  'AI 写的': 'Written by AI',

  // Follow-up, first level (§9.3 #2).
  '跟进内容': 'Watching for',
  '定一个': 'Set one',
  '还没定。定几行「要跟进什么」，之后才能让 AI 出去查。':
    'Not set yet. Write a few lines of what to watch for, and the AI can go and look.',
  '照你定的那几行联网搜索': 'Search the web, following the lines you wrote',
  '联网搜索': 'Search the web',
  // The brief editor's placeholder. Replaced 2026-08-06 (Ocean #10: the CMU example was too
  // niche) and never translated — the shape is the point, so the English keeps it concrete
  // enough to act as a search rule rather than becoming an abstraction.

  // The maintenance actions — a fixed row at the bottom of the rail since §9.13, where the
  // two sentences-pretending-to-be-controls that used to live here became one labelled
  // switch (Ocean: 「我自己都没看懂这个按钮，太有歧义了」).
  '周回顾跑完了，在左边「周回顾」里': 'Weekly review done — it is under “Weekly review” on the left',
  '{action}：AI 有回话，在右边等你过目':
    '{action}: the AI wrote it — it is on the right, waiting for you',

  // The AI engine settings tab (§9.2 R5).
  'AI 引擎': 'AI engine',
  '用哪个引擎、用哪个模型、这周花了多少——都在右侧栏最上面那一行，就在动作旁边。':
    'Which engine, which model and what this week cost are all on the top line of the right panel, next to the actions themselves.',
  '显示 AI 维护动作': 'Show the AI maintenance actions',
  '需要 MCP 那一页的两个开关都打开——AI 维护的产出是写回一块，读权限不够用。':
    'Both switches on the MCP tab must be on — AI maintenance produces a block, and read access is not enough for that.',
  '现在还不会出现：MCP 那一页的「MCP 服务」和「允许 AI 写入」要都打开。':
    'Not showing yet: “MCP service” and “Let AI write” on the MCP tab both need to be on.',
};
