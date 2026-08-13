/* Chinese copy for the site, keyed by the data-i18n attributes in the English
   HTML. Build input only — scripts/build-site-zh.mjs bakes these strings into
   site/zh/*.html, so this file is not shipped to the browser.

   The English page and the product behavior are the factual source. Chinese is
   rewritten for clarity rather than mirrored word by word. Terms stay stable:
   Workspace 工作区; Project 项目; note/block 笔记; annotation 批注;
   the action 打包 and its output Pack; source label 来源标注; Follow Up 跟进;
   Weekly Review 周回顾; proposal/review queue 提议/待审队列;
   retire/correction 作废/更正; Input Monitoring 输入监控;
   Accessibility 辅助功能; Automation 浏览器自动化. */

/* <head> per page: the English HTML's title/description/OG text has no
   data-i18n hook, so it is listed here per page instead. */
export const HEAD = {
  'index.html': {
    title: 'Spool 思簿 — 在 Mac 上保存项目背景，一次交给任何 AI',
    description:
      'Spool 把长期项目的背景保存在你的 Mac 上。复制内容并连按两下 ⌥，即可连同来源存入当前项目；随后一键生成 Pack，粘贴给任何 AI，或让已连接的 AI 直接读取。AI 提议写回的内容会先等你确认。免费、可离线使用、无需账号。',
    ogTitle: 'Spool 思簿 — 项目背景，只需解释一次',
    ogDescription:
      '在 Mac 上保存长期项目的背景，一键生成 Pack 交给任何 AI，也可让已连接的 AI 直接读取。免费、可离线使用、无需账号。',
    ogImageAlt:
      '完整的 Spool 窗口：左侧是工作区、项目和保存数量，右侧是按时间排列的项目笔记',
  },
  'privacy.html': {
    title: 'Spool 思簿 — 隐私政策',
    description:
      'Spool 隐私政策：无需账号、没有服务器、不做遥测，Spool 自身不会上传数据；只有你主动交给其他程序时，内容才可能离开这台 Mac。',
  },
};

/* Body copy, keyed by data-i18n. */
export const ZH = {
  /* Navigation shared by the generated pages. */
  'nav-try': '试用演示',
  'nav-how': '使用方式',
  'nav-faq': '常见问题',
  'nav-story': '开发故事（英文）',
  'nav-dl': '下载',

  /* Hero. */
  'hero-h1': '同一个项目，<br>不必解释第二遍。',
  'hero-sub': '复制值得保留的内容，再连按两下 <span class="kbd">⌥</span>。内容会存入当前项目，你还可以附上当时的想法。几周后，一次打包就能把完整背景交给任何 AI；交出去的每个字，你都可以先看清楚。',
  'dl-btn': '下载 macOS 版',
  'try-btn': '直接试用，无需下载',
  'chip-free': '免费',
  'chip-arch': '适用于 Apple 芯片 Mac',
  'chip-notarised': '已由 Apple 签名并公证',
  'chip-offline': '可离线使用',

  /* Interactive demo introduction. */
  'demo-k': '无需下载，直接试用',
  'demo-h': '在这里走完整个流程',
  'demo-p': '存下一条笔记并打包，再看一个全新的 AI 对话如何只凭这份背景接上进度。最后，AI 会提议把新的内容写回项目，由你决定是否保留。演示内容已预先编写，交互流程与真实应用一致。',
  'demo-noscript': '交互演示需要 JavaScript；你仍可阅读<a href="../story.html">开发故事（英文）</a>和下方截图。',

  /* The recurring problem. */
  'moment-k': '反复重写的项目背景',
  'moment-p': '周一，你打开新对话，从头说明项目是什么、为谁而做、已经定下什么、哪些方案试过又放弃。周三换一个对话，又得再说一遍；这次写得更短，偏偏漏掉了最重要的部分。<em>使用 Spool，这些背景会在工作过程中逐条保存。一次点击、一次粘贴，AI 就能从你当前的进度继续。</em>',

  /* Who it is for. */
  'w1-h': '持续几个月的项目',
  'w1-p': '已经排除的 bug、选用某个库的理由、第二周就放弃的方案。新对话不再把你带回已经走过的弯路。',
  'w2-h': '一门课、一篇论文、一个研究方向',
  'w2-p': '课堂上没听懂的一句话、以后要引用的论文、终于讲清某个概念的解释。复习时，AI 可以基于你自己的材料提问，而不是泛泛引用网络内容。',
  'w3-h': '每天打开多个从零开始的 AI 对话',
  'w3-p': '不同应用、不同窗口，每个新对话都不了解你的背景。Spool 保存它们缺少的项目上下文，同一份 Pack 可以交给任何一个。',

  /* How it works. */
  'how-k': '使用方式',
  'how-h': '保存、积累、交接',
  'l1-n': '01 · 保存',
  'l1-h': '一次触发，不必分类。',
  'l1-p': '复制任意内容，再连按两下 <span class="kbd">⌥</span>。内容会直接进入当前项目，来源也会一并保存，浏览器内容还会记录标签页标题。确认浮窗出现时，光标已在批注框中：可以写下保存它的原因并按 Enter，也可以点击别处跳过。你的批注比摘录更能说明当时的判断，AI 也会优先读取。',
  'l2-n': '02 · 积累',
  'l2-h': '按时间排列的记录，不是聊天。',
  'l2-p': '保存的内容按时间顺序进入同一个项目。结构只有两层：工作区和项目。无需建立文件夹，也无需选择标签。下次回来时，最新几条笔记就能说明上次停在哪里。',
  'l2-p2': '项目不只保存文字。拖入的文件会留在项目中；笔记里的日期会在临近时显示在项目顶部；不再成立的内容可以标记为作废，也可以在下方补充更正。旧笔记仍保留在原位，并明确显示发生了什么。<strong>任何内容都不会覆盖你写过的原文</strong>。',
  'l3-n': '03 · 交接',
  'l3-h': '一键打包，随处粘贴。',
  'l3-p': 'Spool 会把项目整理成纯文本 Pack：你的原话优先呈现，摘录保留来源，AI 写入的内容明确署名，便于核对。你可以把它粘贴给任何 AI，也可以自己阅读以恢复工作状态。Pack 在本机按固定规则生成并放入剪贴板，不会自动发送到任何地方，内容也可重复核对。',

  /* The Pack excerpt itself stays English because it is real product output. */
  'pack-h': '交给 AI 的，就是这份 Pack。<br>你能查看，AI 也能读取。',
  'pack-p': '这不是 AI 生成的摘要，而是项目里的笔记原文：按时间排列，每条都保留来源。下面是 Spool 真实生成的一份 Pack，只有明确标出的部分被省略。',
  'pack-cap': '这是真实输出，只在一处缩短：开头的阅读规则和标记说明还剩 4192 个字符，已在标示位置省略。<b>Full Record</b> 下的内容与 Spool 输出完全一致。<b>#4</b> 没有来源，表示它由用户本人写下；前面的规则要求 AI 给予它最高权重。<b>#5</b> 由 AI 通过 MCP 写入，带有署名，排在用户笔记之后，并指出它回应的是哪条笔记。<br>（阅读规则原本就是英文，因为它们写给模型读取；你用什么语言保存笔记，Pack 就保留什么语言。）',
  'pack-s1-h': '来源始终保留',
  'pack-s2-h': '用户原话单独标明',
  'pack-s3-h': 'AI 内容署名并标明依据',
  'pack-full': '查看完整的真实 Pack 示例',

  /* Meaningful visual descriptions translated at build time. */
  'alt-logo': 'Spool 标志：从上方看到的线轴，一根线从中向外延伸',
  'alt-capture-page': '完整的浏览器截图：IBM 文章占据窗口，顶部可见标签页和地址，右上角叠着 Spool 保存确认浮窗',
  'alt-capture-source-detail': '同一张浏览器截图的局部：清楚显示文章的标签页标题和 ibm.com 地址',
  'alt-capture-toast': 'Spool 保存提示：显示内容开头、保存到“学习”工作区中的“机器学习课”项目、浏览器标签页来源，以及光标所在的批注框',
  'alt-project-window': '完整的 Spool 窗口：左侧是工作区、项目和保存数量，右侧是按时间排列的项目笔记',
  'alt-project-source-detail': '项目笔记局部：第 2 条来自第 7 讲讲义，保留用户批注和引用原文；第 3 条来自 AI 对话，两条都显示 Safari 来源',
  'alt-project-ai-detail': '项目笔记局部：用户的第 4 条复习计划之后，是署名“Claude · MCP”的 AI 笔记，并带有指向第 4 条的引用',
  'aria-keep-magnifier': '完整项目窗口，上面有两处放大的笔记区域；窄屏时可在图片内左右滑动',
  'aria-brand-video': 'Spool 标志的绘制过程：先出现线轴的圆环，再延伸出一根线',

  /* Mid-page download. */
  'mid-cta-p': '完整流程就是这样：安装应用，选择一个项目，然后开始保存。',
  'mid-cta-fine': '免费 · Apple 芯片 Mac（arm64）· 已由 Apple 签名并公证',

  /* Compounding value. */
  'grow-k': '项目越久，价值越大',
  'grow-h': '第一周减少重复输入，<br>第六周找回已经遗忘的决定。',
  'grow-p': '第一天，三条笔记和一次粘贴就能省去重写背景。六周后，同一个项目还保存着你已经忘记的决定、很难再次找到的链接，以及当初否定某个方案的理由。交接仍然只需一次点击；使用方式没有变化，只是项目背景越来越完整。',
  'grow-p2': 'Spool 会自动统计保存数量。侧栏中的线轴会随笔记增加而逐渐绕满；每满一百条，就开始下一个线轴。',

  /* MCP. */
  'mcp-k': 'MCP · 不只可以粘贴',
  'mcp-h': '手动粘贴 Pack，<br>或让 AI 直接读取。',
  'mcp-p1': '两种方式都能让 AI 获得项目背景。第一种可以立即在任意浏览器标签页使用；第二种只需配置一次，之后无需再复制粘贴。',
  'route-a-tag': '方式 A · 无需安装其他应用',
  'route-a-h': '打包后粘贴',
  'route-a-p': '一次点击、一次粘贴，任何 AI、任何对话都能使用。这已经是完整的 Spool；即使不连接任何 AI 应用，也不会少用产品本身的功能。',
  'route-a-cost': '需要你手动完成复制和粘贴。',
  'route-b-tag': '方式 B · 只需连接一次',
  'route-b-h': '让 AI 直接读取项目',
  'route-b-p': '获得你的许可后，已经在使用的 AI 应用可以读取 Spool：查看数周的项目记录、跨项目搜索，并把有明确署名的新内容写回项目。你无需再复制，只要直接提问。',
  'route-b-cost': '在 Spool 设置中开启服务，并重启对应的 AI 应用以加载配置。',
  'cg1-h': '对话类应用',
  'cg1-p': '仍然在熟悉的聊天框中提问。若使用 ChatGPT 桌面端，需要进入 Codex 对话；普通 ChatGPT 对话运行在远端，无法访问这台 Mac 上的本地 MCP 服务。',
  'cg2-h': '编程工具',
  'cg2-p': '在编辑器的 AI 面板或终端中提问。',
  'cg-note': '无论使用哪类客户端，你都留在原来的应用里，由 Spool 提供项目笔记。对于上面六个客户端，Spool 可以通过一个按钮写入 MCP 配置；重启客户端后，它才能加载新配置。Spool 会另行显示客户端是否实际连接。名单之外的客户端，可以复制 Spool 提供的配置并手动粘贴。连接后的使用说明只保留在设置按钮旁：一小段既可自己阅读，也可直接发给 AI 的文字。',
  'mcp-note': '上方截图和 Pack 示例均来自专门制作的演示资料库，不含任何个人内容。',

  /* AI writes and review boundaries. */
  'gate-k': 'AI 写回内容时',
  'gate-h': '内容必须署名；高风险操作先等你确认。',
  'gate-p': '已连接的 AI 可以向项目新增内容。每条内容都会标明由哪个 AI 写入，并追加在你的笔记之后，不会覆盖原文。AI 无法编辑或删除你写下的内容。',
  'gate-more': '哪些操作必须先由你确认',
  'gate-2h': '涉及现有内容的操作会进入待审队列',
  'gate-2p': '提议更正旧笔记中的一句话、把一段内容拆分到多个项目，或申请读取你添加的某个文件，都不会立即执行。它们会进入待审队列，由你批准或丢弃。',
  'gate-3h': '只能补充更正，不能抹去历史',
  'gate-3p': '如果旧笔记中的某句话已不再成立，AI 可以指出它被哪条新内容更正。旧笔记仍完整保留，其他未被更正的内容继续有效。',
  'gate-x1': '<b>文件有独立权限。</b>对于添加到项目的文档，你需要逐份批准 AI 读取；未获批准时，AI 无法访问文件内容。',
  'gate-x2': '<b>只有你可以把笔记标记为作废。</b>作废后，它不再进入 Pack，但仍保留在资料库中并可被搜索；Pack 也会明确说明有内容被排除。',
  'gate-x3': '<b>读取和写入都可随时关闭。</b>MCP 读取默认关闭，需要你主动开启。其下方的“允许 AI 写入”会随读取一起启用，也可单独关闭；关闭后，AI 只能读取，不能新增任何内容。',

  /* Follow Up and Weekly Review. */
  'watch-k': '需要持续关注的事',
  'watch-h': '告诉它要跟进什么；没有变化就不打扰你。',
  'watch-p': '用几句明确的话写下项目正在等待什么，例如尚未公布的决定、可能更新的页面，或需要定期复查的数字。Spool 会把这些跟进目标原样交给你已安装的命令行 AI；查询结果仍会进入待审队列。没有新进展时，“跟进”不会产生内容。另一个独立功能“周回顾”可以检查所有项目，但不会获得网页搜索工具，结果保存在专门的回顾页面。',
  'watch-3': '<b>“跟进”是唯一会获得网页搜索工具的 Spool 动作</b>，并且只会按照你写下的目标搜索。“周回顾”和起草跟进目标没有网页搜索工具，但仍会把所需的项目背景交给 CLI 服务商。捕捉、整理、搜索和打包全部留在本机，可离线使用。引擎默认关闭，也可在原处随时关闭。',

  /* Download and trust. */
  'trust-k': '下载之前',
  'trust-h': '你将安装什么',
  'perm-h': 'macOS 权限分别用于什么',
  'perm-p1': 'Spool 使用<strong>输入监控</strong>来识别系统范围内的“连按两下 <span class="kbd">⌥</span>”。<strong>辅助功能</strong>是可选权限，只用于在 Spool 完成捕捉后移除第二次按键事件，避免其他使用相同手势的应用同时打开。',
  'perm-p2': '首次从浏览器捕捉时，macOS 还会请求浏览器自动化权限。获准后，Spool 可以把当前标签页标题记录为来源；否则只记录浏览器名称。',
  'perm-p3': '拒绝输入监控后，连按两下 <span class="kbd">⌥</span> 不可用，但自定义捕捉快捷键仍可使用。拒绝辅助功能后，捕捉照常工作，只是相同手势可能同时触发其他应用。拒绝浏览器自动化后，捕捉仍然有效，来源会退回浏览器名称。无论如何选择，Spool 都不会自行向外发送内容。',
  't1-h': '已由 Apple 签名并公证',
  't1-p': '安装包使用 Apple Developer ID 签名并通过 Apple 公证，因此 macOS 可以验证开发者。当前只提供 Apple 芯片版本；Intel Mac 虽可下载安装包，但无法运行。Spool 尚无自动更新功能，也不会联网检查新版。',
  't2-h': '数据保存在这台 Mac 的一个文件中',
  't2-p': '所有工作区、项目、笔记和批注都保存在本机的 <code>spool.db</code> 文件中。你可以复制、备份或删除它。无需注册账号，也无需把数据托管在开发者的服务器上。',
  't3-h': '不追踪使用情况，也不自行上传',
  't3-p': 'Spool 没有分析统计、遥测或崩溃上报，而且自身不能发起网络请求。内容只有在你主动交给其他程序时才可能离开这台 Mac：把 Pack 粘贴到某个服务、允许 MCP 客户端读取，或运行命令行 AI 的起草跟进目标、“跟进”和“周回顾”。后续如何处理由接收内容的程序决定。剪贴板只在触发捕捉时读取一次，不会在后台持续监控。',
  't4-h': '由一个人独立开发，也包括那次误删自己数据库的事故',
  't4-p': 'Spool 没有公司或融资支持。开发过程中的关键决定、数据丢失事故，以及为防止再次发生而增加的保护措施，都记录在公开的开发故事中。公开的是开发记录；源代码目前并未开放。',
  'priv-link': '阅读完整隐私政策 →',
  'maker-link': '阅读开发故事与故障复盘 →（英文）',

  /* FAQ. */
  'faq-k': '常见问题',
  'faq-h': '使用前最常见的问题',
  q1: '可以在 Intel Mac 上运行吗？',
  a1: '目前不可以。现有安装包只支持 Apple 芯片（arm64）。Intel Mac 可以下载安装包，但无法运行，也没有单独的 Intel 版本。',
  q2: '支持 Windows 或 iPhone 吗？',
  a2: '目前不支持。Spool 是 Mac 应用，捕捉快捷键依赖 macOS 特有的系统接口。',
  q9: 'AI 可以修改或删除我的笔记吗？',
  a9: '不可以。AI 可以向项目新增带有明确署名的笔记。如果它提议更正旧笔记中的某句话，该提议必须先进入待审队列。只有你能把笔记标记为作废或删除笔记；AI 写入的内容也不会显示成用户原文。',
  q10: '需要 API key 或付费 AI 套餐吗？',
  a10: 'Spool 不需要 API key，也没有填写 key 的位置。AI 客户端读取项目时，使用的是你在该客户端已有的账号与额度；命令行 AI 执行“跟进”等动作时，也使用对应 CLI 已登录账号的额度。',
  q11: '必须连接 AI 才能使用吗？',
  a11: '不必。即使从不连接 AI，Spool 的功能也不会被限制。你仍可把项目打包成纯文本，再粘贴给浏览器中的任意 AI。',
  q3: '为什么免费？',
  a3: 'Spool 背后没有服务器、账号体系或公司，几乎没有需要收费覆盖的成本。它由一名开发者维护，所有主要功能都运行在你的电脑上。',
  q4: '如果停止维护，我的笔记怎么办？',
  a4: '笔记仍保存在 Mac 上的 <code>spool.db</code> 文件中。这是标准 SQLite 文件，可由多种工具打开；即使 Spool 不再更新，数据也不会随之消失。',
  q5: '不常使用 AI，还有必要安装吗？',
  a5: '有。把整个项目打包成可阅读的纯文本，本身就能帮助你在中断一段时间后恢复上下文；AI 只是另一种读取和使用这些背景的方式。',
  q6: '如何更新？',
  a6: '目前需要手动下载新的 dmg 并替换应用，尚无自动更新渠道。Spool 也不会在后台联网检查新版。',
  q7: '它会一直监控剪贴板吗？',
  a7: '不会。Spool 只在你触发捕捉快捷键的那一刻读取一次剪贴板，不会轮询，也不会保存你复制过哪些内容的历史。',
  q8: '使用前需要先整理资料吗？',
  a8: '不需要。结构只有工作区和项目两层，也没有文件夹或标签。捕捉的内容会进入你标记为当前工作的项目。',

  /* Brand, CTA and footer. */
  'brand-cap': 'Spool 标志：从上方看到的线轴，一根线从中向外延伸。',
  'cta-h': '项目背景，不必再解释第二次。',
  'cta-p': '免费、可离线使用、无需账号。',
  'cta-fine': 'Apple 芯片 Mac（arm64）· 已由 Apple 签名并公证 · 无需账号 · 不追踪使用情况 · <a href="https://github.com/KIM-ocean-HZ/spool/releases">在 GitHub 查看全部版本</a>',
  'foot-copy': 'Spool 思簿 · © 2026 · 保留所有权利',
  'foot-home': '首页',
  'foot-story': '开发故事（英文）',
  'foot-privacy': '隐私政策',
};
