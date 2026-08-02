# 设计稿:官网怎么讲才有人肯下载、肯学 — 待 Ocean 批复

> 2026-08-02。起因是你的原话:**「spool 是效率软件,可用可不用,有学习成本,
> 而用户看不到明显好处;只有长期使用者才发现便利,thread 越多优势越显著。
> 我不知道如何吸引用户下载、有动力学习。」**
>
> 这稿先回答一个更靠前的问题:**我们现在在卖的东西对不对**。文案草稿在 §4,
> 分档执行在 §5——你可以只批第一档。

---

## 0. 先说一句可能不中听的

**「只有长期使用者才发现便利」这个前提,如果拿它去做宣传,这个软件不可能有用户。**

道理很直白:**没有人会为了三个月后才兑现的好处,今天去学一个新软件。**
如果我们对外的说法是「用久了你就知道好」,那等于要求陌生人先付出学习成本、
再凭信任等回报——这个交易没人接。

但你这个前提**只对了一半**。Spool 真正的第一次回报**不在三个月后,在第一个下午**:

> 你今天存了三条东西。晚上你开一个新的 AI 对话,**点一下打包、粘一次**,
> AI 就知道你在干什么了——而不是你又把背景敲一遍。

三条笔记就能兑现,不需要一百条。**积累让它更好,但积累不是入场券。**

所以本稿的核心主张只有一句:

> ### 别卖「一个记东西的地方」,卖「你每天都要重新解释一遍项目」这件烦人事的解药。
> 积累出来的优势(thread 越多越强)是**留存的故事**,不是**拉新的故事**。
> 拉新只能靠一个当天就能兑现、且对方每天都在经历的痛点。

---

## 1. 为什么是「重新解释项目」这个痛点

选痛点有三个硬条件,这个点三条全中:

| 条件 | 「重新解释项目」符不符合 |
|---|---|
| **频率高**(最好每天发生) | ✅ 只要你天天用 AI,就天天在干这件事 |
| **对方已经感受到**(不用我们教育) | ✅ 每个人都烦过,不需要解释这是个问题 |
| **当天就能兑现**(不用等积累) | ✅ 第一次粘贴就省下了打字,还比手打的背景更全 |

对照一下**不该选的**说法(现在官网多少沾了点):

- ❌ 「帮你管理项目上下文」——抽象,对方不知道自己缺这个。
- ❌ 「所有笔记都带来源」——是优点,但**是长期才显灵的优点**,当天感受不到。
- ❌ 「用久了你会发现很方便」——要求信任,不给证据。

**还有一个更狠的好处**:这么定位以后,Spool **不再和 Notion / 印象笔记 / 苹果备忘录抢地盘**。
那个赛道用户已经有解了,搬家成本极高,我们赢不了。
而「让 AI 知道我在干嘛」这件事,**用户手上根本没有工具**,而且**不用搬家**——
你原来的笔记软件继续用,Spool 只接住那些本来会丢掉的碎片。

---

## 2. 现在官网的四个问题(逐条对照现有页面)

我把 `site/index.html` 当成第一次听说 Spool 的人读了一遍:

1. **通篇在讲「它怎么运作」,没讲「我今天能得到什么」。**
   「存下来、留着、粘出去」讲的是机制;三个承诺讲的是设计原则。
   **没有任何一处描述一个具体的、有代价的时刻。**
2. **看不出「这说的是我」。** 全篇都是「你的项目」,一个泛指。
   访客得自己动脑把它翻译成自己的生活,大部分人不会翻译,直接走了。
3. **学习成本这个反对意见,页面上一个字都没回应。**
   访客心里想的是「又要学一个软件、又要整理」,而我们其实**恰恰不用整理**——
   这是我们最强的一张牌,却没打出来。
4. **最强的资产被当成配角。** 那个能在网页里走完整个流程的 demo,
   是**不用下载就能证明有用**的东西——对一个没人听说过、还要授权辅助功能的软件来说,
   这是转化率最高的一块,现在却是个次要按钮(「在这里直接试 ↓」)。

另外 MCP 那段开口就是「Model Context Protocol」「十个工具」——数功能,不是讲好处。

---

## 3. 建议的页面顺序(新增块标了 🆕)

顺序本身就是一条说服链:**先让他认出痛 → 当场证明 → 认出自己 → 打消学习成本 → 再谈长期**。

| # | 块 | 干什么用 | 变化 |
|---|---|---|---|
| 1 | 开头 Hero | 点名那个每天发生的时刻 + 当天就兑现 | 改文案、换主按钮 |
| 2 | 🆕 **那两分钟** | 一个具体的、有代价的时刻(周一/周三) | 替换现在的「为什么会有它」 |
| 3 | 网页 demo | 不下载就证明它有用 | 位置不动,提级为主按钮目标 |
| 4 | 🆕 **这说的是不是你** | 四种具体的人,认领自己 | 新增 |
| 5 | 🆕 **你需要学的东西:没有** | 正面拆掉学习成本这个反对意见 | 新增 |
| 6 | 怎么用(存/留/粘) | 机制,压缩 | 保留,略缩 |
| 7 | 🆕 **它每周都在变强** | 你说的积累优势,**用证据讲而不是用形容词讲** | 新增 |
| 8 | MCP + 客户端阵容 | 好处优先重写,接上已批的阵容段 | 改文案 |
| 9 | 隐私 | 也是信任资产 | 不动 |
| 10 | 🆕 **这东西谁做的** | 陌生软件要授权,得有人负责 | 新增(小) |
| 11 | 结尾下载 | — | 不动 |

「应用本身(安静是刻意的)」那段建议**并进 6**,现在它夹在中间,拖慢节奏。

---

## 4. 文案草稿(英文是正文,中文是重写不是翻译)

### 4.1 Hero(改)

大标题 **不用改**——`Never explain your project twice.` 本来就在点上。
要改的是下面那段(现在讲的是机制)和按钮。

**EN**
> Copy anything worth keeping and tap ⌥ twice — it lands in the right project, with its
> source. Next time you open an AI chat, one click hands over the whole project instead of
> you typing the background again.
> **It works the same on your first afternoon as on your hundredth day.**

**ZH**
> 看到值得留下的东西就复制,然后连按两下 ⌥——它自己落进对应的项目,连来源一起记下。
> 下次你开 AI 对话,一次点击就把整个项目递过去,不用再把背景重新敲一遍。
> **第一个下午就能用上,不是攒够了才有用。**

最后那句黑体是**专门用来拆「要用很久才有用」这个念头的**,建议一字不省。

**按钮顺序建议对调**:现在是「下载」在前、「试一试」在后。建议改成
**「60 秒看它跑一遍 —— 什么都不用装」在前,下载在后**。
理由:我们是个没人听说过、装完还要给辅助功能授权的软件,**先给证据再要安装**转化更高;
而且导航栏右上角的下载按钮是常驻的,想装的人随时能装。
⚠️ 这条是判断,不是实验结论——原因见 §7 第 1 条。

### 4.2 🆕 那两分钟(替换「为什么会有它」)

**EN**
> **The two minutes you lose, over and over**
> Monday, you open a new chat and type it all out: what the project is, who it's for, what
> you already decided, what you tried and dropped. Wednesday, another chat — you type it
> again, shorter this time, leaving out the part that mattered. The answer you get back
> would have been better if it had known.
> With Spool, all of that was saved while you worked, one keystroke at a time. One click,
> one paste, and the AI starts from where you actually are.

**ZH**
> **每次都要重来的那两分钟**
> 周一,你开一个新对话,把背景从头敲一遍:这个项目是什么、给谁做、上周定了什么、
> 什么试过了不行。周三,换个对话,你又敲一遍——这次更短,还漏掉了最要紧的那条。
> AI 给的答案,本来可以更好。
> 用 Spool,这些背景在你干活的时候就一条一条存下来了。点一下、粘一次,
> AI 就从你真正所在的位置开始。

### 4.3 🆕 这说的是不是你

四种人,一人一行。**这块顺手把你定的「截图场景要多元」那条铁律用上了。**

**EN**
> **Job hunting** — the posting, what you decided about your résumé, the recruiter's email.
> One paste, and the AI writes a cover letter that knows your actual history.
> **Taking a course** — the line in the lecture you didn't get, the explanation that finally
> made it click. One paste, and the AI quizzes you on your own material.
> **Paperwork that drags on** — a visa, a move, an insurance claim: the rule you looked up,
> the number someone gave you on the phone, the deadline. One paste, and nothing slips.
> **Building something on the side** — the bug you already ruled out, the reason you picked
> this library. One paste, and a new chat doesn't walk you in circles.

**ZH**
> **找工作**——招聘信息、你对简历定下的调子、HR 的邮件。粘一次,
> AI 写出来的求职信是知道你真实经历的。
> **上课/学一门东西**——课上没听懂的那句、后来终于讲通的那个解释。粘一次,
> AI 就拿你自己的材料考你。
> **拖很久的手续**——签证、搬家、保险理赔:你查到的规定、电话里对方报的号码、截止日期。
> 粘一次,不会漏。
> **业余在做的东西**——已经排除掉的那个 bug、当初为什么选这个库。粘一次,
> 新开的对话不会带你绕圈子。

### 4.4 🆕 你需要学的东西:没有(拆学习成本)

**EN**
> **What you have to learn: nothing**
> **One key you already press.** You copy things all day. Add ⌥⌥ and it's kept — same hands,
> same second, no window to switch to.
> **Nothing to file.** No folders, no tags, no tidying up. Two levels, and they are already
> there.
> **Nothing to move.** Keep your notes app, your docs, your inbox. Spool sits beside them and
> catches the bits that would otherwise be gone.
> **Nothing to undo.** It all lives in one file on your Mac. Change your mind, delete it, and
> nothing else in your life changes.

**ZH**
> **需要学的东西:没有**
> **一个你本来就在按的键。** 你整天都在复制。多按两下 ⌥ 就存下了——同一双手、
> 同一秒钟,不用切窗口。
> **没有东西要整理。** 不建文件夹、不选标签、不用收拾。只有两层,而且已经给你摆好了。
> **没有东西要搬家。** 你原来的笔记软件、文档、邮箱,全都照旧。
> Spool 只待在旁边,接住那些本来会丢掉的碎片。
> **没有东西要后悔。** 全部就在你 Mac 上的一个文件里。哪天不想用了,删掉,
> 你生活里其他东西一点不变。

### 4.5 🆕 它每周都在变强(你说的积累优势,用证据讲)

**EN**
> **Week one saves you typing. Week six saves you the thing you forgot.**
> Day one it already works: three notes, one paste, and you skip retyping the background.
> Six weeks later the same project holds the decision you no longer remember making, the
> link you would never find again, and the reason you ruled something out — and all of it
> goes across in that same single click. Nothing about how you use it changed. The pile just
> got deeper.

**ZH**
> **第一周帮你少打字,第六周帮你想起你已经忘了的事。**
> 第一天就能用:三条笔记、粘一次,背景不用再敲。
> 六周之后,同一个项目里躺着你已经不记得自己做过的那个决定、那条再也搜不回来的链接、
> 当初否掉某个方案的理由——而它们照样是那**一次点击**就全递过去。
> 你的用法一点没变,只是底下攒厚了。

配图建议:**同一个项目的两张截图并排**(第 1 周 3 条 vs 第 6 周 20 条),
底下标出打包字数的变化。⚠️ 需要新截图,成本见 §5(第二档)。

### 4.6 MCP 段(好处优先重写)

现在开口是「Model Context Protocol」「十个工具」——数功能。建议改成:

**EN**
> Pasting works everywhere. The AI apps you already use can do one better: with your
> permission they open Spool themselves — read weeks of context, search every project, and
> file what they find back in the right place. **You stop copying, and start asking.**

**ZH**
> 粘贴哪儿都能用。而你已经在用的那些 AI 应用还能更进一步:**在你允许之后**,
> 它们自己打开 Spool——读几周的上下文、搜遍每一个项目、把找到的结论放回该在的位置。
> **你不用再复制,直接问就行。**

「两个由你亲手打开的开关、没有任何服务器」这句**保留**(它是信任资产),
「十个工具」**删掉**(数功能没意义)。已批的客户端阵容段接在这段下面。

### 4.7 🆕 这东西谁做的(信任)

一个陌生软件要辅助功能授权、还要读剪贴板,访客心里一定有这个问号,现在页面上没人回答。

**EN**
> Spool is made by one person, in the open. The whole build is written up — including the
> day I wiped my own database, and what I changed so it cannot happen again. No company
> behind it, no account to create, nothing to cancel.
> [Read how it was built →]

**ZH**
> Spool 是一个人做的,过程全部公开——**包括我把自己数据库清空的那一天,
> 以及后来我改了什么让它不可能再发生**。背后没有公司,不用注册账号,也没有什么要取消。
> [看它是怎么做出来的 →]

(叙事页 `story.html` 里本来就有那次事故的复盘,这里只是把它拿到首页当信任凭证用。
你之前定过:过程证据是资产不是家丑。)

---

## 5. 分三档,你可以只批第一档

| 档 | 内容 | 要不要新素材 | 我的建议 |
|---|---|---|---|
| **第一档:改嘴** | Hero 文案 + 按钮对调、🆕那两分钟、🆕没有东西要学、MCP 段重写 + 已批的阵容段 | **不用**,纯文字与少量 CSS | ✅ **先只做这档**。转化主要就在这儿赢,而且不欠任何素材 |
| **第二档:给证据** | 🆕这说的是不是你、🆕它每周都在变强(含新截图) | 要重拍截图(`scripts/seed-demo-library.sh` 建演示库,真库绝不入镜) | 建议紧接着做,但可以分开一次 |
| **第三档:找人来看** | 🆕谁做的、以及**去哪儿让人看见**(§6) | 对外动作,需你单独明示 | 你定 |

**第一档的改动面**:`site/index.html`、`site/assets/i18n.js`、`site/assets/site.css`,
外加已批的阵容块。**没有 JS 逻辑改动、没有新依赖、没有新图片、不外链**。

---

## 6. 得说清楚的一件事:官网不是瓶颈,没人来才是

再好的文案,救不了一个没人访问的页面。所以「怎么吸引下载」这个问题,一半答案在页面外。
以下都是**对外动作,按硬规则 7 需要你明示**,我不会自己动:

1. **MCP 官方注册表 / 客户端目录挂号**(<https://registry.modelcontextprotocol.io>)。
   **投入产出比最高的一件事**:那里的人本来就在找 MCP server,不用教育。
   我们本来就是个合规的 MCP server,挂号是它设计出来就是干这个用的。
2. **demo 链接本身就是可以转发的东西**。什么都不用装就能走完一遍——
   这种链接才有人愿意发给朋友。可以给它一个单独的短地址。
3. **Show HN / Product Hunt 这类只有一次机会**,要等页面改完、且 dmg 已公证之后再说。
4. ❌ **不做**:找人刷好评、假装用户去论坛安利。骗来的第一批用户会立刻走,
   而且和这个项目一贯的做法不符。

⚠️ 还有一个**比官网更靠前的杠杆**:**装完之后的头 60 秒**。
页面把人骗进来了,如果打开 app 十分钟还没体会到那个「哦!」的瞬间,前面全白做。
现在新库会播种教程脉络,但**首启体验从没被系统地审过**。建议排在这稿之后单独做一次,
本稿不展开。

---

## 7. 两个前提,得让你知道

1. **我们没有任何访问统计**(官网零埋点,连访问量都不知道,`privacy.html` 也是这么对外说的)。
   意味着 **A/B 测试、转化率对比统统做不了**——上面每一个选择都是判断,不是数据结论。
   代价是:我们只能选那些**道理上明显更对**的改法(点名一个具体痛点、拆掉一个具体顾虑),
   不能靠试错。好处是隐私叙事一个字都不用改。
2. **不能说的话**:任何暗示第三方背书的说法(「官方支持 / 合作」)、任何编造的用户数量、
   评价、媒体报道。一条都不许有——见 `DESIGN_MCP_ECOSYSTEM.md` §2 查证结果。

---

## 8. 验收标准

1. 官网本地起服务,**中英各读一遍** → 验:没有漏 key(留在英文即为漏),
   两套文案都读得顺、没有术语(硬规则 4)。
2. 窄屏 390px → 验:新增块正常竖排,**页面不出现横向滚动**。
3. 断网打开 → 验:全部新增块照常显示(零外链)。
4. **找一个不知道 Spool 是什么的人读一遍 Hero + 那两分钟**,问他两个问题:
   「这软件解决什么问题?」「你要不要学点什么才能用?」
   → 通过标准:两个问题他都能用自己的话答对。**这是这稿唯一真正的验收**。
5. 提交后自检 `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 为空。
6. ⚠️ 推 main 会自动部署官网(硬规则 7),推送要你单独明示。
