# 反馈问卷设计 —— 问卷星（国内版 + 海外版）

> **这一份是给你照着往问卷星编辑器里敲的。** 两份问卷，题目一一对应，
> 但**不是互相翻译** —— 有三处故意不一样，都在 §4 列了原因。
>
> 建成之后把两个链接发我，我一次接进官网（中文站用国内版，英文站用海外版，
> 接线和测试已经做完了，见 `archive/WORKPLAN-2026-08-20.md` §9 第 4 步）。

---

## 0. 先说这份问卷是按什么原则设计的

**这三条决定了为什么它只有 8 题，而不是 25 题。**

| 原则 | 后果 |
|---|---|
| ⚠️ **真实外部用户 = 0** | 问卷的第一任务**不是**「你想要什么功能」，而是**「你走到哪一步就不走了」**。功能偏好要有人用了才有意义；漏斗现在就有意义 |
| **产品零遥测** | 每一个数字都只能靠人手填。所以**只问人答得出来的事**——「你用了几次」没人记得，「你现在处在哪一步」人人答得出 |
| **每道题都要能改变一个决定** | 答了也不会改变你做什么的题，一律砍掉。砍掉的清单在 §5，附理由 |

**⛔ 一条硬约束**：问卷星是第三方，填的内容进的是他们的服务器。
所以问卷里**绝不能诱导用户粘贴自己的笔记或 Pack**——
GitHub 的 issue 模板里已经明写了这条（「Please do not paste your notes or a Pack」），
问卷星只会更严格。**Q5 的提示语专门写了这一句，别删。**

---

## 1. 国内版（中文）—— 照抄进问卷星

### 问卷标题

```
Spool 思簿 · 用后反馈
```

### 问卷说明（编辑器里叫「问卷说明」，显示在第一题上面）

```
谢谢你愿意花两分钟。

Spool 不联网、不收集任何使用数据，所以除非你告诉我，
否则我完全不知道有人用过它、在哪一步卡住了。这份问卷是唯一的渠道。

⚠️ 这个表单托管在问卷星，你填的内容会保存在问卷星的服务器上，不经过 spoolapp.org。
不想经过第三方的话，直接发邮件给 jinhz0531@gmail.com 也一样。

⛔ 请不要把你的笔记原文或 Pack 内容粘进来——那些是你的东西，
而这里是第三方平台。描述发生了什么就够了。
```

---

### Q1 ⭐ 你现在用到哪一步了？

**题型**：单选 · **必填** · **这是全卷最重要的一题，放第一个**

```
○ 我还没下载
○ 下载了，但没装上（或者装不上）
○ 装上了，但没打开过
○ 打开过，但一条内容都没存进去
○ 存过东西，但没打包给 AI 用过
○ 打包用过一两次，之后就没再用
○ 现在还在用，隔三差五会打开
```

> **为什么是全卷第一题**：真实外部用户 = 0，所以现在唯一值钱的信息是**漏斗在哪一节断掉**。
> 这七个选项就是从「听说」到「留下」的七道闸，答案落在哪一格，下一步该修什么就是哪一格。
> ⚠️ 选项**故意写成一条时间线而不是分类**，人不用理解产品结构也能对号入座。

---

### Q2 在那一步，是什么让你停下来的？

**题型**：多选 + 「其他」填空 · 选填
**⚠️ 逻辑**：Q1 选了**最后一项（还在用）之外的任何一项**才显示

```
□ 系统提示它有风险 / 不安全，我没敢继续
□ 它要的权限太多，我不放心
□ 装好了，但不知道下一步该干什么
□ 看懂了怎么用，但没觉得比我现在的做法强
□ 我想用的功能它没有
□ 我用的那个 AI 好像连不上它
□ 它出问题了 / 有 bug
□ 没什么特别的，就是忘了
□ 其他：________
```

> **为什么这几个选项**：前两条是**已知的真实障碍**（Windows 包没签名、
> macOS 首次运行的信任提示、输入监听授权），第三条是首日价值那一摊，
> 第四、五条是价值主张，第六条是 MCP 接入。**每一条都对应一件已经在计划上的事**——
> 所以答案能直接改排序，而不是变成一句感想。
> ⚠️ 最后那条「就是忘了」必须留着：它是最可能的真实答案，
> 没有这一格的话，人会随便挑一个上面的，把数据搞脏。

---

### Q3 你是怎么知道 Spool 的？

**题型**：单选 + 「其他」填空 · 选填

```
○ GitHub
○ 小红书
○ V2EX
○ 少数派 / 其他科技媒体
○ 微信公众号 / 微信群
○ 即刻 / 微博
○ 朋友或同事推荐
○ 搜索引擎搜到的
○ 其他：________
```

> **为什么问**：渠道那一批（`WORKPLAN` §9 第 6–7 步）还没开，Show HN 是**一次性机会**。
> 第一个真人是从哪儿来的，决定那一发打在哪。

---

### Q4 你平时主要在哪个 AI 里干活？

**题型**：多选 · 选填

```
□ ChatGPT（网页）
□ ChatGPT（桌面版）
□ Claude（网页）
□ Claude 桌面版
□ Claude Code / Codex 这类命令行工具
□ Cursor / Windsurf 这类编辑器
□ 豆包 / Kimi / 通义 / 文心 等国内的
□ DeepSeek
□ 其他：________
```

> **为什么问**：MCP 是 Spool 唯一「进得来」的通道，而**每个客户端接进来的方式都不一样**，
> 有些根本连不上（网页版 ChatGPT 够不着本地 MCP，这条已经查实）。
> 答案决定接入文档先写哪一个、以及「连不上」的说明该对谁讲。

---

### Q5 ⭐ 你想让它记住的，主要是什么事？

**题型**：多行填空 · 选填 · **这是全卷唯一真正开放的一题**

**题目下面的提示语（必须原样写上）**：

```
说说场景就行——什么项目、什么时候会想起它。
⛔ 不要把笔记原文或 Pack 内容贴进来，这里是第三方平台。
```

> **为什么只留这一题开放**：定位那一节（§4）反复说过，
> **最容易写成漂亮空话的就是「你想要什么功能」**。
> 问场景不问功能，答案才有信息量——「我在写毕业论文，每次换个 AI 都要重讲一遍我的题目」
> 比「希望增加标签功能」有用一百倍。
> ⚠️ 提示语里那句 ⛔ 是**硬要求**，见 §0。

---

### Q6 有没有哪一下让你觉得「这就对了」，或者哪一下最烦？

**题型**：多行填空 · 选填

```
一句话就行，好的坏的都要。
```

> **为什么问**：这是唯一能问出**情绪拐点**的题。
> 产品里已经有两个上线后回滚的先例（进度条、`next_step`），
> 两次都是靠「用起来别扭」这种说不清的感觉先冒头的，数据是后补的。

---

### Q7 版本和系统

**题型**：两个单行填空 · 选填

```
Spool 版本（设置里最下面那个数字，比如 0.6.1）：________
你的系统（比如 macOS 15 / Windows 11）：________
```

> **为什么选填而不是必填**：必填会挡掉「我根本没装上」的那批人，
> 而那批人**恰恰是现在最该听见的**。

---

### Q8 要是我有事想再问你两句，方便留个联系方式吗？

**题型**：单行填空 · 选填

```
邮箱（不填也完全没关系，上面的答案已经很有用了）：________
```

> ⚠️ **措辞是有意的**：不写「留下邮箱获取更新」——那是在收订阅，
> 而订阅这件事**只放官网**（这是定过的）。这里只是留一条回问的路。

---

## 2. 海外版（English）—— 照抄进问卷星海外版

### Title

```
Spool · How did it go?
```

### Intro (the "survey description" field, shown above question 1)

```
Thank you for two minutes of your time.

Spool never goes online and collects nothing, so unless you tell me,
I have no idea anyone used it or where it stopped being worth the trouble.
This form is the only channel there is.

⚠️ This form is hosted by a third-party survey service. What you write is stored
on their servers, not on spoolapp.org. If you would rather not go through a third
party, email jinhz0531@gmail.com instead — it reaches the same person.

⛔ Please do not paste your notes or a Pack in here. Those are yours, and this is
somebody else's platform. Describing what happened is plenty.
```

---

### Q1 ⭐ Where did you get to?

**Single choice · required · first question on purpose**

```
○ Haven't downloaded it yet
○ Downloaded it, but it wouldn't install
○ Installed it, never opened it
○ Opened it, never saved anything into it
○ Saved things, but never packed them for an AI
○ Packed once or twice, then stopped
○ Still using it, I open it every few days
```

---

### Q2 What made you stop there?

**Multiple choice + "Other" text · optional**
**⚠️ Logic**: show unless Q1 = the last option

```
□ My system warned me it was unsafe and I didn't want to risk it
□ It asked for permissions I wasn't comfortable granting
□ It installed fine, but I didn't know what to do next
□ I understood it, but it didn't beat what I already do
□ It doesn't do the thing I needed
□ My AI tool couldn't seem to connect to it
□ Something was broken
□ Nothing in particular — I just forgot about it
□ Other: ________
```

---

### Q3 How did you come across Spool?

**Single choice + "Other" text · optional**

```
○ Hacker News
○ GitHub
○ Reddit
○ X / Twitter
○ A newsletter or blog
○ YouTube
○ Someone recommended it
○ A search engine
○ Other: ________
```

---

### Q4 Which AI do you actually work in?

**Multiple choice · optional**

```
□ ChatGPT (web)
□ ChatGPT (desktop app)
□ Claude (web)
□ Claude Desktop
□ Claude Code / Codex / another CLI agent
□ Cursor / Windsurf / another AI editor
□ Gemini
□ A local model (Ollama, LM Studio, …)
□ Other: ________
```

---

### Q5 ⭐ What did you want it to remember for you?

**Paragraph text · optional**

**Hint under the question (keep this verbatim)**:

```
The situation is what helps — which project, and when you reach for it.
⛔ Please don't paste your notes or a Pack; this is a third-party platform.
```

---

### Q6 Was there a moment where it clicked — or one that annoyed you?

**Paragraph text · optional**

```
One line is fine. Both kinds are useful.
```

---

### Q7 Version and system

**Two short text fields · optional**

```
Spool version (the number at the bottom of Settings, e.g. 0.6.1): ________
Your system (e.g. macOS 15 / Windows 11): ________
```

---

### Q8 May I follow up?

**Short text · optional**

```
Email (skipping this is completely fine — the answers above already help):
________
```

---

## 3. 建问卷时的设置（两份都一样）

| 设置项 | 选什么 | 为什么 |
|---|---|---|
| **是否需要登录 / 关注公众号** | ⛔ **关掉** | 任何一道门都会把「本来就懒得反馈」的人全挡在外面，而那正是要听的人 |
| **每个 IP / 微信限填一次** | ⛔ **关掉** | 同一个人隔一个月再填一次是**好事**（他从 Q1 的第三格挪到了第六格，那是最值钱的信号）|
| **必填项** | **只有 Q1** | 其余全选填。⚠️ 见 Q7 的注：必填会挡掉最该听见的那批人 |
| **收集 IP / 地区** | 能关就关 | 产品的全部说服力是「不收集」，问卷多收一样就多一句要解释的话 |
| **进度条** | 打开 | 8 题看得见头，完成率会好看得多 |
| **答完后的提示语** | 见下 | |

**答完后显示这一句（中文版）**：

```
收到了，谢谢。

我会一条一条看。要是留了邮箱，有需要我会直接回你。
```

**English**:

```
Got it — thank you.

I read every one of these. If you left an email and I have a question, I'll write.
```

---

## 4. ⚠️ 两份问卷故意不一样的三处（不要「统一」掉）

| 哪一题 | 差别 | 为什么 |
|---|---|---|
| **Q3 渠道** | 选项**完全不同**，不是翻译 | 国内没人从 Hacker News 来，海外没人从小红书来。把两边的选项合成一张表，两边都会有一半选项是废的，「其他」就会变成最大的一格——**那等于没问** |
| **Q4 AI 客户端** | 国内版有豆包 / Kimi / 通义 / DeepSeek，海外版有 Gemini / 本地模型 | 同上。⭐ **DeepSeek 只放国内版**，海外版把它并进「其他」 |
| **说明里的第三方那句** | 国内版点名「问卷星」，海外版只说「第三方问卷服务」 | 海外版用的是另一个站点，⚠️ **你把海外版链接发我的时候，顺便告诉我它叫什么、域名是什么**，我把说明里那句话改准 |

---

## 5. ⛔ 想过但故意没放进去的题（附理由，防止以后又加回来）

| 没问的 | 为什么不问 |
|---|---|
| **「你愿意为它付多少钱」** | 收费已经定了「不急，功能齐全再说」。现在问，会得到一个**基于想象的数字**，而它一旦被写进文档就会被当成依据。⛔ 等有人真的在用了再问 |
| **「你更常粘贴 Pack，还是让 AI 直接写入」** | 这题本身是好题，但**现在问会重演 95/5 那件事**——样本只有个位数时，任何比例都是噪声，而比例一旦被算出来就会被引用。⭐ 等 Q1 最后一格（还在用）攒到**两位数**再单开一份问卷问它 |
| **「你有多少个项目 / 存了多少条」** | 人记不住，只会瞎填。而且这个数**产品自己在界面上就有**，等有真实用户了直接问那一个人比问一百个人准 |
| **满意度打分（1–10 / NPS）** | 一个分数改变不了任何决定。同样的位置放 Q6 那道开放题，拿到的是**可执行的一句话** |
| **「希望增加什么功能」** | §4 说过：最容易写成漂亮空话的就是这一句。Q5 问场景是它的替代品，且信息量高一个量级 |
| **人口统计（年龄 / 职业 / 行业）** | 分析不了——样本量到不了能分组的规模，白收一堆个人信息，还要在说明里多解释一句 |

---

## 6. ✅ 已经接进官网了（2026-08-22）

| | 链接 | 接在哪 |
|---|---|---|
| **中文站** | `https://v.wjx.cn/vm/hy3KvuB.aspx` | `scripts/site-zh-strings.mjs` 的 `ZH_FORM_URL` |
| **英文站** | `https://surveymars.com/q/eXk1aRDgW`（**SurveyMars**，问卷星的海外版） | 直接写在 `site/index.html` 里 |

两边都改了三处文案 + 各自的 privacy 页，`node scripts/build-site-zh.mjs` 已重跑。
⛔ **「什么都不收集」那句和表单绑死了**：`build-site-zh.test.mjs` 里那条
「never offers a hosted form beside a claim that nothing is collected」
两种语言都查，故意改坏能让它红（已实测）。

⭐ **做的是链接不是内嵌 iframe** —— 内嵌等于每个路过官网的人都替他连了一次问卷服务商，
而那一页全部的说服力就是「它不连任何人」。链接把那一刻推到「点之前先告诉你这是第三方」。

---

## 7. ✅ 英文表单的界面语言 —— 已修，已复核（2026-08-22）

> **Ocean 当天就切成 English 了，我复核过：中文串从 14 个降到 3 个，
> 而剩下那 3 个（`开始作答` / `录音中` / `返回`）全都躺在 `display:none` 的元素里，
> 访客看不见。⭐ 提交按钮现在是 `Submit`。这一件完了。**
>
> 下面是原始记录，留着说明当时为什么必须改。

### 当时的问题

**SurveyMars 那份问卷，界面文字是中文的。** 实际抓下来页面上有这些：

```
提交 · 开始作答 · 结束作答 · 多选题 · 追问 · 返回 · 发送
手机扫描二维码答题 · 免费创建您自己的调查问卷 · 举报 · 隐私 · 提供技术支持
```

⚠️ **提交按钮上写的是「提交」。** 一个从 Hacker News 点进来的人，
面对的是一个**要他填写、但按钮看不懂**的表单——
而他点进来的那一页，全部的说服力就是「这个东西不糊弄你」。

⛔ **发英文渠道之前必须改掉这个。** 在 SurveyMars 后台找问卷的
「语言 / Language」设置，切成 English 再存一次。
✅ 改完链接不用动，官网那边一个字都不用改。

（顺带两条查过没问题的：① 链接本身是活的 —— curl 直接打是 403，
那是它挡机器人，换成正常浏览器 UA 就是 200；
② 说明里那个邮箱被 Cloudflare 混淆成了 `[email protected]`，
但解出来是对的（`jinhz0531@gmail.com`），真人浏览器上会正常显示。）
