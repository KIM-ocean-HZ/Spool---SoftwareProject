# 交接文档 — 2026-08-07 深夜(给下一个窗口)

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

**Ocean 点名的两摊都做完了:上下文卫生(`DESIGN_CONTEXT_HYGIENE` §4 的第 1–4 件)
和 Follow up 的去重静默(M3)。schema 升到 v13。**

**四条基线全绿**:`npx tsc --noEmit` 干净 / `npx vitest run` **266**(原 223)/
`cargo test` **45** / `node scripts/i18n-check.mjs` 干净。

**实机验过了**:隔离构建装起来**没白屏**,块流上的新东西都截到了(§2.1);
MCP 那一侧在测试库上跑通(§2.2);跟进**真跑了两次**,跑出一个真 bug 并修掉(§2.3)。

✅ **已推、已换装(2026-08-07 深夜,Ocean 明示两件一起给的)。**
真库已迁到 **v13**,行数与迁移前备份逐表核对一致,输入监听/辅助功能授权都活着。见 §0.2。

### 0.2 ✅ 已推、已换装 —— 但有一件 Ocean 要自己动手

**推送**:8 个提交上去了,远端 HEAD = `3ae6c6b`。
⚠️ **SSH 那条路走不通** —— `~/.ssh/id_ed25519` 带口令、agent 里没有身份、
沙盒里弹不出 askpass。**改走 HTTPS + `gh` 的凭据助手**推的
(`git push https://github.com/KIM-ocean-HZ/spool.git main`)。
`git fetch origin` 仍然会失败(remote 是 ssh 的),要刷新本地 ref 就带上 https URL。
**远端 remote 本身没动过。**

**换装**:`/Applications/Spool.app` 已换成这一版。核过的:
identifier `com.oceanjin.spool`、签名 `Authority=Spool Dev`(和换装前**同一个身份**,
所以授权没失效——起来之后日志是 `[double-tap] installed at HID/active`,
两个授权齐全那一档)、`codesign --verify --deep --strict` 通过。
真库 v12 → **v13**,`stale_at` / `ref_kind` 两列都在、**全为 NULL**(每一块都还作数),
六张表行数与迁移前备份**逐表相同**。主窗打开正常,没白屏。

⚠️⚠️ **Ocean 要自己动手的一件:把连着 Spool 的 AI 客户端完全退出再打开。**
库升到 v13 了,而**已经连着的客户端还跑着换装前的旧二进制**(v12),
它们现在会报:

> 「Spool 的数据库是 v13,比这个 MCP 服务(v12)还新 — 客户端连的是旧版程序。」

**这是正确的保护,不是坏了。** 完全退出 Claude Desktop(或别的客户端)再打开就好。

**旧版留在**:`~/Desktop/Spool-旧版备份-2026-08-07T14-54-21/`。
⚠️ 桌面上现在**攒了 4 份**旧版备份(08-06 两份、08-07 两份),确认新版没问题之后可以都删掉。
**库的备份**在 `~/Library/Application Support/com.oceanjin.spool/`:
我手动做的 `spool.db.backup-20260807-145307-preschema-v13`,
以及 app 自己做的 `spool.pre-migration-v12-2026-08-07T06-54-33-049Z.db`。

### 0.3 下一窗第一件事:两个待过目 + 一个待拍板

| # | 事情 | 在哪 |
|---|---|---|
| **A** | **pack 表头重写了,要他过目** | `DESIGN_CONTEXT_HYGIENE` §8.3。这是 §6 里唯一挂着的决策点,他自己点的名 |
| **B** | **剪贴板 pack 现在默认不带表头了** | 同上。这是他 08-06 拍的板,但**默认关**这件事值得他亲眼看一次那个 pack 长什么样 |
| **C** | **AI 一句话标签(第 5 件)按稿子自己的判断没做** | §8.6 写了为什么、以及缺口还剩哪一块。**要不要做由他定** |

---

## 1. 这一窗做完的

### 1.1 上下文卫生:§4 的第 1–4 件(全稿 `DESIGN_CONTEXT_HYGIENE.md` §8)

| 序 | 做了什么 | 一句话 |
|---|---|---|
| **1** | **W7 + 标签阶梯** | 有批注的块,**批注当标题**,原文降到下面小字;没批注的一个像素不动。pack 里凡是要给一个不在正文里的块起名的地方,批注优先 |
| **2** | **取代关系(schema v13)** | `blocks.stale_at` + `blocks.ref_kind`。三种用法:只作废 / 整块取代 / 部分更正。**只有用户能用,AI 没有对应的写工具** |
| **3** | **表头重写 + 剪贴板 pack 极简开关** | 四类一个字没动,后面加了一节 `## Notation` 讲机制;剪贴板 pack **默认不带表头**,一个勾拿回来 |
| **4** | **超预算目录降级** | 被预算丢掉的块不再凭空消失,变成一行「#7 [时间 · 来源] 标签」 |
| **5** | **AI 一句话标签** | ⏸ **没做**,理由见 §8.6 —— 这是稿子 §4 自己给的判断口径 |

⚠️ **四件合并成一次 golden 重生**(照 §4 那条工程提醒),`TZ=Europe/London`,两侧一致。

### 1.2 Follow up M3:去重静默(全稿 `DESIGN_FOLLOW_UP.md` §4.2)

**M2 把「没新东西就静默」写进了提示词却没给它数据。M3 给了数据,并且加了一道
不依赖模型配合的闸。**

- **软的那半**:已经提过的 URL(新到旧、去重、最多 40 条)进跟进提示词,并说明
  「**这些页面上如果确实有新的变化,说清楚变的是什么再提**」——不是「永远别提这些」。
- **硬的那半**:跑完之后 `engineStore.siftFollowUp()` 比对,撞上的**直接删掉**,
  幸存的写回 `follow_up_state`。**在刷新待审角标之前跑** —— 重复项不许闪一下再消失。
- 幸存数为 0 → 「这次没有新东西」。**这句话现在是真的,不是指望模型。**

⚠️ **能力边界写清楚了**:URL 撞上、或几乎逐字的同一句话,抓得住;**换句话说的同一件事抓不住**。
跟 `thread_health` 查重器同一个边界。

---

## 2. 实机验证(这一窗真跑的,别再重复探)

### 2.1 ✅ GUI 没白屏,新东西都看到了

照 §6.2-bis 的配方走了一遍(identifier 临时改 `com.oceanjin.spool.wb`,构建,起,截图,
**收尾当场做了**:进程按全路径杀掉、identifier 已复位、测试库已重新 seed)。

看到的:

- **W7 生效** —— 有批注的块,批注在上、大字;原文在下、13px、一条中性竖线。
- **取代关系两个方向都渲染** —— `↩ 取代了 7/11 16:00 我们内部定的门槛…`、
  `↩ 更正了其中一处: 7/10 10:00 重排(rerank)…`。
- **作废的块留在原地、淡掉**,顶上一行「已标记『不作数了』· X 起不再进上下文(还在库里,搜得到)」。

⚠️ **仍然没验到的**:打包对话框里那个新勾选行、`SupersedePicker` 展开之后的样子。
**合成点击驱动不了这个 webview**(§6.2-bis),这一层永远只能让 Ocean 自己点。

⚠️ **osascript 取窗口 bounds 这条路在这台机器上不通** —— System Events 报窗口数 0
(连 Finder 都报 0,是脚本宿主没有辅助功能授权,不是 app 的问题)。
**这一窗的做法**:`screencapture -x` 整屏 + `sips -Z 1400` 缩一下直接看。
要让主窗在前面,`open -a <bundle 路径>` 就够(主窗沉底那条只管捕捉流程)。

### 2.2 ✅ MCP 那一侧在测试库上跑通

`tools/list` **14 个**(没变)。在测试库上验过:

- `get_pack`:作废的**置顶块**从两个区都消失了,末尾那行统计在,**并且说清了它还在库里、怎么读**;
  `↩ replaces` / `↩ corrects one point in:` / `⚠️ … corrected later — see #15` 三条都对。
- `get_blocks(stale=true)`:只还那一块,带 `stale_at`,回声里有 `filters.stale`。
- `search_blocks`:**照旧搜得到**作废的块,但命中带 `stale_at`。
- `get_digest`:作废的块不出现。

### 2.3 ⚠️⚠️ 跟进真跑了两次,跑出一个真 bug —— URL 没进正文

**第一次(haiku,$0.19,9 轮,3 条提案落库)**:提案确实进了待审面,
「之前提过的」那一段确实进了提示词,而且它**没有回到那两个种子 URL**。

**但 3 条里有 2 条正文里根本没有 URL。** 模型把链接写成了最后回复用户那段话里的
`Sources:` 列表 —— 那段话**不是用户在待审面上读到的东西**,也**不是去重闸能看到的东西**。

这一条同时打穿:§2.5-2 的注入防线(无源结论进库)、以及 M3 去重最强的那一维。

**改法**:提示词第 3 条现在**点名字段**、并明说**不许写在哪**。有测试盯着这两句话。
第二次真跑的结果见 §2.3-bis。

⚠️ **教训同 §6.2-ter**:**提示词里写了规则 ≠ 规则生效。**
这条规则从 M2 落地起就在稿子里也在提示词里,**第一次真跑就破了。**

### 2.3-bis 第二次真跑:改法生效了,而且顺手把整条闸验通了

**第二次(haiku,$0.25,16 轮,5 条提案)**:

- ✅ **5 条正文里全都有 URL**(改之前 3 条里 2 条没有)。**这个改法是被测量证实的。**
- ⚠️ 但它**这一次确实回到了一个种子 URL** —— 也就是说**软的那半靠不住,硬的那半是必须的**。
- ✅ **把真实产出喂给闸跑了一遍**:5 条 → **3 条放行、2 条拦下**(一条撞历史,
  一条是同一次运行里两条指向同一页)。

**⚠️ 顺带暴露并修掉的两个 bug(全稿 `DESIGN_FOLLOW_UP.md` §4.2.3)**:

1. **软硬两半的 TTL 不一致** —— Rust 那半没做 90 天过期,会一直压着闸已经放行的页面。
2. **全角标点会被吸进 URL** —— 模型写中文,链接后面紧跟「)」「,」「。」,
   归一化出来就是另一个串,闸悄悄不匹配。

### 2.4 花费

这一窗约 **$0.45**(两次跟进真跑,全 haiku)。

---

## 3. 下一窗要做的

### 3.1 ⏸ 三件等 Ocean(§0.3 的 A/B/C)

问的时候按 memory `write-plainly-for-ocean`:大白话、一步一动作,
**把取舍讲清楚,不要只报选项名**,能画 ASCII 草图就画(08-07 验证过,四题秒选)。

**B 那件建议这么问**:让他自己打一次包,先看默认(不带说明)的样子,再勾上看带说明的,
然后问他默认留哪个。他 08-06 说的是「让纯网页端 ai 用户使用」,但**代价是对方分不清
哪段是权威资料、哪段只是别的 AI 写的** —— 这句要跟他说清楚。

### 3.2 其余(顺序不变)

| # | 事情 | 状态 |
|---|---|---|
| **C** | **v0.4.0 收口** | ⏸ Ocean 明示往后推过两次。**上下文卫生做完了,可以再问一次** |
| **E3** | **第三个引擎档(Gemini CLI)** | ✅ 可开工。照 §7.2 的规矩,`DESIGN_AI_ENGINE.md` §7.3 那张表要长出第三列。⚠️ 模型选择器现在整个撤掉了(§9.13.10),装回去时连 `engineStore.ts` 里那行硬 `null` 一起复原 |
| **V2** | **codex 那条路的最后一格** | ⚠️ 等额度(**9/4 恢复**)。一次跑通能同时解决三件:codex 的花费字段、模型目录、流式事件名 |
| **M4** | Follow up 定时 | ⚠️ **仍然要等 M3 被证明有用**。M3 刚落地,还没有真实使用 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | **写入开关能否默认打开** | 等待审面跑过一段真实使用 |
| F | **截图 + 演示脚本整体重建** | Ocean 已批:排在 app 代码全部做完之后,和录演示视频一起做。⚠️ **块流这一窗又变了样子(W7),旧图更旧了** |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ **已落地**(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ **已落地**(2026-08-06)
   - ~~`get_blocks` 的历史过滤位~~ —— ✅ **已落地**(2026-08-07,v13 的 `stale`)
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ **引擎位泛化成两个预设(claude / codex)也落地了**(2026-08-06)。
   ⏸ **v0.4.0 收口被 Ocean 明示往后推**(08-06 晚)——
   **08-07:右侧栏和上下文卫生都做完了,可以再问他。**
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
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档,
   **所以搬到这里**):
   - ~~**AI 活动面**~~ —— ✅ **已落地**(M3)。VSCode 敢让插件干活,是因为 Source Control
     面板让你**看得见**它干了什么。⚠️ **08-06 晚:这条的正确形态是右侧栏**;
     **08-07:那个折叠区已经删掉并入右侧栏了(R2)**
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"。
     ⚠️ **W7 那一半已经落地了**(08-07 晚,批注当标题);**「只看我写的」过滤还没做**
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   ~~M3 没新东西就静默~~ ✅(08-07)/ **M4 定时(仍然只在 M3 被证明有用之后)**
9. ⚠️ **引擎档位问题** —— `DESIGN_AI_ENGINE.md` §7.7。
   实测证明 Codex 免费档不构成一条路(额度撞墙锁一个月),**引擎位今天仍然只服务
   有订阅的人**。补一个真的稳定免费的档:**08-06 晚 Ocean 点名了 Gemini CLI**,见 §3.2 的 E3
10. ⚠️ **工作台** —— 全稿 `DESIGN_WORKBENCH.md`。五阶段:
    ~~一 地基(schema v12 + 花费解析)~~ ✅ / ~~二 右侧栏~~ ✅ /
    ~~三 自动化 + 周回顾独立~~ ✅ / ~~四 流式进度~~ ✅(08-07)/
    ~~五 右侧栏重构(§9)~~ ✅(08-07)/ ~~六 UIUX 返工(§9.13)~~ ✅(08-07 晚)/
    ~~§7 notes 当标题(W7)~~ ✅(08-07 深夜)。
    **这一摊做完了,但已经返工过两轮 —— 下一轮反馈大概率还在这里。**
11. ⚠️ **上下文卫生** —— 全稿 `DESIGN_CONTEXT_HYGIENE.md`。
    五件里 **1/2/3/4 已落地(08-07 深夜,见 §8)**,第 5 件(AI 一句话标签)
    **按稿子自己的判断口径先不做**,缺口记在 §8.6:
    **搜索那一侧还缺** —— 一个 2000 字的长块,`search_blocks` 只还得出一个命中片段,
    还不出「这块整体是什么」。
    ⚠️ 调研里对 Spool 最要紧的一条:业界公认的四种记忆治理策略
    (年龄 / 新鲜度 / 显著性 / 取代),**Spool 缺的那一格(取代)这一窗补上了**;
    而「显著性」那一格 Spool 是全行业最强的形态(pin + 高亮 + 批注是用户亲手给的,
    别人要靠模型猜)。
    ⚠️ §2 那一节的调研**会过期**(2026-08 查的),下次动这摊之前重查。

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他。
   ⚠️ **08-07 走了半步**:项目管理按 `threads.deadline` 排序、快到期会变色。
   **但块正文里那种日期还是没人管** —— 那要能从正文里认出日期,是另一件事
4. ~~**重复块:用户想清但清不动**~~ —— ⚠️ **半还**。取代关系(v13)给了「这条不作数了」
   这一步,但它治的是**过时**,不是**重复**。**真·重复(同一段抓了两遍)仍然只能手动合并**,
   而 `thread_health` 只能报告不能动手
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看。
   **pack 按项目切,而用户的"一件事"跨了两个项目**

⚠️ **第 4、6 条跟 Follow up 直接相关** —— Follow up 是个进货口,而这两条是出口堵着。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图,**块流(W7)、右侧栏、项目管理都换了样子**。
  要求见 memory `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 266 通过
cargo test --manifest-path src-tauri/Cargo.toml   # 45 通过
node scripts/i18n-check.mjs                       # (none missing)
```

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。** 在仓库根目录直接跑会
`could not find Cargo.toml`。

⚠️ **`engine.rs` 里有三个测试真的会 fork 子进程**
(`a_run_is_read_line_by_line…` / `a_noisy_stderr…` / `a_run_can_be_cancelled…`)。
它们**共用一个 `STREAM_TESTS` 互斥锁**,因为 `RUNNING_PGID` 是**一个全局**。
**再加会跑子进程的测试,记得也上这把锁。**

### 6.1-bis ⚠️ 漏译检查是仓库里的脚本,别用交接里贴的段落

`node scripts/i18n-check.mjs`(加 `--dead` 还会列出没人用的字典条目)。
⚠️ 它只看**字面量**。`t(SOME_CONST)` 这种(engineStore 的 `ACTION_LABEL`、pack 模板)
它看不见,加这类表的时候要自己过一眼。

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**。
  指到父目录 → 读不到 `settings.json` → 服务器报「MCP 服务未开启」,
  **看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在副本上做**
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧。GUI 读的是
  `~/Library/Application Support/<identifier>/`(`spool.db` 和 `settings.json` 都在根上,
  不在 `data/` 里)。**`seed-workbench-lab.sh` 两边各放一份就是为了这个。**

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏** ——
`ReviewPanel` 里一个 zustand selector 每次返回新数组,当 hook selector 用就无限重渲染
(React #185)。**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**
(`selectAllThreadsFlat(useThreadsStore.getState())`),**绝不能当 hook selector**。
组件要这张表就订阅 `threadsByWorkspace` 再 `useMemo` 摊平 ——
**`ProjectBoard.tsx` 就是这么写的,照抄它。**

✅ **08-07 深夜照隔离流程看过了,没白屏。** 配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(本窗用 `com.oceanjin.spool.wb`)
2. `npm run tauri build -- --bundles app`
3. 库和 settings 预置在 `~/Library/Application Support/<新id>/` 的**根上**
   (`seed-workbench-lab.sh` 已经放好了)
4. `open -n <app> --stdout /tmp/x.out --stderr /tmp/x.err` 起来抓日志
5. ⚠️ **取窗口这一步换了做法(08-07 深夜)**:上一份交接写的「按 pid 取 bounds」
   **在这台机器上不通** —— System Events 报窗口数 0,连 Finder 都报 0,
   是**脚本宿主没有辅助功能授权**,不是 app 的问题。
   **现在的做法**:`screencapture -x /tmp/full.png` 整屏 +
   `sips -Z 1400 /tmp/full.png --out /tmp/small.png` 缩一下直接看。
   要让主窗在最前:`open -a <bundle 全路径>` 就够(「主窗永不跳前」那条只管捕捉流程)。
6. ⚠️ **想看某个项目的块流,就把测试库的 `is_capture_target` 改到那个项目上再起**
   —— app 开在捕捉目标那一屏。这是**数据**改动,不是源码改动,不用重新构建。
   同理,想让某个块出现在可视区,改它的 `created_at` 最省事。**验完记得重新 seed。**
7. ⚠️⚠️ **收尾当场做**:按**全路径**杀进程(**绝不用模糊 `pkill -f spool`,正式版一直在跑**)、
   复位 identifier、重新 seed 测试库。**08-07 白天拖过这一步,期间机器死机过一次。**

⚠️ **合成鼠标点击驱动不了这个 webview。** 所以「点开之后长什么样」这一层**永远验不到**
(这一窗轮到的是:打包对话框的新勾选行、`SupersedePicker` 展开之后的样子)。
**要眼见为实,还是让 Ocean 自己点最省事。**

### 6.2-ter ⚠️ 子进程的活,必须真跑一次 —— 这一窗**又**验了一次这条

上一窗是 `CLAUDE_CODE_EFFORT_LEVEL`:翻二进制、写测试、接通 UI,全对,全没用。

**这一窗是跟进的 URL 规则**:「没有 URL 的提案一律不许提」这条从 M2 起就写在稿子里、
也写在提示词里,**第一次真跑就破了** —— 模型把链接写进了最后回复用户的那段话,
3 条提案里 2 条正文没有 URL(§2.3)。

**怎么真跑(这一窗的做法,推荐固定下来):**

1. `scripts/seed-workbench-lab.sh` 建隔离库;
2. **argv 从 Rust 里打印出来,别手抄** —— 临时加一个 `#[test]` 打印 `claude_args(...)`,
   `cargo test … -- --nocapture`,拿完**立刻删掉**(本窗这么干了两次,都删干净了);
3. 提示词从 **MCP 的 `prompts/get`** 拿。⚠️ 例外:`follow_up` **不是 MCP prompt**,
   它的提示词只能用同样的临时 `#[test]` 调 `guidance_text("follow_up", …)` 拿
   —— 记得先 `set_var("SPOOL_DATA_DIR", …)` 指到测试库;
4. `env -i PATH=… HOME=… USER=…` 起 claude,`--model haiku` 省钱,`< /dev/null`;
5. ⚠️ **用 `--output-format stream-json --verbose` 起,别用 `json`** ——
   `json` 要等整个跑完才吐一个字,一次跟进要跑五到十分钟,
   前台跑会被 10 分钟超时打断、什么都拿不到(本窗踩过)。**放后台跑**。

⚠️ **仍然没真跑过的**:codex 的一切(额度 9/4)。

### 6.2-quater ⚠️ 探子进程可以不花模型额度(但有边界)

- **`--strict-config`(codex)**:把「要试的键」和「一个肯定不存在的键」一起传,
  报错只提假键 = 要试的键是真的。⚠️ 它验的是**键**,**不验值**。
- **拿包装脚本当探针**:把 MCP 服务器的 command 指向一个「记 argv/env 再 exec 真二进制」的脚本。
- **翻二进制里的字符串**:能证明「这个词在里面」,**不能证明「它现在还有效」**。
- **`--help` 是一手资料**,但**它没写的东西不等于不存在**(effort 就没在 `--help` 里)。
- ⚠️ **新增(08-07 深夜)**:**提示词里写了规则,连「模型会不会照做」都答不了。**
  只有真跑能答。见 §6.2-ter。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`(或带 `--manifest-path`)。**
   **看到 `Finished` 那一行再往下走。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本** —— 升 schema 不用手改脚本。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 也一样(`< /dev/null`)。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **本窗动了:v12 → v13。**
6. ⚠️ **新增(08-07 深夜)**:`mcp.rs` 的 `INSTRUCTION_HEADER` 现在是 `r##"…"##`,
   **不是 `r#"…"#`** —— 表头正文里出现了 `"#12"`,而 `"#` 会把 `r#"` 提前收掉。
   往表头里加带 `"#` 的文字之前,先想一遍这个。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 **和新的 `## Notation` 那一节** ——
这些是**给模型读的契约,任何 locale 下都保持英文**。

⚠️ **一个判断题(08-07 晚)**:「问 AI」放进剪贴板的那段提示词**是翻译的**。
理由:那是**用户在对自己的 AI 说话**,跟着 app 的语言走;pack 的表头不翻,
因为那是**给模型读的契约**。加新文案时按这条分。

检查见 §6.1-bis。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

```
TZ=Europe/London GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts
```

⚠️ **能合并成一次重生就合并** —— 这一窗四件事合成了一次。

⚠️ **fixture 现在也覆盖 v13 了**:一个被作废的**置顶**块(必须从两个区都消失)、
一条 `supersedes`、一条 `corrects`,以及标签阶梯的两处。别删掉这几块。

### 6.6 提交与推送

**08-07 深夜这一窗:代码 + 文档已提交并已推(远端 HEAD `3ae6c6b`),也已换装。见 §0.2。**

- ⚠️ **推送要单独问 Ocean,每次都要。** 这一窗他明示了「推送、换装」,
  **那是对这一次的授权,不是长期授权。**
- ⚠️ **SSH 推不了(08-07 实测)**:`~/.ssh/id_ed25519` 带口令、agent 空、沙盒弹不出 askpass。
  **走 HTTPS**:`git push https://github.com/KIM-ocean-HZ/spool.git main`
  (`gh` 的凭据助手已经配好,`git config credential.https://github.com.helper` 有值)。
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

⚠️ **验证有效(又一次)**:08-07 晚给他四个选择题,每题两个选项、每个选项都写清
「好处是什么 / 代价是什么」,并且**画了 ASCII 草图**。他四题都秒选了推荐项。
**画图比描述管用**,尤其是 UI 的事。

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
**四个动作各自的料**、项目管理那一屏能一次看全的六种截止日期状态,
以及 **v13 取代关系的三种状态**(一个被作废的置顶块 + 取代它的那一条 + 一条部分更正),
都在脚本头部的注释里写着。⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。
