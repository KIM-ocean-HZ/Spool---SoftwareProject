# 交接文档 — 2026-07-09 晚(给下一个会话)

> 由上一会话撰写,章程来自 Ocean 2026-07-09 的八点指示(原文见 §末尾)。完成后删除本文件。
> 先读 CLAUDE.md 与 memory(isolated-verify-workflow 手册必读;mcp-first-pivot 是本批任务的方向依据)。

## 0. 状态快照

- main @ `c01faeb`,基线全绿:`npx tsc -b`、`npx vitest run`(161)、`cd src-tauri && cargo test`(7)。
- `/Applications/Spool.app` = 2026-07-09 §20.13 v2.1 构建,签名 **"Spool Dev"**(本机自签证书,DR 锚定证书,
  重编译不再失效输入监听授权;原理与换机菜谱在 docs/RELEASE.md §5)。
- **真库现在是含真实数据的活库**(2026-05-29 抢救数据已合并:2 工作区 / 10 脉络 / 43+ 块,含 Claude Desktop
  测试写入)。合并前快照:`~/Desktop/spool-snapshot-20260709-1402-pre-merge.db`。动库前先 `VACUUM INTO`。
- MCP 工具面(v2.1):`list_threads`(summary/pinned/approx_pack_chars)、`search_blocks`({total,hits}、
  短拉丁词词边界、`**命中**` 高亮)、`get_pack`(max_chars 默认 50k、空窗口可行动文案)、`get_blocks`(分页)、
  `create_thread`、`add_block`(**source 前缀不变量**:`<client> · MCP — 后缀`)、`compress_pack` prompt、
  resources(spool://thread/<id>)+ 写后 list_changed。
- Claude Desktop 已一键接入(配置指向 /Applications 二进制,路径稳定),第一轮实测报告已逐项处置;
  第二轮任务清单已交给 Ocean(见会话记录),报告回来后按同流程处置。
- 遗留小项:PackDialog `compressionKeepsPersonal` 只护多行用户块首行;`compressAvailable` 复制 router 知识。
  **若任务一剔除内置 AI,这两处随压缩 UI 一并消失,无需单修。**

## 1. 硬规则(同前,违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
   注意:"Claude Desktop" 作为第三方产品名豁免;避免在提交信息里写 "…generated with…" 之类会撞子串的措辞
   (2026-07-09 有一次良性假阳性,已报备 Ocean)。
2. 绝不添加 LICENSE;新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程(memory 手册)。隔离构建会继承 "Spool Dev" 签名,无碍。
4. i18n:中文即键,新文案同步补 EN 词条(src/lib/i18n/index.ts)。
5. 改 `assemble.ts`/`templates.ts` 必须 `GOLDEN_WRITE=1` 重生 golden 并同步 mcp.rs 渲染器到 cargo 全绿。
6. 每任务独立提交,`fix(scope):` / `feat(scope):`,说清 why。

## 2. 任务一(方向级,最大):剔除内置 AI,MCP 成为唯一 AI 通道

Ocean 决策(2026-07-09,已存 memory [[mcp-first-pivot]]):Gemini/Groq key 普通用户难获取,本地 Ollama
更难;**直接剔除,只留 MCP 互通**。这同时是对 set_thread_summary 的裁决:summary 的 AI 生成从内置路径
移交给 MCP 侧。

**先盘点+设计(PLAN 修订稿给 Ocean 过目)再动手。** 影响面初步清单:
- **删**:AiConfig(key 输入/测试)、`src/lib/ai/router.ts` 与三个 provider 客户端、quotaStore + 设置的
  今日用量区、PackDialog §17 压缩按钮与守卫、§9.11 状态摘要自动生成、capture 的 route 分类建议(查
  RouteSuggestion/route prompt 的调用链)、§20.10 图片 OCR、privacyMode(语义随 AI 退场重估)。
- **留**:MCP 全部;附件本地文本提取(非 AI);FTS 搜索;`compressPack.ts` 的提示词文本已移植进 mcp.rs
  (compress_prompt_text),TS 侧可随压缩 UI 删除。
- **换**:`set_thread_summary(thread_id, summary)` MCP 写工具 —— 定位是"图书管理员的目录卡"。设计点:
  是否仅限 MCP 自建脉络起步?被外部 AI 覆盖用户手改 summary 的风险如何缓解(建议:GUI 手改过的
  summary 加脏标记,MCP 不得覆盖;或 summary 记 provenance)?给出取舍再实现。
- **文档**:PLAN §17/§9.11/§20.10 等重写、PRIVACY.md(不再有任何云 AI 出口=隐私叙事更强)、README。
- **验收**:零配置(无任何 key)下产品全功能;`grep -riE 'gemini|groq|ollama' src src-tauri` 仅剩注释/
  历史文档;设置面板无 AI 服务区;vitest/cargo 全绿(router.test.ts 等随删)。

## 3. 任务二:MCP 交互体验(Ocean #2/#3/#4)

1. **`find_similar_blocks`(Ocean 已认可折中)**:只读查重 —— 返回相似块分组与依据,**绝不合并**
   (合并是策展,Principle 5)。相似度从简(FTS/共享 trigram 比例即可),别引依赖。真库里现成测试数据:
   未分类里有 4 条重复 GRE 块。
2. **禁止裸 ID 外露(Ocean #3)**:initialize instructions + 工具描述加硬规则——对用户只用标题指代
   thread/block,`sbC2zgTo…` 类 id 仅作工具参数;评估返回结构里能否附 display 字段降低 id 依赖。
3. **工具预提示(Ocean #3 后半)**:考虑在 GUI 一键接入时顺带提供一段推荐使用提示(用户可粘给 AI 的
   "怎么用 Spool 帮我"简介),或扩充 server instructions。设计方案给 Ocean 挑。
4. **AI 块 GUI 区分度(Ocean #4,cowork 感)**:SourceBadge 对含 " · MCP" 来源的块做安静的视觉区分
   (色点/图标/底色微调,遵守 §2.5:presence 不 pressure);可评估侧栏"外部新写入"小点。先出 1-2 个
   视觉方案截图给 Ocean 选,再全量落地。

## 4. 任务三:新手模版 thread(Ocean #5)

- fresh-DB 首启种子一个"欢迎使用 Spool"内容(工作区或脉络):块本身就是教程 ——
  ⌘C→双击⌥ 捕捉、长按⌥ 收集、置顶/批注/高亮、⌘⇧P 打包、MCP 一键接入(接上后让 AI 读这条脉络,
  天然演示 cowork)。中文为主,目标画像:学生/研究者(Ocean 即原型)。
- 可删、不碍事;**种子逻辑只能走 fresh-DB 创建路径**(5/29 wipe 教训:绝不能在已有库上重跑)。
- 内容写好后先给 Ocean 过目再定稿。

## 5. 任务四:发布进度(Ocean #6)

- RELEASE.md 既定流程(Developer ID 公证直发 .dmg)依赖 Apple 开发者账号;若账号未就绪,推进到
  "账号一到手即可发布":版本号三处同步、验收清单逐项预检、dmg 本地构建通过、PRIVACY.md 链接可用。
- 注意 §1 环境变量覆盖 "Spool Dev" 的行为要在首次正式构建时实际验证(RELEASE.md §5 有说明)。

## 6. 任务五:持续找 bug(Ocean #7)

- `/code-review high` 覆盖 `11b321f..HEAD`(v2 起的全部 MCP/pack 改动);重点:search 词边界与 total
  的 LIKE 扫描上限语义、pack guard 边界、合并后真实数据在 GUI 的表现(长标题溢出、重复块渲染)。
- Claude Desktop 第二轮报告回来后逐项处置(确认→修复→独立提交;拿不准列给 Ocean)。

## 7. 完成后

全绿 → PLAN 修订(剔除内置 AI 是 PLAN 级变更)+ 尾注批次记录 → 删除本文件 → 总结,并把
"下一轮 Claude Desktop 任务清单"更新到与新工具面一致。

## 附:Ocean 2026-07-09 八点指示(压缩转述)

1 剔除 Gemini/Groq/Ollama,只留 MCP(顺带裁决 set_thread_summary 方向);2 认可 find_similar_blocks
只报告不合并;3 MCP AI 禁止对用户输出裸哈希 id,并给 AI 预置使用提示优化体验;4 AI 写入的块在 GUI 更有
区分度(cowork 感);5 新手模版 thread(按目标用户设计内容);6 跟上发布进度;7 继续找 bug;8 新一轮
Claude Desktop 审查清单(已由上一会话直接交付 Ocean,内容与 v2.1 工具面对齐)。
