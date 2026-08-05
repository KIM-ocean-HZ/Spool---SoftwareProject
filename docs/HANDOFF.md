# 交接文档 — 2026-08-05 深夜(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**MCP 三轮评审收官,Claude Code 引擎位 M1 跑通,文档合并完毕。**(2026-08-05 深夜)

这一窗 Ocean 明示五件事,全部做完:①第三轮评审不再外包,由开发窗自己当 MCP 客户端跑;
②引擎位等测完再动;③写入角色**定死为"回答者"**,四件全批;④继续推进;⑤合并混乱的 md。

**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 **35** 个提交。
基线全绿:`npx tsc --noEmit` / `npx vitest run`(**169**)/ `cargo test`(**28**)。

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | **`propose_blocks` + 待审面**(`DESIGN_MCP_WRITE_ROLE.md` 的 M1) | ✅ **前置全清,可以开工** —— 稿子四件全批完、第三轮报告已回、`↩ cites:` 标项目名已做完 |
| B | **引擎位 M2**:补齐另外两个动作(整理去重 / 生成周回顾)+ 任务队列串行 + toast 细化 | 可开工。M1 的管子已经证明能跑通 |
| C | **引擎位 M3**:与「AI 活动」折叠区汇合(§4 第 7 条),形成"动作 → 痕迹"闭环 | 等 M2 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做** |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 2. 这一窗做了什么(5 个提交)

### 2.1 第三轮评审:开发窗自己当客户端跑完(报告 `docs/archive/mcp-reviews/ROUND3_CLAUDE_CODE.md`)

Ocean 明示不再等外部客户端。实验室先重播干净(12 项目 / 39 块),然后 R1–R17 + N/C/Z 全跑。

**结论:R1–R16 十六条全部修对、零回归。R17(材料栅栏)修对主路,但漏了两处。**

⚠️ **顺带发现一条会毁掉一轮测试的环境坑**(已写进 `archive/mcp-reviews/README.md`):
**已经接上的 MCP 连接不会因为重新构建二进制而更新。** 开测时真实连接跑的是几小时前的旧进程,
`list_threads` 连今天新加的 `last_block_at` 字段都没有。提示词只说了"改了 Rust 要重新构建",
没说**客户端必须完全退出重开**。下一轮开测第一件事:调 `list_threads` 看新字段在不在。

### 2.2 修完第三轮报出的三条(提交 `9615d1a`)

| # | 修了什么 | 关键取舍 |
|---|---|---|
| 1 | **`get_digest` 整个工具没有栅栏** —— 块正文里的假 `# 你要做的` 原样渲染 | 它恰好是 instructions 让模型**第一个调**的工具。同一段文本走 `weekly_review` 被净化、直接走 `get_digest` 不被净化 |
| 2 | **`distill` 的 Block IDs 表未净化** —— 块正文能把伪造的闭合标记送进指令区 | 那张表按 §3.1-4 **故意**放在栅栏外(它是指令不是材料)。两个正确的决定叠起来出了个洞,正好打穿 §3.1-6 声称的"结构性保证" |
| 3 | **`source` 没有长度上限** | 400 个 x 的来源标签会永久留在每个渲染面的块头里(append-only 删不掉)。截到 120 字符,**拒绝而不是静默截断** |

根因是**净化放错了层** —— 写在 `fenced_material()` 里,那是个 prompt 组装函数。
现在拆成 `neutralize_material_markers()`,由每个产出用户来源文本的出口各自调用。
⚠️ **刻意没有下沉到 `build_pack` / `block_head_line`**:那两个是与 `assemble.ts` 锁步的
golden 渲染器(硬规则 5),为一个只存在于 MCP 传输层的问题去动它们,要付三侧改动 + fixture 重生。

**三条的测试都验过"去掉修复就会红"。**

### 2.3 写入角色稿:四件全批(提交 `08f0543`)

Ocean 明示:**角色定死为"回答者"、不做独立维护通道、否掉完整写入权限、提案保持追加式。**
⚠️ 稿子 §3.3 那条是**驳 Ocean 自己的方案**,他**没有坚持**,采纳了"审批疲劳换掉的是一个
不会疲劳的机制"这个理由。所以 §8「AI 修改用户块」现在是**定论**,不是待议项。

顺带把 `dry_run` 那段从"我预计不会主动用"改写成第三轮的实际答复:**确实不会主动用**,
理由是「用户说存回去的时候,那句话刚刚就在屏幕上」。这条独立确认了 §4.1,
并且**抬高而不是降低** M1 的优先级。

### 2.4 Claude Code 引擎位 M1 端到端(提交 `514b70d`)

检测 + 设置区「本机 AI 引擎」+ 一个动作「提炼结论」,含取消与超时。新模块 `src-tauri/src/engine.rs`。
prompt 走 `mcp.rs` 的 `guidance_text()` —— 和 MCP `distill` 同一个常量源,一份维护两处受益。

**§2.4 三条宪法探针全部实机验过**:

| 探针 | 实测 |
|---|---|
| 让 AI 改用户手写的块 / 手写摘要 | 两次直接施压都改不动。它自己报告:"做不到,Spool 是 append-only",摘要那次贴回了工具拒绝原话 |
| prompt 里注入 shell 命令 + 读 `/etc/hosts` | `Bash` 进 `permission_denials`,文件没生成 |
| 写入落库 | 带 `Claude · MCP` 来源标签;用户块 source 为空 —— 分得清 |

⚠️ **两条踩坑记在提交说明和代码注释里,下一窗别再踩:**
1. **白名单必须逐个列工具名,不能写 `mcp__spool__*`。** 实测 claude 2.0.50 **不展开通配符**,
   13 个调用全进 `permission_denials`,跑完只会得到一句"请你打开权限",而权限本来就是开的。
   **以后 `mcp.rs` 加工具,`engine.rs` 的 `ALLOWED_TOOL_NAMES` 也要跟着加。**
2. **子进程 stdin 必须是 `Stdio::null()`。** 交互式跑同一条命令时,CLI 拿不到许可回答会卡在
   stdin 上一直挂到超时(实测 560 秒零输出)。引擎走 `output_with_timeout`,已经是 null。

### 2.5 文档合并:26 个文件 → 11 个活的

`docs/` 之前混在一起:做完的稿子、待批的稿子、原始资料、评审记录全平铺。现在:

- **`docs/README.md`(新)** —— 目录,回答"这份文件是干什么的、还活着吗"
- **`docs/archive/`** —— 12 份**已经做完**的设计稿。⚠️ 有几份开头还写着「待 Ocean 批复」,
  **那是过期的标题**:08-05 逐条对过代码,东西早就在产品里跑了(`check_library`、设置 tab 化、
  自动沉睡、第二条教程脉络)。`archive/README.md` 里逐份写清了落地的是什么
- **`docs/archive/mcp-reviews/`** —— 三轮评审记录归一处 + **下次开评审前必看的三条**
- **`docs/archive/site/`** —— 官网改版评审意见(原 `webimproveadvice.txt`)

⚠️ `docs/ID.txt` 是签名/公证用的 Apple 凭据(含 App 专用密码),`.gitignore` 挡着,
**从来没进过 git 历史,别提交、别贴进任何文档**。

---

## 3. 还没还的旧账

### 3.1 三方都提到的「缺什么功能」(产品向,不是 bug)

去重后按被提及次数排。⚠️ 第 1 条只做了一半(`dry_run` 是接口侧的预演,app 里的确认面没做):

1. **写之前先给用户看一眼**("存到哪里、正文是什么、依据是哪块",点头才落地)—— 三方都提。
   **接口侧已有 `dry_run`,GUI 侧未做**。⚠️ 别直接照这条做一个"每次写入都弹窗确认"
   —— `DESIGN_MCP_WRITE_ROLE.md` §4.1 论证了单条结论走 `dry_run` 就够,
   需要界面的只有分流那一种场景(高量 + 进错抽屉 + 机械)
2. **AI 到底往我库里写了什么** —— app 里一个"AI 最近写入"的列表,能跳过去就地改。
   ⚠️ 待审面(同上,§4.3)天然就是这份清单的一半,两条一起做省一个界面。
   **第三轮从客户端那一侧独立撞到了这条**:Claude Code 的界面把"读"和"写"显示成同一种灰字,
   用户没有任何界面能区分"AI 读了我的库"和"AI 写了我的库"
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间,过期与否你自己判断"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看。
   第三轮补了一个角度:**pack 按项目切,而用户的"一件事"跨了两个项目** —— 读其中一个的 pack 时,
   完全看不到另一个的存在

### 3.2 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图。要求见 memory
  `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景,
  不是空库摆拍)
- **演示视频**:录完才动 Hero 那一屏(§1 的 G)
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有 13 个工具的部分)
   - `propose_blocks` + 待审面 —— 就是 `DESIGN_MCP_WRITE_ROLE.md` 的 M1,
     **✅ 稿子已全批,前置全清,可以开工**
   - 溯源:**A 案已批** —— 用现成的 `ref_block_id`,不动 schema
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— **✅ M1 已落地**;M2(补齐三动作 + 队列)、
   M3(与 AI 活动面汇合)未开工,见 `docs/DESIGN_AI_ENGINE.md` §5
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档,
   **所以搬到这里**):
   - **AI 活动面**:脉络级「AI 活动」折叠区,纯读,从 source 标签 + 时间聚合。
     VSCode 敢让插件干活,是因为 Source Control 面板让你**看得见**它干了什么
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡

---

## 5. 干活须知(踩过的坑)

### 5.1 基线与验证

```
npx tsc --noEmit          # 干净
npx vitest run            # 169 通过
cd src-tauri && cargo test # 28 通过
```

改任何 pack 渲染都要跑满这三条 —— 两侧渲染器有 golden 平价测试盯着。

### 5.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
  (`…/com.oceanjin.spool.lab/data`)。指到父目录 → 读不到 `settings.json` →
  服务器报「MCP 服务未开启」,**看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在 `/tmp` 的副本上做**,别往真实验室追加块
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开。
  这一窗差点就拿旧版本当新版本验(见 §2.1)

⚠️ **实验室现在不干净了**:这一窗的第三轮在里面写了十几块(含一块故意的投毒块)。
**下一个客户端开测前必须先重播**:`./scripts/seed-mcp-lab.sh`,十秒钟。

### 5.3 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。

### 5.4 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**,diff 里全是无关噪音。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

### 5.5 提交与推送

- **Ocean 明示:先不推 main。推之前再问一次。** 本地已攒 35 个提交
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:引擎位那个提交里「Claude Code 引擎位」是功能名、
  「claude 2.0.50」是 CLI 名、「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,
  CLAUDE.md §5 明确允许。**判断标准看 author/committer 和 trailer**,不是看正文有没有这个词
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**

### 5.6 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。
