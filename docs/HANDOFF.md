# 交接文档 — 2026-08-13(给下一个窗口:**先问一句,再开工**)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`、`claude-code-effort-unavailable`、`chatgpt-mcp-forensics`、
> `mcp-tool-annotations-required`、`gemini-free-tier-closed`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。
> ⚠️ **⭐ 失败与修复不要只写在这里。** 这份文件规定要删,而它是 case-study 最值钱的素材来源。
> **新出的每一条,顺手往 `CASE_STUDY_LEDGER.md` §3 追加一条** ——那份台账只增不改
> (规矩在 `DESIGN_CASE_STUDY` §6.3)。

---

## 0. 一句话状态 + ⭐ 下一窗直接从这里开工

**08-13 这一窗:按 Ocean 的两条反馈返工(标题字号退回去 / 折叠改成「超过一屏才折」),
然后把 §0.0 那张「都已拍板可开工」的表一路做完了 —— 四件全部落地。
✅ 他当天授权之后已经装机、提交、推送完毕(`7e6ee68`)。**

| 摊 | 代码 | 装到 `/Applications` 了吗 |
|---|---|---|
| MD 排版(08-12)+ 标题字号返工(08-13) | ✅ | ✅ **装了**(08-13 12:24) |
| 项目文件库 v15(08-12) | ✅ | ✅ **装了**(同一次) |
| 08-13 这一窗全部(v16 / v17 在内) | ✅ 四条基线全绿 | ✅ **装了**(同一次) |

**装机核对过的**(08-13 12:24):真库 `PRAGMA user_version` **14 → 17**,`integrity_check` ok,
**34 块 / 7 项目一个没变**,`attachments` 仍是 0 行(v15 那步实际一样都没删),
三个旁证齐:CPU 稳定 0.0%、`spool.db-wal`/`-shm` 当场重建、进程起来了。
备份在 `~/Desktop/spool-snapshot-20260813-pre-reinstall.db`(v14 / 34 块,验过)。

### 0.0 ⭐⭐ 开工顺序

| 序 | 做什么 | 备注 |
|---|---|---|
| **1** | ⚠️ **确认他重开过 AI 客户端了** | 装完那一刻还在跑的 `--mcp` 子进程是老二进制、连的库已经是 v17,守卫会让它们明确报错。**08-13 已经用大白话告诉过他**,但没有任何办法从这边验证他做了没有(§3) |
| **2** | ⚠️ **请他看四处新东西** | 都是只有他能判的:①标题字号现在对不对(§2)②长块现在还折不折(§2)③项目顶上那条日期提醒会不会认错一堆(§5-3)④块流右上角那个「只看我写的」按钮(§4-7)。**08-13 已经把这四条给他了,他还没回。** |
| **3** | 挑一件开工 | 建议 **项目文件库三期**(`request_file_access`)—— 一二期已经把地基铺好了,而且它是这一摊唯一有安全面的一件 |

**以上之后的,顺序未定,都已拍板可开工:**

| 事情 | 全稿 |
|---|---|
| **项目文件库三期:MCP `request_file_access` + 待审面** | `DESIGN_PROJECT_FILES` §3.4 / §4。⚠️ **工具面 14 → 15**;⚠️ 它是这一摊唯一有安全面的一件,**必须单独发** |
| **「AI 可读」开关**(右侧栏文件面板里那个 ✓) | 同上 §5.1 ①。⚠️ **有意等到三期一起做** —— 现在放上去就是个不通电的开关(§7.3) |
| **分流「把整场对话分流进项目」(走选项 A)** | `DESIGN_CONTEXT_HYGIENE` §9.5 |
| **MCP 读 follow up brief + 建议改(走过目闸)** | §4-1 |
| **首日价值三小项** | §4-7 第三条:捕捉满三条 → 一行安静提示;「今天读了什么」日卡 |

---

## 1. ⭐⭐ 这一窗做了什么(六件)

### 1.1 标题字号退回原来的六档(`DESIGN_WORKBENCH` §13.1)

> Ocean:「标题字体太太大了,改回原来的」

08-12 那次把六档换成标准 Markdown 的比例尺(最大 1.45em),他看了之后否了。
现在是 **1.13 / 1.07 / 1 / 0.93 / 0.87 / 0.87 em** —— 就是返工前那六档
(17/16/15/14/13/13 px 对 15px 正文)。

⚠️ **单位仍然是 em,没退回 px**:同一个渲染器现在在三个字号下工作
(块流 15px / 周回顾 13px / 右侧栏 11px),写死 px 会让周回顾的标题变形。**退的是比例尺。**
⚠️ **代价是明知的**:h3 又和正文一样大了 —— 那正是他 08-12 说「大小区分不明显」的那一档。
**两次反馈方向相反,这次以最新一次为准。**

### 1.2 折叠:从「超过 8 行」改成「超过一屏」(`DESIGN_WORKBENCH` §13.2)

> Ocean:「一个 block 如果占据的位置小于等于这个工作区域的窗口,就不折叠,
> 否则就折叠,折叠大小和现在一样」

`TRUNCATE_AT_LINES = 8` **整个删掉**(那个 8 在全部稿子里没有出处)。
现在量的是**块流自己那个滚动容器的 `clientHeight`** —— 默认窗口下就是他说的那个尺寸,
而且改窗口大小之后仍然成立。折叠后仍然 6 行,和以前一样。

### 1.3 ✅ 写入开关默认打开(旧账 §5-B / `DESIGN_MCP_WRITE_ROLE` M2)

闸门条件(08-08 B3)是「`add_block` 真跑过且没出事」,08-07 就已经满足了。

⚠️ **默认值在两处,必须一起翻**:`settingsStore.ts` 和 `mcp.rs` 的 `mcp_write_enabled`
—— **这个键在有人碰过开关之前根本不在 `settings.json` 里**,两侧各自吃自己的默认值。
⚠️ 它仍然是 `mcpEnabled` 的**子开关**:用户不开 MCP 服务,谁也写不进来。
⚠️ `settings.json` 读不出来 / 解析不了,仍然一律**不许写**(读不出的文件不算同意)。
⚠️ **连带改了三处对外措辞**(原来都写着「默认只读」):设置页那一句、`PRIVACY.md`、
官网隐私页中英双侧(**改完跑过 `node scripts/build-site-zh.mjs`**)。

### 1.4 ✅ 摘要写作时间记进数据库(旧账 §5-5)—— **schema v16**

`threads` 加一列 `summary_at`。**UI 一处都不显示**,他 08-08 就是这么拍的。
两个写入口一起盖时间戳:GUI 的 `updateThread`、MCP 的 `set_thread_summary` / `create_thread`。
清空摘要时连时间戳一起清掉(和 `summary_source` 同一个规矩)。

⚠️ **老摘要一律是 NULL,不回填** —— 没有任何诚实的值可以填。
⚠️ `thread_health` 那句「Spool 不记录摘要的写作时间」**当场变成假话了,已改**:
现在摘要那一行会带上「写于 某年某月某日」,记不到的说「v16 之前写的」。

### 1.5 ✅ 「只看我写的」过滤(§4-7)

块流右上角、排序图标旁边多一个 ✎,开着的时候变成强调色(半空的信息流永远有个看得见的理由)。

⚠️ **「我写的」的口径不是现编的,是 pack 自己那条 💭 Personal 规则**:
**无来源的块 + 用户亲手写的批注**(包括写在 AI 块上的批注 —— `DESIGN_CONTEXT_HYGIENE`
§9.3 拍板乙说那是全库信号最强的一条)。只按 `source IS NULL` 过滤会把它整个滤掉。
判断函数在 `lib/blocks/annotationAuthor.ts`(`isUserWritten`),挨着 `annotationIsAi`,有测试。
⚠️ **搜索命中的那一块永远不被过滤掉** —— 「跳到命中处」不能跳进一个空的信息流。

### 1.6 ✅ 块正文里的截止日期 → 提醒(旧账 §5-3)—— **schema v17**

**⚠️ Ocean 08-13 亲自定的形状,三个问题他都答了,和 08-08 那句「弹窗」不完全一样:**

| 他答的 | 结果 |
|---|---|
| **不弹窗,只在项目顶上挂一条** | 提醒条在项目标题下面、块流上面,只在**打开这个项目**时看得见。⚠️ **他明确接受了代价:不打开的项目仍然什么也不说** |
| **直接提醒,每条带「别再提这条」** | 不要求他先确认某个日期 —— 「要点一下才生效的功能等于没做」 |
| **只认写死的日期** | `2026-08-13` / `2026年8月13日` / `8月13日` / `8/13` / `Aug 13` / `December 1, 2026`。⚠️ **「下周五」「月底」这类有意不认**:要按块的创建日推算,块放几周之后就会算成错的日子,**错的提醒比没有提醒更糟** |

- 识别器 `lib/blocks/dates.ts`,纯函数 + 10 条测试。**没有年份的日期**按「块被写下那天之后
  最近的那一次」算(12 月存的「1月5日」= 明年)。
- **只提醒今天 ~ 7 天内**(`TEXT_DATE_NOTICE_DAYS`)。⚠️ 比项目截止日期的 3 天宽,
  理由写在代码里:项目截止日期在项目管理里有颜色、在周回顾里有一节,**正文里的日期一处别的
  界面都没有**。已经过去的日期不提(没什么可做的了)。
- **日期本身不进数据库**,每次从块正文现读 —— 所以他改一个字,提醒当场跟着变。
  v17 那张 `date_dismissals` 表**只存「他说别再提」这件事**,按 (块, 那一天) 存,
  因为〈申请规划〉那一块里有三个日期,关掉一个不能把另外两个也闷了。
- ⚠️ **识别器是故意会多认的**(「第 8/13 页」在它眼里是个日期)。✕ 就是为这件事设计的答案,
  不是补丁。挡掉的只有连成一串的数字(`128/135`、`12/13/14`)。

---

## 2. ⚠️ 还没验的那一层:好不好看 / 好不好用

**四条基线全绿一条也答不了这些**(台账 §3.12 / §3.13 就是这么来的)。装完请他看:

1. **标题现在是不是不那么大了** —— 顺便看一眼 h3 和正文只靠粗细区分,他能不能接受
2. **长块现在还折不折** —— 一屏之内的应该完全不折了;真正的长块折完仍然是 6 行
3. **项目顶上那条日期提醒** —— 会不会有一堆认错的(他库里〈申请规划〉是重灾区)
4. **块流右上角那个 ✎** —— 点开之后剩下的是不是他心里「我写的」那些

## 3. ⚠️ 装完那一步(08-13 已做,记在这里备查)

装完之后,**当时正在跑的那些 `--mcp` 子进程还是老二进制**,它们连的库却已经是 v17 了。
`EXPECTED_SCHEMA_VERSION` 的守卫会让它们**明确报错**(不是静默出错),但对 Ocean 来说
表现就是「AI 那边突然连不上了」。

→ **已经用大白话告诉他:把 ChatGPT / Claude 那边的客户端完全退出再打开一次。**
⚠️ **这一条从这边验证不了** —— 只能看他回不回「连不上了」。

⚠️ **装的时候那批 `--mcp` 子进程一个都没杀**(§6.2-quinquies 第 4 步),
08-13 装的那一刻 GUI 本来就没在跑,所以连 `kill -TERM` 都没用上。

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ 已落地(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ 已落地(2026-08-06)
   - ~~`get_blocks` 的历史过滤位~~ —— ✅ 已落地(2026-08-07,v13 的 `stale`)
   - ~~档③「部分更正」开给 MCP,走提案~~ —— ✅ 已落地(2026-08-08,schema v14)。
     `propose_blocks` 的 item 多一个 `ref_kind`,**只认 `"corrects"`**;
     传 `"supersedes"` 当场拒绝。⚠️ 只开 ③,`stale_at` 那一列 AI 永远碰不到
   - ➕ **新增(已拍板,未开工)**:**MCP 读 follow up brief + 建议改** —— 决定 5。
     ⚠️ 写那一半必须走已有的「过目」闸,直写是注入提权链
     (网页注入 → 改 brief → 改变下次搜索方向)
   - ➕ **新增(已拍板,未开工)**:**`request_file_access`** —— 项目文件库三期。
     ⚠️ **工具面会从 14 变 15**;⚠️ 参数只认 `attachment_id`,**永远不接受路径**
   - ~~M2:待审闸跑过一段真实使用后,评估写入开关能否默认打开~~ ——
     ✅ **已落地(2026-08-13),默认打开了**(§1.3)
   - ➕ **2026-08-11 新增铁律**:**每个工具都必须写 `annotations`**。少一个,
     在本地一点声音都没有,但第三方客户端会拒绝调用。已有测试钉住
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
     **「只看我写的」过滤 2026-08-13**(§1.5)
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
     —— ⏳ **仍未开工**,是这一条里最后剩下的
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   ~~M3 没新东西就静默~~ ✅(08-07)/ **M4 定时(仍然只在 M3 被证明有用之后)**
   ⚠️ **硬约束**:`DESIGN_CONTEXT_HYGIENE` §9.5 —— **M4 上线前应当先有一个「往外拿」的动作**。
   定时 = 自动往项目里灌块而另一头没有出口,按真库数字**每周一次跟进约 14 周撞满预算**,
   而那时去重帮不上任何忙
   ⚠️ **2026-08-11:跟进现在是右侧栏唯一的动作了**(§5-C),它的分量比以前重
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
12. ➕ **三份计划稿(2026-08-08 Ocean 提)**
    - ~~**`DESIGN_PROJECT_FILES.md`**~~ —— ✅ **一期 + 二期 2026-08-12 落地(schema v15)**,
      记录在该稿 §7。**三期(`request_file_access`,工具面 14 → 15)还没做,单独发。**
    - ~~**`DESIGN_WORKBENCH.md` §10.1 / §12 / §13**~~ —— ✅ 全部落地
    - **`DESIGN_CASE_STUDY.md`** —— 给研究生申请用的公开 case-study。
      ✅ 第一期(台账)、第三期(八栏正文)已落地。
      **剩四、五、六期**,卡在「代码全做完之后」这个时机。
      ➕ **台账 08-11 新增三条:§3.9 / §3.10 / §3.11;08-12 新增 §3.12;08-13 新增 §3.13**
13. ➕ **「把整场对话分流进项目」** —— 决定 4,走选项 A,**未开工**。
    ⚠️ **做之前必读 `DESIGN_CONTEXT_HYGIENE` §9.5**:原文块的 `source_text` 是**文档级**的,
    会把 MCP 从全库最省的写入变成最贵的写入,**三到四次分流就撞满一个项目的预算**。
    路线:只把用户的提问序列存成原文块,AI 的结论各自署名 `↩ cites:` 指回去。
    ⚠️⚠️ **它同时是给 `propose_blocks` 造触发场景的那个功能** —— 见 §5-B

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. ~~**块正文里的截止日期没人管**~~ —— ✅ **2026-08-13 落地**(§1.6,schema v17)。
   ⚠️ 形状和 08-08 那句「弹窗」不一样:**08-13 他自己改成了「不弹窗,项目顶上挂一条」**,
   并且明确接受了「不打开的项目仍然什么也不说」这个代价
   ⚠️ **同形的第二例仍然没人管**(`DESIGN_CONTEXT_HYGIENE` §9.6):v13 给了作废/更正
   这两把刀,**但没有任何东西会提醒用户去用**
4. ~~**重复块:用户想清但清不动**~~ —— ✅ **2026-08-11 换了个方向解决**:
   去重按钮撤了,改成**项目管理每行一个免费的本地角标**「⚠️ N 块重复」
   (`duplicateCountsByThread`,一条 GROUP BY,零成本)。
   ⚠️ **只认逐字节相同**,不做模糊相似度 —— 有阈值的角标会误报,而误报比没有更糟。
   ✅ 拿真库副本验过:`Flux → 1`,正是他说的那一对
5. ~~**摘要没有写作时间**~~ —— ✅ **2026-08-13 落地**(§1.4,schema v16)。记进库,UI 不显示
6. **一件事被拆成两个项目** —— ✅ **Ocean:「不管,这种情况几乎没有」。** 留档,因为它仍然是
   「用对话标题自动建项目」被否的理由

### 5-B ~~写入开关默认打开~~ —— ✅ 2026-08-13 落地(§1.3)

⚠️ **那条附带的判断仍然成立,别丢**:Ocean 日常用法(问 AI 核验 → 存结论)**结构上永远落在
`add_block` 那侧**,分流基本不会自发发生。**决定 4 才是真正给 `propose_blocks`
造触发场景的那个功能。**

### 5-C ⚠️ 引擎位现在只剩两个动作(2026-08-11 Ocean 拍板)

| 动作 | 在 Spool 里 | 在别的 AI 客户端里(MCP) |
|---|---|---|
| 压缩 distill | ❌ **撤了** | ✅ 还在 |
| 去重 thread_health | ❌ **撤了**(换成免费本地角标) | ✅ 还在 |
| **周回顾 weekly_review** | ✅ **自己的一屏** | ✅ |
| **跟进 follow_up** | ✅ 右侧栏唯一的动作 | —(不是 MCP prompt) |

⚠️⚠️ **MCP 的 `distill` / `thread_health` 工具和提示词一个字没动,工具面仍是 14 个。**
它们服务的是聊天客户端 —— **那边真的有人在**,能回答结尾那句「你同意吗?」。
坏掉的从来不是这两个动作,是**在没人的情况下跑它们**。

⚠️ 连带删掉的:`useAutoMaintain` 的自动压缩分支、`SETTLE_MS`/`COOLDOWN_MS`、
`threadsDueForMaintenance`、`lastSuccessfulRunAt`、每个项目的「自动维护这个项目」开关。
总开关搬到周回顾那一屏,改名**「每周自动回顾一次」**。
⚠️ **`threads.auto_maintain` 这一列留着但没人读了** —— 删列要走 schema 迁移,不值。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图,**块流(W7)、右侧栏、项目管理、
  ➕ 左侧边栏、➕ 新的周回顾一屏** 都换了样子。
  要求见 memory `next-stage-goals-website-portfolio`(**多场景铁律**)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**
- ⚠️ **`RELEASE.md` §3 的验收清单里那一条现在是不合格的**,已标注
- ➕ **2026-08-12:块流的样子又变了两次**(MD 渲染 + 排版返工),
  ➕ **右侧栏多了「项目文件」一格,块的动作条少了两个键**
- ➕ **2026-08-13 又变了三处**:**标题字号**、**长块基本不折了**(截图里块会更长)、
  **项目顶上可能挂着日期提醒条**、**块流右上角多一个 ✎**。
  ⚠️ 拍块流那一屏之前先想清楚要不要让提醒条入镜

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
npx vitest run                                    # 299 通过(2026-08-13)
cargo test --manifest-path src-tauri/Cargo.toml   # 58 通过(2026-08-13)
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ **vitest 284 → 299**:日期识别器 10、`isUserWritten` 3、v16/v17 迁移各 1。
cargo **58 不变**:这一窗改的 Rust(写入默认值、`summary_at`、体检那一行、
`EXPECTED_SCHEMA_VERSION`)都落在既有测试覆盖里,没加新的。

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。
⚠️ **改官网(`site/*.html`、`scripts/site-zh-*.html` 或中文串)之后要跑
`node scripts/build-site-zh.mjs`**(有测试会因为忘了跑而变红)。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。**

⚠️ **`engine.rs` 里有三个测试真的会 fork 子进程**,它们**共用一个 `STREAM_TESTS` 互斥锁**,
因为 `RUNNING_PGID` 是**一个全局**。**再加会跑子进程的测试,记得也上这把锁。**

### 6.1-bis ⚠️ 漏译检查是仓库里的脚本

`node scripts/i18n-check.mjs`(加 `--dead` 还会列出没人用的字典条目)。
⚠️ 它只看**字面量**。`t(SOME_CONST)` 这种它看不见。
⚠️ **`--dead` 报的绝大多数是既有的** —— 按 CLAUDE.md §3 没删。
⚠️ **判断哪条是自己弄出来的**:`git grep -F "<串>" HEAD -- 'src/**' ':!src/lib/i18n/index.ts'`
—— HEAD 里有人用、现在没人用,才是你这一窗弄出来的。

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在副本上做**。⚠️ 推荐照抄:
  `sqlite3 <真库> ".backup <副本>"` —— 比 `cp` 安全(WAL 也对),真库一个字节不动
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧
- ⚠️ **一段能直接粘的数工具个数的命令在 `CASE_STUDY_LEDGER.md` §5**

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏**。
**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**,**绝不能当 hook selector**。
组件要这张表就订阅 `threadsByWorkspace` 再 `useMemo` 摊平 —— **`ProjectBoard.tsx` 就是这么写的。**
➕ **同一条规矩 08-12 又用了一次**:右侧栏那几个新的附件 selector 全部写成
`s.attachmentsByThread[id] ?? EMPTY_ATTACHMENTS`(常量兜底),**绝不在 selector 里现造数组**。

隔离验证配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(用过 `.wb` / `.e3`)
2. `npm run tauri build -- --bundles app`
3. 库和 settings 预置在 `~/Library/Application Support/<新id>/` 的**根上**
4. `open -n <app> --stdout /tmp/x.out --stderr /tmp/x.err` 起来抓日志
5. ⚠️⚠️ **截图这一步 08-10 整个失败了,别再按老办法硬试**:
   `screencapture -x` 抓到的那一屏**连 Chrome 和 VS Code 都没有**,说明抓的是**另一个 Space**;
   `System Events` 报窗口数 0(脚本宿主没有辅助功能授权);
   **`swift` 走 `CGWindowList` 也不通 —— 这台机器的 Swift SDK 坏了**,编译标准库就报错。
   ✅ **改用三个旁证**(08-10 验过,够用):**CPU 稳定 0.0%**、
   **`spool.db-wal` / `-shm` 当场生成**、stderr 无报错。
   ⚠️ **但这只排除白屏,排除不了"长得不对"** —— 那一层还是得 Ocean 自己看。
6. ⚠️ 想看某个项目的块流,就把测试库的 `is_capture_target` 改到那个项目上再起
7. ⚠️⚠️ **收尾当场做**:按**全路径**杀进程(**绝不用模糊 `pkill -f spool`,正式版一直在跑**)、
   复位 identifier、删掉测试库

⚠️ **合成鼠标点击驱动不了这个 webview。** 「点开之后长什么样」这一层**永远验不到**。

### 6.2-quinquies ⚠️ 给 Ocean 重装正式版(08-12 又走了一遍,照这个来)

**和 §6.2-bis 的隔离验证是两回事** —— 这是**装到他真的在用的那一份上**,
identifier 不改,读的是**真库**。所以顺序是死的:

1. **先备份真库**:`sqlite3 <真库> ".backup ~/Desktop/spool-snapshot-<日期>-pre-reinstall.db"`
   —— ⚠️ 比 `cp` 安全(WAL 也对),真库一个字节不动。顺手核一眼
   `PRAGMA user_version` 和代码里的 `SCHEMA_VERSION` 对不对得上(memory `spool-db-wipe-incident`)。
2. 四条基线全绿(§6.1)。
3. `npm run tauri build -- --bundles app` —— 签名走 `Spool Dev`,**没有公证**(本地装够用)。
4. ⚠️ **退出正在跑的那一个**:`osascript -e 'quit app "Spool"'` **对它无效**(08-12 实测,
   等了 7 秒纹丝不动)。**按 pid 发 `kill -TERM`**,主进程和 `--overlay` 一起。
   ⚠️⚠️ **`--mcp` 那一堆子进程绝对不能杀** —— 那是别的 AI 客户端(以及你自己这个会话)
   连着的服务端,和 GUI 无关;换了二进制它们也不会自己换,客户端重开才会。
5. `mv /Applications/Spool.app /Applications/Spool.app.previous-<时间戳>`,再 `cp -R` 新的过去。
6. `open /Applications/Spool.app`,然后看三个旁证:CPU 稳定、`spool.db-shm` 当场重建、
   库里块数没变。**「长得对不对」还是只有 Ocean 能看。**
7. ➕ **这一次装还要多两步**:①**一次走三步迁移 v14 → v17**,起来之后核一眼
   `PRAGMA user_version = 17`;②装完**明确告诉他去重开 AI 客户端**(§3)。

### 6.2-ter ⚠️ 子进程 / 外部客户端的活,必须真跑一次

**已被六次独立事件证实**(全部收进 `CASE_STUDY_LEDGER.md` §3.4/§3.5/§3.6/§3.8/§3.9/§3.10):
`CLAUDE_CODE_EFFORT_LEVEL`、跟进的 URL 规则、Codex 免费档、
Gemini 免费额度(稿子 1500/天,实测 20/天,差 75 倍)、
➕ **少一个 `annotations` 导致两个工具在 codex 上调不动**、
➕ **gemini 把错误信封打在 stderr 上**。

**⚠️ 提示词里写了规则 ≠ 规则生效。稿子里写了数字 ≠ 数字是真的。
➕ 工具描述写得再对 ≠ 第三方客户端调得动。**

**怎么真跑(固定下来):**

1. `scripts/seed-workbench-lab.sh` 建隔离库,或 `sqlite3 .backup` 拷真库副本;
2. **argv 从 Rust 里打印出来,别手抄** —— 临时加一个 `#[test]` 打印,拿完**立刻删掉**;
3. 提示词从 **MCP 的 `prompts/get`** 拿。⚠️ 例外:`follow_up` **不是 MCP prompt**,
   只能用同样的临时 `#[test]` 调 `guidance_text("follow_up", …)` 拿
   —— 记得先 `set_var("SPOOL_DATA_DIR", …)` 指到测试库;
4. `env -i PATH=… HOME=… USER=…` 起,`< /dev/null`;
5. ⚠️ **一次跟进要跑五到十分钟,前台会被 10 分钟超时打断 —— 放后台跑。**
6. ➕ **08-11 新增:验 MCP 工具能不能被真的调用**,直接喂一句
   「call tool X, then tool Y, report each verbatim」,然后从 `--json` 事件流里筛
   `item.completed` + `mcp_tool_call`,看 `status` / `error`。**比读模型的总结可靠得多。**

⚠️ **仍然没真跑过的**:**Claude Desktop 的写入**、**Antigravity 的一切**、
➕ **v15 之后的 MCP 那一侧**(`get_blocks` 的 `files`、`search_blocks` 的 `attachment_hits`
现在报项目不报块)、➕ **v16 之后 `thread_health` 那行「写于 …」**
—— **装完应当照 §6.2 喂一次 JSON-RPC 确认。**

### 6.2-quater ⚠️ 探子进程可以不花模型额度(但有边界)

- **`--strict-config`(codex)**:把「要试的键」和「一个肯定不存在的键」一起传。
  ⚠️ 它验的是**键**,**不验值**。
- **拿包装脚本当探针**;**翻二进制里的字符串**能证明「这个词在里面」,**不能证明「它现在还有效」**。
- **直接打 REST API 是最省的探针**,⚠️ **但它会真的消耗额度**,别拿它做循环扫描。
- **`ListModels` 返回的名字不等于能用的名字**。
- ➕ **08-11 新增:翻 CLI 自己的 bundle 找配置键名,零成本且准**。
  gemini 0.54.4 的认证键是 `security.auth.selectedType`(不是老文档的 `selectedAuthType`),
  就是 `grep -ao "security\.auth\.[a-zA-Z]*"` 翻它的 JS bundle 翻出来的。
  codex 那个 `user cancelled MCP tool call` 也是先在二进制里找到,才顺出 `readOnlyHint` 这条线。
- ➕ **08-11 新增:验第三方 CLI 的认证,用「假 HOME + symlink 凭据」**,
  别去动用户真的 `~/.gemini`:`ln -s` 真凭据进临时 HOME,配置写临时的那份。
  **凭据不复制、真配置一个字节不动。**
- ⚠️ **提示词里写了规则,连「模型会不会照做」都答不了。** 只有真跑能答。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`(或带 `--manifest-path`)。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
   ➕ **顺便看一眼每个工具都有 `annotations`** —— 有测试钉着了,但这是它的由来。
   ⚠️ **项目文件库三期会把它变成 15 个**,那时这一条要跟着改。
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本**。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 和 gemini 也一样。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **现在是 v17**。⚠️ **`client.test.ts` 里那串 `downgradeToVn` 是链式的**,
   每加一版就要在**链条最前面**加一个新的、并让原来的头一个先调它
   (现在的头是 `downgradeToV16`)。
6. ⚠️ `mcp.rs` 的 `INSTRUCTION_HEADER` 是 `r##"…"##`,**不是 `r#"…"#`**。
7. ⚠️ **版本号三处要一起动**:`package.json` / `src-tauri/tauri.conf.json` /
   `src-tauri/Cargo.toml`(⚠️ `Cargo.lock` 也会变,一起提交)。
8. ➕ **加引擎要动的地方(08-10 走了一遍,照这个清单)**:
   `engine.rs` 的 `EngineKind`(枚举 / `ALL` / `as_str` / `parse` / `models`)、
   参数适配、输出解析、`run_env`、`run_action` 的 match、
   `lib.rs` 的 `open_mcp_client_page`、
   TS 侧 `engineStore.ts` 的 `EngineKind` + `ENGINE_LABEL`、
   `settingsStore.ts` 的 `aiEngine` 联合类型(+ 新模型键要在**四处**登记:
   `PersistableKey` / 接口 / `PERSISTABLE_KEYS` / 默认值)、
   `EngineBar.tsx` 的 `ENGINE_MODELS`、`EngineConfig.tsx` 的安装入口、i18n。
   ⚠️ **`EngineKind::parse` 有一条测试断言「某个不认识的名字返回 None」** ——
   加引擎时那一行要换成另一个还不认识的名字,否则测试会红。
9. ➕ **写会毁东西的迁移(08-12 第一次遇到)**:顺序必须是「**先补齐新列 → 再删行 → 最后删列**」,
   这样死在任何一步都没丢东西、重跑即可。结尾放一条断言,不满足就**抛错、不盖版本号**。
   ⚠️ **SQLite 不能给已有列加 NOT NULL 或外键** —— 想要就得重建整张表,
   而 `attachments` 上挂着 FTS 外部内容索引和三个触发器,**重建的风险比约束的收益大**。
   这条偏差是**明知并接受**的,写在 `DESIGN_PROJECT_FILES` §7.2。
10. ➕ **默认值在 TS 和 Rust 各有一份的,翻一处等于没翻**(08-13 的 `mcpWriteEnabled`):
    凡是 `settings.json` 里**可能根本没有这个键**的开关,`settingsStore.ts` 的默认值和
    `mcp.rs` 里那个 `unwrap_or(...)` 必须一起改。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 **和 `## Notation` 那一节** ——
这些是**给模型读的契约,任何 locale 下都保持英文**。`ai note:` 也属于这一侧,**不翻**。
⚠️ **引擎名(Claude Code / Codex / Gemini CLI)是产品名,也不翻。**

⚠️ **第三个受众**:**case-study 是对外材料,整份英文** —— 台账、页面正文、图上标注全英文。

⚠️ **一条通用判据(Ocean N6 给的)**:回答「只有做这个东西的人才会问的问题」
= **开发者提示,不该出现在界面上**。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。**

```
TZ=Europe/London GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts
```

⚠️ **能合并成一次重生就合并。**
⚠️ **反过来的一条**:**动 pack 之前先想一遍"输出真的变了吗"**,别条件反射重生。
✅ **08-13 这一窗一次都没重生 —— pack 的输出一个字都没动过。**
⚠️ **fixture 现在覆盖 v13/v14/v15**:一个被作废的**置顶**块、一条 `supersedes`、
一条 `corrects`,标签阶梯的两处,➕ **三个项目级文件**(一个内联、一个提取了但没内联、
一个文件夹)。别删掉这几块。
⚠️ **fixture 里的 attachment 现在带 `threadId`,不带 `blockId`** —— Rust 那侧
`fixture_rows()` 按同一个键读,两边一起改。

### 6.6 提交与推送

**08-13:两窗的改动已经一起提交并推送了 —— `7e6ee68`。** 上一次是 `42494ae`(docs)。

⚠️ **为什么是一个提交而不是两个**:`client.ts` / `schema.sql` / `mcp.rs` 三处两窗都动过,
按文件拆不干净,而按 hunk 拆出来的中间态**测试是红的**(v16/v17 的断言和 v15 的代码对不上)。
上一次(`42b470d`)也是同样理由合的。

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

⚠️ **验证有效(六次)**:08-07 晚给他四个选择题、每个选项都写清「好处 / 代价」,
并且**画了 ASCII 草图**,他四题都秒选了推荐项。
08-07 深夜回答他「会不会过载」时**先给结论、再给真实数字表**,他直接拍了两块板。
08-10 开工前把「我需要你给的东西」列成 4 条,他一次全答完。
08-11 三个选择题全答,而且**都不是默认答案**。
08-12 两个问题都答了,第二题是多选、他挑了其中两个。
➕ **08-13 再验,而且这次最值钱**:日期提醒那件事问了三个选择题,
**他三题全答,其中第一题选的不是推荐项** —— 他把「开 app 弹一次」换成了
「不弹窗,项目顶上挂一条」,并且是在选项里写清了代价
(「你不进那个项目就永远看不见」)之后仍然这么选的。
**把代价写清楚,他会做出比你推荐的更精确的决定。**

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。
⚠️ **它们的 seed SQL 里如果写了 `attachments`,v15 之后要改成 `thread_id`。**

### 6.9 ⚠️ 真库现在长什么样(2026-08-13 装完之后量的)

**`PRAGMA user_version = 17`,2 个工作区 / 7 个项目 / 34 块,`attachments` 0 行,
`integrity_check` ok。**

⚠️ **`attachments` 是空的,这件事很重要**:它是 v15 迁移「删 url 附件」这条
在他机器上**删不掉任何东西**的原因(`DESIGN_PROJECT_FILES` §5.1 ③ 查证过两次,
08-13 装机后第三次确认:那一步跑完仍然是 0 行)。

⚠️ **库目录里有一批备份文件,占空间。** Ocean 确认没问题之后可以清掉老的
—— ⚠️ **但那是用户数据,清之前必须问他,一份都别自己删。**
➕ 08-13 又加了一份:`~/Desktop/spool-snapshot-20260813-pre-reinstall.db`(v14 / 34 块)。
