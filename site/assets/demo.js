/* Spool interactive demo — a scripted walk through the whole loop.
   Everything is client-side and written in advance: no network, no AI is called.
   Bilingual: string tables below; rebuilt on the site language toggle.
   Guidance: one instruction line updated after EVERY completed action, plus a
   pulsing ring on the next thing to click.
   Phases: capture1 → capture2 → capture3 → pack → rebrief → mcp → review → done

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
    threadName: 'Machine learning course',
    threadSub: 'quiz on Friday · 2 projects in Study',
    side: {
      ws1: 'Study', t1: 'Machine learning course', cap: '● saving here',
      t2: 'Term paper', t3: 'Reading group',
      ws2: 'Work', t4: 'Analytics rebuild',
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
    finale: '<strong>That’s the whole loop.</strong> And look at the sidebar — a course, a term paper, a rebuild at work, a flat. Spool is for any project that runs longer than one sitting.<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">Download for macOS</a>',
    copyLabel: '⎘ Copy',
    copied: '✓ Copied',
    keycap: '⌥ option',
    keyHint1: 'press it <strong>twice, quickly</strong> — on screen, or your real ⌥ key',
    keyHint2: '<strong>twice</strong> again',
    sendBtn: '▸ Send',
    pasteBtn: '⎘ Paste what Spool wrote',
    nudgeMcp: 'Next: no pasting at all →',
    keepBtn: '✓ Keep it',
    dropBtn: 'Throw it away',
    reviewLabel: '1 waiting for you',

    blocks: {
      posting: { time: '11:40', src: 'Lecture 7 slides · Safari', text: 'A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.' },
      chat: { time: '14:05', src: 'AI chat · Safari', text: 'Regularisation is a fee charged for complexity: the model can still bend to the data, but every extra bend costs it something, so it keeps only the ones that pay for themselves.' },
      note: { time: '16:30', src: null, text: 'Revision plan: redo problem set 3 with the fee idea in hand, then watch lecture 8.' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: 'Before Friday: problem set 3 question 2 is the overfitting one — that is the question the quiz will rhyme with. Do it with the fee idea, not with a bigger model.' }
    },

    tpl: {
      postingBar: 'Lecture 7 — Overfitting · Safari',
      postingH: 'Lecture 7 · Where the error curve turns back up',
      postingBody: '…the training error keeps falling while the error on new data turns back up. <span class="quote-target">A model that does well on the data it was trained on and badly on new data has overfitted. A bigger model is not the fix.</span> We come back to this next week…',
      chatBar: 'AI chat · Safari',
      chatQ: 'I lost the thread at the end of lecture 7. What is regularisation actually doing?',
      chatA: 'Think of it as a price list. <span class="quote-target">Regularisation is a fee charged for complexity: the model can still bend to the data, but every extra bend costs it something, so it keeps only the ones that pay for themselves.</span>',
      c3a: 'The first two notes came from <em>somewhere else</em> — the slides, an AI. The third kind is the one Spool values most: <strong>what you decided yourself</strong>.',
      c3b: 'Notes with no source count for the most when Spool writes the project out. Your words are decisions; everything else is just material.',
      packA: 'Three notes, three different places, one project — the scattered bits are now in one list.',
      packB: 'Spool writes it out on your Mac. No AI involved, and the same project always comes out the same way.',
      rebriefBar: 'A new AI chat — knows nothing about you',
      mcpBar: 'Claude Desktop — connected to Spool ✓',
      mcpUser: 'Where am I in the ML course, and what should I do before Friday? Check my Spool, then file the answer back into it.'
    },

    guide: {
      start: '<b>Step 1 of 5 · Save.</b> You are reading the slides for lecture 7 and one line matters. Click <strong>⎘ Copy</strong> on the highlighted sentence.',
      copied: '<b>Copied ✓</b> Now the Spool part: press <strong>⌥ twice, quickly</strong>. Use the key below, or the real Option key on your keyboard.',
      cap1: '<b>✓ Saved — 1 of 3.</b> The source came along by itself (“Lecture 7 slides · Safari”). Next: an AI just explained it in a way that stuck — click <strong>⎘ Copy</strong> on it.',
      cap2: '<b>✓ Saved — 2 of 3.</b> The last one is <strong>your own decision</strong>. We have written it out for you on the right — just press <strong>Save</strong> (or edit it first).',
      cap3: '<b>✓ 3 of 3.</b> A line from the slides, an AI explanation and your own plan now sit in one project. Now the useful part: click <strong>⎘ Pack</strong> at the top.',
      packed: '<b>✓ Done.</b> Notice the order — your own note comes first, above both sources. Try <strong>Copy</strong> (it really does copy), then <strong>Paste it into an AI →</strong>',
      rebrief: '<b>Step 3 of 5 · Paste.</b> This chat is brand new and knows nothing about you, or about the course. Click <strong>⎘ Paste what Spool wrote</strong>.',
      pasted: '<b>See the little labels?</b> Every line of the answer comes from one of your notes. Scattered bits, put together. (The reply is written in advance; a real paste works the same way.)',
      mcp: '<b>Step 4 of 5 · MCP.</b> Pasting briefs an AI <em>once</em>. Connect it to Spool instead and it can open <strong>everything you have saved</strong>, any time you ask. Click <strong>▸ Send</strong>.',
      review: '<b>Step 5 of 5 · Your yes.</b> It did not write into your project — it <em>asked</em>. Read what it wants to file, then <strong>keep it</strong> or <strong>throw it away</strong>. Either is a real answer.',
      done: '<b>✓ That’s it.</b> You kept it, so now it is in the project — signed <strong>Claude · MCP</strong>, sitting below your own note instead of over it.',
      dropped: '<b>✓ Thrown away.</b> Nothing was added, and your three notes are untouched. That is the whole point of the queue: an AI can ask, and the answer can be no.'
    },

    packText: [
      '# Project: Machine learning course', '',
      'Written by Spool. 3 notes.', '', '---', '',
      '## How to read this', '',
      'Notes are grouped by who wrote them. The',
      'ones with no source are the author’s own —',
      'treat those as decisions, not suggestions.', '',
      '### ✍️ My own notes (count for the most)', '',
      '- [16:30] Revision plan: redo problem set 3',
      '  with the fee idea in hand, then watch',
      '  lecture 8.', '',
      '### 📚 Things I read', '',
      '- [11:40 · Lecture 7 slides] A model that does',
      '  well on the data it was trained on and badly',
      '  on new data has overfitted. A bigger model is',
      '  not the fix.', '',
      '### 🤖 Written by an AI (check before trusting)', '',
      '- [14:05 · AI chat] Regularisation is a fee',
      '  charged for complexity: every extra bend',
      '  costs the model something, so it keeps only',
      '  the ones that pay for themselves.'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">Got it — <strong>the ML course</strong>, lecture 7 and the quiz on Friday. Three notes, three sources. Here is where you are:</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ your note</span>Your plan stands: problem set 3 first, lecture 8 after it.</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 ai chat</span>Use the fee idea as the test — ask what each extra bend is buying.</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 the slides</span>And remember the trap: a bigger model is not the fix.</div>' +
      '<div class="ab-line muted-line">Three scattered notes → one answer. Nothing explained twice.</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 workspaces · 5 projects</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("Machine learning course")&nbsp; <span class="ret">→ 9 notes over 4 weeks</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("overfitting")&nbsp; <span class="ret">→ 3 hits · oldest 3 weeks back</span>' },
      { kind: 'ai', html: 'Four weeks back you saved the same trap from lecture 3 and it caught you on problem set 2. So the useful next step is narrower than your plan: <strong>question 2 of problem set 3</strong>. I have not written that into the course project — I have put it in front of you.' },
      { kind: 'chip', html: '⚙ <span class="tool">propose_blocks</span>(1 note, source: "Claude · MCP")&nbsp; <span class="ok">✓ 1 waiting for your review</span>' }
    ]
  };

  STR.zh = {
    ribbon: '演练 · 内容事先写好 · 未调用任何 AI',
    replay: '重来一次',
    rail: ['1 · 存', '2 · 打包', '3 · 粘贴', '4 · MCP', '5 · 你点头'],
    threadName: '机器学习课',
    threadSub: '周五小测 · 「学习」下有 3 个项目',
    side: {
      ws1: '学习', t1: '机器学习课', cap: '● 正存到这里',
      t2: '期末论文', t3: '读书会',
      ws2: '工作', t4: '数据看板重做',
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
    finale: '<strong>整个流程就是这样。</strong>再看看侧栏——一门课、一篇论文、工作上的重做、租房。只要是一次坐不完的事，Spool 都管用。<br><a class="btn btn-primary" href="https://github.com/KIM-ocean-HZ/spool/releases/latest">下载 macOS 版</a>',
    copyLabel: '⎘ 复制',
    copied: '✓ 已复制',
    keycap: '⌥ option',
    keyHint1: '<strong>快速按两下</strong>——点屏幕上这个键，或按你键盘上真的 ⌥ 键',
    keyHint2: '再<strong>按两下</strong>',
    sendBtn: '▸ 发送',
    pasteBtn: '⎘ 粘贴 Spool 生成的文字',
    nudgeMcp: '下一步：一个字都不用粘 →',
    keepBtn: '✓ 收下',
    dropBtn: '扔掉',
    reviewLabel: '1 条等你过目',

    blocks: {
      posting: { time: '11:40', src: '第 7 讲讲义 · Safari', text: '在训练数据上表现好、换成新数据就变差，这叫过拟合。把模型做得更大解决不了它。' },
      chat: { time: '14:05', src: 'AI 对话 · Safari', text: '正则化就是给「复杂」收费：模型照样可以去迁就数据，但每多拐一个弯都要付出代价，所以它只留下那些划算的弯。' },
      note: { time: '16:30', src: null, text: '复习计划：先拿「收费」这个说法把第 3 次作业重做一遍，再看第 8 讲。' },
      mcp: { time: '16:42', src: 'Claude · MCP', mcp: true, text: '周五之前先做这个：第 3 次作业的第 2 题就是过拟合那道，小测大概率跟它同一个套路。用「收费」的思路去做，别去把模型做大。' }
    },

    tpl: {
      postingBar: '第 7 讲 —— 过拟合 · Safari',
      postingH: '第 7 讲 · 误差曲线为什么会拐回去',
      postingBody: '……训练误差还在往下走，换成新数据的误差却拐头往上。<span class="quote-target">在训练数据上表现好、换成新数据就变差，这叫过拟合。把模型做得更大解决不了它。</span>下周我们再回到这里……',
      chatBar: 'AI 对话 · Safari',
      chatQ: '第 7 讲最后那段我没跟上。正则化到底在干什么？',
      chatA: '你可以把它当成一张价目表。<span class="quote-target">正则化就是给「复杂」收费：模型照样可以去迁就数据，但每多拐一个弯都要付出代价，所以它只留下那些划算的弯。</span>',
      c3a: '前两条都来自<em>别处</em>——一份讲义、一个 AI。第三种才是 Spool 最看重的：<strong>你自己做的决定</strong>。',
      c3b: '没有来源的笔记，在 Spool 生成文字时分量最重。你的话是决定，其余的都只是材料。',
      packA: '三条笔记，三个不同的地方，同一个项目——散落的东西现在在同一份清单里。',
      packB: '这段文字在你的 Mac 上生成，没有 AI 参与，同一个项目每次生成的结果都一样。',
      rebriefBar: '一个新的 AI 对话 —— 对你一无所知',
      mcpBar: 'Claude Desktop —— 已连接 Spool ✓',
      mcpUser: '这门课我学到哪了？周五之前该做什么？查一下我的 Spool，然后把结论存回去。'
    },

    guide: {
      start: '<b>第 1 步（共 5 步）· 存。</b>你在看第 7 讲的讲义，其中一句很关键。点高亮那句下面的 <strong>⎘ 复制</strong>。',
      copied: '<b>已复制 ✓</b> 接下来是 Spool 的部分：<strong>快速按两下 ⌥</strong>。点下面那个键，或按你键盘上真的 Option 键。',
      cap1: '<b>✓ 已存下——第 1/3 条。</b>来源自己跟着进来了（「第 7 讲讲义 · Safari」）。下一条：AI 刚用一个你一下就懂的说法解释了它——点它下面的 <strong>⎘ 复制</strong>。',
      cap2: '<b>✓ 已存下——第 2/3 条。</b>最后一条是<strong>你自己的决定</strong>。右边输入框里已经替你写好了，直接按<strong>存下</strong>（想改也可以先改）。',
      cap3: '<b>✓ 3/3。</b>讲义里的一句、AI 的一个解释、你自己的安排，现在都在同一个项目里。轮到最有用的一步了：点上方的 <strong>⎘ 打包</strong>。',
      packed: '<b>✓ 好了。</b>注意顺序——你自己那条排在最前，压过两个来源。试试<strong>复制</strong>（是真的会复制），然后点<strong>粘给一个 AI →</strong>',
      rebrief: '<b>第 3 步（共 5 步）· 粘贴。</b>这个对话刚打开，对你、对这门课都一无所知。点 <strong>⎘ 粘贴 Spool 生成的文字</strong>。',
      pasted: '<b>看到那些小标签了吗？</b>回答里每一条都出自你的某条笔记——散落的东西被拼起来了。（回答是事先写好的；真实粘贴的效果一样。）',
      mcp: '<b>第 4 步（共 5 步）· MCP。</b>粘贴只能让 AI 明白<em>一次</em>。把它接到 Spool 上，它就能随时打开<strong>你存下的全部内容</strong>。点 <strong>▸ 发送</strong>。',
      review: '<b>第 5 步（共 5 步）· 你点头。</b>它没有直接写进你的项目，它是来<em>问</em>的。看一眼它想存什么，然后<strong>收下</strong>或者<strong>扔掉</strong>。两个都是正经答案。',
      done: '<b>✓ 就是这样。</b>你收下了，它现在进了项目——署名 <strong>Claude · MCP</strong>，加在你那条笔记下面，而不是盖在上面。',
      dropped: '<b>✓ 扔掉了。</b>项目里一个字都没多，你那三条一动没动。这就是那个队列的意义：AI 可以问，而答案可以是「不」。'
    },

    packText: [
      '# 项目：机器学习课', '',
      '由 Spool 生成。共 3 条笔记。', '', '---', '',
      '## 这份文字怎么读', '',
      '笔记按「谁写的」分组。没有来源的那些是',
      '作者本人写的——请当作决定，而不是建议。', '',
      '### ✍️ 我自己的笔记（分量最重）', '',
      '- [16:30] 复习计划：先拿「收费」这个说法把',
      '  第 3 次作业重做一遍，再看第 8 讲。', '',
      '### 📚 我读到的东西', '',
      '- [11:40 · 第 7 讲讲义] 在训练数据上表现好、',
      '  换成新数据就变差，这叫过拟合。把模型做得',
      '  更大解决不了它。', '',
      '### 🤖 AI 写的（采信前请核对）', '',
      '- [14:05 · AI 对话] 正则化就是给「复杂」收费：',
      '  每多拐一个弯都要付代价，所以模型只留下那些',
      '  划算的弯。'
    ].join('\n'),

    aiReply:
      '<div class="ab-line">收到——<strong>机器学习课</strong>，第 7 讲，周五小测。三条笔记来自三个地方，你现在的位置是：</div>' +
      '<div class="ab-item"><span class="ab-tag you">✍️ 你的笔记</span>你的安排照旧：先做第 3 次作业，再看第 8 讲。</div>' +
      '<div class="ab-item"><span class="ab-tag ai">🤖 AI 对话</span>拿「收费」当检验标准：每多拐一个弯，问它换来了什么。</div>' +
      '<div class="ab-item"><span class="ab-tag ref">📚 讲义</span>还有那个坑别忘了：把模型做大解决不了过拟合。</div>' +
      '<div class="ab-line muted-line">三条散落的笔记 → 一个答案。一个字都没有重新解释。</div>',

    mcpScript: [
      { kind: 'chip', html: '⚙ <span class="tool">list_threads</span>()&nbsp; <span class="ret">→ 3 个工作区 · 5 个项目</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">get_digest</span>("机器学习课")&nbsp; <span class="ret">→ 4 周里存的 9 条笔记</span>' },
      { kind: 'chip', html: '⚙ <span class="tool">search_blocks</span>("过拟合")&nbsp; <span class="ret">→ 3 处命中 · 最早在 3 周前</span>' },
      { kind: 'ai', html: '四周前你在第 3 讲存过同一个坑，第 2 次作业上它绊过你一次。所以真正该做的比你的计划更窄：<strong>第 3 次作业的第 2 题</strong>。这条我没有直接写进课程项目，我把它摆到你面前了。' },
      { kind: 'chip', html: '⚙ <span class="tool">propose_blocks</span>(1 条, source: "Claude · MCP")&nbsp; <span class="ok">✓ 1 条等你过目</span>' }
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
    var order = { capture1: 0, capture2: 0, capture3: 0, pack: 1, rebrief: 2, mcp: 3, review: 4, done: 5 };
    var cur = order[state.phase];
    for (var i = 0; i < 5; i++) {
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

  build();
})();
