# 交接文档 — 2026-08-04 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**换装完成,真库已跑完 v8→v9 迁移;第二轮 MCP 评审三方(ChatGPT / Claude Desktop /
Claude Code)全部跑完,报出的问题当窗修了八条。**(2026-08-04)
**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 19 个提交,工作区干净
(`docs/MCP_feedback.md`、`docs/webimproveadvice.txt` 是未跟踪的资料文件,别顺手提交)。
基线全绿:`npx tsc -b` / `npx vitest run`(**163**)/ `cargo test`(**21**,+2)。

**👉 下一窗第一件事:读 §1 —— 有六条设计级问题在等 Ocean 拍板,不拍板就没法往下修。**

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | 🚩 **六条设计级问题请 Ocean 拍板**(全在 §3.1)—— 都是三方评审共同指向的同一件事:*现在的防线写在「给 AI 的嘱咐」里,不在数据结构里* | **等 Ocean 明示** |
| B | **D-1:add_block 检测到裸 id 就硬拒绝** —— 三份报告一致要求(GPT 列为「严重」)。可开工,不需要拍板 | 可开工。⚠️ 做完就把本窗给首行加的那句警告一并删掉,那三行会变成死代码 |
| C | 长期计划里挑一条开工 —— 第 2 条 Claude Code 引擎位**已批复可开工** | §4 表格 |
| D | **第三轮评审提示词重写**(`docs/MCP_LAB_PROMPT.md` 现在是第二轮的) | **建议等 A 拍完再写**,否则写完就过期 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §3.3 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

---

## 2. 这一窗做了什么

### 2.1 换装 + 真库迁移(Ocean 当窗明示)

`/Applications/Spool.app` 换成含本窗全部改动的构建,identifier `com.oceanjin.spool`、
Developer ID 签名(与旧版**同一身份**,所以输入监控/辅助功能权限没掉)。证据链:

| 检查 | 结果 |
|---|---|
| 换装前备份 | `spool.db.backup-20260804-175245-preinstall-v9`(v8 / 12 块 / integrity ok) |
| `PRAGMA user_version` | 8 → **9** |
| 块数 | 12 进 12 出 |
| `integrity_check` | ok |
| seq | 每个项目从 1 开始,连续 |
| app 自存的迁移前快照 | `spool.pre-migration-v8-2026-08-04T09-55-44-152Z.db` |

⚠️ **界面上那个 `#n` 这一眼没验到**:Spool 是托盘应用,启动后主窗不跳前
(`capture-note-first` 那条铁律),AX 里取不到 window 1。没去合成点击撬它。
数据库这一层是全的,要眼见为实,Ocean 自己点开主窗看一眼就行。

⚠️ 旧的 `/Applications/Spool.app` 挪进了会话临时目录,**那个目录会被清掉**。真要回滚,
按 §5.3 从 git 重建即可(旧构建不含本窗任何改动,没有保留价值)。

### 2.2 第二轮评审:三方跑完

- **ChatGPT / Claude Desktop 两份报告**:Ocean 已贴进 `docs/MCP_feedback.md`(未跟踪)。
- **Claude Code 那份**:开发窗自己跑的,结论并进下面的分诊表。
- ⚠️ **三个客户端当时在同一个实验室里并行跑**,互相看得见对方写的块;
  「机器学习课作业」的摘要在测试期间被改了三次。做数字比对时注意这点。

**回归 R1–R11 的三方分诊**(分歧已核实,以实测为准):

| # | 结论 | 说明 |
|---|---|---|
| R1 | 修对了 | 8000 → 真的部分 pack(7702 字);2000 → 拒绝并报下限 **4147**,照它说的传 4147 真拿到 pack,正好 4147 字。GPT 判「没修对」的理由是「没说省略 0 块」,与实测不符 |
| R2 | 修对了 | 表头 `5 of 16 blocks in this project`,三块置顶一个没少 |
| R3 | **没修对 → 本窗已修** | 见 §2.3 |
| R4 | 修对了 | `summary_source` 事先就能读出来,不必"先写→被拒" |
| R5 | **修出新问题 → 本窗已修** | 附件字数看得见,但首行说谎,见 §2.3 |
| R6 | 修对了 | 命中带 `source`,四类判得出。附件命中那一栏没有 `source`(GPT 提,属实,见 §3.1) |
| R7 | 修对了 | total=24,翻页正好翻到 24 条不重复。附件命中重复那条是另一个问题,本窗已修 |
| R8 | 修对了(`context` 除外 → 本窗已修) | -5→1、3.7→3、999→50、max_groups→30、since_days 999→近 90 天,全部回显 |
| R9 | 修对了一半 | 拒绝话术讲清了出路,但仍把 `thread_id` 写进错误正文(标了"仅供你当参数用")。**这条要 Ocean 拍板**,见 §3.1 |
| R10 | 修对了 | `〈菜谱〉还没有任何块。` |
| R11 | 修对了 | `窗口内 N 个项目有新块(库里共 M 个项目)` |

**N1/N2/N3(新东西)**:三个装配工具都能跑,材料与指令按 `# Pack` / `# 你要做的` 分区,
读得出来;无参数调 `thread_health` / `distill` 回项目清单 + 问用户要哪个,对话接得下去;
四个 prompt 在 Claude Code 里零必填参数,空参数进去回项目清单(另两个客户端看不到 prompts,已知)。

**一条 GPT 报的、经核实不是 bug**:它说全文 13304 而工具自己说 13294。差的 10 个字符是
📌 这类星区字符 —— Rust 数码点、JS 数 UTF-16 单元,`max_chars` 的说明里本来就写了这件事。

### 2.3 当窗修掉的八条(提交 `c5e6bae`、`29a63f1`)

| 修了什么 | 为什么它重要 |
|---|---|
| **`get_blocks` 带过滤时首行说谎** | 只取置顶时它说"这个项目共 3 块",项目实际 16 块。**本轮唯一一个会让 AI 主动对用户说错事实的地方**,而首行正是客户端最可能原样念出去的那句。三方里两方独立报了这条 |
| **`list_threads` 带 `title_contains` 时首行说谎** | 0 命中时说"库里 0 个项目",读起来像"你的库是空的" |
| **`approx_pack_chars` 偏低 → 静默丢块** | 聚合数了附件抽取正文,没数框住它的两行。说明让人拿它直接当 max_chars,照做就被截断而不自知。现在每个项目小幅**高估** 0.4%–1.7%,方向安全 |
| **`search_blocks` 的说明和实现相反** | 说明还写着"附件正文没有被索引",而它此刻正在返回 `attachment_hits`。照说明读,AI 会主动告诉用户"PDF 搜不到",白丢一个已经做好的能力 |
| **附件命中每页重复** | 越界的 offset=100 都还在给。翻十二页就把同一条 PDF 命中数十二遍。现在只随第一页给 |
| **`range=pinned` 的表头说错话** | 写"其余的块比这个窗口更老";pinned 不是时间窗,那 13 块是没置顶。这句是给下一个 AI 读的 |
| **`context` 被钳不回显** | 唯一一个只能靠 `limit: 49` 反推的参数 |
| **两处小的** | `add_block` 触发裸 id 警告时首行仍是一句干净的成功;`set_thread_summary` 首行不说是哪个项目。超长 query 不再整条抄进首行 |

**补的测试**:人话首行此前**没有任何测试盯着**(这正是它能说错话的原因);
`approx_pack_chars` 补的是「估值不得低于真实 pack 长度」这个**性质**,不是又一个魔数。

⚠️ **`range=pinned` 那句两侧锁步改了**(`src/lib/pack/templates.ts` + `mcp.rs`)。
golden 用的是不带 range 的表头,所以**没有触发 golden 重生**。

### 2.4 实验室现在是什么状态

⚠️ **实验室里跑的还是修复前的程序**,而且库里有三轮评审留下的写入(含两条故意的裸 id 块)。
下一轮测之前必须走完三步(硬规则 11):

```
cd ~/Desktop/Knote/src-tauri && cargo build --release
cd ~/Desktop/Knote && ./scripts/seed-mcp-lab.sh
# 然后重启客户端(VS Code 里就是 ⌘⇧P → Reload Window)
```

本窗**故意没有重播实验室** —— 当时另外两个客户端的评审会话还在跑,重播会把他们的现场
和会话一起冲掉。验证改动用的是"另起一份数据副本 + `SPOOL_DATA_DIR` 指向它"的办法,
一次都没碰共享实验室。这个手法很省事,推荐复用。

---

## 3. 还没还的旧账

### 3.1 🚩 六条要 Ocean 拍板的(三方评审共同指向)

三份报告的落点高度一致,一句话概括:**规矩写在"给 AI 的话"里,没写进数据结构。**
只要 AI 听话就一切正常;有一次不听话、或者单纯手滑,就没有第二道闸。

1. **D-1 硬拒绝裸 id**(§1 的 B)—— 已批可开工,列在这里只是提醒它和下面几条同源。
2. **AI 写坏的块没有任何回收路径**。Claude Desktop 那轮自己写坏了一块(客户端把
   `annotation` 参数灌进了正文),当场知道写坏了却什么都做不了;`check_library` 也检不出这种
   结构性垃圾。它要的是「撤回我自己刚写的块」(限 AI 署名 + 短时间窗)或 `add_block` 的
   `dry_run`。**两者都不违反"AI 绝不改用户写下的字"**,但要 Ocean 定边界。
3. **报错正文里回显裸 id**。`create_thread` 重名、`get_pack` 传错 id 都会。
   现在的做法是给 id 并注明"仅供你当参数用" —— 但错误信息恰恰是最容易被原样念给用户的东西。
   要么去掉,要么承认这是可接受的残余风险。
4. **`distill` 强制打开 `include_ids`**,把一张 id 表塞进 pack 正文,而 pack 的定位是
   "用户原样粘给别的 AI 的东西"。建议:id 表放到 pack **外面**(指令段里)。
5. **pack 里印着用户电脑的绝对路径**(`/Users/hzjin/Library/…/lecture-03.pdf`)。
   "不出网"是 Spool 自己不出网,而 pack 是**设计上就要出去**的东西。
   建议 pack 只写文件名,`get_blocks` 的 JSON 里保留完整路径。
6. **材料和指令之间没有机器能认的界**。三个装配工具靠 `# Pack` / `# 你要做的` 这种
   同级 markdown 标题分隔。块的正文是用户从网上抓来的 —— 哪天有一块正文里出现一行
   `# 你要做的`,它会原样进 pack、进 digest。这是"能不能被库里的内容骗着做不该做的事"的
   答案:**能,门槛不高**。短期解:给指令段一个不可能出现在用户正文里的定界符,
   拼装时把用户正文里的同形标记转义掉。

**另外三条较轻的**(不拍板也能修,排在上面之后):
`list_threads` 补 `last_block_at`(现在 AI 写一条摘要就能把项目顶到"最近活跃"第一位);
附件命中那一栏没有 `source`(判不了权威类别);
pack 里跨项目的 `↩ cites:` 不标项目名(读的人会以为被引的块就在同一个项目里)。

### 3.2 三方都提到的「缺什么功能」(产品向,不是 bug)

去重后按被提及次数排:

1. **写之前先给用户看一眼**("存到哪里、正文是什么、依据是哪块",点头才落地)—— 三方都提
2. **AI 到底往我库里写了什么** —— app 里一个"AI 最近写入"的列表,能跳过去就地改
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 库里就躺着他自己写的"待办:把那三条重复的合并掉",
   从 08-01 拖到今天。缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间,过期与否你自己判断"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看

### 3.3 🚩 截图现在是旧术语了(四窗未还)

术语从「脉络/thread」改成「项目/project」之后,**官网上所有 app 截图里的文案都成了旧版**。
最明显的一处:MCP 段那张图里 AI 回的是 "…or open a specific **thread**?"。

这条**并进 §1 的 F**(截图整体替换),不要单独开一轮:
- Ocean 2026-08-02 已批:重建隔离演示环境作展示,**截图做完整替换**,
  **整件事安排在 app 代码全部做完之后,和录演示视频一起做**。
- 同时要修的老问题:step 02 主截图、day1/week6 增长图、OG 分享卡、交互演示
  (`site/assets/demo.js` 的 EN+ZH 两套脚本)讲的都是 "Job search / 找工作",
  而首页白纸黑字写着「找工作这类短期事务不是主攻对象」——**文案和图片在互相拆台**。
- 怎么修:演示库里现成就有 `Machine learning course`(Study 工作区)和 `Portfolio site`。
  脚本 `scripts/seed-growth-demo.sh day1|week6` 现在写死的是找工作的内容,要改。
- 🆕 **重拍时注意:块上现在多了 `#12` 这个新视觉元素**。
- ⚠️ **换完截图记得重跑 `scripts/build-site-shots.sh`**,再把它打印的 srcset 贴回 HTML。

### 3.4 其余旧账

- `site/assets/shots/mcp-ask.png` 没有任何页面引用。本来就是死文件,要删得 Ocean 点头。
- 没有 sitemap.xml、没有 robots.txt。没人提过,不确定要不要。
  (中文页 alt / `<noscript>` 已由 Ocean 2026-08-03 拍板**不写**,销案。)
- **App 自己的搜索框仍搜不到附件正文**。MCP 侧已经能搜(v9),app 侧要改就得动
  `SearchField` 类型、片段渲染、块内 `<mark>` 跳转那一整条链,是另一件事。
- `docs/MCP_LAB_PROMPT.md` 是第二轮的,见 §1 的 D。

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | ✅ **已实现,第二轮三方评审已验**。剩下的问题在 §3.1 的第 4、6 条 | 原设计 `docs/DESIGN_NEXT_STAGE.md` §4.2(⚠️「斜杠菜单即发现面」的前提已被实测推翻) |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手 | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工。**三方评审又要到了这条**(见 §3.2 第 2 项) | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工。三份实机报告独立要到了这条(`source_contains` 表达不了「source 为空」) | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 7 | **MCP 零摩擦使用引导** | ✅ **2026-08-04 全部落地**(四个决定),设计稿已删。第二轮评审对 Z1–Z4 的回答见 `docs/MCP_feedback.md` | 实现见上一版交接 §2.3 |
| 8 | **schema v9 那一轮**:块的可见编号(H-1)+ PDF 正文能被搜到(H-3) | ✅ **2026-08-04 落地,真库已迁移**(本窗)。app 搜索框那半截见 §3.4 | 实现见上一版交接 §2.1 |
| 9 | 🆕 **D-1:add_block 硬拒绝裸 id** + **D-2:拿库内真实 id 建索引做精确比对** | **可开工,不需要拍板**。三份报告一致要求,GPT 列为「严重」 | 见 §1 的 B |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md` |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」,但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新、语义检索(本地 embedding 太重 / 云端撞「零出网」)、
AI 的删除/撤回/编辑接口(append-only 是宪法级承诺 —— ⚠️ §3.1 第 2 条要的是
「回收 AI 自己刚写的」,和这条不是一回事,别混为一谈)。

---

## 5. 环境与现状

### 5.1 真库与备份

- 真库:`~/Library/Application Support/com.oceanjin.spool/spool.db`,**现在是 schema v9**。
- 本窗备份:`spool.db.backup-20260804-175245-preinstall-v9`(换装前,`sqlite3 .backup`,已核对)。
  更早两份:`spool.db.backup-20260804-141006-preschema-v9`、`spool.db.backup-20260803-215543-preinstall`。
- app 自己在迁移前又存了一份:`spool.pre-migration-v8-2026-08-04T09-55-44-152Z.db`。

### 5.2 隔离验证环境

- **MCP 实验室**:`scripts/seed-mcp-lab.sh`
  (`~/Library/Application Support/com.oceanjin.spool.lab/`)。**当前是旧程序 + 三轮评审写脏的数据**,
  下一轮测之前必须重建,见 §2.4。
  - ⚠️ **别把它挪进桌面/文稿/下载** —— 那三个是 TCC 保护目录,Claude Desktop 没被授权时
    连启动脚本都 exec 不了(`Operation not permitted` + 一连上就断,2026-08-03 实测踩过)。
  - ⚠️ 它走的是**另一条隔离路线** —— `SPOOL_DATA_DIR` + 二进制副本,**不改 identifier、
    不装 app、不碰 GUI**。
  - 🆕 **只想验一处改动、又不想惊动别人的会话**:把 `…/spool.lab/data` 整份复制到临时目录,
    用 `SPOOL_DATA_DIR=<副本> target/release/spool --mcp` 直接喂 JSON-RPC。本窗就是这么验的。
- **验证构建**:`src-tauri/target/release/bundle/macos/Spool.app`。⚠️ 它现在是
  `com.oceanjin.spool` + Developer ID 签名(本窗换装用的就是它),**不是 verify 构建**。
  要做隔离验证,得改 identifier 重建 —— 改完**立刻**建、建完**立刻**改回来。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目,默认播 `language:"en"`)、
  `scripts/seed-growth-demo.sh day1|week6`。两个都**只写 verify 数据目录**,真库不碰。
- ⚠️ **首启验证专用 id `.fr1` / `.fr2` / `.fr3` 全都用掉了**。再验「启动不弹框」**必须换 `.fr4`**。
- ⚠️ **窗口重叠**:`.fr3` 的窗口和新建 verify 构建**默认同坐标**(350,119 · 1100x720),
  很容易拍错窗口并误判「改动没生效」。完整规程在 memory `isolated-verify-workflow` §10。

### 5.3 换装:`/Applications/Spool.app`

本窗刚做过一次(§2.1)。再来一次照抄:

1. **先备份真库**(硬规则 3)。
2. ⚠️ **`target/release/bundle` 里那个构建的 identifier 可能是 `com.oceanjin.spool.verify`,
   绝不能直接装** —— 装上去会指向 verify 数据目录,看起来就像「数据全没了」。装之前
   `PlistBuddy -c 'Print :CFBundleIdentifier'` 核一眼。
3. ⚠️ **必须用 Developer ID 签,不能用默认的 `Spool Dev`。** 换签名身份 = macOS 认成另一个
   app = 已授的输入监控/辅助功能权限当场失效,双击 ⌥ 捕捉会停摆。装之前把新旧两边的
   `codesign -dvv` 比一遍(本窗就是这么确认的)。用环境变量覆盖,不改文件:

   ```
   APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)" \
     npm run tauri build -- --bundles app
   ```
4. 🆕 **`osascript -e 'tell application "Spool" to quit'` 带不走它** —— 托盘应用。
   换完要杀掉旧的主进程和 `--overlay` 进程,再 `open -a`。
5. 本地构建**没有公证**,但本地构建的文件没有 quarantine 属性,Gatekeeper 不拦。
   (对外发 Release 仍要走公证,见 memory `distribution-route-notarized-dmg`。)

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
  ⚠️ `picture { display: block }` 是必须的,还有两条兄弟选择器跟着改了名。
- **advice 明确表扬、别在后续改版里弄丢的三样**:alt 文本质量、截图是真实界面不是
  渲染稿、主动声明「截图用的是演示库,无个人内容」。
- **中文文案的判据**:念出来不像翻译腔;不堆「它的」「们」「被」;长定语拆短句;
  英文的破折号插入语在中文里改成独立句。

### 5.5 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿之后。
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
  (⚠️ **本机 `/Applications` 里装的是本地构建,没公证** —— 见 §5.3。
  这不影响官网那句话,官网说的是下载包。)
- ⚠️ **「macOS 12+」是 advice 编的,别写**。实测 `LSMinimumSystemVersion` 是 **10.13**。
  官网只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。
- 自动化测试实际是 **163 vitest + 21 cargo**(本窗数字)。官网没写数字,回避掉了。
- **本地签名凭据文件已结案**:Ocean 2026-08-02 批复「文件留在本机就行,`.gitignore` 挡住即可」。
  `docs/ID.txt` 已在 `.gitignore`,并核实**从未进过任何一次提交**。不撤销、不重发、不挪走,
  **更不许任何人擅自删他的文件**。
- 🆕 **`max_chars` 是按 Unicode 码点算的**,JS 的 `.length` 数同一段文本会更大
  (📌 这类星区字符每个多算 1)。第二轮有报告把这 10 个字符的差当成 bug 报了,不是。

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
   **重生后把无关的时间戳漂移还原**(本机 UTC+8,一次重生会平移 7 小时);
   动 schema 必须迁移注册表 + 双侧锁步常量(`EXPECTED_SCHEMA_VERSION` 现在是 **9**)+ 真库备份。
   > 💡 本窗改了 `templates.ts` 的 range 表头但**没有触发重生** —— golden 用的是不带 range
   > 的表头。改之前先 grep 一下 golden 里有没有那句话,能省一整套重生流程。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main **只在改了 `site/**` 时**才触发 `pages.yml` 部署官网(workflow 有 paths 过滤)。
8. **密钥永不上传**:Apple 专用密码这类凭据**可以留在本机文件里**(见 §5.7),
   但**绝不进 git、绝不进聊天、绝不进任何要发出去的文档**。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
   (`docs/webimproveadvice.txt` 和 `docs/MCP_feedback.md` 一直是未跟踪状态,别顺手提交。)
10. **`t()` 的键对不上 tsc 抓不到** —— 会静默回落成中文,英文界面当场露出中文。
    改 i18n 之后跑一遍脚本核对:把 `src/lib/i18n/index.ts` 的键集合抽出来,
    比对所有 `t('…')` / `tr('…')` 字面量,以及 `UNDO_OP_LABEL` / PackDialog / useTrayMenu
    这类**把中文放进映射表再交给 t()** 的地方(正则扫不到调用点,要单独比对)。
11. **改了 Rust 的 MCP 代码,客户端不重启就还是旧程序。**
    `cargo build --release` → `scripts/seed-mcp-lab.sh` → **重启客户端**,三步缺一不可。
    ⚠️ 重播实验室会冲掉别人正在跑的评审会话 —— 别人在测的时候,改用 §5.2 的数据副本办法。
12. **mcp.rs 里给用户看的新文案必须走 `t!` / `ts!`,两种语言一起写。**
    漏了不会报错,只会在英文界面下冒出一句中文。改完可以扫一遍:
    `grep -n '[一-龥]' src-tauri/src/mcp.rs | grep -v 't!(' | grep -v 'ts!('`
    —— 剩下的应该只有注释和 `t!` 的中文那一半。
13. 🆕 **给人看的那一行(`human_headline`)是独立的事实来源,会和数据对不上。**
    本轮三条谎话全出在这里。加或改这一行,**必须同时加断言**:
    `mcp::tests::headlines_never_pass_a_filtered_count_off_as_the_total`。
