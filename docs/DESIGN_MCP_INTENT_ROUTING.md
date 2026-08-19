# 设计稿 — MCP 意图路由(让模型听懂用户在说什么)

> 状态:**A / B / C / D / E 已全部落地(2026-08-09 晚,见 §8);F 仍未开工,单独一窗。**
> §6 的三题 Ocean 已经全部拍板(2026-08-09,三题都选乙)。
> 全稿基于 2026-08-09 晚 Ocean 在 ChatGPT(Codex)里跑的那一场真实测试,
> 以及**同一时刻真库里的写入取证**(`~/Library/Application Support/com.oceanjin.spool/spool.db`,
> v19,46 块)。
> ⚠️ §0–§7 是 08-09 白天写的分析 + 设计,**保留原样**,一个字没回改 ——
> 它是 case-study 里那条「机制对、路由没接上」的原始取证。落地记录另起一节写在 §8。
> 前置阅读:`DESIGN_FOLLOW_UP.md` §4.3、`DESIGN_PROJECT_FILES.md` §8、
> `DESIGN_CONTEXT_HYGIENE.md` §9.5.1 —— 这三份分别是 08-09 那三个新工具的全稿。

## 0. 一句话定位

**08-09 上线的三个工具,机制全部是好的 —— 真跑一次,两个成功、一个成功但迟到了一轮。
失败的不是机制,是「模型压根不知道有这扇门」。这一稿修的是路由,不是功能。**

一句话的证据:真库里 `request_file_access` 成功排队并被批准(附件 `ai_access = 1`)、
`suggest_follow_up_brief` 成功让 Ocean 点了「就按这个找」(两个项目的 `follow_up_brief`
现在装的都是模型写的字)。**同一场里 `propose_blocks` 调用次数是 0,`add_block` 是 12。**

---

## 1. 取证:这一场到底发生了什么

时间全部来自真库 `blocks.created_at` / `attachments.created_at`,不是转录稿的时间戳。

| 时刻 | 库里发生了什么 | 用户说的话 | 模型做对了吗 |
|---|---|---|---|
| 20:35:55 | 附件入库:`Fall_2027_美国申研完整方案_2026-08-07.pdf`,提取 **16,945 字**,`ai_access=0` | (在 Spool 里加文件) | — |
| ~20:37 | **没有任何写入** | 「有哪些文件?里面写了什么?**读不了就告诉我该怎么办**」 | ❌ 报出文件名,然后说「内容没有向我内联开放」,叫用户**去别处上传 PDF** |
| ~20:38 | `file_access_requests` 排队一张卡 | 「再读一次」 | ✅ 这次申请了 |
| ~20:40 | `attachments.ai_access` → **1** | 「批准了」 | ✅ 读到了,差异清单质量很高 |
| 20:42:59 / 20:43:27 | `add_block` ×2(申请规划 #12、Flux #11) | 「flux 相关的存 flux,**其他存原来的升学规划**」 | ❌ 这是分流的教科书句式,走了两次直写 |
| 20:47–20:51 | `add_block` ×5(申请规划 #13–#17) | (跟进目标) | ⚠️ 查得很好,但**没读过 brief**,而且五条直写进库 |
| 21:02:08 / 21:02:11 | `set_thread_summary` ×2 | 「改成更有用的跟进内容」 | ⚠️ 摘要改得对,但**跟进 ≠ 摘要** |
| 21:02:16 / 21:02:20 | `add_block` ×2,正文标题就叫「**# 当前跟进:…**」 | 同上 | ❌ 把「盯什么」写成了永久块 |
| 21:07:35–41 | `add_block` ×3(#19 #20、Flux #13) | 三个具体问题 | ✅ 内容对 |
| 21:08 之后 | 两个项目的 `follow_up_brief` 换成模型写的字 | 「点就按这个找」 | ✅ **`suggest_follow_up_brief` 全链路跑通** |

**这一场净结果:12 个新块、2 条新摘要、1 次文件授权、2 次 brief 改写、0 次分流。**

### 1.1 两条好消息,先说,别在返工里把它们弄坏

1. **`request_file_access` 的闸是对的。** 用户看到卡、按了「可以读」、模型立刻能读。
   §8 那套安全论证(只认 `attachment_id`、必须属于该项目、`why` 必填)在真客户端上成立。
2. **`suggest_follow_up_brief` 的「过目闸」是对的,而且第一天就被用户按了。**
   `DESIGN_FOLLOW_UP` §4.3 那条「直写是注入提权链」的理由**不要动**。
   ⚠️ 顺带记一笔:`applyBriefSuggestion`(`src/lib/db/threads.ts:248`)**不动 `updated_at`** ——
   现在没人观测得到,所以不是 bug;§4-C 一旦把跟进状态放进 `list_threads`,它就变成 bug 了。

---

## 2. 六个问题

### 2.1 P1 ⭐⭐ 文件那扇门,三条走廊里有两条没有把手

这是整场测试里**唯一一个能从代码逐字追到模型原话**的缺陷。

模型对 Ocean 说的原话是:

> 「这份 PDF 虽已被 Spool 提取文本,**内容没有向我内联开放**」

代码里那句话在 [mcp.rs:482](src-tauri/src/mcp.rs#L482):

```rust
return vec![format!("- {label}{shown}  [extracted: yes, not inlined]")];
```

**模型不是在拒绝,它是在照读 pack 里的一行字。** 那行字说了「提取了、没内联」,
**一个字都没说该怎么办**。

三条读路,现在的状态:

| 读路 | 会不会说出 `request_file_access` |
|---|---|
| `search_blocks` 的 `attachment_hits` | ✅ 无条件说([mcp.rs:1567](src-tauri/src/mcp.rs#L1567)) |
| `get_blocks(include_extracted_text=true)` | ✅ 说([mcp.rs:2651](src-tauri/src/mcp.rs#L2651)) |
| `get_blocks` **默认**(不传那个开关) | ❌ **只给 `ai_readable: false`,不给出路** |
| `get_pack` | ❌ **只给 `[extracted: yes, not inlined]`** |

⚠️ **最要命的是那个 `if include_extracted_text`**:`locked` 这句提示挂在开关**里面**。
用户问「有哪些文件」时,模型的自然动作是**不开那个开关**去看目录 ——
于是它走到了唯一一条没有把手的门前。工具描述里那句「the way in is request_file_access」
写在 `include_extracted_text` **这个参数自己的描述里**,模型不打算用这个参数,就不会去读它。

**这不是模型笨。是提示写在了它不会走的那条路上。**

### 2.2 P2 ⭐⭐ 三个新工具,在「唯一每个客户端都读的地方」缺席

[mcp.rs:6564](src-tauri/src/mcp.rs#L6564) 的 `initialize` instructions —— 注释自己写得很清楚:
「the ONE place every client reads」。它现在点名了 10 个工具:
`get_digest` `get_blocks` `get_pack` `list_threads` `search_blocks` `find_similar_blocks`
`add_block` `create_thread` `set_thread_summary` `propose_blocks`。

`OPENERS`([mcp.rs:6528](src-tauri/src/mcp.rs#L6528))再点名 3 个:
`weekly_review` `thread_health` `distill`。

**两处加起来 13 个。缺的 4 个是:**

`check_library`、**`get_follow_up_brief`**、**`request_file_access`**、**`suggest_follow_up_brief`**。

**这一场失败的三件事,和这份缺席名单一字不差。**

08-09 那一窗把工具面从 14 加到 17,加了三个工具、写了三段很好的工具描述、
补了 `annotations`、跑了 stdio ——**唯独没有回头改那两段路由文本**。
`tools/list` 那 30,743 字模型是当**手册**读的,不是当**路由表**读的:
它按 instructions 决定「这件事该找谁」,再翻手册确认怎么调。手册里有、路由表里没有,
等于不存在。

### 2.3 P3 ⭐ 用户说的词,和工具之间没有任何映射

`OPENERS` 那张表**整张是英文**,五行,句式是英文口语(「what have I been up to」)。
Ocean 全程说中文。他这一场说过的、每一句都落空的词:

| 他说的 | 他要的 | 该走的 | 实际走的 |
|---|---|---|---|
| 「有哪些文件」「读不了就告诉我该怎么办」 | 文件清单 + 申请授权 | `get_blocks` → `request_file_access` | 叫他去别处上传 |
| 「**跟进**我的目标」 | 读 brief,按 brief 去查 | `get_follow_up_brief` | 自己理解了一个目标,直写 5 块 |
| 「**现在在盯什么**」 | 念一遍 brief | `get_follow_up_brief` | (第三轮复制原话后才走对) |
| 「改成更有用的**跟进内容**」 | 改 brief | `suggest_follow_up_brief` | 改摘要 + 写了两个「当前跟进」块 |
| 「flux 相关存 flux,**其他存**升学规划」 | 分流待审 | `propose_blocks` | `add_block` ×2 |

⚠️ **「跟进」这个词有两个意思,而且模型选的那个不算错。**
中文里「帮我跟进目标」既可以是「去看你替我盯的那几条」,也可以是「推进我的目标」。
模型选了后者。**光靠改提示词治不好这个歧义** —— 治法是让它**先把 brief 念出来**,
再问一句「是这几条,还是你说的是别的?」。这一条要写进 §4-B 的措辞里。

⚠️ **语言这一条会撞到交接 §6.4。** 那条规矩是「工具名、工具描述、`initialize` instructions
在任何 locale 下保持英文」。**这里加的不是界面文案,是「用户可能说出口的原话样例」** ——
现有 header 里已经躺着一句中文样例「最近在忙什么」,先例在。
**保持整段英文,但把触发词写成中英并列。**

### 2.4 P4 ⭐ 分流一次都没被触发过 —— 而且 `corrects` 也是

真库数字:

```
proposal_batches   0 行        proposals   0 行
blocks             46          带 ref_block_id 的  13
                               带 ref_kind 的      0     ← 从 08-08 上线至今
```

**`ref_kind='corrects'`(08-08 上线,schema v14)一次都没用过。**
而库里躺着三个块,正文标题**自己写着「更正」**:

- 申请规划 #10 「# 更正:MIIAS 应与 MSSM 并行评估,而非因『相似』排除」
- 申请规划 #11 「# 更正:CMU M.S. in Music & Technology 从计划观察项中移除」
- Flux #13 「〈Flux〉中的旧院校日期条目只保留为历史记录…**已校正**:Cornell Tech…」

**模型知道自己在做更正,还带了 `ref_block_id`,就是没带 `ref_kind`。**
原因是死的:`ref_kind` **只存在于 `propose_blocks` 的 item 里**,而模型从来没走过
`propose_blocks`。它在 `add_block` 里找不到这个位置,就用中文写进了正文标题。

后果不是审美问题:pack 渲染器认的是 `ref_kind`,不认正文里的「更正」两个字。
所以旧块**底下不会挂那行「有一点被更正了」** —— 下一个模型读到申请规划 #4
(「MIIAS 与 MSSM 重叠,不纳入」)时,它是一条**看起来完全有效**的结论。
**这正是 `DESIGN_CONTEXT_HYGIENE` §9.3 花了一整节去治的那个毒。**

⚠️ 交接 §5-B 那条判断要更新:「Ocean 日常用法结构上永远落在 `add_block` 那侧」——
**08-09 证明不是这样**。他亲口说了一句标准分流句(「flux 相关存 flux,其他存升学规划」),
**是模型没接住**。决定 4 造出来的触发场景是真的,只是入口(`triage_conversation` 提示词)
在 ChatGPT 里根本看不见 —— MCP prompts 只有 Claude Code 会渲染。

### 2.5 P5 模型把工具的自述,当成产品事实讲给了用户

模型对 Ocean 说:

> 「旧的『我会这样写 / 你同意吗』记录是历史块,**Spool 不支持直接改删**」

**这是假的。** [BlockFeed.tsx:498](src/components/ThreadView/BlockFeed.tsx#L498) 就是删除,
带 undo;08-13 还给块流右上角加了 ✎。**用户可以改、可以删、可以作废。**

来源是 `add_block` 的描述:「Blocks are append-only: **there is no edit or delete tool**,
so a mis-written block is permanent」。这句话对**模型的工具面**成立,
模型把它当成了**产品的能力边界**转述给了用户。

代价:Ocean 现在相信自己的 app 删不掉块 —— 而库里那两块聊天残渣(§2.7)正等着他删。

### 2.6 P6 没有任何一次便宜的「这个项目有什么」

`list_threads` 现在返回:`thread_id / title / status / updated_at / last_block_at /
workspace / blocks / summary / summary_source / pinned / approx_pack_chars`。

**没有跟进状态,没有文件数,没有待审数。**

所以「这个项目在盯什么 / 有没有文件」这两件事,模型**只能靠猜要不要去问**:
`get_follow_up_brief` 要逐个项目调,`files` 只在 `get_blocks` 的返回里顺带出现。
一个不知道有没有必要问的模型,默认就是不问 —— §2.1 和 §2.3 的失败都从这里过了一道。

⚠️ 便宜:`list_threads` 的 SQL **已经 JOIN 了 `attachments` 聚合**
([mcp.rs:1128](src-tauri/src/mcp.rs#L1128)),加两个 `COUNT` 不多走一次表。

### 2.7 P7(不是 MCP 的锅,但账要记清)库里那两块聊天残渣是 app 自己存进去的

Flux #9 正文:「我会这样写:…**你同意的话,我就把这一块追加回〈Flux〉**」
Flux #10 正文:「…**你同意用这条作为〈Flux〉的第一条摘要吗?**」

一眼像是 MCP 乱写。**不是。** 取证:

```
engine_runs:  distill/codex      2026-08-08 09:30:02  ok  blocks_written=0
              thread_health/codex 2026-08-08 09:31:36  ok  blocks_written=0
blocks #9/#10  annotation_by = 'user'   annotation = '压缩 · Codex' / '去重 · Codex'
```

引擎**一个块都没写**。是 **Ocean 自己在运行卡片上点了「存回项目」**,
把引擎的整段聊天式回答原样存成了永久块。

那两个按钮(app 内的压缩 / 去重)**08-11 已经撤了**(交接 §5-C),所以**不用修**。
但残渣在库里,每次读 Flux 都要过一遍,而且**模型刚刚告诉 Ocean 他删不掉**(§2.5)。
→ **这是给 Ocean 的一句话,不是代码活:那两块可以直接删,右键就有。**

---

## 3. 对照 GPT 那份自评:哪几条要接,哪几条要驳回

它自己给的分是「存储与护栏 8/10,意图路由 4/10」。**方向判断是对的**,
但它开的药方有一半是「已经有了」或「撞标准决策」。

| 它的提议 | 判 | 理由 |
|---|---|---|
| 把「跟进」做成一级意图,区分**在盯什么 / 去跟进 / 改跟进** | ✅ **接** | 就是 §2.3。§4-B |
| 加一个 `run_follow_up` 复合工具 | ❌ **驳** | 它想要的「按 brief 去查、只报变化」**不需要新工具** —— 模型自己就有联网。真正缺的是「先读 brief」这一步。**而且**「Spool 自己出去查」那条路是 M4,`DESIGN_CONTEXT_HYGIENE` §9.5 的硬约束还没解除(**上线前应当先有一个「往外拿」的动作**)。不能因为一个模型说方便就绕过去 |
| 分流要有中文触发词 / `intent_aliases` | ✅ **接一半** | 触发词接(§4-B)。`intent_aliases` 这个字段**MCP 协议里不存在**,写了没人读;放进描述第一句即可 |
| 大幅压缩工具描述,拆成 agent-guide + 短描述 | ⚠️ **暂缓** | 30,743 字确实偏大(`propose_blocks` 一个就 5,175)。但**这一场的失败不是被截断造成的** —— 失败的三件事在描述里都写清楚了,模型是**没被路由过去**。先修路由,再看要不要减重。⚠️ 减重会碰 golden 平价测试之外的一堆断言,代价不小 |
| `add_block` 支持 `relation: corrects` | ✅ **接** —— **Ocean 拍了乙** | §2.4 的数据支持它。⚠️ 但**只开 `corrects`**,`supersedes` 永远不给(交接 §4-1 的既有拍板)。设计见 §4.4 |
| 结构化 `source_url` / `retrieved_at` / `recheck_after` | ✅ **接** —— **Ocean 拍了乙** | 真库支持这个诉求:20 个不同的 `Codex · MCP — XXX官网核验(2026-08-09)` 标签,模型在**拿 `source` 字段当引文字段用**(那个字段的描述写的是「e.g. a paper id or URL」,上限 120 字)。设计见 §4.6 |
| `get_project_overview` 复合工具 | ✅ **接** —— **Ocean 拍了乙** | 真需求成立(§2.6)。⚠️ 代价照付:annotations 铁律、`every_tool_declares_its_read_write_annotation` 的写死名单、工具面 17 → 18、双客户端真跑。设计见 §4.5 |
| 授权 scope 要更明确 | ✅ **接,但小改** | 它说自己「把较早的批准理解得过宽」,这条是真的:Ocean 说的「批准了」只针对**读那个 PDF**,模型顺手写了 9 个块。→ §4-B 的措辞里加一句 |

---

## 4. 设计

六件,按「收益 ÷ 代价」排。**A 和 B 是这一稿的主体(纯文本,零 schema);
C 和 D 是小改;E 加一个工具;F 是唯一动 schema、唯一重生 golden 的重活。**

### 4.1 A ⭐⭐ 把三条读路的门把手补齐(最小,最值钱)

**A-1 `get_blocks` 默认路也给出路。**
把 [mcp.rs:2650](src-tauri/src/mcp.rs#L2650) 那个 `locked` 提示**移出 `if include_extracted_text`**。
锁着的文件,不管开不开那个开关,都带一句 `locked`。
⚠️ 措辞要同时告诉它**两件事**:怎么申请、以及**已经可读的文件要传
`include_extracted_text=true` 才拿得到正文** —— 后面这半句现在只写在参数描述里。

**A-2 `get_pack` 的 MCP-only 尾巴。**
⚠️⚠️ **不许改 `render_project_file`** —— 它和 `assemble.ts` 是逐行平价的,
剪贴板 pack 是给人看的,「用 request_file_access 申请」对人是胡话(硬规则 5,交接 §6.5)。
**做法:在 MCP 那一侧的 `get_pack` 返回体后面追加一段,和 `include_ids` 侧表同一个位置
(它已经是「rides outside max_chars」的先例)**:

```
Files in this project you have not been let into (ask with request_file_access):
- Fall_2027_美国申研完整方案_2026-08-07.pdf   attachment_id: 0CXaIIo7pciUu0dGidtah   16945 chars extracted
```

⚠️ **只列锁着的**。已经可读的不列 —— 它的正文已经在包里了,再列一遍是噪音。
⚠️ 这一段**不进 `max_chars`**,和侧表一样。理由:它是元信息,被预算挤掉就等于没有。

**A-3 一句话规矩,写进 §4-B 的 header:**
> A file you cannot read is a request you have not made yet. Never tell the user to send
> the file another way — Spool already has it; ask for it.

**怎么验:** 真跑 §7 的三句话。**判据是模型会不会自己走到申请那一步,不是它说了什么。**
从 `--json` 事件流里筛 `mcp_tool_call`,看有没有 `request_file_access`(交接 §6.2-ter 第 6 条)。

### 4.2 B ⭐⭐ 路由层:把 17 个工具全部映射到用户会说的话

**B-1 `OPENERS` 重写。** 五行 → 十行左右,**中英并列触发词**,补齐缺席的四个工具。
形状(仍然整段英文,只有触发词是双语):

```
"what have I been up to" / "最近在忙什么" / "sum up my week"   → get_digest, then weekly_review
"where am I stuck on X" / "我在 X 上定了什么"                  → search_blocks → get_pack, or distill
"save this back" / "记下来" / "存进去"                          → add_block (ask which project first)
"这些分别存进不同项目" / "flux 的存 flux,其他存 Y" / a pasted
   slab that belongs in several projects                      → propose_blocks (the user approves in Spool)
"把这场对话整理进我的项目"                                       → propose_blocks, source_text = the USER'S turns only
"what files are in X" / "有哪些文件" / "里面写了什么"            → get_blocks, then request_file_access for any
                                                                 file with ai_readable:false — never ask the user
                                                                 to send the file another way
"what are you watching for me" / "现在在盯什么"                 → get_follow_up_brief (read it back verbatim first)
"跟进一下" / "follow up on X"                                   → get_follow_up_brief FIRST, read the lines back,
                                                                 then go check THOSE lines. 跟进 is ambiguous in
                                                                 Chinese: if the brief does not match what they
                                                                 seem to mean, ask which one before doing anything
"改一下跟进目标" / "换成更有用的跟进"                             → suggest_follow_up_brief (NOT add_block, NOT
                                                                 set_thread_summary — the brief is a separate thing)
"is X getting messy" / "有没有重复"                             → thread_health
"体检一下"                                                      → check_library
```

**B-2 `INSTRUCTION_HEADER` 的 WRITING 那一段,补三句。** 现在那段只教了
`add_block` / `create_thread` / `set_thread_summary` / `propose_blocks`。补:

1. **跟进不是块。** 「What a project WATCHES lives in its follow-up brief, not in a block.
   Writing a block titled '当前跟进 / current follow-up' is wrong twice over: it is
   permanent (blocks cannot be edited away) and nothing reads it when a follow-up runs.」
   ⚠️ 这一句直接对着真库里那两块(申请规划 #18、Flux #12)。
2. **更正走提案。** 「Correcting one point inside an existing block is `propose_blocks`
   with `ref_kind:"corrects"`, never a plain add_block whose text starts with '更正'.
   Only `corrects` makes Spool hang the correction under the old block; a title does nothing.」
3. **授权是一次一件事。** 「A yes covers the one thing you asked for. Being let into a file
   is not permission to write blocks.」

**B-3 P5 那一句改掉。** `add_block` 描述里的
「there is no edit or delete tool, so a mis-written block is permanent」
→ 「**you** have no edit or delete tool, so a block you write is permanent to you —
the user can always edit, retire or delete it inside Spool.」
`propose_blocks` 里「Retiring a block as a whole is the user's decision alone」同理,
补一句「(they do it in Spool; it is not unsupported, it is just not yours)」。

⚠️ **B 全部是文本改动,零 schema、零新工具、不碰渲染器。** 这是它排第一的原因。

### 4.3 C `list_threads` 加两个字段

在已有的两个聚合旁边加:

```json
"following_up": true,          // follow_up_brief 非空 —— 「这个项目有人在盯」
"files": 1,                    // 该项目附件数
"files_locked": 0              // 其中 ai_readable=false 的个数
```

⚠️ **`following_up` 只给布尔,不给 brief 正文。** 正文走 `get_follow_up_brief` ——
一次 `list_threads` 要能便宜地扫全库,塞 4 个项目的 brief 进去就不便宜了。
⚠️ 加了这个之后,**`applyBriefSuggestion` 必须开始动 `updated_at`**(§1.1),
否则 `list_threads` 的「两个时钟」契约会撒谎。
⚠️ 描述里那句「Two clocks per project」要跟着改,`client.test.ts` 里的字段断言也要加。

### 4.4 D ✅(已拍板)`add_block` 开 `ref_kind`,只认 `corrects`

**代价最低的一件已拍板项:`blocks.ref_kind` 这一列 v14 就有了,pack 渲染器也早就认它 ——
不动 schema、不动渲染器、不重生 golden。只是把参数开出来。**

```jsonc
"ref_kind": { "type": "string", "enum": ["corrects"],
  "description": "…同 propose_blocks…" }
```

硬约束(照抄 `propose_blocks` 那一套,别自己发明):

- **只认 `"corrects"`**。传 `"supersedes"` **当场拒绝**,措辞照 `propose_blocks`
  (「retiring a block whole removes it from every future briefing — only the user may decide it」)。
- **带 `ref_kind` 就必须带 `ref_block_id`**,而且那个 id 必须真的存在,否则拒绝。
  ⚠️ 现在 `add_block` 的 `ref_block_id` 是不是校验存在性,**落地前先看一眼**;
  `check_library` 有一条专门查「悬空引用」,说明历史上是允许写悬空的。
- 描述里必须有这一句(**这一稿的核心教训**):
  > A block whose text merely starts with "更正 / Correction" does nothing. Only `ref_kind`
  > makes Spool hang the correction under the old block; without it the old block keeps
  > rendering as a live conclusion in every future pack.

⚠️ **`every_tool_declares_its_read_write_annotation` 那条测试不用改** —— `add_block`
本来就在写工具名单里,名单和顺序都没变。

### 4.5 E ✅(已拍板)新工具 `get_project_overview` —— 工具面 17 → **18**

一次调用回答「〈X〉现在怎么样」。**只给数据,不给判断。**

```jsonc
{
  "project": "申请规划",
  "summary": { "text": "…", "source": "mcp", "written_at": "2026-08-09 21:02" },
  "follow_up": {
    "following_up": true,
    "brief": ["CMU MHCI:英语门槛…", "MIT MASc:开放/截止…", …],
    "suggestion_waiting_for_user": false
  },
  "files": [
    { "label": "Fall_2027_….pdf", "attachment_id": "…", "extracted_chars": 16945, "ai_readable": true }
  ],
  "blocks": {
    "total": 20, "pinned": 0, "approx_pack_chars": 22500,
    "newest": [ { "seq": 20, "when": "…", "source": "…", "first_line": "# CMU MHCI:L24 不能视为可用例外" }, … ]  // 5 条,每条只给首行
  },
  "needs_attention": { "duplicate_groups": 0, "stale_blocks": 0, "due_for_recheck": 0 }
}
```

⚠️⚠️ **绝对不加 `suggested_next` / `recommended_action` 这一类字段。**
那是模型的活,不是 Spool 的。同一条判断在 `DESIGN_CONTEXT_HYGIENE` §8.6
(「AI 一句话标签」按本稿自己的口径先不做)里已经拍过一次,别推翻。

设计要点:

- **`brief` 在这里给全文,和 `list_threads` 不一样。** 理由是范围:`list_threads` 要能便宜地
  扫全库,这个工具只看一个项目。⚠️ 但 `get_follow_up_brief` **不删** ——
  它是「只念在盯什么」那句话的最短答案,而且 `suggest_follow_up_brief` 的描述指着它。
- **`newest` 每条只给首行**,别给正文。要正文有 `get_blocks`,要全部有 `get_pack`。
  这个工具的预算目标是**永远 2,000 字以内**,超了就失去存在意义。
- **`needs_attention` 复用现成的检测器**(`thread_health` 的重复组 / 悬空引用,
  v13 的 `stale_at`,§4.6 的 `recheck_after`)—— **只报数,不报详情**,详情去调 `thread_health`。
- `annotations: { readOnlyHint: true }`。

⚠️ **落地时四处一起动**(交接 §6.3 记着的坑):
① `every_tool_declares_its_read_write_annotation` 里写死的名单/顺序 ——
**它是读工具,但那条测试会不会连读工具的名单一起断言,落地前先跑一次看它怎么红**;
② 交接 §6.3-2 的「工具面 17 个」要改成 18;
③ `OPENERS` 要把「看看〈X〉现在怎么样 / 这个项目什么情况」路由到它(§4.2 B-1);
④ **两个客户端都要真跑**。

### 4.6 F ✅(已拍板)块的三个出处字段 —— schema **v20**,⚠️ **这一稿唯一的重活**

```sql
ALTER TABLE blocks ADD COLUMN source_url     TEXT;      -- 出处网址
ALTER TABLE blocks ADD COLUMN retrieved_at   INTEGER;   -- 哪天查的
ALTER TABLE blocks ADD COLUMN recheck_after  INTEGER;   -- 什么时候该复查
```

⚠️ **三个可空列,跑一半和跑完没区别** —— 和 v18/v19 同类,**不属于**交接 §6.3-9
那种「会毁东西的迁移」。

**谁能写:** `add_block` 和 `propose_blocks` 的 item。**用户在界面上不填** ——
这一版 UI 只**读**(块头下面多一行),不给输入框。理由:这三个字段的使用者是
「出去查过官网的那个模型」,Ocean 手写块时不需要它们,**加输入框等于给主路径加负担**。

**渲染成什么样**(⚠️ 两侧渲染器一起动 + `TZ=Europe/London GOLDEN_WRITE=1` 重生):

```
#13 [2026-08-09 · Codex · MCP] MIT Music Technology and Computation:申请路径核验
    ↗ https://… · 查于 2026-08-09 · 2027-08 之前该复查
```

⚠️ **`source` 那 120 字的标签不删,但描述要改**:URL 从此进 `source_url`,
`source` 只留「这是什么来源」的短标签。真库里那 20 个长标签**不回改**(只增不改)。

**`recheck_after` 的兑现口**(不然它就是个没人读的列 ——
交接 §5-3 那条「v13 给了两把刀但没人提醒你去用」就是这么来的):

1. `get_project_overview` 的 `needs_attention.due_for_recheck`(§4.5);
2. pack 里过期的那条,块头那行标出来(⚠️ **不隐藏、不作废** —— 只是标一句);
3. ⏸ **UI 上的提醒这一窗不做。** 项目顶上那条日期提醒(v17,`NOTICE_STAGES`)是
   **另一套机制**(它从正文里认日期),两套合并要单独想,别顺手做。

⚠️ **建议单独排一窗做 F。** A/B/C/D/E 全是「不重生 golden」的,F 一进来就把这条判据毁了 ——
混着做,出问题时分不清是谁弄的。

---

## 5. 明确不做的

1. **不做 `run_follow_up` 工具。** §3 已述。M4 的硬约束(先有「往外拿」的出口)不动。
2. **不动 pack 渲染器。** golden 平价是 Spool 唯一挡得住「两侧分叉」的东西。
3. **不给 `supersedes`。** 交接 §4-1 的既有拍板,这一稿不重开。
4. **不做「自动把 add_block 改判成 propose_blocks」。** 服务端猜用户意图 = 用户点了保存
   却发现东西在待审面里。**服务端只把规矩说清楚,判断留给模型和用户**
   (和 §1.3 那条「超长不拒绝、只报字数」是同一条原则)。
5. **暂不减重工具描述。** §3 已述。**先修路由,下一次真跑之后再量。**

---

## 6. ✅ 三题都拍完了(2026-08-09 Ocean,**三题全选乙**)

| 题 | 拍板 | 落到哪 |
|---|---|---|
| 1. 「更正」要不要能直写 | **乙:`add_block` 也能挂更正** | §4.4 |
| 2. 要不要「一次看完这个项目」的工具 | **乙:直接加新工具**(17 → 18) | §4.5 |
| 3. 块要不要出处 / 查证日期 / 复查时间三个字段 | **乙:加**(schema v20) | §4.6 |

⚠️ **三题都选了更贵的那一边,而且他是在看过代价之后选的**(和 08-13 日期提醒那次一样,
交接 §6.7)。**别在落地时替他省** —— 尤其是第 3 题,他知道那要动 golden。

---

## 7. 给下一窗的开工顺序

⚠️ **1–5 是一窗,6 建议单独一窗。** 分界线是 golden:前五件**一次都不该重生 fixture**,
第六件必然重生。混着做,出问题分不清是谁弄的。

| 序 | 做什么 | 验 |
|---|---|---|
| 1 | **B**(纯文本:`OPENERS` + `INSTRUCTION_HEADER` + 三处措辞) | `cargo test`;`tools/list` 仍 17 个 |
| 2 | **A-1 / A-2**(门把手 + pack 尾巴) | 新增测试:锁着的文件在**默认** `get_blocks` 里带 `locked`;`get_pack` 尾巴只列锁着的;**golden 不重生**(渲染器没动 —— 这是判据) |
| 3 | **D**(`add_block` 开 `ref_kind`,只认 `corrects`) | 传 `supersedes` 当场拒;悬空 `ref_block_id` 拒;**golden 不重生**(v14 就会渲染了) |
| 4 | **C**(`list_threads` 两字段 + `applyBriefSuggestion` 开始动 `updated_at`) | `client.test.ts` 字段断言;`list_threads` 真跑 |
| 5 | **E**(`get_project_overview`,工具面 → 18) | ⚠️ 先跑一次 `every_tool_declares_its_read_write_annotation` 看它怎么红;交接 §6.3-2 改成 18;**两个客户端各真跑一次** |
| 6 | ✅ **F**(schema v20 三列 + 两侧渲染器 + golden 重生)—— **2026-08-10 落地,见 §8.3** | ⚠️ `TZ=Europe/London GOLDEN_WRITE=1`;schema 三处一起动(`client.ts` / `mcp.rs` / `client.test.ts`,含链式 `downgradeToV19`) |
| 7 | ✅ ⭐ **真跑 §7.1 的五句话**,不看模型说什么,看 `mcp_tool_call` 事件 | **2026-08-19 跑完(Codex),逐句结果见 §10** |

### 7.1 验收用的五句话(照 §2.3 那张表,每句钉一个工具)

> 1. 「看看〈申请规划〉里有哪些文件,里面写了什么?」
>    → 必须出现 `request_file_access`。**不出现就是没修好**,不管它话说得多漂亮。
> 2. 「跟进一下〈申请规划〉。」
>    → 必须**先**出现 `get_follow_up_brief`,并且**先把 brief 念回来**,再问或再查。
> 3. 「把这几条分别存进 Flux 和申请规划。」
>    → 必须出现 `propose_blocks`,**不能是两次 `add_block`**。
> 4. 「〈申请规划〉现在什么情况?」
>    → 必须出现 `get_project_overview`,**一次**,而不是 `list_threads` + `get_pack` + `get_follow_up_brief` 三连。
> 5. 「库里有一条结论已经不对了,帮我记一下正确的。」
>    → 写回去的那一次必须带 `ref_kind: "corrects"` + `ref_block_id`,
>    **不能只是正文开头写「更正」**。

⚠️ **判据是事件流里的工具名,不是模型的总结**(交接 §6.2-ter:
「提示词里写了规则 ≠ 规则生效」)。三次里有一次走错,这一稿就没做完。

⚠️ **两个客户端都要跑**:ChatGPT(Codex)那边归 Ocean(他这一场就是在那儿跑的),
Claude Desktop 的写入侧**至今没真跑过**(交接 §6.2-ter 末尾)。

### 7.2 顺手的两件小事

1. **告诉 Ocean:Flux 里那两块「我会这样写 / 你同意吗」可以直接删**(§2.7),
   模型上一场告诉他删不掉,那是假的。
2. **交接 §5-B 那条判断要改**:「Ocean 结构上永远落在 add_block 那侧」已被 08-09 证伪(§2.4)。

---

## 8. ✅ 落地记录 —— A/B/C/D/E(2026-08-09 晚)+ F(2026-08-10,§8.3)

> **六件全部落地。这一稿的代码部分做完了。**
> ⏳ **只欠 §7.1 那五句真跑** —— Ocean 在 ChatGPT 里,判据是 `mcp_tool_call` 事件里的工具名。

### 8.0 A / B / C / D / E 五件(2026-08-09 晚)

**schema 一个字没动(仍是 v19),两侧渲染器一个字没动,golden fixture 一次没重生。**
这是 §7 定的判据,兑现了。工具面 **17 → 18**,提示词面仍是 5。
基线:`tsc` 干净 / vitest **313 → 314** / cargo **61 → 65** / i18n 无漏译。

| 件 | 落在哪 | 备注 |
|---|---|---|
| **B-1** 路由表重写 | `mcp.rs` `OPENERS` | 5 行 → 13 行,触发词**中英并列**,18 个工具全部有归属 |
| **B-2** 三句规矩 | `mcp.rs` `INSTRUCTION_BODY` | 跟进不是块 / 更正走 `ref_kind` / 授权一次一件事;顺带把 A-3 那条文件铁律也写进去了 |
| **B-3** 两处措辞 | `add_block`、`propose_blocks` 描述 | 「there is no edit or delete tool」→「**you** have no…」,并明说用户在 Spool 里随时能改能删 |
| **A-1** 默认路给出路 | `get_blocks` 的 `files` | `locked` 提示**移出** `if include_extracted_text`;措辞同时教了「怎么申请」和「拿到之后要开那个开关」 |
| **A-2** pack 尾巴 | `pack_locked_files()` | ⚠️ **`render_project_file` 一个字没动**;尾巴挂在 MCP 侧,和 `include_ids` 侧表同一个位置、同样**不进 `max_chars`**;**只列锁着的** |
| **C** 三个字段 | `list_threads` | `following_up` / `files` / `files_locked`,全部长在**已经在走的那个聚合**上;`applyBriefSuggestion` 开始动 `updated_at` |
| **D** 更正直写 | `add_block` 的 `ref_kind` | 只认 `corrects`;`supersedes` 当场拒(措辞照抄 `propose_blocks`);`corrects` 必须带 `ref_block_id` |
| **E** 一次看完 | `get_project_overview` | 只给数据不给判断;真跑一次 **665 字**(预算目标 2,000) |

### 8.1 落地时和稿子不一样的三处(都记下来了)

1. **§4.2 B-2 说的「`INSTRUCTION_HEADER` 的 WRITING 那一段」指错了地方。**
   `INSTRUCTION_HEADER` 是 **pack 的授权表头**,里面没有 WRITING。WRITING 在
   `initialize` instructions 那个 4,000 字的内联字面量里(稿子 §2.2 自己指对了:`mcp.rs:6564`)。
   改的是后者。⚠️ 顺手把它**抽成了 `INSTRUCTION_BODY` 常量** —— 不是为了好看,
   是因为它内联在 `json!` 里的时候**任何测试都读不到它**,而这一稿的教训正需要一条测试。
2. **`needs_attention` 少一个 `due_for_recheck`。** 它要 `recheck_after` 那一列,
   而那是 §4.6 F 的 schema v20。**F 没做,这个字段就不能有** —— 留了注释说明它属于哪一摊。
3. **`first_line` 真的是首行。** 现成的 `head_anchor()` 会把整块压成一行再截 40 字,
   那样字段名就在撒谎;§10.1 之后块的第一行通常就是它的 markdown 标题,
   取首行比压全块在同样 40 字里说得更多。

### 8.2 ⭐ 这一稿真正留下来的东西:一条测试,不是一次修复

`every_tool_is_reachable_from_the_routing_text` —— 走一遍 `tools_descriptor()`,
任何一个工具只要**在 `OPENERS` 和 `INSTRUCTION_BODY` 里都找不到自己的名字**,当场红。

⚠️ **这是同一类缺陷的第二例**(第一例是 `annotations`,台账 §3.9)。两次都是
「规矩写下来了、当事人知道、照样破」,而且两次都**在本机毫无症状**。
第一次的反应是把规矩写得更醒目 —— 没用,第二次照破。
**把规矩变成一条会让构建失败的断言,才是唯一有效的那一步。** 全文台账 §3.17。

### 8.3 ✅ F(schema v20)已落地(2026-08-10)

三件欠账全部补齐:`get_project_overview` 的 `needs_attention.due_for_recheck`、
pack 里过期那条的块头标注、`source` 描述改成「短标签」(URL 从此进 `source_url`)。
基线:`tsc` 干净 / vitest **314 → 318** / cargo **65 → 67** / i18n 无漏译。
**golden 按计划重生了一次**(A–E 那条「一次没重生」的判据到此为止,这是设计里写好的)。

| 件 | 落在哪 | 备注 |
|---|---|---|
| 三列 | `blocks` **和 `proposals` 各三列** | ⚠️ 稿子 §4.6 只写了 `blocks`。`propose_blocks` 也开这三个参数,而**待审队列是它们最容易丢的地方** —— 用户下周才点批准,那时调用方早走了,谁也补不出一个网址 |
| 写侧 | `add_block` + `propose_blocks` 的 item | 一个 `parse_provenance`,两条路共用 —— 两侧对「什么算网址」不许分叉 |
| 渲染 | `assemble.ts` + `mcp.rs` 两侧 | 块头**正下方**一行;`render_project_file` 一个字没动 |
| 兑现口 1 | `get_project_overview.needs_attention.due_for_recheck` | 只数**没作废**的:用户已经作废的块,叫他去复查是白干 |
| 兑现口 2 | pack 里过期那条 | ⚠️ **不隐藏、不作废**,只是把那半句话换成「可能已经过时」 |
| 回读 | `get_blocks` 多回三个字段 | ⚠️ **稿子里没有这一条,是落地时加的**。没有它这三列就是只写不读 —— §9.6 那条毒的复发 |

**落地时和稿子不一样的四处:**

1. **那一行是英文,不是稿子里的中文。** 稿子写的是「↗ 网址 · 查于 X · Y 之前该复查」,
   实际渲染成 `↗ <url> · retrieved 2026-08-09 · recheck after 2027-08-01`。
   理由是硬规则 12 的既有例外(交接 §6.4):pack 的标记是**给收 pack 的模型读的契约**,
   任何 locale 下都英文,`note:` / `↩ cites:` / `⚠️ one point…` 全是这样。
   过期那句是 `⚠️ may be out of date — was to be rechecked after <date>` ——
   **说的是「可能」**,因为没有任何人说过它不成立,那是用户的判断(§3.1)。
2. **日期渲染到「日」,不是稿子例子里的「2027-08」月份。** 两个字段都是完整 `YYYY-MM-DD`。
3. ⚠️⚠️ **两个日期存的是 UTC 零点,渲染走 `format_utc_date` / `formatUtcDate`,
   不走库里其它时间戳那条本地时区的路。** 它们是**日子不是时刻** ——
   「查于 2026-08-09」在时区两侧要读成同一天,过一遍 localtime 会有一半人看到前一天。
4. **`now` 现在要传进渲染器**(两侧都是)。「过没过期」必须和 pack 表头的日期是同一瞬,
   而且 golden 不能是个定时炸弹 —— 测试把 `now` 钉死。

⚠️⚠️ **`source_url` 只收 `http(s)://`,本地路径当场拒。**
pack 是**唯一被设计成要离开这台机器的东西**(§3.1-5 就是为这个把附件路径缩成文件名的),
一个 `/Users/hzjin/…` 进了这一列,等于把用户的账号名和目录结构写进他今后拷给任何人的每一份简报。

⭐ **这一件真正留下来的东西,和 A–E 一样是一条判断,不是一次修复** ——
**golden 平价测试挡不住这个 bug**:它比对前会把两边的 `YYYY-MM-DD` 全部换成 `<DATE>`
(本地时区渲染的字节在别的机器上不一样,不换就没法提交)。
所以「一侧走 UTC、另一侧走本地」它照样全绿。
**测试排除掉的东西,也是它规格的一部分。** 两侧各补了钉死日期字面量的断言。
全文台账 §3.18。

---

## 9. ⭐⭐⭐ 2026-08-11:验收第 6/7 句「跑了但没落库」—— 病根有两个,都不在路由文本里

> 起因:Ocean 在自己的 ChatGPT 里跑了 §7.1 的第 6、7 句(查 CMU 截止日期存进〈申请规划〉/
> 更正 case-study 的说法),**两句都回了「已记入」,而 Spool 里一条都没有。**
> 取证全过程和证据在台账 **§3.33**。这一节只写**怎么修**。

### 9.1 两个独立的病根(顺序别搞反)

| # | 病根 | 证据 | 路由文本能不能治 |
|---|---|---|---|
| **①** | **那场对话里 Spool 的工具根本不在工具面上** | Codex 自己的日志里,最后一次启动 `spool --mcp` 是 **08-10 18:23**,08-11 一次都没有;当天三个会话的记录里 `mcp__spool` 出现 **0 次** | ❌ **完全治不了** —— 文本要先被送到才有意义 |
| **②** | **本地有个同名的东西,把意图整个抢走了** | 会话的工作目录是 `~/Documents/ChatGPT/申研选校规划/`,里面躺着《Fall_2027_美国申研完整方案.docx》和 `build_application_plan.py`;模型第一个动作就是列这个目录 | ⚠️ **治不动**:我们的文本走 `initialize` 的 `instructions`,而**已知有客户端不读这个字段**(Claude Desktop / claude.ai 都有公开 issue) |

⚠️⚠️ **这一稿最大的假设在这里被证伪了一半。** `mcp.rs` 那句注释写着
「`initialize` instructions 是每个客户端都会读的那一处」——**不成立**。
`every_tool_is_reachable_from_the_routing_text` 那条测试仍然是对的,但它保证的是
「文本里点到了每个工具」,**保证不了文本到得了模型**。

### 9.2 ⚠️⚠️ Ocean 定的三条约束(2026-08-11,**任何方案先过这三关**)

| # | 原话 | 意思 |
|---|---|---|
| **1** | 「每次都让用户写『使用 spool』摩擦太大」 | **不许靠用户多打字。** 下面每一条都按「用户要多做什么」排序,不是按实现难度 |
| **2** | 「不能关掉插件,**使用 spool 首先不能影响其他功能的使用**」 | ⚠️⚠️ **「少开几个服务器」这条外部经验,在这个产品里不许当解法。** Spool 要在一个装满了别的插件的客户端里**照样能用**,而不是要求用户为它腾地方。⭐ **这一条是产品定位,不是这一摊的技术选择** —— 一个要求你先卸载别的东西的工具,和「只接住那些本来会丢掉的碎片」是互相矛盾的 |
| **3** | 「用户用〈〉括起来的名字指的是 Spool 项目 —— **这违背了用户的使用习惯**」 | ⚠️⚠️ **不许发明记号。** 任何「你以后要这么说 / 这么写」的约定都是把摩擦从一句话挪成一个习惯,**没有减少,只是藏起来了**。⭐ **规矩要加在 AI 身上,不能加在用户身上** —— 见 §9.4 甲的改写 |

### 9.3 查到的成熟做法(2026-08-11 联网查,⚠️ 外部事实会过期)

| 做法 | 成熟度 | 用户要多做什么 |
|---|---|---|
| **AGENTS.md / CLAUDE.md 指令文件** | ⭐ 跨厂商约定(agents.md;OpenAI Codex / Cursor / Amp / Jules / Factory 都读)。**Codex 从 `~/.codex/` 一路走到当前目录**,逐层读 | **零**(装一次) |
| **MCP prompt = 斜杠命令** | ⭐ 协议自带。**prompt 是用户选的,模型不参与判断** —— 这正是「选定模式」在 MCP 里的标准形态 | 一个斜杠 |
| ~~少开几个服务器/插件~~ | 公开经验:**超过 6–7 个服务器,工具选择准确率就开始掉** | ❌ **被 §9.2-2 否掉了**。这条经验是真的,但**它不是我们能开的药方** —— 它要用户为 Spool 让路。⭐ 它对我们的意义反过来:**「工具面很挤」是我们必须假定的常态**,方案要在挤的环境里成立 |
| ⭐ **项目当资源(`spool://thread/<id>`)** | ⚠️ **已经做了,只是没人知道**(`mcp.rs` §20.13):每个项目都是一条 MCP 资源,`resources/read` 直接给 pack。**支持资源 UX 的客户端(Claude Desktop 的 @)可以直接 @ 一个项目**,不经过任何工具调用 | **零打字** —— 用户是「指」,不是「说」 |
| 服务端 `instructions` | ⚠️ **不可靠**,见 §9.1 | 零,但可能根本没送到 |

⭐⭐ **上面第三行是这次查下来最便宜的一条**:歧义的根源是**用名字去指一个东西**,
而名字在两个世界里都存在。**@ 一下不是名字,是引用** —— 它天生没有歧义。
⚠️ 但它只在支持资源 UX 的客户端里有入口,所以它是**补充**,不是替代。
**下一件顺手的事:「复制使用提示」那一段里要提一句它**(现在一个字都没提)。

### 9.4 建议做的三件(⭐ 要他拍板的在 §9.5)

**甲 ⭐⭐ 一键接入的时候顺手写一段 `AGENTS.md` / `CLAUDE.md`**

在 `~/.codex/AGENTS.md`(以及 Claude 那边对应的文件)里追加一段**带标记的** Spool 段落:

```
<!-- spool:begin --> … <!-- spool:end -->
```

⚠️⚠️ **第一版写歪了,原话记在这里当靶子**:我写的是「用户用〈〉括起来的名字指的是 Spool 项目」。
**Ocean 当场否掉**:「这个意思是让 AI 去读 <> 里面的文字吗,不能这样,**这违背了用户的使用习惯**。」
⭐ **他是对的,而且指出的是同一个病**:那条规矩要求用户**以后都用某种写法说话** ——
摩擦没有消失,只是从「每次多打四个字」变成「每次都要记得加括号」。
**改法是把规矩从用户身上挪到 AI 身上:不许约定记号,只许要求模型多做一次核对。**

改写后的内容(**不含任何要用户改说法的东西**):

> 这台机器上装着 Spool(思簿),通过 MCP 连着,里面按项目存着用户长期在做的事。
> **当用户说「存进 X / 记一下 / 跟进 X / X 现在怎么样了」这类话,并且点了名**:
> **先调一次 Spool 的 `list_threads`,看有没有叫这个名字的项目。**
> 有 —— 那就是他说的那个,用 Spool 的工具。
> **本地有个同名的文件夹或文档,不是那个项目;不要改文档来代替。**
> 一个都对不上 —— **说出来问他**,不要自己挑一个本地文件。

- ⭐ **为什么这样写才对**:它**没有给用户任何新规矩**,只给了模型一条「先看一眼再动手」。
  代价是那类句子里多一次 `list_threads`(最便宜的一个调用),**换掉的是"猜"**。
- **好处**:写一次永久生效,**用户一个字都不用多打**;而且这是这些客户端**保证会读**的通道,
  不像 `instructions` 那样看客户端脸色。
- ⚠️ **明确不写进去的**:**用户的项目名单**。写进去当然更准,但那是把库里的内容抄进主目录下一个
  谁都读得到的明文文件,而且项目一改名就过期。**核对交给 `list_threads`,它永远是新的。**
- **代价**:Spool 要往用户主目录下一个**共享文件**里写东西。
  必须:① 只在他点「一键接入」时写;② 标记包起来,**能一键移除**;③ 写之前备份(和写客户端 config 同一套规矩)。
  ⚠️ **这是新的「往外写」的行为,按硬规则 7 要他单独明示。**

**乙 ⭐⭐ 把日常最高频的两件事做成 prompt(现在缺的正是它们)**

现在 5 个 prompt(`compress_pack` / `weekly_review` / `thread_health` / `distill` /
`triage_conversation`)**全是维护类**,而用户每天真正在做的两件事一个都没有:

| 新 prompt | 干什么 | 为什么它必须是 prompt 不是 tool |
|---|---|---|
| `file_this` | 把刚才这段 / 这个结论存进某个项目 | 用户点它的那一刻,**目标是 Spool 这件事就没有歧义了** —— 模型不用再去猜〈申请规划〉是文件夹还是项目 |
| `catch_up` | 这个项目现在什么情况 / 去查一下再存回来 | 同上,而且它正好把 `get_project_overview` 这扇门摆到用户手边 |

- **好处**:**一个斜杠 = 一次"选定模式"**,零判断;代价:各客户端暴露 prompt 的方式不同,不是每个地方都有入口。

**丙 ⭐⭐ 让「没连上」看得见 —— 客户端心跳(这次真正的漏检)**

`initialize` 里带着 `clientInfo.name`。**每被连上一次就记一行**(哪个客户端、什么时候),
设置里那排「✓ 已接入」改成 **「Claude Code · 3 分钟前 / ChatGPT · 20 小时前」**。

- ⚠️ **为什么这条最值钱**:现在那个「✓ 已接入」读的是**客户端的配置文件**——
  它回答的是「配置里有没有这一条」,**不是「有没有人在用」**。
  这次五个 `--mcp` 子进程全活着,**没有一个属于 ChatGPT**,而界面上一片绿。
  **状态灯接在开关上,没接在灯泡上。**
- **代价**:一次写入 + 一行 UI。⚠️ **纯本地**,别做成任何形式的遥测叙事。

### 9.5 ✅ 拍板结果(2026-08-11 Ocean:「其他我都同意」)

| # | 件 | 结果 |
|---|---|---|
| **甲** | 一键接入时写 `AGENTS.md` / `CLAUDE.md` | ✅ **准了**,⚠️ **但内容必须是改写后那一版**(§9.4 甲):**不许约定记号,只许让模型先核一次 `list_threads`** |
| **乙** | 两个新 prompt(`file_this` / `catch_up`) | ✅ **做**。工具面不变,**提示词面 5 → 7**,golden 要重生(硬规则 5) |
| **丙** | 客户端心跳(上次真连上是什么时候) | ✅ **做**,而且**建议排第一** —— 前两件都要靠真跑来验,而没有它,下一次「跑了没落库」还是查不出来 |
| ❌ | 关插件 | **否**(§9.2-2) |
| ❌ | 〈〉记号约定 | **否**(§9.2-3) |

**开工顺序**:丙 →(装机,让他自己看见 ChatGPT 那一行是灰的)→ 甲 → 乙 → 拿 §7.1 第 6 句真跑一次。
⚠️ **甲和乙都只能靠真跑验**(§6.2-ter),写完不算数。

### 9.7 ✅ 落地记录 —— 甲 / 乙 / 丙(2026-08-11 晚)

**三件全做完了。** 丙已提交(`d29b154`)并装机;甲乙已提交(`ddfc49a`),**没装机**。
四条基线:`tsc` 干净 / **vitest 343** / **cargo 70 → 72** / i18n `(none missing)`。

| 件 | 落在哪 | 验到什么程度 |
|---|---|---|
| **丙** | `mcp.rs` `record_client_seen` / `client_key_from_info` / `clients_seen`、`lib.rs` `mcp_clients_seen`、`clients.ts`、`McpConfig.tsx` | ✅ **已装机**,五条旁证全过(交接 §0-new)。**装完的正确状态是六行全「还没连上过」**,原因见下 |
| **甲** | `mcp.rs` `client_guidance_path` / `guidance_block` / `write_client_guidance`,挂在 `configure_client` 上;`McpConfig.tsx` 加了一行明写 | ✅ 单元测试覆盖六种情形;⏳ **没装机、没真跑** |
| **乙** | `mcp.rs` `file_this_prompt_text` / `catch_up_prompt_text` + `prompts/list` + 分发 | ✅ **真 stdio 跑过**(临时库):7 个 prompt 都在,两个新的取回来都对,chooser 那条路也对;⏳ **没在真客户端里点过** |

**三处和这一节写的不一样,理由留住:**

1. ⚠️⚠️ **golden 没重生,而且不需要。** §9.5 那张表写着「golden 要重生(硬规则 5)」——
   **那是预判,是错的**。prompt 动不到 pack 渲染,`golden_pack_matches_fixture` 原样通过。
   ⭐ 交接 §6.5 自己就写着「别条件反射重生」,**这次应在了它自己的预判上**。
2. ⭐ **甲只写两个文件**:`~/.codex/AGENTS.md` 和 `~/.claude/CLAUDE.md`。
   Cursor / Windsurf / VS Code / Claude Desktop 的全局规则文件**没人量过在哪**,
   猜一个等于往 `$HOME` 写一个永远不会被读的文件。**量到了再加一行。**
3. ⭐ **甲多做了一件这一节没要求的事**:设置里加了一行,明写「接入时会往这两个文件里写一段、
   怎么删」。⚠️ **§9.4 甲 要求「能一键移除」,而不知道有这段的人无从删起** ——
   往用户主目录写文件不能让他自己撞见。

**甲的一条规矩是写代码时才定下来的**(台账 §3.35):**只有「恰好一对完整 marker」才算我们的、
才原地替换**;没有 marker、手改剩下半个、顺序反了 —— 一律追加。
⭐ **不对称是故意的**:追加留下的重复用户看得见、删得掉,而从半个 marker 往下替换
**会静默吃掉不是我们写的字**。已经是最新的就一个字节都不动,也不切新的 `.bak`。

**⚠️ 丙装完为什么是六行全灰**(台账 §3.34):机器上活着的 9 个 `--mcp` 子进程**全是旧二进制**,
它们不会再连一次。**心跳只能记录装机之后新建立的连接。**
⭐ **这反而让验收更干净**:让他完全退出重开**一个**客户端,**只有那一行会跳出时间**,
其余五行仍是灰的 —— 半满的那种起始状态反而验不出这个。

**还欠的三件**:

1. **甲乙装机**(要他点头;schema 没动,**不迁移**)。
2. ⭐ **甲要真跑才算数**:装完之后**重新点一次「一键接入」**才会写 `AGENTS.md`——
   ⚠️ **光装机不写**。写完打开那个文件看一眼。
3. **拿 §7.1 第 6 句真跑一次**(⚠️ 换个目录,**别在 `~/Documents/ChatGPT/申研选校规划/` 里跑**)。

➕ **顺手没做的一件**(§9.3 末尾那条):「复制使用提示」那一段里**仍然一个字都没提**
`spool://thread/<id>` 这条资源路(Claude Desktop 里可以直接 @ 一个项目)。**本窗没动它** ——
它不属于甲乙任何一件,单独做。

### 9.8 ⭐⭐⭐ 2026-08-12:乙被证伪 —— Codex **根本不问 prompt**

**取证**(台账 §3.36)。写了个透明代理夹在 codex 和 Spool 中间,录下每一条 JSON-RPC,
用 `codex exec -c 'mcp_servers.probe.command=…'` 临时挂上(⭐ **`-c` 注入,用户的
`config.toml` 一个字没动**)。`codex exec` 和 `codex` TUI **两侧完全一样**:

```
initialize / notifications/initialized / tools/list
```

**`prompts/list` 一次都没有。** 它 `initialize` 里声明的能力只有 `elicitation`。
自报身份:`name=codex-mcp-client, title=Codex, version=0.147.0`。

⚠️⚠️ **§9.3 那张表第二行「MCP prompt = 斜杠命令 ⭐ 协议自带」现在是错的** ——
至少对 Codex/ChatGPT 是错的。**和 §9.1 那条 `initialize.instructions` 是同一类错,第二次。**

⚠️ **中途的次生错误也记下来**:先从二进制 `strings` 到 `prompts/list`(22 次),
判断成「能力有,是显示问题」。**那些字符串来自它链接的 rmcp SDK** —— SDK 实现整个协议,
不代表调用方用了它。**「二进制里有这个字符串」不是「它会调这个方法」的证据。**

⭐⭐ **通用解药,下次先做这个**:**协议里有、SDK 里有、服务端广播了 —— 这三件都不等于客户端会问。
唯一记录「它到底问了什么」的地方是线上流量。** 一个转发不改内容、顺手记日志的代理约三十行,
**这一稿两次踩的坑(§9.1 和这一条)它都能在动工之前挡住。**

**处置(Ocean 2026-08-12)**:

| | 结果 |
|---|---|
| **乙(两个 prompt)** | ⚠️ **代码留着,不再指望** —— Claude 系客户端里有入口。**别删**(本窗删过一次,他说「留着」,已恢复) |
| ⭐ **改走 `@spool`** | 「问 AI」拷的那句话,发给 ChatGPT 时前面加 `@spool `(`56cd2e9`) |
| ❌ **不给乙做「工具版」** | `catch_up` 本来就是 `get_project_overview`,`file_this` 本来就是 `add_block` —— **工具早就有**。乙加的从来不是能力,是**一个不需要模型判断的入口**;做成工具等于把判断还回去,正好抵消它存在的理由 |

⭐⭐ **为什么 `@spool` 不违反 §9.2-3 那条「不许发明记号」**:〈〉是**我们发明**一个记号;
`@` 是**客户端自己就有的东西**,用户本来就在用它指别的连接器。
**§9.3 早就写过这条判断**:「@ 一下不是名字,是引用 —— 它天生没有歧义」。

⚠️ **只给 codex 加前缀,而且只因为量过**(`clients.ts` 的 `AT_MENTIONS_THE_SERVER`)。
**`@` 不是通用约定**:Claude Code 里 `@` 是**文件路径**,Cursor / VS Code / Windsurf 里是拉文件。
给它们加 = 让客户端去找一个叫 `spool` 的文件,**比不提服务端更糟**。**看到哪个真能用再加。**

⏳ **还没验的**:粘进 ChatGPT 之后 `@spool` **是不是真的变成一个提及**,还是只是一串普通文字。
**只有 Ocean 能看**,而且 `56cd2e9` 还没装机。

### 9.6 给他的即时办法(不用改代码,今天就能用)

1. **完全退出 ChatGPT 再打开**,然后当场核一句:
   `ps -eo pid,command | grep "Spool.app/Contents/MacOS/spool --mcp"` —— 看有没有属于它的那一个。
2. **别在 `~/Documents/ChatGPT/申研选校规划/` 那个目录里跑 Spool 的验收句** ——
   那里有一个同名文档,它每次都会赢。⚠️ **这是这一次的临时绕路,不是解法** ——
   解法是 §9.4 甲,让模型自己去核。
3. ~~关掉几个用不上的插件~~ —— ❌ **Ocean 否掉了(§9.2-2)**:
   「使用 spool 首先不能影响其他功能的使用。」**这条别再提。**

---

## 10. ⭐⭐⭐ 2026-08-19:§7.1 五句真跑了 —— 3 句干净过,1 句过得难看,1 句测不出来

**这一场归 Ocean,在 Codex 里跑的,13:21–13:27。**
取证文件:`~/.codex/sessions/2026/08/19/rollout-2026-08-19T13-21-52-*.jsonl`,
判据是里面 `payload.type == "custom_tool_call"` 的 `tools.mcp__spool__*` 调用,
**不是模型的总结**(§7.1 的 ⚠️)。写入侧对照的是真库 `spool.db`(v23)。

| 句 | 判据 | 结果 | 事件里到底调了什么 |
|---|---|---|---|
| 1 有哪些文件/里面写了什么 | 出现 `request_file_access` | ⚠️ **这台机器上测不出来** | 见 §10.1 |
| 2 跟进一下 | **先** `get_follow_up_brief`,并把 brief 念回来 | ✅ **过** | 13:23:26 第一个调用就是它;念回四行,然后才 web 检索 |
| 3 分别存进 Flux 和申请规划 | `propose_blocks`,不是两次 `add_block` | ✅ **过** | 13:24:26 一次 `propose_blocks`,3 条 items 跨两个项目,排进待审面 |
| 4 现在什么情况 | `get_project_overview` 一次 | ✅ **过,但难看** | 13:25:10 单调一次。⚠️ 13:22 那次它先猜 `{project:"申请规划"}` 挨了报错,翻 `ALL_TOOLS` 看 schema 才改成 `thread_id` |
| 5 记一下正确的 | `ref_kind:"corrects"` + `ref_block_id` | ✅ **过** | 13:26:41 四次 `add_block`,**四次全带** `corrects` + `ref_block_id` + `corrected_quote`;第四次因引文不在被更正块里**被正确拒绝** |

### 10.1 第 1 句:两件事同时发生,所以这一格不算数

**(a) 这台机器上没有可申请的东西。** `Fall_2027_…pdf` 早在 08-09 就被批过,
而且 `include_in_pack = 1` —— 按 `mcp.rs` 的 `readable = include_in_pack || ai_access`,
它一直是可读的。**没有 `ai_readable:false` 的文件,就没有 `request_file_access` 的理由。**
⚠️ **要再验这一格,必须先造一个从没批过、`include_in_pack` 也没勾的新附件。**

**(b) 更要紧的:§9.4 甲那段 `AGENTS.md` 这一次没拦住。**
`~/.codex/AGENTS.md` 里的 `spool:begin` 段落**在**(08-11 装的),里面白纸黑字写着
「本地有个同名的文件夹或文档,那不是这个项目」。
**而 13:22:01 模型的第一个动作是 `exec_command`,在 `~/Documents/ChatGPT/申研选校规划/`
里 `rg --files -g '*申请规划*'`** —— 正是 §9.6-2 预言的那个目录、那个同名文档。
Ocean 打断,补了「**spool 的**」三个字,它才在 13:22:12 调 `list_threads`。

⭐ **结论:提示装了、装对了地方、内容也是对的,照样输给了本地同名文件。**
这和 `mcp-tool-routing-required` 是同一个病的下一层:**不是「提示写在模型不会走的路上」,
是「提示写在了模型会走的路上,但那条路上还站着一个更近的答案」。**
§9.4 甲那条**不能算已解决**,§9.6-2 那条「别在那个目录里跑」目前仍是唯一有效的绕路。

### 10.2 顺带验出来的两条,都不在路由上

1. **文件权限的门是两把锁,界面只承认一把。** ✅ 2026-08-19 已修（Ocean 选甲:关掉 AI 勾
   就一律不可读），全稿见 `DESIGN_PROJECT_FILES.md` **§9**,装机验证在 §9.3。
   现场:PDF 现在 `ai_access=0`(用户关的)、`include_in_pack=1`,
   `get_project_overview` 仍报 `ai_readable:true`,`search_blocks` 仍吐正文片段。
2. **「你能读取吗」那一轮,模型一个工具都没调**(13:23:00 → 13:23:22 之间零 `custom_tool_call`)。
   它是照上一轮的记忆答的。⚠️ 这次答案**碰巧是对的**(文件确实还可读),
   所以它看起来没问题 —— **一格没查证却蒙对的答案,比查错更难发现。**
