# 交接文档 — 2026-07-13(给下一个窗口:R5 收官 + 发布)

> 由 2026-07-12/13 会话更新。完成后删除本文件。
> 先读 CLAUDE.md 与 memory(isolated-verify-workflow 必读——含 GUI 探针与
> **窗口重叠陷阱**,本窗口再次实测中招一次;mcp-first-pivot 是方向前提;
> spool-db-wipe-incident 有真库现状)。

## 0. 状态快照(2026-07-13 凌晨)

- 基线全绿:`npx tsc -b`、`npx vitest run`(148)、`cd src-tauri && cargo test`
  (16,新增 check_library ×2)。本窗口 12 个提交待推送/已推送,见 git log。
- **任务一(数据卫生)完成**:`check_library` 只读体检工具(工具面 9→10,
  c53fb98)+ GUI 块流 ↩ 引用行(P2-3,06229bc)。真库只读实测:脏数据仅 3 行、
  全 AI 署名、全在实测脉络;悬空引用 0;**Ocean 手改 3 行后重跑体检应「通过」**
  (明细见本文件 §2)。设计稿 docs/DESIGN_DATA_HYGIENE.md(批复形态 B)。
- **任务二(MCP 上手)完成**(0b89933):第二条种子脉络「让 AI 用上你的 Spool」
  (仅 fresh 库,5/29 红线未动)+ 设置 MCP 区「示例用法」折叠段 + 使用提示刷新
  (补 get_digest/check_library)。README 章节(B3)发布时顺带。
- **任务三(前端极简)完成**,六项六提交:横幅单行+详情(4652414)、排序图标化+
  删统计行(9b68300)、日期 ISO/×统一/空状态分层(3b3025e)、头部仅留打包+⋯菜单
  (c3b8669,捕捉浮层 no-target 文案同步改)、设置四 tab MCP 第二(1ca2427)、
  块流无边框列表式(B 版,Ocean 实机 A/B 定稿,358e576)。
- **任务四(图标)搁置**(Ocean 2026-07-13 指示):方向=线描拟物、单色琥珀、
  无黑、寥寥几笔;三版草稿在 `icon-drafts/`(git-exclude,含 SVG 源)。
  程序化 SVG 工具已到上限,重启此任务建议换设计工具/设计师。
- **/Applications/Spool.app 仍是 07-12 v2.4 构建**——本窗口的换装被安全拦截
  (删现装需 Ocean 明示)。新构建已就绪:`src-tauri/target/release/bundle/macos/
  Spool.app`(identifier=com.oceanjin.spool,Authority=Spool Dev,含本窗口全部
  改动,无 schema 变更,打开真库零迁移)。换装步骤见 §3。
- README 许可文案已改(5c4ccda):不再预告 MIT。LICENSE 仍不加(Ocean 定)。
- 版本号仍 0.2.3(发布时升 0.3.0)。真库 schema v8 未动。

## 1. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
2. 绝不添加 LICENSE;新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
4. i18n:中文即键,新 GUI 文案同步补 EN 词条。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步
   mcp.rs;动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;设计类任务先出方案交 Ocean 批复再动手。
7. 写入类破坏性操作(清数据、迁移、换装)前核对证据链,换装需 Ocean 明示。

## 2. 真库数据卫生 —— 已收官(2026-07-13,Ocean 授权执行)

Ocean 授权后由会话直接修复:备份 `~/Desktop/spool-snapshot-20260713-pre-hygiene-
manual-fix.db` 先行;实修 **4 处**(check_library 抓到了手工扫描漏掉的第 4 处
——R4 埋在 source 里的裸 id 探针,工具价值实证):0709 块的 source 尾巴与批注
裸 id、R3 测试块正文伪 id 与 R4 探针 source 均改为「(已清除)」措辞。修复后
check_library 实测返回**「体检通过」**。

## 3. 换装 —— 已完成(2026-07-13,Ocean 授权)

/Applications/Spool.app 已是本窗口终版构建(含数据卫生、上手教育、极简化与
交互摩擦四项;Spool Dev 签名,TCC 不受影响)。**Ocean 需重启 Claude Desktop**
接上新 MCP 二进制(路径不变)。真库开机验证 v8 / 59 块 / 15 脉络无恙。

## 3b. 交互摩擦四项(Ocean 2026-07-13 反馈,已全部落地)

#4 打包钮/选择框软琥珀(ebb4ef1);#5 自动沉睡取代手动搁置(4452c04,14 天
无活动沉入组尾折叠行,deadline/捕捉目标/新活动免疫,status='parked' 留字段不再
读写);#6 侧栏「最近」区(334ab1b,OPEN EDITORS 语法,目标行「捕捉中 ●」文字
徽标 + hover「设为捕捉」);#7 头部「捕捉到此」幽灵钮恢复可发现性,浮层 no-target
文案同步。设计稿 docs/DESIGN_UX_FRICTION.md 待并入 PLAN 后删除。

## 4. R5 复测(Ocean 重启 Claude Desktop 后执行附录提示词)

- 报告回来逐项处置:确认→修复→独立提交;循环到 Ocean 满意收官。
- GUI 面(引用行三态、设置 tabs、块流 B 版)已实机截图验证,不在 MCP 提示词内;
  Ocean 换装后顺手目验一眼即可。

## 5. 任务六:正式发布(账户一到,全流程负责)

与上版一致:Ocean 终端自己 export 凭据(RELEASE.md §1)→ Developer ID 证书 →
版本号三处升 0.3.0 → `npm run tauri build` + codesign/spctl 验证 → RELEASE.md §3
验收清单(全新 .dmg 首启会种**两条**教程脉络——任务二后的新预期;TCC 重授权说明)
→ GitHub Release + README「和 AI 一起用」章节(任务二 B3)与截图重截(UI 已改版)。

## 6. 完成后

全绿 → PLAN 尾注(本批次:数据卫生/上手教育/极简化 + 发布记录)→ 删除三份
设计稿(DESIGN_DATA_HYGIENE / DESIGN_MCP_ONBOARDING / DESIGN_UI_MINIMAL,
其内容并入 PLAN)与本文件 → 总结,并列发布后运营待办:用户反馈渠道、更新通道
决策(RELEASE.md §4)、体检工具 GUI 入口(方案 C)、图标任务重启。

## 附录:R5 复测提示词(交 Ocean 粘贴进 Claude Desktop)

```
# Spool MCP 复测 R5(数据卫生收官 + check_library 验收;10 分制严格评分)

你是 Spool 的验收测试员,MCP 已接入(工具面 v2.4+ 十工具,schema v8)。
R4 报告 9.5/10,遗留「数据卫生」缺口本轮验收。写入只允许进「MCP 实测 R4」
或你新建的「MCP 实测 R5」;对其他脉络只读(测试拒绝路径除外——被正确拒绝
即通过,须零副作用)。

## 一、check_library 新工具验收(逐项给 通过/不通过)
1. tools/list 应含 check_library(第 10 个工具),描述申明只读、处置留给用户
2. 直接调用:输出应为三节报告(Source 标签卫生 / 正文·批注裸 id / 引用完整性)
   + 头部计数 + 规则自述;同一天重复调用输出逐字节一致(确定性)
3. 库若已手改干净:结语应为「体检通过」;若仍有发现:每条应以脉络标题+时间+
   预览定位,违规片段用「」全文引用,且**绝不建议修改用户手写内容**
   (source 为空的块只可「仅供知悉」)
4. 零副作用:调用前后 list_threads/get_blocks 任意抽查,库内容无任何变化
5. 命名规则:报告除违规片段本身外,不得出现裸 id 作指称

## 二、R4 遗留定点复核
1. P2-1 存量:digest/pack/get_blocks 任一读取面,不应再看到
   `依据 spool://thread/<id>` 尾巴或裸 21 位 id(除非 Ocean 保留了 R3 测试块
   ——那一条 check_library 应如实报告)
2. P2-3 悬空引用:add_block(ref_block_id=不存在的id) 应被拒绝且报错指路;
   get_blocks 里悬空引用的 cited 为显式 null;pack 里为
   "(cited block no longer exists)"(GUI 引用行由 Ocean 目验,不在本轮)
3. 写入警告面回归:add_block/create_thread/set_thread_summary 的自由文本里
   放一个 21 位混合大小写串,应照常写入 + 返回 warning(advisory 不拒绝);
   测试完删除该块,并重跑 check_library 确认它先被报出、删后回「通过」

## 三、快速回归(抽查,防今日改动破坏既有面)
1. get_digest 同参数当日两次输出一致;窗口语义正常
2. search_blocks 词边界(英文整词/中文子串)正常
3. get_pack(include_ids=true) 侧表仍在;instructions 完整渲染无截断

## 四、产出
- 每项 通过/不通过 + 证据;问题按 P0/P1/P2 列清单
- 10 分制总分 + 扣分明细;回答:数据卫生这最后一截是否补上了?
  距离"冷启动普通用户可用"还差什么?
```
