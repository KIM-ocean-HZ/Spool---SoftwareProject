# 设计稿 — 项目文件库(附件从块级搬到项目级)

> 状态:**2026-08-08 Ocean 提,本稿是评估 + 计划,未开工。**
>
> 他的原话:
> > 「添加网页链接和添加文件去掉相关功能,添加文件重构成:右侧边栏加一个类似**项目文件库**
> > 的地方,点加号可以加入相关文件,**MCP 可以申请访问文件,默认不看,打包也是默认不提取文字**,
> > 逻辑和原来的一样,但是现在的**文件对应整个项目,而不是一个 block**。」
>
> 前置:`DESIGN_CONTEXT_HYGIENE.md` §2 第 6 条(自动挂本地文件,**曾被否**——见 §2)、
> `DESIGN_MCP_WRITE_ROLE.md`(待审面,§4 要复用它)、`DESIGN_WORKBENCH.md`(右侧栏)。

---

## 0. 一句话定位

**把"文件"从块的附属物,变成项目自己的一层** —— 用户手动往项目里放文件,
默认谁都不读它;要读,得单独开口。

---

## 1. 现状(查证于 2026-08-08,别重复查)

| 项 | 今天是什么 |
|---|---|
| **数据** | `attachments.block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE`(`schema.sql:103`)。**一个附件必须挂在一个块上**,块删了附件跟着走 |
| **三种 kind** | `file` / `folder` / `url` —— 同一张表 |
| **入口** | 块悬停动作条上两个键:`附加文件`(回形针)、`附加链接`(链条),`BlockActions.tsx:119/122` |
| **提取** | `extracted_text` / `extracted_at` / `extraction_kind`(pdf / docx / plaintext / failed) |
| **进不进 pack** | `include_in_pack INTEGER NOT NULL DEFAULT 0` —— ⚠️ **已经是"默认不提取文字"**,Ocean 要的这一条今天就成立 |
| **pack 里长什么样** | 两处:块底下一行 `↳ attached file / folder / URL:`,以及末尾 "Related Files & Links" 区。没勾 `include_in_pack` 的标 `[extracted: yes, not inlined]`,表头 Notation 那节明说**读的模型可以开口要** |
| **MCP 能不能读** | ⚠️ **没有任何工具能读附件正文**。`get_pack` 会带上已勾选的提取文字,仅此而已 |

⭐ **所以 Ocean 说的"逻辑和原来的一样"是准确的**:默认不提取这条**不用改**,
要改的只有**归属层级**和**入口位置**,外加一件新东西(MCP 申请访问)。

---

## 2. ⭐ 为什么这个形状能成立,而「自动挂本地文件」被否了

`DESIGN_CONTEXT_HYGIENE` §2 第 6 条评估过一个**听起来很像**的想法,判的是**先不做**,理由是:

> 它动的是「本地读取范围」这条今天完全由**用户文件选择器**把着的边界;
> 注入链真实可走(网页 → 提案带路径 → 全批 → 私钥进库 → 下次 pack 带出去)。

**Ocean 这个形状把那条链掐断了,而且掐在最关键的一环:**

| 环节 | 被否的那个形状 | **本稿的形状** |
|---|---|---|
| 路径从哪来 | ⚠️ **AI 提议**(可被网页内容操纵) | ✅ **只能用户点加号,走系统文件选择器** |
| 谁决定读哪些 | 用户批量点头(审批疲劳 → 全批) | ✅ 用户已经选定的那一小撮,**AI 只能在这个集合里申请** |
| 默认读不读 | 挂上就进 pack | ✅ **默认不读、不提取** |

→ **AI 永远无法让一个新路径进入这个集合。** 它只能对着用户亲手放进去的文件说
「我想看这个」。这跟今天的边界是同一条,只是把"看"这个动作显式化了。

⚠️ **这条要写死进实现**:文件路径**只有文件选择器一个来源**。
任何让 AI 传路径字符串的接口(哪怕是"建议路径")都会把那条链接回去。

---

## 3. 要做的四件

### 3.1 数据:schema **v15** —— 附件挂到项目上

> ⚠️ **2026-08-08 改号:本稿原先写的是 v14,已被拍板甲+乙 占用**(`blocks.annotation_by`
> + `proposals.ref_kind`,当天落地)。**这一摊顺延成 v15**,`client.ts` 的 `SCHEMA_VERSION`、
> `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 三处要一起动(交接 §6.3-5)。

> ⚠️ **2026-08-08 按 §5 的三条拍板改写过。** 原稿写的是「`block_id` 改成可空、两种并存」,
> Ocean 选了**全搬**,所以 `block_id` 整列删掉。

```
attachments.thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE  -- 新增
attachments.block_id   -- ⚠️ 整列删掉
attachments.ai_access  INTEGER NOT NULL DEFAULT 0   -- 新增,§5.1 ①:AI 能不能主动要这个文件
```

**迁移**:每个现存附件按它那块的 `thread_id` 填上 `thread_id`,然后删 `block_id` 列;
`kind='url'` 的**直接删**(§5.1 ③ 已定,显式 `DELETE`,删掉 n>0 条要告知用户)。

⚠️ **老库迁完,pack 会变** —— 块底下那行 `↳` 消失。**这是 Ocean 选的,不是 bug**,
但意味着**迁移和 golden 重生必须同一批做完**,不能分两次发。

⚠️ **迁移必须有一条断言**:迁完之后 `SELECT COUNT(*) FROM attachments WHERE thread_id IS NULL` = 0。
同 v13 那条「每一块都还作数」的做法。

⚠️ **`schema.sql` 版本号三处锁步**(交接 §6.3-5):`client.ts` 的 `SCHEMA_VERSION`、
`mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。

### 3.2 入口:块动作条上的两个键搬进右侧栏

- ⚠️ **删** `BlockActions.tsx` 的 `附加文件` / `附加链接` 两个键(Ocean 明示)
- ➕ 右侧栏新增一格「**项目文件**」,一个加号,走系统文件选择器
- 加进来的文件 `block_id = NULL`、`thread_id = 当前项目`

⚠️ **`url` 这一种 kind 怎么办,本稿建议一并去掉**(Ocean 说「添加网页链接…去掉相关功能」)。
但要注意:**`url` 附件和 Follow up 写回的 URL 不是一回事** —— 跟进的 URL 写在块正文里,
不走 `attachments`。**删 url 附件不影响跟进。**(动手前复核一遍这条。)

### 3.3 pack:一处收益,一处损失,损失要认

| | 变化 |
|---|---|
| ✅ **收益** | 项目级文件集中在末尾 "Related Files & Links" 一处,不再散在各块底下 |
| ⚠️ **损失** | **「这个文件属于哪一块」这条线会断。** 今天块底下那行 `↳` 让读的模型知道 PDF 是为哪条结论附的;搬成项目级之后,新加的文件没有这层关系 |

**建议的折中**(不必第一期做):项目级文件保留一个可选的 `block_id`
—— 从块上加的还是挂块上,从右侧栏加的就是项目级。**两种并存,渲染各走各的。**
⚠️ 这是"配置性",按 CLAUDE.md §2 属于没被要求的灵活性,**除非 Ocean 说要,否则不做**。

### 3.4 ⭐ 新东西:MCP「申请访问文件」

**这是本稿唯一真正新增的能力,也是唯一有安全面的一件。**

**形状 —— 复用待审面,不新开界面**(同 `DESIGN_MCP_WRITE_ROLE` §4.1 的判断):

```
AI:  request_file_access(thread_id, attachment_ids[], why)
        ↓  什么都读不到,只排队
Spool: 待审面多一条「〈申请规划〉— Codex 想读 2 个文件:xxx.pdf、yyy.docx
                     理由:核对 CMU 的课程表」            [允许] [不允许]
        ↓  用户点头 = attachments.ai_access 置 1(✅ 长期,§5 ①)
AI:  从此 get_pack 里这两个文件的提取文字可以内联进来,直到用户在文件库里点掉
```

**三条约束:**

1. ⚠️ **只能申请"已经在这个项目文件库里"的文件**,参数是 `attachment_id`,**不是路径**(§2)。
2. ✅ **授权是长期的**(Ocean 2026-08-08),**但必须在文件库里可见、可一键撤销** —— 见 §5.1 ①。
3. **拒绝语要大白话**,照 `DESIGN_MCP_WRITE_ROLE` §9.3 验过的那条经验:
   参数缺失的人话拒绝语,模型接得住,不必带示例 JSON。

⚠️ **一条留给实现的警告**:长期授权 + `get_pack` 自动内联 = **一个文件的全文会从此每次都进 pack**。
按 `DESIGN_CONTEXT_HYGIENE` §9.1 的账,一个 docx 就是 4,456 字 = 一个项目预算的 9%。
→ **`ai_access` 授权之后,该文件仍然要走 `EXTRACT_CAP_LADDER` 的预算阶梯,不能豁免。**

⚠️ **工具面会从 14 个变成 15 个。** 交接 §6.3-2「开测第一件事数工具个数」那条要同步改。

---

## 4. 分期

| 期 | 内容 | 能不能独立发 |
|---|---|---|
| **一** | schema **v15** + 迁移 + 右侧栏「项目文件」+ 删块上那两个键 | ✅ 能。**这一期用户就已经拿到 Ocean 要的全部界面变化** |
| **二** | pack 渲染:项目级文件的呈现 + golden 重生 | ✅ 能 |
| **三** | MCP `request_file_access` + 待审面那一条 | ✅ 能,**而且应该单独发**——它是唯一有安全面的一件 |

⚠️ **一定要按这个顺序。** 三期倒过来做等于先开权限再建边界。

---

## 5. ✅ 四件全拍完了(2026-08-08 Ocean)

| # | 问题 | **他拍的** |
|---|---|---|
| **①** | AI 申请到的访问权 | ✅ **长期** —— 点一次以后一直能读 |
| **②** | 块上原来那些附件 | ✅ **全搬成项目级** —— 块底下那行 `↳` 从此消失 |
| **③** | `url` 那一种 | ✅ **一起删掉** |
| **④** | **已经存在的 `url` 附件怎么处置** | ✅ **(c) 直接删**(2026-08-08 明确答复,见 §5.1 ③) |

### 5.1 三条拍板各自逼出来的实现约束

**① 长期授权 → 必须有一个「我开过哪些」的地方,否则用户会忘。**

`DESIGN_MCP_WRITE_ROLE` §3.3 讲审批疲劳时的结论是「**它换掉的机制比它自己强**」——
长期授权正是为了躲开疲劳。但代价是**授权变成了一个看不见的长期状态**。

⚠️ **所以长期授权必须配一样东西:授权是可见、可撤的。** 建议的最省形态:

```
右侧栏「项目文件」里,每个文件一行:
   📄 CMU-课程表.pdf                    ✓ AI 可读   ⊘
   📄 个人陈述-v3.docx                    AI 不可读
```

**授权就是那个 ✓,撤销就是点掉它。** 不新开界面、不新开表 ——
`attachments` 上加一列 `ai_access INTEGER NOT NULL DEFAULT 0` 就够了。
→ **「AI 申请」= 待审面上出现一条,同意 = 把那一列置 1。** 用户随时能在文件库里点掉。

⚠️ **这一列和 `include_in_pack` 是两件不同的事,别合并**:
`include_in_pack` = 打包时把提取的文字内联进 pack(用户自己的动作);
`ai_access` = AI 有没有资格主动要这个文件。**两个都默认 0。**

**② 全搬项目级 → pack 里那条「文件属于哪一块」的线,是主动放弃的,不是遗漏。**

⚠️ **§3.3 里那个"两种并存"的折中,按此作废** —— Ocean 选了全搬。
`attachments.block_id` **整列删掉**(不是留着可空),迁移时把 `thread_id` 从块上取过来。

⚠️ **要一起改的三处渲染**:
- 块底下那行 `↳ attached file / folder / URL:` —— **两侧渲染器都删**(`assemble.ts` + `mcp.rs`)
- 表头 Notation 那一节里解释 `↳` 的那段话 —— **也要删**,⚠️ 两侧一字不差 + 脚本级校验
- 末尾 "Related Files & Links" 区 —— **保留,成为唯一入口**

⚠️ **golden fixture 会大动**,而且这次和拍板甲/乙**不是同一批**(那两件先做)。

**③ 删 url → ✅ 已定:直接删(2026-08-08 Ocean 明确答复选 (c))。**

原先三选一((a) 迁成块正文末尾的链接文字 / (b) 迁进项目文件库当只有链接的条目 /
(c) 直接删),稿子当时写着「(c) 是删用户数据,除非他明说,否则不做」——
**他明说了,所以 (c) 成立。**

⚠️ **查证过一件事,它让这条决定几乎零代价**(2026-08-08 读真库):
**Ocean 的真库里 `attachments` 表一行都没有** —— 任何 kind 都是 0 条。
→ **这次迁移在他自己库里删不掉任何东西。** 风险只对「别的用户的库」成立,
而今天还没有别的用户。

⚠️ **落地时仍然要按"删用户数据"的规矩办**,别因为真库是空的就省掉:
1. **迁移里写成一条显式的 `DELETE FROM attachments WHERE kind='url'`**,
   放在删 `block_id` 列**之前**,并在迁移注释里写明这是 Ocean 拍的板 + 日期;
2. ⚠️ **不静默** —— 迁移完成后若真删掉了 n>0 条,应当有一条能让用户看见的告知
   (`DESIGN_WORKBENCH` 那类一次性提示即可),**别让链接无声蒸发**;
3. `spool-db-wipe-incident` 那条 memory 的教训照旧:**迁移前的备份分支不能省。**

⚠️ 复核过:**`url` 附件和 Follow up 写回的 URL 不是一回事** ——
跟进的 URL 写在块正文里,不走 `attachments`。**删 url 附件不影响跟进。**

---

## 6. ⚠️ 动手前必读的坑

- **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那侧(交接 §6.2)
- **改 pack 渲染要跑满三条基线**,两侧渲染器有 golden 平价测试盯着(交接 §6.1)
- **golden 重生前必须 `TZ=Europe/London`**(交接 §6.5)
- **装完新版一定要看一眼窗口** —— 08-05 白屏那次是 zustand selector 每次返新数组(交接 §6.2-bis)

---

## 7. ✅ 落地记录(2026-08-12):一期 + 二期一起落地,三期没做

> 状态更新:本稿开头写的「未开工」作废。**一、二期已落地并全绿**;
> **三期(`request_file_access`)一行没写** —— 按 §4「一定要按这个顺序」,它单独发。

### 7.1 ⚠️ 一期和二期为什么必须一起发(和 §4 的分期表不一致,这里说清楚)

§4 写着一期二期都「能独立发」。**实际做下来一期不能单独发**:
一期要删 `attachments.block_id`,而 pack 的两侧渲染器**都在按 block_id 分组**
(`assemble.ts` 的 `byBlock`、`mcp.rs` 的 `filter(|a| a.block_id == b.id)`)。
列一删,那两处就不是「显示旧样子」,是**直接跑不起来**。
→ 所以 §3.1 里那句「迁移和 golden 重生必须同一批做完」是对的,而它实际上把一期二期焊在了一起。

### 7.2 数据:schema v15

| 处 | 变化 |
|---|---|
| `schema.sql` | `attachments.thread_id`(NOT NULL + ON DELETE CASCADE)、`ai_access`(默认 0);`block_id` 整列删掉;索引换成 `idx_attachments_thread` |
| `client.ts` | `SCHEMA_VERSION` 14 → 15,新增迁移 `move-attachments-to-thread` |
| `mcp.rs` | `EXPECTED_SCHEMA_VERSION` 14 → 15 |
| `client.test.ts` | 一堆 `toBe(14)` → 15,新增 `downgradeToV14`,新增两个 v14→v15 测试 |

⚠️⚠️ **这是迁移登记表里第一个会毁东西的步骤。** 前面每一步都是纯增量,跑一半和跑完
没有区别;这一步**删行**(`kind='url'`)**又删列**。所以顺序是写死的:

1. **先**把 `thread_id` 从块上补齐 —— 死在这里,什么都没丢,重跑一遍即可;
2. 再删 url 行;
3. **最后**才删索引和 `block_id` 列。

结尾有 §3.1 要求的那条断言:`thread_id IS NULL` 的行数必须是 0,否则**抛错、不盖版本号**。

⚠️ **一个已知并接受的偏差**:走迁移的老库,`thread_id` 是**可空、且没有外键**的;
全新库(直接读 `schema.sql`)才有 NOT NULL + CASCADE。SQLite 不能给已有列加 NOT NULL 或外键,
而唯一的办法是**重建整张表** —— 那张表上挂着 FTS 外部内容索引和三个触发器,
**为了一个从来没生效过的约束去重建它,炸的范围比约束本身大得多**:
项目里线程是**软删**(`deleted_at`),`ON DELETE CASCADE` 一次都没触发过。
真正守住不变量的是上面那条断言 + `createAttachment` 是唯一写入口。

⚠️ **不静默**(§5.1 ③ 第 2 条):迁移把删掉的 url 条数塞进 `pendingMigrationNotices`,
`App.tsx` 启动时 drain 一次、弹一条 toast。**真库删掉 0 条,所以他不会看见** ——
但代码里这条路是通的,有测试钉着。

### 7.3 界面:块上那两个键没了,右侧栏多了一格

- ✅ **删** `BlockActions` 的 `附加文件` / `附加链接` —— **9 个键变 7 个**
- ✅ **删** `BlockAttachments.tsx` 整个组件(块底下那排 chip)
- ➕ **新增** `RightRail/ProjectFiles.tsx`:一个 ＋、一排文件、每个文件一个 ✕
- ⚠️ **拖放的含义变了**:从 Finder 拖文件进时间线,以前是「拖到某块上就挂那块,
  拖到空白处就**凭空造一个以文件名为内容的块**」。现在**两者是同一件事**:加进这个项目的文件库。
  那个凭空造的块存在的唯一理由是「附件总得挂在谁身上」,现在有了别的地方。
  → 连带删掉 `dropStore` 的 `targetBlockId` 和 `BlockItem` 上那圈 drop ring(没有东西能再点亮它)

⚠️ **`「AI 可读」那个开关有意没做。** 它授的权只有三期的 `request_file_access` 会读,
**现在放上去就是一个拨了不通电的开关** —— 台账 §3.5 记的正是这种「发了但什么也不干」的功能。
列已经在库里,开关跟它要喂的东西一起来。

### 7.4 pack:两侧渲染器一起改,golden 重生过

- `↳ attached file / folder / URL:` 三个标记**从格式里删掉**,`ATTACHMENT_SEE_BELOW` 一起
- 文件只在末尾 **「Related Files & Links」** 出现一次,**提取的正文也搬到那里内联**
- Notation 里解释 `↳` 的那段话换成「文件不挂在块下面」,**两侧一字不差**
- ⚠️ **段落标题保留原名 `## Related Files & Links`**,没改成 `## Project Files`:
  它被**压缩提示词中英两份**当成「原样照抄这一节」的锚点引着,改名的波及面远大于收益
- ⚠️ **一条规则被反转了**:v13 那条「块被作废,它的附件跟着从 pack 里消失」**删掉了**。
  当时的理由是「pack 不能指向自己刻意扣下的材料」,前提是附件=某条结论的证据。
  现在文件是**项目的**,作废一条结论跟项目还留不留这个文件没有关系 ——
  继续跟着删,等于拿一个不相干的决定把用户自己的材料藏起来。
  同理,**预算裁剪也不再裁文件**(`budgeted_pack`)、**范围过滤也不再过滤文件**(`PackDialog`)

### 7.5 连带简化(不是顺手改的,是这次改动造出来的孤儿)

| 处 | 为什么没了 |
|---|---|
| `blocks.ts` 的 `UPDATE attachments SET block_id = …` | 合并块不再搬文件 |
| 撤销的三处附件分支(删除/合并/复制) | 删块不再级联删附件、合并不再搬、复制不再带 |
| `insertAttachments` / `restoreAttachment` / `reassignAttachmentBlock` | 上一行那三处是它们仅有的调用方 |
| 字典里 6 条 | 按 §6.1-bis 的判据核过:HEAD 里有人用、现在没人用 |

⚠️ **`forwardToThread` 复制块时不再带文件**,这是有意的:文件属于**源项目**,
把它的一条结论复制去别处,不等于决定把它的文件也复制过去。

### 7.6 MCP 侧跟着动的三处(工具面**仍然是 14 个**)

| 工具 | 变化 |
|---|---|
| `get_blocks` | 附件从**每个块一份**挪到**信封上一份** `files`。⚠️ 顺带修好一件事:分页读不再改变能看见哪些文件 |
| `search_blocks` 的 `attachment_hits` | 一条命中现在报**项目**,不报块。⚠️ **`source` 字段去掉了** —— 项目文件是用户自己放进来的,没有来源标签可称重,硬编一个才是错的 |
| `list_threads` 的预算聚合 | `JOIN blocks` 去掉,直接按 `a.thread_id` 分组 |

### 7.7 基线

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 284(282 → 284:v15 迁移两个)
cargo test --manifest-path src-tauri/Cargo.toml   # 58(改了 4 个既有测试,没加新的)
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ golden 重生用的是 `TZ=Europe/London GOLDEN_WRITE=1`(§6.5),两侧渲染器读同一份 fixture,
**Rust 那边的平价测试是真正确认两边一致的那一条**。

---

## 8. ✅ 三期落地记录(2026-08-09)—— schema v18,工具面 14 → 15(同窗另加两个,实际到 17)

> 本稿 §4 那句「三期能独立发,而且应该单独发」照做了:三期自己只加一张表、一个工具。
> 同一窗还落了另外三件(决定 4 / 决定 5 / §5.1 ① 那个开关),所以**这一版发出去工具面是 17 个**
> —— 交接 §6.3-2 那条「开测第一件事数工具个数」要跟着改。

### 8.1 ⚠️⚠️ 开工第一件事就发现 §1 那张现状表已经过期了(台账 §3.15)

本稿 §1 写着「**MCP 能不能读:没有任何工具能读附件正文**」,**整个三期的安全论证都架在这句话上**。
它在 2026-08-08 写的时候是真的,**到开工那天已经不是了**:

**二期(08-12)自己把它弄假的。** 二期重做了 `get_blocks` 报文件的方式,顺手给了它一个
`include_extracted_text` —— 那个开关**无条件返回每个文件的全文**。没有隐藏、没有 bug,
它做的就是它自己描述里写的事。但它意味着:**三期辛辛苦苦建的这道门,旁边那扇窗一直开着。**

→ 所以三期真正的第一件事不是加工具,是**把读的那一侧收紧**:

| 通路 | 收紧之后 |
|---|---|
| `get_blocks(include_extracted_text=true)` | 只返回**用户开过口的文件**的正文;其余 `extracted_text: null` + 一句 `locked` 告诉它怎么申请 |
| `search_blocks` 的 `attachment_hits` | 没开权限的命中**不给 snippet**,但仍然报**文件名、大小、`attachment_id`** |
| `get_pack` | **一个字没动**,仍然只看 `include_in_pack` |

⚠️ **「开过口」是两件事的并集**,不是只有 `ai_access`:
`include_in_pack`(用户自己勾的「打包时带上这个文件的文字」)本来就等于「我把它交给读 pack 的 AI」,
再要求申请一次是拿用户的决定跟他自己较劲。

⚠️ **为什么 `get_pack` 不跟着走 `ai_access`**(和 §3.4 那句流程图不一样,这里说清楚):
两侧渲染器有 golden 平价测试盯着(交接 §6.5),让 MCP 的 pack 和用户手里复制的 pack 分叉,
代价远大于收益;而且 §3.4 自己就警告过「长期授权 + 自动内联 = 一个文件的全文从此每次都进 pack」。
**授权之后要读,显式调 `get_blocks` 去读** —— 预算账更干净,那条警告也不用兑现。

⚠️ **为什么锁住的文件仍然报名字和 id**:全砍掉的话,AI 根本不知道有这个文件,
`request_file_access` 就成了一扇**没有把手的门**。「这句话在这个文件里」够它开口,
又不泄露正文 —— 这是这一摊唯一一处刻意留的缝。

### 8.2 数据:schema v18(一张表,别的一个字没动)

`file_access_requests`:一行一个被申请的文件,`request_id` 把一次调用里的几个文件归成**一张卡**。
`client` / `why` / `expires_at`(7 天,和提案队列同一个常量)。
⚠️ **和 `proposals` 是两张表,没有合并**:一个是「要不要把这段话存成块」,
一个是「要不要长期让 AI 读这个文件」,共用一张表只会让两边的批准语义互相污染。

### 8.3 工具:`request_file_access`(第 15 个)

- 参数 `thread_id` + `attachment_ids[]`(≤8)+ `why`(必填,≤300 字)。
- ⚠️ **`attachment_id` 必须属于 `thread_id` 那个项目** —— 少了这条,这个工具就是个
  「拿 id 探全库」的探针。实测过:传一个路径进去(`/Users/…/.ssh/id_ed25519`)当场被拒。
- 已经可读的、以及**根本没有正文可读的**(文件夹 / 解析失败),**不排队**,直接在返回里报回去。
- 返回里那个 `read_anything: false` 和大白话头一句「**一个字都没读到**」是同一件事的两遍 ——
  这个工具最容易被说成「我读了你的 PDF」。
- ⚠️ 走 `mcp_write_enabled` 那个开关(和 `propose_blocks` 同一条理由:用户点头之后它会改变
  AI 能对这个库做什么)。**关掉写入并不会把这条路堵死**——用户自己在文件面板上还能勾 ✓。

### 8.4 界面:两处

1. **右侧栏「项目文件」多一行 ✓「AI 可以读这个文件 / AI 不能读这个文件」**(§5.1 ①)
   —— ⚠️ **这就是二期故意没做的那个开关**,它跟着能读它的东西一起来了(§7.3)。
   开着的时候是强调色:一个看起来跟「没给过权限」一模一样的长期权限,等于没给过。
2. **待审面多一种卡**:谁在问、要读哪几个文件(带各自多少字)、`why` 原话、
   以及一句「答应了就是长期的,要收回去项目文件那一栏点掉」。**没有逐个文件的勾选框** ——
   一次申请是一个问题,拆开只会批出没人想批的东西。

### 8.5 基线

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 313
cargo test --manifest-path src-tauri/Cargo.toml   # 61
node scripts/i18n-check.mjs                       # (none missing)
```

⚠️ **golden 一次都没重生** —— pack 的输出一个字没动(见 §8.1 那张表最后一行)。

### 8.6 实机(stdio 喂 JSON-RPC,§6.2)跑通的六条

隔离库(`SPOOL_DATA_DIR` 指到 scratchpad 里一份新建的 v19 库),真的起 `spool --mcp`:

1. `tools/list` = **17 个,每个都有 `annotations`**(memory `mcp-tool-annotations-required`);
2. 锁着的文件:`get_blocks` 给名字/大小/id + `locked`,**不给正文**;
3. 锁着的文件:`search_blocks` 命中它,**`snippet: null`**;
4. `request_file_access` 排队成功,`ai_access` **仍然是 0**;传路径当场被拒;
5. 按用户点头那一步改库(`ai_access=1` + 删掉请求行)之后,同一个 `get_blocks` **拿到了正文**;
6. 把写入开关关掉:`request_file_access` 明确报错,`get_follow_up_brief` 照常能读。

---

## 9. ⭐⭐ 2026-08-19:门是两把锁，界面只承认一把 —— Ocean 拍板甲

**病是他自己从外面撞见的。** 他在界面上把〈申请规划〉那份 PDF 的「AI 可以读这个文件」勾**关掉**，
再问 AI 能不能读，AI 说能 —— 而且**答对了**：文件确实还可读。

**为什么。** §8（v18）把「可读」定义成**两把锁任一把开着**：

```rust
readable = include_in_pack == 1 || ai_access == 1
```

当时的理由是站得住的：**用户勾了「打包时带上这个文件的文字」，就等于已经把它交给读 pack 的那个
AI 了**，这时候还报「锁着」是撒谎。⚠️ **但后来界面把这两件事拆成了两个独立的勾**，而第二个勾关掉
时，屏幕上写的是 **「AI 不能读这个文件」**（`ProjectFiles.tsx`）。于是同一份文件：界面说不能读，
`get_project_overview` 报 `ai_readable: true`，`search_blocks` 吐正文片段，`get_pack` 把
16,945 字整篇内联。**不是代码写错了，是这两个勾长成了两个意思，而界面只承诺了其中一个。**

### 9.1 改法（三选一里的甲）

**`ai_access` 一把锁说了算。** `include_in_pack` 退回它字面的意思：内联进**用户自己复制的那份
pack**（`assemble.ts`，一个字没动）。**MCP 这一侧全部改成只认 `ai_access`**：

| 位置 | 改成 |
|---|---|
| `search_blocks` 附件命中 | `readable = ai_access == 1` |
| `get_blocks` 的 `files` | 同上（`inlined_in_pack` 仍如实报告用户那个勾） |
| `get_project_overview` 的 `files` | 同上 |
| `pack_locked_files` | `WHERE ai_access = 0` |
| `list_threads` 的 `files_locked` | 同上 |
| `list_threads` 的 `approx_pack_chars` | 只算 `include_in_pack = 1 AND ai_access = 1` |
| **`get_pack` 的附件查询** | ⭐ **多取一列 `ai_access`，没授权就不内联** |

⚠️ **最后一条是让这句话变成真的那一条。** 只改前面五处，`get_pack` 还是会把整篇正文端出去 ——
门锁上了，墙上还开着一个洞。现在没授权的文件在 MCP 的 pack 里渲染成
`[extracted: yes, not inlined]`，并出现在 `SECTION_LOCKED_FILES` 里带着 `attachment_id`，
**AI 看得见它在、看不见它写了什么、知道怎么申请**。

⚠️ **两个 pack 渲染器从此在这一点上故意不一致**，golden 对照的是渲染函数本身（没动），
分歧在**喂给它的那一行数据**：`assemble.ts` 面向的是用户自己的剪贴板，`mcp.rs` 面向的是 AI。
**受众不同，答案就该不同。**

### 9.2 回归护栏（`a_locked_file_says_how_to_ask_without_being_asked_twice`）

那条测试里原本写着「**a file the user opened up is not a locked file, whichever way they
opened it**」，并把 `include_in_pack=1 / ai_access=0` 的 `清单.txt` 算作可读 ——
**这一句正是这次要废掉的**。现在它反过来断言：`ai_readable` 为 false、`inlined_in_pack` 仍为
true（用户那个勾没被吞掉）、能拿到申请话术、**并且 `build_pack` 的输出里找不到那份正文**。

### 9.3 装机才生效

改的是 `spool --mcp` 那个二进制。**`/Applications/Spool.app` 里还是 0.6.0 的旧逻辑**，
Ocean 那份 PDF 在重新构建装机之前仍然读得到。
