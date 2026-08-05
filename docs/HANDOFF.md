# 交接文档 — 2026-08-05 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**MCP 侧的实现层旧账清空了。** 这一窗做完 **M0(闸门措辞)+ 第二轮留下的三条较轻旧账**,
四条都实机验过。`docs/DESIGN_MCP_WRITE_ROLE.md` 的 **溯源已定为 A 案**(现成的
`ref_block_id`,不动 schema)。(2026-08-05 晚)

**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 **32** 个提交,工作区干净
(`docs/MCP_feedback.md`、`docs/webimproveadvice.txt` 是未跟踪的资料文件,别顺手提交)。
基线全绿:`npx tsc --noEmit` / `npx vitest run`(**164**)/ `cargo test`(**21**)。

**👉 下一窗第一件事仍是把第三轮评审发出去。** 这一窗 Ocean 说:**GPT 那边已经开测,
但 token 不够,结论没拿到** —— 所以第三轮**还差报告**,不是还差提示词。
`docs/MCP_LAB_PROMPT.md` 已经是第三轮的。⚠️ **但实验室现在不干净了**(见 §5.2),
下一个客户端开测前必须先重播。

**M1 的前置已经清掉了**:稿子 §6 写着 M1 依赖「`↩ cites:` 要标项目名」,那条这一窗做完了。
现在 M1 只剩两个前置:**Ocean 批 §7 的三件事** + **第三轮报告回来**。

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | **拿到第三轮评审报告**:GPT 已开测但 token 耗尽、结论没出。换客户端或重开一轮。⚠️ **一个客户端测完、重播一次实验室、再测下一个**(上一轮三个并行,互相看得见对方写的块,数字全要打折) | 可开工,不需要拍板。⚠️ **开测前先重播实验室** |
| B | **Claude Code 引擎位**(§4 第 2 条,已批复可开工,目标 v0.4.0) | **Ocean 2026-08-05 明示:先留着,等第三轮测试结果出来再动** |
| D | 🚩 **`docs/DESIGN_MCP_WRITE_ROLE.md` 请 Ocean 批** —— 回答他 08-05 那个问题「MCP 是维护我数据的角色,还是回答问题的 AI?写入权限有什么用?」。⚠️ 稿子里**驳掉了他自己提的方案**,§7 有三件要拍的(其中溯源那条**已拍**) | **等 Ocean 明示**。M0 已单独走完,现在等的是 M1 |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §3.3 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

> 上一版的 C(三条较轻的 MCP 旧账)**已销案** —— 这一窗做完了,见 §2.2。

---

## 2. 这一窗做了什么

Ocean 2026-08-05 晚明示三件:**读交接开工**、**溯源用现成的 `ref_block_id`(A 案)**、
**本窗完成尽可能多的任务**。做完了:溯源拍板入稿 + M0 + 三条旧账,一共 5 个提交。

### 2.1 溯源定为 A 案(提交 `d5c08e5`)

稿子 §4.4 原来并列两案:A 用现成的 `ref_block_id` 字段,B 给 schema 加一个新的溯源列。
**Ocean 拍 A。** 稿子里 B 案已封存,理由记在 §4.4:A 不动 schema,就不用迁移注册表、
不用双侧锁步常量、不用备份真库(硬规则 5 那一整套流程全免了)。

### 2.2 M0 + 三条旧账(提交 `4ba3cf4`、`1f98621`、`81caed1`、`d1bb826`)

| # | 修了什么 | 关键取舍 |
|---|---|---|
| M0 | **把「可推导性」闸门写进 AI 读得到的地方** —— `add_block` 描述开头 + server instructions 的 WRITING 段改成角色声明 | ⚠️ **这两处不走 `t!`/`ts!`**(和硬规则 12 的例外):文件头 §两个受众 写明,工具描述与 `initialize` instructions 在任何 locale 下**都保持英文**,它们是给模型读的契约。稿子 §5.1 那句「中文照 `t!` 规矩一起写」在这里不适用 —— 已在提交说明里记账 |
| 1 | **`list_threads` 补 `last_block_at`,排序改跟它走** | `updated_at` 任何写入都会动,**AI 写一条摘要就能把项目顶到"最近活跃"第一位**。`last_block_at` 是内容时钟,空项目是 `null`。⚠️ 字段说明里写清了它**不等于"用户来过"** —— `add_block` 自己写的也算 |
| 2 | **附件命中带上 `source`** | 四类权威档位以前只有块命中能判,附件命中判不了。实测:一条 PDF 命中现在带 `source: 'course.edu · Safari'`,读的人能认出这是 📖 Reference |
| 3 | **跨项目的 `↩ cites:` 说清证据在哪个项目** | 以前同项目和跨项目**长得一模一样**,AI 会当成"上面那条",可它根本不在上面。`RefBlocks` 加 `foreign_title`,**只在跨项目时填**,同项目那行字节不变 |

⚠️ **第 3 条是三侧锁步改动**(`mcp.rs` + `src/lib/pack/assemble.ts` + `templates.ts`),
**触发了 golden 重生**(硬规则 5)。重生的 7 小时漂移已还原 —— 办法见 §5.8,
那条这次终于查清了。

**补的测试**:
- Rust `pack_renders_block_level_citations` 扩了一条**断言溯源是"算出来的"**(不是 fixture
  喂进去的):同项目不标,跨项目标出项目名。⚠️ 这条测试**验过它真的会失败** —— 故意注掉
  `foreign_title` 的赋值,断言当场红。
- golden fixture 加了第 8 块(一条跨项目引用),**两侧渲染器都对得上**。

### 2.3 四条都做了实机验证

手法是 §5.2 那条 stdio 喂 JSON-RPC。⚠️ **这次踩到一个坑,记下来省下一窗半小时**:
`SPOOL_DATA_DIR` 要指向**装着 `spool.db` 和 `settings.json` 的那一层**(实验室里是
`…/com.oceanjin.spool.lab/data`),指到父目录会读不到 `settings.json`,
服务器就报「MCP 服务未开启」,看起来像是开关没开,其实是路径错了。

| 验的 | 实测 |
|---|---|
| M0 两处措辞 | `initialize` 的 instructions 和 `tools/list` 里 `add_block` 的描述都带上了新句子,工具数仍 **13** |
| `last_block_at` | 有块的项目报内容时钟,空项目报 `null`;排序跟着它走 |
| 附件命中 `source` | 一条 PDF 命中带 `source: 'course.edu · Safari'` |
| 跨项目 cites | 跨项目那条尾巴是 `— in project: 日语练习`;同项目那条**一个字没变** |

⚠️ 验第 3 条时**是在实验室的一份临时副本上写的探针块**(`/tmp` 下,已删),真实验室没脏。
但 §5.2 关于"实验室干净"的那句仍然要更新 —— 因为 GPT 那轮已经在真实验室里跑过了。

**`last_block_at` 那条补了一次读侧实机**(只读,没写库):12 个项目 / 41 块,
`菜谱`(空项目)报 `null`,`🧪 LAB 环境自检` 和 `机器学习课` 两个项目的 `updated_at`
**比 `last_block_at` 新** —— 那正是"摘要写入顶飞排序"的原症状,现在排序不再理它。

---

## 3. 还没还的旧账

### 3.1 MCP 侧剩下的

**三条较轻的已全部销案**(这一窗做完,见 §2.2)。剩下的是**方向层**那一条:

🚩 **写入权限到底该干什么** —— 已成稿 `docs/DESIGN_MCP_WRITE_ROLE.md`,§7 有三件要拍的,
其中**溯源那条 08-05 已拍(A 案)**,第 1、2、3 条仍等 Ocean 明示。别在没批稿子之前动 M1。

起因是"AI 写坏的块没有回收路径":上一轮 Claude Desktop 自己写坏了一块(客户端把
`annotation` 参数灌进了正文),当场知道写坏了却什么都做不了。08-05 那天 Ocean 顺着
这条往上问了一层 ——「MCP 到底是维护我数据的那个角色,还是回答问题的那个 AI?
如果只是省去 compact 那一步,写入权限有什么用?」

稿子的答案:**MCP 是回答者,维护是回答的副产品**;写入只写"库里自己产不出来的东西"。
按这个定位,**"撤回刚写的块"这件事不用单独设计了** —— 分流走待审队列,
驳回一条待审项就是撤回,原先那堆边界(时间窗多长 / 算不算 AI 自己写的)在
"东西还没落地"的世界里不存在。

⚠️ **稿子驳掉了 Ocean 当天提的方案**(git merge conflict 式完整写入权限 + 逐块审批
+ 自动存一份用户原始数据)。驳的是手段不是问题:他要的安全属性成立,而且 append-only
已经免费给了。理由在稿子 §3,**他可以坚持,坚持的话按他的做,但要让他知道换掉的是什么**。

### 3.2 三方都提到的「缺什么功能」(产品向,不是 bug)

去重后按被提及次数排。⚠️ 第 1 条只做了一半(`dry_run` 是接口侧的预演,app 里的确认面没做):

1. **写之前先给用户看一眼**("存到哪里、正文是什么、依据是哪块",点头才落地)—— 三方都提。
   **接口侧已有 `dry_run`,GUI 侧未做**。⚠️ 别直接照这条做一个"每次写入都弹窗确认"
   —— `DESIGN_MCP_WRITE_ROLE.md` §4.1 论证了单条结论走 `dry_run` 就够,
   需要界面的只有分流那一种场景(高量 + 进错抽屉 + 机械)
2. **AI 到底往我库里写了什么** —— app 里一个"AI 最近写入"的列表,能跳过去就地改。
   ⚠️ 待审面(同上,§4.3)天然就是这份清单的一半,两条一起做省一个界面
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 库里就躺着他自己写的"待办:把那三条重复的合并掉",
   从 08-01 拖到今天。缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间,过期与否你自己判断"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看

### 3.3 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图。要求见 memory
  `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景,
  不是空库摆拍)
- **演示视频**:录完才动 Hero 那一屏(§1 的 G)
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有 13 个工具的部分)
   - `propose_blocks` + 待审面 —— 就是 `DESIGN_MCP_WRITE_ROLE.md` 的 M1,**等批稿**
   - 溯源:**A 案已批** —— 用现成的 `ref_block_id`,不动 schema
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— 已批复可开工,但 **Ocean 08-05 明示:
   等第三轮测试结果出来再动**
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示

---

## 5. 干活须知(踩过的坑)

### 5.1 基线与验证

```
npx tsc --noEmit          # 干净
npx vitest run            # 164 通过
cd src-tauri && cargo test # 21 通过
```

改任何 pack 渲染都要跑满这三条 —— 两侧渲染器有 golden 平价测试盯着。

### 5.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。这一窗新增的两条:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。⚠️ 从 `src-tauri/` 里
  `cargo build` 之后路径**不是** `./target/...` 相对当前目录那么直觉,写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
  (`…/com.oceanjin.spool.lab/data`)。指到父目录 → 读不到 `settings.json` →
  服务器报「MCP 服务未开启」,**看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在 `/tmp` 的副本上做**,别往真实验室追加块(这一窗就是这么做的)

⚠️ **实验室现在不干净了**:12 个项目 / 41 块,里面有 GPT 那轮留下的
`MCP 评审记录 08-05 GPT` 等痕迹。**下一个客户端开测前必须先重播实验室**,
否则新客户端会看见上一轮写的块,数字要打折。

### 5.3 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。M0 就落在例外区,别照稿子 §5.1 那句去补中文。

### 5.4 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** 这一窗查清了:fixture 的期望文件是在
UTC+1 下生成的,直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**,
diff 里全是与本次改动无关的噪音。日期归一化让测试两种情况都过,所以**测试不会拦住你**。
带上 `TZ=Europe/London` 之后,加一个块的 diff 就应该是 3 行。

### 5.5 提交与推送

- **Ocean 明示:先不推 main。推之前再问一次。** 本地已攒 32 个提交
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
- `docs/MCP_feedback.md`、`docs/webimproveadvice.txt` 是未跟踪的资料文件,**别顺手提交**

### 5.6 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。§1 表格里凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

