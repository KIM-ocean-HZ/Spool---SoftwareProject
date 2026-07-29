# 交接文档 — 2026-07-13(给下一个窗口:发布 + 产品下一程)

> 由 2026-07-12/13 会话撰写。先读 CLAUDE.md 与 memory
> (isolated-verify-workflow 必读——GUI 探针与**窗口重叠陷阱**;
> mcp-first-pivot 是方向前提;distribution-route-notarized-dmg 关系到本文件 §2;
> spool-db-wipe-incident 有真库现状)。完成后删除本文件。

---

## 0. 一句话状态

**代码与构建全部就绪,只差"按下发布键"**:v0.3.0 已升版、`Spool_0.3.0_aarch64.dmg`
已产出(Spool Dev 签名,未公证)、/Applications 已换装、全部提交已推送(HEAD=bdb017e)。
Apple 开发者账号 2026-07-13 已解决(**jinhz0531@gmail.com**,RELEASE.md §1 已同步)。
**但发布路径本身有一个必须由 Ocean 拍板的冲突,见 §2——这是下一个窗口的第一件事。**

基线:`npx tsc -b` / `npx vitest run`(152)/ `cd src-tauri && cargo test`(16,
含跨语言 golden、digest 确定性、v8 迁移锁步)全绿。真库 schema **v8**,
`check_library` 实测**「体检通过」**。

---

## 1. 本批次(0.2.3 → 0.3.0)完成了什么

### 1.1 数据卫生(R4 遗留缺口 → R5 判定"已补上")

- **`check_library`**(工具面 9→10,c53fb98):只读库体检。三个机械检测器——
  `spool://` 子串、21 位混合大小写 nanoid 形串(与 add_block 写入警告**同一检测器**)、
  `ref_block_id` 指向已消失的块。报告按**署名家族**分措辞:AI 署名条目给编辑指引,
  用户手写内容**只报告、绝不建议修改**(宪法 5)。零副作用、同日输出逐字节一致。
- **GUI 引用行**(P2-3,06229bc):块卡片尾部安静的 `↩` 行——被引块在场给
  时间+40 字符锚点(复用 pack 的 headAnchor 口径),悬空给 muted 文案。
- **真库治理**(2026-07-13,Ocean 授权执行):备份先行
  (`~/Desktop/spool-snapshot-20260713-pre-hygiene-manual-fix.db`),实修 4 处
  ——**比手工扫描多一处**,是 check_library 自己抓出来的 R4 遗留探针。修复后回「体检通过」。

### 1.2 MCP 上手教育(任务二,0b89933)

- fresh 库播**第二条种子脉络**「让 AI 用上你的 Spool」:六块一块一场景,
  正文=可照抄给 AI 的话,批注=背后调用了什么工具。**只在空库重建路径播种**
  (5/29 红线未动)。它本身就是演示素材——照抄第一句正是让 AI 读它自己。
- 设置 MCP 区「示例用法」折叠段(老用户入口,种子永远够不到存量库)。
- 「复制使用提示」补上 get_digest 与 check_library(原文停在 07-09 的八工具语境)。

### 1.3 前端极简化(任务三,六项六提交)

7.5/10 评审清单逐项落地:权限横幅收成单行+详情展开(4652414)、排序图标化+
删侧栏统计行(9b68300)、日期改 ISO/× 统一/空状态分层(3b3025e)、
头部只留「打包」+ ⋯ 菜单(c3b8669)、设置改**四 tab MCP 第二**(1ca2427)、
块流改**无边框列表式**(358e576,Ocean 实机 A/B 定稿)。

### 1.4 交互摩擦四项(Ocean 2026-07-13 反馈)

- **#4 深色软化**(ebb4ef1):打包钮/选择框从实心琥珀改 accent-soft 底+accent 字。
- **#5 自动沉睡**(4452c04):**手动「搁置」pill 删除**——真实行为是"放着不管"而非
  主动标记。无 deadline 且 14 天无活动 → 自动沉入组尾折叠行「沉睡 N 条」;
  任何新活动(捕捉/编辑/MCP 写入 bump updatedAt)自动浮回,零点击。
  deadline 脉络与捕捉目标永不沉睡。`status='parked'` 留字段但 UI 不再读写(无 schema 变更)。
- **#6 侧栏「最近」区**(334ab1b):VSCode 的 OPEN EDITORS 语法,树保持纯文件树。
  4 条最近活脉络,捕捉目标恒置顶带「捕捉中 ●」**文字**徽标,其余 hover 出「设为捕捉」。
- **#7 捕捉可发现性**:头部恢复「捕捉到此」幽灵钮;树内目标行 pin 图标换文字;
  浮层 no-target 文案同步。

### 1.5 品牌(e864f7c + bdb017e)

Ocean 自制 logo(`docs/logo/`,含解构视频)。**两次修正后的最终状态**:
所有尺寸统一用 `spool-logo-full.svg`(mid/small 版删减了元素,Ocean 要求不用);
图标圆角走程序化 rounded-rect 掩模(rx 225)——qlmanage 栅格化会烙死不透明白底,
不处理则 Dock 图标露白角;**托盘用 full 版内部元素重制**(去方形底与投影/高光珠),
经亮度→alpha 转换成真镂空模板(`tray.rgba`,raw RGBA 直读,不引入 png-decode 依赖)。
**教训**:macOS 模板图标就是它的 alpha 通道,不透明底 = 实心黑方块。

### 1.6 R5 验收(9.8/10)

R2 8.5 → R3 7.7 → R4 9.5 → **R5 9.8**。check_library 五项验收全过,
R4 两条 P2 关闭(读取面存量为零;写入警告经单面探针证实覆盖 content/annotation/source)。
- **P3-1 已修**(79e7fba):多面同脏时警告逐面列出全部命中,不再只报首个。
- **P3-2 不修并记录理由**:连字符属于 nanoid 字母表(真实 id 就带 `-`),
  按它切分会破坏真 id 检测——取舍写死在检测器注释里,与 check_library 共用检测器。
- R5 测试块已按报告编排清理,**悬空三态顺带补验**(get_blocks cited=null /
  pack 占位行 / 体检报 1),删 fixture 后回「体检通过」。

---

## 2. ⚠️ 第一件事:发布路径的硬冲突(需 Ocean 拍板)

Ocean 2026-07-13 指示:「**所有的功能必须建立在可以发布 App Store 的前提下,
希望发布越早越好**」。这两句话与产品现状存在**结构性冲突**,必须先解:

### 2.1 事实:MAS 沙盒与 Spool 的核心功能硬不兼容

2026-07-06 已论证过一次(memory: distribution-route-notarized-dmg),结论未变:

| 功能 | MAS 沙盒下 |
|------|-----------|
| **双击 ⌥ 零摩擦捕捉**(CGEventTap + 输入监听) | ❌ 沙盒应用拿不到输入监听/辅助功能权限 |
| **MCP 服务**(Claude Desktop 启动 `spool --mcp` 子进程读库) | ❌ 外部应用无法启动沙盒应用的二进制;沙盒容器路径互不可见 |
| 透明浮层/收集面板(`macos-private-api`) | ❌ 私有 API 直接拒审 |
| 浏览器标签标题来源识别(osascript) | ❌ Apple Events 临时豁免基本被拒 |
| 附件任意路径读取(`fs:scope **`) | ❌ 需改 security-scoped bookmarks |
| 开机启动(LaunchAgent) | ⚠️ 需改 SMAppService(可做) |

**关键**:被砍掉的头两项,恰好是 Ocean 这次说"最想体现"的东西——
**零摩擦提取文本**与**MCP 长期维护**。上 MAS 等于把产品的两条命根子切掉,
剩下一个"能手打笔记的本地应用"。

### 2.2 三条路,建议第一条

| 路 | 内容 | 时间 | 代价 |
|----|------|------|------|
| **A. 公证直发(强烈建议)** | dmg 已就绪,Ocean export 四个环境变量 → 公证装订 → GitHub Release | **今天就能发** | 用户首次打开需右键→打开(公证后其实不需要);无 App Store 曝光 |
| B. 只上 MAS | 砍掉上表全部 ❌ 项,重做权限模型 | 数周 + 审核轮次 | 产品失去差异化,与 Ocean 的产品方向直接矛盾 |
| C. 双轨 | A 先发;另开分支做 MAS lite 版 | A 立即 / C 长期 | 维护两套;lite 版仍是残废版 |

**我的建议:走 A**。理由:(1)dmg 今天就能公证发布,完全满足"越早越好";
(2)Ocean 最看重的两个能力在 MAS 下不存在;(3)同类工具(Raycast、Rectangle、
Karabiner、Alfred)全部走公证直发,这是这个品类的标准路径,不是妥协。
若 Ocean 仍要 App Store 曝光,建议按 C:先发 A 拿到用户,MAS lite 版当作
"预览版引流",而不是主线。

### 2.3 如果 Ocean 拍板走 A,发布清单(可立即执行)

```bash
# Ocean 自己在终端 export(密码绝不进仓库/提交/聊天)
export APPLE_SIGNING_IDENTITY="Developer ID Application: <名字> (<TEAM_ID>)"
export APPLE_ID="jinhz0531@gmail.com"
export APPLE_PASSWORD="<app 专用密码>"
export APPLE_TEAM_ID="<TEAM_ID>"
```
然后助手执行:`npm run tauri build` → `codesign -dvv` 确认 Authority 是
Developer ID(不是 Spool Dev)→ `spctl -a -vv -t install` 须 accepted ·
Notarized Developer ID → RELEASE.md §3 验收清单逐项过(注意:全新安装现在会种
**两条**教程脉络)→ tag v0.3.0 + GitHub Release + PRIVACY.md 链接 +
**TCC 重授权说明**(签名从 Spool Dev 换成 Developer ID,输入监听会失效一次)。

遗留小事:`docs/PRIVACY.md:45` 的联系邮箱仍是 kimocean0531@gmail.com,
发布前请 Ocean 确认对外用哪个。

---

## 3. Ocean 的产品追问(2026-07-13)与我的分析

> 原话要点:重点体现**零摩擦提取文本**、**对用户信息长期维护**、
> **突出用户自身的思考**;想在 app 内直接调用 MCP 当 API 用但**不花钱**;
> 想把平台做成"类似 VSCode,Claude Code 作为插件维护每个项目";
> **对 app 能否让用户长期使用没信心**。

### 3.1 「app 内直接调用 MCP = 免费 API」——这个前提不成立,但有替代路

**必须澄清的技术事实**:MCP **不是推理协议**,它只是"把工具暴露给模型"的协议。
模型永远在**客户端**(Claude Desktop / Cursor / Claude Code)那一侧。
Spool 现在是 MCP **server**。让 Spool 变成 MCP **client** 并不会凭空得到一个模型
——client 依然需要接一个 LLM,那就回到 API key 或本地模型,即回到已被否决的路
(mcp-first-pivot:普通用户拿不到 key、装不动本地模型)。

**真正免费(订阅已覆盖)的唯一路径**:调用用户**已经安装并付费**的 AI 工具。
现实里只有一个可行入口——**Claude Code CLI 的 headless 模式**
(`claude -p "<prompt>"`,走用户的 Pro/Max 订阅,不需要 API key)。
Spool 可以在检测到 `claude` 存在时,提供"让 AI 帮我整理这条脉络"之类的按钮,
背后 shell out 给它。

代价要说清:
1. 依赖用户装了 Claude Code 且有订阅——**目标用户面比 MCP 窄**;
2. 与"本体零 AI"的叙事有张力(虽然 Spool 自己仍不出网,是委托给用户已信任的工具);
3. **MAS 沙盒下绝对不可能**(不能 spawn 外部二进制)——又一条与 §2 呼应的约束;
4. Claude Desktop **没有**可编程的 headless 入口,别在它身上找路。

**建议**:作为 §3.2 之后的可选增强,不作为主线。主线仍是 MCP server。

### 3.2 「Spool = VSCode,Claude Code = 插件」——方向对,而且已经实现了一半

这个类比其实**正是 mcp-first-pivot 的架构**:Spool 是上下文仓库(编辑器/工作区),
AI 客户端是操作它的智能体(插件)。所以问题不是"要不要转向",而是
**"这个循环还缺什么"**。我看缺三样:

1. **缺"AI 的工作痕迹面"**:现在 AI 写入有来源标签,但没有"这条脉络最近被 AI
   做了什么"的视图。VSCode 的 Source Control 面板之所以有用,是因为它让你看见
   插件干的活。可做:脉络级的「AI 活动」折叠区(纯读,来自 source 标签 + 时间)。
2. **缺"主动维护"的钩子**:现在 AI 只在用户开口时动。真正的"长期维护"需要
   *可复用的指令*——MCP **prompts** 面(现在只有一个 compress_pack)。
   可做:`weekly_review`(拉 digest → 产出一段周回顾)、`thread_health`
   (查重+悬空+摘要过期)、`distill`(把一条脉络提炼成结论块)。用户在 Claude
   Desktop 的斜杠菜单里就能看到它们——这是**零学习成本的功能发现面**。
3. **缺"用户自己的思考"被凸显**:pack 里 `note:` 行和无来源块已经是"最高信号"
   (instructions 里写着),但 **GUI 里没有对应的凸显**。可做:块流的
   「只看我写的」过滤 / 摘要卡片区分"我的批注 vs AI 的结论"。
   ——这一条直接回应 Ocean 的"重点体现用户自身的思考"。

### 3.3 「没信心用户会长期用」——诚实的判断与三个抓手

Spool 的护城河是**捕捉的零摩擦**和**pack 的出处保真**。但留存的真实障碍是:

- **价值滞后**:第一周库是空的,pack 没什么可打。用户在感受到价值前就流失。
- **手势需要学**:双击 ⌥ 一旦没学会,整个产品退化成手打笔记本。
- **MCP 是个悬崖**:非技术用户装不动 Claude Desktop 配置(虽然有一键接入)。

**三个抓手(建议下一程按此排优先级)**:

1. **缩短 time-to-value**:让第一天就有东西可看。例如首启后的"捕捉三条就给你看
   一次 pack"的引导(§2.5 安静原则下用一行提示,不弹窗);
   或让 Spool 自动把当天捕捉的内容拼一张"今天读了什么"的卡片。
2. **把"长期维护"变成看得见的东西**:周回顾 / 月度摘要 —— 这是"用户自身的思考"
   随时间沉淀的**证据**。§3.2 的 MCP prompts 是最省力的实现路径(AI 侧免费)。
3. **不依赖 AI 的独立价值**:MCP 没接也要好用。pack 直接粘给任何网页版 AI
   已经成立,但 GUI 里没有强调这条路。README 与教程都该把"零配置也能用"讲透。

---

## 4. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
2. 绝不添加 LICENSE(Ocean 未定;README 已改为"未定,保留所有权利");新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
4. i18n:中文即键,新 GUI 文案同步补 EN。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步
   mcp.rs;动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**(本窗口一直照此执行)。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。

---

## 5. 完成后

发布落地 → PLAN 尾注(本批次全程 + 发布记录)→ 删除四份设计稿
(DESIGN_DATA_HYGIENE / DESIGN_MCP_ONBOARDING / DESIGN_UI_MINIMAL /
DESIGN_UX_FRICTION,内容并入 PLAN)与本文件 → 把发布后运营待办列给 Ocean:
用户反馈渠道、更新通道决策(RELEASE.md §4)、体检工具的 GUI 入口(方案 C)、
§3 的产品下一程。
