/* Site language toggle — EN authored in the HTML, ZH applied from this map.
   Persisted in localStorage; demo.js rebuilds itself on the 'spool-lang' event.
   Copy rule for both languages: everyday words only. No jargon a first-time
   visitor would have to look up. */
(function () {
  'use strict';

  var KEY = 'spool-site-lang';
  var initial = 'en';
  try { if (localStorage.getItem(KEY) === 'zh') initial = 'zh'; } catch (e) { /* private mode */ }

  var ZH = {
    /* nav (shared across pages) */
    'nav-try': '试一试',
    'nav-how': '怎么用',
    'nav-story': '幕后',
    'nav-privacy': '隐私',
    'nav-dl': '下载',

    /* hero */
    'hero-h1': '同一个项目,<br>不必解释第二遍。',
    'hero-tag': 'Spool 替你记住手上每个项目的来龙去脉。',
    'hero-sub': '看到值得留下的东西就复制——AI 给的好答案、邮件里关键的一句、一个转身就忘的念头。按一次键,它就存进你正在做的项目,连来源一起记下。之后一键,整个项目变成一段文字,粘给任何 AI。',
    'dl-btn': '下载 macOS 版',
    'try-btn': '在这里直接试 ↓',
    'fineprint': '免费 · macOS · 断网可用 · 无需账号 · 不做任何追踪',

    /* demo */
    'demo-k': '试一试 —— 60 秒',
    'demo-h': '整个流程,就在这里走一遍',
    'demo-p': '存三条笔记、打包,然后看一个全新的 AI 对话在你什么都没交代的情况下接上你的项目。内容是事先写好的;每一步和真实应用完全一样。',

    /* problem */
    'prob-k': '为什么会有它',
    'prob-p': '你一关标签页,AI 就忘了你的项目,于是你重新解释一遍。再一遍。而真正的细节,散在各个对话、邮件和几周前关掉的标签页里。<em>Spool 把它们收在一处:一次粘贴,任何 AI 立刻跟上进度。</em>',

    /* how it works */
    'how-k': '怎么用',
    'how-h': '存下来,留着,粘出去',
    'l1-n': '01 · 存',
    'l1-h': '一次按键,不用做任何决定。',
    'l1-p': '复制任何内容,然后连按两下 <span class="kbd">⌥</span>。它直接进入你正在做的项目,连来源一起记下——精确到是浏览器的哪个标签页。角落弹一个小提示确认。主窗口不会跳出来,所以你不会丢掉手头的位置和思路。',
    'cap-toast': '真实的确认提示,叠在你正在读的东西上面:存了什么、存去了哪、以及撤销。',
    'l2-n': '02 · 留',
    'l2-h': '是一份清单,不是聊天。',
    'l2-p': '存下的东西按时间顺序堆在同一个项目下。只有两层——工作区,然后项目。不用建文件夹,不用选标签,没有什么需要整理。下周回来,最新的几条就告诉你上次停在哪。',
    'l3-n': '03 · 粘',
    'l3-h': '一键成文,拿去就能粘。',
    'l3-p': 'Spool 把整个项目写成纯文本:你自己的话排在最前,看来的东西标明出处,AI 写的部分单独标出以便你核对。粘给任何 AI——或者你自己读一遍,直接回到工作状态。',

    /* three promises */
    'comm-k': '它的不同之处',
    'comm-h': '三个承诺',
    'c1-h': '存一条,只花一次按键',
    'c1-p': '如果存一条要花不止一次按键,人就不会去存了。Spool 其他所有决定都是从这一条推出来的——不用切窗口、不用填框、不用做选择。',
    'c2-h': '没有一条会丢掉出处',
    'c2-p': '每条笔记都带着时间和来源。几个月后你仍然分得清:哪些是你自己定下的,哪些只是你在某处读到的——你把它给 AI 看时,AI 也分得清。',
    'c3-h': 'AI 帮忙,而且署名',
    'c3-p': '接上你本来就在付费用的 AI 应用。它们可以读、可以搜、可以添笔记,每一条添加都带署名。而你手写的内容,机器无权改动。',

    /* the app */
    'app-k': '应用本身',
    'app-h': '安静是刻意的',
    'app-p': '暖纸色、一种强调色、没有争抢注意力的角标。在你有东西要存之前,它一直待在视线之外。',
    'tab-main': '一个项目',
    'tab-pack': '打包',
    'tab-digest': '收尾',
    'cap-main': '一个项目,五条笔记:你的目标、一条招聘信息、一段 AI 对话的回答、你自己的决定、招聘方的邮件。每一条都留着它的时间和来源。',
    'cap-pack': '打包一个项目:选好范围,复制,粘贴。五条笔记变成 3,899 个字符、拿去就能粘的文字。',
    'cap-digest': '一个完结的项目,收拢成结论和真正重要的那几条笔记。',

    /* mcp */
    'mcp-k': 'MCP —— 粘贴之外',
    'mcp-h': '让你的 AI 直接读你的笔记',
    'mcp-p1': '打包一次,只是一次粘贴。有了 Model Context Protocol,你本来就在用的 AI 应用可以随时打开你的笔记:读数周的上下文、搜索每一个项目、把找到的结论放回正确的位置。十个工具、两个由你亲手打开的开关,没有任何服务器。',
    'mtab-lib': '① 它看得见你的项目',
    'mtab-digest': '② 它从数周的笔记里作答',
    'mtab-search': '③ 它知道每条的出处',
    'mtab-file': '④ 它写回来,并且署名',
    'mcap-lib': '一句大白话提问,AI 就从你的 Mac 上读出工作区、项目,以及每个项目有多少条笔记。',
    'mcap-digest': '一段话,来自你三周里从四个不同地方存下的笔记。这正是一次粘贴做不到的事。',
    'mcap-search': '每条结果都留着出处:哪些是你读到的,哪些是 AI 建议的,哪些是你自己定的。',
    'mcap-file1': '让它归档一条结论,它只写一条笔记——附一句理由,并链回它所依据的那一条。',
    'mcap-file2': '……而它在 Spool 里长这样。署名 <strong>Claude · MCP</strong>,加在你那条笔记<strong>下面</strong>而不是盖在上面,<strong>↩</strong> 行指向它所回答的那一条。',
    'mcp-note': '截图用的是专门为此搭的一个库,里面没有任何个人内容。',

    /* privacy strip */
    'priv-k': '隐私',
    'priv-h': '一切都留在你自己的电脑上。',
    'pp1': '没有账号,没有服务器——什么都不会被送出去',
    'pp2': '所有笔记就在你 Mac 上的一个文件里:可以复制、备份,也可以删掉',
    'pp3': '这个应用从构造上就无法访问互联网',
    'pp4': '只有你自己的 AI 应用来读时笔记才会离开,而且要你先打开那个开关',
    'priv-link': '阅读完整隐私政策 →',

    /* brand + cta + footer */
    'brand-cap': '标志:俯视的线轴,线头正被抽出来。',
    'cta-h': '别再把同一个项目解释第二遍。',
    'cta-p': '免费、断网可用、一分钟就能开始。',
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
