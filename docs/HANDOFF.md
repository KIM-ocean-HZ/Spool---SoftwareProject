# 交接文档 — 2026-08-10(给下一个窗口:**先问一句,再开工**)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`、`claude-code-effort-unavailable`、`chatgpt-mcp-forensics`、
> `mcp-tool-annotations-required`、`mcp-tool-routing-required`、`gemini-free-tier-closed`)。
> 完成后删除本文件。
> ⚠️ **日期标签的一处漂移,别再传下去**:上几窗把自己的工作标成了「08-11 / 08-12 / 08-13」,
> 但那些提交真实落库日期都在 **2026-08-09**(`git log --date=iso`)。
> 文中出现的 08-11 / 08-12 / 08-13 是上几窗自己写的标签,**没有回改**。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。
> ⚠️ **⭐ 失败与修复不要只写在这里。** 这份文件规定要删,而它是 case-study 最值钱的素材来源。
> **新出的每一条,顺手往 `CASE_STUDY_LEDGER.md` §3 追加一条** ——那份台账只增不改
> (规矩在 `DESIGN_CASE_STUDY` §6.3)。

---

## 0. 一句话状态 + ⭐ 下一窗直接从这里开工

**08-10 这一窗:把 F 做完了 —— 块的三个出处字段,schema v19 → v20。
`DESIGN_MCP_INTENT_ROUTING.md` 那一稿的六件(A/B/C/D/E/F)到此**代码全部落地**。
四条基线全绿(vitest 314 → 318,cargo 65 → 67),
golden **按计划重生了一次**(这是 F 自己的设计写好的,不是意外),
隔离库上 stdio 实机全通:写、拒、渲染、回读、`due_for_recheck` 都真跑过。**

✅ **已提交(`644fba3`)** —— Ocean 08-10 当窗点的头,署名自检 clean。
⚠️⚠️ **没装机、没推送 —— 这两样还要单独问他。**

| 摊 | 代码 | 装到 `/Applications` 了吗 |
|---|---|---|
| 上上窗四件(文件库三期 / AI 可读开关 / 分流 / 读改 brief) | ✅ 已提交 `0af4c3e` | ✅ 装了(08-09 15:57) |
| 上一窗五件(A/B/C/D/E 意图路由) | ✅ 已提交 `0578622` | ✅ 装了(08-09 23:44) |
| **这一窗 F(出处三字段,schema v20)** | ✅ 已提交 `644fba3`(**未推送**) | ❌ **没装,而且现在还不能装** —— 见 §0.0 |

### 0.0 ⭐⭐ 开工顺序

| 序 | 做什么 | 备注 |
|---|---|---|
| **1** | ⚠️⚠️ **先请 Ocean 跑完 §7 那五句验收**,再谈装 F | 五句验的是**装在机器上的那个 A–E 版本**。F 一装,真库就升到 v20,那一版就没了 —— **验收得重来** |
| **2** | ⚠️ **跑第 1 句之前,提醒他把那个 PDF 的 ✓ 点掉** | 真库里唯一那个附件 `ai_access` 已经是 1(他 08-09 自己批的),不点掉第 1 句验的是**假阳性** |
| **3** | ⚠️ **请他看一眼窗口** | §6.2-bis:没有任何自动化能验「长得对不对」。上上窗那四件的界面(待审面两张新卡、右侧栏 ✓、原文「N 字」)**至今没人看过** |
| **4** | 五句过了之后,再问他:**装机 / 推送**,两件分开问(提交已经做了) | ⚠️ 装 F 的注意事项在 §0.2,和以前几次**不一样** |
| **5** | 开工 §0.1 里他挑的那一摊 | 这一稿的代码活到 F 为止全清了 |

### 0.1 以上之后,顺序未定,都已拍板可开工

| 事情 | 全稿 |
|---|---|
| **首日价值三小项** | §4-7 第三条:捕捉满三条 → 一行安静提示;「今天读了什么」日卡。**这是「产品下一程」那条里最后剩的一件** |
| **M4 定时跟进** | ⚠️ 仍然卡着两个前提(§4-8) |
| **case-study 四、五、六期** | 卡在「代码全做完之后」—— ⭐ **MCP 那一摊现在真的做完了**,可以问 Ocean 是不是时候了 |
| **截图 + 演示视频全套重建** | 同上,§5.1 |

### 0.2 ⚠️⚠️ 装 F 和以前几次不一样:**这次真的会迁移**

前两次装机都是「schema 没变,老客户端只是少一个工具」。**这次不是。**

1. **装之前必须先备份真库**(§6.2-quinquies 第 1 步),`PRAGMA user_version` 应该是 **19**。
2. 装完启动 app,它会把真库从 **v19 迁到 v20**:`blocks` 和 `proposals` 各加三个**可空列**,
   **不删行、不删列、不改任何一行**(§6.3-9 那类「会毁东西的迁移」它不属于)。
   迁移前 app 自己还会写一份 `spool.pre-migration-v*.db`。
3. ⚠️⚠️ **然后必须让 Ocean 完全退出再打开 AI 客户端** —— 这次不听会**直接报错**:
   还连着的老 `--mcp` 子进程是 v19 的二进制,对着 v20 的库,每一次工具调用都会回
   「数据库是 v20,比这个 MCP 服务还新 —— 客户端在跑旧二进制」。
   **比上两次的「悄悄少一个工具」好发现,但也更吵。**
4. 装完核一眼:`PRAGMA user_version` = 20、块数没变、`integrity_check` ok、`tools/list` 仍 18。

---

## 1. ⭐⭐ 这一窗做了什么 —— F:块的三个出处字段(schema v20)

全稿 `DESIGN_MCP_INTENT_ROUTING.md` §4.6,落地记录 **§8.3**(比这里详细,含四处和稿子不一样的地方)。

```sql
ALTER TABLE blocks    ADD COLUMN source_url TEXT / retrieved_at INTEGER / recheck_after INTEGER;
ALTER TABLE proposals ADD COLUMN source_url TEXT / retrieved_at INTEGER / recheck_after INTEGER;
```

⚠️ **`proposals` 那三列是稿子里没有的。** `propose_blocks` 也开了这三个参数,而
**待审队列正是它们最容易丢的地方** —— 用户下周才点批准,那时调用方早走了,谁也补不出一个网址。

- **写侧**:`add_block` 和 `propose_blocks` 的 item 各开三个参数,共用一个 `parse_provenance`
  (两条路不许对「什么算网址」分叉)。⚠️ **`source_url` 只收 `http(s)://`,本地路径当场拒** ——
  pack 是唯一被设计成要离开这台机器的东西,一个 `/Users/hzjin/…` 进去就等于把账号名和
  目录结构写进他今后拷给任何人的每一份简报。
- **用户界面一个输入框都没加**(稿子明说的):这三个字段的用户是「出去查过官网的那个模型」。
- **两侧渲染器一起动**,块头**正下方**一行:
  `↗ https://… · retrieved 2026-08-09 · recheck after 2027-08-01`;
  过期了换成 `⚠️ may be out of date — was to be rechecked after <date>`。
  ⚠️ **说的是「可能」,而且块照样整条渲染** —— 作废是用户的判断,这一行只是提个醒。
- **兑现口两个都补了**:`get_project_overview.needs_attention.due_for_recheck`(只数没作废的)、
  pack 里过期那条的标注。⚠️ **另外自己加了第三个:`get_blocks` 把三个字段回读出去** ——
  没有它这三列就是只写不读,那正是 §5-3 那条毒。
- `source` 的描述改成「只留短标签」,URL 从此进 `source_url`。真库里那 20 个长标签**不回改**。
- `INSTRUCTION_BODY` 和 `OPENERS` 都改了(硬规矩,见 §4-1 那条铁律)。工具面**仍是 18**。

### 1.1 ⚠️⚠️ 三个日期上的坑,下一窗别踩回去

1. **`retrieved_at` / `recheck_after` 存的是 UTC 零点,渲染走 `format_utc_date` /
   `formatUtcDate`** —— **不走**库里其它时间戳那条本地时区的路。
   它们是**日子不是时刻**:「查于 2026-08-09」在时区两侧要读成同一天。
2. **`now` 现在要传进两侧渲染器**。「过没过期」必须和 pack 表头日期是同一瞬,
   而且**不能让 golden 变成定时炸弹** —— 测试把 `now` 钉死。
3. ⭐ **golden 平价测试挡不住这一类 bug,这是这一窗真正留下来的东西**:
   它比对前会把两边的 `YYYY-MM-DD` 全换成 `<DATE>`(本地时区渲染的字节在别的机器上不一样)。
   所以**「一侧走 UTC、另一侧走本地」它照样全绿**。
   两侧各补了钉死日期字面量的断言。**测试排除掉的东西,也是它规格的一部分。**
   全文台账 §3.18。

---

## 2. ⚠️ 还没验的那一层

**四条基线 + stdio 全绿一条也答不了「模型会不会真的走过去」**(§6.2-ter)。

1. ⏳ **§7 那五句(A–E 的验收)一句都还没跑。** 装在机器上的就是那一版,现在就能跑。
2. ⏳ **F 自己在真客户端里一次没跑过** —— 隔离库上 stdio 全通(写/拒/渲染/回读/计数),
   但「模型会不会主动填 `source_url` 和两个日期」只有真跑能答。**§7 第 6 句就是验它的。**
3. 上上窗那四件的「好不好看」也仍然没人验过(装了但没请他看)。

## 3. ⚠️ 给 Ocean 的两句话(不是代码活)

1. **Flux 里那两块「我会这样写…你同意吗」可以直接删,右键就有。**
   模型上一场告诉他「Spool 不支持直接改删」——**那是假的**,来源是 `add_block` 的描述
   (08-09 已经改掉了)。那两块是他自己在旧的运行卡片上点「存回项目」存进去的。
2. **装机之后要完全退出再打开 AI 客户端** —— ⚠️ **这次不听会直接报错**(§0.2 第 3 条)。

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
     ⚠️ 参数只认 `attachment_id`,**永远不接受路径**,而且必须属于所申请的那个项目
   - ~~M2:待审闸跑过一段真实使用后,评估写入开关能否默认打开~~ ——
     ✅ **已落地(2026-08-13),默认打开了**
   - ➕ **2026-08-11 新增铁律**:**每个工具都必须写 `annotations`**。少一个,
     在本地一点声音都没有,但第三方客户端会拒绝调用。已有测试钉住
   - ➕ **2026-08-09 晚新增铁律(同一类的第二条)**:**加工具的同时必须改
     `OPENERS` 和 `INSTRUCTION_BODY` 这两段路由文本**。
     ✅ **2026-08-09 已落地,并且钉成测试了**(`every_tool_is_reachable_from_the_routing_text`)。
     全稿 + 取证 + 六件设计:`DESIGN_MCP_INTENT_ROUTING.md`(**三题已拍板,都选乙**)。
     ✅ **A 门把手 / B 路由 / C `list_threads` 三字段 / D `add_block` 开 `corrects` /
     E `get_project_overview`(工具面 17 → 18)全部落地(2026-08-09,§8)**;
     ✅ **F 出处三字段(schema v20)也落地了(2026-08-10,§8.3)—— 这一稿代码全清,
     只欠 §7 那五句真跑**
   - ➕ **2026-08-10 新增(F 带出来的)**:**加了会被写的列,就要在同一次改动里给它读回来的口**。
     `recheck_after` 有三个(pack 标注 / `due_for_recheck` / `get_blocks` 回读),
     理由是 §5-3 那条「v13 给了两把刀但没人提醒你去用」。台账 §3.18
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
   **Windows 上要另写**。
   ➕ **2026-08-10**:`format_utc_date` / `parse_iso_date` 走的是 `libc::gmtime_r` /
   `libc::timegm`,**Windows 上这两个名字不一样**(`_mkgmtime`),移植时要换
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
     —— ⏳ **仍未开工,是这一条里最后剩的**
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   ~~M3 没新东西就静默~~ ✅(08-07)/ **M4 定时(仍然只在 M3 被证明有用之后)**
   ⚠️ **硬约束**:`DESIGN_CONTEXT_HYGIENE` §9.5 —— **M4 上线前应当先有一个「往外拿」的动作**。
   定时 = 自动往项目里灌块而另一头没有出口,按真库数字**每周一次跟进约 14 周撞满预算**,
   而那时去重帮不上任何忙
   ⚠️ **2026-08-11:跟进现在是右侧栏唯一的动作了**(§5-C),它的分量比以前重
   ➕ **2026-08-09:brief 现在能被 MCP 读到、也能被它提议改** ——
   M4 真做的时候,「谁能改 brief」这条线已经画好了,别推翻它
   ➕ **2026-08-09 晚**:`list_threads` 现在报 `following_up` 了,
   `applyBriefSuggestion` 也开始动 `updated_at` —— M4 做定时调度时这两个都是现成的输入
   ➕ **2026-08-10**:`recheck_after` 是**第二个天然的定时触发源**,而且它比 brief 精确
   (是块自己说的日子)。M4 想找「什么时候该去看一眼」,先看这一列
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
    ➕ **2026-08-09 晚**:§9.3 那条「被更正的旧块还在以有效结论的样子渲染」的毒,
    `add_block` 这一侧的解药已经给了(`ref_kind`)—— 但**还没在真客户端上验过**
    ➕ **2026-08-10**:§9.6 那条「两把刀没人提醒你去用」现在有了第一个反例 ——
    `recheck_after` 是**带自己提醒机制的第一列**(见 §4-1 那条新铁律)
12. ➕ **三份计划稿(2026-08-08 Ocean 提)**
    - ~~**`DESIGN_PROJECT_FILES.md`**~~ —— ✅ **一期 + 二期 2026-08-12(v15)、
      三期 2026-08-09(v18)全部落地**,记录在该稿 §7 / §8
    - ~~**`DESIGN_WORKBENCH.md` §10.1 / §12 / §13**~~ —— ✅ 全部落地
    - **`DESIGN_CASE_STUDY.md`** —— 给研究生申请用的公开 case-study。
      ✅ 第一期(台账)、第三期(八栏正文)已落地。
      **剩四、五、六期**,卡在「代码全做完之后」这个时机。
      ➕ **台账新增:§3.9/§3.10/§3.11(08-11)、§3.12(08-12)、§3.13/§3.14(08-13)、
      ➕ §3.15(08-09:为一扇已经开着的门做锁)、§3.16(08-09:三个工具上线即隐身)、
      ➕ §3.17(08-09:同一条规矩破第二次之后被钉成断言)、
      ➕ §3.18(08-10:没人读的列 + 那条看不见这个 bug 的测试)**
      ➕ ✅ **台账 §5 的工具面计数已经改对了(2026-08-09,Ocean 当窗点头破例)**:
      10 读 / 4 写 → **12 读 / 6 写,共 18**,旧数字作为趋势线留了一行。
      ⚠️ **F 没有加工具,那个数字仍然是 18,不用动。**
      ⚠️ **仍然是破例不是废规矩** —— 下次数字变了还是加新行
13. ~~➕ **「把整场对话分流进项目」** —— 决定 4,走选项 A~~ ——
    ✅ **已落地(2026-08-09)**,记录在 `DESIGN_CONTEXT_HYGIENE` §9.5.1。
    ⚠️ **那条预算警告仍然成立,别丢**:原文块的 `source_text` 如果照搬整场对话就是**文档级**的,
    三到四次分流撞满一个项目的预算。落地的做法是**只把用户的提问序列存成原文块**,
    并且**不设长度上限**、改成把字数报给模型和用户

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. ~~**块正文里的截止日期没人管**~~ —— ✅ **2026-08-13 落地**(schema v17)。
   ⚠️ 形状是「不弹窗,项目顶上挂一条」,时刻表 `NOTICE_STAGES = [60, 30, 7]`,
   ✕ 只压当前这一档
   ⚠️ **同形的第二例仍然没人管**(`DESIGN_CONTEXT_HYGIENE` §9.6):v13 给了作废/更正
   这两把刀,**但没有任何东西会提醒用户去用**。
   ➕ **2026-08-09:AI 这一侧的入口已经补齐了**(`ref_kind` 现在 `add_block` 也能带),
   **但「提醒用户去用」这一半仍然没人做**
   ➕ ⚠️ **2026-08-10 新增一条,和上面那条是同形的**:`recheck_after` 过期了,
   **pack 里会标、`get_project_overview` 会数,但 Spool 界面上一个字都不显示**。
   ⏸ 这是 F 自己**明确推迟**的(稿子 §4.6 兑现口 3):项目顶上那条日期提醒(v17,
   `NOTICE_STAGES`)是**另一套机制**(它从正文里认日期),两套合并要单独想,别顺手做
4. ~~**重复块:用户想清但清不动**~~ —— ✅ **2026-08-11 换了个方向解决**:
   去重按钮撤了,改成**项目管理每行一个免费的本地角标**「⚠️ N 块重复」。
   ⚠️ **只认逐字节相同**,不做模糊相似度
5. ~~**摘要没有写作时间**~~ —— ✅ **2026-08-13 落地**(schema v16)。记进库,UI 不显示
6. **一件事被拆成两个项目** —— ✅ **Ocean:「不管,这种情况几乎没有」。** 留档,因为它仍然是
   「用对话标题自动建项目」被否的理由

### 5-B ~~写入开关默认打开~~ —— ✅ 2026-08-13 落地

⚠️⚠️ **那条附带的判断已经被证伪了,别再传下去**:原话是「Ocean 日常用法结构上永远落在
`add_block` 那侧,分流基本不会自发发生」。**08-09 晚上他亲口说了一句标准分流句**
(「flux 相关的存 flux,其他存原来的升学规划」)。**触发场景是真的,是模型没接住** ——
那一场 `propose_blocks` **调用 0 次**、`add_block` **12 次**(真库取证)。
➕ **2026-08-09 已修**:`OPENERS` 里现在有两行专门钓这种句式,并且明说了
**不许用两次 `add_block` 代替**。
⚠️ **但这只是提示词。真跑之前不算数**(§6.2-ter)—— §7 第 3 句就是验它的。

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
- ➕ **2026-08-10**:pack 里可能多出一行 `↗ …`,**但那是拷出去的文本,不是界面** ——
  界面上 F 一个像素都没改,截图不受影响

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
npx vitest run                                    # 318 通过(2026-08-10)
cargo test --manifest-path src-tauri/Cargo.toml   # 67 通过(2026-08-10)
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ **vitest 314 → 318**:出处三件(渲染两条 + 「哪一段都可以缺席」一条)+ 待审批准后携带出处一条。
cargo **65 → 67**:日期往返一条、`add_block` 记出处并被读回来一条。

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。
⚠️ **改官网(`site/*.html`、`scripts/site-zh-*.html` 或中文串)之后要跑
`node scripts/build-site-zh.mjs`**。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。**

⚠️ **`engine.rs` 里有三个测试真的会 fork 子进程**,它们**共用一个 `STREAM_TESTS` 互斥锁**。

⚠️ **有一条既有的 `dead_code` 警告**(`ThreadMeta.updated_at` 没人读),**不是这几窗弄出来的**,
按 CLAUDE.md §3 没动它。

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
- ➕ **更省的做法,推荐(08-09 / 08-10 三窗都用了)**:**当场建一个新库**:
  `sed 's/--.*$//' src/lib/db/schema.sql | sqlite3 lab/spool.db`,再
  `PRAGMA user_version = 20` + 手写几行 seed + 一个
  `{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"zh"}` 的 settings.json。
  **三十秒,而且想造什么状态就造什么状态。**
  ➕ **08-10 顺手证实了一件事**:把那个库的 `user_version` 手动改成 19 再喂新二进制,
  **schema 版本守卫真的会拦下来并说人话** —— 想验「版本不匹配长什么样」,这是最快的路
- ⚠️ **返回文本前面可能有一行「人话头条」**(`human_headline`),
  解析 JSON 之前要先跳到第一个 `{` 或 `[`,别直接 `json.loads`
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
7. ⚠️⚠️ **下一次装(F)不一样:它会真的迁移(v19 → v20)。**
   `user_version` 装完要变成 **20**,块数不变;app 自己会先写一份
   `spool.pre-migration-v*.db`。**而且这次不重开 AI 客户端会直接报错**,不是少个工具。
   详见 §0.2

### 6.2-ter ⚠️ 子进程 / 外部客户端的活,必须真跑一次

**已被七次独立事件证实**(全部收进 `CASE_STUDY_LEDGER.md` §3.4/§3.5/§3.6/§3.8/§3.9/§3.10/§3.16):
`CLAUDE_CODE_EFFORT_LEVEL`、跟进的 URL 规则、Codex 免费档、
Gemini 免费额度(稿子 1500/天,实测 20/天,差 75 倍)、
**少一个 `annotations` 导致两个工具在 codex 上调不动**、
**gemini 把错误信封打在 stderr 上**、
➕ **三个工具描述写得很好、annotations 齐、stdio 跑通,但两段路由文本没改,
真跑起来三件里两件模型根本没走到**。

**⚠️ 提示词里写了规则 ≠ 规则生效。稿子里写了数字 ≠ 数字是真的。
工具描述写得再对 ≠ 第三方客户端调得动。➕ 工具存在 ≠ 模型找得到它。**

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
➕ **08-09 那一窗的三个新工具在 ChatGPT 里跑过了(结论就是上一窗修的东西)**,
➕ ⚠️ **A–E 五件修完之后一次都还没在真客户端上跑过**(§7 就是干这个的),
➕ ⚠️ **F 也一样:隔离库上 stdio 全通,但真客户端零次**(§7 第 6 句)。

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
2. **开测第一件事:`tools/list` 数一下工具个数。** ➕ **2026-08-09 起是 18 个**
   (12 读 + 6 写;写的那 6 个里有两个其实什么都不存 —— 它们只是排队等用户点头)。
   ➕ **F 没有加工具,仍然 18。**
   ➕ **顺便看一眼每个工具都有 `annotations`** —— 有测试钉着了。
   ➕ **prompts 是 5 个**。
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本**。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 和 gemini 也一样。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **现在是 v20**。⚠️ **`client.test.ts` 里那串 `downgradeToVn` 是链式的**,
   每加一版就要在**链条最前面**加一个新的、并让原来的头一个先调它
   (现在的头是 `downgradeToV19`)。
   ➕ **还有两处容易忘**:那份测试里有几处拿 `SELECT * FROM threads` / `SELECT * FROM blocks`
   前后对比,新增的列要加进 `stripBriefSuggestion` / `stripProvenance` 那两个 helper,
   否则会红。
6. ⚠️ `mcp.rs` 的 `INSTRUCTION_HEADER` 是 `r##"…"##`,**不是 `r#"…"#`**。
   ➕ ⚠️ **别把它和 `INSTRUCTION_BODY` 搞混**:`INSTRUCTION_HEADER` 是 **pack 的授权表头**;
   `INSTRUCTION_BODY` 是 **`initialize` instructions 的正文**,
   和 `OPENERS` 一起构成**路由文本**。加工具要改的是后两个。
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
   ➕ **v18/v19/v20 都不属于这一类**:一张新表 / 三个可空列 / 六个可空列,跑一半和跑完没区别。
10. **默认值在 TS 和 Rust 各有一份的,翻一处等于没翻**(`mcpWriteEnabled`)。
11. ➕ **加新工具时,`every_tool_declares_its_read_write_annotation`
    那条测试里写死了「哪几个是写工具」的名单和顺序** —— 加**写**工具就要改那一行。
    ⚠️ 加**读**工具不用改(08-09 加 `get_project_overview` 时它一声没吭)。
12. ➕ **加工具还必须给 `OPENERS` 加一行**,
    否则 `every_tool_is_reachable_from_the_routing_text` 会红。**这条红是对的,别绕过它** ——
    绕过去的代价见台账 §3.16。
    ⚠️ **只加参数不加工具的话它不会红**,但该说的话还是要说(F 就是这么办的:
    `INSTRUCTION_BODY` 加了一段,`OPENERS` 加了一行「这些还准吗」)。
13. ➕ **2026-08-10 新增:块的两个日期列不走本地时区。**
    `retrieved_at` / `recheck_after` 是**日子**,存 UTC 零点,
    渲染必须走 `format_utc_date`(Rust)/ `formatUtcDate`(TS)。
    其余所有时间戳(`created_at`、`stale_at` …)仍然走本地时区那条路,**别混**。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 **和 `## Notation` 那一节** ——
这些是**给模型读的契约,任何 locale 下都保持英文**。`ai note:` 也属于这一侧,**不翻**。
➕ **pack 里的块级标记全都属于这一侧**:`note:` / `↩ cites:` / `⚠️ one point…`,
➕ **以及 08-10 新增的 `↗ … · retrieved … · recheck after …`**。
⚠️ **引擎名(Claude Code / Codex / Gemini CLI)是产品名,也不翻。**
➕ **提示词正文(`prompts/get` 那几份)是双语的**,和工具描述不一样。
➕ ⚠️ **`OPENERS` 里的触发词是中英并列的**,散文部分仍然全英文。
理由:那些不是界面文案,是**用户可能说出口的原话样例**,而用户说中文。**箭头右边永远不翻。**

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
✅ **08-13、08-09 三窗都一次没重生**;**08-10(F)重生了一次,那是设计里写好的**。
⚠️ **fixture 现在覆盖 v13/v14/v15/v20**:一个被作废的**置顶**块、一条 `supersedes`、
一条 `corrects`,标签阶梯的两处,**三个项目级文件**,
➕ **出处三块(b10 全三项且已过期 / b11 只有查证日期 / b12 全三项且还没到期)**。别删掉这几块。
⚠️ **fixture 里的 attachment 带 `threadId`,不带 `blockId`** —— Rust 那侧
`fixture_rows()` 按同一个键读,两边一起改。
⚠️⚠️ **golden 比对前会把两边的 `YYYY-MM-DD` 全换成 `<DATE>`** ——
所以它**看不见日期本身对不对**(「一侧 UTC、一侧本地」它照样全绿)。
钉日期的断言在 `assemble.test.ts` 的 `provenance (§4.6)` 和 mcp.rs 的
`a_retrieval_date_survives_the_round_trip_as_the_same_day`。台账 §3.18。

### 6.6 提交与推送

**08-10 这一窗:F 已提交(`644fba3`,17 个文件,逐个 `git add`),⚠️ 但没推送。**

- ⚠️ **提交、推送、装机三件都要单独问 Ocean,每次都要。** 他明示的是**那一次**的授权。
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
  `git status --short`,不认识的改动先看 diff。**逐个文件 `git add`。**

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

⚠️ **验证有效(七次)**:08-07 晚四个选择题、每个选项写清「好处 / 代价」+ ASCII 草图 → 四题秒选。
08-07 深夜「会不会过载」先给结论、再给真实数字表 → 当场拍两块板。
08-10 把「我需要你给的东西」列成 4 条 → 一次全答完。
08-11 三个选择题全答,**都不是默认答案**。08-12 两题都答。
➕ **08-13 最值钱**:日期提醒三个选择题全答,**第一题选的不是推荐项** ——
他在读到代价(「你不进那个项目就永远看不见」)之后仍然这么选。
**把代价写清楚,他会做出比你推荐的更精确的决定。**
➕ **08-09**:「先提交还是先开工」三个选项各写清好处/代价 → 秒选,而且选的是
**比推荐项更彻底的那个**(连推送一起)。同一条规律第七次成立。

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。
⚠️ **它们的 seed SQL 里如果写了 `attachments`,v15 之后要改成 `thread_id`。**

### 6.9 ⚠️ 真库现在长什么样

**这一窗一个字节都没碰真库**(全部验证在临时新建的隔离库上做,做完删了)。
最后一次量是 08-09 23:44 装完之后:`PRAGMA user_version = 19`,**46 块**,
2 个活项目,1 个附件,`integrity_check` ok。
⚠️ **下次要准数就现场量,别抄这个。**

⚠️ **「7 个项目」这个说法上几窗一直在传,它数的是行数** —— `list_threads` 只报 **2 个**,
因为另外 5 个是软删的。下次跟他说项目数之前先看 `deleted_at IS NULL`。

⚠️ **库目录里有一批备份文件,占空间。** Ocean 确认没问题之后可以清掉老的
—— ⚠️ **但那是用户数据,清之前必须问他,一份都别自己删。**
最近两份:`~/Desktop/spool-snapshot-20260809-234225-pre-routing.db` 和库目录里
app 自己写的 `spool.pre-migration-v17-2026-08-09T07-57-53-212Z.db`。

---

## 7. ⭐ 验收:六句话,每句钉一个工具

前五句是 A–E 的(`DESIGN_MCP_INTENT_ROUTING` §7.1),**装在机器上的就是那一版,现在就能跑**。
第 6 句是 F 的,**要等 F 装机之后才能跑**。

⚠️⚠️ **先让 Ocean 完全退出再打开 AI 客户端。**
⚠️⚠️ **跑第 1 句之前,先让他把那个 PDF 的 ✓ 点掉**:真库里唯一那个附件
`ai_access` 已经是 1,不点掉的话模型直接就读到了,第 1 句验的是假阳性。
⚠️⚠️ **判据是 `mcp_tool_call` 事件流里的工具名,不是模型说得漂不漂亮。**

> 1. 「看看〈申请规划〉里有哪些文件,里面写了什么?」
>    → 必须出现 **`request_file_access`**。**不出现就是没修好。**
> 2. 「跟进一下〈申请规划〉。」
>    → 必须**先**出现 **`get_follow_up_brief`**,并且**先把 brief 念回来**,再问或再查。
> 3. 「把这几条分别存进 Flux 和申请规划。」
>    → 必须出现 **`propose_blocks`**,**不能是两次 `add_block`**。
> 4. 「〈申请规划〉现在什么情况?」
>    → 必须出现 **`get_project_overview`**,**一次**,
>    而不是 `list_threads` + `get_pack` + `get_follow_up_brief` 三连。
> 5. 「库里有一条结论已经不对了,帮我记一下正确的。」
>    → 写回去的那一次必须带 **`ref_kind: "corrects"` + `ref_block_id`**,
>    **不能只是正文开头写「更正」**。
> 6. (**F,装机之后**)「去查一下 CMU 那个项目今年的截止日期,查到了存进〈申请规划〉。」
>    → 那次 `add_block` 必须带 **`source_url` + `retrieved_at`**,
>    ⭐ 而且**最好自己带上 `recheck_after`** —— 截止日期是典型的会过期的事实。
>    **只写正文不带这三个字段,就是提示词没写到位。**

⚠️ **两个客户端都要跑**:ChatGPT(Codex)归 Ocean;
**Claude Desktop 的写入侧至今一次没真跑过**(§6.2-ter 末尾)。

### 7.1 给 Ocean 的大白话版(可以直接复制给他)

> **先做两件小事,不然第 1 句白跑:**
> ① **把 ChatGPT 完全退出再打开一次**(不然它连的还是旧的,新工具不会出现);
> ② 打开 Spool →〈申请规划〉→ 右边「项目文件」→ 把那个 PDF 下面的 **✓ 点掉**
> (你 08-09 已经批过它了,不点掉的话 AI 直接就能读,第 1 句就试不出东西来)。
>
> 然后一句一句发过去,每句发完看它**做了什么**,不是看它说了什么:
>
> 1. 「看看我 Spool 里〈申请规划〉有哪些文件,里面写了什么?」
>    —— 它应该**主动向你申请**读那个文件。回 Spool 待审面能看到那张卡。
>    ❌ 如果它又叫你「把 PDF 传给我」,就是没修好。
> 2. 「跟进一下〈申请规划〉。」
>    —— 它应该**先把你现在盯的那几条念给你听**,再去查。
>    ❌ 如果它自己编了个目标就开始查,没修好。
> 3. 「把这几条分别存进 Flux 和申请规划。」
>    —— 它应该说「Spool 里有 N 条待你过目」。
>    ❌ 如果它说「已经存好了」,没修好。
> 4. 「〈申请规划〉现在什么情况?」
>    —— 它应该**一次**就说全:摘要、在盯什么、有几个文件、最近几条。
> 5. 「〈申请规划〉里有条结论不对了,正确的是 XXX,帮我记一下。」
>    —— 存完之后回 Spool 看那条**旧块底下有没有挂出一行「有一点被更正了」**。
>    ❌ 只是新块正文开头写着「更正」两个字,不算。
>
> **第 6 句要等我把新版装上去之后再跑**(装了才有这个功能):
>
> 6. 「去查一下 CMU 那个项目今年的截止日期,查到了存进〈申请规划〉。」
>    —— 存完回 Spool 打开〈申请规划〉,**把这个项目打个包拷出来看一眼**:
>    那一块底下应该多一行,写着它是从**哪个网址**查的、**哪天**查的、**什么时候该再查一次**。
>    ❌ 如果只有正文、没有那一行,就是模型没填 —— 那是提示词的问题,不是功能坏了。
