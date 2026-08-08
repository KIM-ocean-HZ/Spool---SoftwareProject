# 交接文档 — 2026-08-12(给下一个窗口:**开工窗**)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`、`claude-code-effort-unavailable`、`chatgpt-mcp-forensics`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。
> ⚠️ **⭐ 失败与修复不要只写在这里。** 这份文件规定要删,而它是 case-study 最值钱的素材来源。
> **新出的每一条,顺手往 `CASE_STUDY_LEDGER.md` §3 追加一条** ——那份台账只增不改
> (规矩在 `DESIGN_CASE_STUDY` §6.3)。

---

## 0. 一句话状态 + ⭐ 下一窗直接从这里开工

**08-12 这一窗:先给 Ocean 重装了正式版让他自己看界面(他上一窗改的四屏,连着两窗没人看过),
然后把 `DESIGN_WORKBENCH` §11.4 的 C / D / E 三件全做完,又做了 §10.1(块正文 MD 渲染)。
D 和 C 拿 codex 真跑过一次,三条规则模型全遵守了。没有阻塞项。**

### 0.0 ⭐⭐ 开工顺序

| 序 | 做什么 | 全稿 | 备注 |
|---|---|---|---|
| **1** | ⚠️ **再装一次,请 Ocean 看块流** | 本文件 §3 | 08-12 装的那一版**不含 MD 渲染**。**块正文的样子这一窗变化最大**(标题、列表、粗体、代码块),而这一层只有他能验 |
| **2** | 挑一件开工 | 下表 | 建议 **项目文件库**(`DESIGN_PROJECT_FILES`)—— 它同时解开 §10.2 剩下那两个键 |

**以上之后的,顺序未定,都已拍板可开工:**

| 事情 | 全稿 |
|---|---|
| **项目文件库**(附件搬项目级 + **schema v15** + MCP 申请访问) | `DESIGN_PROJECT_FILES.md` —— 四件全拍完(§5)。⚠️ **`附加文件`/`附加链接` 两个键的删除属于这一摊**,见 `DESIGN_WORKBENCH` §10.4 |
| **分流「把整场对话分流进项目」(走选项 A)** | `DESIGN_CONTEXT_HYGIENE` §9.5 |
| **MCP 读 follow up brief + 建议改(走过目闸)** | §4-1 |
| **C1 块正文里的截止日期 → 做弹窗提醒** | §5-3 ⚠️ **这一窗又撞见一次**:〈申请规划〉里那块 Cornell 截止日期,周回顾的提示词现在明写着「不许把它当项目的截止日期」——**说明这个缺口是真的** |
| **摘要写作时间记进数据库(UI 不显示)** | §5-5 |
| **写入开关默认打开** | §5-B —— 条件早已满足,只是没人去改 |
| **「只看我写的」过滤** | §4-7 |

---

## 1. ⭐⭐ 这一窗做了什么

**全文 `DESIGN_WORKBENCH.md` §11.4(C/D/E)和 §10.4(MD 渲染)。**

### 1.1 D —— 周回顾接上截止日期(Ocean 明说想要的那一件)

- `get_digest` 头部之后多一节 **`## 截止日期`**,从**全部在范围内的项目**里取(不是从活跃的取)。
  ⭐ **理由**:一个设了日期、但这一周什么也没发生的项目,在 digest 里**原本完全不出现**
  —— 而那恰恰是回顾最该点名的。每行还标着这一周动没动。
- 新增 `days_until()` —— **`deadline.ts` 的 `dueInDays` 的 Rust 移植**,比的是**本地午夜**。
  ⚠️ 两处必须给同一个数字,侧边栏角标说「今天到期」而回顾说「还剩 1 天」比不写更糟。
- `weekly_review` 提示词从「四段」改成**按项目一段、每段三行**(做了什么 · 还剩什么 · 离截止还有几天)。

### 1.2 C —— 引擎位那条路上不再问「你同意吗」

`guidance_text` 分出一个 **`guidance_text_headless`**,只有 `lib.rs` 的 `ai_engine_run` 用它。
差别只有结尾那一步:无人值守时明写「别问、也别调用写入工具,用户在运行卡片上点存」。
⚠️ **MCP 两个 surface 一个字没动** —— 那边真的有人在。

### 1.3 E —— 「起草跟进目标」改叫「找出还没解决的问题」

纯文案 + i18n,机制没动。按钮「让 AI 起个草」→「让 AI 看看还缺什么」。

### 1.4 §10.1 —— 块正文渲染成 Markdown(自己写的,零依赖)

⭐ **§10.1 那个坑绕开了**:解析器**只输出偏移量、不重写文本**,所以搜索命中的坐标系没变,
「跳到命中处」一行都没改。测试钉着这条。**做了什么 / 刻意没做什么,全在 §10.4。**

### 1.5 ✅ 真跑过一次(§6.2-ter)

codex 0.146.1,真库副本,argv 从 Rust 打印出来的,`env -i` + `< /dev/null`,后台跑。
**三条规则模型全遵守了**:按项目分段、截止日期原样照抄(`还剩 46 天`)、**结尾没有那句问话**。
**7 个 MCP 工具调用全部 `completed`**(list_threads ×3 / get_pack ×3 / get_blocks ×1)
—— 上一窗那个 annotations 修复仍然是好的。
⚠️ 输出里那句「读取被取消」是**模型在转述〈回顾〉项目里那一块的内容**(那块正是旧 bug 的产物),
不是新的失败。

---

## 2. ⚠️ 还没验的那一层:块流长什么样

MD 渲染这一件**改的正是"每一块看起来是什么样"**,而 §6.2-bis 那三个旁证
(CPU 0.0% / WAL 生成 / stderr 干净)**只能排除白屏,排除不了"长得不对"**。

具体要他看的:一块 AI 写的长正文里,**`#` 变成标题了吗、`-` 变成圆点了吗、
`**` 变粗了吗、``` 变成灰底代码块了吗、原来的 `==高亮==` 还在吗**。
⚠️ 另外**空行的含义变了**:以前是一个空行,现在是段间距 —— 观感上会更紧凑,这是有意的。

---

## 3. ⚠️ 重装状态

- **08-12 装了一次**(build 时间 10:38),Ocean 当场看了左侧边栏 / 周回顾一屏 / 右侧栏 / 项目管理。
- ⚠️ **那一版不含 §11.4 和 §10.1** —— 它们是装完之后写的。**下一窗第一件事是再装一次。**
- 装法见 §6.2-quinquies。旧版备份留在 `/Applications/Spool.app.previous-*`,
  ⚠️ **那是 Ocean 的机器上的东西,要清先问他。**

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
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**。
     ✅ 闸门条件已换(2026-08-08 B3)且**已满足**,⏳ **但默认值还没改**(§5-B)
   - ➕ **2026-08-11 新增铁律**:**每个工具都必须写 `annotations`**。少一个,
     在本地一点声音都没有,但第三方客户端会拒绝调用(§1.2)。已有测试钉住
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
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"。
     ⚠️ **W7 那一半已经落地了**(08-07 晚,批注当标题);**「只看我写的」过滤还没做**
     —— ⚠️ 这条是 Ocean「提高我的信息权重」那个诉求的正确落点,
     ⚠️⚠️ **而且按 §3.4 第 4 条,它会从"锦上添花"变成"必需品"**
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
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
    ✅ **§11.4(C / D / E)2026-08-12 全部落地**,落地记录在 §11.4。
    ✅ **§10.1(块正文 MD 渲染)2026-08-12 落地**,记录在 §10.4。
    ➕ **§10.2 只删了「复制」键(10→9)**;`附加文件` / `附加链接` **有意留着** ——
    它们的去处(右侧栏项目文件面板)还没做,现在删等于功能消失。**归到第 12 条那一摊。**
    **这一摊已经返工过三轮 —— 下一轮反馈大概率还在这里。**
11. ⚠️ **上下文卫生** —— 全稿 `DESIGN_CONTEXT_HYGIENE.md`。
    五件里 **1/2/3/4 已落地**(08-07 深夜,见 §8),**拍板甲 + 乙已落地**(08-08,§9.3.1),
    **两处反转已落地**(08-09,§1.1-ter)。
    第 5 件(AI 一句话标签)**按稿子自己的判断口径先不做**,缺口记在 §8.6。
    ⚠️ §2 那一节的调研**会过期**(2026-08 查的),下次动这摊之前重查。
    ➕ **§9 是实测账,动这摊之前先读它**
12. ➕ **三份计划稿(2026-08-08 Ocean 提)**
    - **`DESIGN_PROJECT_FILES.md`** —— 附件从块级搬到项目级 + 右侧栏「项目文件」+
      **MCP 申请访问文件**。⚠️ 这一件解开了「自动挂本地文件」当初被否的死结:
      **路径只能从用户的文件选择器来,AI 只能在用户选定的集合里申请**,注入链断了。
      ⚠️ **schema v15**;⚠️ **工具面会从 14 个变 15 个**;✅ 三件待拍板已全部拍完
    - ~~**`DESIGN_WORKBENCH.md` §10.1** 块正文渲染成 Markdown~~ —— ✅ 已落地(2026-08-12,
      自己写的小渲染器,零依赖)。**§10.2 还剩两个键**,见第 10 条
    - **`DESIGN_CASE_STUDY.md`** —— 给研究生申请用的公开 case-study。
      ✅ 第一期(台账)、第三期(八栏正文)已落地。
      **剩四、五、六期**,卡在「代码全做完之后」这个时机。
      ➕ **台账 08-11 新增三条:§3.9 / §3.10 / §3.11**
13. ➕ **「把整场对话分流进项目」** —— 决定 4,走选项 A,**未开工**。
    ⚠️ **做之前必读 `DESIGN_CONTEXT_HYGIENE` §9.5**:原文块的 `source_text` 是**文档级**的,
    会把 MCP 从全库最省的写入变成最贵的写入,**三到四次分流就撞满一个项目的预算**。
    路线:只把用户的提问序列存成原文块,AI 的结论各自署名 `↩ cites:` 指回去。
    ⚠️⚠️ **它同时是给 `propose_blocks` 造触发场景的那个功能** —— 见 §5-B

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. **块正文里的截止日期没人管** —— ✅ **2026-08-08 Ocean 拍板:做一个弹窗之类的提醒。**
   ⚠️ **2026-08-12 又撞见一次**:周回顾的提示词里现在不得不明写一条禁令
   「不许把块正文里的日期当成项目的截止日期」—— 因为〈申请规划〉里真有那么一块
   (Cornell 的三个申请截止日期)。**提示词只能让 AI 别搞混,不能替用户记住。**
   ⚠️ **08-07 走了半步**:项目管理按 `threads.deadline` 排序、快到期会变色。
   **但块正文里那种日期还是没人管** —— 那要能从正文里认出日期,是另一件事。
   ⚠️ **同形的第二例**(`DESIGN_CONTEXT_HYGIENE` §9.6):v13 给了作废/更正这两把刀,
   **但没有任何东西会提醒用户去用**
4. ~~**重复块:用户想清但清不动**~~ —— ✅ **2026-08-11 换了个方向解决**:
   去重按钮撤了,改成**项目管理每行一个免费的本地角标**「⚠️ N 块重复」
   (`duplicateCountsByThread`,一条 GROUP BY,零成本)。
   ⚠️ **只认逐字节相同**,不做模糊相似度 —— 有阈值的角标会误报,而误报比没有更糟。
   ✅ 拿真库副本验过:`Flux → 1`,正是他说的那一对
5. **摘要没有写作时间** —— ✅ **2026-08-08 Ocean 拍板:记进数据库,但 UI 不显示**
6. **一件事被拆成两个项目** —— ✅ **Ocean:「不管,这种情况几乎没有」。** 留档,因为它仍然是
   「用对话标题自动建项目」被否的理由

### 5-B ⚠️ 写入开关默认打开:条件已满足,但还没改

B3 把闸门条件换成「`add_block` 真跑过且没出事 → 可以默认打开」,而那已经发生了
(08-07 ChatGPT 写进 11 块,两次报错自己恢复)。**所以这件现在是可做的,只是没人做。**

⚠️ **改之前先想清一件事**:Ocean 日常用法(问 AI 核验 → 存结论)**结构上永远落在
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
- ➕ **2026-08-12:块流的样子又变了一次(MD 渲染)** —— 截图重建时这一屏是重点

### 5.2 其余待办

| # | 事情 | 状态 |
|---|---|---|
| ~~**D**~~ | 周回顾接上截止日期 | ✅ **2026-08-12 落地**(§11.4) |
| ~~**C**~~ | 删掉提示词结尾那句「你同意吗」 | ✅ **2026-08-12 落地**,并且真跑验过(§1.5) |
| ~~**E**~~ | 跟进改叫法「找出还没解决的问题」 | ✅ **2026-08-12 落地** |
| **M4** | Follow up 定时 | ⚠️ 仍然要等 M3 被证明有用,⚠️ 并且要先有一个「往外拿」的动作(§4-8) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | 写入开关能否默认打开 | ✅ 条件已满足 —— 见 §5-B,现在缺的只是有人去改 |
| F | 截图 + 演示脚本整体重建 | Ocean 已批:排在 app 代码全部做完之后 |
| G | Hero 内嵌 15 秒演示视频 | 视频没录之前这一屏保持现状 |
| H | 对外动作 | 每一件都需 Ocean 单独明示 |
| I | 装 Antigravity 实测 | 要 `curl \| bash` 装到他机器上,**需 Ocean 明示** |

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 280 通过(2026-08-12)
cargo test --manifest-path src-tauri/Cargo.toml   # 58 通过(2026-08-12)
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ **vitest 262 → 280**:markdown 解析 7 + 行内标记 7 + `MarkdownContent` 渲染 4(08-12)。
⚠️ 那 4 个用 `react-dom/server` 的 `renderToStaticMarkup` 直接比字符串 —— **不需要 jsdom**,
是这台机器上唯一能"看见"渲染结果的办法(memory `isolated-verify-workflow` §28)。
cargo **56 → 58**:截止日期一节 1 个 + 无人值守提示词 1 个(08-12)。
⚠️ 再往前:vitest 268 → 262 是故意的(删掉自动压缩那 7 个测试、新增 `listRunsForAction`);
cargo 53 → 56 是 annotations 守卫 1 + gemini 报错 2。

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。
⚠️ **改官网(`site/*.html` 或中文串)之后要跑 `node scripts/build-site-zh.mjs`**。

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

### 6.2-quinquies ⚠️ 给 Ocean 重装正式版(08-12 走通,照这个来)

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

⚠️ **仍然没真跑过的**:**Claude Desktop 的写入**、**Antigravity 的一切**。

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
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本**。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 和 gemini 也一样。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **现在是 v14**。⚠️ **`client.test.ts` 里还有一个 `downgradeToV13` 要跟着长**。
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
⚠️ **fixture 现在覆盖 v13/v14**:一个被作废的**置顶**块、一条 `supersedes`、
一条 `corrects`,以及标签阶梯的两处。别删掉这几块。

### 6.6 提交与推送

⚠️⚠️ **08-12 这一窗结束时:08-11 和 08-12 两窗的改动全都还在工作区,没提交也没推。**
两窗加起来动了 20 多个文件 + 3 个新目录/文件(`components/ReviewBoard/`、
`lib/blocks/markdown.ts`、`lib/blocks/MarkdownContent.tsx`)。**提交之前先问 Ocean。**

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

⚠️ **验证有效(四次)**:08-07 晚给他四个选择题、每个选项都写清「好处 / 代价」,
并且**画了 ASCII 草图**,他四题都秒选了推荐项。
08-07 深夜回答他「会不会过载」时**先给结论、再给真实数字表**,他直接拍了两块板。
08-10 开工前把「我需要你给的东西」列成 4 条,他一次全答完。
➕ **08-11 再验**:三个选择题,每个选项都写「好处 / 代价」,**他三题全答,而且都不是默认答案**
(免费档他选了「先查 Antigravity」、压缩他选了比推荐更激进的「整个撤掉」)。
**把代价写清楚,他会做出比你推荐的更果断的决定。**

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。

### 6.9 ⚠️ 真库现在长什么样(2026-08-11 量的)

**`PRAGMA user_version = 14`,2 个工作区 / 3 个项目 / 35 块。**
项目:〈回顾〉(升学,1 块 —— **就是那个 bug 生出来的**)、〈申请规划〉(升学,11 块)、
〈Flux〉(Flux,10 块)。

⚠️ **库目录里有一批备份文件,占空间。** Ocean 确认没问题之后可以清掉老的
—— ⚠️ **但那是用户数据,清之前必须问他,一份都别自己删。**
