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

**实机评审的 B 组十一条全部修完;H-2(工具化)、H-6(必填参数)按批复做完;
两者都已在 Claude Code 客户端里实机验过(§2.4);
H-5 与 H-1+H-3 出了设计稿等 Ocean 拍板;第二轮评审提示词已重写。**(2026-08-04)
**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 13 个提交,工作区干净。
基线全绿:`npx tsc -b` / `npx vitest run`(**161**,+1)/ `cargo test`(**18**,+1)。
真库这一窗**一个字都没动**(MCP 实验室走 `SPOOL_DATA_DIR`,和真库物理隔离)。

**👉 下一窗第一件事:读 §1。MCP 这一轮的代码活已经干完并验完了,
剩下的全部卡在「等 Ocean 批两份设计稿」上。** 他没批之前别自己开工那两条(硬规则 6)。

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | 🚩 **`docs/DESIGN_MCP_ZERO_FRICTION.md`**(H-5 零摩擦引导)—— 四个决定,Ocean 拍完就能开工 | 等批复(硬规则 6) |
| B | 🚩 **`docs/DESIGN_SCHEMA_V9.md`**(H-1 可见编号 + H-3 PDF 全文搜索)—— 两个决定,两条必须并成一次迁移 | 等批复。⚠️ 动 schema 前备份真库 |
| C | 第二轮实机评审(Claude Desktop + ChatGPT)| 提示词已备好在 `docs/MCP_LAB_PROMPT.md`,等 Ocean 有空跑 |
| D | 长期计划里挑一条开工 —— 第 2 条 Claude Code 引擎位**已批复可开工**,是唯一一条不用再拍板的 | §4 表格 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §3.1 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

---

## 2. 这一窗做了什么(后来人会问的)

### 2.1 B 组十一条 —— 提交 `25795e0`

上一窗分诊出「确认为真、在主路径上、不需要拍板」的十一条,一次修完。**主犯是 B-1**:

- **B-1**:一个置顶块挂着 7800 字的附件抽取正文,而**附件正文在 pack 里完全不受预算约束**
  —— 骨架 + 全部置顶就已经过线,`budgeted_pack` 直接放弃,`max_chars=8000` 只回一句
  「超了」(140 字)。而且那句话推荐 `range=pinned`,照做会**一模一样地再失败一次**
  (置顶本身就是下限)。
  **改法**:附件正文成为**第二个预算维度**。先丢最旧的时间线块(原有逻辑),
  还装不下才逐级压附件正文(8000→2000→500→120),每一刀都在原地写明
  (`[... truncated, N more chars not shown ...]`),并在 pack 顶部加一行 `Budget note:`。
  实在装不下时的那句话改成:「下限是 4137 字符,把 max_chars 提到 4137 以上,
  或者用 get_blocks 分页——它不受这个预算约束」。
- **B-2**:`range=last7/last30` 把置顶块整个丢掉。置顶在别处一律是「永不删」
  (超预算裁剪的最高档),同一个概念两处相反。**TS 侧同步改了**(PackDialog 也吃这条)。
- **B-3**:range 模式下 pack 表头写「3 blocks total」,别的 AI 会以为这个项目总共 3 块。
  现在写「3 of 17 blocks in this project (range: last7 …)」。
  ⚠️ **`range=all` 一个字节都没变,所以 golden 没重生**(比原计划省了一轮)。
- **B-4**:`approx_pack_chars` 少算骨架和每块的脚手架,实测低估约 47%。现在骨架是
  **量出来的**(空 pack 即骨架,`pack_skeleton_chars()` 用 OnceLock 算一次),
  每块的时间戳/来源/置顶占位行也计入。实测 12979 vs 真值 13229 —— 低 2%。
- **B-5**:`get_blocks` 完全不暴露附件,而超预算时恰恰建议走它。现在每块带附件清单
  和 `extracted_chars`,`include_extracted_text=true` 才内联正文(默认 false:
  一份讲义 8000 字会把每一页都撑爆)。
- **B-6**:`search_blocks` 命中里加 `source` + `pinned`(授权四类全靠 source 判定)。
- **B-7**:`search_blocks` 加 `offset`。
- **B-8**:`list_threads` 加 `summary_source`(`user`/`mcp`/`null`),**按写入守卫的口径归一化**
  —— 有摘要且不是 `mcp` 就是 `user`(老行是 NULL)。
- **B-9**:数值参数小数直接当没传过。现在小数/字符串都收(截断取整),
  并回显 effective 值(`offset`/`limit`/`max_groups`;digest 头部加了预算)。
- **B-10**:`create_thread` 允许同工作区同名且零提示 —— 而 Spool 没有删除接口,
  建重了永远留着,标题又是唯一能对用户称呼项目的东西。**改为拒绝**并指出已有那个。
  (提交 `9733c45` 把拒绝话术里的 id 标成「仅供你当参数用,别说给用户听」。)
- **B-11**:digest 的「共 11 条在库」其实是 11 **个项目**;空项目提示不带项目名;
  instructions 里「truncated pointers」说得不准;半角/全角混排。

**两条假问题没动**(上一窗已实测证伪):check_library 的摘要扫描没错(是种子数据造错了,
上一窗已修);find_similar 和 check_library 数字对不上是时间差造成的错觉。

### 2.2 H-2 工具化 + H-6 必填参数 —— 提交 `37ce47a`

- **H-2(已批复)**:`weekly_review` / `thread_health` / `distill` **各多挂一个工具调用面**。
  prompts 在两个主力客户端根本不暴露,只做成 prompt 等于没做。
  两个面共用一个装配函数 **`guidance_text()`**,不会各长各的。
  工具描述里写清了「返回的是材料 + 给你的指令,照着做,别整段贴给用户」。
  **工具总数从 10 变 13。**
- **H-6(已查准)**:`distill` / `thread_health` 的 `project` 声明成 `required: true`,
  **Claude Code 在客户端侧就拦下了**,请求根本发不到服务器。
  现在**四个 prompt 一个必填参数都没有**;不给项目时不报错,回的是现有项目清单 +
  一句「问用户要哪一个,他答完你直接拿标题再调一次」。菜单点一下就有反应。
  `compress_pack` 的 `thread_id` 一并改,并且 `project` / `thread_id` 两个名字**互相都认**。

### 2.3 两份待批设计稿 —— 提交 `49cd992`

硬规则 6:设计类任务先出方案。**这两份都没动代码。**

- **`docs/DESIGN_MCP_ZERO_FRICTION.md`**(H-5)。四个决定。
  ⚠️ 里面有个真问题要 Ocean 知道:「工具返回第一行说人话」这条,
  **`get_pack` 的返回是用户要原样粘给别的 AI 的东西**,前面加一行就多了一行不属于 pack
  的话 —— 给了三个选项,我建议「除 get_pack 外都加」。
  另外说明:H-2 和 H-6 落地之后,他三条要求里的 ③ 已经解决了一半。
- **`docs/DESIGN_SCHEMA_V9.md`**(H-1 + H-3)。两个决定。
  H-1 的**便宜路线(时间戳当编号)解不掉重复块那个真问题** —— 同一分钟捕捉进来的两块
  时间戳一样,而重复块本来就常常是同一批进来的,正好在最需要区分的场合失效。
  所以建议走正路(落库的 `seq`)。也写明了顺序:**可见编号必须排在「写入硬拒裸 id」(D-1)之前**。

### 2.4 实机验证 —— **两层都过了,这条已收尾**

**第一层:真 stdio**(和客户端 spawn 的是同一个启动脚本、同一份程序、同一套环境):

| 项 | 结果 |
|---|---|
| `max_chars=8000` | 拿到 **7637 字符的部分 pack**(旧版:140 字的"超了")。附件正文压到 2000 字 |
| `max_chars=2000` | 拒绝,并告知下限 4137、该怎么办 |
| `range=last7` 表头 | 「5 of 16 blocks in this project (range: last7 …)」,3 块置顶全在 |
| `approx_pack_chars` | 12979 vs 真值 13229 |
| `summary_source` | 「找工作」= user、「机器学习课」= null |
| 附件暴露 | `extracted_chars: 7800`、`extraction_kind: "pdf"` |
| 小数/负数/offset | 3.7→3、-5→1、offset 能翻完 total 23 |
| 同名项目 | 拒绝,并说清该怎么办 |
| 三个新工具 + 无参数 | 全部回得来;无参数回项目清单 |
| 歧义 | 「机器学习」→ 列出两个候选 |
| 空项目 | 「〈菜谱〉还没有任何块。」 |

**第二层:Claude Code 客户端里真点了一遍**(Ocean 2026-08-04 重启 VS Code 之后):

| 验什么 | 结果 |
|---|---|
| **H-6** `/mcp__spool_lab__distill` 什么都不填 | ✅ 不再报 `Missing required argument`,回项目清单 + 问用户要哪个 |
| **B-1** `max_chars=8000` | ✅ 拿到真 pack;`Budget note` 那行在;附件正文压到 2000 字并原地标了「还有 5800 字没显示」 |
| **H-2** 三个新工具 | ✅ `thread_health` / `distill` / `weekly_review` 都在工具列表里,直接调得动 |
| **H-2 语义** 材料 vs 指令分得清 | ✅ `# 体检报告` 和 `# 你要做的` 两段边界清楚,模型不会把指令当内容贴给用户 |
| 写入开关自报 | ✅ 报告末尾带「写入已开启:用户点头之后才调用」 |
| 检测器在真实数据上 | ✅ 重复(相似度 1.0 那两条正则化笔记)、悬空引用、两处裸 id 都抓到,并写明各自指向哪里 |

**为什么必须分两层验**:真 stdio 验不了 **Claude Code 客户端侧的必填参数拦截** ——
H-6 那条 bug 就发生在客户端,请求根本没发到服务器,服务器侧怎么测都测不出来。
而客户端要连上新程序**必须重启**(见硬规则 11)。

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
#    期望:它自己调 mcp__spool_lab__thread_health,不用点任何菜单
#
# 5. 核对预算:「用 spool_lab 读机器学习课的 pack,max_chars 传 8000」
#    期望:拿到一份真 pack(7600 字左右),不是一句"超了"
```

⚠️ **`~/.claude.json` 是 Claude Code 自己的状态文件,它可能在退出时回写** ——
重启之后复查一眼 `spool_lab` 还在不在。(这一次实测:重启后还在,没被回写掉。)

### 2.5 第二轮评审提示词 —— 提交 `c16cd20`

`docs/MCP_LAB_PROMPT.md` **整份重写**,不是换个日期:

- 开头列「**已经知道并且已经决定了的,别再报**」六条。上一轮两份报告有一半篇幅
  撞在同样几条上。
- 必跑清单拆四部分:**R1–R11 是回归**(这一轮修的十一条,每条要 AI 给出
  「修对/没修对/修出新问题」+ 复现参数);**N1–N3 是新东西**(三个新工具、无参数行为);
  C 是常规读写快速过。
- **新增 Z1–Z4**,直接问零摩擦那三条要求 —— 这一节是 `DESIGN_MCP_ZERO_FRICTION.md`
  待批的直接输入。ChatGPT 那份还多问一句:**你到底有没有读到 initialize instructions**
  (如果没有,那把用法写在那里就是白写)。
- 补了一张「**本轮对答案速查**」(实测数值),用来当场判报告真假。
- 文末 §5 写明 Claude Code 是**开发窗自己的回归自测台**,不是找茬评审。

---

## 3. 还没还的旧账

### 3.1 🚩 截图现在是旧术语了(两窗未还)

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
- ⚠️ **换完截图记得重跑 `scripts/build-site-shots.sh`**,再把它打印的 srcset 贴回 HTML。

### 3.2 教程种子里的 MCP 说明过时

还停在「一键接入 Claude Desktop / Cursor」,实际支持六个。
Ocean 说这句「预留到以后和其他教程修订一起做」。
**`DESIGN_MCP_ZERO_FRICTION.md` 的决定 4 就是这条**,批了就顺手改掉。

### 3.3 `site/assets/shots/mcp-ask.png` 没有任何页面引用

本来就是死文件(CLAUDE.md §3:不擅自删预先存在的死代码)。要删得 Ocean 点头。

### 3.4 网页工程债

没有 sitemap.xml、没有 robots.txt。没人提过,不确定要不要。
(中文页 alt / `<noscript>` 已由 Ocean 2026-08-03 拍板**不写**,这条销案,别再提。)

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | **已实现,已按实机反馈修过一轮,并已在 Claude Code 客户端里验过**(2026-08-04:三个同时做成工具,必填参数取消)。等第二轮评审报告 | 实现见 §2.1–2.2,验证见 §2.4;原设计 `docs/DESIGN_NEXT_STAGE.md` §4.2(⚠️ 其中「斜杠菜单即发现面」的前提已被实测推翻,见第 7 条) |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手 | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工。两份实机报告独立要到了这条(`source_contains` 表达不了「source 为空」) | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 7 | **MCP 零摩擦使用引导**:不许用户零散拼凑用法、不许用户自己问「spool 能干什么」、不许用户不知道 AI 在调什么工具 | **设计稿已出,等 Ocean 批**。起因:实测主力客户端都不暴露 prompts,§4.2「斜杠菜单即发现面」的前提不成立 | `docs/DESIGN_MCP_ZERO_FRICTION.md` |
| 8 | 🆕 **schema v9 那一轮**:块的可见编号(H-1)+ PDF 正文能被搜到(H-3)。两条必须并成一次迁移 | **设计稿已出,等 Ocean 批**。⚠️ 动手前备份真库 | `docs/DESIGN_SCHEMA_V9.md` |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md` |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」,但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新、语义检索(本地 embedding 太重 / 云端撞「零出网」)、
AI 的删除/撤回/编辑接口(append-only 是宪法级承诺)。

---

## 5. 环境与现状

### 5.1 真库与备份

- 真库:`~/Library/Application Support/com.oceanjin.spool/spool.db`
- 最近一次备份:同目录 `spool.db.backup-20260803-215543-preinstall`(08-03 换装前)。
  **这一窗没动过真库,也没做 schema 迁移**(`1823ab5` 之后 schema 没动过,仍是 v8)。
- ⚠️ 一旦开工 §4 第 8 条(schema v9),**动手前先备份**(硬规则 3、
  memory `spool-db-wipe-incident`)。

### 5.2 隔离验证环境

- **MCP 实验室**:`scripts/seed-mcp-lab.sh`
  (`~/Library/Application Support/com.oceanjin.spool.lab/`)。**这一窗末尾是最新程序。**
  - ⚠️ **别把它挪进桌面/文稿/下载** —— 那三个是 TCC 保护目录,Claude Desktop 没被授权时
    连启动脚本都 exec 不了(`Operation not permitted` + 一连上就断,2026-08-03 实测踩过)。
  - ⚠️ 它走的是**另一条隔离路线** —— `SPOOL_DATA_DIR` + 二进制副本,**不改 identifier、
    不装 app、不碰 GUI**。只验 MCP 面时用它,比重建 verify 构建轻得多。
  - ⚠️ **改了 Rust 就必须 `cargo build --release` + 重跑本脚本 + 重启客户端**,
    否则客户端连的还是旧程序(§2.4 就栽在这一步上)。
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

### 5.3 换装:`/Applications/Spool.app` 现在是 main 的本地构建

08-03 换的,做法照抄:

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
- 自动化测试实际是 **161 vitest + 18 cargo**(本窗数字)。官网没写数字,回避掉了。
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
   动 schema 必须迁移注册表 + 双侧锁步常量(`EXPECTED_SCHEMA_VERSION` 现在是 **8**)+ 真库备份。
   > 💡 这一窗改表头(B-3)时用了个省事的办法:**让新写法只在 range≠all 时出现**,
   > `range=all` 一个字节没变,golden 就不用重生。以后动 pack 渲染可以照这个思路想一想。
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
11. 🆕 **改了 Rust 的 MCP 代码,客户端不重启就还是旧程序。**
    `cargo build --release` → `scripts/seed-mcp-lab.sh` → **重启客户端**,三步缺一不可。
    这一窗差点把「客户端里没验到」当成「改了没生效」。
