/* Spool interactive demo — a scripted walk through the whole loop.
   Everything is client-side and written in advance: no network, no AI is called.
   Bilingual: string tables below; rebuilt on the site language toggle.
   Guidance: one instruction line updated after EVERY completed action, plus a
   pulsing ring on the next thing to click.
   Phases: capture1 → capture2 → capture3 → pack → rebrief → mcp → done

   Copy rule: everyday words only, in both languages. */

(function () {
  'use strict';

  var root = document.getElementById('demo-app');
  if (!root) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= string tables ================= */

  var STR = {};

  STR.en = {
    ribbon: 'A WALKTHROUGH · WRITTEN IN ADVANCE · NO AI IS CALLED',
    replay: 'start over',
    rail: ['1 · Save', '2 · Pack', '3 · Paste', '4 · MCP'],
    threadName: 'Job search',
    threadSub: 'batch closes Friday · 3 projects in Work',
    side: {
      ws1: 'Work', t1: 'Job search', cap: '● saving here',
      t2: 'Portfolio site', t3: 'Interview prep',
      ws2: 'Study', t4: 'ML course',
      ws3: 'Life', t5: 'Apartment hunt'
    },
    feedEmpty: 'What you save lands here ↓',
    packBtn: '⎘ Pack',
    addBtn: 'Save',
    pmTitle: 'Pack this project',
    pmSub: 'Written on your Mac · ready to paste into any AI',
    pmAssembling: 'writing…',
    pmStat: function (n) { return '3 notes · ' + n + ' characters'; },
    pmCopy: 'Copy',
    pmCopied: '✓ Really copied',
    pmCont: 'Paste it into an AI →',
    finale: '<strong>That’s the whole loop.</strong> And look at the sidebar — a job hunt, a portfolio, a course, a flat. Spool is for any project that runs longer than one sitting.<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">Download for macOS</a>',
    copyLabel: '⎘ Copy',
    copied: '✓ Copied',
    keycap: '⌥ option',
    keyHint1: 'press it <strong>twice, quickly</strong> — on screen, or your real ⌥ key',
    keyHint2: '<strong>twice</strong> again',
    sendBtn: '▸ Send',
    pasteBtn: '⎘ Paste what Spool wrote',
    nudgeMcp: 'Next: no pasting at all →',

    blocks: {
      posting: { time: '11:40', src: 'acme.com · Safari', text: 'Acme is hiring a data analyst: SQL required, Python a plus. Small team, reports to the head of ops.' },
      chat: { time: '14:05', src: 'AI chat · Safari', text: 'For a career switch, put a projects section above work history — recruiters spend about six seconds on the first screen.' },
      note: { time: '16:30', src: null, text: 'Order of work: rewrite the resume summary first, then the Acme cover letter.' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: 'Next step: the resume still leads with work history. Move the projects section above it before Friday’s batch.' }
    },

    tpl: {
      postingBar: 'Acme — Data analyst · Safari',
      postingH: 'Data Analyst — Acme (remote)',
      postingBody: '…you will own reporting for the operations team. <span class="quote-target">SQL required, Python a plus. Small team, reports to the head of ops.</span> We review applications in batches…',
      chatBar: 'AI chat · Safari',
      chatQ: 'I’m switching careers. How should I order my resume?',
      chatA: 'Lead with what you have built: <span class="quote-target">put a projects section above work history — recruiters spend about six seconds on the first screen</span>.',
      c3a: 'The first two notes came from <em>somewhere else</em> — a job posting, an AI. The third kind is the one Spool values most: <strong>what you decided yourself</strong>.',
      c3b: 'Notes with no source count for the most when Spool writes the project out. Your words are decisions; everything else is just material.',
      packA: 'Three notes, three different places, one project — the scattered bits are now in one list.',
      packB: 'Spool writes it out on your Mac. No AI involved, and the same project always comes out the same way.',
      rebriefBar: 'A new AI chat — knows nothing about you',
      mcpBar: 'Claude Desktop — connected to Spool ✓',
      mcpUser: 'Where am I with my job search? Check my Spool, then save the next step back into it.'
    },

    guide: {
      start: '<b>Step 1 of 4 · Save.</b> You are reading a job posting and one line matters. Click <strong>⎘ Copy</strong> on the highlighted sentence.',
      copied: '<b>Copied ✓</b> Now the Spool part: press <strong>⌥ twice, quickly</strong>. Use the key below, or the real Option key on your keyboard.',
      cap1: '<b>✓ Saved — 1 of 3.</b> The source came along by itself (“acme.com · Safari”). Next: an AI just told you something useful — click <strong>⎘ Copy</strong> on it.',
      cap2: '<b>✓ Saved — 2 of 3.</b> The last one is <strong>your own decision</strong>. We have written it out for you on the right — just press <strong>Save</strong> (or edit it first).',
      cap3: '<b>✓ 3 of 3.</b> A job posting, an AI answer and your own decision now sit in one project. Now the useful part: click <strong>⎘ Pack</strong> at the top.',
      packed: '<b>✓ Done.</b> Notice the order — your own note comes first, above both sources. Try <strong>Copy</strong> (it really does copy), then <strong>Paste it into an AI →</strong>',
      rebrief: '<b>Step 3 of 4 · Paste.</b> This chat is brand new and knows nothing about you. Click <strong>⎘ Paste what Spool wrote</strong>.',
      pasted: '<b>See the little labels?</b> Every line of the answer comes from one of your notes. Scattered bits, put together. (The reply is written in advance; a real paste works the same way.)',
      mcp: '<b>Step 4 of 4 · MCP.</b> Pasting briefs an AI <em>once</em>. Connect it to Spool instead and it can open <strong>everything you have saved</strong>, any time you ask. Click <strong>▸ Send</strong>.',
      done: '<b>✓ That’s it.</b> It read across your projects, answered from notes you saved weeks apart, and put the next step back where it belongs — signed, and added below your own note, never over it.'
    },

    packText: [
      '# Project: Job search', '',
      'Written by Spool. 3 notes.', '', '---', '',
      '## How to read this', '',
      'Notes are grouped by who wrote them. The',
      'ones with no source are the author’s own —',
      'treat those as decisions, not suggestions.', '',
      '### ✍️ My own notes (count for the most)', '',
      '- [16:30] Order of work: rewrite the resume',
      '  summary first, then the Acme cover letter.', '',
      '### 📚 Things I read', '',
      '- [11:40 · acme.com · Safari] Acme is hiring a',
      '  data analyst: SQL required, Python a plus.',
      '  Small team, reports to the head of ops.', '',
      '### 🤖 Written by an AI (check before trusting)', '',
      '- [14:05 · AI chat] For a career switch, put a',
      '  projects section above work history —',
      '  recruiters spend about six seconds on the',
      '  first screen.'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">Got it — <strong>Job search</strong>, the Acme application. Three notes, three sources. Here is the plan:</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ your note</span>Work in your order: the resume summary first, then the cover letter.</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 ai chat</span>Move the projects section above work history — that is what the six-second scan sees.</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 the posting</span>Lead with SQL. Python is only a plus, so it goes later.</div>' +
      '<div class="ab-line muted-line">Three scattered notes → one plan. Nothing explained twice.</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 workspaces · 8 projects</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("Job search")&nbsp; <span class="ret">→ 5 notes over 3 weeks</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("resume")&nbsp; <span class="ret">→ 2 hits · oldest 3 weeks back</span>' },
      { kind: 'ai', html: 'The Acme batch closes <strong>Friday</strong>. Your own note says: resume summary first, then the cover letter. But the layout decision from three weeks ago — projects above work history — still is not done. That is the real next step, so I have saved it into the project.' },
      { kind: 'chip', html: '⚙ <span class="tool">add_block</span>(next step, source: "Claude · MCP")&nbsp; <span class="ok">✓ saved</span>' }
    ]
  };

  STR.zh = {
    ribbon: '演练 · 内容事先写好 · 未调用任何 AI',
    replay: '重来一次',
    rail: ['1 · 存', '2 · 打包', '3 · 粘贴', '4 · MCP'],
    threadName: '找工作',
    threadSub: '本轮周五截止 · 「工作」下有 3 个项目',
    side: {
      ws1: '工作', t1: '找工作', cap: '● 正存到这里',
      t2: '作品集网站', t3: '面试准备',
      ws2: '学习', t4: '机器学习课',
      ws3: '生活', t5: '租房'
    },
    feedEmpty: '你存下的东西会落在这里 ↓',
    packBtn: '⎘ 打包',
    addBtn: '存下',
    pmTitle: '把这个项目打包',
    pmSub: '在你的 Mac 上生成 · 可直接粘给任何 AI',
    pmAssembling: '正在生成…',
    pmStat: function (n) { return '3 条笔记 · ' + n + ' 个字符'; },
    pmCopy: '复制',
    pmCopied: '✓ 真的复制了',
    pmCont: '粘给一个 AI →',
    finale: '<strong>整个流程就是这样。</strong>再看看侧栏——找工作、作品集、课程、租房。只要是一次坐不完的事，Spool 都管用。<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">下载 macOS 版</a>',
    copyLabel: '⎘ 复制',
    copied: '✓ 已复制',
    keycap: '⌥ option',
    keyHint1: '<strong>快速按两下</strong>——点屏幕上这个键，或按你键盘上真的 ⌥ 键',
    keyHint2: '再<strong>按两下</strong>',
    sendBtn: '▸ 发送',
    pasteBtn: '⎘ 粘贴 Spool 生成的文字',
    nudgeMcp: '下一步：一个字都不用粘 →',

    blocks: {
      posting: { time: '11:40', src: 'acme.com · Safari', text: 'Acme 在招数据分析师：必须会 SQL，会 Python 加分。小团队，直接向运营负责人汇报。' },
      chat: { time: '14:05', src: 'AI 对话 · Safari', text: '转行的话，把项目经历放在工作经历前面——招聘的人扫第一屏大概只花六秒。' },
      note: { time: '16:30', src: null, text: '做事顺序：先重写简历开头的自我介绍，再写 Acme 的求职信。' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: '下一步：简历现在还是工作经历打头。周五这轮截止前，把项目经历挪到它前面。' }
    },

    tpl: {
      postingBar: 'Acme — 数据分析师 · Safari',
      postingH: '数据分析师 — Acme（远程）',
      postingBody: '……你将负责运营团队的数据报表。<span class="quote-target">必须会 SQL，会 Python 加分。小团队，直接向运营负责人汇报。</span>我们会分批筛选简历……',
      chatBar: 'AI 对话 · Safari',
      chatQ: '我在转行，简历该怎么排顺序？',
      chatA: '先亮你做过的东西：<span class="quote-target">把项目经历放在工作经历前面——招聘的人扫第一屏大概只花六秒</span>。',
      c3a: '前两条都来自<em>别处</em>——一条招聘信息、一个 AI。第三种才是 Spool 最看重的：<strong>你自己做的决定</strong>。',
      c3b: '没有来源的笔记，在 Spool 生成文字时分量最重。你的话是决定，其余的都只是材料。',
      packA: '三条笔记，三个不同的地方，同一个项目——散落的东西现在在同一份清单里。',
      packB: '这段文字在你的 Mac 上生成，没有 AI 参与，同一个项目每次生成的结果都一样。',
      rebriefBar: '一个新的 AI 对话 —— 对你一无所知',
      mcpBar: 'Claude Desktop —— 已连接 Spool ✓',
      mcpUser: '我找工作这事进行到哪了？查一下我的 Spool，然后把下一步存回去。'
    },

    guide: {
      start: '<b>第 1 步（共 4 步）· 存。</b>你在看一条招聘信息，其中一句很关键。点高亮那句下面的 <strong>⎘ 复制</strong>。',
      copied: '<b>已复制 ✓</b> 接下来是 Spool 的部分：<strong>快速按两下 ⌥</strong>。点下面那个键，或按你键盘上真的 Option 键。',
      cap1: '<b>✓ 已存下——第 1/3 条。</b>来源自己跟着进来了（「acme.com · Safari」）。下一条：AI 刚说了一句有用的——点它下面的 <strong>⎘ 复制</strong>。',
      cap2: '<b>✓ 已存下——第 2/3 条。</b>最后一条是<strong>你自己的决定</strong>。右边输入框里已经替你写好了，直接按<strong>存下</strong>（想改也可以先改）。',
      cap3: '<b>✓ 3/3。</b>一条招聘信息、一个 AI 的回答、你自己的决定，现在都在同一个项目里。轮到最有用的一步了：点上方的 <strong>⎘ 打包</strong>。',
      packed: '<b>✓ 好了。</b>注意顺序——你自己那条排在最前，压过两个来源。试试<strong>复制</strong>（是真的会复制），然后点<strong>粘给一个 AI →</strong>',
      rebrief: '<b>第 3 步（共 4 步）· 粘贴。</b>这个对话刚打开，对你一无所知。点 <strong>⎘ 粘贴 Spool 生成的文字</strong>。',
      pasted: '<b>看到那些小标签了吗？</b>回答里每一条都出自你的某条笔记——散落的东西被拼起来了。（回答是事先写好的；真实粘贴的效果一样。）',
      mcp: '<b>第 4 步（共 4 步）· MCP。</b>粘贴只能让 AI 明白<em>一次</em>。把它接到 Spool 上，它就能随时打开<strong>你存下的全部内容</strong>。点 <strong>▸ 发送</strong>。',
      done: '<b>✓ 就是这样。</b>它跨项目读了一遍，用你几周里陆续存下的笔记作答，并把下一步放回了该在的地方——带署名，加在你那条笔记下面，而不是盖在上面。'
    },

    packText: [
      '# 项目：找工作', '',
      '由 Spool 生成。共 3 条笔记。', '', '---', '',
      '## 这份文字怎么读', '',
      '笔记按「谁写的」分组。没有来源的那些是',
      '作者本人写的——请当作决定，而不是建议。', '',
      '### ✍️ 我自己的笔记（分量最重）', '',
      '- [16:30] 做事顺序：先重写简历开头的自我',
      '  介绍，再写 Acme 的求职信。', '',
      '### 📚 我读到的东西', '',
      '- [11:40 · acme.com · Safari] Acme 在招数据',
      '  分析师：必须会 SQL，会 Python 加分。小',
      '  团队，直接向运营负责人汇报。', '',
      '### 🤖 AI 写的（采信前请核对）', '',
      '- [14:05 · AI 对话] 转行的话，把项目经历放',
      '  在工作经历前面——招聘的人扫第一屏大概',
      '  只花六秒。'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">收到——<strong>找工作</strong>，投 Acme 这件事。三条笔记来自三个地方，计划如下：</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ 你的笔记</span>按你定的顺序来：先改简历开头的自我介绍，再写求职信。</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 AI 对话</span>把项目经历挪到工作经历前面——六秒扫一眼时看到的就是它。</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 招聘信息</span>SQL 放在最显眼处。Python 只是加分项，往后排。</div>' +
      '<div class="ab-line muted-line">三条散落的笔记 → 一份计划。一个字都没有重新解释。</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 个工作区 · 8 个项目</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("找工作")&nbsp; <span class="ret">→ 3 周里存的 5 条笔记</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("简历")&nbsp; <span class="ret">→ 2 处命中 · 最早在 3 周前</span>' },
      { kind: 'ai', html: 'Acme 这轮<strong>周五</strong>截止。你自己那条写的是：先改简历开头，再写求职信。但三周前定下的版式决定——项目经历放在工作经历前面——到现在还没做。这才是真正的下一步，我已经把它存进项目里了。' },
      { kind: 'chip', html: '⚙ <span class="tool">add_block</span>(下一步, source: "Claude · MCP")&nbsp; <span class="ok">✓ 已存下</span>' }
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
      return '<div class="fake-window"><div class="fw-bar"><span class="dots"><i></i><i></i><i></i></span> ' + t.postingBar + '</div>' +
        '<div class="fw-body"><h4>' + t.postingH + '</h4><p>' + t.postingBody + '</p>' +
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
      '<div class="mini-side" aria-label="Workspaces and projects">' +
      '<div class="ms-label">' + L.side.ws1 + '</div>' +
      '<div class="ms-item active">' + L.side.t1 + '<span class="ms-cap">' + L.side.cap + '</span></div>' +
      '<div class="ms-item">' + L.side.t2 + '</div>' +
      '<div class="ms-item">' + L.side.t3 + '</div>' +
      '<div class="ms-label">' + L.side.ws2 + '</div>' +
      '<div class="ms-item">' + L.side.t4 + '</div>' +
      '<div class="ms-label">' + L.side.ws3 + '</div>' +
      '<div class="ms-item">' + L.side.t5 + '</div>' +
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
    chipsrc.textContent = src || (window.spoolSiteLang === 'zh' ? '你自己' : 'you');
    chip.classList.add('show');
    setTimeout(function () { chip.classList.remove('show'); }, 1600);
  }

  function addBlock(b) {
    var empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();
    var card = document.createElement('article');
    card.className = 'block-card';
    var youLbl = window.spoolSiteLang === 'zh' ? '你自己' : 'you';
    var meta = '<div class="bmeta"><span>' + b.time + '</span>' +
      (b.src ? '<span class="src' + (b.mcp ? ' mcp' : '') + '">' + b.src + '</span>'
             : '<span class="src">' + youLbl + '</span>') + '</div>';
    card.innerHTML = meta + '<div>' + b.text + '</div>';
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }

  /* ---------- the double-tap gesture ---------- */

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
    var b = first ? L.blocks.posting : L.blocks.chat;
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

  window.addEventListener('spool-lang', build);

  build();
})();
