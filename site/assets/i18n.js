/* Site language toggle — EN authored in the HTML, ZH applied from this map.
   Persisted in localStorage; demo.js rebuilds itself on the 'spool-lang' event. */
(function () {
  'use strict';

  var KEY = 'spool-site-lang';
  var initial = 'en';
  try { if (localStorage.getItem(KEY) === 'zh') initial = 'zh'; } catch (e) { /* private mode */ }

  var ZH = {
    /* nav (shared) */
    'nav-try': '试一试',
    'nav-how': '工作方式',
    'nav-story': '工程叙事',
    'nav-privacy': '隐私',
    'nav-dl': '下载',
    /* hero */
    'hero-h1': '你的项目,<br>不必再解释一遍。',
    'hero-tag': 'Spool(思簿)——长期项目的上下文中枢。',
    'hero-sub': '在信息出现的那一刻捕捉它——一段好的 AI 回答、埋在邮件里的决定、一闪而过的想法。Spool 把碎片按项目串成脉络,任何一条脉络都能一键打包成可直接粘贴的简报:随时回到项目,随时把 AI 重新带入状态。',
    'dl-btn': '下载 macOS 版',
    'try-btn': '在这里直接试 ↓',
    'fineprint': '免费 · macOS(Apple&nbsp;Silicon)· 本地优先 · 无账号 · 零遥测',
    /* demo section */
    'demo-k': '60 秒交互演示',
    'demo-h': '现在就把整个循环走一遍',
    'demo-p': '捕捉三条碎片、打包、看一个全新的 AI 对话瞬间接上你的项目。数据是预设的——工作流与真实产品完全一致。',
    /* problem */
    'prob-k': '为什么需要 Spool',
    'prob-p': 'LLM 不记得你的项目。每个新对话都从零开始——跨越多个 AI、多个标签页、数周时间,项目的上下文被切得粉碎。<em>Spool 把「重新解释」压缩成「一次粘贴」。</em>',
    /* loop */
    'how-k': '核心循环',
    'how-h': '捕捉 → 脉络 → 打包',
    'l1-n': '01 · 捕捉',
    'l1-h': '一次按键,零决策。',
    'l1-p': '复制任何内容,然后双击 <span class="kbd">⌥</span>。碎片带着自动识别的来源落进当前脉络——精确到你复制时所在的浏览器标签页。安静的浮层在当前屏幕确认保存,主窗口永远不用弹出来。捕捉搭上你早已形成的 <span class="kbd">⌘C</span> 肌肉记忆。',
    'l2-n': '02 · 脉络',
    'l2-h': '是日志,不是聊天。',
    'l2-p': '碎片按时间累积成每个项目的只追加时间线——只有两层:工作区 → 脉络,没有无限嵌套。最新的块就是「你上次停在哪」:不需要维护任何状态笔记。批注可以挂在任何块上,之后打包时它们权重最高。',
    'l3-n': '03 · 打包',
    'l3-p': '一键把脉络组装成按权威度排序的 Markdown 简报——你自己的话最高,参考资料保持是参考资料,AI 生成的内容标注待核验。纯字符串组装:确定性、热路径无 AI,对任何 AI 都有效,因为它只是文本。',
    'l3-h': '可直接粘贴的上下文,带出处。',
    /* commitments */
    'comm-k': '它的不同之处',
    'comm-h': '三个承诺',
    'c1-h': '零摩擦捕捉',
    'c1-p': '不切窗口、不弹对话框、不选标签。捕捉的成本一旦超过一次按键,它就不会发生——所以 Spool 的一切都从那一次按键倒推设计。',
    'c2-h': '忠于出处的打包',
    'c2-p': '每个块都带着它的来源与时间。读你 pack 的 AI 分得清哪些是你的判断、哪些是资料、哪些是另一个 AI 说的——并区别对待。',
    'c3-h': 'AI 是图书管理员,不是作者',
    'c3-p': '通过 MCP,你自己的 AI 客户端可以读取、搜索、归档进你的库——每次写入都有署名、只追加。你手写的内容永远不会被覆盖。Spool 本体零 AI:没有密钥,没有云。',
    /* real app */
    'app-k': '真实应用',
    'app-h': '安静是设计出来的',
    'app-p': '暖纸色、单一强调色、没有争抢注意力的角标。在你需要归档之前,界面一直退在视线之外。',
    'tab-main': '脉络视图',
    'tab-pack': '打包',
    'tab-digest': '沉淀',
    'cap-main': '脉络视图:碎片带着时间、来源和你的批注。',
    'cap-pack': '打包一条脉络:选意图与范围,复制,粘到任何地方。',
    'cap-digest': '完结脉络的沉淀页:结论、置顶块、文件与链接。',
    /* mcp */
    'mcp-k': 'MCP · 粘贴之外',
    'mcp-h': '你的 AI,常驻图书管理员',
    'mcp-p1': '一次 pack 只简报一次。通过 <strong>Model Context Protocol</strong>,你已经拥有的 AI 客户端——Claude Desktop、Cursor 等——得到的是常驻访问:按需读取数月的上下文、搜索库里的每条脉络、把结论归档回正确的位置。',
    'mcp-p2': '十个工具、两个需要你亲手打开的开关、不占任何网络端口。AI 的每次写入都有署名且只追加——你手写的块对机器永远只读。',
    'mcp-cap': '一次真实会话的调用轨迹。你的 AI 看到的是整个库——而不是一次粘贴。',
    /* privacy strip */
    'priv-k': '隐私',
    'priv-h': '你的数据留在你的电脑上。没有例外。',
    'pp1': '无账号、无服务器、无遥测、无崩溃上报',
    'pp2': '一切存在本机一个 SQLite 文件里,可整个复制或删除',
    'pp3': '应用的内容安全策略在结构上封死了一切对外网络请求',
    'pp4': '数据只在<em>你的</em> MCP 客户端读取时离开——背后是两个需要你亲手打开的开关',
    'priv-link': '阅读完整隐私政策 →',
    /* brand + cta + footer */
    'brand-cap': '标志:俯视的线轴,线头正被抽出。',
    'cta-h': '别再重新解释你的项目。',
    'cta-p': '免费、本地优先、一分钟上手。',
    'foot-copy': 'Spool 思簿 · © 2026 · 保留所有权利',
    'foot-story': '工程叙事',
    'foot-privacy': '隐私',
    'foot-home': '主页',
    /* story page */
    'zh-note-text': '工程叙事页暂以英文呈现(作为 portfolio / 申请材料)。主页与交互演示支持中文。'
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
