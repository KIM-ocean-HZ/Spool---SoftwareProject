# 交接文档 — 2026-08-06(给下一个窗口)

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

**这一窗是决策窗,不是落地窗。** 定了 Follow up(联网跟进)怎么做、引擎位怎么泛化,
两份设计稿写完了;代码只改了一处 —— 引擎位一个从落地起就存在的真 bug。

**Ocean 08-06 明示:推 main。已推。** 之前那句「先不推」作废。

基线全绿:`npx tsc --noEmit` / `npx vitest run`(**188**)/ `cargo test`(**31**,+1)。

⚠️ schema 仍是 **v10**。二进制和 app 必须同版本才写得动(mcp.rs 有版本守卫)。

---

## 1. 下一窗要做的

Ocean 08-06 明示:**下一窗负责功能落地。**

| # | 事情 | 状态 |
|---|---|---|
| **A** | **分流的原文块改成带来源标签** | ✅ 可直接开工,照 `DESIGN_MCP_WRITE_ROLE.md` **§4.4-bis**。⚠️ 08-05 就拍板了,**两窗过去代码一直没动** |
| **M1** | **引擎位泛化 + Codex 第二引擎** | ✅ 可直接开工,照 `DESIGN_AI_ENGINE.md` **§7** |
| **M2** | **Follow up:跟进 brief + 手动「找找新进展」+ 产出进待审面** | 照 `DESIGN_FOLLOW_UP.md` §3/§4。要动 schema → **v11** |

**建议顺序:A → M1 → M2。**
A 只有四个改动点、半天的事,而且它堵的是一个**还开着的权威漏洞**
(AI 递的原文能借用户名义拿到库里最高权威身份);M1 跟 M2 解耦、自己就有价值;
M2 最大,而且是唯一动 schema 的。Ocean 要换顺序随时说。

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | **写入开关能否默认打开**(写入角色稿 M2) | 等待审面跑过一段真实使用 |
| C | **v0.4.0 收口** | 引擎位三期落地了,但 M1 泛化会改引擎位的形状 —— **等 M1 做完再收口** |
| F | **截图 + 演示脚本整体重建** | Ocean 已批:排在 app 代码全部做完之后,和录演示视频一起做 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 2. 这一窗做了什么

### 2.1 修掉了引擎位的一个真 bug(提交 `4ebdc60`)

**「让 AI 维护」那三个动作,从 M1 落地那天起在任何机器上都是必错的。**

`run_action` 清空环境后只递回 `PATH` 和 `HOME`。但登录令牌是 macOS 钥匙串里一条
generic password,它的 **account 就是用户名**,而 CLI 从 **`USER`** 读这个名字。
没有 `USER` → 查不到凭据 → 回落到"没配 key" → 报
`Invalid API key · Please run /login`,**看起来像用户没登录,其实登录好好的**。

一个变量一个变量试出来的:`PATH+HOME+USER` 通,`PATH+HOME+TMPDIR` 不通,
只加 `LOGNAME` 也不通。已抽成 `run_env()`,三个变量各写清为什么不能少,配回归测试。

⚠️ **这条给下一窗的教训**:之前的实机探针测的是纯函数和进程组杀伤,
**没有真跑过一次带登录的活**。M1 泛化上 codex 时,第一件事就是**真跑一次**,
别只测参数拼装。

### 2.2 两份设计稿(提交 `docs:` 那条)

- **`DESIGN_AI_ENGINE.md` 新增 §7**:引擎位泛化 + Codex 第二引擎。
  ⚠️ §7.3 那张对照表右列有**两个"待实测"的格子**,是下一窗第一件要做的事。
- **`DESIGN_FOLLOW_UP.md`(新)**:Follow up 全稿,含开源 deep research 的调研
  (GPT Researcher / LangChain Open Deep Research / STORM / 监控类工具 / 提示注入)。

---

## 3. Ocean 08-06 拍的板(决策留档)

1. **Follow up 走「引擎位泛化 + 产出进待审面」**,**否掉** app 内置免费 API 那条。
   → 7/09 的 MCP-first 决策和「app 内零出网」叙事**一个字不改**。
2. **设置页把 Codex 加成第二个引擎。** 理由:2026 年免费闸门关了一大半,
   Codex CLI 是唯一"所有 ChatGPT 套餐都带(含 Free)、不要 key、不要卡、还能联网"的路。
   Gemini CLI 的免费登录 6/18 停了,Qwen Code 的 4/15 关了。(全表在 `DESIGN_FOLLOW_UP.md` §7)
3. **Follow up 是提案源,不是写入源。** 产出进待审面,人把关"信息是否可信"。
4. **先手动,不做定时。** 定时是产出被证明有用之后才值得的东西。

### 3.1 顺带查清的两件

-* UI  **默认语言已经是跟随系统的,不用改。*走 `navigator.language`
  ([settingsStore.ts:74](../src/stores/settingsStore.ts#L74));开机教程在**播种那一刻**
  定语言([App.tsx:54](../src/App.tsx#L54) 的硬顺序);MCP 侧通过 `resolvedLanguage`
  镜像键跟随。详见 memory `ui-language-follows-system`。
- **「一键接入」不管登录。** 它只往客户端的 MCP 配置文件里写一行。
  登录是用户自己在终端 `/login`。⚠️ M1 落地时要补一句人话 ——
  现在 CLI 没登录的报错是直接把英文原话透传到 toast 的。

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ **已落地**(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ⚠️ **新增(08-06)**:引擎位要泛化成两个预设(claude / codex),见 `DESIGN_AI_ENGINE.md` §7。
   v0.4.0 收口等这一步做完
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路。⚠️ M2 的取消走 `setpgid` + `killpg`(Unix 专属),
   移植时这一段要重写。⚠️ **新增(08-06)**:`run_env()` 里的 `USER` 在 Windows 上是
   `USERNAME`,移植时别照抄
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
8. **Follow up(联网跟进)** —— ⚠️ **新增(08-06)**,全稿 `DESIGN_FOLLOW_UP.md`。
   四期:M1 引擎泛化 / M2 brief + 手动跟进 + 进待审面(schema v11)/ M3 没新东西就静默 /
   M4 定时(**只在 M2/M3 被证明有用之后**)

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
`DESIGN_FOLLOW_UP.md` §1.1 论证过为什么这不构成"先别做",但它构成"产出量必须小"。

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
npx vitest run            # 188 通过
cd src-tauri && cargo test # 31 通过
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

08-05 出过一次:`tsc` 干净、188 个测试全绿、构建签名全过,装上去**主窗白屏** ——
`ReviewPanel` 里一个 zustand selector 每次返回新数组,当 hook selector 用就无限重渲染
(React #185)。**没有任何一条自动化会打开那个窗口。** 装完至少 `screencapture` 一张。
根因全过程在 `EVAL_M1_M2_M3.md` §6。

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**
(`selectAllThreadsFlat(useThreadsStore.getState())`),**绝不能当 hook selector**。

### 6.2-ter ⚠️ 08-06 新增:子进程的活,必须真跑一次

见 §2.1。参数拼装测过、进程组杀伤测过、纯函数测过,**结果三个动作全是坏的**,
因为没人真跑过一次带登录的运行。M1 上 codex 时第一件事就是真跑。

### 6.3 ⚠️ 08-05 那一轮的三条环境坑

1. **`cargo build --release` 必须 `cd src-tauri`。** 在仓库根目录跑会因为找不到
   `Cargo.toml` **静默失败**,探针照跑,结果长得像「修复没生效」。
   **看到 `Finished` 那一行再往下走。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
   数不对就是在测旧进程,停下来重开客户端
3. **`seed-mcp-lab.sh` 的 schema 版本现在从 `client.ts` 读**,不用手改了。
   ⚠️ 但 `seed-demo-library.sh` / `seed-growth-demo.sh` 还写死 `user_version = 8` ——
   **M2 升 v11 时这两个脚本要一起看**

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

### 6.6 提交与推送

- **Ocean 08-06 明示:推 main。** 本窗已推。远端 `origin/main` 与本地齐平。
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。
