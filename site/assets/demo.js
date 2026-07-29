/* Spool interactive demo — a scripted simulation of the core loop.
   Everything is client-side and preset: no network, no AI is called.
   Bilingual: string tables below; rebuilt on the site language toggle.
   Guidance model: one instruction banner updated after EVERY completed
   action, plus a pulsing cue on the next click target.
   Phases: capture1 → capture2 → capture3 → pack → rebrief → mcp → done */

(function () {
  'use strict';

  var root = document.getElementById('demo-app');
  if (!root) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= string tables ================= */

  var STR = {};

  STR.en = {
    ribbon: 'INTERACTIVE SIMULATION · SCRIPTED DATA · NO AI CALLED',
    replay: 'replay',
    rail: ['1 · Capture', '2 · Pack', '3 · Re-brief', '4 · MCP'],
    threadName: 'Distributed scheduling paper',
    threadSub: 'deadline Friday · 3 threads in workspace',
    side: {
      ws1: 'Research',
      t1: 'Distributed scheduling paper',
      cap: '● capturing',
      t2: 'Rust study notes',
      t3: 'Course report',
      ws2: 'Life',
      t4: 'Recipes'
    },
    feedEmpty: 'Captured fragments land here ↓',
    packBtn: '⎘ Pack',
    addBtn: 'Add',
    pmTitle: 'Pack this thread',
    pmSub: 'Local assembly · paste-ready for any AI',
    pmAssembling: 'assembling…',
    pmStat: function (n) { return '3 blocks · ' + n + ' chars · deterministic'; },
    pmCopy: 'Copy',
    pmCopied: '✓ Copied for real',
    pmCont: 'Paste into an AI →',
    finale: '<strong>That’s the whole loop</strong> — and notice the sidebar: Spool is a project tree, not a chat. The AI is a librarian working <em>inside your</em> structure.<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">Download for macOS</a>',
    copyLabel: '⎘ Copy',
    copied: '✓ Copied',
    keycap: '⌥ option',
    keyHint1: '<strong>double-tap</strong> — the on-screen key, or your real ⌥ key',
    keyHint2: '<strong>double-tap</strong> again',
    sendBtn: '▸ Send',
    pasteBtn: '⎘ Paste the pack',
    nudgeMcp: 'Next: no pasting at all — MCP →',

    blocks: {
      article: { time: '11:40', src: 'arXiv · Safari', text: 'Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid — orthogonal to our incremental/deadline split.' },
      chat: { time: '14:05', src: 'AI chat · Web', text: 'Incremental evaluation doesn’t require divisibility — only locally O(1) reversible updates. Sums qualify; products too, via the log domain.' },
      note: { time: '16:30', src: null, text: 'Revision order for tomorrow: fix the formula numbering in §3.2 first, then add the straggler comparison table.' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: 'Filed: §3.2 argument is complete — reversibility answers “why not truncate.” Consistent with the 6/17 baseline note; survey taxonomy cited as contrast (fn. 12).' }
    },

    tpl: {
      articleBar: 'arXiv — Safari',
      articleH: 'Scalable scheduling for ML workloads: a survey (2025)',
      articleBody: '…latency variance remains the dominant failure mode at scale. <span class="quote-target">Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid</span> — a taxonomy the authors argue is exhaustive for synchronous training…',
      chatBar: 'AI chat — Web',
      chatQ: 'Does incremental evaluation require the metric to be divisible?',
      chatA: 'No — <span class="quote-target">it doesn’t require divisibility, only locally O(1) reversible updates</span>. Sums qualify; products too, via the log domain.',
      c3a: 'Fragments so far came from <em>outside</em>: a paper, an AI. The third kind is the one Spool values most — <strong>your own thinking</strong>.',
      c3b: 'Notes with no source rank as the highest-signal content in every pack: your words are directives, everything else is evidence.',
      packA: 'Three fragments, three sources, one thread — scattered context, now in one place.',
      packB: 'Packing is pure string assembly: deterministic, no AI in the hot path. Same thread, same day, same bytes.',
      rebriefBar: 'Any AI — new conversation, zero memory',
      mcpBar: 'Claude Desktop — connected to Spool ✓',
      mcpUser: 'Where did I leave my scheduling paper? Check my Spool, then file a one-line conclusion back into the thread.'
    },

    guide: {
      start: '<b>Step 1 of 4 · Capture.</b> You’re reading a paper and one line matters. Click <strong>⎘ Copy</strong> on the highlighted sentence.',
      copied: '<b>Copied ✓</b> — now the Spool gesture: <strong>double-tap ⌥</strong>. Use the on-screen key below, or your keyboard’s real Option key.',
      cap1: '<b>✓ Captured — 1 of 3.</b> The source came along for free (“arXiv · Safari”). Next fragment: an AI just gave you a good answer — click <strong>⎘ Copy</strong> on it.',
      cap2: '<b>✓ Captured — 2 of 3.</b> Last one is <strong>your own thinking</strong> — we’ve drafted a note in Spool’s composer on the right. Just press <strong>Add</strong> (or edit it first).',
      cap3: '<b>✓ 3 of 3 — capture complete.</b> A paper, an AI, and your own note now live in one thread. Time for the crown feature: click <strong>⎘ Pack</strong> in Spool’s header.',
      packed: '<b>✓ Packed.</b> Notice the authority sections — your note outranks the sources. Try <strong>Copy</strong> (it really hits your clipboard), then <strong>Paste into an AI →</strong>',
      rebrief: '<b>Step 3 of 4 · Re-brief.</b> This AI conversation is brand-new — zero memory of you. Click <strong>⎘ Paste the pack</strong> and watch it pick the project straight up.',
      pasted: '<b>See the tags?</b> Every point in the reply traces to one of your fragments — scattered information, integrated. (Scripted reply; a real paste works just like this.)',
      mcp: '<b>Step 4 of 4 · MCP.</b> A pack briefs an AI <em>once</em>. Connected over MCP, your AI client already holds the keys to the <strong>whole library</strong> — just ask it. Click <strong>▸ Send</strong>.',
      done: '<b>✓ Done.</b> Your AI walked 14 threads and 128 blocks spanning six weeks, answered from your real state, and filed a conclusion back — attributed, append-only. It can never touch what you wrote by hand.'
    },

    packText: [
      '# Project Context: Distributed scheduling paper', '',
      'Generated by Spool on 2026-07-29. 3 blocks total.', '', '---', '',
      '## How to Read This Context', '',
      'Blocks are grouped by authority. The author’s own',
      'notes are the highest-signal content — treat them',
      'as directives, not suggestions.', '',
      '### ✍️ Author’s notes (highest signal)', '',
      '- [16:30] Revision order for tomorrow: fix the',
      '  formula numbering in §3.2 first, then add the',
      '  straggler comparison table.', '',
      '### 📚 Reference', '',
      '- [11:40 · arXiv · Safari] Chapter 4 classifies',
      '  straggler mitigation as speculative, proactive,',
      '  or hybrid — orthogonal to the incremental /',
      '  deadline split.', '',
      '### 🤖 AI-derived (verify before relying on)', '',
      '- [14:05 · AI chat] Incremental evaluation doesn’t',
      '  require divisibility — only locally O(1)',
      '  reversible updates. Sums qualify; products too,',
      '  via the log domain.'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">Got it — <strong>Distributed scheduling paper</strong>, §3.2 revision. Your pack has 3 fragments from 3 sources. Synthesized:</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ your note</span>Order of work: formula numbering first, then the straggler comparison table.</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 ai chat</span>Open §3.2 with the O(1)-reversibility argument — it directly answers “why not truncate.”</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 arxiv</span>The survey’s taxonomy is orthogonal to your split — cite it as contrast in related work, not as overlap.</div>' +
      '<div class="ab-line muted-line">Three scattered fragments → one work plan. Nothing re-explained.</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 workspaces · 14 threads</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("Distributed scheduling paper")&nbsp; <span class="ret">→ 128 blocks · 42 days of work</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("straggler")&nbsp; <span class="ret">→ 7 hits · oldest 5 weeks back</span>' },
      { kind: 'ai', html: 'You stopped mid-revision of <strong>§3.2</strong>. Your own plan: fix the formula numbering first, then add the straggler comparison table. The July 8 reversibility argument answers the truncation objection — I’ve filed it as a conclusion in the thread.' },
      { kind: 'chip', html: '⚙ <span class="tool">add_block</span>(conclusion, source: "Claude · MCP")&nbsp; <span class="ok">✓ filed</span>' }
    ]
  };

  STR.zh = {
    ribbon: '交互模拟 · 预设数据 · 未调用任何 AI',
    replay: '重玩',
    rail: ['1 · 捕捉', '2 · 打包', '3 · 重新带入', '4 · MCP'],
    threadName: '分布式调度论文',
    threadSub: '截止周五 · 工作区内 3 条脉络',
    side: {
      ws1: '研究',
      t1: '分布式调度论文',
      cap: '● 捕捉中',
      t2: 'Rust 学习笔记',
      t3: '结课报告',
      ws2: '生活',
      t4: '菜谱收藏'
    },
    feedEmpty: '捕捉的碎片会落在这里 ↓',
    packBtn: '⎘ 打包',
    addBtn: '添加',
    pmTitle: '打包上下文',
    pmSub: '本地组装 · 可直接粘贴给任何 AI',
    pmAssembling: '组装中…',
    pmStat: function (n) { return '3 块 · ' + n + ' 字符 · 确定性输出'; },
    pmCopy: '复制',
    pmCopied: '✓ 真的复制了',
    pmCont: '粘贴给 AI →',
    finale: '<strong>整个循环就是这样</strong>——注意侧栏:Spool 是项目树,不是聊天工具。AI 是在<em>你的</em>结构里工作的图书管理员。<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">下载 macOS 版</a>',
    copyLabel: '⎘ 复制',
    copied: '✓ 已复制',
    keycap: '⌥ option',
    keyHint1: '<strong>双击</strong>——点屏幕上的键,或按你键盘上真实的 ⌥ 键',
    keyHint2: '再<strong>双击</strong>一次',
    sendBtn: '▸ 发送',
    pasteBtn: '⎘ 粘贴 pack',
    nudgeMcp: '下一步:一个字都不用粘贴——MCP →',

    blocks: {
      article: { time: '11:40', src: 'arXiv · Safari', text: 'Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid — orthogonal to our incremental/deadline split.' },
      chat: { time: '14:05', src: 'AI 对话 · 网页', text: '增量评估不要求可分性——只要求局部 O(1) 可逆更新。求和满足;连乘走对数域同样满足。' },
      note: { time: '16:30', src: null, text: '明天的改稿顺序:先修 §3.2 的公式编号,再补 straggler 对照表。' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: '归档:§3.2 论证已完整——可逆性正面回答「为什么不截断」。与 6/17 基线笔记一致;综述分类法作为对照引于脚注 12。' }
    },

    tpl: {
      articleBar: 'arXiv — Safari',
      articleH: 'Scalable scheduling for ML workloads: a survey (2025)',
      articleBody: '…latency variance remains the dominant failure mode at scale. <span class="quote-target">Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid</span> — a taxonomy the authors argue is exhaustive…',
      chatBar: 'AI 对话 — 网页',
      chatQ: '增量评估要求指标可分吗?',
      chatA: '不要求——<span class="quote-target">它不要求可分性,只要求局部 O(1) 可逆更新</span>。求和满足;连乘走对数域也满足。',
      c3a: '前两条碎片都来自<em>外部</em>:一篇论文、一个 AI。第三种,是 Spool 最看重的——<strong>你自己的思考</strong>。',
      c3b: '无来源的笔记在每次打包里都是最高信号:你的话是指令,其余一切只是证据。',
      packA: '三条碎片、三个来源、一条脉络——四散的上下文,现在在同一个地方。',
      packB: '打包是纯字符串组装:确定性、热路径无 AI。同一条脉络,同一天,逐字节一致。',
      rebriefBar: '任意 AI — 全新对话,零记忆',
      mcpBar: 'Claude Desktop — 已连接 Spool ✓',
      mcpUser: '我的调度论文进行到哪了?查一下我的 Spool,然后把一句话结论归档回脉络里。'
    },

    guide: {
      start: '<b>第 1 步(共 4 步)· 捕捉。</b>你在读一篇论文,有一句话很关键。点高亮句下面的 <strong>⎘ 复制</strong>。',
      copied: '<b>已复制 ✓</b>——现在是 Spool 的手势:<strong>双击 ⌥</strong>。点下面的屏幕按键,或按你键盘上真实的 Option 键。',
      cap1: '<b>✓ 已捕捉——第 1/3 条。</b>来源自动带上了(「arXiv · Safari」)。下一条:AI 刚给了你一个好回答——点它下面的 <strong>⎘ 复制</strong>。',
      cap2: '<b>✓ 已捕捉——第 2/3 条。</b>最后一条是<strong>你自己的思考</strong>——右侧 Spool 的输入框里已经替你起好草稿,直接按<strong>添加</strong>(想改也可以先改)。',
      cap3: '<b>✓ 3/3——捕捉完成。</b>一篇论文、一个 AI、一条你自己的笔记,现在都在同一条脉络里。轮到招牌功能了:点 Spool 头部的 <strong>⎘ 打包</strong>。',
      packed: '<b>✓ 已打包。</b>注意权威度分区——你的笔记排在所有来源之上。试试<strong>复制</strong>(会真的进你的剪贴板),然后点<strong>粘贴给 AI →</strong>',
      rebrief: '<b>第 3 步(共 4 步)· 重新带入。</b>这个 AI 对话是全新的——对你一无所知。点 <strong>⎘ 粘贴 pack</strong>,看它瞬间接上你的项目。',
      pasted: '<b>看到标签了吗?</b>回复里每个论点都能追溯到你的某条碎片——零散信息,被整合了。(回复是预设的;真实粘贴的效果与此完全相同。)',
      mcp: '<b>第 4 步(共 4 步)· MCP。</b>pack 只能简报<em>一次</em>。通过 MCP 连接后,你的 AI 客户端拿着<strong>整个库</strong>的钥匙——直接问它就行。点 <strong>▸ 发送</strong>。',
      done: '<b>✓ 完成。</b>你的 AI 遍历了 14 条脉络、128 个块、六周的工作,基于你的真实状态作答,并把结论归档回来——有署名、只追加。你手写的内容它永远碰不了。'
    },

    packText: [
      '# 项目上下文:分布式调度论文', '',
      '由 Spool 生成于 2026-07-29。共 3 块。', '', '---', '',
      '## 如何阅读这份上下文', '',
      '块按权威度分组。作者本人的笔记是最高信号,',
      '请当作指令而非建议对待。', '',
      '### ✍️ 作者笔记(最高信号)', '',
      '- [16:30] 明天的改稿顺序:先修 §3.2 的公式编号,',
      '  再补 straggler 对照表。', '',
      '### 📚 参考资料', '',
      '- [11:40 · arXiv · Safari] Chapter 4 classifies',
      '  straggler mitigation as speculative, proactive,',
      '  or hybrid — orthogonal to the incremental /',
      '  deadline split.', '',
      '### 🤖 AI 生成(使用前请核验)', '',
      '- [14:05 · AI 对话] 增量评估不要求可分性——只要求',
      '  局部 O(1) 可逆更新。求和满足;连乘走对数域',
      '  同样满足。'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">收到——<strong>分布式调度论文</strong>,§3.2 改稿。你的 pack 里有来自 3 个来源的 3 条碎片,整合如下:</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ 你的笔记</span>工作顺序:先修公式编号,再补 straggler 对照表。</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 AI 对话</span>§3.2 开篇用 O(1) 可逆性论证——它正面回答「为什么不截断」。</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 ARXIV</span>综述的分类法与你的划分正交——在相关工作里作为对照引用,不是重叠。</div>' +
      '<div class="ab-line muted-line">三条零散碎片 → 一份工作计划。一个字都没有重新解释。</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 个工作区 · 14 条脉络</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("分布式调度论文")&nbsp; <span class="ret">→ 128 块 · 42 天的工作</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("straggler")&nbsp; <span class="ret">→ 7 处命中 · 最早在 5 周前</span>' },
      { kind: 'ai', html: '你停在 <strong>§3.2</strong> 改稿中途。你自己的计划:先修公式编号,再补 straggler 对照表。7 月 8 日的可逆性论证正面回答了截断质疑——我已把它作为结论归档进脉络。' },
      { kind: 'chip', html: '⚙ <span class="tool">add_block</span>(conclusion, source: "Claude · MCP")&nbsp; <span class="ok">✓ 已归档</span>' }
    ]
  };

  /* ================= runtime ================= */

  var L, state;
  var left, feed, chip, chipsrc, packbtn, composer, noteinput, modal, packpre, packstat, guide;

  function $(id) { return document.getElementById(id); }
  function say(html) { guide.innerHTML = html; }
  function cue(el) {
    root.querySelectorAll('.cue').forEach(function (n) { n.classList.remove('cue'); });
    if (el) el.classList.add('cue');
  }
  function cueIn(sel) { cue(left.querySelector(sel)); }

  function tpl(name) {
    var t = L.tpl;
    if (name === 'capture1') {
      return '<div class="fake-window"><div class="fw-bar"><span class="dots"><i></i><i></i><i></i></span> ' + t.articleBar + '</div>' +
        '<div class="fw-body"><h4>' + t.articleH + '</h4><p>' + t.articleBody + '</p>' +
        '<button class="copy-btn" data-action="copy">' + L.copyLabel + '</button></div></div>' +
        '<div class="keycap-row" hidden id="keyrow"><button class="keycap" data-action="tap">' + L.keycap + '</button>' +
        '<span class="keycap-hint">' + L.keyHint1 + '</span></div>';
    }
    if (name === 'capture2') {
      return '<div class="fake-window"><div class="fw-bar"><span class="dots"><i></i><i></i><i></i></span> ' + t.chatBar + '</div>' +
        '<div class="fw-body"><div class="chat">' +
        '<div class="bubble user">' + t.chatQ + '</div>' +
        '<div class="bubble ai">' + t.chatA + '</div>' +
        '</div><button class="copy-btn" data-action="copy">' + L.copyLabel + '</button></div></div>' +
        '<div class="keycap-row" hidden id="keyrow"><button class="keycap" data-action="tap">' + L.keycap + '</button>' +
        '<span class="keycap-hint">' + L.keyHint2 + '</span></div>';
    }
    if (name === 'capture3') {
      return '<div class="fake-window"><div class="fw-body"><p style="font-size:0.85rem;margin:0">' + t.c3a + '</p>' +
        '<p class="muted" style="font-size:0.8rem;margin:0.6rem 0 0">' + t.c3b + '</p></div></div>';
    }
    if (name === 'pack') {
      return '<div class="fake-window"><div class="fw-body"><p style="font-size:0.85rem;margin:0">' + t.packA + '</p>' +
        '<p class="muted" style="font-size:0.8rem;margin:0.6rem 0 0">' + t.packB + '</p></div></div>';
    }
    if (name === 'rebrief') {
      return '<div class="fake-window"><div class="fw-bar"><span class="dots"><i></i><i></i><i></i></span> ' + t.rebriefBar + '</div>' +
        '<div class="fw-body"><div class="chat" id="chat"></div>' +
        '<button class="copy-btn" data-action="paste" id="pastebtn">' + L.pasteBtn + '</button></div></div>';
    }
    if (name === 'mcp') {
      return '<div class="fake-window"><div class="fw-bar"><span class="dots"><i></i><i></i><i></i></span> ' + t.mcpBar + '</div>' +
        '<div class="fw-body"><div class="chat" id="mcpchat">' +
        '<div class="bubble user">' + t.mcpUser + '</div>' +
        '</div><button class="copy-btn" data-action="mcp" id="mcpbtn" style="margin-top:0.8rem">' + L.sendBtn + '</button></div></div>';
    }
    return '';
  }

  function build() {
    L = STR[(window.spoolSiteLang === 'zh') ? 'zh' : 'en'];
    root.innerHTML =
      '<div class="demo-frame">' +
      '<div class="demo-ribbon"><span>' + L.ribbon + '</span>' +
      '<button class="reset-link" data-action="reset">' + L.replay + '</button></div>' +
      '<div class="demo-rail">' +
      '<span class="rail-step" id="rs0"><span class="tick">✓ </span>' + L.rail[0] + ' <span id="capcount">0/3</span></span>' +
      '<span class="rail-step" id="rs1"><span class="tick">✓ </span>' + L.rail[1] + '</span>' +
      '<span class="rail-step" id="rs2"><span class="tick">✓ </span>' + L.rail[2] + '</span>' +
      '<span class="rail-step" id="rs3"><span class="tick">✓ </span>' + L.rail[3] + '</span>' +
      '</div>' +
      '<div class="demo-guide" id="guide"></div>' +
      '<div class="demo-stage">' +
      '<div class="demo-left" id="left"></div>' +
      '<div class="demo-right">' +
      '<div class="overlay-chip" id="chip"><span>✓</span><span class="src" id="chipsrc"></span></div>' +
      '<div class="mini-spool-bar"><span class="title">Spool<span class="zh">思簿</span></span>' +
      '<button class="pack-btn" id="packbtn" data-action="open-pack" disabled>' + L.packBtn + '</button></div>' +
      '<div class="mini-body">' +
      '<div class="mini-side" aria-label="Workspaces and threads">' +
      '<div class="ms-label">' + L.side.ws1 + '</div>' +
      '<div class="ms-item active">' + L.side.t1 + '<span class="ms-cap">' + L.side.cap + '</span></div>' +
      '<div class="ms-item">' + L.side.t2 + '</div>' +
      '<div class="ms-item">' + L.side.t3 + '</div>' +
      '<div class="ms-label">' + L.side.ws2 + '</div>' +
      '<div class="ms-item">' + L.side.t4 + '</div>' +
      '</div>' +
      '<div class="mini-main">' +
      '<div class="thread-meta"><div class="tname">' + L.threadName + '</div>' +
      '<div class="tsub">' + L.threadSub + '</div></div>' +
      '<div class="feed" id="feed"><div class="feed-empty">' + L.feedEmpty + '</div></div>' +
      '<form class="composer" id="composer" hidden><input id="noteinput" type="text" aria-label="note">' +
      '<button type="submit" id="addbtn">' + L.addBtn + '</button></form>' +
      '</div></div>' +
      '<div class="pack-modal" id="packmodal"><div class="pm-head"><h4>' + L.pmTitle + '</h4>' +
      '<div class="pm-sub">' + L.pmSub + '</div></div>' +
      '<pre id="packpre"></pre>' +
      '<div class="pm-foot"><span id="packstat"></span><span class="pm-actions">' +
      '<button class="pm-btn ghost" data-action="copy-pack" id="copypack" disabled>' + L.pmCopy + '</button>' +
      '<button class="pm-btn primary" data-action="to-rebrief" id="contbtn" disabled>' + L.pmCont + '</button>' +
      '</span></div></div>' +
      '</div></div>' +
      '<div class="demo-finale" id="finale">' + L.finale + '</div>' +
      '</div>';

    left = $('left'); feed = $('feed'); chip = $('chip'); chipsrc = $('chipsrc');
    packbtn = $('packbtn'); composer = $('composer'); noteinput = $('noteinput');
    modal = $('packmodal'); packpre = $('packpre'); packstat = $('packstat');
    guide = $('guide');

    state = { phase: '', captured: 0, copied: false, taps: 0, tapAt: 0, busy: false };
    setPhase('capture1');
    say(L.guide.start);
    cueIn('.copy-btn');
  }

  function setPhase(p) {
    state.phase = p;
    state.copied = false;
    var html = tpl(p);
    if (html) left.innerHTML = html;
    composer.hidden = p !== 'capture3';
    if (p === 'capture3') noteinput.value = L.blocks.note.text;
    rail();
  }

  function rail() {
    var order = { capture1: 0, capture2: 0, capture3: 0, pack: 1, rebrief: 2, mcp: 3, done: 4 };
    var cur = order[state.phase];
    for (var i = 0; i < 4; i++) {
      var el = $('rs' + i);
      el.classList.toggle('active', i === cur);
      el.classList.toggle('done', i < cur);
    }
    var cc = $('capcount');
    if (cc) cc.textContent = state.captured + '/3';
  }

  function overlay(src) {
    chipsrc.textContent = src || (window.spoolSiteLang === 'zh' ? '你' : 'you');
    chip.classList.add('show');
    setTimeout(function () { chip.classList.remove('show'); }, 1600);
  }

  function addBlock(b) {
    var empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();
    var card = document.createElement('article');
    card.className = 'block-card';
    var youLbl = window.spoolSiteLang === 'zh' ? '你' : 'you';
    var meta = '<div class="bmeta"><span>' + b.time + '</span>' +
      (b.src ? '<span class="src' + (b.mcp ? ' mcp' : '') + '">' + b.src + '</span>'
             : '<span class="src">' + youLbl + '</span>') + '</div>';
    card.innerHTML = meta + '<div>' + b.text + '</div>';
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }

  /* ---------- capture gesture ---------- */

  function armedForTap() {
    return state && (state.phase === 'capture1' || state.phase === 'capture2') && state.copied;
  }

  function tap() {
    if (!armedForTap()) return;
    var now = Date.now();
    if (now - state.tapAt < 500) { state.taps++; } else { state.taps = 1; }
    state.tapAt = now;
    var keycap = left.querySelector('.keycap');
    if (keycap) {
      keycap.classList.add('pressed');
      setTimeout(function () { keycap.classList.remove('pressed'); }, 110);
    }
    if (state.taps >= 2) { state.taps = 0; captureLands(); }
  }

  function captureLands() {
    var first = state.phase === 'capture1';
    var b = first ? L.blocks.article : L.blocks.chat;
    state.captured++;
    overlay(b.src);
    addBlock(b);
    if (first) {
      setPhase('capture2');
      say(L.guide.cap1);
      cueIn('.copy-btn');
    } else {
      setPhase('capture3');
      say(L.guide.cap2);
      cue($('addbtn'));
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Alt' && armedForTap()) { e.preventDefault(); if (!e.repeat) tap(); }
  });

  /* ---------- typewriter & reveal ---------- */

  function typeInto(el, text, charsPerTick, done) {
    if (reduceMotion) { el.textContent = text; done && done(); return; }
    var i = 0;
    var t = setInterval(function () {
      i += charsPerTick;
      el.textContent = text.slice(0, i);
      el.scrollTop = el.scrollHeight;
      if (i >= text.length) { clearInterval(t); done && done(); }
    }, 33);
  }

  function revealChildren(el, delay, done) {
    var kids = Array.prototype.slice.call(el.children);
    var i = 0;
    (function next() {
      if (i < kids.length) {
        kids[i].classList.add('on');
        i++;
        setTimeout(next, reduceMotion ? 0 : delay);
      } else { done && done(); }
    })();
  }

  /* ---------- actions (delegated once) ---------- */

  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var a = btn.dataset.action;

    if (a === 'copy') {
      state.copied = true;
      btn.classList.add('copied');
      btn.textContent = L.copied;
      btn.disabled = true;
      var kr = left.querySelector('#keyrow');
      if (kr) kr.hidden = false;
      say(L.guide.copied);
      cueIn('.keycap');
    }

    if (a === 'tap') tap();

    if (a === 'open-pack' && state.phase === 'pack') {
      cue(null);
      modal.classList.add('show');
      packstat.textContent = L.pmAssembling;
      typeInto(packpre, L.packText, 30, function () {
        packstat.textContent = L.pmStat(L.packText.length);
        $('copypack').disabled = false;
        $('contbtn').disabled = false;
        say(L.guide.packed);
        cue($('contbtn'));
      });
    }

    if (a === 'copy-pack') {
      if (navigator.clipboard) navigator.clipboard.writeText(L.packText);
      btn.textContent = L.pmCopied;
    }

    if (a === 'to-rebrief') {
      modal.classList.remove('show');
      setPhase('rebrief');
      say(L.guide.rebrief);
      cueIn('#pastebtn');
    }

    if (a === 'paste' && !state.busy) {
      state.busy = true;
      btn.disabled = true;
      cue(null);
      var chat = left.querySelector('#chat');
      var u = document.createElement('div');
      u.className = 'bubble user pasted';
      u.textContent = '📋 ' + L.packText.split('\n')[0].replace(/^#\s*/, '');
      chat.appendChild(u);
      var ai = document.createElement('div');
      ai.className = 'bubble ai typing-dots';
      chat.appendChild(ai);
      setTimeout(function () {
        ai.classList.remove('typing-dots');
        ai.innerHTML = '<div class="ai-brief">' + L.aiReply + '</div>';
        revealChildren(ai.firstChild, 550, function () {
          state.busy = false;
          var next = document.createElement('button');
          next.className = 'next-nudge';
          next.dataset.action = 'to-mcp';
          next.textContent = L.nudgeMcp;
          left.appendChild(next);
          say(L.guide.pasted);
          cue(next);
        });
      }, reduceMotion ? 0 : 900);
    }

    if (a === 'to-mcp') {
      setPhase('mcp');
      say(L.guide.mcp);
      cueIn('#mcpbtn');
    }

    if (a === 'mcp' && !state.busy) {
      state.busy = true;
      btn.disabled = true;
      btn.style.display = 'none';
      cue(null);
      var mchat = left.querySelector('#mcpchat');
      var i = 0;
      (function next() {
        if (i < L.mcpScript.length) {
          var step = L.mcpScript[i];
          var el = document.createElement('div');
          el.className = step.kind === 'chip' ? 'tool-chip' : 'bubble ai';
          el.innerHTML = step.html;
          mchat.appendChild(el);
          mchat.parentElement.scrollTop = mchat.parentElement.scrollHeight;
          i++;
          setTimeout(next, reduceMotion ? 0 : (step.kind === 'chip' ? 620 : 1100));
        } else {
          overlay(L.blocks.mcp.src);
          addBlock(L.blocks.mcp);
          state.busy = false;
          state.phase = 'done';
          rail();
          $('finale').classList.add('show');
          say(L.guide.done);
        }
      })();
    }

    if (a === 'reset') build();
  });

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('#composer');
    if (!form) return;
    e.preventDefault();
    if (state.phase !== 'capture3') return;
    var txt = noteinput.value.trim() || L.blocks.note.text;
    state.captured++;
    addBlock({ time: L.blocks.note.time, src: null, text: txt });
    overlay(null);
    noteinput.value = '';
    packbtn.disabled = false;
    packbtn.classList.add('armed');
    setPhase('pack');
    say(L.guide.cap3);
    cue(packbtn);
  });

  /* rebuild on site language switch */
  window.addEventListener('spool-lang', build);

  build();
})();
