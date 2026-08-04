# 交接文档 — 2026-08-04(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**两份待批设计稿全部批复并全部落地:schema v9(可见编号 + PDF 正文能搜到)、
MCP 零摩擦四个决定;外加 Ocean 新提的「MCP 说话跟随设置语言」。**(2026-08-04)
**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 17 个提交,工作区干净。
基线全绿:`npx tsc -b` / `npx vitest run`(**163**,+2)/ `cargo test`(**19**,+1)。
真库这一窗**没有被迁移**(见 §1 第一条 —— 需要 Ocean 点头换装才会发生),
迁移前已备份 `spool.db.backup-20260804-141006-preschema-v9`,并在真库副本上**预演过一次**:
12 块进 12 块出,`integrity_check` = ok,编号按项目从 1 开始。

**👉 下一窗第一件事:读 §1。**

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | 🚩 **换装 `/Applications/Spool.app`,让真库跑完 v9 迁移** —— 不换装,真库这条 MCP 通路会一直拒绝读(报「先把 Spool 启动一次」)。做法照抄 §5.3 | **等 Ocean 明示**(硬规则 7) |
| B | 第二轮实机评审(Claude Desktop + ChatGPT)| 提示词在 `docs/MCP_LAB_PROMPT.md`,**需要按这一窗的改动更新一遍**(见 §3.5),等 Ocean 有空跑 |
| C | 长期计划里挑一条开工 —— 第 2 条 Claude Code 引擎位**已批复可开工**,是唯一一条不用再拍板的 | §4 表格 |
| D | **D-1:add_block 检测到裸 id 就硬拒绝** —— 可见编号已经落地,AI 再也没有理由写裸 id,硬拒绝从此没有代价 | 可开工,不需要拍板(原 DESIGN_SCHEMA_V9 §4 写明「必须排在 H-1 之后」,现在满足了) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §3.1 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

---

## 2. 这一窗做了什么(后来人会问的)

Ocean 2026-08-04 的批复原话(五条):① MCP 语言要跟随设置语言;②「schema v9 可见编号
走正路」+「App 里长什么样选 a」;③ ZERO_FRICTION 四个决定全批,开工;④ 长期计划第 2 条
可开工;⑤ 确认 mcp.rs 底部那堆测试代码不进发布版。

**⑤ 当场答复:确认不进。** [mcp.rs 的 `#[cfg(test)]`](../src-tauri/src/mcp.rs) 把后面一千四百多行
整段圈起来,`cargo build --release` 根本不编译它。里面 `include_str!` 读的 schema.sql、
造的临时库,只在 `cargo test` 时存在。

### 2.1 schema v9 —— 提交 `182c314`

**H-1 可见编号(走正路)**:`blocks.seq`,每个项目内单调递增、永不复用、**落库不派生**。
派生的「按时间排第几」会在删掉一块之后把后面全改号 —— 用户昨天记下的 #12 今天指向别的
东西,比没有编号更糟。存量按 `created_at ASC, rowid ASC` 回填,和 pack 的渲染顺序一致,
所以老 pack 里的第几块就是 #几。

写入路径四条都改了,每条的理由不同:

- `createBlock` / `add_block`:seq 在 **INSERT 语句内部**算(`SELECT MAX(seq)+1`)。WAL 串行化
  写者,所以 GUI 和 MCP 子进程同时往同一个项目写也撞不上。
- `insertBlocks`(批量转发):多行 VALUES **不能**自己算 —— 相关子查询看不看得见同一条语句里
  前面刚插的行是不确定的,会发号重复或跳号。改成先读基数、再写字面量,唯一索引兜底。
- `updateBlockThread`(改项目):必须重新取号,seq 是项目内的,原号搬过去会和别人撞。
  **块换项目 = 换号**,这是设计使然。
- `restoreBlock`(撤销删除):连原号一起还原。号不回收,不可能被别人占走。

**H-3 PDF 正文能被搜到**:⚠️ **实现和设计稿写的不一样,这里说明**。设计稿写的是
「`blocks_fts` 加一列 `extracted`」,**SQLite 做不到** —— `blocks_fts` 是外部内容表
(`content=blocks`),它的每一列都必须是 `blocks` 的真实列,而抽取正文在 `attachments` 上。
改为给 `attachments` 建自己的 `attachments_fts` + 三个触发器:零重复存储,而且「哪个附件
命中的」天然说得清(设计稿 §2 第 3 点要的就是这个)。

因此 `search_blocks` 多了一栏 `attachment_hits`(带 `matched_in` 和是哪个文件),
**单列一栏,没有并进 `hits`**:`offset`/`limit` 分的是块命中,两拨混在一个游标下会让分页说谎。

⚠️ **本轮只做了 MCP 侧的附件搜索**。App 自己的搜索框(`src/lib/search/query.ts`)仍然搜不到
PDF 正文 —— 设计稿点名的是 `search_blocks`,而 app 搜索要改就得动 `SearchField` 类型、
片段渲染、块内 `<mark>` 跳转那一整条链,是另一件事。**Ocean 要的话再开一轮。**

**App 侧(样式 a)**:提交 `268dccd`。编号在时间戳左边,灰色等宽小字,不抢戏。
点一下把这块滚到屏幕中间并闪一下(Ocean 原话「点击高亮显示该 block」)。
v9 之前的块 seq 为空,那种行一个字都不多显示。

### 2.2 MCP 说话跟随设置语言 —— 同提交 `182c314`

Ocean 问「目前词汇使用是不是仅中文」,答案是**混着的**:工具名、工具描述、
initialize instructions、pack 的授权四类表头是英文;报错、digest 表头、库体检、
项目体检、四段引导文全是中文(194 处)。

**病根最重的一处**:pack 结尾的 `## Output Language` 写死「Respond in Simplified Chinese」。
英文用户界面是英文的,pack 一贴出去,对面 AI 张口就是中文。

**按 Ocean 拍的范围**:只有「人看得懂的那部分」跟随设置;
工具名 / 工具描述 / initialize instructions / pack 授权表头**保持英文**
(§19.13:模型跟英文指令更稳,尤其「绝不说 id」这类负向约束)。

**语言从哪来** —— 这里有个坑值得记住:`settings.json` 里的 `language` 键
**只有用户手动切过语言才会写**,它的「不存在」正是「跟随系统 locale」的意思
(`settingsStore.ts` 有一整段红线写这个)。而 MCP 是独立进程,没有 navigator 可问。
所以 app 每次 load 把**生效语言**镜像进一个新键 `resolvedLanguage`,MCP 读它。
**`language` 本身的语义一个字没动。**

实现上是 `t!` / `ts!` 两个宏 + 一个 `Lang`。⚠️ **语言状态是 thread-local,不是进程全局** ——
测试并行跑,进程级全局意味着谁先碰到它谁就决定了别的测试用什么语言渲染,**已经真的抖出来
一次**。每个断言中文的测试现在都自己写明 `store_lang(Lang::Zh)`。

### 2.3 ZERO_FRICTION 四个决定 —— 提交 `04ea00f`、`4631c25`

- **决定 1(走 a)**:除 `get_pack` 外每个工具的返回顶上加一行大白话,内容全部从即将
  返回的那份数据里算出来,两者不可能对不上。`add_block` 那行报 **#编号** —— 用户真能在
  应用里找到的东西。`get_pack` 按批复不加:它的返回是要原样粘给别的 AI 的。
- **决定 2**:initialize instructions 开头加一段「用户会怎么开口」,四组常见说法对应哪个
  工具;并要求第一轮如果用户没具体问什么,**用他自己的项目名**一句话说清能帮他做什么
  (先调 list_threads,例子必须是真的)。
- **决定 3**:用法收口到**设置里那段可复制的开场白**。原来那段是给 AI 读的工作规则,
  人读了不知道自己该干什么;重写成人也看得懂的开场白(三句示例问法 + 两条规矩)。
  官网和 README 不再自己列用法,改成指路。**官网改完已重跑 `build-site-zh.mjs`**。
- **决定 4**:教程种子里「一键接入 Claude Desktop / Cursor」→「设置 → MCP,一键接上你在用的
  AI 客户端」。不列客户端名字(列了要维护,商标那条 §5.6 也说了会过期)。EN 同步。

### 2.4 顺手补的两处(不在批复里,但撞上了)

- **读也做版本检查了**。MCP 服务随 Spool.app 一起装,换新版之后客户端拿到的是新服务、
  磁盘上还是旧库(迁移发生在应用里,MCP 进程只读)。这个错配原来会以
  「`no such column: b.seq`」的样子冒出来,用户完全不知道该干什么;现在直说
  「先把 Spool 启动一次」。反过来库比服务新,就告诉他客户端连的是旧程序。
- **实验室种子跟到 v9**(含 seq 回填,和迁移同一套口径)。

### 2.5 验证 —— 真 stdio 走了一遍,两种语言都验了

| 验什么 | 结果 |
|---|---|
| pack 里的 `#12` | 16 块全带号;`📌 #14` 这种置顶块在两处(Pinned 与 Full Record)号一致 |
| 重复组能不能区分 | 实验室里那三条一模一样的正则化笔记 → `#4 / #5 / #6`,**这正是编号要解决的场合** |
| 附件正文搜得到 | 搜「谷底两侧」(只存在于 PDF 里)→ 块命中 0、`attachment_total` 1,并说清是 `lecture-03.pdf` |
| 工具首行人话 | 「查了一遍重复:1 组内容高度相似(扫了 37 块)。合并要你自己在 Spool 里做。」 |
| 无参数 `thread_health` | 回项目清单 + 问用户要哪个(H-6 没有回退) |
| 语言跟随 | `resolvedLanguage` 改成 `en` 之后:体检报告、报错、项目清单全英文,**pack 结尾变成 Respond in English**;授权四类表头两种语言下都保持英文 |
| 真库迁移预演 | 在真库副本上跑完 v8→v9:12 块进 12 块出,`integrity_check` = ok,编号按项目从 1 开始 |

**没验到的那一层**:Claude Code / Claude Desktop 客户端里的实机点击。
需要 Ocean 重启客户端(硬规则 11)。**实验室已经是最新程序、最新数据,他重启就能测。**

**下次改完 MCP 代码,照这个顺序重跑一遍**:

```
# 1. 重建程序 + 重播实验室(改过 Rust 就必须做)
cd ~/Desktop/Knote/src-tauri && cargo build --release
cd ~/Desktop/Knote && ./scripts/seed-mcp-lab.sh

# 2. 重启 Claude Code —— 在 VS Code 里就是重开窗口(⌘⇧P → Reload Window)
#    ⚠️ 当前会话会断,所以这一步放在一轮对话的最后做

# 3. 重开之后逐条点(什么都不填,直接回车):
#    /mcp__spool_lab__distill  /mcp__spool_lab__thread_health
#    /mcp__spool_lab__weekly_review  /mcp__spool_lab__compress_pack
#    期望:都不报 "Missing required argument",而是回项目清单
#
# 4. 让 AI 调工具版:「用 spool_lab 给机器学习课做个体检」
#    期望:它自己调 mcp__spool_lab__thread_health,返回第一行是人话
#
# 5. 核对编号:「用 spool_lab 读机器学习课的 pack」
#    期望:每块带 #n;那三条重复的正则化笔记是 #4 / #5 / #6
```

⚠️ **`~/.claude.json` 是 Claude Code 自己的状态文件,它可能在退出时回写** ——
重启之后复查一眼 `spool_lab` 还在不在。

---

## 3. 还没还的旧账

### 3.1 🚩 截图现在是旧术语了(三窗未还)

术语从「脉络/thread」改成「项目/project」之后,**官网上所有 app 截图里的文案都成了旧版**。
最明显的一处:MCP 段那张图里 AI 回的是 "…or open a specific **thread**?"。

这条**并进 §1 的 F**(截图整体替换),不要单独开一轮:
- Ocean 2026-08-02 已批:重建隔离演示环境作展示,**截图做完整替换**(不是补一两张),
  **整件事安排在 app 代码全部做完之后,和录演示视频一起做**。
- 同时要修的老问题:step 02 主截图、day1/week6 增长图、OG 分享卡、交互演示
  (`site/assets/demo.js` 的 EN+ZH 两套脚本)讲的都是 "Job search / 找工作",
  而首页白纸黑字写着「找工作这类短期事务不是主攻对象」——**文案和图片在互相拆台**。
- 怎么修:演示库里现成就有 `Machine learning course`(Study 工作区)和 `Portfolio site`,
  把主截图和增长对照换成「机器学习课」那条线。脚本 `scripts/seed-growth-demo.sh day1|week6`
  现在写死的是找工作的内容,要改。
- 🆕 **重拍时注意:块上现在多了 `#12` 这个新视觉元素**,老截图和新界面又多一处对不上。
- ⚠️ **换完截图记得重跑 `scripts/build-site-shots.sh`**,再把它打印的 srcset 贴回 HTML。

### 3.2 `site/assets/shots/mcp-ask.png` 没有任何页面引用

本来就是死文件(CLAUDE.md §3:不擅自删预先存在的死代码)。要删得 Ocean 点头。

### 3.3 网页工程债

没有 sitemap.xml、没有 robots.txt。没人提过,不确定要不要。
(中文页 alt / `<noscript>` 已由 Ocean 2026-08-03 拍板**不写**,这条销案,别再提。)

### 3.4 App 搜索框搜不到附件正文

见 §2.1 末尾。MCP 侧已经能搜,app 自己的搜索框还不能。要动就是另一轮。

### 3.5 `docs/MCP_LAB_PROMPT.md` 还是上一轮的

R1–R11 回归项说的是上一轮修的十一条,Z1–Z4 问的是零摩擦那三条要求 —— **零摩擦已经落地了**,
再照着问会问出一堆「已经做了」。下轮评审前要按这一窗的改动重写:可见编号、附件搜索、
语言跟随、工具首行人话,都是新的可验证面。

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | **已实现,已在 Claude Code 客户端里验过**(2026-08-04:三个同时做成工具,必填参数取消)。等第二轮评审报告 | 实现见上一版交接 §2.1–2.2;原设计 `docs/DESIGN_NEXT_STAGE.md` §4.2(⚠️ 其中「斜杠菜单即发现面」的前提已被实测推翻,见第 7 条) |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手 | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工。两份实机报告独立要到了这条(`source_contains` 表达不了「source 为空」) | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 7 | **MCP 零摩擦使用引导** | ✅ **2026-08-04 全部落地**(四个决定),设计稿已删。剩下的验证在 §1 的 B | 实现见 §2.3 |
| 8 | **schema v9 那一轮**:块的可见编号(H-1)+ PDF 正文能被搜到(H-3) | ✅ **2026-08-04 落地**,设计稿已删。⚠️ **真库还没迁移**,等换装(§1 的 A);app 搜索框那半截见 §3.4 | 实现见 §2.1 |
| 9 | 🆕 **D-1:add_block 硬拒绝裸 id** + **D-2:拿库内真实 id 建索引做精确比对** | **可开工,不需要拍板**。可见编号已落地,前置条件满足 | 原 `DESIGN_SCHEMA_V9.md` §4,内容已并进本表 |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md` |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」,但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新、语义检索(本地 embedding 太重 / 云端撞「零出网」)、
AI 的删除/撤回/编辑接口(append-only 是宪法级承诺)。

---

## 5. 环境与现状

### 5.1 真库与备份

- 真库:`~/Library/Application Support/com.oceanjin.spool/spool.db`,**现在仍是 schema v8**。
- 这一窗的备份:同目录 `spool.db.backup-20260804-141006-preschema-v9`(动 schema 前做的,
  用 `sqlite3 .backup`,已核对块数一致)。更早一份:`spool.db.backup-20260803-215543-preinstall`。
- ⚠️ **真库的 v8→v9 迁移还没发生**,因为迁移只在 app 启动时跑,而 `/Applications/Spool.app`
  还是旧构建。换装(§1 的 A)之后第一次启动才会迁移,**app 自己还会再存一份
  `spool.pre-migration-v8-*.db`**。
- 已在**真库副本**上预演过整条迁移,结果见 §2.5 最后一行。

### 5.2 隔离验证环境

- **MCP 实验室**:`scripts/seed-mcp-lab.sh`
  (`~/Library/Application Support/com.oceanjin.spool.lab/`)。**这一窗末尾是最新程序 + 最新数据
  (schema v9,块都带编号)**,Ocean 重启客户端就能测。
  - ⚠️ **别把它挪进桌面/文稿/下载** —— 那三个是 TCC 保护目录,Claude Desktop 没被授权时
    连启动脚本都 exec 不了(`Operation not permitted` + 一连上就断,2026-08-03 实测踩过)。
  - ⚠️ 它走的是**另一条隔离路线** —— `SPOOL_DATA_DIR` + 二进制副本,**不改 identifier、
    不装 app、不碰 GUI**。只验 MCP 面时用它,比重建 verify 构建轻得多。
  - ⚠️ **改了 Rust 就必须 `cargo build --release` + 重跑本脚本 + 重启客户端**,三步缺一不可。
- **验证构建**:`src-tauri/target/release/bundle/macos/Spool.app`。⚠️ 它现在是
  `com.oceanjin.spool` + Developer ID 签名(08-03 为了换装重建的),**不是 verify 构建**。
  要做隔离验证,得改 identifier 重建 —— 改完**立刻**建、建完**立刻**改回来。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目,默认播 `language:"en"`)、
  `scripts/seed-growth-demo.sh day1|week6`。两个都**只写 verify 数据目录**,真库不碰。
- ⚠️ **首启验证专用 id `.fr1` / `.fr2` / `.fr3` 全都用掉了**。`.fr3` 就是桌面上那个
  `~/Desktop/Spool-首启试装/Spool.app`。再验「启动不弹框」**必须换 `.fr4`**。
- ⚠️ **窗口重叠**:`.fr3` 的窗口和新建 verify 构建**默认同坐标**(350,119 · 1100x720),
  很容易拍错窗口并误判「改动没生效」。完整规程和四条踩坑记录在 memory
  `isolated-verify-workflow` §10,动手前先读。

### 5.3 换装:`/Applications/Spool.app`

现在装的是 08-03 那次的本地构建(**不含这一窗的任何改动**)。重新换装照抄:

1. **先备份真库**(硬规则 3)。
2. ⚠️ **`target/release/bundle` 里那个构建的 identifier 可能是 `com.oceanjin.spool.verify`,
   绝不能直接装** —— 装上去会指向 verify 数据目录,看起来就像「数据全没了」。
3. ⚠️ **必须用 Developer ID 签,不能用默认的 `Spool Dev`。**
   换签名身份 = macOS 认成另一个 app = 已授的输入监控/辅助功能权限当场失效,
   双击 ⌥ 捕捉会停摆。用环境变量覆盖,不改文件:

   ```
   APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)" \
     npm run tauri build -- --bundles app
   ```
4. 本地构建**没有公证**,但本地构建的文件没有 quarantine 属性,Gatekeeper 不拦。
   (对外发 Release 仍然要走公证,见 memory `distribution-route-notarized-dmg`。)
5. 🆕 **换装后第一次启动会跑 v8→v9 迁移**。启动完核对一眼:块的左上角出现 `#1 #2 …`,
   `sqlite3 spool.db 'PRAGMA user_version'` 是 9。

### 5.4 官网现在的骨架

开头(含信任 chip)→ 那两分钟 → demo → 这是给谁用的(长期做一件事·三张卡)→
怎么用三步 → 中段下载 CTA → 它每周都在变强 → MCP + 客户端阵容 →
你装的到底是什么(权限说明 + 签名公证 + 单文件 + 不追踪 + 一个人做的)→
FAQ 八条 → 标志 → 下载。

- `/` 是英文,`/zh/` 是中文。**英文 HTML 是唯一手写源**;
  `scripts/build-site-zh.mjs` 生成中文页,产物提交进 git。
  ⚠️ **改完英文页必须重跑 `node scripts/build-site-zh.mjs`**(忘了会被 vitest 抓到)。
- 隐私政策的中文是**权威版本、按中文写的**,存在 `scripts/site-zh-privacy.html`。
- **story 页有意没有中文版**(portfolio / 申请材料),所以该页**没有语言切换按钮**。
  这是 Ocean 2026-08-03 的选择,别自作主张加回去。
- 截图是**无损 WebP**(像素完全不变),每张包一层 `<picture>`,原 PNG 留作回退。
  ⚠️ `picture { display: block }` 是必须的,还有两条兄弟选择器跟着改了名 —— 动这块 CSS 前先看一眼。
- **advice 明确表扬、别在后续改版里弄丢的三样**:alt 文本质量、截图是真实界面不是
  渲染稿、主动声明「截图用的是演示库,无个人内容」。
- **中文文案的判据**:念出来不像翻译腔;不堆「它的」「们」「被」;长定语拆短句;
  英文的破折号插入语在中文里改成独立句。

### 5.5 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿之后(dmg 公证已确认,不再是卡点)。
4. ❌ 刷好评、假装用户安利:不做。

### 5.6 商标结论(动官网/README 提到客户端名字时必看)

2026-08-02 逐家查过官方页面:**六家没有一家可以直接把 logo 摆上我们官网**。
Visual Studio Code **明文禁止**用图标标识/推广自己的产品,且**禁止 `VS Code` 这类简写**;
Anthropic / OpenAI 要**事先书面批准**;Windsurf 要先问;Cursor 最宽松但也没明确许可。
**文字如实说「支持 Cursor」安全(指名性使用),贴 logo 不安全,把 logo 改成单色也不安全。**
完整来源清单在 `docs/DESIGN_MCP_ECOSYSTEM.md` §8,**会过期,下次动这块前重查**。

### 5.7 几条已核实、别再翻案的事实

- **「已签名公证」是真的,可以写**。Releases 上那份 dmg 拉下来实测:
  `xcrun stapler validate` → worked;`spctl -a -vv -t install` → accepted /
  `Notarized Developer ID` / `Hanze JIN (Q5Y5JRXZ58)`。
  (⚠️ **本机 `/Applications` 里现在装的是本地构建,没公证** —— 见 §5.3。
  这不影响官网那句话,官网说的是下载包。)
- ⚠️ **「macOS 12+」是 advice 编的,别写**。实测 `LSMinimumSystemVersion` 是 **10.13**。
  官网只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。
- 自动化测试实际是 **163 vitest + 19 cargo**(本窗数字)。官网没写数字,回避掉了。
- **本地签名凭据文件已结案**:Ocean 2026-08-02 批复「文件留在本机就行,`.gitignore` 挡住即可」。
  `docs/ID.txt` 已在 `.gitignore`,并核实**从未进过任何一次提交**。不撤销、不重发、不挪走,
  **更不许任何人擅自删他的文件**。

---

## 6. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。提交后自检:
   `git log -1 --pretty=%B | grep -iE 'co-authored-by|🤖|generated with|noreply@'` 必须为空。
   (⚠️ **别 grep `claude` / `anthropic`** —— 第三方品牌名属于产品内容,必然误报。)
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
   (⚠️ `cwebp` 是 `scripts/build-site-shots.sh` 的前置,本机 homebrew 已有,不是 npm 依赖。)
3. 真库动前备份;实机验证走隔离 identifier 流程;每次合成输入前重新定位窗口边界。
   ⚠️ `npm run tauri dev` 走真库路径,别为了看一眼文案就跑它。
4. i18n:**中文即键**;新 GUI 文案同步补 EN。**官网文案要大白话,中文是重写不是翻译**
   (判据见 §5.4)。⚠️ **改了 `site/index.html` 或 `site/privacy.html` 要重跑
   `node scripts/build-site-zh.mjs`**(忘了会被 vitest 抓到)。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   **重生后把无关的时间戳漂移还原**(本机 UTC+8,一次重生会平移 7 小时,产生 7 行无关 diff);
   动 schema 必须迁移注册表 + 双侧锁步常量(`EXPECTED_SCHEMA_VERSION` 现在是 **9**)+ 真库备份。
   > 💡 golden 两侧比较时都会把日期归一化成 `<DATE>`,所以还原时间戳纯粹是为了让 diff 干净
   > —— 这一窗就是这么做的,最后 diff 里只剩 `#n` 那一处真改动。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main **只在改了 `site/**` 时**才触发 `pages.yml` 部署官网(workflow 有 paths 过滤)。
8. **密钥永不上传**:Apple 专用密码这类凭据**可以留在本机文件里**(见 §5.7),
   但**绝不进 git、绝不进聊天、绝不进任何要发出去的文档**。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
   (`docs/webimproveadvice.txt` 一直是未跟踪状态,不是本窗产生的,别顺手提交它。)
10. **`t()` 的键对不上 tsc 抓不到** —— 会静默回落成中文,英文界面当场露出中文。
    改 i18n 之后跑一遍脚本核对:把 `src/lib/i18n/index.ts` 的键集合抽出来,
    比对所有 `t('…')` / `tr('…')` 字面量,以及 `UNDO_OP_LABEL` / PackDialog / useTrayMenu
    这类**把中文放进映射表再交给 t()** 的地方(正则扫不到调用点,要单独比对)。
    (这一窗跑过:309 个键,0 个对不上。)
11. **改了 Rust 的 MCP 代码,客户端不重启就还是旧程序。**
    `cargo build --release` → `scripts/seed-mcp-lab.sh` → **重启客户端**,三步缺一不可。
12. 🆕 **mcp.rs 里给用户看的新文案必须走 `t!` / `ts!`,两种语言一起写。**
    漏了不会报错,只会在英文界面下冒出一句中文。改完可以扫一遍:
    `grep -n '[一-龥]' src-tauri/src/mcp.rs | grep -v 't!(' | grep -v 'ts!('`
    —— 剩下的应该只有注释和 `t!` 的中文那一半。
