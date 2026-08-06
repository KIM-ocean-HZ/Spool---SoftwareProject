# 交接文档 — 2026-08-06 晚(给下一个窗口)

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

**上一窗定的 A / M1 / M2 三件全做完了**,三个提交,都在本地 `main` 上。

⚠️ **还没推。** 上一窗 Ocean 说过「推 main」,但那句是对上一窗的产物说的;
这三个提交要不要推,**问一句再推**。

⚠️ **schema 升到 v11 了。** 二进制和 app 必须同版本才写得动(mcp.rs 有版本守卫)。
老库在启动时自己走 v10→v11 迁移(两列都可空,**迁完行为一个字不变**)。

基线全绿:`npx tsc --noEmit` / `npx vitest run`(**193**)/ `cargo test`(**38**)。

---

## 1. 下一窗要做的

### ⏸ 先等一个拍板(它挡着后面几件)

**`DESIGN_AI_ENGINE.md` §7.7 —— 要不要补一个「真的稳定免费」的引擎档。**

Ocean 08-06 原话:「codex 免费额度不多,那么 codex 应该和 Claude Code 都算作订阅档,
而不是免费,考虑加入其他稳定免费的档位比如 Gemini api 或者其他更好用的,
虽然需要 api 但是为了用户使用体验需要做出妥协。」

这条是**当天实测逼出来的**:codex 装上了、登录也好好的,但他的 ChatGPT 是 Free 档,
Codex 额度当场就用完了,`try again at Sep 4th, 2026` —— **锁一个月**。
所以「Codex 给没订阅的人补上引擎位」这个前提,**只成立了一半**。

⚠️ 拍板要点(细表在 §7.7):**「要 key」有两种形状,代价差得非常远**。
形状 A 是**再加一个 CLI 预设**(key 配在那个 CLI 里,Spool 看都看不到),
零出网叙事一个字不用改;形状 B 是 Spool 自己存 key、自己发请求,
那要推翻 7/09 的 MCP-first 决策和官网上写着的话。**我建议 A。**

### 可以直接开工的

| # | 事情 | 状态 |
|---|---|---|
| **V** | **把 M1/M2 真跑一遍** | ⚠️ **这是下一窗第一件事**,步骤见 §2.4。今天两条路都只差最后一步没验 |
| **C** | **v0.4.0 收口** | M1 泛化做完了,引擎位的形状定了,**现在可以收口** |
| **M3** | Follow up 的去重静默(`DESIGN_FOLLOW_UP` §4 M3) | ⚠️ 建议**等 M2 真跑过、看过真实产出**再做 —— 不然不知道该按什么去重 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | **写入开关能否默认打开**(写入角色稿 M2) | 等待审面跑过一段真实使用 |
| F | **截图 + 演示脚本整体重建** | Ocean 已批:排在 app 代码全部做完之后,和录演示视频一起做 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 2. 这一窗做了什么

### 2.1 A:分流的原文块带上来源标签(提交 `32fc92c`)

08-05 就拍板了、两窗没动的那条。**它堵的是一个还开着的权威漏洞**:
原文块过去无来源落库,而 pack 的授权规则把无来源块判成 💭 Personal = 用户自己的意图、
**信号最高**。也就是 AI 往 `source_text` 里塞什么,批准之后都能借用户的名义
拿到库里最高权威身份。

现在标 `<客户端> · MCP — 用户原文`。两半都必要:前半让 `isMcpSource()` 认出它
(徽章图标、AI 活动计数),后半是给读 pack 的模型看的 —— 只有 AI 来源标签会被读成
🧩 Synthesis「别人的框架」,而这段确实是用户原话。

⚠️ **实际比设计稿预计的多改一处**:`mcp.rs` 里四句「以用户自己的名义」全不成立了。
最要紧的是 `source_text` 参数的描述 —— 它原先等于**把这个漏洞写在说明书上**。

### 2.2 M1:引擎位泛化 + Codex 第二引擎(提交 `952251f`)

`EngineKind::{Claude, Codex}` 两个预设。三个动作、prompt 常量、串行队列、真取消、
AI 活动区**全部复用**,泛化只发生在"怎么起这个进程、怎么读它的输出"这一层。

**codex 那侧是拿真二进制(0.146.1)一条条测出来的,不是照文档写的**,全表在
`DESIGN_AI_ENGINE.md` §7.3。最值钱的两条:

- **`--ignore-user-config` 就是那道边界**,而且**登录照用**(它 help 原话:
  auth still uses CODEX_HOME)。不加它,这次跑会继承用户 config.toml 里的每一个
  MCP 服务器 —— 本机上那是浏览器驱动、computer-use、node REPL。
- **`--strict-config` 可以当尺子用**:它拒绝不认识的配置键,所以把「要试的键」和
  「一个假键」一起传、看报错提到哪个,就能**在不花一次模型额度的前提下**问出整张配置表。

⚠️ **两个只有真机才会暴露的**:

1. **nvm 装的 CLI 检测不到。** `npm i -g` 落在 `~/.nvm/versions/node/vXX/bin/`,
   GUI 继承 launchd 的 PATH 所以 `which` 查不到,候选路径表里也没这一层 ——
   **在刚装完 codex 的那台机器上,设置页会说「没检测到」**。现在按 node 版本目录遍历。
2. `codex --version` 打印的是 `codex-cli 0.146.1`,取第一个 token 会得到 `codex-cli`,
   设置页显示成「codex codex-cli」。改成取第一个以数字开头的 token。

### 2.3 M2:Follow up(提交 `62159cd`)—— 动了 schema,升到 **v11**

每个项目一份「跟进 brief」:AI 起草 → 用户读、改 → 按「就按这个找」才算数。
**brief 为空 = 跟进关掉**,没有第二个开关(空白字符串也算空,不然一个空文本框
会武装一个联网 agent)。产出走 `propose_blocks` 进待审面,不进库。

**联网权限按动作发**:`web = action == "follow_up"`,在 `lib.rs` 里由动作名决定,
**不从 JS 传** —— 能传就意味着能在「整理去重」的时候也要。
`WebSearch` / `WebFetch` 这两个名字是拿 claude 2.0.50 实测过的(`permission_denials` 空)。

落地清单在 `DESIGN_FOLLOW_UP.md` §4.1。

### 2.4 ⚠️ 下一窗第一件事:把这两条真跑一遍

**为什么单列**:08-06 上午刚修完的 bug 就是「参数拼装测过、进程组杀伤测过、
纯函数测过,结果三个动作全是坏的」。今天这两条又都停在最后一步之前。

**① M2 的跟进链(用 claude,今天就能跑)**

1. `scripts/seed-mcp-lab.sh` 重建实验室,把 `…/com.oceanjin.spool.lab/data` 拷一份到 `/tmp`。
2. 在副本里给某个项目写一行 brief:
   `sqlite3 <副本>/spool.db "UPDATE threads SET follow_up_brief='…' WHERE title='机器学习课';"`
3. 取出真实提示词:`guidance_text("follow_up", {"project": "…"})`。它**故意**没挂在
   MCP prompts 上,所以最省事的办法是**临时加一个 `#[cfg(test)]` 探针**把它写进文件,
   跑完删掉(本窗就是这么干的)。
4. `claude -p "<提示词>" --mcp-config <指向副本的配置> --allowedTools "<14 个 spool 工具>,WebSearch,WebFetch" --output-format json --max-turns 24`
5. 看 `proposals` / `proposal_batches` 表有没有多出行,以及提案正文里**有没有 URL**。
6. 装了新版之后再看一眼待审面 —— 批准之后那块是不是带 `Claude · MCP` 标签。

**② codex 那条(要等额度,或者 Ocean 升 Plus / 换号)**

步骤在 `DESIGN_AI_ENGINE.md` §7.6。**额度 9/4 恢复。** 已经验到的是:参数全对、
隔离生效、MCP 服务器真的起来了(argv 和 env 都对)、连上了 OpenAI 并拿回账号级答复 ——
**差的只有模型那一步**。

---

## 3. Ocean 08-06 拍的板(决策留档)

1. **Follow up 走「引擎位泛化 + 产出进待审面」**,**否掉** app 内置免费 API 那条。
   → 7/09 的 MCP-first 决策和「app 内零出网」叙事**一个字不改**。
2. **设置页把 Codex 加成第二个引擎。** ⚠️ 当天实测后**它的理由被修正了** ——
   Codex 不算"免费档",见 §1 的 §7.7。
3. **Follow up 是提案源,不是写入源。** 产出进待审面,人把关"信息是否可信"。
4. **先手动,不做定时。**
5. ✅ **「Follow up 区域」= 推导视图,不建表**(跟 M3「AI 活动」同构)。
6. ✅ **brief 必须用户过目一次才能开跑。** 多的那一步是有意付的 —— brief 就是搜索规则,
   这是这个功能唯一能让用户产生控制感的地方。
7. ✅ **一次跟进最多 5 条,超出的丢掉,不排队。** 排队会让下次先端上回的剩饭,
   而"新"是这个功能唯一的卖点。

### 3.1 顺带查清的两件(08-06 上午,仍然有效)

- **默认语言已经是跟随系统的,不用改。** UI 走 `navigator.language`
  ([settingsStore.ts:74](../src/stores/settingsStore.ts#L74));开机教程在**播种那一刻**
  定语言([App.tsx:54](../src/App.tsx#L54) 的硬顺序);MCP 侧通过 `resolvedLanguage`
  镜像键跟随。详见 memory `ui-language-follows-system`。
- **「一键接入」不管登录。** 它只往客户端的 MCP 配置文件里写一行。
  登录是用户自己在终端 `/login`。⚠️ 现在 CLI 没登录的报错还是把英文原话透传到 toast,
  该补一句人话(codex 那条已经会透传它自己的原话,比如「额度用完了,9/4 再来」)。

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ **已落地**(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ **已落地**(2026-08-06,§2.1)
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ **引擎位泛化成两个预设(claude / codex)也落地了**(2026-08-06)。
   **v0.4.0 现在可以收口。**
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
     面板让你**看得见**它干了什么
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   **M3 没新东西就静默** / M4 定时(**只在 M2/M3 被证明有用之后**)
9. ⚠️ **新增(08-06):引擎档位问题** —— `DESIGN_AI_ENGINE.md` §7.7。
   实测证明 Codex 免费档不构成一条路(额度撞墙锁一个月),**引擎位今天仍然只服务
   有订阅的人**。补一个真的稳定免费的档是待拍板项,见 §1

---

## 5. 还没还的旧账

第 1、2 条 08-05 动过了,**剩下四条一条没动**:

1. ~~写之前先给用户看一眼~~ —— **分流那一半做完了**(待审面);单条结论走 `dry_run` 够了
2. ~~AI 到底往我库里写了什么~~ —— **做完了**,就是 M3 的「AI 活动」折叠区
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看。
   **pack 按项目切,而用户的"一件事"跨了两个项目**

⚠️ **第 4、6 条跟 Follow up 直接相关** —— Follow up 是个进货口,而这两条是出口堵着。
`DESIGN_FOLLOW_UP.md` §1.1 论证过为什么这不构成"先别做",但**M2 现在已经落地了**,
所以这两条从"以后再说"变成了"该排期了":进货口开了,出口还堵着。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图。要求见 memory
  `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit          # 干净
npx vitest run            # 193 通过
cd src-tauri && cargo test # 38 通过
```

改任何 pack 渲染都要跑满这三条 —— 两侧渲染器有 golden 平价测试盯着。

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
  (`…/com.oceanjin.spool.lab/data`)。指到父目录 → 读不到 `settings.json` →
  服务器报「MCP 服务未开启」,**看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在 `/tmp` 的副本上做**,别往真实验室追加块
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏** ——
`ReviewPanel` 里一个 zustand selector 每次返回新数组,当 hook selector 用就无限重渲染
(React #185)。**没有任何一条自动化会打开那个窗口。** 装完至少 `screencapture` 一张。
根因全过程在 `EVAL_M1_M2_M3.md` §6。

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**
(`selectAllThreadsFlat(useThreadsStore.getState())`),**绝不能当 hook selector**。

⚠️ **08-06 这一窗新增了两个界面**(设置页的引擎二选一、`FollowUpPanel`),
**本窗没有打开过窗口看过**。收口 v0.4.0 之前必须装一次、看一眼这两处。

### 6.2-ter ⚠️ 子进程的活,必须真跑一次

08-06 上午修的那个 bug:参数拼装测过、进程组杀伤测过、纯函数测过,**结果三个动作全是坏的**,
因为没人真跑过一次带登录的运行(env 里缺 `USER`,钥匙串查不到凭据,
报错长得像「用户没登录」)。**这一窗又留下两条没真跑的**(§2.4),下一窗第一件事就是补上。

### 6.2-quater ⚠️ 探子进程可以不花模型额度

08-06 学到的两招,以后省很多:

- **`--strict-config`(codex)**:把「要试的配置键」和「一个肯定不存在的键」一起传,
  报错只提假键 = 要试的键是真的。**配置层的问题全都能这样问出来,不发生模型调用。**
- **拿包装脚本当探针**:把 MCP 服务器的 command 指向一个「记 argv/env 再 exec 真二进制」
  的 sh 脚本。哪怕这次跑因为额度失败,**脚本也已经写下了日志** ——
  「服务器起没起、参数和环境变量对不对」就验完了。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`。** 在仓库根目录跑会因为找不到
   `Cargo.toml` **静默失败**,探针照跑,结果长得像「修复没生效」。
   **看到 `Finished` 那一行再往下走。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
   数不对就是在测旧进程,停下来重开客户端
3. ✅ **三个 seed 脚本现在都从 `client.ts` 读 schema 版本了**(08-06 把
   `seed-demo-library.sh` / `seed-growth-demo.sh` 也改了 —— 它们原先写死 8,
   而 schema 早就到 10 了)。**以后升 schema 不用再手改脚本。**
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**,否则它打印
   「Reading additional input from stdin...」然后挂着等。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

### 6.6 提交与推送

- ⚠️ **这一窗的三个提交还没推。** 推之前问一句。
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**
- ⚠️ **`git add -A` 会把 Ocean 在 IDE 里的顺手改动一起带走。** 08-06 就这样把
  `HANDOFF.md` 里一行被误敲坏的文字提交了进去。提交前扫一眼 `git status --short`,
  不认识的改动先看 diff。

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。
