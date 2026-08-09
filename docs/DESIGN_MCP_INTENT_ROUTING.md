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
| 6 | **F**(schema v20 三列 + 两侧渲染器 + golden 重生) | ⚠️ `TZ=Europe/London GOLDEN_WRITE=1`;schema 三处一起动(`client.ts` / `mcp.rs` / `client.test.ts`,含链式 `downgradeToV19`) |
| 7 | ⭐ **真跑 §7.1 的三句话**,不看模型说什么,看 `mcp_tool_call` 事件 | 见下 |

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

## 8. ✅ 落地记录(2026-08-09 晚)—— A / B / C / D / E 五件

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

### 8.3 F(schema v20)还欠着什么

⚠️ **别在 F 里顺手改别的** —— A–E 的判据是「golden 一次没重生」,F 一进来就毁掉这条判据,
出问题时分不清是谁弄的(§4.6 末尾已经写过,这里再钉一次)。F 落地时要连带补上:

- `get_project_overview` 的 `needs_attention.due_for_recheck`(§4.6 兑现口 1,代码里留了注释);
- pack 里过期那条的块头标注(兑现口 2);
- `source` 描述改成「短标签」,URL 从此进 `source_url`。
