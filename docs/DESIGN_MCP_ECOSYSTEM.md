# 设计稿:把 MCP 生态讲清楚(官网 + app 内)— 待 Ocean 批复

> 2026-08-02 撰写,对应 HANDOFF §2(Ocean 2026-07-31 提出)。两层目的:对外用**已支持的
> 客户端阵容**拉动下载,对内**别让用户看不懂**。设计类任务,按硬规则 6:**先批复,再动手。**
>
> 商标那部分是会过期的外部事实,**2026-08-02 逐家查了官方页面**,来源列在 §7。

---

## 0. 要你拍板的四件事(速览)

| # | 决定 | 我的建议 | 一句话理由 |
|---|------|----------|-----------|
| 1 | **官网上要不要放各家 logo** | **不放。纯文字名字 + 我们自己画的中性小图标** | 六家里 VS Code **明文禁止**这个用法,Anthropic / OpenAI 要**事先书面批准**,Windsurf 要先问。凑不出一排整齐的 logo |
| 2 | **阵容段长什么样、放哪** | 放进官网现有 MCP 段落里,开头位置;**按「聊天类 / 写代码用的」分两组** | 分组本身就把你说的那个困惑点解释掉了,不用额外加表格 |
| 3 | **app 内落点** | 设置页 MCP 那个「示例用法」折叠段里**加一句「在哪儿说」**,并把折叠标题改一下 | 设置页已经不短了,不新开 UI |
| 4 | **要不要顺手改教程种子** | **不改**(本轮不做) | 种子只对新装库生效,老用户看不到;而且会把这次改动摊大 |

---

## 1. 现在是什么样

- **官网**:MCP 那一段(`site/index.html` `#mcp`)只讲了「AI 能读你的笔记」,配四张截图。
  **全篇没有一处说「支持哪些客户端」**——一个正在用 Cursor 的人,看完不知道自己能不能用。
- **app 内**:设置里已经有六行一键接入(Claude Desktop / Claude Code / Cursor / VS Code /
  Windsurf / ChatGPT · Codex),但**没有一个字说接好之后去哪儿用**。
  折叠段「示例用法」只写了「说什么」,没写「在哪儿说」。
- 这正是你点出的困惑:装了 VS Code 那一类的人,**以为要回 Spool 里操作**。

---

## 2. 拍板点 1:logo 能不能用 —— 查证结果(这稿最重要的部分)

你在 HANDOFF 里已经先一步提醒过「logo 是第三方商标,别直接扒图」。我把六家的官方规范
都翻了一遍,结论比预想的更硬:

| 客户端 | 官方规范原话(要点) | 能不能把它的 logo 放上我们官网 |
|---|---|---|
| **VS Code**(微软) | 图标「可以」的用法只有两种:**讲 VS Code 的文档/教程/博客/新闻**,以及**链到 code.visualstudio.com**。「不可以」里明写:*用图标标识或推广你自己的产品、服务、应用*;*用我们的图标把你的东西和微软扯上关系*;*把图标画进你的 logo*;*改画或重绘图标* | ❌ **明文禁止**,而且禁的正正好就是我们想干的事 |
| **Claude Desktop / Claude Code**(Anthropic) | *「你只能按我们特别许可的方式、且只在我们事先批准的材料里使用我们的商标」*;不得暗示赞助、背书或关联;要用先发邮件 marketing@anthropic.com | ❌ 要**事先书面批准** |
| **ChatGPT / Codex**(OpenAI) | 「Powered by OpenAI」徽章只给**用它 API 的客户**;不得让人以为你的产品被 OpenAI 支持、认证或背书;提到时你自家名字要在前;问 partnercomms@openai.com | ❌ 我们**不是 API 客户**(我们只是被它读),徽章根本不适用 |
| **Windsurf** | 有公开资产包 + 一串「不许怎么改」;明说 *「本页没写到的用法,请带着效果图联系我们」* | ⚠️ **得先问** |
| **Cursor** | 只规定了叫法(叫 Cursor,别叫 Cursor AI);资产包公开打包下载,没写禁止兼容性展示 | ⚠️ 六家里最宽松,但也没明确许可 |

**所以「一排六个 logo」这件事今天做不成**:一家明文禁止,两家要事先书面批准,两家含糊。
只放能放的那几个 → 一排里有的有图有的没图,反而像做坏了。

**一个法律上的区别值得你知道**(一句话):**用文字如实说「支持 Cursor」是安全的**
(法律上叫指名性使用,你没法禁止别人如实说出你的名字);**贴 logo 是另一回事**,
那是商标图形使用,人家的规范就管得着。所以下面的方案把名字留下、把图形换掉。

> 顺带一个先例:**MCP 官网自己**在讲生态时也是纯文字点名(Claude、ChatGPT、
> Visual Studio Code、Cursor),没有摆 logo 墙。

### 三个选项

- **A(建议)**:**纯文字名字 + 我们自己画的中性图标**。图标只表示「类别」——
  聊天气泡代表聊天类,终端提示符代表写代码用的——**不是任何一家 logo 的临摹**。
  ⚠️ 注意:「把他家 logo 改成单色」不算安全做法,VS Code 那条「改画/重绘」照样禁。
  必须是我们自己的图形语言。**今天就能上线,一封邮件都不用发。**
- **B**:只给许可宽松的放 logo(实际上只有 Cursor)。**不建议**,一排图文不齐,
  而且 Cursor 也没白纸黑字许可。
- **C**:给四家发邮件申请,批了再加。**周期以周计,多半没有回音**。
  如果你想要,可以和 A **并行**——先按 A 上线,谁批下来再单独加谁。

---

## 3. 拍板点 2:官网阵容段(顺手把「VS Code 跟桌面版不一样」讲掉)

### 3.1 关键设计:分组本身就是解释

你在 HANDOFF 里给了一张四行的对照表(形态 / 在哪用 / 生效时机 / 容易卡在哪)。
**我建议不要把那张表搬上官网**——首页放对照表太重,而且大部分内容可以靠**分组**表达:

把六个客户端分成**两组**,组名就把差别说了:

- **和你聊天的**(Claude Desktop、ChatGPT 桌面版)→ 你在聊天框里说话,跟平时一样。
- **你写代码用的**(Claude Code、Cursor、Visual Studio Code、Windsurf)→
  你在编辑器的 AI 面板里说,或者在终端里说。

再补一句直击困惑点的话:**「不用回 Spool 里操作,Spool 只负责把笔记递过去。」**
这句就是你说的「以为要回 Spool 里操作」的解药,而且它对两组都成立。

### 3.2 位置

放在官网现有 MCP 段落(`#mcp`)**开头那段话的下面、四张截图的上面**。
理由:先回答「我这个软件能不能用」,再给「用起来什么样」。不新开 section,导航不动。

### 3.3 文案草稿(英文是正文,中文是重写不是翻译)

**EN(写进 HTML)**

> **Connect the AI you already use — one click each.**
>
> **Apps you chat with** — Claude Desktop · ChatGPT (desktop)
> You ask in the chat box, the same as always.
>
> **Tools you code in** — Claude Code · Cursor · Visual Studio Code · Windsurf
> You ask in the editor's AI panel, or in the terminal.
>
> Either way you stay where you are — Spool just hands the notes over. Connect it once in
> Spool's settings, restart that app, and it can read your projects from then on.
>
> Not on the list? Copy one short setting out of Spool and paste it into your app.

**ZH(写进 `site/assets/i18n.js`)**

> **你已经在用的 AI,一个按钮就能读到你的 Spool。**
>
> **跟你聊天的**——Claude Desktop · ChatGPT 桌面版
> 还是在聊天框里说话,和平时一样。
>
> **你写代码用的**——Claude Code · Cursor · Visual Studio Code · Windsurf
> 在编辑器的 AI 面板里说,或者在终端里说。
>
> 两种都一样:你人待在原地,Spool 只负责把笔记递过去。在 Spool 设置里接一次、
> 把那个软件重启一下,之后它就能读你的项目了。
>
> 不在名单上?从 Spool 里复制一段设置,粘进你那个软件就行。

⚠️ 措辞上有意回避的两点:**不写「支持 Model Context Protocol」**(硬规则 4 大白话);
**不写「官方支持 / 合作 / 认证」**(§2 里三家都禁止暗示背书)。「Connect the AI you
already use」这种句式说的是我们自己能干什么,不是他们背书了我们。

### 3.4 长什么样(不用新资源、不外链)

- 两张并排的卡片(窄屏自动叠成上下),复用现有 `.card` 的观感;
  组名前面一个我们自己画的**内联 SVG** 小图标(聊天气泡 / 终端提示符),
  颜色走现有 `--accent`。
- 客户端名字做成一行小圆角标签(新增一个 `.client-chip`,~10 行 CSS)。
- **零新增资源文件、零外链**——CSP 那条约束天然满足(HANDOFF §2.1)。
- 名字**一律用全称**:`Visual Studio Code`(微软规范禁止写 `VS Code`/`vscode` 这类简写)。
  ⚠️ 这条同时意味着 **app 内设置页那行 `VS Code` 严格说也不合规**,建议本轮一起改成
  `Visual Studio Code`——一个字符串的事。

---

## 4. 拍板点 3:app 内落点

按 HANDOFF 的意见,**不新开 UI**,就在 `src/components/Settings/McpConfig.tsx` 已有的
「示例用法」折叠段上扩:

1. **折叠标题改成**:`示例用法:接好后在哪儿说、说什么`
   —— 关键在于**折叠着的时候也能看见「在哪儿」三个字**,不然点不开就等于没写。
2. **展开后,在六条例句上面加一行**:
   > 在哪儿说:Claude Desktop / ChatGPT 在聊天框里说;Claude Code 在终端里说;
   > Cursor / Visual Studio Code / Windsurf 在编辑器的 AI 面板里说。
   > **不用回 Spool 操作**,接好后 Spool 只负责把笔记递过去。
3. 生效时机不另写——客户端行上已经有「已写入 — 重启后生效」的徽章,重复反而啰嗦。

i18n:新句子按硬规则 4 **中文即键**,同步在 `src/lib/i18n/index.ts` 补 EN。

---

## 5. 拍板点 4:教程种子改不改 —— 建议不改

教程种子里那条 MCP 说明写的是「一键接入 Claude Desktop / Cursor」,现在实际支持六个,
**文字已经落后了**。但:

- 种子**只在空库播种**(5/29 红线),存量用户一个字都看不到;
- 要改就得中英两套一起改 + 动 `client.test.ts` 的种子断言,
  等于把这次改动从「文案」摊成「文案 + 数据 + 测试」。

**建议单独排一次**(和以后教程文案的其他修订一起做)。你要是想这次一起做,告诉我,
我按同一稿加进去。

---

## 6. 明确不做

- 不用任何一家的 logo(在拿到书面许可之前),**也不用「他们 logo 的单色临摹版」**。
- 不写「官方支持 / 合作伙伴 / 认证」这类会被当成暗示背书的话。
- 不外链任何 CDN、不加新依赖、不加新图片文件。
- 不碰存量库、不碰 schema、不碰 `assemble.ts` / `templates.ts` / golden / `mcp.rs`。

---

## 7. 验收标准与成本

**改动面**(全部是文案与样式,无逻辑):

| 文件 | 改什么 | 量级 |
|---|---|---|
| `site/index.html` | `#mcp` 段内插入阵容块 | ~30 行 |
| `site/assets/i18n.js` | 对应中文 key | ~8 行 |
| `site/assets/site.css` | `.client-groups` / `.client-chip` | ~15 行 |
| `src/components/Settings/McpConfig.tsx` | 折叠标题 + 一行说明 + `VS Code`→`Visual Studio Code` | ~8 行 |
| `src/lib/i18n/index.ts` | 新 key 的 EN | ~3 行 |

**验收**:
1. `npx tsc -b` / `npx vitest run` 全绿 → 验:退出码 0,152 个用例不减。
2. 官网本地起静态服务,**中英各看一遍** → 验:两种语言文案都在、没有漏 key(留在英文即为漏)。
3. 窄屏(390px)看一遍 → 验:两张卡片竖排,**页面不出现横向滚动**。
4. 断网打开官网 → 验:阵容块照常显示(证明零外链)。
5. app 设置页截图一张 → 验:折叠标题新文案可见;展开后「在哪儿说」在六条例句上面。
6. 提交后自检 `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 为空。

⚠️ 官网改动**推 main 会自动部署**(硬规则 7),所以推送要你单独明示。

---

## 8. 来源(2026-08-02 查证,会过期,下次动这块前重查)

- VS Code 图标与名称规范(「OK / Not OK」两张清单):<https://code.visualstudio.com/brand>
- Anthropic 商标规范:<https://www.anthropic.com/legal/trademark-guidelines>
  (入口在 <https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms>)
- OpenAI 品牌规范:<https://openai.com/brand/>(「Powered by OpenAI」徽章限 API 客户;
  禁止暗示背书;联系 partnercomms@openai.com)
- Cursor 品牌页:<https://cursor.com/brand>
- Windsurf 品牌页:<https://windsurf.com/brand>(「没写到的用法请带效果图联系我们」)
- MCP 官网生态表述(纯文字点名的先例):<https://modelcontextprotocol.io/>
- VS Code 里 MCP 在哪用(Chat 视图)与配置变更后需重启该 server:
  <https://code.visualstudio.com/docs/copilot/customization/mcp-servers>
- Claude Code 的 `/mcp` 面板与 user scope:<https://code.claude.com/docs/en/mcp>
