# 交接文档 — 2026-08-09(给下一个窗口:**先问一句,再开工**)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`、`claude-code-effort-unavailable`、`chatgpt-mcp-forensics`、
> `mcp-tool-annotations-required`、`gemini-free-tier-closed`)。
> 完成后删除本文件。
> ⚠️ **日期标签的一处漂移,别再传下去**:上几窗把自己的工作标成了「08-12 / 08-13」,
> 但那些提交(`7e6ee68` … `a98da0d`)**真实落库日期都是 2026-08-09**(`git log --date=iso`)。
> 本窗一律用真实日期 **2026-08-09**;文中出现的 08-12 / 08-13 是上几窗自己写的标签,**没有回改**。
> ✅ **台账那边 Ocean 拍了「破例改对」(2026-08-09)** —— `CASE_STUDY_LEDGER.md` 里
> **13 处日期已经按 git 改正**(不止我一开始说的两处:漂移从 §3.8 一直到 §3.14,
> 连 v0.4.0 的发布日期都晚了两天)。改的依据、改了哪些、以及连带修掉的一句
> 「three weeks later」,写在台账开头那段**破例声明**里。
> ⚠️ **那是一次性授权,不是把「只增不改」这条规矩废了。** 下次数字变了还是加新行。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。
> ⚠️ **⭐ 失败与修复不要只写在这里。** 这份文件规定要删,而它是 case-study 最值钱的素材来源。
> **新出的每一条,顺手往 `CASE_STUDY_LEDGER.md` §3 追加一条** ——那份台账只增不改
> (规矩在 `DESIGN_CASE_STUDY` §6.3)。

---

## 0. 一句话状态 + ⭐ 下一窗直接从这里开工

**08-09 这一窗:Ocean 点名的四件一次做完了 —— 项目文件库三期、「AI 可读」开关、
把整场对话分流进项目(选项 A)、MCP 读 follow up brief + 建议改。
schema **v17 → v19**,工具面 **14 → 17**,四条基线全绿,实机 stdio 也跑通了。**

✅ **他当天授权之后已经装机了(15:57)。⚠️ 还没提交、没推送 —— 那要他再点一次头。**

| 摊 | 代码 | 装到 `/Applications` 了吗 |
|---|---|---|
| 项目文件库三期(`request_file_access`,schema v18) | ✅ | ✅ **装了** |
| 「AI 可读」开关(右侧栏 ✓) | ✅ | ✅ |
| 分流「把整场对话分流进项目」(选项 A) | ✅ | ✅ |
| MCP 读 follow up brief + 建议改(schema v19) | ✅ | ✅ |

**装机核对过的**:真库 `PRAGMA user_version` **17 → 19**,`integrity_check` ok,
**34 块 / 7 行项目(2 个还活着)/ 3 个工作区一个没变**,`attachments` 仍是 0 行,
两张新东西都是空的(`file_access_requests` 0 行、没有任何 brief 建议)。
三个旁证齐:CPU 稳定 0.0%、`spool.db-wal`/`-shm` 当场重建、进程起来了。
装完又拿**装好的那个二进制**对着真库跑了一次 `tools/list` = **17 个**、`list_threads` 正常。

备份两份:`~/Desktop/spool-snapshot-20260809-155614-pre-v19.db`(我做的,v17/34 块,验过)
和 app 自己写的 `spool.pre-migration-v17-2026-08-09T07-57-53-212Z.db`。

### 0.0 ⭐⭐ 开工顺序

| 序 | 做什么 | 备注 |
|---|---|---|
| **1** | ⚠️ **确认他重开过 AI 客户端了** | 装完那一刻还在跑的两个 `--mcp` 子进程是老二进制(EXPECTED 17),库已经是 19,它们会明确报错。**已经用大白话告诉过他**,但**从这边验证不了**(§3) |
| **2** | ⚠️ **问他提交/推送** | 这一窗的改动还躺在工作区里。⚠️ 推送每次都要单独问(§6.6) |
| **3** | ⚠️ **请他看四处新东西** | ①待审面上那两种新卡片长什么样(§1.1 / §1.4)②右侧栏「项目文件」里那个 ✓(§1.2)③他在 ChatGPT 里按提示词跑四件(提示词在 §7)④待审面原文那一栏右上角新的「N 字」 |
| **4** | 挑一件开工 | §0.1 那张表 |

### 0.1 以上之后,顺序未定,都已拍板可开工

| 事情 | 全稿 |
|---|---|
| ⭐⭐ **MCP 意图路由(08-09 晚新开)** —— Ocean 在 ChatGPT 里真跑了那四件,**机制全对,但三件里两件模型根本没走到**。全稿 `DESIGN_MCP_INTENT_ROUTING.md`,**三题已全部拍板(都选乙)**,§7 有开工顺序和五句话验收 | `DESIGN_MCP_INTENT_ROUTING.md` |
| **首日价值三小项** | §4-7 第三条:捕捉满三条 → 一行安静提示;「今天读了什么」日卡。**这是「产品下一程」那条里最后剩的一件** |
| **M4 定时跟进** | ⚠️ 仍然卡着两个前提(§4-8) |
| **case-study 四、五、六期** | 卡在「代码全做完之后」 |
| **截图 + 演示视频全套重建** | 同上,§5.1 |

---

## 1. ⭐⭐ 这一窗做了什么(四件)

### 1.1 项目文件库三期:`request_file_access` + 待审面(`DESIGN_PROJECT_FILES` §8)—— schema **v18**

```
AI:    request_file_access(thread_id, attachment_ids[], why)   ← 什么都读不到,只排队
Spool: 待审面一张卡「Codex 想读〈申请规划〉里的 1 个文件 / 理由:核对 CMU 秋季有几门必修课」
                                                        [可以读] [不给]
AI:    从此 get_blocks(include_extracted_text=true) 能读到这个文件的正文
```

⚠️⚠️ **开工第一件事是发现设计稿 §1 那张现状表已经过期了,而三期的整个安全论证架在它上面。**
稿子写着「没有任何工具能读附件正文」—— **二期(08-12)自己把这句话弄假了**:
它给 `get_blocks` 加的 `include_extracted_text` **无条件返回每个文件的全文**。
所以三期真正的第一件事**不是加工具,是把读的那一侧收紧**:

| 通路 | 现在 |
|---|---|
| `get_blocks(include_extracted_text=true)` | 只给**用户开过口**的文件正文;其余 `extracted_text: null` + 一句 `locked` 教它怎么申请 |
| `search_blocks` 的 `attachment_hits` | 没开权限的命中**不给 snippet**,但仍报**文件名 + 大小 + `attachment_id`** |
| `get_pack` | **一个字没动**,仍然只看 `include_in_pack` |

⚠️ **「开过口」= `include_in_pack` 或 `ai_access` 二者之一**。前者是用户自己勾的
「打包时带上这个文件的文字」,那本来就等于「我交给读 pack 的 AI 了」。
⚠️ **锁住的文件为什么还报名字和 id**:全砍掉的话 AI 根本不知道有这个文件,
申请就成了**一扇没有把手的门**。
⚠️ **`get_pack` 为什么不跟着 `ai_access` 走**(和稿子 §3.4 那张流程图不同,已在 §8.1 写明):
两侧渲染器有 golden 平价测试盯着,让 MCP 的 pack 和用户复制的 pack 分叉,代价大于收益;
而且稿子自己警告过「长期授权 + 自动内联 = 全文从此每次都进 pack」。

⚠️ 硬约束都钉在代码里,不是写在注释里:**参数只认 `attachment_id`,永远不接受路径**;
**id 必须属于那个项目**(否则这工具就是个探全库的探针,实测传 `~/.ssh/id_ed25519` 当场被拒);
一次最多 8 个;`why` 必填(用户就靠它判断)。

### 1.2 「AI 可读」开关(`DESIGN_PROJECT_FILES` §5.1 ①)

右侧栏「项目文件」每个文件下面多一行 ✓,开着是强调色。
⚠️ **这就是二期故意没做的那个开关**(§7.3「拨了不通电的开关」),它跟着能读它的东西一起来了。
⚠️ 它和上面那行「打包时带上这个文件的文字」**是两件事,不许合并**:
一个是用户往自己造的 pack 里塞文字,一个是 AI 有没有资格开口要这个文件。

### 1.3 分流「把整场对话分流进项目」(选项 A)—— `DESIGN_CONTEXT_HYGIENE` §9.5.1

- 新 MCP prompt **`triage_conversation`**(提示词面 4 → 5),整份配方在里面。
  ⚠️ **不嵌项目列表**,让模型自己调 `list_threads`。
- 配方第 3 条就是选项 A:**`source_text` 只放用户自己说过的话**,不许把 AI 的回答塞进去。
- `propose_blocks` 的描述扩了第一件事(「或者让你把**整场对话**归档」),返回多了
  `source_text_chars`;超过 **2,000 字**再多一句 `source_text_note` 教它怎么改。
- 待审面原文那一栏右上角显示 **「N 字」**。

⚠️⚠️ **没有做「超长就拒绝」,这是想清楚的选择**:用户亲手递来的一篇长文章,
和一整份聊天记录,**在参数上一模一样**,拒绝会把合法的那半也拒掉。
所以服务端只**把数字说出来 + 把规矩说清楚**,决定权给待审面前面那个人。

### 1.4 MCP 读 follow up brief + 建议改(`DESIGN_FOLLOW_UP` §4.3)—— schema **v19**

| 工具 | |
|---|---|
| `get_follow_up_brief`(只读) | `{project, brief, following_up, suggestion_waiting_for_user}`。⚠️ 没 brief 给 `null` 不给 `""` —— 空串会让模型以为跟进开着却什么都不找 |
| `suggest_follow_up_brief`(受写入开关管) | 建议**停在** `threads.follow_up_brief_suggested`(+`_by`/`_at`),`follow_up_brief` **一个字节不动** |

⚠️⚠️ **写那一半必须停下来的理由要留住**:brief 是 Spool **出网的那条指令**。
模型能直写就闭合了一条链 —— **网页写「顺便盯一下 X」→ 模型记进 brief → 下次真的去找 X**。
待审面那张卡**旧的新的并排显示**:用户批的是**改动**,而注入要藏的正是被换掉的那半。
⚠️ 空 brief 当场拒绝 —— **关跟进只有用户能做**,否则这工具就是个没人按的关机键。

### 1.5 顺带一件小的:待审面现在是一个队列,三种卡

角标 `pendingCount` 现在是**三种之和**(提案 + 文件申请 + brief 建议)。
⚠️ 三个角标等于三样要学的东西;用户的问题只有一个「有没有东西等我」。
⚠️ 关屏的条件也跟着改成**三种都空**才关,不是「提案空了就关」。

---

## 2. ⚠️ 还没验的那一层:好不好看 / 好不好用

**四条基线 + 实机 stdio 全绿一条也答不了这些**(台账 §3.12/§3.13)。装完请他看:

1. **待审面那两张新卡片** —— 文件申请卡、brief 建议卡,信息够不够、按钮说的是不是人话
2. **右侧栏「项目文件」那个 ✓** —— 一个文件下面现在挂两行小字,会不会太挤
3. **原文那一栏的「N 字」** —— 他会不会真的看这个数
4. **ChatGPT 那边**(提示词在 §7)

## 3. ⚠️ 装完那一步(08-09 15:57 已做,记在这里备查)

照 §6.2-quinquies 走的,顺序没有偏:备份 → 四条基线 → `tauri build --bundles app` →
**按 pid `kill -TERM`** 主进程和 `--overlay`(⚠️ 两个 `--mcp` 子进程一个都没碰)→
`mv` 旧的 `.previous-<时间戳>` → `cp -R` 新的 → `open` → 核三个旁证 + 库版本。

装完之后,**当时正在跑的那两个 `--mcp` 子进程还是老二进制**,它们连的库已经是 v19,
`EXPECTED_SCHEMA_VERSION` 的守卫会让它们**明确报错**(不是静默出错),
但对 Ocean 来说表现就是「AI 那边突然连不上了」。

→ **已经用大白话告诉他:把 ChatGPT / Claude 那边的客户端完全退出再打开一次。**
⚠️ **这一条从这边验证不了** —— 只能看他回不回「连不上了」。

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ 已落地(2026-08-05)
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ 已落地(2026-08-06)
   - ~~`get_blocks` 的历史过滤位~~ —— ✅ 已落地(2026-08-07,v13 的 `stale`)
   - ~~档③「部分更正」开给 MCP,走提案~~ —— ✅ 已落地(2026-08-08,schema v14)。
     `propose_blocks` 的 item 多一个 `ref_kind`,**只认 `"corrects"`**;
     传 `"supersedes"` 当场拒绝。⚠️ 只开 ③,`stale_at` 那一列 AI 永远碰不到
   - ~~**MCP 读 follow up brief + 建议改** —— 决定 5~~ —— ✅ **已落地(2026-08-09,schema v19)**。
     ⚠️ 写那一半走的是新的「过目」闸(建议停在 `follow_up_brief_suggested`),
     **直写是注入提权链**(网页注入 → 改 brief → 改变下次搜索方向)—— 这条理由要留住
   - ~~**`request_file_access`** —— 项目文件库三期~~ —— ✅ **已落地(2026-08-09,schema v18)**。
     ⚠️ **工具面 14 → 17**(三期 1 个 + 决定 5 那 2 个);
     ⚠️ 参数只认 `attachment_id`,**永远不接受路径**,而且必须属于所申请的那个项目
   - ~~M2:待审闸跑过一段真实使用后,评估写入开关能否默认打开~~ ——
     ✅ **已落地(2026-08-13),默认打开了**
   - ➕ **2026-08-11 新增铁律**:**每个工具都必须写 `annotations`**。少一个,
     在本地一点声音都没有,但第三方客户端会拒绝调用。已有测试钉住
   - ➕ **2026-08-09 晚新增铁律(同一类的第二条)**:**加工具的同时必须改
     `OPENERS` 和 `INSTRUCTION_HEADER` 这两段路由文本**。08-09 那三个新工具
     描述写得很好、annotations 齐、stdio 跑通,**但两段路由文本一个字没改** ——
     Ocean 当晚在 ChatGPT 里真跑,三件里**两件模型根本没走到**。
     全稿 + 取证 + 六件设计:`DESIGN_MCP_INTENT_ROUTING.md`(**三题已拍板,都选乙**)。
     待做 A 门把手 / B 路由 / C `list_threads` 两字段 / D `add_block` 开 `corrects` /
     E `get_project_overview`(工具面 **17 → 18**)/ F 出处三字段
     (**schema v20,这一摊里唯一要重生 golden 的,建议单独一窗**)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ 引擎位泛化成预设也落地了(2026-08-06)。
   ✅ **v0.4.0 已发布**(2026-08-10)
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路。⚠️ M2 的取消走 `setpgid` + `killpg`(Unix 专属),
   移植时这一段要重写。⚠️ `run_env()` 里的 `USER` 在 Windows 上是 `USERNAME`,别照抄。
   ⚠️ 引擎检测的候选路径表(`candidate_paths`)整个是 macOS/Unix 形状
   (`~/.nvm/…`、`/opt/homebrew/bin`),Windows 上要另写一份。
   ⚠️ `stream_with_timeout` 的两个读取线程本身是跨平台的,
   但**杀进程组那一段仍然是 Unix 专属**,跟 M2 的取消是同一处。
   ⚠️ `focus_mcp_client`(一键问 AI 用来把客户端调到前台的)整个是 `open -a`,
   **Windows 上要另写**
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)。
   ✅ **2026-08-08 Ocean 明确答复「不加」** —— 这现在是一条禁令,不只是暂缓。
   后果(公开仓库无许可 = 保留所有权利)要在 case-study 页面主动答一句,
   措辞已写进 `CASE_STUDY_LEDGER.md` §4
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档)
   - ~~**AI 活动面**~~ —— ✅ 已落地(M3)。⚠️ 正确形态是右侧栏;
     **08-07:那个折叠区已经删掉并入右侧栏了(R2)**
   - ~~**「我的思考」凸显**~~ —— ✅ **两半都落地了**:W7(批注当标题)08-07,
     **「只看我写的」过滤 2026-08-13**
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
     —— ⏳ **仍未开工,是这一条里最后剩下的**
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   ~~M3 没新东西就静默~~ ✅(08-07)/ **M4 定时(仍然只在 M3 被证明有用之后)**
   ⚠️ **硬约束**:`DESIGN_CONTEXT_HYGIENE` §9.5 —— **M4 上线前应当先有一个「往外拿」的动作**。
   定时 = 自动往项目里灌块而另一头没有出口,按真库数字**每周一次跟进约 14 周撞满预算**,
   而那时去重帮不上任何忙
   ⚠️ **2026-08-11:跟进现在是右侧栏唯一的动作了**(§5-C),它的分量比以前重
   ➕ **2026-08-09:brief 现在能被 MCP 读到、也能被它提议改**(§1.4)——
   M4 真做的时候,「谁能改 brief」这条线已经画好了,别推翻它
9. ~~**引擎档位问题**~~ —— ⚠️ **2026-08-11 重新打开,而且更糟**:
   第三个档(Gemini CLI)虽然落地了,但**它的免费入口 06-18 已被 Google 关掉**,
   只剩 API key(~20 次/天)。全文 `DESIGN_AI_ENGINE` §7.9。
   **「稳定免费又能跑全部四个动作」的档仍然不存在,而且缺口变大了。**
10. ⚠️ **工作台** —— 全稿 `DESIGN_WORKBENCH.md`。
    一~六期 + §7 notes 当标题(W7)全部 ✅。
    ✅ **§11.1(周回顾归位)+ §11.3(压缩撤、去重换本地角标)2026-08-11 落地。**
    ✅ **§11.4(C / D / E)2026-08-12 落地。**
    ✅ **§10.1(块正文 MD 渲染)+ §12(排版按标准 MD 返工)2026-08-12 落地。**
    ✅ **§13(标题字号退回 + 折叠改成一屏)2026-08-13 落地。**
    ✅ **§10.2 三个键全删完了**,动作条 10 → 7 个键。
    **这一摊已经返工过五轮 —— 下一轮反馈大概率还在这里。**
11. ⚠️ **上下文卫生** —— 全稿 `DESIGN_CONTEXT_HYGIENE.md`。
    五件里 **1/2/3/4 已落地**(08-07 深夜,见 §8),**拍板甲 + 乙已落地**(08-08,§9.3.1),
    **两处反转已落地**(08-09,§1.1-ter)。
    第 5 件(AI 一句话标签)**按稿子自己的判断口径先不做**,缺口记在 §8.6。
    ⚠️ §2 那一节的调研**会过期**(2026-08 查的),下次动这摊之前重查。
    ➕ **§9 是实测账,动这摊之前先读它**
    ➕ **§9.5.1 是 2026-08-09 的落地记录(整场对话分流走选项 A)**
12. ➕ **三份计划稿(2026-08-08 Ocean 提)**
    - ~~**`DESIGN_PROJECT_FILES.md`**~~ —— ✅ **一期 + 二期 2026-08-12(v15)、
      三期 2026-08-09(v18)全部落地**,记录在该稿 §7 / §8
    - ~~**`DESIGN_WORKBENCH.md` §10.1 / §12 / §13**~~ —— ✅ 全部落地
    - **`DESIGN_CASE_STUDY.md`** —— 给研究生申请用的公开 case-study。
      ✅ 第一期(台账)、第三期(八栏正文)已落地。
      **剩四、五、六期**,卡在「代码全做完之后」这个时机。
      ➕ **台账新增:§3.9/§3.10/§3.11(08-11)、§3.12(08-12)、§3.13/§3.14(08-13)、
      ➕ §3.15(08-09:为一扇已经开着的门做锁)**
13. ~~➕ **「把整场对话分流进项目」** —— 决定 4,走选项 A~~ ——
    ✅ **已落地(2026-08-09)**,记录在 `DESIGN_CONTEXT_HYGIENE` §9.5.1。
    ⚠️ **那条预算警告仍然成立,别丢**:原文块的 `source_text` 如果照搬整场对话就是**文档级**的,
    三到四次分流撞满一个项目的预算。落地的做法是**只把用户的提问序列存成原文块**,
    并且**不设长度上限**、改成把字数报给模型和用户(理由见 §1.3)

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. ~~**块正文里的截止日期没人管**~~ —— ✅ **2026-08-13 落地**(schema v17)。
   ⚠️ 形状是「不弹窗,项目顶上挂一条」,时刻表 `NOTICE_STAGES = [60, 30, 7]`,
   ✕ 只压当前这一档
   ⚠️ **同形的第二例仍然没人管**(`DESIGN_CONTEXT_HYGIENE` §9.6):v13 给了作废/更正
   这两把刀,**但没有任何东西会提醒用户去用**
4. ~~**重复块:用户想清但清不动**~~ —— ✅ **2026-08-11 换了个方向解决**:
   去重按钮撤了,改成**项目管理每行一个免费的本地角标**「⚠️ N 块重复」。
   ⚠️ **只认逐字节相同**,不做模糊相似度
5. ~~**摘要没有写作时间**~~ —— ✅ **2026-08-13 落地**(schema v16)。记进库,UI 不显示
6. **一件事被拆成两个项目** —— ✅ **Ocean:「不管,这种情况几乎没有」。** 留档,因为它仍然是
   「用对话标题自动建项目」被否的理由

### 5-B ~~写入开关默认打开~~ —— ✅ 2026-08-13 落地

⚠️ **那条附带的判断已经被 08-09 兑现了一半,记清楚**:Ocean 日常用法结构上永远落在
`add_block` 那侧,**分流基本不会自发发生** —— 所以决定 4 才是真正给 `propose_blocks`
造触发场景的那个功能,而它现在有了自己的提示词入口(`triage_conversation`)。
**这是它第一次有一个用户能主动说出口的触发方式。**

⚠️⚠️ **08-09 晚上这条判断被证伪了,别再传下去**:Ocean 当晚亲口说了一句标准分流句
(「flux 相关的存 flux,其他存原来的升学规划」)。**触发场景是真的,是模型没接住** ——
那一场 `propose_blocks` **调用 0 次**、`add_block` **12 次**(真库取证)。
`triage_conversation` 那个入口在 ChatGPT 里**看不见**,MCP prompts 只有 Claude Code 会渲染。
全稿 `DESIGN_MCP_INTENT_ROUTING.md` §2.4。

### 5-C ⚠️ 引擎位现在只剩两个动作(2026-08-11 Ocean 拍板)

| 动作 | 在 Spool 里 | 在别的 AI 客户端里(MCP) |
|---|---|---|
| 压缩 distill | ❌ **撤了** | ✅ 还在 |
| 去重 thread_health | ❌ **撤了**(换成免费本地角标) | ✅ 还在 |
| **周回顾 weekly_review** | ✅ **自己的一屏** | ✅ |
| **跟进 follow_up** | ✅ 右侧栏唯一的动作 | —(不是 MCP prompt) |

⚠️⚠️ **MCP 的 `distill` / `thread_health` 工具和提示词一个字没动。**
它们服务的是聊天客户端 —— **那边真的有人在**。
坏掉的从来不是这两个动作,是**在没人的情况下跑它们**。

⚠️ 连带删掉的:`useAutoMaintain` 的自动压缩分支、`SETTLE_MS`/`COOLDOWN_MS`、
`threadsDueForMaintenance`、`lastSuccessfulRunAt`、每个项目的「自动维护这个项目」开关。
总开关搬到周回顾那一屏,改名**「每周自动回顾一次」**。
⚠️ **`threads.auto_maintain` 这一列留着但没人读了** —— 删列要走 schema 迁移,不值。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图,**块流(W7)、右侧栏、项目管理、
  左侧边栏、新的周回顾一屏** 都换了样子。
  要求见 memory `next-stage-goals-website-portfolio`(**多场景铁律**)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**
- ⚠️ **`RELEASE.md` §3 的验收清单里那一条现在是不合格的**,已标注
- ➕ **2026-08-13 变了三处**:标题字号、长块基本不折了、项目顶上可能挂着日期提醒条、
  块流右上角多一个 ✎
- ➕ **2026-08-09 又变了两处**:**右侧栏「项目文件」每个文件多一行 ✓**、
  **待审面多了两种卡片**(拍待审面那一屏时值得让文件申请卡入镜 —— 它是这一版最有故事的一屏)

### 5.2 其余待办

| # | 事情 | 状态 |
|---|---|---|
| **M4** | Follow up 定时 | ⚠️ 仍然要等 M3 被证明有用,⚠️ 并且要先有一个「往外拿」的动作(§4-8) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | 截图 + 演示脚本整体重建 | Ocean 已批:排在 app 代码全部做完之后 |
| G | Hero 内嵌 15 秒演示视频 | 视频没录之前这一屏保持现状 |
| H | 对外动作 | 每一件都需 Ocean 单独明示 |
| I | 装 Antigravity 实测 | 要 `curl \| bash` 装到他机器上,**需 Ocean 明示** |

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 313 通过(2026-08-09)
cargo test --manifest-path src-tauri/Cargo.toml   # 61 通过(2026-08-09)
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ **vitest 304 → 313**:v18/v19 迁移各 1,`fileAccess.test.ts` 9 条(文件申请 5 + brief 建议 4)。
cargo **58 → 61**:文件权限一条(它同时验读的那一侧)、brief 过目闸一条、原文体积一条。

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。
⚠️ **改官网(`site/*.html`、`scripts/site-zh-*.html` 或中文串)之后要跑
`node scripts/build-site-zh.mjs`**。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。**

⚠️ **`engine.rs` 里有三个测试真的会 fork 子进程**,它们**共用一个 `STREAM_TESTS` 互斥锁**。

### 6.1-bis ⚠️ 漏译检查是仓库里的脚本

`node scripts/i18n-check.mjs`(加 `--dead` 还会列出没人用的字典条目)。
⚠️ 它只看**字面量**。`t(SOME_CONST)` 这种它看不见。
⚠️ **`--dead` 报的绝大多数是既有的** —— 按 CLAUDE.md §3 没删。
⚠️ **判断哪条是自己弄出来的**:`git grep -F "<串>" HEAD -- 'src/**' ':!src/lib/i18n/index.ts'`

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在副本上做**。⚠️ 推荐照抄:
  `sqlite3 <真库> ".backup <副本>"`
- ➕ **2026-08-09 用了一个更省的做法,推荐**:真库现在是 v17、二进制是 v19,副本会被守卫拦下。
  与其降级,不如**当场建一个新库**:
  `sed 's/--.*$//' src/lib/db/schema.sql | sqlite3 lab/spool.db`,再
  `PRAGMA user_version = 19` + 手写几行 seed + 一个
  `{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"zh"}` 的 settings.json。
  **三十秒,而且想造什么状态就造什么状态**(比如「一个没授权、一个已授权」的两个附件)。
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏**。
**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**,**绝不能当 hook selector**。
组件要这张表就订阅 `threadsByWorkspace` 再 `useMemo` 摊平。
➕ 同一条规矩:右侧栏附件那几个 selector 全部写成
`s.attachmentsByThread[id] ?? EMPTY_ATTACHMENTS`(常量兜底),**绝不在 selector 里现造数组**。

隔离验证配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(用过 `.wb` / `.e3`)
2. `npm run tauri build -- --bundles app`
3. 库和 settings 预置在 `~/Library/Application Support/<新id>/` 的**根上**
4. `open -n <app> --stdout /tmp/x.out --stderr /tmp/x.err` 起来抓日志
5. ⚠️⚠️ **截图这一步 08-10 整个失败了,别再按老办法硬试**:
   `screencapture -x` 抓的是**另一个 Space**;`System Events` 报窗口数 0;
   **`swift` 走 `CGWindowList` 也不通 —— 这台机器的 Swift SDK 坏了**。
   ✅ **改用三个旁证**:**CPU 稳定 0.0%**、**`spool.db-wal`/`-shm` 当场生成**、stderr 无报错。
   ⚠️ **但这只排除白屏,排除不了"长得不对"**
6. ⚠️ 想看某个项目的块流,就把测试库的 `is_capture_target` 改到那个项目上再起
7. ⚠️⚠️ **收尾当场做**:按**全路径**杀进程(**绝不用模糊 `pkill -f spool`,正式版一直在跑**)、
   复位 identifier、删掉测试库

⚠️ **合成鼠标点击驱动不了这个 webview。** 「点开之后长什么样」这一层**永远验不到**。

### 6.2-quinquies ⚠️ 给 Ocean 重装正式版(照这个来)

**和 §6.2-bis 的隔离验证是两回事** —— 这是**装到他真的在用的那一份上**,读的是**真库**。

1. **先备份真库**:`sqlite3 <真库> ".backup ~/Desktop/spool-snapshot-<日期>-pre-reinstall.db"`。
   顺手核一眼 `PRAGMA user_version` 和代码里的 `SCHEMA_VERSION`(memory `spool-db-wipe-incident`)。
2. 四条基线全绿(§6.1)。
3. `npm run tauri build -- --bundles app` —— 签名走 `Spool Dev`,**没有公证**。
4. ⚠️ **退出正在跑的那一个**:`osascript -e 'quit app "Spool"'` **对它无效**(08-12 实测)。
   **按 pid 发 `kill -TERM`**,主进程和 `--overlay` 一起。
   ⚠️⚠️ **`--mcp` 那一堆子进程绝对不能杀** —— 那是别的 AI 客户端连着的服务端。
5. `mv /Applications/Spool.app /Applications/Spool.app.previous-<时间戳>`,再 `cp -R` 新的过去。
6. `open /Applications/Spool.app`,然后看三个旁证:CPU 稳定、`spool.db-shm` 当场重建、
   库里块数没变。**「长得对不对」还是只有 Ocean 能看。**
7. ➕ **这一次装还要多两步**:①**一次走两步迁移 v17 → v19**,起来核一眼
   `PRAGMA user_version = 19`;②装完**明确告诉他去重开 AI 客户端**(§3)。

### 6.2-ter ⚠️ 子进程 / 外部客户端的活,必须真跑一次

**已被六次独立事件证实**(全部收进 `CASE_STUDY_LEDGER.md` §3.4/§3.5/§3.6/§3.8/§3.9/§3.10):
`CLAUDE_CODE_EFFORT_LEVEL`、跟进的 URL 规则、Codex 免费档、
Gemini 免费额度(稿子 1500/天,实测 20/天,差 75 倍)、
**少一个 `annotations` 导致两个工具在 codex 上调不动**、
**gemini 把错误信封打在 stderr 上**。

**⚠️ 提示词里写了规则 ≠ 规则生效。稿子里写了数字 ≠ 数字是真的。
工具描述写得再对 ≠ 第三方客户端调得动。**

**怎么真跑(固定下来):**

1. `scripts/seed-workbench-lab.sh` 建隔离库,或 §6.2 那个「三十秒新建一个库」的做法;
2. **argv 从 Rust 里打印出来,别手抄** —— 临时加一个 `#[test]` 打印,拿完**立刻删掉**;
3. 提示词从 **MCP 的 `prompts/get`** 拿。⚠️ 例外:`follow_up` **不是 MCP prompt**;
4. `env -i PATH=… HOME=… USER=…` 起,`< /dev/null`;
5. ⚠️ **一次跟进要跑五到十分钟,前台会被 10 分钟超时打断 —— 放后台跑。**
6. **验 MCP 工具能不能被真的调用**,直接喂一句「call tool X, then tool Y, report each
   verbatim」,然后从 `--json` 事件流里筛 `item.completed` + `mcp_tool_call`,
   看 `status` / `error`。**比读模型的总结可靠得多。**

⚠️ **仍然没真跑过的**:**Claude Desktop 的写入**、**Antigravity 的一切**、
➕ **08-09 这三个新工具在真客户端里**(stdio 那一层验过了,ChatGPT 那一层要 Ocean 跑 §7)。

### 6.2-quater ⚠️ 探子进程可以不花模型额度(但有边界)

- **`--strict-config`(codex)**:把「要试的键」和「一个肯定不存在的键」一起传。
  ⚠️ 它验的是**键**,**不验值**。
- **拿包装脚本当探针**;**翻二进制里的字符串**能证明「这个词在里面」,**不能证明「它现在还有效」**。
- **直接打 REST API 是最省的探针**,⚠️ **但它会真的消耗额度**。
- **`ListModels` 返回的名字不等于能用的名字**。
- **翻 CLI 自己的 bundle 找配置键名,零成本且准**。
- **验第三方 CLI 的认证,用「假 HOME + symlink 凭据」**,别去动用户真的 `~/.gemini`。
- ⚠️ **提示词里写了规则,连「模型会不会照做」都答不了。** 只有真跑能答。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`(或带 `--manifest-path`)。**
2. **开测第一件事:`tools/list` 数一下工具个数。** ➕ **2026-08-09 起是 17 个**
   (11 读 + 6 写;写的那 6 个里有两个其实什么都不存 —— 它们只是排队等用户点头)。
   ➕ **顺便看一眼每个工具都有 `annotations`** —— 有测试钉着了。
   ➕ **prompts 是 5 个**(多了 `triage_conversation`)。
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本**。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 和 gemini 也一样。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **现在是 v19**。⚠️ **`client.test.ts` 里那串 `downgradeToVn` 是链式的**,
   每加一版就要在**链条最前面**加一个新的、并让原来的头一个先调它
   (现在的头是 `downgradeToV18`)。
   ➕ **还有一处容易忘**:那份测试里有几处拿 `SELECT * FROM threads` 前后对比,
   新增的列要加进 `stripBriefSuggestion` 那个 helper,否则会红。
6. ⚠️ `mcp.rs` 的 `INSTRUCTION_HEADER` 是 `r##"…"##`,**不是 `r#"…"#`**。
7. ⚠️ **版本号三处要一起动**:`package.json` / `src-tauri/tauri.conf.json` /
   `src-tauri/Cargo.toml`(⚠️ `Cargo.lock` 也会变,一起提交)。
8. **加引擎要动的地方**:`engine.rs` 的 `EngineKind`(枚举 / `ALL` / `as_str` / `parse` /
   `models`)、参数适配、输出解析、`run_env`、`run_action` 的 match、
   `lib.rs` 的 `open_mcp_client_page`、TS 侧 `engineStore.ts` 的 `EngineKind` + `ENGINE_LABEL`、
   `settingsStore.ts` 的 `aiEngine` 联合类型(+ 新模型键要在**四处**登记)、
   `EngineBar.tsx` 的 `ENGINE_MODELS`、`EngineConfig.tsx` 的安装入口、i18n。
   ⚠️ **`EngineKind::parse` 有一条测试断言「某个不认识的名字返回 None」**。
9. **写会毁东西的迁移**:顺序必须是「**先补齐新列 → 再删行 → 最后删列**」,
   结尾放一条断言,不满足就**抛错、不盖版本号**。
   ⚠️ **SQLite 不能给已有列加 NOT NULL 或外键**。
   ➕ **v18/v19 都不属于这一类**:一张新表 + 三个可空列,跑一半和跑完没有区别。
10. **默认值在 TS 和 Rust 各有一份的,翻一处等于没翻**(`mcpWriteEnabled`)。
11. ➕ **2026-08-09 新增**:**加新工具时,`every_tool_declares_its_read_write_annotation`
    那条测试里写死了「哪几个是写工具」的名单和顺序** —— 加一个就要改那一行,
    它会红得很干脆,别以为是自己写错了 annotations。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 **和 `## Notation` 那一节** ——
这些是**给模型读的契约,任何 locale 下都保持英文**。`ai note:` 也属于这一侧,**不翻**。
⚠️ **引擎名(Claude Code / Codex / Gemini CLI)是产品名,也不翻。**
➕ **提示词正文(`prompts/get` 那几份)是双语的**,和工具描述不一样 —— `triage_conversation` 照此办理。

⚠️ **第三个受众**:**case-study 是对外材料,整份英文**。

⚠️ **一条通用判据(Ocean N6 给的)**:回答「只有做这个东西的人才会问的问题」
= **开发者提示,不该出现在界面上**。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。**

```
TZ=Europe/London GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts
```

⚠️ **能合并成一次重生就合并。**
⚠️ **反过来的一条**:**动 pack 之前先想一遍"输出真的变了吗"**,别条件反射重生。
✅ **08-13、08-09 两窗都一次没重生 —— pack 的输出一个字都没动过。**
⚠️ **fixture 现在覆盖 v13/v14/v15**:一个被作废的**置顶**块、一条 `supersedes`、
一条 `corrects`,标签阶梯的两处,**三个项目级文件**。别删掉这几块。
⚠️ **fixture 里的 attachment 带 `threadId`,不带 `blockId`** —— Rust 那侧
`fixture_rows()` 按同一个键读,两边一起改。

### 6.6 提交与推送

**08-09 这一窗的改动 ⚠️ 还没提交。** 上一次是 `a98da0d`。

- ⚠️ **推送要单独问 Ocean,每次都要。** 他明示的是**那一次**的授权,**不是长期授权。**
- ⚠️ **SSH 推不了(08-07 实测)**:`~/.ssh/id_ed25519` 带口令、agent 空、沙盒弹不出 askpass。
  **走 HTTPS**:`git push https://github.com/KIM-ocean-HZ/spool.git main`
  ⚠️ `git fetch origin` 同理会失败,刷新本地 ref 要
  `git fetch https://github.com/KIM-ocean-HZ/spool.git main:refs/remotes/origin/main`。
  **别去改 remote。**
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词。
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**
- ⚠️ **`git add -A` 会把 Ocean 在 IDE 里的顺手改动一起带走。** 提交前扫一眼
  `git status --short`,不认识的改动先看 diff。

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

⚠️ **验证有效(六次)**:08-07 晚四个选择题、每个选项写清「好处 / 代价」+ ASCII 草图 → 四题秒选。
08-07 深夜「会不会过载」先给结论、再给真实数字表 → 当场拍两块板。
08-10 把「我需要你给的东西」列成 4 条 → 一次全答完。
08-11 三个选择题全答,**都不是默认答案**。08-12 两题都答。
➕ **08-13 最值钱**:日期提醒三个选择题全答,**第一题选的不是推荐项** ——
他在读到代价(「你不进那个项目就永远看不见」)之后仍然这么选。
**把代价写清楚,他会做出比你推荐的更精确的决定。**

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。
⚠️ **它们的 seed SQL 里如果写了 `attachments`,v15 之后要改成 `thread_id`。**

### 6.9 ⚠️ 真库现在长什么样(2026-08-09 15:57 装完之后量的)

**`PRAGMA user_version = 19`,`threads` 7 行但**只有 2 个还活着**(其余 `deleted_at` 非空),
3 个工作区,34 块,`attachments` **0 行**,`integrity_check` ok。**

⚠️ **「7 个项目」这个说法上几窗一直在传,它数的是行数** —— `list_threads` 只报 **2 个**,
因为另外 5 个是软删的。下次跟他说项目数之前先看 `deleted_at IS NULL`。

⚠️ **`attachments` 是空的,这件事对这一窗特别重要**:
**三期的所有界面变化(文件申请卡、✓ 开关)他现在都看不到,因为他一个文件都没加过。**
要看,得先在右侧栏「项目文件」里加一个 PDF/docx 进去。**§7 的提示词第一步就是这个。**

⚠️ **库目录里有一批备份文件,占空间。** Ocean 确认没问题之后可以清掉老的
—— ⚠️ **但那是用户数据,清之前必须问他,一份都别自己删。**
➕ 08-09 这一窗又加了两份:`~/Desktop/spool-snapshot-20260809-155614-pre-v19.db`(v17 / 34 块,验过)
和库目录里 app 自己写的 `spool.pre-migration-v17-2026-08-09T07-57-53-212Z.db`。

---

## 7. ⭐ 给 Ocean 的 ChatGPT 测试提示词(装完 + 重开客户端之后再用)

**全套四件的原话在这一节,一件一段,他可以直接复制。**
⚠️ **顺序有讲究**:第 1 件要先在 Spool 里加一个文件,不然没东西可申请。
⚠️ 每件跑完都要**回 Spool 看一眼**,东西在待审面里。

（正文见下一节 —— 这一节的内容和交付给他的消息一字不差,别改一个改另一个。）

### 7.1 试「AI 申请读我的文件」

> **先在 Spool 里做一步**:随便打开一个项目,右边「项目文件」点「加文件」,
> 挑一个 PDF 或者 Word 文档(有字的,不要图片)。
>
> 然后去 ChatGPT 说:
>
> 「看看我 Spool 里〈项目名〉这个项目有哪些文件。里面那份文件写了什么?
> 你要是读不了就跟我说该怎么办。」
>
> **应该发生什么**:它会说它看得见这个文件、但读不了,然后向你申请。
> 回 Spool,左下角有个数字角标,点开 → 一张卡写着它想读哪个文件、为什么。
> 点「可以读」,再回 ChatGPT 说「我同意了,再读一次」,它这次应该能说出文件里的内容。

### 7.2 试「AI 可读那个开关」

> 在 Spool 右边「项目文件」里,把刚才那个文件下面的 ✓ 点掉。
> 回 ChatGPT 说「再读一次那份文件」。
>
> **应该发生什么**:它读不到了,并且会说要重新申请。

### 7.3 试「把整场对话分流进项目」

> 随便跟 ChatGPT 聊几轮你正在想的事(比如选校、比如某个技术方案),聊出三四个结论。
> 然后说:
>
> 「把我们这场对话整理进我的 Spool 项目里。」
>
> **应该发生什么**:它会把结论拆成几条,分别放进不同项目,然后告诉你
> 「Spool 里有 N 条待你过目」。⚠️ **它不应该说「已经存好了」**。
> 回 Spool 点开待审面,你会看到那几条,以及最上面一段「原文」——
> **那段原文应该只有你自己说过的话,没有 ChatGPT 的回答**,右上角写着多少字。

### 7.4 试「AI 建议改跟进目标」

> 前提:那个项目得先开着跟进(项目里「这个项目要盯什么」里有字)。
> 去 ChatGPT 说:
>
> 「我 Spool 里〈项目名〉现在在盯什么?你觉得还缺什么该盯的,给我改一版。」
>
> **应该发生什么**:它先把现在盯的几条念给你听,然后说它建议改成什么,
> 并告诉你「等你在 Spool 里过目」。⚠️ **它不应该说「我改好了」**。
> 回 Spool 待审面,那张卡上**旧的和新的并排**,你点「就按这个找」才算数。
