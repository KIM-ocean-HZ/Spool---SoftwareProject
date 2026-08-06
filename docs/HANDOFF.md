# 交接文档 — 2026-08-06 深夜(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**Ocean 亲手过了上一窗留的三件,给了 13 条反馈。三条大的当场拍了板,
新设计稿 `DESIGN_WORKBENCH.md` 写完,阶段一(地基)、阶段二(右侧栏)、
阶段三的前两项(周回顾独立 + 变化触发的自动维护)已落地。**

基线全绿:`npx tsc --noEmit` / `npx vitest run`(**210**,原 193)/ `cargo test`(**39**,原 38)。

### 0.1 ⚠️⚠️ 三条会咬人的,先看

1. **schema 升到 v12 了,而 `/Applications/Spool.app` 还是 v11 的构建。**
   Ocean 的真库现在**还是 v11,没被碰过**(本窗核对过)。
   **但只要有人拿新代码跑一次 GUI,他的真库就会迁到 v12,那一刻装着的那版 app 就读不动了**
   (`mcp.rs` 有版本守卫)。**下一窗要么别动 GUI,要么一次做完「构建 + 换装」。**
2. **`src-tauri/target/release/bundle/macos/Spool.app` 现在是 `com.oceanjin.spool.wb` 的隔离构建**
   (本窗验证用的,identifier 已复位但产物没重建)。
   **直接拿它换装 = 指向空数据目录 = 看起来「数据全没了」**(memory §21 ①)。
   换装前必须 `plutil -extract CFBundleIdentifier raw <app>/Contents/Info.plist` 核一遍。
3. **本窗新增的界面 Ocean 还没看过。** 我自己拿隔离构建看过窗口了(§2.6,没白屏、右侧栏正常),
   但那是**空库**;他真库里有数据、有待审提案的样子没人见过。

---

## 1. Ocean 08-06 晚拍的板(决策留档)

他用完之后给了 13 条反馈,全部归位在 `DESIGN_WORKBENCH.md` §2 那张表里。**三条大的当场拍了:**

1. ✅ **直接做右侧栏**(不是先补小毛病)。学 VSCode,左右两侧都能拖宽、能收起。
   **代价他认了:v0.4.0 收口往后推。**
2. ✅ **AI 维护自动化 = 只在项目真变了才跑。** 带总开关 + 每个项目能单独关。
   ⚠️ 他原话「**必须节约token**」—— 这是硬要求,不是「顺便」。
3. ✅ **周回顾自动建一个「回顾」项目**,产出追加进去。它**不再属于任何单个项目**。

### 1.1 ⚠️ 一条对他结论的修正(已跟他讲过)

他说「AI 只说没有新增块,像什么都没做,所以我倾向于自动化」。
**诊断对,但顺序要调**:那不是 AI 没干活,是 **Spool 把 AI 的正文扔了**(§2.1)。
**一条会丢自己产出的流水线,自动化之后只会变成「每周安静烧一次 token,你还是看不到」。**
所以先让产出看得见(阶段一/二),**再**谈自动跑(阶段三)—— 本窗按这个顺序做完了三项。

---

## 2. 这一窗做了什么

### 2.1 ⭐ 找到并修了那个真 bug:「没有新增块」

Ocean 问 8/6 14:32 周回顾、14:34 提炼结论为什么都没有新增块。**答案是 AI 两次都干完了活。**

- 三个动作的提示词都写着「**先把结论念给用户听,他同意之后再 add_block**」。
  这句话是给**有人在旁边聊天**的场合写的(Claude Desktop)。
- Spool 自己跑引擎是 `claude -p` **无人值守**,**没有任何人能说那句「好」**。
  所以模型完全按规矩办事:把整篇写进最终回答,一块都不写。
- 那段回答传回来了 → `engineStore` 存进局部变量 → **除 `follow_up_brief` 外全部丢掉**。
- 排除:Ocean 的「允许 AI 写入」是**开着的**,不是闸门问题。

⚠️ **修法不是改提示词。提示词一直是对的**,缺的是「同意」发生的地方 —— 就是右侧栏的运行卡片。

### 2.2 schema v12 —— `engine_runs` 表

AI 每次跑的**正文、花费、模型、token、成败、CLI 原话**全部落库。

⚠️ 这**扩展了**上一窗那条「Follow up 区域 = 推导视图,不建表」。
理由:跟进**状态**能从块和 brief 推出来;**AI 的正文没有任何地方可以推导** ——
它唯一的副本原先在一个局部变量里,函数返回就没了。

只有 app 写这张表,MCP 子进程不碰(单写者,不需要跨进程协调)。
pack / digest / 搜索**都不读它** —— 一次运行不是库内容,用户按「存成一块」才是。

### 2.3 花费与模型:数据本来就在手里

⚠️ **claude 的 JSON 信封里一直带着 `total_cost_usd` 和 `modelUsage`,
`RunEnvelope` 只声明了三个字段,serde 把其余的静默丢了。** 现在解析出来了。

| 想要的 | 能不能 | 怎么拿 |
|---|---|---|
| 这次花了多少钱 | ✅ | `total_cost_usd`,信封里现成的 |
| 用了什么模型、多少 token | ✅ | `modelUsage` 的 key + `usage` 三个输入字段求和 |
| 选模型 | ✅ 未做 | 两个 CLI 都有 `--model` |
| 选 effort | ✅ 未做 | codex 的 `model_reasoning_effort` **用假键对照法验过是真键**,没花额度 |
| **账号还剩多少额度** | ❌ | **拿不到。** 两个 CLI 都不在无人值守模式下报 |

⚠️ **对用户只能说「花了多少」,绝不能暗示「还剩多少」。** 代码注释里写死了这条。

⚠️ **claude 信封的确切嵌套没有真机核对过**(要花一次运行,而 §7.2 规定没实测就不算数)。
所以解析全是容错的:认不出的形状返回 None,**不会把一次成功的运行变成失败**。
**下一窗跑通一次真运行,核对一下这几个字段名。**

⚠️ **codex 的花费字段完全没探** —— 它的 JSONL 里在哪、叫什么都未知,
而 codex 额度 **9/4 才恢复**。在那之前 codex 运行的花费显示「—」,**别瞎猜字段名**。

### 2.4 右侧栏(阶段二)

`src/components/RightRail/`。跟着当前项目走,里面五样:

- **引擎名 + 近 7 天花费**(表头)
- **用哪个引擎**的选择器 —— 从设置页地下室搬上来了。Ocean 找不到它,而且它原先显示的是
  代号 `claude`/`codex`,现在是 `Claude Code`/`Codex`
- **动作**(提炼结论 / 整理去重 / 联网跟进)—— 从 ⋯ 菜单搬出来。⋯ 菜单里**保留**了入口,
  已经习惯的路不断
- **停下**按钮 —— 跟动作放在一起,不再是标题栏那颗认不出来的药丸
- **待你过目 N 条** —— 常驻显示(0 条时写「没有待过目的」,不再整块消失)
- **运行卡片** —— AI 的正文 + 花费 + 模型 +「存成一块 / 不用了」两个按钮

⚠️ **待审那一格不弹窗、不抢焦点。** Ocean 原话要「消息弹窗」,但 memory `capture-note-first`
有铁律「**主窗永不跳前**」,而提案是 AI 在他可能睡着的时候排进来的。
折中:变色 + 计数,看得见但不抢。

左右两侧栏都能拖宽、能收起,宽度存 settings.json。
⚠️ **宽度在读出来的时候夹紧**(`src/lib/layout.ts`)—— settings.json 是用户能手改的文件,
而且会跨屏幕存活,一个存着 6000 的宽度会让阅读区变成 0 且没有把手可拖回来。

⚠️ **自查时抓到的一个**:⋯ 菜单和右侧栏各有一个「改要盯的东西」入口,
原先各自 `useState` 一个 `FollowUpPanel` —— **两边都点就会叠两层模态**。
改成了 `engineStore.briefOpen` 单一开关,面板只在 App 挂一次。
**以后再往别处加入口,用这个开关,别再 useState。**

### 2.5-bis ✅ 周回顾独立 + 变化触发的自动维护(Ocean 明示接着做)

**周回顾**(§3.4 拍板):
- 从项目 ⋯ 菜单里**删掉了** —— 它是全库动作,`lib.rs` 传 `{}` 就是这个错的证据。
- 右侧栏新开一格「**全部项目**」,它在那里,跟单项目动作物理分开。
- 按「存成一块」时**find-or-create 一个「回顾」项目**,追加进去。
  ⚠️ **建项目发生在「用户点存」那一刻**,不在启动路径上 ——
  memory `spool-db-wipe-incident` 的红线。`findOrCreateReviewThread` 按**标题**匹配,
  而且新建的回顾项目自己 `auto_maintain=false`(否则会去提炼自己的提炼,每周烧一次钱)。

**自动维护**(§4.3 拍板「只在项目真变了才跑」):
- 判据全在一条 SQL 里(`threadsDueForMaintenance`),四个条件**每一条都是在省钱**:
  ① 自上次成功提炼以来**新增过块**;② 最新的块**放了 10 分钟**(捕捉是成串的,
  一分钟五条是一个想法不是五个);③ **每个项目一天最多一次**;
  ④ 用户没单独关掉、项目不是已完成。
- 周回顾:**一周最多一次**,失败/取消的不算数。
- **每个 tick 只排一个项目。** 队列本来就是串行的,排五个不会更快,
  只会在用户看到第一个产出之前就把五份钱花出去。
- ⚠️ **`auto_maintain` 是 `null / 0` 三态,不是布尔**:null =「用户没表态,跟总开关走」,
  0 =「这个项目永远别自动跑」。以后把总开关打开时,只有没表态的项目会被带上。

⚠️⚠️ **总开关默认关,这是我替他做的一个判断,他可以推翻。**
他同一句话里既要「自动化」又要「必须节约token」和「让用户放心」——
而这个开关会在没有再问一次的情况下花订阅的钱。**升级之后自己开始计费 = 不放心**,
所以默认关,开关放在右侧栏(产出出现的地方),不埋进设置页。
**要改成默认开就是一行**(`settingsStore.ts` 的 `aiAutoMaintain`)。

### 2.5 顺手修的两条小的

- **CMU 例子换掉了**(Ocean #10),**两处都换**:输入框 placeholder + 提示词正文(中英两侧)。
  换成「我在用的这个库有没有发新版本、有没有破坏性改动」。
  ⚠️ **原来那条例子形状是对的**(具体到能当搜索规则),换的是题材不是形状。
- **引擎选择器显示产品名**(`ENGINE_LABEL` 那张表一直放着没用上)。

### 2.6 ✅ 真机看过窗口了(没白屏)

照 memory `isolated-verify-workflow` §1 走的隔离流程:identifier 临时改 `com.oceanjin.spool.wb`
→ 构建 → 预置 settings.json(`railCollapsed:false`)→ `open` → **按 pid 拿窗口 bounds 再截图**
→ 杀进程、删数据目录、**复位 identifier**。

结果:**没白屏,右侧栏五格全渲染出来,引擎选择器显示「Claude Code」。**
库是 v12、`engine_runs` 16 列 + 两个索引都在。
**Ocean 的真库全程没被碰,仍是 v11**(核对过)。

⚠️ 用 `CGWindowListCopyWindowInfo` **按 pid** 取 bounds 是关键 ——
正式版窗口在 32,59 而验证版在 350,120,**两个重叠**,按名字取窗口会拍到正式版
(memory §10 那个坑)。

---

## 3. 下一窗要做的(接着阶段三)

全部细节在 `DESIGN_WORKBENCH.md` §4.3 / §4.4。

| # | 事情 | 状态 |
|---|---|---|
| ~~W3-a~~ | ~~周回顾挪出项目菜单 → 自动建「回顾」项目~~ | ✅ **已落地**(§2.5-bis) |
| ~~W3-b~~ | ~~自动化:只在项目真变了才跑~~ | ✅ **已落地**(§2.5-bis)。⚠️ **总开关默认关,等 Ocean 拍是否改成默认开** |
| **W3-c** | **模型 / effort 选择** | ✅ 可开工。两个 CLI 的 `--model`;codex 的 `model_reasoning_effort` 已验证是真键 |
| **W4** | **流式进度**(等待过程中显示 AI 正在找什么) | ⚠️ **风险最高,排最后。** 现在是等子进程整个跑完才读 stdout。claude 要换 `--output-format stream-json`,**会动到现在唯一验证过能跑通的解析路径**。**必须真机跑一次**(§6.2-ter) |
| **W7** | **notes 当标题**(Ocean #13) | ⚠️ 部分采纳,理由见 `DESIGN_WORKBENCH.md` §7:**多数块没有批注**,直接改会让它们顶着一行空白。建议「有批注的才当标题」。动块流要先读 §6.5 的 golden fixture 规矩 |
| **C** | **v0.4.0 收口** | ⏸ Ocean 明示往后推,等右侧栏这一摊做完 |
| **E3** | **第三个引擎档(Gemini CLI)** | ✅ 可开工。Ocean 这次明确点名了 gemini。照 §7.2 的规矩,`DESIGN_AI_ENGINE.md` §7.3 那张表要长出第三列 |
| **V2** | **codex 那条路的最后一格** | ⚠️ 等额度(**9/4 恢复**)。顺带把 §2.3 那个花费字段一起探了 |
| **M3** | Follow up 的去重静默 | ✅ 可开工(`DESIGN_FOLLOW_UP` §4 M3) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | **写入开关能否默认打开** | 等待审面跑过一段真实使用 |
| F | **截图 + 演示脚本整体重建** | Ocean 已批:排在 app 代码全部做完之后,和录演示视频一起做 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ **已落地**(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ **已落地**(2026-08-06)
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ **引擎位泛化成两个预设(claude / codex)也落地了**(2026-08-06)。
   ⏸ **v0.4.0 收口被 Ocean 明示往后推**(08-06 晚),等右侧栏这一摊做完。
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路。⚠️ M2 的取消走 `setpgid` + `killpg`(Unix 专属),
   移植时这一段要重写。⚠️ `run_env()` 里的 `USER` 在 Windows 上是 `USERNAME`,别照抄。
   ⚠️ **新增(08-06)**:引擎检测的候选路径表(`candidate_paths`)整个是 macOS/Unix 形状
   (`~/.nvm/…`、`/opt/homebrew/bin`),Windows 上要另写一份
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档,
   **所以搬到这里**):
   - ~~**AI 活动面**~~ —— ✅ **已落地**(M3)。VSCode 敢让插件干活,是因为 Source Control
     面板让你**看得见**它干了什么。⚠️ **08-06 晚:这条的正确形态是右侧栏**,
     见 `DESIGN_WORKBENCH.md` §3.0 —— 原来那个折叠区方向对、位置错
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"。
     ⚠️ **08-06 晚 Ocean 又提了一次**(#13 notes 当标题),见 §3 的 W7
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   **M3 没新东西就静默** / M4 定时(**只在 M2/M3 被证明有用之后**)
9. ⚠️ **引擎档位问题** —— `DESIGN_AI_ENGINE.md` §7.7。
   实测证明 Codex 免费档不构成一条路(额度撞墙锁一个月),**引擎位今天仍然只服务
   有订阅的人**。补一个真的稳定免费的档:**08-06 晚 Ocean 点名了 Gemini CLI**,见 §3 的 E3
10. ⚠️ **新增(08-06 晚):工作台** —— 全稿 `DESIGN_WORKBENCH.md`。四阶段:
    ~~一 地基(schema v12 + 花费解析)~~ ✅ / ~~二 右侧栏~~ ✅ /
    **三 自动化 + 周回顾独立 + 模型选择** / **四 流式进度**

---

## 5. 还没还的旧账

第 1、2 条 08-05 动过了,**剩下四条一条没动**:

1. ~~写之前先给用户看一眼~~ —— **分流那一半做完了**(待审面);单条结论走 `dry_run` 够了。
   ⚠️ **08-06 晚补完了另一半**:维护动作的结论现在有运行卡片可看可存(§2.1)
2. ~~AI 到底往我库里写了什么~~ —— **做完了**,M3 的「AI 活动」折叠区,08-06 晚升级成右侧栏
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看。
   **pack 按项目切,而用户的"一件事"跨了两个项目**

⚠️ **第 4、6 条跟 Follow up 直接相关** —— Follow up 是个进货口,而这两条是出口堵着。
M2 已经落地,所以这两条从"以后再说"变成了"该排期了":进货口开了,出口还堵着。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图。要求见 memory
  `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                          # 干净
npx vitest run                            # 199 通过
cargo test --manifest-path src-tauri/Cargo.toml   # 39 通过
```

改任何 pack 渲染都要跑满这三条 —— 两侧渲染器有 golden 平价测试盯着。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。** 在仓库根目录直接跑会
`could not find Cargo.toml`。(§6.3-1 说的是 `cargo build` 会**静默失败**,`test` 是报错,
但都一样浪费时间。)

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
  (`…/com.oceanjin.spool.lab/data`)。指到父目录 → 读不到 `settings.json` →
  服务器报「MCP 服务未开启」,**看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在 `/tmp` 的副本上做**,别往真实验室追加块
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧。要隔离 GUI 只能改 identifier(下条)

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏** ——
`ReviewPanel` 里一个 zustand selector 每次返回新数组,当 hook selector 用就无限重渲染
(React #185)。**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**
(`selectAllThreadsFlat(useThreadsStore.getState())`),**绝不能当 hook selector**。

✅ **08-06 晚本窗照隔离流程看过了,右侧栏没白屏**(§2.6)。可复用的配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(本窗用 `com.oceanjin.spool.wb`)
2. `npm run tauri build -- --bundles app`
3. 预置 `~/Library/Application Support/<新id>/settings.json`
   (本窗写的 `{"mcpEnabled":true,"mcpWriteEnabled":true,"railCollapsed":false,"language":"zh"}`)
4. `open --stdout/--stderr` 起来抓日志
5. ⚠️ **按 pid 取窗口 bounds,别按名字** —— 用 `CGWindowListCopyWindowInfo` 写十几行 C。
   **正式版和验证版窗口会重叠**(本窗实测:正式版 32,59 / 验证版 350,120),
   按名字取会拍到正式版,然后你会以为改动没生效
6. `screencapture -x -R"x,y,w,h"`
7. **收尾:按 pid 杀进程(别用模糊 pkill,正式版一直在跑)、删数据目录、复位 identifier**

⚠️ **合成鼠标点击驱动不了这个 webview**(08-06 实测)。
`CGEventPost` 的 mouseMoved **能**让按钮进 hover 态,但紧跟的 down/up
**不触发 React 的 onClick**。**要眼见为实,只能让 Ocean 自己点。**

### 6.2-ter ⚠️ 子进程的活,必须真跑一次

08-06 上午修的那个 bug:参数拼装测过、进程组杀伤测过、纯函数测过,**结果三个动作全是坏的**,
因为没人真跑过一次带登录的运行(env 里缺 `USER`)。
⚠️ **本窗又留下两条没真跑的**:claude 信封的花费字段名(§2.3)、W4 的流式解析。

### 6.2-quater ⚠️ 探子进程可以不花模型额度

- **`--strict-config`(codex)**:把「要试的配置键」和「一个肯定不存在的键」一起传,
  报错只提假键 = 要试的键是真的。**本窗又用了一次**,验出 `model_reasoning_effort` 是真键。
- **拿包装脚本当探针**:把 MCP 服务器的 command 指向一个「记 argv/env 再 exec 真二进制」的
  sh 脚本。哪怕这次跑因为额度失败,**脚本也已经写下了日志**。
- ⚠️ **新增(08-06 晚):翻二进制里的字符串也能问出字段名。**
  `strings <claude 二进制> | grep total_cost_usd` 就确认了花费字段存在 ——
  **但这只能证明「这个词在里面」,不能证明嵌套结构**,所以解析仍要容错(§2.3)。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`。** 在仓库根目录跑会因为找不到
   `Cargo.toml` **静默失败**,探针照跑,结果长得像「修复没生效」。
   **看到 `Finished` 那一行再往下走。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
   数不对就是在测旧进程,停下来重开客户端
3. ✅ **三个 seed 脚本现在都从 `client.ts` 读 schema 版本了** —— 升 schema 不用再手改脚本。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**,否则它打印
   「Reading additional input from stdin...」然后挂着等。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **`mcp.rs` 有个测试会读 `client.ts` 的源码比对两边**,漂了会红,不用担心漏。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

### 6.6 提交与推送

⚠️ **本窗没有提交,工作区是脏的。** 改了这些:

```
 M src-tauri/src/engine.rs          # 花费/模型解析,run_action 返回 (kind, envelope)
 M src-tauri/src/lib.rs             # ai_engine_run 返回结构体而非裸字符串
 M src-tauri/src/mcp.rs             # EXPECTED_SCHEMA_VERSION 12;CMU 例子换掉(中英两侧)
 M src/App.tsx                      # 两侧栏布局 + 拖拽 + FollowUpPanel 提到根部
 M src/components/Settings/McpConfig.tsx   # 引擎选择器显示产品名
 M src/components/Sidebar/index.tsx        # 收起按钮;宽度改由父级给
 M src/components/ThreadView/FollowUpPanel.tsx  # placeholder 换例子
 M src/components/ThreadView/ThreadHeader.tsx   # brief 面板改用共享开关(见下)
 M src/lib/db/client.test.ts        # v11→v12 迁移测试 + 版本断言
 M src/lib/db/client.ts             # SCHEMA_VERSION 12 + 迁移步
 M src/lib/db/schema.sql            # engine_runs
 M src/stores/engineStore.ts        # 不再丢正文;落库;loadRuns/dismissRun
 M src/stores/settingsStore.ts      # 两侧栏宽度/收起
?? docs/DESIGN_WORKBENCH.md
?? src/components/RightRail/        # index.tsx + RunCard.tsx
?? src/components/ui/ResizeHandle.tsx
?? src/lib/db/engineRuns.ts
?? src/lib/layout.ts + layout.test.ts
```

- ⚠️ **推送要单独问 Ocean。** 上一窗的「推送」明示不是长期授权。
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**
- ⚠️ **`git add -A` 会把 Ocean 在 IDE 里的顺手改动一起带走。** 提交前扫一眼
  `git status --short`,不认识的改动先看 diff。

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

⚠️ **08-06 晚验证有效**:给他三个选择题、每个选项都写清「代价是什么/好处是什么」,
他三题都秒选了推荐项。**别只列选项名。**
