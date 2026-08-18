# 官网逐屏修改清单（2026-08-12）

> **怎么来的**：拿 `SITE_POSITIONING.md`（独立构思稿）逐屏对 `site/index.html`（644 行、
> **14 段**）、`site/zh/index.html`（生成的）、`site/assets/site.css`、`main.js`、`demo.js`、
> `scripts/site-zh-strings.mjs`、`story.html`、`privacy.html`。
> 落地工单以 `DESIGN_SITE_REBUILD.md` 为准，本文件是**改哪几处**，不是重做方案。
>
> **一行代码没动。** 本文件只是清单。
>
> ⚠️⚠️ **现场状态（当场量的，不是照抄交接）**：
> `git ls-remote origin main` = `6bdc877` = 本地 HEAD。**全部已推 = spoolapp.org 正在服务这一版。**
> 所以下面 P0 那几条**不是「上线前要改」，是「已经对外了」**。

---

## 0. 总判断

**方向对，结构重，证据缺。** `SITE_POSITIONING.md` 里那 6 件「最值得讲的」，官网**5 件都讲了**
—— 这一版的问题不在想错了，在三处：

| 病 | 症状 |
|---|---|
| **A. 12 个空图框正在对外** | 全站最强的三个论据（捕捉那三秒 / 真 pack / AI 署名）**一张实物都没有**，取而代之的是给摄影师看的施工说明 |
| **B. 最强的那一件被讲成了一句话** | 「交出去的是一份你读得懂的简报」只有 `03 · HAND IT OVER` 一段 + 一个空框，**而且要展示的是打包窗口的 UI，不是那份文本本身** |
| **C. MCP 那一摊占了 3/14 段，而且是最长的三段** | `#mcp` + `#gate` + `#watch` 连着走 —— 读完的人会把 Spool 记成一个 MCP 基础设施工具 |

✅ **先说不用动的：事实红线 9 条，官网已经过了 8 条。** 当场核过：
`@spool` 零命中、「开源 / open source」零命中、ChatGPT 已经写成
「in the ChatGPT app that means a Codex conversation」、下载按钮和三处 fineprint 都写了
Apple 芯片、`t4-p` 明写「the source is not open at this point」、页面零外部脚本。
**这几处别在精修中倒退回去。**

---

## 1. 逐屏

图例：**保留** / **改** / **合并** / **降级** / **P0 立刻** / **P1 提转化** / **P2 打磨**

### 屏 1 — Hero `#hero` ｜ 改（P1）

| | |
|---|---|
| 现状 | `h1` +「tagline」+「sub」三段。sub 一段里塞了 5 件事：复制 / 双击 ⌥ / 来源到标签页 / 几周后一键成文 / 接上 AI 自己读 / 写回来要点头 |
| 判断 | ⭐ **`h1`「同一个项目，不必解释第二遍。」原样留** —— 它说的是痛不是品类，比我在定位稿里拟的任何一句都好。**别换。** |
| 问题 | tagline 和 sub 在**重复同一件事**（都在说「不用再敲一遍背景」），而**定位稿里最锋利的那句差异化一个字都没有** |

**改法**：三段压成两段，把腾出来的那一句给差异点。

- 删 `hero-tag` 整段（它说的话 `hero-sub` 第一句已经说了）。
- `hero-sub` 砍到两句，**第二句换成新的**：

  > 看到值得留下的东西，复制，连按两下 `⌥` —— 它落进你正在做的那个项目，**连同你当时那句判断**。
  > 几周以后一次打包，交给任何一个 AI；**它读到的每一个字，你都看得见。**

  > Copy anything worth keeping and tap `⌥` twice — it lands in the project you're on,
  > **along with the thought that made you save it**. Weeks later, hand the whole thing to any
  > AI in one paste. **You can read every word it was told.**

- ⚠️ **「AI 自己读 / 写回来要点头」从 hero 拿掉**，挪到屏 8。理由见定位稿 §6：
  **首屏讲 MCP，转化来的是折腾型用户**。
- ✅ trust chips（免费 / Apple 芯片 / 签名公证 / 断网可用）**四个全留**，这一行现在是对的。

---

### 屏 2 — 那两分钟 `#problem` ｜ 保留 + 合并（P1）

`moment-p` 那段（周一/周三）**一个字别动** —— 08-02 批过，现在仍然是全站最好的痛点段。

⭐ **把屏 4「这是给谁用的」的三张卡搬进这一段末尾**，理由见下。

---

### 屏 3 — 交互 demo `#demo` ｜ 改（P1）

| 量到的 | |
|---|---|
| 五步（`1 · Save / 2 · Pack / 3 · Paste / 4 · MCP / 5 · Your yes`） | `demo.js:31` |
| 第一步要**捕三条**才能往下走 | `capcount 0/3` |
| 标题承诺 **90 秒** | `demo-k` |

**问题**：对一个刚落地的陌生人，「90 秒 + 五步 + 先干三次活」是**很高的门槛**，而这是全站
最早出现的互动。它现在挡在最强证据（真 pack）前面。

**两个改法，我推 A**：

- **A（小改，只动文案 + 一处常量）**：标题从「90 秒」改成「**试一试 —— 一分钟**」；
  第一步 **3 条改成 1 条**就能往下走（另外两条仍可捕，只是不再是闸）。
  五步保留 —— 第 5 步「你点头」是这一版的主张，Ocean 08-11 专门拍过板（§3 第 3 题），**别撤**。
- **B（大改）**：进页面先自动跑一遍 15 秒预览，愿意的人再亲手点。⚠️ 要动 `demo.js` 的驱动，
  而且 `wk-snapshot` 那个量具**不跑 CSS 动画**（§4-bis 那两条），验收成本明显更高。

---

### 屏 4 — 这是给谁用的 `#who-for` ｜ 合并进屏 2（P1）

三张卡（做产品 / 一门课或论文 / 一天三个 AI 对话）**内容都对，别改文案**。
问题是它**单独占一屏在重复屏 2 的工作** —— 两段都在做「认痛」。

**改法**：整段并进 `#problem`，`who-k` / `who-h` / `who-p` 三个标题层删掉，只留三张卡。
**省一整屏，一个论点不丢。**

---

### 屏 5 — 存 / 攒 / 递 `#how` ｜ ⭐ 这一屏是全站最该动的（P0 + P1）

现状：三个 `loop-row`，各配一个空图框（S1 / S2 / S3）。

**`01 · SAVE` — 文案保留，图 P0。**
`l1-p` 已经写对了 note-first（「the cursor already in a note box … Your own words outlast the
excerpt」）—— 这正是定位稿 §4 ④ 那件被低估的事，**文案层面它已经到位了**。
⚠️ 但它配的是 **S1 空框**，框里写着「Must be the note-first overlay: cursor already sitting in
the note box.」—— **给摄影师的话正在对外显示**。这是 P0-1。

**`03 · HAND IT OVER` — ⭐⭐ 这里要加一整块新东西，是本清单最值钱的一条。**

现在这一段只有文字，图位 S3 要拍的是**打包窗口的 UI**。
⚠️ **拍窗口是拍错了对象。** 定位稿 §4 ③ 的论点是：Spool 最稀缺的资产是**那份文本本身**
—— 可读、可核对、能带走、不依赖 Spool 存在。**一张对话框截图证明不了这件事。**

**改法：在页面上直接放一段真的 pack 正文（HTML，不是截图）。**

```
┌─ 一个纸感面板 ─────────────────────────────┐
│ # Project Context: 机器学习课               │
│ …                                          │
│ ## How to Read This Context                │
│ 📖 Reference  官方材料 = 事实底线            │
│ 🧩 Synthesis  别的 AI 写的 = 框架，不是事实   │
│ 🔄 Process    对话记录 = 只读你卡在哪         │
│ 💭 Personal   你自己写的 = 权重最高，错了也直说 │
│ …                                          │
│ [2026-03-08 14:22] · from Lecture 7 slides │
│     note: 这里我一直没懂                     │
└────────────────────────────────────────────┘
```

⭐ **这一条同时解决四个问题**：

1. **不用等拍照** —— pack 是纯文本，`scripts/seed-demo-library.sh` 建库、打一次包就有了。
   **今天就能上，不占 A1/A2 的工期。**
2. **它是全站唯一一张竞品抄不走的图**（黑盒 vs 明文）。
3. **窄屏天然没问题**（文本能重排，截图不能），390px 那条验收白拿。
4. **可以真的能复制** —— 让访客把它粘进自己的 AI 试一次，转化路径直接短一截。

配一句小标题：
> **交出去的就是这个。你读得懂，AI 也读得懂。**
> **This is what gets handed over. You can read it. So can the AI.**

⚠️ **必须是真打出来的 pack**，不许手写一段像 pack 的东西（memory `mockups-vs-installing`
同源：假的和真的对不上）。取材照 §2.4 的演示库铁律，**真库绝不入镜**。

**S3 空框改成什么**：pack 正文上去之后，打包窗口那张图**降级为可选**。先删框。

---

### 屏 6 — 中段下载 `.cta-inline` ｜ 保留

`mid-cta-fine` 已经写了 Apple 芯片。不动。

---

### 屏 7 — 越攒越值 `#compounding` ｜ 降级（P1）

论点对（线轴 = 产品名变成界面上会动的东西），但代价最高：**S4 / S5 是全站最难拍的一对**
（同一个项目、同一个窗口尺寸、同一条侧边栏，隔六周的两个状态，还得让线轴看得出差别）。

**改法**：整段压成**一段文字 + 一句线轴的话**（`grow-p` + `grow-p2` 已经写好了，直接留），
**`growth-pair` 那两个空框先删掉**。等 S4/S5 真拍出来再补回来 —— 那一对图值得等，
但**不值得让页面空着等**。

---

### 屏 8 / 9 / 10 — MCP `#mcp` + 闸门 `#gate` + 盯着 `#watch` ｜ ⭐ 合并（P1，全站第二重要）

**这是结构层面最大的一处。** 三段连着走，且都长；`#gate` 有 3 个步骤 + 3 条列表 + 1 个空框，
`#watch` 有 4 条列表 + 2 个空框。**光这三段就有 6 个空图框。**

⚠️ **定位稿 §6 的判断**：这不只是「太长」。**首页重讲 MCP，转化来的是手上已经有四个同类
工具的折腾型用户** —— 他装完就走。长度只是症状。

**但不能整段删** —— `#gate` 讲的「署名 / 只能追加 / 改不动你写的字」正是定位稿 §4 ⑤，
是抄不走的差异点。Ocean 08-11 也拍过板说这段最值钱（`DESIGN_SITE_REBUILD` §2.2）。

⭐ **所以是拆开重新安置，不是删**：

| 现在在哪 | 搬到哪 | 为什么 |
|---|---|---|
| `gate-1p`「只能加，签着名，改不动你的」 | ⬆️ **搬进屏 5 的 pack 那一块**，压成**一句话** | 它是在解释**那份文本里为什么有 `ai note:` 这个标记** —— 和实物放在一起才有力，单独一屏是在讲规格 |
| `#mcp` 的两条路对照（Route A / Route B） | **留**，但整段缩到**一屏之内** | 「不接 MCP 也是完整产品」是真正的卖点，**这一段的存在本身就在降低安装门槛** |
| `#gate` 剩下的（待审队列三步、文件开关、作废归你） | **折叠**（`<details>`）放在 `#mcp` 尾部 | 想看的人点开，不想看的人不被拦 |
| `#watch`（跟进 + 周回顾） | **降级成 `#mcp` 里的一小段**，或整段挪去 `story.html` | 它是**最不容易在 30 秒内讲清**的功能，而且它是唯一会联网的动作 —— 讲不清反而伤信任段 |

⚠️ **`#watch` 里有一句不能丢**，无论搬到哪：
> **这是唯一一个会出网的动作，而且只按你自己写的那几行去查。**

它和 `t3-p`（信任卡③）是**同一个事实的两处表述**，`privacy.html` 也写着 ——
`DESIGN_SITE_REBUILD` §4 第 4 条验收就是钉这个的。**搬家的时候三处要一起看。**

**客户端那张卡（`cg1-p` / `cg2-p` / `cg-note`）**：
- ✅ 六个 chip 和 `src/lib/mcp/clients.ts` 的 `MCP_CLIENTS` **逐个对得上**（当场核过），别改。
- ✅ ChatGPT 那句已经改对了。**别倒退。**
- ⚠️ **一处要软化**：`cg-note` 现在写「点一下，把那个软件重启，往后它就能读你的项目了」——
  这是**结果承诺**，而它**只在 Claude 系和 Codex 上被量过**。Cursor / VS Code / Windsurf
  **一次都没量过**（交接 §0-newest.3：心跳只记装机之后新建立的连接；claude 系那几个映射
  「仍然是猜的」）。
  **改成**：「…点一下就把配置写好了；重启那个软件之后它就能读你的项目。」
  —— 把「写配置」这件**我们真的做了**的事说满，把「它一定读得到」这件**没量过**的事留白。

---

### 屏 11 — 下载前该知道的 `#trust` ｜ 改（P1）

四张卡内容都对，**但顺序反了**。

⚠️ `t4-p` 里那句 **「包括我把自己数据库清空的那一天，还有后来改了什么，让这件事再也发生不了」**
—— 定位稿 §4 ⑥ 的判断是：**对这批受众，这是全站转化力最强的一句话**，
而它现在在第 4 张卡的第 2 句。

**改法**：
- 四张卡**换序**：`t3`（什么都不追踪，只有两条出网通路）→ `t2`（一个文件）→ `t1`（签名公证）→ `t4`（一个人做的）。
  理由：陌生人最先怕的是「它会不会偷我的东西」，不是「它签没签名」。
- **`t4` 那句 DB 事故单独拎出来做小标题**，并把 `story.html` 的链接文案换掉：
  现在叫「Read how it was built →」/「故事」，太平。改成
  **「它是怎么做出来的，以及什么坏过 →」** / **「How it was built — and what broke →」**。
- ➕ **补一句自动更新**。现在它只在 FAQ `q6` 里（定位稿 §9 第 6 条要求页面上明说一次）。
  加进 `t1-p` 末尾即可：「新版本要手动下载 —— 这也意味着它从不联网查更新。」
- ✅ 权限那段（`perm-p1/2/3`）三个权限都讲了，包括浏览器自动化那个。**别动。**

---

### 屏 12 — FAQ `#faq` ｜ 保留（P2）

11 条，覆盖 Intel / Windows / AI 能不能改我东西 / 要不要 key / 不接 AI 行不行 / 为什么免费 /
你不做了怎么办 / 手动更新 / 剪贴板 / 要不要整理。**内容全对，一条都不用删。**

⚠️ 唯一一处：`q11`（不接 AI 也能用）**是全站消除安装顾虑最强的一条，却排在第 5**。
往上提到第 2 条。

---

### 屏 13 — logo 视频 `.brand-moment` ｜ 保留

---

### 屏 14 — 结尾下载 `.cta-band` ｜ 保留

---

## 2. P0 — 已经对外了，最先处理

### P0-1 ⚠️⚠️ 12 个空图框正在 spoolapp.org 上显示施工说明

当场数的：**S1 S2 S3 S4 S5 S6a S6b S6c S7 S8 S9 S10**，`grep -c "shot-slot" = 12`。
框里印着的是**给拍摄者的话**，例如：

- 「Demo library only. Never the real one.」
- 「Save two or three things just before shooting, or the "today" line will not be there.」
- 「Get a file-access request card into the shot — it is the most telling card this build has.」

⚠️ **这些不是占位符，是内部工单。** 对访客来说，页面在展示一个**没做完的产品**，
而且泄露了「这些图是摆拍的」这层意思 —— 对一个靠「诚实」立信的产品，代价特别高。

Ocean 08-11 拍过「留空框」（§3 第 1 题），**但那是在「不上线」的前提下拍的**
—— §3 第 1 题原话就是「所以这一版**不能上线**」。**前提变了，这个决定要重问一次。**

**我的建议（最小工作量，今天能收）**：

| 图位 | 处理 |
|---|---|
| **S1 / S2 / S7** | ⭐ **只拍这三张**。它们撑起「捕捉那三秒」「一个项目长什么样」「AI 署名」——定位稿 §5 的三条证据里的两条 |
| **S3** | **删框**。用屏 5 那段真 pack 正文顶上，比截图强 |
| **S4 / S5 / S6a-c / S8 / S9 / S10** | **先删框**，对应段落按屏 7 / 屏 8-10 的建议压缩成纯文字 |

**四张图（S1 S2 S7 + 新的 OG 卡 S11）就能把首页填满**，而不是 12 张。
剩下 8 张不是不拍，是**不挡上线**。

### P0-2 中文页的语言切换在手机上消失

`site.css:275`：

```css
@media (max-width: 640px) { .nav-links a:not(.nav-cta) { display: none; } }
```

≤640px 时导航只剩 Download —— **`.lang-toggle` 一起被藏了**。
一个在手机上打开英文页的中文访客，**没有任何办法切到中文页**。

**改法**（二选一，我推前者）：
```css
@media (max-width: 640px) {
  .nav-links a:not(.nav-cta):not(.lang-toggle) { display: none; }
}
```
或者把语言切换挪进页脚再加一个入口。⚠️ 顺带核一下 `.lang-toggle` 的点击区
—— 移动端要 ≥44px。

---

## 3. P2 — 可访问性（打磨，不挡上线）

### 3.1 小字对比度不够

`--muted: #8c8576` on `--paper: #faf7f0` = **3.40:1**，
on `--paper-2: #f3eee2` = **3.31:1**。WCAG AA 普通文本要 **4.5:1**。
⚠️ `.fineprint` 是 **0.85rem**，`.card p` 是 0.96rem —— 都是小字，命中最狠。

**建议值 `--muted: #6e6759`** → 对 `--paper` **5.24:1**、对 `--paper-2` **4.84:1**，两边都过，
而且色相不变（还是那个暖灰），视觉几乎看不出差别。
（`#736c5e` 也过，但对 `--paper-2` 只有 4.50，正好卡线，没有余量。）

### 3.2 截图 tab 声明了 `role="tab"` 却没有键盘操作

`index.html:328` 有 `role="tablist"` / `role="tab"` / `aria-selected`，
但 `main.js:180` **只监听 `click`** —— 没有 ←/→、没有 Home/End、没有 roving tabindex。
**声明了 ARIA 模式却不实现，比不声明更糟**（读屏用户按方向键，什么都不会发生）。

**两条路，我推后者**（改动小）：
1. 补齐 `keydown`（←/→/Home/End）+ roving tabindex；
2. ⭐ **把 `role="tab"` / `role="tablist"` / `aria-selected` 全去掉**，改成普通 `<button>` +
   `aria-pressed` —— 现有的 click 和左右箭头按钮就已经够用，**不再承诺自己没实现的东西**。

### 3.3 边距线轴：`aria-hidden` 的元素里挂着点击

`main.js:70` 给容器设了 `aria-hidden="true"`，`main.js:86` 又给里面的 `.mt-spool` 绑了
`click`（点一下往下滚一屏）。**一个对读屏和键盘都不存在、却能点的控件。**
注释自己写着「Otherwise decorative」——**那就别让它可点**。

**改法**：删掉那个 click（它是个没人会发现的彩蛋，滚轮本来就能滚），
或者做成真的 `<button>` + `aria-label` 并去掉那一层 `aria-hidden`。

### 3.4 `story.html` 只有英文

没有 `.lang-toggle`，也没有 `zh/story.html`。中文访客从中文页点「故事」会掉进英文页。
⚠️ 定位稿 §4 ⑥ 认为 case study 是这批受众的转化器 —— **对中文访客它现在是不生效的**。
先在中文页那个链接上标一句「（英文）」，是零成本的诚实处理；翻译单独排。

---

## 4. ⚠️ 一处要更正我自己的定位稿

`SITE_POSITIONING.md` §10 提议量「用户点下载时人在第几屏」（滚动分桶）。
**读完 `site/` 之后这条要撤回**：

- 页面**零外部脚本**（当场 grep 过，`site/*.html` 一个外链脚本都没有），
  而 `DESIGN_SITE_REBUILD.md` §4 第 3 条把**「断网打开，全部块照常显示（零外链）」写成了验收标准**。
- GitHub Pages 是纯静态，**没有服务端可以自己记**。任何分屏归因都要引一个第三方分析域名 ——
  **那会当场打破上面那条验收，也打破首页「不做任何追踪」这句话**。

⭐ **修正后的建议**：**别加分析。**能量的只有两个数，而且都在站外、都不碰访客：

1. `gh api repos/KIM-ocean-HZ/spool/releases --jq '.[].assets[].download_count'`
2. GitHub 仓库自带的 traffic（referrer / views），仓库主可见，**不需要在页面上放任何东西**

定性信号从 GitHub Issue 和邮件来（memory `email-collection-website-only`：只在官网收）。
**「哪一屏说服了他」这个问题，这一版就是答不了 —— 承认它，比为它破一条红线划算。**

---

## 5. 改完之后的结构（14 段 → 10 段）

> ✅ **已经落地。** 实际数 `<section>`：**14 → 11**。
> 和下面这张表差的一段不是漏做 —— 是这张表把「下载前该知道的 / FAQ / 结尾下载」并成了一行，
> 页面上它们本来就是三个 section（`#trust` / `#faq` / `.cta-band`）。**要合的都合了。**

```
1  Hero               改（砍一段，补「每个字你都看得见」）
2  那两分钟 + 给谁用   合并（原 2 + 4）
3  试一试 demo         改（一分钟 / 第一步 1 条）
4  存                  文案不动，等 S1
5  攒                  文案不动，等 S2
6  ⭐ 递 + 真 pack 正文  新增正文块（不用等拍照）
7  中段下载            不动
8  越攒越值            压成文字，删两个空框
9  两条路 + AI 的规矩   合并（原 8+9+10），折叠细节
10 下载前该知道的 + FAQ + 结尾下载   卡片换序，story 链接改名
```

**空图框 12 → 2**（S1 / S2 保留待拍，S7 并进屏 9 的折叠区）。

---

## 5-bis. ✅ 落地记录（2026-08-12，**已提交？否 —— 未提交、未推送**）

Ocean 挑的两件先做：**P0-2** + **屏 5 的真 pack 正文块**。

| 件 | 改了什么 | 在哪 |
|---|---|---|
| **P0-2** | `.nav-links a:not(.nav-cta)` 加 `:not(.lang-toggle)`；窄屏给它 `min-height:44px` | `site/assets/site.css` |
| **pack 正文块** | 删掉 S3 空框，第三个 `loop-row` 改成 `.solo`（单栏居中），底下加 `.pack-intro` + `.pack-real` 全宽块 | `site/index.html` |
| 样式 | `.loop-row.solo` / `.pack-intro` / `.pack-real` / `.pack-doc` / 六个 `pk-*` | `site/assets/site.css` |
| 中文 | 删 `slot-s3`，加 `pack-h` / `pack-p` / `pack-cap`；`site/zh/index.html` 已重新生成 | `scripts/site-zh-strings.mjs` |
| ⭐ 演示库 | 机器学习课项目从 2 块扩到 5 块（四档权威齐了 + 一条用户批注 + 一条 `Claude · MCP` 带 `↩ cites:`）；**全库补 `seq`** | `scripts/seed-demo-library.sh` |

### 为什么动了演示库（不在原清单里，说明理由）

pack 正文必须是**真渲染出来的**，而当时的演示库渲染不出要讲的那件事：

- 机器学习课项目只有 2 块，**没有批注、没有 AI 写的块** → 讲不了差异点 ④⑤；
- ⚠️ **全库一条 `Claude · MCP` 的块都没有** → **`SHOT S7` 按 §2.4 的构图要求根本拍不出来**；
- ⚠️ **全库 `seq` 全是 NULL** → 块上**没有圆圈编号**，而 `SHOT S2` 的构图前提第一条就是
  「每条前面是圆圈编号」。`schema.sql` 写着 NULL 只出现在 v9 backfill 之前的行 ——
  **播种绕过了 app 的 `MAX(seq)+1`，把库放进了真实使用产生不了的状态。**

⭐ **所以这两条不是为官网加的糖,是 A1/A2 拍照之前本来就得补的账。**

### 正文是怎么产出来的（要复算就照这个走）

```
bash scripts/seed-demo-library.sh                     # 只写 com.oceanjin.spool.verify
SPOOL_DATA_DIR=…/com.oceanjin.spool.verify \
  /Applications/Spool.app/Contents/MacOS/spool --mcp  # get_pack(机器学习课)
```

**是发行的那个二进制渲染的，不是手打的。** 渲染器一改就要重跑、重贴。
⚠️ **`[… 还有约 4,000 字 …]` 这个数是量出来的**：整包 6,448 字，表头到 `## Full Record`
5,246 字，页面上印了 1,054 字 → **省略 4,192**。第一版写的「3,000」是拍脑袋的，已改。

### 验收（六条全过）

`vitest 355` / `cargo 72` / `tsc` 干净 / `i18n (none missing)` /
**390px 中英两页 `scrollWidth == 390`、`overflowing: []`**（WKWebView 实测，不是 Chrome）/
**页面零外链**（只剩 GitHub 和 spoolapp.org 那几个原有的）。
语言切换在 390px 下英文页 58×44、中文页 49×45，桌面端不变。

⚠️ **真库全程没碰**：所有写入都在 `…spool.verify`。期间真库的 sha256 变了 ——
**是 Ocean 自己在用**（14:29–14:30 新增了几块申请材料，7→14 个项目、87→111 块，
`integrity_check ok`、`user_version` 仍是 21）。⭐ 又一次应了「真库是活的，要准数就现场量」。

### 5-ter. S1 / S2 的拍摄套件（已备好，等 Ocean 上手）

**为什么不能自动拍**：memory `isolated-verify-workflow` §24b / §28 / §28b —— 合成点击驱动不了
webview，`screencapture` 会抓到别的 Space，System Events 时通时不通。
⚠️⚠️ **最凶的是 §28b ③**：按 pid 过滤会**被静默忽略并返回正式版进程**，
而它 dump 出来的是**真库里的真项目**，长得和一次成功的验证一模一样 ——
**对官网截图来说，那等于把 Ocean 的真实申请材料发到公网上。** 所以这一步一律人工。

**已备好的**：

| 件 | 在哪 / 怎么保证安全 |
|---|---|
| 隔离演示 app | `~/Desktop/Spool-Demo/Spool.app`，identifier `com.oceanjin.spool.verify`，`Spool Dev` 签名，`codesign --verify --deep --strict` 过 |
| 实测隔离 | 起来之后 `lsof` 只有 `com.oceanjin.spool.verify/spool.db`，**对真库零句柄**；CPU 20 秒 0.05 秒（不是白屏） |
| 演示库 | 3 工作区 / 8 项目 / 23 块；**今天 3 条捕捉**（价值面板的「今天」那行才会出现）；全库有 `seq`（圆圈编号） |
| 捕捉能用 | `is_capture_target` 落在**机器学习课**（原来一条都没有 → 捕捉会直接失败，S1 根本拍不了） |
| 免授权触发 | `captureShortcut: meta+shift+KeyK` —— 走 `RegisterEventHotKey`，**不需要输入监听**；双击 ⌥ 需要，而新 identifier 没有，去授权会在他的输入监听列表里多出第二个「Spool」，**不值得为一张截图动他的正式版授权** |
| 复位 | `bash scripts/seed-demo-library.sh` 随时重建 |

⚠️ **顺序:先 S2 再 S1** —— S1 会往机器学习课里真加一块，加完 S2 就多一条。
⚠️ **首页那段 pack 正文不会因此失效**（页面上是定死的文本），但**要重新生成 pack 就得先重跑种子**。

### ✅ 拍摄结果（2026-08-12 Ocean 拍的）

| | 结果 |
|---|---|
| **S2** | ✅ **直接可用**。圆圈编号、价值面板「3 read today」、`Claude · MCP` 带 `↩`、演示库无真实数据 —— 全部到位。已接进页面（`project-window.png`） |
| **S1** | ~~可用但欠一次补拍~~ ✅ **补拍完成并已接进页面**（08-12 下午，见下） |

⭐ **S1 接进页面时改成了合成**：原图里浮窗只有 ~90px 宽，而旁边正文讲的是「光标停在批注框里」，
**看不见等于没拍**。改用 `site.css` 里现成的 `.capture-scene` / `.capture-toast` ——
同一张原图切成 `capture-page.png`（页面）+ `capture-toast.png`（放大的浮窗），浮窗浮在右上角，
**正好也是它真实出现的位置**。

~~⚠️ **S1 欠的那一件**~~：浮窗上 `Study / Machine learning course` 后面**没有来源**，
而正文写着「down to the browser tab」——**图文对不上**（`DESIGN_SITE_REBUILD` §1.1 第 4 条那类）。
病因是 memory `isolated-verify-workflow` §17（隔离 id 拿不到自动化授权 → `source` 存进库是 NULL，
当场核过），**不是产品坏了**。已跑 `tccutil reset AppleEvents com.oceanjin.spool.verify`
（只动演示那个 id），下次捕捉会重新弹授权框。

### ✅ S1 补拍（2026-08-12 下午，Ocean 拍的）

授权框弹了、他点了允许，所以**来源那行现在是完整的**：`Study / Machine learning course · What is C…`
—— 后半截就是**浏览器标签页的标题**，而那个标签页在同一张图里就露着。「down to the browser tab」这才有图作证。

⚠️ **新一张的构图和上一张不同，所以切法和 HTML 都改了**（细节和量出来的坐标在 `HANDOFF.md` §0-site.3）：
`capture-page.png` 2856→**2596**×2260（按 2856 切会把 IBM 那张 X-Force 卡片从中间劈开，
而那块位置在合成图里露在浮窗下面），`capture-toast.png` 688×434→**680×430**，
`index.html` 里 `width`/`height`/`srcset` 跟着改，**两条 `alt` 重写**（旧的写着「a line of example code」，新图不是代码）。

⚠️ **两条要他拍板的**（`HANDOFF.md` §0-site.3-bis）：新图下半部分有 IBM 的播客推广位，
**四张真人脸 + 「Anthropic sandbox breach」**；而且照片让 `capture-page.webp` 从几十 K 涨到 **491K**。

### ✅ 其余各屏（2026-08-12 晚，本轮做完）

| 屏 | 做了什么 | 在哪 |
|---|---|---|
| **S1 重切** | Ocean 换了一张**没有人脸**的原图（IBM 播客推广位没了，换成 X-Force 那张纯文字卡）。重新量了坐标：浮窗 `(2880,0)` 起 **680×392**（上一张是 430 高），页面仍切 **2596** 列（X-Force 卡左边框仍在 x=2600）。`index.html` 的 `height` 和**两条 `alt`** 跟着改 —— 新图**没有选中高亮**，旧 `alt` 写的「one sentence selected」已经不成立 | `docs/screenshots/S1.png` → `capture-page.png` / `capture-toast.png` |
| ⭐ **顺带解决了 §0-site.3-bis 那两条** | 人脸没了，**体积也塌了**：`capture-page.webp` **491K → 141K**，`-1160` 190K → 114K。**不用为这个槽位开有损**，脚本开头那条「无损最划算」的结论不用推翻 | 同上 |
| **屏 1 Hero** | 删 `hero-tag` 整段；`hero-sub` 砍成两句，第二句换成差异点（「交出去的每个字你都看得见」）。`.hero .tagline` CSS 一并删掉，`.hero .sub` 字号补上去接住空出来的分量 | `site/index.html` + `site.css` |
| **屏 2+4 合并** | `#who-for` 整段并进 `#problem`：`who-k/who-h/who-p` 三个标题层删掉，三张卡原样搬过去。`#how` 补 `alt`，把明暗交替接回来 | `site/index.html` |
| **屏 7 压缩** | `growth-pair`（S4/S5 两个空框）+ `grow-cap` 删掉，`grow-p` / `grow-p2` 原样留 | 同上 |
| ⭐⭐ **屏 8-10 合并** | `#gate` 和 `#watch` **两个 section 整个没了**，内容按清单重新安置：`gate-1p` 压进可见的 `gate-p`（署名/只能追加/删不掉）；待审三步 + 文件开关 + 作废归你**折进 `<details class="fold">`**；`#watch` 降成 `#mcp` 里一段**可见**的短块 | 同上 |
| **屏 11 换序** | 四张卡 `t3 → t2 → t1 → t4`；DB 事故那句**提到 `t4-h` 标题上**；`t1-p` 补一句手动更新（＝从不联网查更新）；story 链接改成「How it was built — and what broke →」 | 同上 |
| **屏 12 FAQ** | `q11`（不接 AI 也能用）从第 5 提到**第 2** | 同上 |
| **§3.1 对比度** | `--muted` `#8c8576` → **`#6e6759`**。当场复算：对 `--paper` **5.24**、`--paper-2` **4.84**、pack 面板 **5.51**，三处全过 AA | `site.css` |
| **§3.2 tab 键盘** | 走的是清单里推的第 2 条，而且更彻底：**四个 tab 连同 markup 一起删了**（它们装的是空框）。`main.js` 仍留着 tab 机制，但**改成 `aria-pressed`**，并写了注释钉住「回来的时候别再写 `role="tab"`」 | `main.js` + `site.css` |
| **§3.3 线轴点击** | 删掉那个 click；`.mt-spool` 的 `cursor:pointer` / `pointer-events:auto` / `:hover` 一起删（不可点了就别做出可点的样子） | 同上 |
| **§3.4 story 中文** | 中文页的 `maker-link` 和 `foot-story` 各标一句 **（英文）**。翻译仍单排 | `site-zh-strings.mjs` |

⭐ **空图框 9 → 0。** S6a/S6b/S6c/S7/S8/S9/S10 **全部删框**（清单 §5 原本想把 S7 留在折叠区里 ——
**没照做**：折叠区里的框照样是对外可见的内部工单，而 S7 要证的那件事
（AI 写的块署名、`↩ cites` 指回原条）**首页那段真 pack 正文已经证了**，`#5 · from Claude · MCP` 就在上面）。

⚠️ **`.shot-slot` / `.ss-*` 那套 CSS 删干净了** —— 它是「给摄影师的话」的样式，不该再有回来的机会。
**`growth-pair` / `shot-tabs` / `shot-group` / `shot-arrow` 的布局 CSS 留着没删**（清单计划里 S4/S5/S6 拍回来还要用），
现在是**暂时用不到的死样式**，别当成漏网。

### ⚠️ 唯一一件没做的：**屏 3「demo 降门槛」**

清单 §屏 3 推的 A 方案写的是「小改，只动文案 + 一处常量」。**照着做会当场把 demo 弄成假的**，两条都当场核过：

1. **「3 条改成 1 条」不是一个常量。** demo 后面几步的正文**全部写死了三条**：
   打包弹窗的统计 `'3 notes · ' + n + ' characters'`、`packText` 是一份**固定的三条笔记文档**、
   AI 回答开口就是 "Three notes, three sources."、扔掉那句是 "your three notes are untouched"。
   **只存一条就打包 → 打出来的那份文档里有两条访客根本没存过的笔记。**
   这正是 `DESIGN_SITE_REBUILD` §1.1 第 4 条那类「图文不符」，比它要治的门槛更伤。
   真要降门槛，得先把 demo 后半段的正文改成**不依赖条数**，那是另一摊活。
2. **「90 秒改成一分钟」是往页面上写一个没量过的数**，而且活儿一点没少。
   §5-bis 刚因为同样的理由把「3,000 字」改成量出来的「4,192」。**没动。**

**留给 Ocean 定**：① 就这样；② 花一摊时间把 demo 后半段改成条数无关，再把闸放到 1 条。

---

## 6. ⚠️ 动手前必读

1. **`site/` 一动、一推就是 spoolapp.org 重新部署**（`DESIGN_SITE_REBUILD` §0.1，
   `.github/workflows/pages.yml` 的 `paths: site/**`）。**现在已经是上线态**，
   所以这次的风险反过来了：**改到一半推上去 = 线上页面碎掉**。要么一次改完，要么本地验完再推。
2. **中文页 `site/zh/index.html` 是生成的，别手改** —— 改 `scripts/site-zh-strings.mjs`，
   跑 `node scripts/build-site-zh.mjs`，`build-site-zh.test.mjs` 钉着。
3. **凡是动「东西会不会出网」的句子，三处一起看**：`site/index.html` 的 `t3-p`、
   `site/privacy.html`、`docs/PRIVACY.md`。
4. **真 pack 正文用演示库产出**（`scripts/seed-demo-library.sh`），**真库绝不入镜**。
5. **验收照 `DESIGN_SITE_REBUILD` §4 那六条**，其中第 2 条（390px 无横向滚动）和第 3 条
   （断网零外链）在这一轮尤其容易被新增的 pack 正文块破坏。
6. 提交自查用**窄版** grep（memory `attribution-grep-false-positive`）：
   `git log -1 --pretty=full | grep -iE 'co-authored|🤖|generated with|anthropic'`。
