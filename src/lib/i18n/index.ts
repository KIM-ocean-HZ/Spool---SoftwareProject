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
  // WORKPLAN-2026-08-20 §2.3 — Settings → 通用. A fresh install seeds this project itself;
  // the row is for libraries older than the feature, and for getting the sample back.
  '载入示例项目': 'Load the sample project',
  '一个已经攒了几周的项目，用来看打包出来是什么样。不需要了整条删掉即可。':
    'A project with a few weeks already in it, so you can see what a pack looks like. Delete the whole thing when you are done with it.',
  '载入': 'Load',
  '已载入': 'Loaded',
  // WORKPLAN-2026-08-20 §2.2 — the card shown BEFORE the macOS grant dialog. macOS's own
  // sentence is "Spool would like to monitor input from your keyboard", which for a
  // product that never goes online is the worst possible first sentence about itself.
  // ⚠️ Keep these three lines true to double_tap.rs: with the grant the tap watches
  // FlagsChanged + LeftMouseDown + KeyDown, and the KeyDown branch stores one timestamp
  // when the chord is ⌘C/⌘X. Nothing typed is retained.
  '系统马上会问你要键盘权限': 'macOS is about to ask for keyboard access',
  'Spool 用它分辨两件事：你有没有连按两下 ⌥，以及你按 ⌥ 之前是不是刚按了 ⌘C。':
    'Spool uses it to tell two things apart: whether you tapped ⌥ twice, and whether you had just pressed ⌘C before you did.',
  '你打的字一个都不存。按下 ⌘C 时它只记一个时间点，别的按键看完就扔。':
    'Nothing you type is kept. A ⌘C press leaves one timestamp behind; every other key is looked at and dropped.',
  'Spool 不联网，开了这个权限也一样：没有服务器，没有账号，你存的东西只在这台电脑上。':
    'Spool does not go online, and this permission does not change that: no server, no account, what you save stays on this computer.',
  '先不开': 'Not now',
  '继续': 'Continue',
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
  // 2026-08-19 — the correction, shown under the sentence it is about rather than as a pointer
  // somewhere else. 「你写的」 is the whole author distinction on screen: an AI's correction
  // carries its client label instead.
  '更正': 'Correction',
  '你写的': 'yours',
  '解除': 'Unlink',
  '解除这条更正关系（那一块本身留着）': 'Unlink this correction (the block itself stays)',
  '更正选中的这一句': 'Correct the selected sentence',
  // The floating prompt, beside 「标为重点?」 — Ocean 2026-08-19:「点击工具栏摩擦太大了」.
  '更正这里?': 'Correct this?',
  '先选中写错了的那一句': 'Select the sentence that is wrong first',
  '更正这一句：': 'Correcting:',
  '写下正确的说法': 'Write what is right',
  '保存更正': 'Save correction',
  '更正没能保存。': 'The correction could not be saved.',
  '这段选区跨了格式标记，Spool 定位不到原句。请只选一句完整的原文。':
    'That selection crosses a formatting marker, so Spool cannot find the sentence again. Select one whole sentence of the text as written.',
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
  // 情人节限定版 (2026-08-19) — the same four facts the spool states, said about the heart that
  // replaces it in that theme (Sidebar/HeartMeter). Separate keys rather than one set of
  // metaphor-free strings: 「线轴」 is the product's own name made visible and 「爱心」 is the point
  // of the edition, so neither can be flattened into 「进度」 to save four entries.
  '爱心：每 100 条捕捉填满一颗': 'One heart holds 100 captures',
  '还差 {n} 条填满': '{n} more to fill it',
  '这颗心填满了': 'This heart is full',
  '已填满 {n} 颗心': '{n} hearts filled',
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
  '去下载': 'Get it',
  '装好后这里就能一键接入': 'Once installed, one-click connect works here',
  '这一块的编号 — AI 说「#12」指的就是它。点一下定位':
    'This block\u2019s number — when an AI says \u201c#12\u201d, this is what it means. Click to locate it',
  // 2026-08-18 (Ocean, Windows 验收 #4): the MCP page's prose collapsed into one ▸.
  '详细说明：接好后在哪儿说、会改哪些文件':
    'Details: where to ask once connected, and which files hooking up touches',
  '在哪儿说，说什么': 'Where to ask, and what to say',
  '接入会动到哪些文件': 'Which files hooking up touches',
  '每个客户端各自的配置文件（写之前自动备份成 .bak）。另外，接 Codex 和 Claude Code 时，还会往它们的说明文件（~/.codex/AGENTS.md、~/.claude/CLAUDE.md）里补一段：告诉 AI 你说的项目名先来 Spool 查一次，别去改同名的本地文档。删掉 spool:begin 和 spool:end 之间那段就能移除。':
    "Each client's own config file (backed up to .bak first). Hooking up Codex or Claude Code also appends a section to their instruction files (~/.codex/AGENTS.md, ~/.claude/CLAUDE.md) telling the AI to look a project name up in Spool before editing a local document of the same name. Delete everything between spool:begin and spool:end to remove it.",
  'Codex 那份配置是三个东西共用的：ChatGPT 桌面端里的 Codex 对话、Codex CLI、编辑器插件。ChatGPT 的普通对话走的是云端，够不着这台电脑。':
    "That one Codex config serves three things: the Codex conversation in the ChatGPT desktop app, the Codex CLI, and the editor extensions. An ordinary ChatGPT conversation runs in the cloud and cannot reach this machine.",
  'ChatGPT 的普通对话连不上本机——用不了 Spool':
    'An ordinary ChatGPT conversation cannot reach this machine — no Spool there',
  'Visual Studio Code 接完还要点两下': 'Visual Studio Code needs two more clicks',
  '你的 AI 工具不在上面？': 'Your AI tool is not on the list?',
  '复制配置': 'Copy config',
  '复制这段，粘进它自己的 MCP 设置页。': "Copy this and paste it into that tool's own MCP settings page.",
  '还有别的东西连过': 'Something else has connected',
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
  // 2026-08-12 — the one client row whose product name covers two different capabilities.
  // "Codex" alone is accurate and unfindable; this is what keeps the word ChatGPT on the row
  // while saying which half of it works.
  '把这个项目的问题复制好，并跳到 {app}': 'Copy the question about this project and jump to {app}',
  // 2026-08-17 (Ocean, Windows 验收): the badge said 已接入 and the AI panel still could not
  // see Spool — every client reads its config at launch, and VS Code additionally refuses to
  // start a server that appeared while it was not looking. These say what is left to do.
  '{name}：开一个新的终端窗口，接上的是新开的那个。':
    '{name}: open a NEW terminal window — that is the one that will be connected.',
  '{name}：完全退出再打开（不是关窗口，是退出整个程序）。':
    '{name}: quit it completely and reopen (quit the app, not just the window).',
  '{name}：完全退出再打开。要是 AI 面板里还看不到 Spool——按 ⌘⇧P，输入 MCP: List Servers，选 spool，点 Start Server。':
    '{name}: quit it completely and reopen. If the AI panel still cannot see Spool — press ⌘⇧P, type MCP: List Servers, pick spool, click Start Server.',
  '把 Visual Studio Code 整个退出，再打开。': 'Quit Visual Studio Code completely, then reopen it.',
  '打开右边的 AI 面板（Copilot Chat），把模式切成 Agent。':
    'Open the AI panel (Copilot Chat) and switch it to Agent mode.',
  '问一句「我在 spool 里有哪些项目？」——列得出来就成了，下面几步不用做。':
    'Ask it “what projects do I have in spool?” — if it lists them you are done; skip the rest.',
  '它要是不知道 Spool：按 ⌘⇧P，输入 MCP: List Servers，选 spool，点 Start Server。':
    'If it does not know Spool: press ⌘⇧P, type MCP: List Servers, pick spool, click Start Server.',
  '还是不行：再按 ⌘⇧P，输入 Developer: Reload Window。':
    'Still nothing: press ⌘⇧P again and run Developer: Reload Window.',
  '为什么要这两下：VS Code 不会自己去跑一个刚冒出来的 MCP 服务，得你点头一次。这一步 Spool 替不了你。':
    'Why the extra clicks: VS Code will not start an MCP server that appeared while it was not looking until you say so once. Spool cannot do that part for you.',
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

  // 2026-08-18 (Ocean, Windows 验收 #1) — the one-time card on the first ✕. Windows only;
  // components/CloseToTrayHint has the reasoning, including why the drag is the user's step.
  'Spool 没有退出': 'Spool is still running',
  '它还在后台跑着——捕捉快捷键要它活着才能用。':
    'It keeps running in the background — the capture shortcut needs it alive.',
  '图标在屏幕右下角的 ∧ 里面。把它拖到任务栏上，以后就一直看得见了。':
    'Its icon is under the ∧ at the bottom-right of your screen. Drag it onto the taskbar and it will stay in sight.',
  '要它回来：单击那个图标。要真的退出：右键那个图标 → 退出。':
    'To bring it back: click that icon. To really quit: right-click it → Quit.',
  '知道了': 'Got it',
  // 撤销确认卡片上的动作名（overlay/CaptureOverlay UNDO_OP_LABEL）。2026-08-18 新增 'create'
  // —— 自己在输入框里写下的一块，跟「捕获」是两回事。
  '写下的一条': 'the line you wrote',
  '界面语言。切换立即生效。': 'UI language. Takes effect immediately.',
  // 情人节限定版 (2026-08-19) — the appearance switch, and the break card the theme brings with
  // it. Ocean: 「中英文都支持」.
  '外观': 'Appearance',
  '配色、标题字体和背景。切换立即生效，不影响你存的东西。':
    'Colours, title face and background. Takes effect immediately; nothing you saved is touched.',
  '经典': 'Classic',
  '情人节': "Valentine's",
  // 休息提醒 (2026-08-19 second pass) — the lock, the sidebar clock and the Settings section.
  // ⚠️ 「歇一会儿」 and not 「休息提醒」 on the lock itself: it speaks to the person, it does not
  // name a feature. The feature is named only in Settings, where a name is what you look for.
  '歇一会儿': 'Take a break',
  '你已经连着专注 {n} 分钟了。站起来活动一下——走两步，喝口水，看看窗外。':
    "You've been focused for {n} minutes straight. Get up and move — walk a bit, get some water, look out a window.",
  // The one sentence out of the study that answers the objection people actually have.
  '「活动 5 分钟，心情会变好、疲劳会减轻，而工作效率并不会因此下降。」':
    '\u201cFive minutes of movement lifts your mood and eases fatigue \u2014 and your output does not drop for it.\u201d',
  '——《英国运动医学杂志》2026 年，近两万人的真实世界研究':
    '\u2014 British Journal of Sports Medicine, 2026; a real-world study of nearly 20,000 adults',
  '结束休息，继续工作': 'End the break, back to work',
  '倒计时走完，它会自己解开': 'It unlocks itself when the countdown runs out',
  '已连续专注 {n} 分钟': 'Focused for {n} min',
  // 休息提醒的浮窗 (Ocean 2026-08-22) — it floats over whatever app the user is in, so it
  // says the number rather than 「时间到了」: a card that interrupts has to be worth the
  // interruption in its first line.
  '已经专注 {n} 分钟了，起来动一动': "That's {n} minutes straight — get up and move",
  '点一下回到 Spool 开始休息': 'Click to go back to Spool and start the break',
  '这次不休息': 'Skip this one',
  '{n} 分钟后歇一会儿': 'Break in {n} min',
  '休息提醒': 'Break reminder',
  '连续工作到点，窗口会锁上 5 分钟，提醒你站起来活动一下。两种外观都有。':
    'After a stretch of unbroken work the window locks for 5 minutes to get you up and moving. Available in both appearances.',
  '连续工作多久提醒一次': 'Remind me after',
  '休息固定 5 分钟——研究里三种节奏都是 5 分钟，变的只有工作时长。':
    'The break is always 5 minutes — all three schedules in the study used 5; only the work interval changed.',
  '{n} 分钟': '{n} min',
  '（推荐）': ' (recommended)',
  '为什么是 60 分钟：近两万人的研究怎么说':
    'Why 60 minutes: what a study of nearly 20,000 people found',
  '发表于 2026 年最新一期《英国运动医学杂志》上的一项研究，让近两万名成年人在真实的工作环境里试了三种节奏：每 30、60 或 120 分钟起来活动 5 分钟。':
    'A study in the latest 2026 issue of the British Journal of Sports Medicine had nearly 20,000 adults try three rhythms in their real working environments: 5 minutes of movement every 30, 60 or 120 minutes.',
  '结果是：30 分钟一次在减轻疲劳上效果最强，但在实际工作中往往让人觉得太频繁、难以长年坚持。综合「提升心情、缓解疲劳」与「保持工作效率不下降」这两个维度，每 60 分钟活动 5 分钟被证明是最能被大众接受、也最能长期做下去的「黄金频率」。':
    'The finding: breaking every 30 minutes relieved fatigue most strongly, but in real work it felt too frequent for people to keep up year after year. Weighing both \u201cbetter mood, less fatigue\u201d and \u201cno drop in productivity\u201d, 5 minutes of movement every 60 minutes proved to be the \u201cgolden frequency\u201d — the one most people accept and can sustain.',

  // DESIGN_AI_ENGINE §1.4 / §3 / §7 — the on-machine engine slot (claude or codex).
  '本机 AI 引擎': 'On-machine AI engine',
  // 2026-08-18 (Ocean): the resting line names the product, not the executable — see
  // Settings/EngineConfig's ① note. Versions and paths moved behind 详细说明.
  '装了 Claude Code、Codex 或 Gemini CLI，就能让它替你整理项目。用你自己已经登录的那个，Spool 不存 API key。':
    'With Claude Code, Codex or the Gemini CLI installed, one of them can tidy your projects for you. It runs through the tool you are already signed into — Spool stores no API key.',
  '✓ 已连接 {name}': '✓ Connected to {name}',
  '✓ 已连接 {name}（还装了另外 {n} 个）': '✓ Connected to {name} ({n} more installed)',
  '详细说明：要装什么、装在哪、各家的限制':
    'Details: what to install, where it lives, what each one limits',
  '检测到你装了 Claude Code 或 Codex 时，项目菜单里会多出「让 AI 维护」——用你自己已经登录的那个 CLI 跑，Spool 不存任何 API key，也不联网。':
    'When Claude Code or Codex is detected on this machine, a "Let AI maintain" group appears in the project menu. It runs through the CLI you are already logged into — Spool stores no API key and still never goes online.',
  '检测中…': 'Checking…',
  '没检测到 Claude Code、Codex 或 Gemini CLI': 'No Claude Code, Codex or Gemini CLI found',
  '装 Claude Code': 'Get Claude Code',
  '装 Codex': 'Get Codex',
  '装 Gemini CLI': 'Get Gemini CLI',
  // 2026-08-17 (Ocean): 「AI 引擎是被动搜索形式的……根本不知道需要什么,或者 api key 要放在哪里」.
  '引擎不是 Spool 的一部分，是你自己装在电脑上的命令行工具（Claude Code / Codex / Gemini CLI）。装好之后在终端里登录一次它自己的账号，Spool 就能借它干活。':
    'An engine is not part of Spool. It is a command-line tool you install yourself (Claude Code / Codex / Gemini CLI) and sign into once in a terminal; Spool then borrows it.',
  '所以 Spool 里没有填 API key 的地方，以后也不会有：key 和登录状态都在那个工具自己的目录里（比如 Gemini 是 ~/.gemini/.env），Spool 不存、也读不到。你的账单也走那边。':
    'So there is no place to put an API key in Spool, and there never will be: the key and the login live in that tool’s own directory (Gemini’s is ~/.gemini/.env). Spool neither stores nor reads them, and the billing is theirs too.',
  '装完这里还是写「没检测到」，多半是它装在了 Spool 没找的地方。终端里敲 which claude（或 codex / gemini）看一眼路径，填到下面那一行就行。':
    'If this still says “not detected” after installing, it probably landed somewhere Spool did not look. Run `which claude` (or codex / gemini) in a terminal and paste the path into the field below.',
  '不装也没关系——AI 那半边主要走 MCP（上一页），那条路不需要这些。':
    'Installing one is optional — the main AI route is MCP (previous tab), which needs none of this.',
  '手动指定 CLI 路径': 'Point at the CLI yourself',
  '只在没检测到、但你确定装了的时候用。文件名要还是 claude / codex / gemini——Spool 靠它认出是哪个引擎。':
    'For when it is installed but not detected. Keep the file name claude / codex / gemini — that is how Spool tells which engine it is.',
  '留空 = 自动找': 'Empty = search automatically',
  '选文件': 'Choose a file',
  '这个路径没认出来：要么文件不在，要么名字不是 claude / codex / gemini，要么它跑 --version 跑不通。':
    'That path did not resolve: the file is missing, its name is not claude / codex / gemini, or it does not answer --version.',
  // DESIGN_AI_ENGINE §7.8 — measured, not hedged: 20 requests per model per day, and one
  // follow-up run spends all of them. Per §7.4 the word 免费 never stands alone.
  'Gemini CLI 走的是 Gemini API 的免费额度：每个模型每天大约 20 次请求。压缩和体检够用，联网跟进不够——所以那一项在这个引擎上不出现。API key 配在 gemini 自己那里（~/.gemini/.env），Spool 不存、也读不到。':
    "The Gemini CLI runs on the Gemini API's free allowance: roughly 20 requests per model per day. That is enough for Compress and Check over, and not enough for a web follow-up — so that one action does not appear on this engine. Your API key lives in the CLI's own config (~/.gemini/.env); Spool neither stores it nor can read it.",
  'Gemini 免费额度按模型分开算，每个每天大约 20 次。用完了换一个模型还能接着跑。':
    "Gemini's free allowance is counted per model — about 20 runs a day each. When one is used up, switching model gets you going again.",
  '联网搜索这一项 Gemini CLI 跑不了——它的免费额度一次跟进就用完了。换成 Claude Code 或 Codex 才有。':
    'The Gemini CLI cannot carry a web follow-up — one run uses up its whole free allowance. Switch to Claude Code or Codex for this one.',
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
  // 2026-08-18 (Ocean, Windows 验收 #5): what replaces the drafting button when there is no
  // local CLI — the list is not an engine feature, so its absence needs naming, not hiding.
  '这台电脑上没有本机 AI 引擎，所以 Spool 自己不会去查这几行。接了 MCP 的 AI（Claude、ChatGPT 里的 Codex 等）读得到它们，也能替你加一条、结束一条。':
    'No AI engine on this machine, so Spool will not go and check these lines itself. The AI you connected over MCP (Claude, Codex inside ChatGPT, …) can read them, add one, and close one for you.',
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
  '剪贴板为空 — 先按 Ctrl+C 复制要捕捉的内容，再双击 Ctrl':
    'Clipboard is empty — copy something with Ctrl+C first, then double-tap Ctrl',
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
  // 2026-08-22 的一键暂停。菜单栏那一项带着按键名 —— 点开它的人正在别的软件里，
  // 要一眼看出松开的是哪个键。
  '暂停捕捉手势（双击 ⌥）': 'Pause capture (double-tap ⌥)',
  '暂停捕捉手势（双击 Ctrl）': 'Pause capture (double-tap Ctrl)',
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
  // 2026-08-18 (Ocean, Windows 验收 #20): the recorder used to take Ctrl+Z, which is a
  // global hotkey — Undo then stops working in every other program on the machine. The
  // nouns below are what each refused chord would cost; ⌘Z / ⌃Z already sit further down
  // this file (Undo / Redo / Copy), so only the missing ones are added here.
  '{chord} 是所有软件通用的「{what}」——绑成全局键，别的软件里就按不了了。再加一个 ⇧ 或 ⌥ 试试。':
    '{chord} is what every program uses for “{what}” — bound globally it stops working everywhere else. Try adding ⇧ or ⌥.',
  '剪切': 'Cut',
  '粘贴': 'Paste',
  '全选': 'Select all',
  '保存': 'Save',
  '查找': 'Find',
  '打印': 'Print',
  '新建': 'New',
  '打开': 'Open',
  '关闭窗口': 'Close window',
  '新建标签页': 'New tab',
  '退出': 'Quit',
  '按键中…': 'Press keys…',
  '捕捉快捷键': 'Capture shortcut',
  '内置手势：⌘C 复制后 10 秒内双击 ⌥ 捕捉剪贴板，弹窗里可直接打字留一句想法。以下快捷键可自定义。':
    'Built-in gesture: within 10 s of copying (⌘C), double-tap ⌥ to capture the clipboard — then just type in the popup to leave a note. The shortcuts below are customizable.',
  '可选 — 双击 ⌥ 之外的备用捕捉键': 'Optional — a fallback capture key besides double-tap ⌥',
  '内置手势：复制后双击 Ctrl 捕捉剪贴板，弹窗里可直接打字留一句想法。以下快捷键可自定义。':
    'Built-in gesture: copy something, then double-tap Ctrl to capture the clipboard — then just type in the popup to leave a note. The shortcuts below are customizable.',
  '备用 — 双击 Ctrl 之外的捕捉键': 'A fallback capture key besides double-tap Ctrl',
  '暂停捕捉手势': 'Pause the capture gesture',
  '别的软件也要用 ⌥ 的时候，把它关掉，那个键就还给别人了。菜单栏的 Spool 图标里也有这个开关，人在别的软件里就能就地关。':
    'When another app needs ⌥ too, turn this off and the key goes back to it. The same switch is in the Spool icon in the menu bar, so you can do it without leaving that app.',
  '别的软件也要用 Ctrl 的时候，把它关掉，那个键就还给别人了。菜单栏的 Spool 图标里也有这个开关，人在别的软件里就能就地关。':
    'When another app needs Ctrl too, turn this off and the key goes back to it. The same switch is in the Spool icon in the notification area, so you can do it without leaving that app.',
  '已随上面的开关一起暂停': 'Paused along with the switch above',
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
  // ---------------------------------------------------------------------------------------
  // 形态 C：Spool 自己调 API 压缩上下文（WORKPLAN-2026-08-20 §6.2 / §6.4.1）
  //
  // ⚠️ 这一组里有几句是**在改一句对外说了很久的话**（§6.3 把「永不联网」精确化）。
  // 英文这一侧不是意译：它跟中文一样,必须把「谁发的请求、用谁的额度、内容到了谁那里」
  // 三件事说全。少说一件,英文用户读到的就是一个比中文更宽的承诺。
  '让 Spool 自己调 AI 压缩上下文': 'Let Spool call an AI to compress a briefing',
  'Spool 主程序不发任何网络请求。打开这个开关之后，请求由 Spool 启动的一个本地小程序发出，用你自己的 key 和额度，内容会到达你选的那家模型厂商。':
    'Spool itself makes no network request. With this on, the request is sent by a small program Spool starts on this machine, using your own key and your own credit, and what you send reaches the model vendor you picked.',
  '已经装了 claude / codex 这类命令行工具的话，用「AI 引擎」那一节就行，一分钱不花、一个 key 不用填。这一节是给不想装命令行工具的人的第二条路。':
    'If you already have a CLI like claude or codex, use the section below instead — it costs nothing and needs no key. This section is the other route, for people who would rather not install one.',
  'key 存在你这台电脑上一个单独的文件里，只有你的账号能读。它不会进设置文件，也不会跟着导出的库走。':
    'The key is kept in a file of its own on this machine, readable only by your account. It never goes into the settings file, and it does not travel with an exported library.',
  '接口地址': 'Endpoint',
  '思考力度': 'How hard it thinks',
  // '默认' 上面第 930 行已经有了，不重复。
  '关掉': 'Off',
  '实测下来，一次压缩里大约九成的钱和九成的时间花在「思考」上。调低它能省多少、质量掉不掉，这几个值都试一次就知道。不认的值会被接口顶回来，那一次不收费。':
    'Measured: about nine tenths of both the bill and the wait goes on thinking rather than on compressing. Whether turning it down saves that — and what it costs in quality — is one run per value away. A value the endpoint rejects is not billed.',
  '模型': 'Model',
  '单次最长等待（秒）': 'Longest wait per run (seconds)',
  '必须是 https 开头 —— 用普通 http 的话，你的 key 会明文发出去。':
    'This must start with https:// — over plain http your key would go out in the clear.',
  '找不到负责联网的那个小程序（spool-ai）。重装一次 Spool 应该能修好。':
    'The program that does the networking (spool-ai) is missing. Reinstalling Spool should fix it.',
  '显示': 'Show',
  '隐藏': 'Hide',

  // 并排核对
  // '压缩' / '停下' 上面已经有了（第 679 / 942 行），这里不重复。
  '压多狠?': 'How hard?',
  '只删重复': 'Only drop repeats',
  '保留结论和数字': 'Keep conclusions and numbers',
  '压到最短': 'As short as it goes',
  '同一件事在别处说过了才合并。实测压完剩 73–100% —— 项目里没有重复的话，它几乎不会变短。':
    'Merges a thing only once it has been said elsewhere. Measured: 73–100% left — with no repeats in the project, it barely shortens anything.',
  '去冗余，但结论、日期、数字、金额、人名一字不改。实测压完剩 60–100%，看这个项目里有多少重复。':
    'Removes redundancy, but conclusions, dates, numbers, sums and names stay word for word. Measured: 60–100% left, depending on how much this project repeats itself.',
  '只留结论、数字和你自己写的东西。实测压完剩 68–81%（5 次，只在一个项目上跑过）—— 并不比上一档更短。':
    'Keeps conclusions, numbers and what you wrote yourself. Measured: 68–81% left (5 runs, one project only) — no shorter than the level above.',
  '⚠️ 实测：压多少主要取决于这个项目里有多少重复，不取决于你选哪一档。':
    '⚠️ Measured: how much comes off depends mostly on how much this project repeats itself, not on which level you pick.',
  '开始压缩': 'Compress',
  '再压一次': 'Compress again',
  '正在启动联网的那个小程序…': 'Starting the program that does the networking…',
  '请求已经发出去了，正在等它开口…': 'The request is out — waiting for it to start…',
  '模型在思考…已经想了 {n} 字，还没开始写': 'Thinking… {n} characters of reasoning so far, nothing written yet',
  '正在写压缩稿…已经写了 {n} 字': 'Writing the briefing… {n} characters so far',
  '⚠️ 这一档模型会先想完再动笔。上面那个数字一直在涨，就说明它没卡住。':
    '⚠️ This model thinks the whole thing through before writing. As long as that number keeps rising, it is not stuck.',
  '上面那个字数一直在涨，就说明它在正常干活。':
    'As long as that count keeps rising, it is working normally.',
  '压缩稿写到一半连接断了，没拿到完整的一份。⚠️ 半份稿子看起来和「删得很狠」一模一样，所以没有交给你。把设置里的「单次最长等待」调大，或者换个小一点的打包范围。':
    'The briefing was cut off partway, so no complete version came back. ⚠️ A half-written briefing looks exactly like an aggressively compressed one, so it is not shown. Raise “Longest wait per run” in Settings, or pack a smaller range.',
  '已经等了 {n} 秒（最长等 {max} 秒）': 'Waited {n}s so far (it gives up after {max}s)',
  '停下（{n}s）': 'Stop ({n}s)',
  '这个模型把整次回复都用来「思考」了，正文一个字都没写出来。换一个不思考的模型（比如 pro 那一档里的非推理款），或者把范围缩小一点再试。':
    'This model spent the whole reply thinking and wrote no briefing at all. Try a model that does not reason, or pack a smaller range.',
  '结果被输出长度掐断了，没拿到完整的压缩稿。换个小一点的打包范围再试。':
    'The reply was cut off before a complete briefing came back. Try a smaller pack range.',
  '点右下角开始。': 'Press the button at the bottom right to start.',
  '压缩稿': 'Compressed',
  '复制压缩稿': 'Copy the compressed version',
  '复制这次的数据': 'Copy this run\u2019s numbers',
  '把这一次的 token 数、缓存命中、耗时、估算金额拷走':
    'Copy this run\u2019s token counts, cache hits, duration and estimated cost',
  '原始 {a} 块 → 压缩后 {b} 块': '{a} blocks → {b} blocks',
  '{a} → {b} 字符（剩 {p}%）': '{a} → {b} characters ({p}% left)',
  '用了 {n} 秒': 'took {n}s',
  '少了整节：{s}': 'A whole section is gone: {s}',
  '少了 {n} 条你自己写的内容': '{n} things you wrote yourself are gone',
  '少了 {n} 处你划的重点': '{n} of your highlights are gone',
  '你的批注、你自己写的内容、你划的重点，一条都没少，也没有多。':
    'Your annotations, the things you wrote and your highlights all survived — and nothing was invented.',
  '⚠️ 它凭空写了 {n} 条你没写过的批注：{s}':
    '⚠️ It invented {n} annotation(s) you never wrote: {s}',
  '它说它删的是：{s}': 'It says it cut: {s}',
  '⚠️ 它没有说自己删掉了什么。': '⚠️ It did not say what it cut.',
  '这一次：输入 {i} token，输出 {o} token': 'This run: {i} tokens in, {o} tokens out',
  '，其中 {c} 命中了缓存': ', {c} of them cache hits',
  '，这家接口没有报缓存命中': ', and this endpoint does not report cache hits',
  '。按官方价目算大约 {y}{u}': '. At the published prices that is about {y}{u}',
  '（按全部未命中算，这是上限）': ' (counted as all misses, so this is an upper bound)',
  '。认不出这个模型的价目，所以不报价。':
    '. The price list for this model is not known here, so no cost is shown.',

  // 失败的每一类各说各的（§6.2 约束 4）。⛔ 不许塌成一句 "It failed."
  '这个 key 被拒绝了。检查一下是不是复制少了字符，或者已经被吊销。':
    'The key was rejected. Check whether it was copied in full, or whether it has been revoked.',
  '账户余额不足，这次没跑成。去模型厂商那边充值后再试。':
    'The account is out of credit, so this run did not happen. Top it up with the vendor and try again.',
  '被限流了——刚才请求太密。等一会儿再点一次。':
    'Rate limited — too many requests just now. Wait a little and press it again.',
  '模型太久没回话，已经停掉了。可以在设置里把超时调长，或者换个小一点的范围。':
    'The model took too long and was stopped. Raise the timeout in Settings, or pack a smaller range.',
  '连不上那个地址。检查网络，或者确认设置里的接口地址没写错。':
    'Could not reach that address. Check your connection, or the endpoint in Settings.',
  '模型厂商那边出错了，不是你的问题。过一会儿再试。':
    'The vendor had a server-side error — nothing you did. Try again shortly.',
  '设置有问题：接口地址必须是 https 开头，而且 key 不能是空的。':
    'Something is wrong in Settings: the endpoint must start with https:// and the key must not be empty.',
  '对方回来的东西看不懂，可能不是一个 OpenAI 兼容的接口。':
    'The reply made no sense — this may not be an OpenAI-compatible endpoint.',
  '接口返回了一个错误。': 'The endpoint returned an error.',
  'Spool 自己出错了。': 'Spool itself hit an error.',

  // WORKPLAN-2026-08-20 §9.6 —— 压缩搬进右侧栏 + 按块核对（2026-08-21）。
  '压缩这个项目': 'Compress this project',
  '把这个项目的上下文压短一点，压完一块一块给你核对':
    'Shorten this project\u2019s context, then check it block by block',
  '把这一块压短（压完给你核对，不改库）':
    'Shorten this one block (you check the result; nothing is written)',
  '压缩《{name}》': 'Compressing {name}',
  '压缩《{name}》的第 {n} 块': 'Compressing block #{n} of {name}',
  '一块对一块地核对。这一步不会改动你的库 —— 压缩稿只在这个界面里。':
    'Checked block by block. Nothing here touches your library — the compressed version lives only on this screen.',
  '这一步不会改动你的库 —— 压缩稿只在这个界面里。':
    'Nothing here touches your library — the compressed version lives only on this screen.',
  '⚠️ 「只删重复」这一档在单块上基本无事可做：压缩干的主要活是合并重复，而重复是跨块的 —— 单独压一块，它看不见别的块。要删重复，压整个项目。':
    '⚠️ \u201cOnly drop repeats\u201d has almost nothing to do on a single block: merging repeats is the main job, and repeats live ACROSS blocks — one block on its own cannot see the others. To drop repeats, compress the whole project.',
  '单独压一块，它只能把这一块自己的话说短，看不见别的块，也就删不掉跨块的重复。一块特别长（比如一整篇网页正文）的时候最划算。':
    'On its own, a block can only be said more briefly — it cannot see the other blocks, so it cannot drop repeats across them. Worth it when one block is very long (a whole web page, say).',

  // §9.6.1 ②：目标从一句空话变成一个读数。
  '这个目标是发给模型的提示词里写着的那一个，不是事后编的':
    'That target is the one written into the prompt the model was sent — not one invented afterwards',
  '这一档的目标是压到 {lo}–{hi}%，这次是 {p}%':
    'This level aims for {lo}–{hi}%; this run came out at {p}%',
  '⚠️ 这一档的目标是压到 {lo}–{hi}%，这次是 {p}% —— 没达标':
    '⚠️ This level aims for {lo}–{hi}%; this run came out at {p}% — target missed',

  // §9.6.5 ④：按块配对，配不上要明说。
  '有 {n} 块在压缩稿里找不到 —— 下面按块标了出来。':
    '{n} block(s) are nowhere in the compressed version — marked block by block below.',
  '有 {n} 块是它自己编出来的编号。': '{n} block(s) carry numbers the original never had.',
  '⚠️ 有 {n} 块在压缩稿里出现了不止一次（#{s}）—— 它把同样的内容写了两遍，这一份不能用。':
    '⚠️ {n} block(s) appear more than once (#{s}) — it wrote the same content twice, so this version is unusable.',
  '有本来要求一字不改保留的东西不见了 —— 下面按块标了出来：':
    'Something that had to survive word for word did not — marked block by block below:',
  '少了 {n} 条批注': '{n} annotation(s) are gone',
  '少了 {n} 条引用/替代关系 —— 这一块引的是哪一条、替代了哪一条，没了':
    '{n} citation/supersession link(s) are gone — which block this one cites or replaces is no longer recorded',
  '⚠️ 有 {n} 处它把成对引号「“”」换成了直引号 —— 内容没变，但「一字不改照抄」这条已经破了。':
    '⚠️ In {n} place(s) it swapped curly quotes for straight ones — the content is unchanged, but \u201ccopy word for word\u201d has been broken.',
  '⚠️ 这一份没法按块对照 —— 压缩稿里切不出 pack 的条目格式（模型没照 #编号 那一行写）。退回整份文本对照。':
    '⚠️ This one cannot be compared block by block — the compressed version has no pack entry lines (the model did not keep the #number format). Falling back to whole-text comparison.',
  '原文': 'Original',
  '（原文里没有这一块）': '(the original has no such block)',
  '⚠️ 这一块在压缩稿里找不到': '⚠️ This block is nowhere in the compressed version',
  '⚠️ 原文里没有这一块 —— 它自己编了一个编号':
    '⚠️ The original has no such block — it invented this number',
  '它把这一块整个删掉了，或者合并进了别的块。左边那些话现在没有出处 —— 自己确认一遍。':
    'It dropped this block entirely, or merged it into another one. Nothing on the left has a home any more — check for yourself.',
  '少了一条批注：{s}': 'An annotation is gone: {s}',
  '它把这一块的批注改写了 —— 下面是改之前和改之后：':
    'It rewrote this block\u2019s annotation — before and after:',
  '少了你划的重点：{s}': 'A highlight of yours is gone: {s}',
  '少了一条引用/替代关系：{s}': 'A citation/supersession link is gone: {s}',
  '⚠️ 有 {n} 个数字/日期在压缩稿里再也找不到了：{s}':
    '⚠️ {n} number(s)/date(s) are nowhere in the compressed version: {s}',
  '⚠️ 这一块里有 {n} 个数字/日期没了：{s}':
    '⚠️ {n} number(s)/date(s) are gone from this block: {s}',
  '⚠️ 它写了一条你没写过的批注：{s}': '⚠️ It wrote an annotation you never wrote: {s}',
  '压掉 {a} 句 · 它自己写了 {b} 句': '{a} line(s) cut · {b} line(s) it wrote itself',

  // §9.6.4 ⑥：睡前排队、起床核对。
  '今晚 {at} 一起压（还有 {n} 个）': 'Compress together at {at} tonight ({n} queued)',
  '排进「一起压」（还有 {n} 个）': 'Queue for the batch ({n} queued)',
  '几点跑': 'Run at',
  '取消定时': 'Cancel the schedule',
  '现在就跑': 'Run now',
  '量一下…': 'measuring…',
  '{k} 千字': '{k}k characters',
  '{k} 千字 · 约 {y}': '{k}k characters · about {y}',
  '合计（估算）': 'Total (estimated)',
  '约 {y}': 'about {y}',
  '正在按队列一个一个压…压完的会在这儿等你核对。':
    'Working through the queue one at a time — finished ones wait here for you.',
  '《{name}》压好了，等你核对': '{name} is compressed and waiting for you',
  '《{name}》没压成：{why}': '{name} did not compress: {why}',
  '核对完了，从单子上去掉': 'Checked — take it off the list',
  '这个项目已经不在了': 'that project is gone',
  '这个项目的上下文组不出来：{msg}': 'Could not assemble this project\u2019s context: {msg}',
};
