/* Spool interactive demo — a scripted walk through the whole loop.
   Everything is client-side and written in advance: no network, no AI is called.
   Bilingual: string tables below; rebuilt on the site language toggle.
   Guidance: one instruction line updated after EVERY completed action, plus a
   pulsing ring on the next thing to click.
   Phases: capture1 → pack → rebrief → mcp → review → done

   The story is a course that runs a whole term (Ocean, 2026-08-11), not a job
   hunt: the site sells work that runs for months, and the demo has to be the
   same kind of work. The last phase is the gate — what an AI proposes stops in
   a queue and the visitor clicks the yes themselves, because that is the one
   claim on the page nobody believes until they have done it.

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
    rail: ['1 · Save', '2 · Pack', '3 · Paste', '4 · MCP', '5 · Your yes'],
    sideAria: 'Workspaces and projects',
    you: 'you',
    threadName: 'Machine learning course',
    threadSub: 'quiz on Friday · 3 projects in Study',
    side: {
      ws1: 'Study', t1: 'Machine learning course', cap: '● saving here',
      t2: 'Term paper', t3: 'Reading group',
      ws2: 'Work', t4: 'Analytics rebuild',
      ws3: 'Life', t5: 'Apartment hunt'
    },
    feedEmpty: 'What you save lands here ↓',
    packBtn: '⎘ Pack',
    pmTitle: 'Pack this project',
    pmSub: 'Written on your Mac · ready to paste into any AI',
    pmAssembling: 'writing…',
    pmStat: function (n) { return '1 note · ' + n + ' characters'; },
    pmCopy: 'Copy',
    pmCopied: '✓ Really copied',
    pmCopyFailed: 'Could not copy — select the text instead',
    pmCont: 'Paste it into an AI →',
    finale: '<strong>That’s the whole loop.</strong> And look at the sidebar — a course, a term paper, a rebuild at work, a flat. Spool is for any project that runs longer than one sitting.<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">Download for macOS</a>',
    copyLabel: '⎘ Copy',
    copied: '✓ Copied',
    keycap: '⌥ option',
    keyHint1: 'press it <strong>twice, quickly</strong> — on screen, or your real ⌥ key',
    sendBtn: '▸ Send',
    pasteBtn: '⎘ Paste what Spool wrote',
    pasteSummary: '📋 Project brief pasted · 1 note',
    nudgeMcp: 'Next: no pasting at all →',
    keepBtn: '✓ Keep it',
    dropBtn: 'Throw it away',
    reviewLabel: '1 waiting for you',

    blocks: {
      posting: { time: '11:40', src: 'Lecture 7 slides · Safari', text: 'A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: 'Before Friday: explain why strong training performance can hide failure on new data, and why a bigger model is not the fix. That is the one checkpoint this saved note supports.' }
    },

    tpl: {
      postingBar: 'Lecture 7 — Overfitting · Safari',
      postingH: 'Lecture 7 · Where the error curve turns back up',
      postingBody: '…the training error keeps falling while the error on new data turns back up. <span class="quote-target">A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.</span> We come back to this next week…',
      packA: 'One saved note is enough to see the loop: capture it with its source, then hand it to a new AI chat.',
      packB: 'Spool writes it out on your Mac. No AI involved, and the same project always comes out the same way.',
      rebriefBar: 'A new AI chat — knows nothing about you',
      mcpBar: 'Claude Desktop — connected to Spool ✓',
      mcpUser: 'Where am I in the ML course, and what should I do before Friday? Check my Spool, then file the answer back into it.'
    },

    guide: {
      start: '<b>Step 1 of 5 · Save.</b> You are reading the slides for lecture 7 and one line matters. Click <strong>⎘ Copy</strong> on the highlighted sentence.',
      copied: '<b>Copied ✓</b> Now the Spool part: press <strong>⌥ twice, quickly</strong>. Use the key below, or the real Option key on your keyboard.',
      cap1: '<b>✓ Saved — 1 of 1.</b> The source came along by itself (“Lecture 7 slides · Safari”). Now click <strong>⎘ Pack</strong> at the top.',
      packed: '<b>✓ Pack ready.</b> The note and its source stayed together. Try <strong>Copy</strong>, then <strong>Paste it into an AI →</strong>',
      rebrief: '<b>Step 3 of 5 · Paste.</b> This chat is brand new and knows nothing about you, or about the course. Click <strong>⎘ Paste what Spool wrote</strong>.',
      pasted: '<b>See the source label?</b> A brand-new chat can already name the course and the exact point you saved. (The reply is written in advance; a real paste works the same way.)',
      mcp: '<b>Step 4 of 5 · MCP.</b> Pasting briefs an AI <em>once</em>. A connected AI can open the same project without another paste — and it should be honest about what your notes do not say. Click <strong>▸ Send</strong>.',
      review: '<b>Step 5 of 5 · Your yes.</b> It did not write into your project — it <em>asked</em>. Read what it wants to file, then <strong>keep it</strong> or <strong>throw it away</strong>. Either is a real answer.',
      done: '<b>✓ That’s it.</b> You kept it, so now it is in the project — signed <strong>Claude · MCP</strong>, sitting below the note you saved instead of over it.',
      dropped: '<b>✓ Thrown away.</b> Nothing was added, and your saved note is untouched. That is the whole point of the queue: an AI can ask, and the answer can be no.'
    },

    packText: [
      '# Project: Machine learning course', '',
      'Written by Spool. 1 note.', '', '---', '',
      '## How to read this', '',
      'Source labels stay attached so you and the AI',
      'can tell where every saved line came from.', '',
      '### 📚 Things I read', '',
      '- [11:40 · Lecture 7 slides · Safari] A model that does',
      '  well on the data it was trained on and badly',
      '  on new data has overfitted. A bigger model is',
      '  not the fix.'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">Got it — <strong>Machine learning course</strong>, lecture 7.</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 the slides</span>Your saved source says overfitting shows up when training performance stays strong but new-data performance falls. A bigger model is not the fix.</div>' +
      '<div class="ab-line muted-line">One saved note → a usable starting point. No background retyped.</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 workspaces · 5 projects</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("Machine learning course")&nbsp; <span class="ret">→ 1 note · Lecture 7</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("overfitting")&nbsp; <span class="ret">→ 1 hit</span>' },
      { kind: 'ai', html: 'Spool has one saved note for this course, so I cannot give you a full progress report. It does support one concrete checkpoint before Friday: <strong>explain why strong training performance can hide failure on new data, and why a bigger model is not the fix</strong>. I have not written that into the project — I have put it in front of you.' },
      { kind: 'chip', html: '⚙ <span class="tool">propose_blocks</span>(1 note, source: "Claude · MCP")&nbsp; <span class="ok">✓ 1 waiting for your review</span>' }
    ]
  };

  STR.zh = {
    ribbon: '交互演示 · 内容预先编写 · 不会调用 AI',
    replay: '重新开始',
    rail: ['1 · 保存', '2 · 打包', '3 · 粘贴', '4 · MCP', '5 · 由你确认'],
    sideAria: '工作区与项目',
    you: '你',
    threadName: '机器学习课',
    threadSub: '周五测验 · “学习”工作区内有 3 个项目',
    side: {
      ws1: '学习', t1: '机器学习课', cap: '● 当前保存位置',
      t2: '期末论文', t3: '读书会',
      ws2: '工作', t4: '重做数据看板',
      ws3: '生活', t5: '寻找住处'
    },
    feedEmpty: '保存的内容会显示在这里 ↓',
    packBtn: '⎘ 打包',
    pmTitle: '打包此项目',
    pmSub: '在本机生成 · 可粘贴给任何 AI',
    pmAssembling: '正在生成…',
    pmStat: function (n) { return '1 条笔记 · ' + n + ' 个字符'; },
    pmCopy: '复制',
    pmCopied: '✓ 已复制到剪贴板',
    pmCopyFailed: '无法复制，请手动选择文字',
    pmCont: '粘贴给 AI →',
    finale: '<strong>完整流程到此结束。</strong>侧栏里还有一门课、一篇论文、工作项目和生活事项。只要一件事无法一次完成，Spool 就能持续保存它的背景。<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">下载 macOS 版</a>',
    copyLabel: '⎘ 复制',
    copied: '✓ 已复制',
    keycap: '⌥ Option',
    keyHint1: '<strong>快速连按两下</strong>：点击屏幕上的按键，或在键盘上连按两下 ⌥',
    sendBtn: '▸ 发送',
    pasteBtn: '⎘ 粘贴 Spool 生成的 Pack',
    pasteSummary: '📋 已粘贴项目 Pack · 1 条笔记',
    nudgeMcp: '下一步：无需粘贴 →',
    keepBtn: '✓ 保留',
    dropBtn: '丢弃',
    reviewLabel: '1 条提议待审',

    blocks: {
      posting: { time: '11:40', src: '第 7 讲讲义 · Safari', text: '模型在训练数据上表现良好，却在新数据上表现变差，就是过拟合。扩大模型并不能解决这个问题。' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: '周五前先确认一件事：你能否解释为什么良好的训练表现可能掩盖模型在新数据上的失效，以及为什么扩大模型不能解决问题。这是当前这条笔记唯一能支持的明确复习目标。' }
    },

    tpl: {
      postingBar: '第 7 讲 · 过拟合 · Safari',
      postingH: '第 7 讲 · 误差曲线何时转而上升',
      postingBody: '……训练误差仍在下降，新数据上的误差却开始回升。<span class="quote-target">模型在训练数据上表现良好，却在新数据上表现变差，就是过拟合。扩大模型并不能解决这个问题。</span>下周我们会再次讨论这一点……',
      packA: '一条笔记就足以演示完整流程：保存内容及其来源，再把它交给一个全新的 AI 对话。',
      packB: 'Spool 在你的 Mac 上生成 Pack，不调用 AI；相同的项目内容会按同一规则生成。',
      rebriefBar: '一个全新的 AI 对话 · 尚不了解你的背景',
      mcpBar: 'Claude Desktop · 已连接 Spool ✓',
      mcpUser: '我这门机器学习课学到哪里了？周五前应该做什么？请查看我的 Spool，并提议把结论存回项目。'
    },

    guide: {
      start: '<b>第 1 步，共 5 步 · 保存。</b>你正在阅读第 7 讲，其中一句值得保留。点击高亮句下方的 <strong>⎘ 复制</strong>。',
      copied: '<b>已复制 ✓</b> 接下来触发 Spool：<strong>快速连按两下 ⌥</strong>。可以点击下方按键，也可以使用键盘上的 Option 键。',
      cap1: '<b>✓ 已保存 · 1/1。</b>来源“第 7 讲讲义 · Safari”也已自动保留。现在点击上方的 <strong>⎘ 打包</strong>。',
      packed: '<b>✓ Pack 已生成。</b>笔记和来源仍然在一起。先点击<strong>复制</strong>，再点击<strong>粘贴给 AI →</strong>。',
      rebrief: '<b>第 3 步，共 5 步 · 粘贴。</b>这是一个全新对话，不了解你或这门课。点击 <strong>⎘ 粘贴 Spool 生成的 Pack</strong>。',
      pasted: '<b>注意来源标注。</b>即使是全新对话，也能立刻识别课程和你保存的具体要点。（回复已预先编写；真实 Pack 的交接方式相同。）',
      mcp: '<b>第 4 步，共 5 步 · MCP。</b>粘贴只能为当前对话提供一次背景。连接后的 AI 可以直接打开同一项目，也必须如实说明笔记中没有的信息。点击 <strong>▸ 发送</strong>。',
      review: '<b>第 5 步，共 5 步 · 由你确认。</b>AI 没有直接写入项目，而是提交了一条提议。阅读内容，然后选择<strong>保留</strong>或<strong>丢弃</strong>。',
      done: '<b>✓ 已完成。</b>你选择了保留，因此这条内容已追加到项目中，署名为 <strong>Claude · MCP</strong>，并位于原笔记之后。',
      dropped: '<b>✓ 已丢弃。</b>项目没有新增内容，原笔记保持不变。待审队列让 AI 可以提交提议，也让你可以明确拒绝。'
    },

    packText: [
      '# 项目：机器学习课', '',
      '由 Spool 生成。共 1 条笔记。', '', '---', '',
      '## 如何阅读这份 Pack', '',
      '来源标注会始终保留，让你和 AI 都能看出',
      '每条内容来自哪里。', '',
      '### 📚 阅读材料', '',
      '- [11:40 · 第 7 讲讲义 · Safari] 模型在训练数据上表现良好，',
      '  却在新数据上表现变差，就是过拟合。扩大模型',
      '  并不能解决这个问题。'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">收到：<strong>机器学习课</strong>，第 7 讲。</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 讲义</span>你保存的来源说明：训练表现良好而新数据表现变差，意味着模型出现过拟合；扩大模型并不是解决办法。</div>' +
      '<div class="ab-line muted-line">一条笔记就提供了可继续讨论的起点，无需重新输入背景。</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 个工作区 · 5 个项目</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("机器学习课")&nbsp; <span class="ret">→ 1 条笔记 · 第 7 讲</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("过拟合")&nbsp; <span class="ret">→ 1 条结果</span>' },
      { kind: 'ai', html: 'Spool 中关于这门课的内容只有一条笔记，因此我无法判断完整学习进度。它只能支持一个明确的复习目标：<strong>解释为什么良好的训练表现可能掩盖模型在新数据上的失效，以及为什么扩大模型不是解决办法</strong>。我没有直接写入项目，而是提交了一条待审提议。' },
      { kind: 'chip', html: '⚙ <span class="tool">propose_blocks</span>(1 条笔记, source: "Claude · MCP")&nbsp; <span class="ok">✓ 1 条提议待审</span>' }
    ]
  };

  /* ================= runtime ================= */

  var L, state;
  var left, feed, chip, chipsrc, packbtn, modal, packpre, packstat, guide;

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
        '<div class="fw-body"><div class="fw-heading">' + t.postingH + '</div><p>' + t.postingBody + '</p>' +
        '<button class="copy-btn" data-action="copy">' + L.copyLabel + '</button></div></div>' +
        '<div class="keycap-row" hidden id="keyrow"><button class="keycap" data-action="tap">' + L.keycap + '</button>' +
        '<span class="keycap-hint">' + L.keyHint1 + '</span></div>';
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
      '<span class="rail-step" id="rs0"><span class="tick">✓ </span>' + L.rail[0] + ' <span id="capcount">0/1</span></span>' +
      '<span class="rail-step" id="rs1"><span class="tick">✓ </span>' + L.rail[1] + '</span>' +
      '<span class="rail-step" id="rs2"><span class="tick">✓ </span>' + L.rail[2] + '</span>' +
      '<span class="rail-step" id="rs3"><span class="tick">✓ </span>' + L.rail[3] + '</span>' +
      '<span class="rail-step" id="rs4"><span class="tick">✓ </span>' + L.rail[4] + '</span>' +
      '</div>' +
      '<div class="demo-guide" id="guide"></div>' +
      '<div class="demo-stage">' +
      '<div class="demo-left" id="left"></div>' +
      '<div class="demo-right">' +
      '<div class="overlay-chip" id="chip"><span>✓</span><span class="src" id="chipsrc"></span></div>' +
      '<div class="mini-spool-bar"><span class="title">Spool<span class="zh">思簿</span></span>' +
      '<button class="pack-btn" id="packbtn" data-action="open-pack" disabled>' + L.packBtn + '</button></div>' +
      '<div class="mini-body">' +
      '<div class="mini-side" aria-label="' + L.sideAria + '">' +
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
      '</div></div>' +
      '<div class="pack-modal" id="packmodal"><div class="pm-head"><div class="pm-heading">' + L.pmTitle + '</div>' +
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
    packbtn = $('packbtn');
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
    rail();
  }

  function rail() {
    var order = { capture1: 0, pack: 1, rebrief: 2, mcp: 3, review: 4, done: 5 };
    var cur = order[state.phase];
    for (var i = 0; i < 5; i++) {
      var el = $('rs' + i);
      el.classList.toggle('active', i === cur);
      el.classList.toggle('done', i < cur);
    }
    var cc = $('capcount');
    if (cc) cc.textContent = state.captured + '/1';
  }

  function overlay(src) {
    var runState = state;
    var targetChip = chip;
    chipsrc.textContent = src || L.you;
    targetChip.classList.add('show');
    setTimeout(function () {
      if (state === runState && chip === targetChip) targetChip.classList.remove('show');
    }, 1600);
  }

  function addBlock(b) {
    var empty = feed.querySelector('.feed-empty');
    if (empty) empty.remove();
    var card = document.createElement('article');
    card.className = 'block-card';
    var youLbl = L.you;
    var meta = '<div class="bmeta"><span>' + b.time + '</span>' +
      (b.src ? '<span class="src' + (b.mcp ? ' mcp' : '') + '">' + b.src + '</span>'
             : '<span class="src">' + youLbl + '</span>') + '</div>';
    card.innerHTML = meta + '<div>' + b.text + '</div>';
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }

  /* The gate, phase 5. A proposed note is NOT a block in the project: it is a
     card sitting in front of the feed with two ways out. Both are real — the
     discard branch is the whole reason this step exists. */
  function proposeBlock(b) {
    var card = document.createElement('article');
    card.className = 'review-card';
    card.id = 'reviewcard';
    card.innerHTML =
      '<div class="rc-head"><span class="rc-tag">' + L.reviewLabel + '</span>' +
      '<span class="rc-src">' + b.src + '</span></div>' +
      '<div class="rc-body">' + b.text + '</div>' +
      '<div class="rc-actions">' +
      '<button class="rc-btn ghost" data-action="drop">' + L.dropBtn + '</button>' +
      '<button class="rc-btn primary" data-action="keep">' + L.keepBtn + '</button>' +
      '</div>';
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
    return card;
  }

  function finish(html) {
    state.phase = 'done';
    rail();
    $('finale').classList.add('show');
    say(html);
  }

  /* ---------- the double-tap gesture ---------- */

  function armedForTap() {
    return state && state.phase === 'capture1' && state.copied;
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
    var b = L.blocks.posting;
    state.captured++;
    overlay(b.src);
    addBlock(b);
    packbtn.disabled = false;
    packbtn.classList.add('armed');
    setPhase('pack');
    say(L.guide.cap1);
    cue(packbtn);
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Alt' && armedForTap()) { e.preventDefault(); if (!e.repeat) tap(); }
  });

  /* ---------- typewriter & reveal ---------- */

  function typeInto(el, text, charsPerTick, done) {
    var runState = state;
    if (reduceMotion) { el.textContent = text; done && done(); return; }
    var i = 0;
    var t = setInterval(function () {
      if (state !== runState) { clearInterval(t); return; }
      i += charsPerTick;
      el.textContent = text.slice(0, i);
      el.scrollTop = el.scrollHeight;
      if (i >= text.length) { clearInterval(t); done && done(); }
    }, 33);
  }

  function revealChildren(el, delay, done) {
    var runState = state;
    var kids = Array.prototype.slice.call(el.children);
    var i = 0;
    (function next() {
      if (state !== runState) return;
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
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        btn.textContent = L.pmCopyFailed;
      } else {
        navigator.clipboard.writeText(L.packText).then(function () {
          btn.textContent = L.pmCopied;
        }).catch(function () {
          btn.textContent = L.pmCopyFailed;
        });
      }
    }

    if (a === 'to-rebrief') {
      modal.classList.remove('show');
      setPhase('rebrief');
      say(L.guide.rebrief);
      cueIn('#pastebtn');
    }

    if (a === 'paste' && !state.busy) {
      state.busy = true;
      var pasteState = state;
      btn.disabled = true;
      cue(null);
      var chat = left.querySelector('#chat');
      var u = document.createElement('div');
      u.className = 'bubble user pasted';
      u.textContent = L.pasteSummary;
      chat.appendChild(u);
      var ai = document.createElement('div');
      ai.className = 'bubble ai typing-dots';
      chat.appendChild(ai);
      setTimeout(function () {
        if (state !== pasteState) return;
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
      var mcpState = state;
      btn.disabled = true;
      btn.style.display = 'none';
      cue(null);
      var mchat = left.querySelector('#mcpchat');
      var i = 0;
      (function next() {
        if (state !== mcpState) return;
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
          state.busy = false;
          state.phase = 'review';
          rail();
          var card = proposeBlock(L.blocks.mcp);
          say(L.guide.review);
          cue(card.querySelector('.rc-btn.primary'));
        }
      })();
    }

    if (a === 'keep' && state.phase === 'review') {
      cue(null);
      var kept = $('reviewcard');
      if (kept) kept.remove();
      overlay(L.blocks.mcp.src);
      addBlock(L.blocks.mcp);
      finish(L.guide.done);
    }

    if (a === 'drop' && state.phase === 'review') {
      cue(null);
      var dropped = $('reviewcard');
      if (dropped) dropped.remove();
      finish(L.guide.dropped);
    }

    if (a === 'reset') build();
  });

  build();
})();
