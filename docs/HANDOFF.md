# 交接文档 — 2026-07-12(给下一个窗口:存量卫生 + 发布)

> 由 2026-07-12 会话撰写。完成后删除本文件。
> 先读 CLAUDE.md 与 memory(isolated-verify-workflow 必读——含 GUI 探针与
> **窗口重叠陷阱**;mcp-first-pivot 是方向前提;spool-db-wipe-incident 有真库现状)。

## 0. 状态快照

- main 已全部推送,本文件所在提交即 HEAD。基线全绿:`npx tsc -b`、
  `npx vitest run`(148)、`cd src-tauri && cargo test`(14,含跨语言 golden、
  digest 确定性/预算、v8 迁移锁步)。
- `/Applications/Spool.app` = 2026-07-12 §20.13 **v2.4 终版** 构建("Spool Dev" 签名)
  = R4 验收二进制 + P2-1 警告面补全,已换装并验证(Ocean 需重启 Claude Desktop 接上)。
- 真库 schema **v8**(13 脉络/56+ 块,R4 归档 3 块在「MCP 实测 R4」)。桌面快照:
  `spool-snapshot-20260710-1300-pre-v6-migration.db` / `…20260711-pre-v7…` /
  `…20260712-pre-v8…`;库旁自动 `spool.pre-migration-v{5,6,7}-*.db`。
  **旧构建按设计打不开新库。**
- MCP 工具面 **9 工具**(v2.4):list_threads(title_contains)/ get_digest /
  search_blocks(全长度 Latin 词边界)/ find_similar_blocks(workspace_title)/
  get_blocks(filters + around + cited 内联)/ get_pack(预算部分渲染 + include_ids
  侧表)/ create_thread / add_block(ref_block_id + 全面裸 id 警告)/
  set_thread_summary。instructions 1.9k 字符,硬规则开头。
- 验收史:R2 8.5 → R3 7.7(8 bug 全修)→ **R4 9.5/10,12/12 通过**。
  剩余 P2 处置:P2-1 代码面已修(警告覆盖 source/title/summary);
  P2-1 存量治理 + P2-3 GUI 悬空引用可视化 → 本文件任务一;P2-2 整块粒度 = 已披露的设计取舍,不动。
- PLAN v2.12 + §20.13 v2.4 是权威记录。版本号仍 0.2.3(发布时升 0.3.0)。

## 1. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
   措辞注意:避免 "generated with" 撞串;“Claude Desktop”/「Claude · MCP」来源标签
   属产品内容豁免(07-09/10/12 各误报一次,均已报备)。
2. 绝不添加 LICENSE(是否改 README "MIT (planned)" 由 Ocean 定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程(memory 手册);**每次合成输入前
   重新定位 verify 窗口边界**(正式版窗口可能与其重叠,详见 memory 第 10 条)。
4. i18n:中文即键,新 GUI 文案同步补 EN 词条(src/lib/i18n/index.ts)。
5. 改 `assemble.ts`/`templates.ts` 必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs
   渲染器到 cargo 全绿;动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交,`fix(scope):` / `feat(scope):`,说清 why。
7. 写入类破坏性操作(清数据、迁移、换装)前把证据链核对一遍再动手。

## 任务一:存量数据卫生 —— 设计稿先行(批复后实现)

R4 报告的收官缺口:“工具面已达标,差的最后一截在数据卫生”。老库里仍有三类脏数据
会从 digest/pack 读取面漏出内部管线:

1. 旧 MCP 块 `source` 里的 `依据 spool://thread/<id>` 类 URI 后缀(AI 写的,可治理);
2. 历史 annotation/content 里的裸 21 位 id(**须区分**:AI 写的块可治理;
   用户写的块绝不改动,最多报告——宪法 5);
3. 悬空引用(ref_block_id 指向已删块):pack 已显式降级,GUI 无可视化(P2-3)。

设计稿要求(照 v2.4 的流程:取舍+接口+合宪性论证,交 Ocean 挑):
- 形态三选一或组合:一次性 v8→v9 数据迁移(参照 BUG-2 先例,仅动 AI authored 字段)/
  只读「库体检」MCP 工具(报告不动手,把处置留给用户)/ GUI 设置里的体检入口。
- 合宪性红线:用户手写内容一个字节都不改;任何清理只针对可证明是 MCP/AI 写入的字段;
  报告型输出遵守命名规则(给预览不给裸 id)。
- 顺带评估:GUI 块流是否要给 ref_block_id 一个最小可视化(引用角标即可,§2.5 安静原则)。

## 任务二:MCP 上手教育(内容为主,先出方案)

Ocean 2026-07-12 指示:软件初始要让用户知道**通过 MCP 能让 AI 做什么**,而不是
用户自己去 AI 端摸索提问。现状:教程脉络(fresh 库六块)只有末块一句带过 MCP;
设置里有「复制使用提示」但那是给 AI 读的,不是给用户看的。

方向(出方案给 Ocean 挑,再动手):
1. 教程脉络扩充/重写:一块一个场景,给**用户可直接照抄的说法**——
   "帮我复习〈XX〉""我最近一周在忙什么""把这段结论存进 Spool""帮我查重"……
   每块正文=对 AI 说的话 + 一行说明背后调用了什么(digest/pack/引用等)。
2. 老用户也要看得到:教程只在 fresh 库播种(5/29 红线,不许改),所以需要一个
   不依赖播种的入口——候选:设置 MCP 区块加「示例用法」折叠段 / 帮助菜单 /
   README 章节。至少选一个。
3. 注意 i18n(中文即键,补 EN)与 §2.5 安静原则(不要弹窗式引导)。

## 任务三:前端极简化(按下方评审清单,先方案/对比稿再动手)

Ocean 方向:极简主义 + 交互清晰。上一窗口(2026-07-12)基于实机截图 + 代码的
评审结论 **7.5/10**——底子是对的(paper/ink/muted/line/accent 单强调色令牌系统、
衬线标题、块卡片信息层级、安静的 Bot/置顶徽章),失分在常驻噪音与信息架构:

1. **权限横幅太重**(最高优):两行常驻置顶,首屏第一眼是警告不是内容。
   已授权应彻底消失;未授权折叠为单行/角标,点开再看恢复指引。
2. **设置对话框信息架构**:长滚动单页;浏览器自动化五行(Safari/Chrome/Edge/
   Brave/Arc)占大量空间但极低频;MCP 是产品核心却埋在中部。建议分组折叠或
   tab(通用/快捷键/MCP/高级),MCP 前置。
3. **ThreadHeader 密度**:状态 pill+日期+字数+摘要+三按钮同排;建议打包保持唯一
   显性动作,完成/捕捉目标收进 overflow 或 hover,状态与日期降为次级行。
4. **低频控件常驻**:块流右上「排序 按时间/按来源」收进图标;侧栏顶部
   "N 进行中 · N 本周到期 · N 搁置" 统计行信息价值低,可去或 hover 显示。
5. **块卡片三重容器感**(底色+边框+圆角):可试无边框列表式,留白+细分隔线,
   hover 才浮现操作行——更接近编辑部气质。
6. **小一致性**:日期 pill "07/10/2026" 美式格式 vs pack 的 ISO 格式;两处 ×
   关闭钮样式不一;空状态文案偏长可分层。
   
红线:不动信息模型与交互语义(撤销、IME、置顶/批注语义),纯呈现层;每步
隔离构建截图对比给 Ocean;i18n 同步。

## 任务四:应用图标重设计

现图标是 AI 生成占位(src-tauri/icons/)。流程:先和 Ocean 对方向(抽象线轴
"Spool"?字标?纸感底色延续 app 内视觉?),出 2–3 个 1024px 方案给 Ocean 挑
→ 定稿后 `npx tauri icon <1024.png>` 生成全套 → 隔离构建看 Dock/托盘实效
(托盘是 template icon,需单独确认黑白可读性)→ README 截图顺带更新。

## 任务五(Ocean 定夺):R5 复测

9.5/10 是否收官由 Ocean 决定。若跑 R5:用 R4 报告余项 + 任务一落地内容定制提示词
(参照 git 历史里 R3/R4 提示词的写法;R4 报告全文在 2026-07-12 会话记录,
关键余项已録入上方任务一)。

## 任务六:正式发布(账户一到,全流程负责)

Ocean 提供 Apple Developer 账户信息后,按 docs/RELEASE.md 全流程:

1. **凭据**:Ocean 在终端自己 export 四个环境变量(RELEASE.md §1),
   **绝不把 app 专用密码写进仓库/提交/聊天**。
2. 证书:开发者后台创建 Developer ID Application 证书导入钥匙串,
   `security find-identity -v -p codesigning` 验证。
3. 版本号三处同升(建议 **0.3.0**——本批含 schema v8 + MCP 工具面 v2.4)。
4. `npm run tauri build` → `codesign -dvv` Authority 须为 Developer ID
   (环境变量应覆盖 "Spool Dev";未覆盖则临时改 signingIdentity);
   `spctl -a -vv -t install` 须 accepted · Notarized Developer ID。
5. 验收清单(RELEASE.md §3)逐项过:全新环境 .dmg 首启建库+教程脉络、双击 ⌥ 授权流
   (**签名变更 → TCC 授权失效一次,发布说明里要写**)、零出网抓包、
   旧库升级(桌面 v5–v8 快照全套可当素材)、IME 回归、README 截图重截。
6. GitHub Release:tag v0.3.0 + 变更摘要 + PRIVACY.md 链接 + TCC 重授权说明 + .dmg。
   LICENSE 按 Ocean 决定处理(不加 = 默认保留所有权利,照常发布不受影响;
   加 MIT = 一个标准文本文件,批复后一分钟的事);README "MIT (planned)"
   文案届时同步改掉,别让它自相矛盾。
7. 换装后提醒 Ocean 重启 Claude Desktop(配置路径不变)。

## 完成后

全绿 → PLAN 尾注(发布记录,v2.12 已含 v2.4 全程)→ 删除本文件 → 总结,
并把发布后运营待办列给 Ocean:用户反馈渠道、更新通道决策(RELEASE.md §4)、
存量体检工具的后续迭代。
