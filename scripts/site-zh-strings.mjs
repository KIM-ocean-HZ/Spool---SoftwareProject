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
    title: 'Spool 思簿 — 在 Mac 和 Windows 上保存项目背景，一次交给任何 AI',
    description:
      'Spool 把长期项目的背景保存在你自己的电脑上，Mac 和 Windows 都能用。复制内容并连按两下修饰键，即可连同来源存入当前项目；随后一键生成 Pack，粘贴给任何 AI，或让已连接的 AI 直接读取。AI 提议写回的内容会先等你确认。免费、可离线使用、无需账号。',
    ogTitle: 'Spool 思簿 — 项目背景，只需解释一次',
    ogDescription:
      '在 Mac 和 Windows 上保存长期项目的背景，一键生成 Pack 交给任何 AI，也可让已连接的 AI 直接读取。免费、可离线使用、无需账号。',
    ogImageAlt:
      '完整的 Spool 窗口：左侧是工作区、项目和保存数量，右侧是按时间排列的项目笔记',
  },
  'privacy.html': {
    title: 'Spool 思簿 — 隐私政策',
    description:
      'Spool 隐私政策：无需账号、没有服务器、不做遥测，Spool 自身不会上传数据；只有你主动交给其他程序时，内容才可能离开这台 Mac。',
  },
  'story.html': {
    title: 'Spool 思簿 — 开发故事：产品与工程记录',
    description:
      'Spool 如何成为一个本地优先的项目背景中枢：产品闭环、三个界面的架构、AI 的写入边界、发布证据、实测数据、踩过的故障，以及它不做的事。',
  },
};

/* Body copy, keyed by data-i18n. */
export const ZH = {
  /* Navigation shared by the generated pages. */
  'nav-try': '试用演示',
  'nav-how': '使用方式',
  'nav-faq': '常见问题',
  'nav-story': '开发故事',
  'nav-privacy': '隐私政策',
  'nav-dl': '下载',

  /* Hero. */
  'hero-h1': '同一个项目，<br>不必解释第二遍。',
  'hero-sub': '复制值得保留的内容，再连按两下 <span class="kbd">⌥</span>（Windows 上是 <span class="kbd">Ctrl</span>）。内容会存入当前项目，你还可以附上当时的想法。几周后，一次打包就能把完整背景交给任何 AI；交出去的每个字，你都可以先看清楚。',
  'dl-btn': '下载 macOS 版',
  'dl-btn-win': '下载 Windows 版',
  'try-btn': '直接试用，无需下载',
  'chip-free': '免费',
  'chip-arch': 'Apple 芯片 Mac · Windows x64',
  'chip-notarised': 'macOS 版已由 Apple 签名并公证',
  'chip-offline': '可离线使用',

  /* Interactive demo introduction. */
  'demo-k': '无需下载，直接试用',
  'demo-h': '在这里走完整个流程',
  'demo-p': '存下一条笔记并打包，再看一个全新的 AI 对话如何只凭这份背景接上进度。最后，AI 会提议把新的内容写回项目，由你决定是否保留。演示内容已预先编写，交互流程与真实应用一致。',
  'demo-noscript': '交互演示需要 JavaScript；你仍可阅读<a href="story.html">开发故事</a>和下方截图。',

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
  'l1-p': '复制任意内容，再连按两下 <span class="kbd">⌥</span>（Windows 上是 <span class="kbd">Ctrl</span>）。内容会直接进入当前项目，来源也会一并保存，浏览器内容还会记录标签页标题。确认浮窗出现时，光标已在批注框中：可以写下保存它的原因并按 Enter，也可以点击别处跳过。你的批注比摘录更能说明当时的判断，AI 也会优先读取。',
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
  'alt-capture-toast': 'Spool 保存提示：显示内容开头、保存到“学习”工作区中的“机器学习课”项目、浏览器标签页来源，以及写着你刚打下那句话的批注框',
  'alt-project-window': '完整的 Spool 窗口：左侧是工作区、项目和保存数量，右侧是按时间排列的项目笔记',
  'alt-project-source-detail': '项目笔记局部：第 2 条来自第 7 讲讲义，保留用户批注和引用原文；第 3 条来自 AI 对话，两条都显示 Safari 来源',
  'alt-project-ai-detail': '项目笔记局部：用户的第 4 条复习计划之后，是署名“Claude · MCP”的 AI 笔记，并带有指向第 4 条的引用',
  'aria-keep-magnifier': '完整项目窗口，上面有两处放大的笔记区域；窄屏时可在图片内左右滑动',
  'aria-brand-video': 'Spool 标志的绘制过程：先出现线轴的圆环，再延伸出一根线',

  /* Mid-page download. */
  'mid-cta-p': '完整流程就是这样：安装应用，选择一个项目，然后开始保存。',
  'mid-cta-fine': '免费 · Apple 芯片 Mac（arm64），已由 Apple 签名并公证 · Windows x64，暂未签名',

  /* Compounding value. */
  'grow-k': '项目越久，价值越大',
  'grow-h': '第一周减少重复输入，<br>第六周找回已经遗忘的决定。',
  'grow-p': '第一天，三条笔记和一次粘贴就能省去重写背景。六周后，同一个项目还保存着你已经忘记的决定、很难再次找到的链接，以及当初否定某个方案的理由。交接仍然只需一次点击；使用方式没有变化，只是项目背景越来越完整。',
  'grow-p2': 'Spool 会自动统计保存数量。侧栏中的线轴会随笔记增加而逐渐绕满；每满一百条，就开始下一个线轴。',

  /* Break reminder (0.6.0). */
  'break-k': '它也会照看你',
  'break-h': '它明白工作效率和身心健康的平衡点。',
  'break-p': '连续工作到点，Spool 会把自己的窗口锁上五分钟：倒计时在正中间，其余部分压暗。点一下可以提前结束，什么都不做它也会自己解开。一段工作算多久由你定——30、60 或 120 分钟——整个功能也可以关掉。',
  'break-p2': '它只算你真的在的那段时间：Spool 在最前面，而且你动过它。中途去别的应用待几分钟是暂停，不是清零；合上笔记本睡一下午，也换不来一小时你并没有工作的时间。',
  'break-p3': '默认的 60 分钟不是我们自己定的。2026 年《英国运动医学杂志》上的一项研究，让 19,342 名成年人分别每 30、60、120 分钟起来活动 5 分钟。30 分钟一次对缓解疲劳、改善情绪最有效，但能长期坚持下来的人太少；60 分钟一次是大家真的做得下去的那个，而且工作效率并没有因此下降。<a href="https://doi.org/10.1136/bjsports-2025-111221">Diaz 等，《英国运动医学杂志》2026</a>',

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
  'cg1-p': '仍然在熟悉的聊天框中提问。若使用 ChatGPT 桌面端，需要进入 Codex 对话；普通 ChatGPT 对话运行在远端，无法访问这台电脑上的本地 MCP 服务。',
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
  'perm-h': 'macOS 会请求哪些权限，分别用于什么',
  'perm-p1': 'Spool 使用<strong>输入监控</strong>来识别系统范围内的“连按两下 <span class="kbd">⌥</span>”。<strong>辅助功能</strong>是可选权限，管两件事：在 Spool 完成捕捉后移除第二次按键事件，避免其他使用相同手势的应用同时打开；以及让确认浮窗拿到键盘，你不用先点一下就能直接写批注。',
  'perm-p2': '首次从浏览器捕捉时，macOS 还会请求浏览器自动化权限。获准后，Spool 可以把当前标签页标题记录为来源；否则只记录浏览器名称。',
  'perm-p3': '拒绝输入监控后，连按两下 <span class="kbd">⌥</span> 不可用，但自定义捕捉快捷键仍可使用。拒绝辅助功能后，捕捉照常工作，只是相同手势可能同时触发其他应用，而且要先点一下批注框才能打字。拒绝浏览器自动化后，捕捉仍然有效，来源会退回浏览器名称。无论如何选择，Spool 都不会自行向外发送内容。',
  'perm-win': '<strong>Windows 上没有需要授权的项目。</strong>连按两下 <span class="kbd">Ctrl</span> 是通过 Raw Input 读取的，不需要任何权限，也不是键盘钩子——杀毒软件警惕的正是钩子那一类。Windows 上的来源记录到「你从哪个应用复制的」为止，浏览器标签页标题是 macOS 独有的。',
  't1-h': 'macOS 版已公证，Windows 版尚未签名',
  't1-p': 'macOS 安装包使用 Apple Developer ID 签名并通过 Apple 公证，因此 macOS 可以验证开发者。当前只提供 Apple 芯片版本；Intel Mac 虽可下载安装包，但无法运行。Windows 安装包<strong>暂未签名</strong>，首次运行时 SmartScreen 会拦一次：点「更多信息」，再点「仍要运行」。这件事值得在下载之前就说清楚，而不是下载之后才发现。两个平台都需要手动下载新版，这也意味着 Spool 不会联网检查更新。',
  't2-h': '数据保存在你自己电脑上的一个文件中',
  't2-p': '所有工作区、项目、笔记和批注都保存在本机的 <code>spool.db</code> 文件中。你可以复制、备份或删除它。无需注册账号，也无需把数据托管在开发者的服务器上。',
  't3-h': '不追踪使用情况，也不自行上传',
  't3-p': 'Spool 没有分析统计、遥测或崩溃上报，而且自身不能发起网络请求。内容只有在你主动交给其他程序时才可能离开这台电脑：把 Pack 粘贴到某个服务、允许 MCP 客户端读取，或运行命令行 AI 的起草跟进目标、“跟进”和“周回顾”。后续如何处理由接收内容的程序决定。剪贴板只在触发捕捉时读取一次，不会在后台持续监控。',
  't4-h': '由一个人独立开发，也包括那次误删自己数据库的事故',
  't4-p': 'Spool 没有公司或融资支持。开发过程中的关键决定、数据丢失事故，以及为防止再次发生而增加的保护措施，都记录在公开的开发故事中。公开的是开发记录；源代码目前并未开放。',
  'priv-link': '阅读完整隐私政策 →',
  'maker-link': '阅读开发故事与故障复盘 →',

  /* FAQ. */
  'faq-k': '常见问题',
  'faq-h': '使用前最常见的问题',
  q1: '可以在 Intel Mac 上运行吗？',
  a1: '目前不可以。现有安装包只支持 Apple 芯片（arm64）。Intel Mac 可以下载安装包，但无法运行，也没有单独的 Intel 版本。',
  q2: '支持 Windows 或 iPhone 吗？',
  a2: 'Windows 支持了，0.5.0 就是第一个 Windows 版本：x64，捕捉手势是连按两下 <span class="kbd">Ctrl</span>（不是 <span class="kbd">⌥</span>），安装包暂未签名，首次运行时 SmartScreen 会提示一次。iPhone 没有版本，也不打算先挂一个等待名单。',
  q9: 'AI 可以修改或删除我的笔记吗？',
  a9: '不可以。AI 可以向项目新增带有明确署名的笔记。如果它提议更正旧笔记中的某句话，该提议必须先进入待审队列。只有你能把笔记标记为作废或删除笔记；AI 写入的内容也不会显示成用户原文。',
  q10: '需要 API key 或付费 AI 套餐吗？',
  a10: 'Spool 不需要 API key，也没有填写 key 的位置。AI 客户端读取项目时，使用的是你在该客户端已有的账号与额度；命令行 AI 执行“跟进”等动作时，也使用对应 CLI 已登录账号的额度。',
  q11: '必须连接 AI 才能使用吗？',
  a11: '不必。即使从不连接 AI，Spool 的功能也不会被限制。你仍可把项目打包成纯文本，再粘贴给浏览器中的任意 AI——一台什么都没另外装的电脑也够用。',
  q3: '为什么免费？',
  a3: 'Spool 背后没有服务器、账号体系或公司，几乎没有需要收费覆盖的成本。它由一名开发者维护，所有主要功能都运行在你的电脑上。',
  q4: '如果停止维护，我的笔记怎么办？',
  a4: '笔记仍保存在你自己电脑上的 <code>spool.db</code> 文件中。这是标准 SQLite 文件，可由多种工具打开；即使 Spool 不再更新，数据也不会随之消失。',
  q5: '不常使用 AI，还有必要安装吗？',
  a5: '有。把整个项目打包成可阅读的纯文本，本身就能帮助你在中断一段时间后恢复上下文；AI 只是另一种读取和使用这些背景的方式。',
  q6: '如何更新？',
  a6: '目前需要手动下载新的 dmg 或新的 Windows 安装包并替换已装的版本，尚无自动更新渠道。Spool 也不会在后台联网检查新版。',
  q7: '它会一直监控剪贴板吗？',
  a7: '不会。Spool 只在你连按捕捉键（macOS 上是 <span class="kbd">⌥</span>，Windows 上是 <span class="kbd">Ctrl</span>）的那一刻读取一次剪贴板，不会轮询，也不会保存你复制过哪些内容的历史。',
  q8: '使用前需要先整理资料吗？',
  a8: '不需要。结构只有工作区和项目两层，也没有文件夹或标签。捕捉的内容会进入你标记为当前工作的项目。',

  /* Brand, CTA and footer. */
  'brand-cap': 'Spool 标志：从上方看到的线轴，一根线从中向外延伸。',
  'cta-h': '项目背景，不必再解释第二次。',
  'cta-p': '免费、可离线使用、无需账号。',
  'cta-fine': 'Apple 芯片 Mac（arm64），已签名并公证 · Windows x64，未签名 · 无需账号 · 不追踪使用情况 · <a href="https://github.com/KIM-ocean-HZ/spool/releases">在 GitHub 查看全部版本</a>',
  'fb-k': '出问题的时候',
  'fb-h': '三条路都能找到我。',
  'fb-p': 'Spool 不需要账号，也从不往外发任何东西——这也意味着它没法替你报告问题。要是它坏了，或者你想要的事情它做不了，下面任意一条都能找到我。',
  'fb-l-what': '发生了什么，或者你希望它能做什么',
  'fb-l-where': '版本和系统——可不填',
  'fb-l-reply': '你的邮箱，想要回复的话——可不填',
  'fb-send': '写这封邮件',
  'fb-note': '这个页面没有服务器，什么都不收集。按钮只是打开你自己的邮件应用，信已经写好了，发不发由你决定——不会有任何东西自己从这个页面发出去。',
  'fb-alt': '不想用表格也行：<a href="mailto:jinhz0531@gmail.com?subject=Spool">直接给我发邮件</a> · <a href="https://github.com/KIM-ocean-HZ/spool/issues/new/choose">在 GitHub 提一个 issue</a> · 想知道有没有新版本，<a href="https://github.com/KIM-ocean-HZ/spool/releases">盯着发布页</a>就行。',

  'foot-copy': 'Spool 思簿 · © 2026 · 保留所有权利',
  'foot-home': '首页',
  'foot-story': '开发故事',
  'foot-feedback': '反馈',
  'foot-privacy': '隐私政策',

  /* The story page (story.html). Long-form, so the copy is keyed element by
     element like the homepage rather than replaced as one hand-written body:
     the architecture diagram and the responsive figures stay in one place. */
  'story-skip': '跳到正文',
  'story-nav-aria': '主导航',

  'story-toc-aria': '正文目录',
  'story-toc-title': '目录',
  'story-toc-user': '写给谁用',
  'story-toc-product': '它做什么',
  'story-toc-arch': '三个界面',
  'story-toc-privacy': '隐私与写入',
  'story-toc-release': '签名与公证',
  'story-toc-measurement': '实测改变了什么',
  'story-toc-failures': '故障与修复',
  'story-toc-boundaries': '边界',

  'story-h1': 'Spool 是怎么做出来的',
  'story-lede': '一份关于本地优先项目背景中枢的产品与工程记录：它写给谁用，什么东西会越过网络边界，AI 可以写入什么，以及哪些地方是在系统遇上真实工作之后才改掉的。',

  'story-user-h': '写给谁用',
  'story-user-p1': 'Spool 写给同时推进好几件长期事情、而手上的工具彼此之间没有记忆的人：研究者、研究生、开发者，以及独自做一件东西的人。真正的代价不是“记笔记”，而是每开一场新的 AI 对话，都要把同一个项目重新讲一遍——哪篇论文重要、哪个决定已经失败过、上周之后又变了什么。',
  'story-user-p2': '这个产品的目标刻意收得很窄：重新进入一个项目，应该只花一次粘贴，而不是回到聊天记录、邮件、标签页和记不太清的决定里做考古。它待在文档工具的上游。项目是一份安静的、只往后追加的记录，不是协作画布，也不用来取代 Notion。',
  'story-user-disclosure': '<strong>调研边界。</strong>第一版是开发者拿自己手上的多个项目边用边改做出来的。这带来了几处有价值的反转，但它不是面向外部用户的调研；和其他用户一起验证，仍然是发布之后的事。',

  'story-product-h': '产品做的事',
  'story-product-p': '三个动作构成一个闭环。它们都不需要模型出现在关键路径上。',
  'story-flow-aria': 'Spool 的产品闭环',
  'story-flow-1-t': '捕捉',
  'story-flow-1-d': '复制之后连按两下 ⌥，把剪贴板连同时间和来源一起存进项目；同时弹出的确认浮窗接住你当时觉得它值得保存的那个想法。',
  'story-flow-2-t': '项目',
  'story-flow-2-d': '把碎片按时间顺序留在一条记录里，结构正好两层：工作区，然后是项目。',
  'story-flow-3-t': 'Pack',
  'story-flow-3-d': '把当前项目组装成确定的 Markdown，可以粘贴进任何 AI 客户端。同一个项目在同一天生成的字节完全一样。',

  'story-alt-capture': '隔离的 Spool 演示捕捉场景：浏览器页面停在原处，Spool 的确认浮窗出现在右上角，显示捕捉到的来源和批注框',
  'story-cap-capture': '隔离演示构建里的捕捉：来源应用一直看得见，Spool 在角落里确认那条已保存的片段。',

  'story-arch-h': '三个界面之间的关系',
  'story-arch-p': '桌面界面、MCP 服务器和命令行引擎位，是围着同一份事实来源的三个本地界面。下图把“运行在你自己的电脑上”和“属于 Spool 进程”分开画，这样关于网络的说法可以直接看，而不是靠推断。',
  'story-arch-scroll-aria': '架构图；屏幕窄时可以左右滑动，逐个查看组件和网络路径',
  'story-arch-svg-aria': 'Spool 架构：图形界面和捕捉浮窗在本机连到 Rust 与 Tauri 内核以及一个 SQLite 数据库。spool --mcp 模式通过 stdio 与外部 MCP 客户端通信。内核会把 Claude Code、Codex CLI 或 Gemini CLI 作为子进程启动。只有外部 MCP 客户端和命令行子进程会通过两条各自独立的网络路径联系自己的服务商；Spool 自身不发出任何 HTTP 请求。',
  'story-arch-svg-title': 'Spool 的本地架构，以及两条对外的路径',
  'story-arch-svg-desc': 'Spool 进程里装着桌面图形界面、捕捉浮窗、Rust 与 Tauri 内核、spool --mcp 的 stdio 服务器，以及一个 SQLite 数据库。外部 MCP 客户端通过 stdio 连进来。内核可以把 Claude Code、Codex CLI 或 Gemini CLI 作为独立子进程启动。外部 MCP 客户端和命令行子进程分别通过两条不同的网络路径联系各自的服务商。没有任何一条箭头从 Spool 自身指向网络。',
  'story-arch-your-mac': '你的电脑',
  'story-arch-one-binary': 'SPOOL · 一个本地程序',
  'story-arch-gui': '桌面图形界面',
  'story-arch-overlay': '捕捉浮窗',
  'story-arch-overlay-sub': '全局手势 · 本地窗口',
  'story-arch-core-1': '捕捉 · IPC · 策略',
  'story-arch-core-2': '确定性打包器',
  'story-arch-core-3': '子进程边界',
  'story-arch-core-4': '没有 HTTP 客户端',
  'story-arch-db-1': '一个本地文件',
  'story-arch-db-2': '唯一的',
  'story-arch-db-3': '事实来源',
  'story-arch-mcp-sub': 'stdio MCP 服务器',
  'story-arch-client': '外部 MCP 客户端',
  'story-arch-client-sub': 'ChatGPT 桌面版里的 Codex',
  'story-arch-client-mono': '与服务商的连接归客户端所有',
  'story-arch-cli': '命令行引擎子进程',
  'story-arch-cli-sub': 'Gemini CLI · 没有“跟进”',
  'story-arch-cli-mono': '用户自己安装 · 用户自己登录',
  'story-arch-provider-1': 'MCP 客户端的服务商',
  'story-arch-provider-1-sub': '网络路径 1 · 在 Spool 之外',
  'story-arch-provider-2': '命令行 AI 的服务商',
  'story-arch-provider-2-sub': '网络路径 2 · 在 Spool 之外',
  'story-arch-flow-local': '本机',
  'story-arch-flow-spawn': '启动 + stdio',
  'story-arch-path-1': '网络路径 1',
  'story-arch-path-2': '网络路径 2',
  'story-arch-no-http': 'Spool 自身不发出任何 HTTP 请求。',
  'story-arch-boundary': '网络边界 —— 只有那两条高亮路径会穿过它',
  'story-cap-arch': '这条网络边界是字面意义上的：外部 MCP 客户端，以及你自己登录过的命令行子进程，可以联系各自的服务商。Spool 自身不发出 HTTP 请求，不保存任何服务商密钥，也不监听任何网络端口。',
  'story-arch-p2': '图形界面和捕捉浮窗在本机与 Rust/Tauri 内核通信。内核拥有唯一的那个 SQLite 数据库。运行 <code>spool --mcp</code> 会把同一个库通过 stdio 交给 AI 客户端读取；命令行引擎位走的是另一条路——把 Claude Code、Codex CLI 或 Gemini CLI 作为独立进程启动。Gemini 支持“周回顾”和起草跟进目标，但不支持“跟进”。两条路都保住了同一个区分：哪些是 Spool 在本机做的事，哪些是另一个程序在联网做的事。',

  'story-alt-project': '隔离的 Spool 演示库里的“机器学习课程”项目：左侧是固定的工作区与 Spool 侧边栏，中间是带编号的时间线块和一条被当作标题用的批注，右侧是 AI 客户端活动栏',
  'story-cap-project': '当前的一个项目界面：左边是固定的导航和 Spool 面板，记录里是带编号的块，批注可以当标题用，右边是 AI 客户端的活动。',

  'story-privacy-h': '隐私与写入边界',
  'story-privacy-p': '读取和写入是两种分开的权限。内容只会装在你自己安装并授权过的程序里离开这台机器；每一条路径上，越过网络的那个程序都写明了名字。',
  'story-table-aria': '网络与写入路径；屏幕窄时可以左右滑动',
  'story-th-path': '路径',
  'story-th-what': '可能越过边界的内容',
  'story-th-client': '联网的程序',
  'story-td-1-a': 'MCP 客户端',
  'story-td-1-b': '客户端从本机 stdio 服务器明确读走的内容',
  'story-td-1-c': '那个外部 AI 客户端',
  'story-td-2-a': '命令行引擎动作',
  'story-td-2-b': '所选动作需要的那些项目块',
  'story-td-2-c': 'Claude Code、Codex CLI 或 Gemini CLI；Gemini 不含“跟进”',
  'story-td-3-a': '其他任何情况',
  'story-td-3-b': '没有',
  'story-td-3-c': '没有',

  'story-rule-1': '<strong>AI 可以追加，不能覆盖。</strong>机器写的块带着由服务端强制加上的来源标签，无法替换用户自己写的块。',
  'story-rule-2': '<strong>AI 不能借用用户的身份。</strong>批注的作者会被记下来，所以机器写的批注呈现出来就是机器的说法，而不是你的判断。',
  'story-rule-3': '<strong>AI 可以提议更正，由你决定。</strong>原文一直看得见、搜得到。把材料标记为作废，是人做的动作。',

  'story-alt-writeback': '当前隔离演示项目的一处细节：用户写的第 4 块下面跟着第 5 块，标着 Claude · MCP，并引用了前面那条来源',
  'story-cap-writeback': '当前构建里的写入边界：一个署名 <span class="nowrap">Claude · MCP</span> 的块被追加在用户那条来源后面，并引用了它；它没有覆盖它，也没有把自己冒充成用户。',

  'story-release-h': '分发、签名与公证',
  'story-release-p': 'macOS 上，Spool 直接以经 Developer ID 签名、并由 Apple 公证过的磁盘镜像分发。不走 Mac App Store，是因为沙盒和全系统范围的捕捉手势冲突。应用和磁盘镜像是分开检查的：用户下载的是外面那层镜像，所以“公证过的应用装在没公证的镜像里”并不够。Windows 安装包由 CI 产出，首版<strong>未签名</strong>发布——证书是一笔按年续的开销，而这个平台还没被验证过；在下载页上假装它签过，比 SmartScreen 那一次提示更糟。',
  'story-release-kicker': '发布证据',
  'story-release-title': 'v0.4.0 的签名与公证回执',
  'story-dt-app': '应用提交',
  'story-accepted': '已通过',
  'story-dt-dmg': 'DMG 提交',
  'story-dt-commit': '打了标签的提交',
  'story-dt-artifact': '产物',
  'story-dd-gatekeeper': '<code>accepted</code> · <code>source=Notarized Developer ID</code> · 两个产物都是',
  'story-evidence-source': '来源：<a href="https://github.com/KIM-ocean-HZ/spool/blob/main/docs/CASE_STUDY_LEDGER.md#12-release-record">Case Study Ledger §1.2</a>，记录于 2026-08-08。',
  'story-release-link': '<a href="https://github.com/KIM-ocean-HZ/spool/releases/latest">到 GitHub 查看这次发布和它的产物</a>。官网上那个固定的下载地址，指向与带版本号的产物一同发布的固定文件名副本。',

  'story-measurement-h': '实测改变了什么',
  /* WORKPLAN-2026-08-20 §2.4 —— 首页「零安装试用」那一块。文件本身是渲染器生成的，
     中文站拿的是中文那一份（main.js 按 <html lang> 挑）。 */
  'sample-p': '也可以直接拿走一份真的。这就是一个项目按 ⌘⇧P 打出来的东西——开头的说明、每条的来源标注，一样不少。粘进你常用的那个 AI，然后问它一个关于这门课的问题。',
  'sample-copy': '复制整份 Pack',
  'sample-copied': '复制好了——粘进你的 AI 试试',
  'sample-open': '先看看这个文件',
  'sample-note': '大约 8,000 字——五条存下来的东西，外加当时想到的那句话。',
  'story-measurement-p': '案例研究台账为每一个对外公开的数字都记下了命令和证据来源。其中两次实测改变了产品的优先级，而不只是描述了做完的系统。',
  'story-m2-h': '去重是一次性的补救',
  'story-m2-p': '实测到的那一对重复内容占了 <strong>Pack 的 13%</strong>。把它标记为作废解决了眼前的体量问题，同时那条更早的块仍留在库里，也仍然搜得到。',
  'story-m3-h': '对外的写入路径是能被摸索出来的',
  'story-m3-p': '只用一句大白话的请求，一个外部客户端就建好了项目并存进 <strong>11 个块</strong>，平均 <strong>970 字符</strong>。它自己从 <strong>2 次出错</strong>里恢复过来，没有求助，之后还用 Pack 工具检查了自己的成果。',
  'story-measurement-cost': '另有一次真实联网搜索的运行花了大约 <strong>$0.45</strong>，暴露出来的问题，是拿模拟数据和只读提示词都没能发现的。',

  'story-failures-h': '改变了这个系统的那些故障',
  'story-failures-p': '事后复盘里真正有用的单位不是那个补丁，而是留下来的那道防线。',
  'story-f1-h': '线上数据库被清空了',
  'story-f1-p': '一个开发构建遇上了更新过的线上库结构，走进了一条无条件重建的分支。恢复时从 SQLite 的空闲页里刨回了 <strong>33 个块</strong>，但项目标题没了。留下来的改动是：迁移改成出错即停、带名字的迁移注册表加跨语言版本核对、迁移前自动快照、装机验证走隔离构建，以及一条规矩——首次运行的种子数据只能从空库那条路进来。',
  'story-f2-h': '一条提示词规则在第一次真实运行时就没兑现',
  'story-f2-p': '跟进结果要求带上来源链接，但 <strong>3 条提议里有 2 条</strong>没带，因为模型把链接放进了结尾那段话里。提示词改成针对具体字段之后，下一次实测的运行里 <strong>5 条提议全带上了</strong>链接。现在这条规矩很简单：提示词里写了，不等于它就是行为——要有一次真实运行来证明。',
  'story-f3-h': '打包后的窗口是白的，而所有自动检查都通过了',
  'story-f3-p': '一个状态选择器每次调用都新建一个数组，触发了无限渲染。自动化测试里没有任何一条会打开打包后的窗口。现在发布验证包含亲眼看一眼隔离的签名构建；界面是否正常，不再靠“能编译”来推断。',

  'story-boundaries-h': '这些是边界，不是承诺',
  'story-b1': '<strong>两个平台，深度并不一样。</strong>Windows 从 0.5.0 开始支持，跑的是同一个库、同一套捕捉手势——只是用 Raw Input 读键，而不是键盘钩子。没有跟着过去的是 macOS 那部分与焦点处理、浏览器标签页来源相关的实现，所以 Windows 版记录的是来源应用，而不是你当时在读的那个页面。',
  'story-b2': '<strong>没有自动更新。</strong>换新版本要自己到发布页手动下载。',
  'story-b3': '<strong>源码可见，保留所有权利。</strong>仓库里没有任何授权他人复用的许可证。',
  'story-b4': '<strong>有两项检查仍然由人来做。</strong>已授权的捕捉手势位于合成事件的上游，打包后的 webview 也没法靠合成点击来确认；这两项都交给人，而不是宣称已经自动化了。',
  'story-b5': '<strong>Spool 不是服务器、同步服务、团队工作区，也不是文档编辑器。</strong>它保存一份本地的项目记录，并为你早就选好的那些工具准备好背景。',

  'story-demo': '这里没有占位视频。<a href="./#demo">浏览器里的交互演示</a>会走完捕捉 → 项目 → Pack 的整个流程；上面那些截图来自当前的隔离桌面构建。',
  'story-colophon': 'Spool 由 Ocean（<a href="https://github.com/KIM-ocean-HZ">KIM-ocean-HZ</a>）设计并开发。源码、路线图和完整的产品准则在 <a href="https://github.com/KIM-ocean-HZ/spool">GitHub</a>；可复现的公开数字在 <a href="https://github.com/KIM-ocean-HZ/spool/blob/main/docs/CASE_STUDY_LEDGER.md">Case Study Ledger</a>。',
};
