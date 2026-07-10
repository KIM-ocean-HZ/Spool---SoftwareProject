# 交接文档 — 2026-07-10(给下一个会话:终检与发布)

> 由 2026-07-10 会话撰写,章程来自 Ocean 当日指示。完成后删除本文件。
> 先读 CLAUDE.md 与 memory(isolated-verify-workflow 必读;mcp-first-pivot 是方向前提;
> spool-db-wipe-incident 有真库现状)。

## 0. 状态快照

- main @ `ed2ab91`,已全部推送。基线全绿:`npx tsc -b`、`npx vitest run`(144)、
  `cd src-tauri && cargo test`(10,含跨语言 schema 锁步测试)。
- `/Applications/Spool.app` = 2026-07-10 §20.13 **v2.3** 构建("Spool Dev" 签名)。
  真库 schema v6(11 脉络/45 块),当日双备份:桌面 `spool-snapshot-20260710-1300-pre-v6-migration.db`
  + 库旁自动 `spool.pre-migration-v5-*.db`。**旧构建(SCHEMA_VERSION 5)按设计打不开此库。**
- MCP 工具面 v2.3(8 工具):list_threads / search_blocks / find_similar_blocks(带
  length/pinned/has_annotation/source/scan_cap)/ get_blocks(around_block_id+context 定位)/
  get_pack(max_chars 守卫)/ create_thread / add_block(source 前缀不变量)/
  set_thread_summary(summary_source provenance 守卫)。instructions 已是"冷启动手册"
  (工作流+四分类摘引+写入礼仪+禁裸 ID 及禁止把 id 写进块内容)。
- R2 报告(8.5/10)全部实质项已处置;B1 单行修复已由 Ocean 批准执行完毕
  (0709 行 provenance=mcp)。PLAN v2.11 + §20.13 v2.3 是权威记录。
- 版本号三处同步 0.2.3;dmg 本地构建通过;PRIVACY/RELEASE/README 均已对齐零云出口。

## 1. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
   **注意措辞**:提交信息里不要写 "regenerated with …" 这类撞 "generated with" 子串的短语
   (07-09、07-10 各误报过一次,均已报备;用 "via" 等替代)。"Claude Desktop" 作为
   第三方产品名豁免。
2. 绝不添加 LICENSE(README 里 "MIT (planned)" 是旧文案,是否修改由 Ocean 定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程(memory 手册);隔离构建继承 "Spool Dev" 签名。
4. i18n:中文即键,新文案同步补 EN 词条(src/lib/i18n/index.ts)。
5. 改 `assemble.ts`/`templates.ts` 必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs 渲染器到 cargo 全绿。
6. 每任务独立提交,`fix(scope):` / `feat(scope):`,说清 why。

## 2. 任务一:交互逻辑补全(设计稿先给 Ocean 过目,批复后实现)

R2 遗留六项 + Ocean "彻底解决所有交互逻辑" 的指示。先出**一份合并设计稿**(取舍+接口+
合宪性论证)给 Ocean 挑,再动手:

1. **D3 `get_digest(workspace?, since?)` 跨脉络简报** —— R2 头号诉求、10 分的分水岭。
   确定性拼装(时间序/来源标注/pinned 优先/每脉络配额),AI 绝不在服务端取舍(宪法 4/5)。
   设计点:配额与排序规则、与 get_pack 的边界、超预算行为。
2. **D2 `add_block.ref_block_id` 块级引用** —— 列已存在;pack 渲染 "↩ 依据:〈块预览〉";
   append-only、写入方声明。涉及 pack 格式 → golden + 双渲染器。
3. **C2 get_pack 预算式返回** —— 超限时"前 N 块完整渲染 + 溢出说明"替代纯统计。
   设计点:按哪个顺序装(建议:骨架+Key Points 完整,Full Record 从最新往回装到预算)。
4. **C5 get_blocks 过滤**(pinned / 有批注 / 按来源)—— 小,顺手。
5. **D1 机制项**:返回字段 `_ref` 改名(破坏性,慎;可只在新字段上用)+ add_block 对
   content/annotation 中疑似 21 位 nanoid 的写入警告(非拒绝,只警告,附匹配串)。
6. **上轮缓办的两个效率项**:list_threads `approx_pack_chars` 改 GROUP BY 预聚合
   (本轮做掉,"彻底"要求;注意等价性:soft-delete 过滤、附件 8k cap);
   search 短查询 snippet 复算(顺手则做)。

## 3. 任务二:全面 bug 清剿(R3 前完成)

- `/code-review high` 覆盖 `ed2ab91..HEAD`(任务一落地后);上一轮 review 的方法沿用。
- **GUI 实机验证**(隔离构建 + 截图给 Ocean):MCP 块 Bot 徽章(真库里有现成 MCP 块)、
  设置「复制使用提示」按钮、fresh 库首启教程脉络(六块、置顶、批注、可删且清数据不复活)、
  ThreadHeader 摘要手动编辑后 summary_source='user' 生效(MCP 覆盖被拒)。
- 边界自测:空脉络/仅 ref 块脉络的每个工具行为;max_chars == 全文长度;写开关关闭时
  三个写工具的报错;GUI 运行中 MCP 并发读写(WAL busy_timeout 2s 是否够)。
- vitest/cargo 对新工具面的覆盖补齐(get_digest/ref_block_id 等新增必须带测试)。

## 4. 任务三:R3 终检(Ocean 在 Claude Desktop 执行)

- 提示词见附录(已同步交给 Ocean)。任务一二完成、/Applications 换装后请 Ocean 执行。
- 报告回来逐项处置:确认→修复→独立提交;修完再请 Ocean 复测,**循环到 10/10**。
- 修复若动 pack 格式,记得 golden;若动 schema,记得迁移注册表 + 锁步常量 + 真库备份。

## 5. 任务四:正式发布(账户一到,全流程由本会话负责)

Ocean 会提供 Apple Developer 账户信息。到手后按 docs/RELEASE.md 全流程执行,要点:

1. **凭据处理**:让 Ocean 在终端自己 export 四个环境变量(RELEASE.md §1),或写进
   本机不入库的文件;**绝不把 app 专用密码写进任何仓库文件/提交/聊天记录**。
2. 证书:指导 Ocean 在开发者后台创建 Developer ID Application 证书并导入钥匙串,
   `security find-identity -v -p codesigning` 验证。
3. 版本号:三处同升(建议 **0.3.0**——本批含 schema v6 + MCP-first 重构)。
4. `npm run tauri build` → 验证 `codesign -dvv` Authority 确为 Developer ID
   (RELEASE.md §5:环境变量应覆盖 "Spool Dev";未覆盖则临时改 signingIdentity);
   `spctl -a -vv -t install` 须 accepted · Notarized Developer ID。
5. 验收清单(RELEASE.md §3)逐项过:全新环境装 .dmg 首启建库+教程脉络、双击 ⌥ 授权流
   (**签名变更 → 现有 TCC 授权失效一次,首启需重新授权**——发布说明里要写)、
   零出网抓包、旧库升级(v5 快照可用作素材)、IME 回归、README 截图重截。
6. GitHub Release:tag(如 v0.3.0)+ Release 页(变更摘要、系统要求、PRIVACY.md 链接、
   TCC 重授权说明)+ 上传 .dmg。LICENSE 仍由 Ocean 决定,没批复前不加。
7. Claude Desktop 配置指向 /Applications 二进制,路径不变,发布构建换装后提醒 Ocean
   重启客户端。

## 6. 完成后

全绿 → PLAN 修订(v2.12:D 面工具 + R3 记录 + 发布记录)+ 尾注批次 → 删除本文件 →
总结,并把发布后的运营待办(用户反馈渠道、更新通道决策 §4)列给 Ocean。

## 附录:R3 终检提示词(交 Ocean 粘贴进 Claude Desktop)

```
# Spool MCP 终检 R3(近最终验收;10 分制严格评分)

你是 Spool 的验收测试员,MCP 已接入。这是发布前终检:请穷尽地测、苛刻地评。
写入只允许进「MCP 实测 R2」或你新建的「MCP 实测 R3」;对其他脉络只读
(测试拒绝路径除外——被正确拒绝即通过,须零副作用)。

## 一、回归(R1+R2 全部修复项,逐项给 通过/不通过)
1. get_pack 超限:默认 cap 下返回统计+可行动建议;max_chars=0 仍可全文
2. 置顶块占位行:带首行锚点(如「📌 [时间] 第十一课…」),全文不再重复
3. search:短 Latin 词词边界、**命中**高亮、批注命中带 note: 前缀、{total,hits}
4. add_block 传 source:落库为「Claude · MCP — 你的值」,前缀不可覆盖
5. set_thread_summary:刷新「MCP 实测 · 0709」的摘要应【成功】(遗留标记已修);
   对用户手写摘要的脉络覆盖应【被拒】,且错误信息让你把建议转述给用户
6. get_blocks(around_block_id, context):从 search 命中一步定位读前后文,
   验证 anchor_position;跨脉络 block_id 应报错而非静默翻页
7. find_similar_blocks:未分类里的 GRE 重复组应带 length/pinned/has_annotation/
   source/scan_cap;确认它只报告、绝不合并
8. 你写入的块在 GUI 的来源应显示「Claude · MCP」而非机器 slug

## 二、冷启动行为(重要:先在【无本段提示】的新对话里做一遍再对照)
9. 只靠服务端 instructions,你是否自然做到:对用户全程用标题指代、不把内部 id
   写进块内容或批注、按四分类权威读 pack、写入礼仪(一发现一块、annotation 写
   关联理由、不按对话乱开脉络)?明确指出 instructions 还缺什么。

## 三、交互逻辑穷举(本轮重点)
10. 端到端工作流:「帮我复习〈某课程〉」——检索→定位读上下文→归档结论→刷新
    摘要,全程聊天内完成;记录每一步的摩擦与你想要但没有的能力
11. 跨脉络视野:「我最近一周在忙什么」「把三门课的置顶都给我」——若 get_digest
    已上线,重点测确定性(同参数同输出)、来源标注、配额语义、超预算行为;
    若未上线,记录你绕路的完整成本
12. 边界:空脉络/仅 ref 块脉络上跑每个读工具;max_chars 恰等于全文长度;
    find_similar 对大小写/空白差异的判定;关闭「允许 AI 写入」后逐个写工具
    的报错质量;GUI 正开着时读写是否受干扰
13. 错误信息质量:制造每类失败(错 id、空参数、越权写),报错是否足以让你
    自主纠正而无需问用户

## 四、产出
- Bug 清单:编号、复现步骤、期望 vs 实际、严重度(P0/P1/P2)
- 摩擦与缺失:逐条注明合宪性判断(只读?确定性?append-only?attributed?)
- 10 分制总分 + 扣分明细;并回答:一个没有任何项目指令的普通用户,冷启动
  能否把 Spool 用对?差距在哪?
```
