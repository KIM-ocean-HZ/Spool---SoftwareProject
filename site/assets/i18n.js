/* Site language toggle — EN authored in the HTML, ZH applied from this map.
   Persisted in localStorage; demo.js rebuilds itself on the 'spool-lang' event.
   Copy rule for both languages: everyday words only. No jargon a first-time
   visitor would have to look up. */
(function () {
  'use strict';

  var KEY = 'spool-site-lang';
  var initial = 'en';
  try { if (localStorage.getItem(KEY) === 'zh') initial = 'zh'; } catch (e) { /* private mode */ }
  // ?lang=zh|en wins over the stored choice — makes either language linkable
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') initial = q;
  } catch (e) { /* very old browser — the toggle still works */ }

  var ZH = {
    /* nav (shared across pages) */
    'nav-try': '试一试',
    'nav-how': '怎么用',
    'nav-faq': '常见问题',
    'nav-story': '幕后',
    'nav-privacy': '隐私',
    'nav-dl': '下载',

    /* hero */
    'hero-h1': '同一个项目，<br>不必解释第二遍。',
    'hero-tag': 'Spool 是一个 Mac 上的小软件，替你存着手上每件事的来龙去脉——开 AI 对话时，一次粘贴就把整个项目交过去。',
    'hero-sub': '看到值得留下的东西就复制，然后连按两下 <span class="kbd">⌥</span>。它自己落进对应的项目，连来源一起记下——哪个页面、哪个标签页、什么时候。几周之后，点一下就把这个项目变成一段文字，粘给任何 AI，不用再把背景重新敲一遍。',
    'dl-btn': '下载 macOS 版',
    'try-btn': '60 秒看它跑一遍 —— 什么都不用装',
    'chip-free': '免费',
    'chip-arch': 'Apple 芯片 Mac',
    'chip-notarised': '已由 Apple 签名公证',
    'chip-offline': '断网可用',

    /* demo */
    'demo-k': '试一试 —— 60 秒',
    'demo-h': '整个流程，就在这里走一遍',
    'demo-p': '存三条笔记、打包，然后看一个全新的 AI 对话在你什么都没交代的情况下接上你的项目。内容是事先写好的；每一步都和真实应用一模一样。',

    /* the moment it fixes */
    'moment-k': '每次都要重来的那两分钟',
    'moment-p': '周一，你开一个新对话，把背景从头敲一遍：这个项目是什么、给谁做、上周定了什么、什么试过了不行。周三，换个对话，你又敲一遍——这次更短，还漏掉了最要紧的那条。<em>用 Spool，这些背景在你干活的时候就一条一条存下来了。点一下、粘一次，AI 就从你真正所在的位置开始。</em>',

    /* who it is for */
    'who-k': '这是给谁用的',
    'who-h': '给要做上几个月的事，<br>不是给一下午就完的事。',
    'who-p': '同一个项目你隔三差五就得回来一次，而且几乎每次都要开个 AI 对话——这种时候 Spool 才值得装。如果你只是今天想问一个问题，问完再也不会想起它，那你用不上这个。',
    'w1-h': '一件要做好几个月的东西',
    'w1-p': '你早就排除掉的那个 bug、当初为什么选这个库、第二周就放弃的那条路。新开的对话不会再把你带回你已经走出来的圈子。',
    'w2-h': '一门课、一篇论文、一个正在学的领域',
    'w2-p': '课上没跟上的那句、以后要引用的那篇文献、终于把你讲明白的那个解释。到复习的时候，AI 拿你自己的材料考你，而不是拿网上的。',
    'w3-h': '一天开三个 AI 对话，个个从零开始',
    'w3-p': '不同的软件、不同的窗口，每一个见到你都像第一次见。Spool 就是它们缺的那份记忆——同一段粘贴，在哪个里面都好使。',

    /* how it works */
    'how-k': '怎么用',
    'how-h': '存下来，留着，粘出去',
    'l1-n': '01 · 存',
    'l1-h': '一次按键，不用做任何决定。',
    'l1-p': '复制任何内容，然后连按两下 <span class="kbd">⌥</span>。它直接进入你正在做的项目，连来源一起记下——精确到是浏览器的哪个标签页。弹出的确认框里，光标已经停在批注框上：顺手写下让你想存它的那个念头，按 Enter；不想写就点旁边任意处。你自己的话比摘录更耐放，AI 也会先读它。',
    'cap-toast': '真实现场：页面上你选中的那几行，和浮在角上的确认提示——存了什么、存去了哪，还有一格留给你此刻的想法。',
    'l2-n': '02 · 留',
    'l2-h': '是一份清单，不是聊天。',
    'l2-p': '存下的东西按时间顺序堆在同一个项目下。只有两层——工作区，然后项目。不用建文件夹，不用选标签。下周回来，最新的几条就告诉你上次停在哪。',
    'cap-main': '一个项目，五条笔记：你的目标、一段读到的东西、一段 AI 对话的回答、你自己的决定、一封邮件。每一条都留着它的时间和来源。',
    'l3-n': '03 · 粘',
    'l3-h': '一键成文，拿去就能粘。',
    'l3-p': 'Spool 把整个项目写成纯文本：你自己的话排在最前，看来的东西标明出处，AI 写的部分单独标出以便你核对。粘给任何 AI——或者你自己读一遍，直接回到工作状态。',
    'cap-pack-loop': '真实的打包窗口：五条笔记变成 3,899 个字符、拿去就能粘的文字。两个选择，一个按钮。',

    /* mid-page download */
    'mid-cta-p': '整个流程就这些。从装上到能用，大概一分钟。',
    'mid-cta-fine': '免费 · Apple 芯片 Mac（arm64）· 已由 Apple 签名公证',

    /* it compounds */
    'grow-k': '然后它开始滚雪球',
    'grow-h': '第一周帮你少打字，<br>第六周帮你想起你已经忘了的事。',
    'grow-p': '第一天就能用：三条笔记、粘一次，背景不用再敲。六周之后，同一个项目里躺着你已经不记得自己做过的那个决定、那条再也搜不回来的链接、当初否掉某个方案的理由——而它们照样是那一次点击就全递过去。你的用法一点没变，只是底下攒厚了。',
    'g1-h': '第一天 · 3 条 · 266 字符',
    'g2-h': '六周后 · 21 条 · 2,143 字符',
    'grow-cap': '同一个项目，相隔六周。看右边那条置顶的：一个藏在邮件最底下的截止日期。这种东西没人靠脑子记得住——而现在它会跟其余内容一起被粘出去。',

    /* mcp */
    'mcp-k': 'MCP —— 粘贴之外',
    'mcp-h': 'AI 可以读，也可以写。<br>但它必须署名。',
    'mcp-p1': '粘贴哪儿都能用。而你已经在用的那些 AI 应用还能更进一步：在你允许之后，它们自己打开 Spool——读几周的上下文、搜遍每一个项目、把找到的结论放回该在的位置。它们写的每一条都带署名，而且加在你那条<em>下面</em>，绝不会盖掉。两个由你亲手打开的开关，没有任何服务器。',
    'cg1-h': '跟你聊天的',
    'cg1-p': '还是在聊天框里说话，和平时一样。',
    'cg2-h': '你写代码用的',
    'cg2-p': '在编辑器的 AI 面板里说，或者在终端里说。',
    'cg-note': '两种都一样：你人待在原地，Spool 只负责把笔记递过去。在 Spool 设置里接一次、把那个软件重启一下，之后它就能读你的项目了。不在名单上？从 Spool 里复制一段设置，粘进你那个软件就行。',
    'mtab-lib': '① 它看得见你的项目',
    'mtab-digest': '② 它从数周的笔记里作答',
    'mtab-search': '③ 它知道每条的出处',
    'mtab-file': '④ 它写回来，并且署名',
    'mcap-lib': '一句大白话提问，AI 就从你的 Mac 上读出工作区、项目，以及每个项目有多少条笔记。',
    'mcap-digest': '一段话，来自你三周里从四个不同地方存下的笔记。这正是一次粘贴做不到的事。',
    'mcap-search': '每条结果都留着出处：哪些是你读到的，哪些是 AI 建议的，哪些是你自己定的。',
    'mcap-file1': '让它归档一条结论，它只写一条笔记——附一句理由，并链回它所依据的那一条。',
    'mcap-file2': '……而它在 Spool 里长这样。署名 <strong>Claude · MCP</strong>，加在你那条笔记<strong>下面</strong>而不是盖在上面，<strong>↩</strong> 行指向它所回答的那一条。',
    'mcp-note': '截图用的是专门为此搭的一个库，里面没有任何个人内容。',

    /* what you are installing */
    'trust-k': '下载之前',
    'trust-h': '你装的到底是什么',
    'perm-h': '两个 macOS 权限，各自是干什么的',
    'perm-p1': '这一步最容易让人犹豫，所以先说清楚。Spool 会要<strong>输入监控</strong>和<strong>辅助功能</strong>这两个权限。要输入监控，是因为它得听见你连按两下 <span class="kbd">⌥</span>——在 macOS 看来，任何全局快捷键都算监控。要辅助功能，是因为它得知道你是从哪个窗口、哪个标签页复制的，这条笔记才留得住出处。',
    'perm-p2': '不给也能用：写笔记、打包项目、粘出去，全都照常，只是一键捕捉用不了。而且给不给都一样——什么都不会离开你的 Mac。这个应用在构造上就没有联网能力，它根本没地方可送。',
    't1-h': '已由 Apple 签名公证',
    't1-p': '安装包用 Apple 开发者证书签了名，并且经过 Apple 公证，所以 macOS 打开它不会弹「无法验证开发者」。只支持 Apple 芯片——Intel 的 Mac 能下下来，但打不开。',
    't2-h': '就一个文件，在你自己电脑上',
    't2-p': '所有工作区、项目、笔记和批注，都在一个 <code>spool.db</code> 文件里。可以复制、可以备份、也可以删掉。不用注册账号，不用信任谁的服务器，也没有什么要取消。',
    't3-h': '不做任何追踪',
    't3-p': '没有统计、没有埋点、没有崩溃上报。只有在你连按两下 <span class="kbd">⌥</span> 的那一瞬间它才去读剪贴板，别的时候不读。笔记只在你自己的 AI 应用来读时才离开，而且要你先把那个开关打开。',
    't4-h': '一个人做的',
    't4-p': '没有公司、没有融资、没有什么路线图会议。做的过程一路写下来、公开放着——包括我把自己数据库清空的那一天，以及后来改了什么让它不可能再发生。公开的是这份构建记录；源码目前没有开放。',
    'priv-link': '阅读完整隐私政策 →',
    'maker-link': '看它是怎么做出来的 →',

    /* faq */
    'faq-k': '常见问题',
    'faq-h': '大家最先问的那几个',
    'q1': 'Intel 的 Mac 能用吗？',
    'a1': '现在不能。安装包只有 Apple 芯片（arm64）这一个版本——在 Intel 的 Mac 上能下下来，但应用打不开。也没有另一个 Intel 版本可以指给你。',
    'q2': 'Windows 呢？iPhone 呢？',
    'a2': '没有。Spool 是 Mac 应用，捕捉快捷键是靠 macOS 独有的接口做的。与其挂个不存在的东西让你排队等，不如直说。',
    'q3': '为什么免费？',
    'a3': '背后没有服务器、没有账号体系，也没有公司，几乎没有什么成本要收回来。就一个人在做，而且全部跑在你自己机器上。',
    'q4': '哪天你不做了，我的笔记怎么办？',
    'a4': '还在原地：你 Mac 上的一个 <code>spool.db</code> 文件，SQLite 格式——不少别的软件都能打开。Spool 消失，带不走你的笔记。',
    'q5': '我不怎么用 AI，装了还有用吗？',
    'a5': '有，只是等于只用了一半。把一个项目打包成能读的纯文本，这件事本身就值——隔了一周再回到工作，多数人就是靠重读它接回去的。',
    'q6': '怎么更新？',
    'a6': '目前得手动：下载新的 dmg，把应用替换掉。还没有自动更新的通道——反过来说，这个应用也从来不会偷偷联网去查更新。',
    'q7': '它是不是一直盯着我的剪贴板？',
    'a7': '不是。只有你连按两下 <span class="kbd">⌥</span> 的那一刻它才去读剪贴板，别的时候都不读。它不做轮询，也不留你复制过什么的历史。',
    'q8': '我需要整理什么吗？',
    'a8': '只有两层——工作区，然后项目——而且你打开应用的时候它们就已经在了。没有文件夹，没有标签。捕捉到的东西会进你标成「正在做」的那个项目。',

    /* brand + cta + footer */
    'brand-cap': '标志：俯视的线轴，线头正被抽出来。',
    'cta-h': '别再把同一个项目解释第二遍。',
    'cta-p': '免费、断网可用、一分钟就能开始。',
    'cta-fine': 'Apple 芯片 Mac（arm64）· 已由 Apple 签名公证 · 无需账号 · 不做任何追踪 · <a href="https://github.com/KIM-ocean-HZ/spool/releases">全部版本在 GitHub</a>',
    'foot-copy': 'Spool 思簿 · © 2026 · 保留所有权利',
    'foot-story': '幕后的工程',
    'foot-privacy': '隐私',
    'foot-home': '主页'
  };

  var snapshots = null;

  function apply(lang) {
    window.spoolSiteLang = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    var els = document.querySelectorAll('[data-i18n]');
    if (!snapshots) {
      snapshots = new Map();
      els.forEach(function (e) { snapshots.set(e, e.innerHTML); });
    }
    els.forEach(function (e) {
      var k = e.getAttribute('data-i18n');
      e.innerHTML = (lang === 'zh' && ZH[k]) ? ZH[k] : snapshots.get(e);
    });
    document.querySelectorAll('[data-lang-section]').forEach(function (s) {
      s.hidden = s.getAttribute('data-lang-section') !== lang;
    });
    document.querySelectorAll('.lang-toggle').forEach(function (b) {
      b.textContent = lang === 'zh' ? 'EN' : '中文';
    });
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
    window.dispatchEvent(new Event('spool-lang'));
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.lang-toggle')) return;
    apply(window.spoolSiteLang === 'zh' ? 'en' : 'zh');
  });

  apply(initial);
})();
