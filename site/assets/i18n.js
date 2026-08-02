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
    'nav-story': '幕后',
    'nav-privacy': '隐私',
    'nav-dl': '下载',

    /* hero */
    'hero-h1': '同一个项目，<br>不必解释第二遍。',
    'hero-tag': 'Spool 替你记住手上每个项目的来龙去脉。',
    'hero-sub': '看到值得留下的东西就复制，然后连按两下 <span class="kbd">⌥</span>——它自己落进对应的项目，连来源一起记下。下次你开 AI 对话，一次点击就把整个项目递过去，不用再把背景重新敲一遍。<strong>第一个下午就能用上，不是攒够了才有用。</strong>',
    'dl-btn': '下载 macOS 版',
    'try-btn': '60 秒看它跑一遍 —— 什么都不用装',
    'fineprint': '免费 · macOS(Apple 芯片) · 断网可用 · 无需账号 · 不做任何追踪',

    /* demo */
    'demo-k': '试一试 —— 60 秒',
    'demo-h': '整个流程，就在这里走一遍',
    'demo-p': '存三条笔记、打包，然后看一个全新的 AI 对话在你什么都没交代的情况下接上你的项目。内容是事先写好的；每一步和真实应用完全一样。',

    /* the moment it fixes */
    'moment-k': '每次都要重来的那两分钟',
    'moment-p': '周一，你开一个新对话，把背景从头敲一遍：这个项目是什么、给谁做、上周定了什么、什么试过了不行。周三，换个对话，你又敲一遍——这次更短，还漏掉了最要紧的那条。<em>用 Spool，这些背景在你干活的时候就一条一条存下来了。点一下、粘一次，AI 就从你真正所在的位置开始。</em>',

    /* who it is for */
    'who-k': '这说的是谁',
    'who-h': '这说的是不是你？',
    'w1-h': '找工作',
    'w1-p': '招聘信息、你对简历定下的调子、HR 的邮件。粘一次，AI 写出来的求职信是知道你真实经历的。',
    'w2-h': '上课、学一门东西',
    'w2-p': '课上没听懂的那句，和后来终于把它讲通的那个解释。粘一次，AI 就拿你自己的材料考你。',
    'w3-h': '拖很久的手续',
    'w3-p': '签证、搬家、保险理赔：你查到的规定、电话里对方报的号码、截止日期。粘一次，不会漏。',
    'w4-h': '业余在做的东西',
    'w4-p': '已经排除掉的那个 bug、当初为什么选这个库。粘一次，新开的对话不会带你绕圈子。',

    /* nothing to learn */
    'learn-k': '在你担心学习成本之前',
    'learn-h': '你需要学的东西：没有。',
    'lp1': '<strong>一个你本来就在按的键。</strong>你整天都在复制。多按两下 ⌥ 就存下了——同一双手、同一秒钟，不用切窗口。',
    'lp2': '<strong>没有东西要整理。</strong>不建文件夹、不选标签、不用收拾。只有两层，而且已经给你摆好了。',
    'lp3': '<strong>没有东西要搬家。</strong>你原来的笔记软件、文档、邮箱全都照旧。Spool 只待在旁边，接住那些本来会丢掉的碎片。',
    'lp4': '<strong>没有东西要后悔。</strong>全部就在你 Mac 上的一个文件里。哪天不想用了，删掉，你生活里其他东西一点不变。',

    /* how it works */
    'how-k': '怎么用',
    'how-h': '存下来，留着，粘出去',
    'l1-n': '01 · 存',
    'l1-h': '一次按键，不用做任何决定。',
    'l1-p': '复制任何内容，然后连按两下 <span class="kbd">⌥</span>。它直接进入你正在做的项目，连来源一起记下——精确到是浏览器的哪个标签页。弹出的确认框里，光标已经停在批注框上：顺手写下让你想存它的那个念头，按 Enter；不想写就点旁边任意处。你自己的话比摘录更耐放，AI 也会先读它。',
    'cap-toast': '真实现场：页面上你选中的那几行，和浮在角上的确认提示——存了什么、存去了哪，还有一格留给你此刻的想法。',
    'l2-n': '02 · 留',
    'l2-h': '是一份清单，不是聊天。',
    'l2-p': '存下的东西按时间顺序堆在同一个项目下。只有两层——工作区，然后项目。不用建文件夹，不用选标签，没有什么需要整理。下周回来，最新的几条就告诉你上次停在哪。',
    'l3-n': '03 · 粘',
    'l3-h': '一键成文，拿去就能粘。',
    'l3-p': 'Spool 把整个项目写成纯文本：你自己的话排在最前，看来的东西标明出处，AI 写的部分单独标出以便你核对。粘给任何 AI——或者你自己读一遍，直接回到工作状态。',
    'cap-pack-loop': '真实的打包窗口：五条笔记变成 3,899 个字符、拿去就能粘的文字。两个选择，一个按钮。',

    /* three promises */
    'comm-k': '它的不同之处',
    'comm-h': '三个承诺',
    'c1-h': '存一条，只花一次按键',
    'c1-p': '如果存一条要花不止一次按键，人就不会去存了。Spool 其他所有决定都是从这一条推出来的——不用切窗口、不用填框、不用做选择。',
    'c2-h': '没有一条会丢掉出处',
    'c2-p': '每条笔记都带着时间和来源。几个月后你仍然分得清：哪些是你自己定下的，哪些只是你在某处读到的——你把它给 AI 看时，AI 也分得清。',
    'c3-h': 'AI 帮忙，而且署名',
    'c3-p': '接上你本来就在付费用的 AI 应用。它们可以读、可以搜、可以添笔记，每一条添加都带署名。而你手写的内容，机器无权改动。',

    /* the app */
    'app-k': '应用本身',
    'app-h': '安静是刻意的',
    'app-p': '暖纸色、一种强调色、没有争抢注意力的角标。在你有东西要存之前，它一直待在视线之外。',
    'tab-main': '一个项目',
    'tab-pack': '打包',
    'tab-digest': '收尾',
    'cap-main': '一个项目，五条笔记：你的目标、一条招聘信息、一段 AI 对话的回答、你自己的决定、招聘方的邮件。每一条都留着它的时间和来源。',
    'cap-pack': '打包一个项目：选好范围，复制，粘贴。五条笔记变成 3,899 个字符、拿去就能粘的文字。',
    'cap-digest': '一个完结的项目，收拢成结论和真正重要的那几条笔记。',

    /* it compounds */
    'grow-k': '然后它开始滚雪球',
    'grow-h': '第一周帮你少打字，<br>第六周帮你想起你已经忘了的事。',
    'grow-p': '第一天就能用：三条笔记、粘一次，背景不用再敲。六周之后，同一个项目里躺着你已经不记得自己做过的那个决定、那条再也搜不回来的链接、当初否掉某个方案的理由——而它们照样是那一次点击就全递过去。你的用法一点没变，只是底下攒厚了。',
    'g1-h': '第一天 · 3 条 · 266 字符',
    'g2-h': '六周后 · 21 条 · 2,143 字符',
    'grow-cap': '同一个项目，相隔六周。看右边那条置顶的：一个藏在邮件最底下的截止日期。这种东西没人靠脑子记得住——而现在它会跟其余内容一起被粘出去。',

    /* mcp */
    'mcp-k': 'MCP —— 粘贴之外',
    'mcp-h': '让你的 AI 直接读你的笔记',
    'mcp-p1': '粘贴哪儿都能用。而你已经在用的那些 AI 应用还能更进一步：<strong>在你允许之后</strong>，它们自己打开 Spool——读几周的上下文、搜遍每一个项目、把找到的结论放回该在的位置。<em>你不用再复制，直接问就行。</em>两个由你亲手打开的开关，没有任何服务器。',
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

    /* privacy strip */
    'priv-k': '隐私',
    'priv-h': '一切都留在你自己的电脑上。',
    'pp1': '没有账号，没有服务器——什么都不会被送出去',
    'pp2': '所有笔记就在你 Mac 上的一个文件里：可以复制、备份，也可以删掉',
    'pp3': '这个应用从构造上就无法访问互联网',
    'pp4': '只有你自己的 AI 应用来读时笔记才会离开，而且要你先打开那个开关',
    'priv-link': '阅读完整隐私政策 →',

    /* who made this */
    'maker-k': '这东西谁做的',
    'maker-p': 'Spool 是一个人做的，过程全部公开——<strong>包括我把自己数据库清空的那一天，以及后来我改了什么，让它不可能再发生</strong>。背后没有公司，不用注册账号，也没有什么要取消。',
    'maker-link': '看它是怎么做出来的 →',

    /* brand + cta + footer */
    'brand-cap': '标志：俯视的线轴，线头正被抽出来。',
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
