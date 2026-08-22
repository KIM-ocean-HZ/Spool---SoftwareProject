# HANDOFF-CODEX — 给下一窗 Codex 的接续说明

> ⛔⛔ **2026-08-15 状态更正：本文件的 git 状态段已经过期，不要照它开工。**
> 当前开工面是 **`docs/BACKLOG-2026-08-19.md`**（商业化四件）；工程欠账在
> `docs/HANDOFF-2026-08-19.md` §1。（这行原先指向 `BACKLOG-2026-08-15.md`，那份现在也是档案。）
>
> 本文件下面反复写着「未提交、未推送、未部署，等 Ocean 分别授权」。**这三句现在都不成立。**
> 文档最后改动是 08-13 **16:10–16:14**，Ocean 在 **16:19:13** 就授权并提交了 `42f2c79`。
> 写的时候是对的，之后 5 分钟就被现实盖过去了。
>
> | | 本文件说的 | 2026-08-15 实测 |
> |---|---|---|
> | `HEAD` | `242e751`，工作区保留成果 | **`42f2c79` = `origin/main`**，零未推 |
> | 提交 | 没有 | **两个**：`242e751`、`42f2c79` |
> | 部署 | 没有 | **两次 Pages 部署都成功，spoolapp.org 已上线** |
> | GitHub description | 未修改 | 见 `BACKLOG-2026-08-15.md` §2 |
>
> 下面 `§0-close` 的**交付内容与验证数字仍然有效**（2026-08-15 已独立复现：Vitest 361、
> Rust 72、中文 9/9、生成器零漂移、视觉回归 15/15）。**只有 git / 发布状态那几句作废。**

## 0-close. 本轮任务已完成（交付内容有效；git 状态见上方更正）

`§0-next` 现已执行完毕；不要再把它当开工清单。本轮成果**已全部提交并推送上线**
（`242e751` + `42f2c79`），暂存区为空。

### 0-close.1 交付结果

- **README / release 截图**：在 `com.oceanjin.spool.verify` 隔离演示库内重建并逐张复核七个
  真实场景：捕捉、当前项目、项目管理、Pack、digest、MCP 读取、带署名/引用的 MCP 写回。
  `docs/RELEASE.md §3` 截图项已关闭；release tag 快照与当前 v21/18-tool 工作区状态已拆开写，
  不再混用历史数字。
- **Case study / Story**：`site/story.html` 对齐八节，完整画出 GUI/捕捉、Rust/Tauri、单一
  SQLite、`spool --mcp` stdio、外部 MCP client、Claude/Codex/Gemini CLI 子进程和两条真实
  出网路径，并明确 Spool 无 HTTP。接入捕捉 → 项目脉络 → AI 有署名写回三张真实证据图；
  公证信息使用语义 HTML 卡而非伪终端；视频占位已换成互动 Demo 链接。台账按只增不改原则
  追加 `CASE_STUDY_LEDGER.md §7`。
- **可选 QA**：新增 CDP 驱动的全页视觉回归与 Pillow 比较器。五路由 × 390/768/1440 的
  **15 / 15** 最终通过，零像素超过阈值；390px 使用真实 CSS viewport，不受 Chrome 500px
  最小窗口裁切。Lighthouse 13.4.1 本地移动默认分数：英文首页
  `66/100/100/100`、中文首页 `65/100/100/100`、Story `66/100/100/100`（Performance /
  Accessibility / Best Practices / SEO；不是生产分数）。键盘 skip link、焦点顺序、横滚区、
  alt/figure、无页面横溢和实际 Chrome 200% page zoom 均通过。VoiceOver 未跑，因此明确不是
  完整正式审计。详情：`docs/QA_SITE_2026-08-13.md`。
- **三项调查**：只新增报告，未接入 provider、未实现 scheduler、未改 app 代码：
  `archive/INVESTIGATION_WINDOWS_PORT_2026-08-13.md`、
  `archive/INVESTIGATION_FREE_AI_ENGINES_2026-08-13.md`、
  `archive/INVESTIGATION_M4_SCHEDULED_FOLLOW_UP_2026-08-13.md`。

### 0-close.2 关键调查结论

- Windows 不是只缺一个双击 Option：报告记录两个编译阻断及随机数、MCP 路径、环境、进程树
  取消、前台/焦点、打包签名等平台阻断；在原生 Windows MSVC/标准用户 VM 证据齐全前不启用。
- 截至 2026-08-13，没有“官方稳定承诺免费且已证明能可靠跑完全部 Spool 动作”的托管引擎；
  报告将仓库事实、外部事实、推论和建议分开，未安装或接入候选。
- M4 的 M3 价值门和“已有往外拿动作”门均未通过，且后者定义仍冲突；报告另记录 fail-open、
  提案归属、同 URL 更新、数量约束和 `updated_at` 等先决问题。因此不实现调度器/schema/UI。

### 0-close.3 最终验证与边界

- `scripts/build-site-shots.sh`、中文生成器和生成文件确定性复验通过；54 个派生文件逐字节一致。
- 中文专项 **9 / 9**；i18n `(none missing)`；Vitest **32 文件 / 361 / 361**；TypeScript
  clean；Rust **72 / 72**（只有既存 `updated_at` warning）；`git diff --check` clean。
- `src/**` 与 `src-tauri/**` 无 diff；三项调查阶段没有产品代码改动。`docs/HANDOFF.md` 保持
  本窗口只读，它的现有 `§0-accept` diff 是接手时已有内容。
- 正式库未被应用打开、未被编辑；安全核对只做只读完整性/进程句柄检查，最终两个 verify
  `spool` 进程对正式 `spool.db` 的句柄数均为 0。隔离 verify 库保留 3 workspaces / 8 projects /
  23 blocks，并只在 verify 库中把 Portfolio site 标为完成、追加一条 portfolio 结论以供真实
  截图/MCP 证据使用。
- 未覆盖项按任务边界保留：VoiceOver、Firefox/Safari/跨浏览器、物理 Windows 矩阵、生产域名
  Lighthouse/SEO、`/zh/story.html`、线上发布。

### 0-close.4 ~~仍需 Ocean 分别授权~~ —— **已全部授权并执行（2026-08-15 更正）**

1. ~~审阅工作区成果~~ → 已审阅；
2. ~~commit~~ → **已提交**（`242e751`、`42f2c79`）；
3. ~~push~~ → **已推送**，`HEAD = origin/main = 42f2c79`；
4. ~~deploy~~ → **已部署**，两次 Pages run 均 success，spoolapp.org 已上线；
5. GitHub repository description → Ocean 2026-08-15 拍板「做」，见 `BACKLOG-2026-08-15.md` §2。

采用的 description：

> Local-first project memory for macOS — capture context once, carry it across AI tools, and keep
> every AI write attributed.

---

> **以下是执行前的历史任务单。** 其中“尚未执行”、41 条改动、`33af559` 和“唯一开工面”等
> 时态/快照只描述当时，不再代表当前状态；保留它们是为了追溯原始验收口径。当前状态只看
> `§0-close`。

## 0-next. 历史开工面（Ocean 2026-08-13；现已完成）

### 0-next.1 原始执行前说明（历史）

下面所有事项都**尚未实施**。不要把这份安排写成已完成，也不要引用上一轮测试冒充新任务证据。
执行顺序是：保护工作区 → 建立真实截图安全面 → README 截图 → case-study → 可选 QA → 三项调查 →
最终验证与交接。

`docs/NEXT-CODEX-WINDOW-PROMPT.md` 已改成可直接交给下一窗口的完整提示词；本节是它的短入口。

### 0-next.2 执行任务 A：用真实界面重建 README 截图套件

目标：关闭 `docs/RELEASE.md` §3 里“README 截图与当前 UI 一致”的欠项。不是换一张首页图，而是
让 README 当前引用的全部场景与 v0.4.0 之后的真实界面一致，并补足 release 点名变过的界面。

必须覆盖：

1. README 当前六个场景：项目块流、捕捉确认、Pack、完成项目/摘要、MCP 库、AI 写回与引用；
2. release 明确点名的当前形态：W7 批注当标题、圆圈编号、固定 260px 左栏与线轴面板、右侧栏、
   项目管理；若一张图无法诚实覆盖，就新增真实场景图，不要硬塞进一张；
3. 当前值得公开的周回顾、待审面（含文件申请卡）只有在真实演示数据能安全构造时才加入；
   不为凑数量伪造。

安全红线：

- 只能使用隔离演示库和真实 Spool 界面。现有安全入口是 `~/Desktop/Spool-Demo/Spool.app`，identifier
  `com.oceanjin.spool.verify`，库在 `~/Library/Application Support/com.oceanjin.spool.verify/`；
  开始前按 `docs/HANDOFF.md §0-site.7` 重新核实进程只打开 verify 库，对正式库零句柄。
- 不得使用真实申请材料，不得让正式版 Spool 窗口或真库进入截图。若 Computer Use 无法无歧义地区分
  两个 Spool 进程，立即停止并让 Ocean 手动完成对应操作；不要用 pid 过滤截图冒险。
- 截图必须是当前真实界面的像素，不得生成、重绘、拼造产品内容；只允许无语义改动的裁边、缩放、
  无损/可控压缩。逐张 OCR/肉眼复核无私人内容、无旧 UI、无光标或悬浮残影。
- README 文案和 `alt` 必须与最终画面一致；没有拍到的功能不要在 caption 里承诺。

完成标准：README 引用的每个文件存在且是本轮真实界面；六个既有场景全部复核；release 点名的变化
有公开截图证据；`docs/RELEASE.md` 对应 checkbox 只有在这些条件全部满足后才能改成 `[x]`，并删除
“v0.4.0 当前不合格”的过期警告。

### 0-next.3 执行任务 B：完成 case-study 第四、五期，并把第六期准备到可执行

Ocean 的本轮表述是“完成第四至六期”，但同时明确 **repository description 是单独外部操作**。
因此本窗口的授权范围是：完成仓库内 case-study 资料与网站 Story；不得调用 `gh repo edit`，不得直接
改 GitHub description。可以在交接里给一条建议 description，留待 Ocean 单独批准。

必须完成：

1. **架构图更新**：以 `docs/CASE_STUDY_PAGE.md` §3 的现有 ASCII 图为事实源，更新
   `site/story.html` 的现有图，补上桌面 GUI/捕捉窗、Rust/Tauri 核心、单一 SQLite、`spool --mcp`
   stdio 服务、外部 MCP 客户端、CLI engine 子进程（Claude Code / Codex CLI）及两条真正的出网路径。
   图和正文必须明确：Spool 自己不发 HTTP；内容只会经用户授权的外部客户端或 CLI 离开机器。
2. **真实产品截图**：从任务 A 的新截图中挑 2–4 张最能证明“捕捉 → 项目脉络 → AI 有署名地写回”
   的场景接进 Story；不要把 README 六张全堆一遍。每张有事实型 caption、准确 alt、响应式尺寸与 WebP
   生成链；移动端正文可读。
3. **公证证据**：事实源已经在 `docs/CASE_STUDY_LEDGER.md §1.2`：v0.4.0 的 app / dmg 两个
   Accepted submission id、tag、SHA 与 Gatekeeper 结论都齐。优先使用已保存的真实回执图；若本机/仓库
   没有原始回执图，**不得伪造终端截图**，改用语义化 HTML 证据卡如实呈现 ledger 中保存的字段，
   并标注来源。不要再次接触 Apple 凭据。
4. **收口两份 case-study**：把 `docs/CASE_STUDY_PAGE.md` 已写完的八栏内容与 Story 对齐；
   `CASE_STUDY_LEDGER.md` 遵守“只增不改”，用带日期的新完成记录收口，不静默改写旧数字。修正 ledger
   §6 中已经被后续工作完成但仍显示未完成的导航，方法仍须符合它自己的只增不改原则。
5. **Phase 5 的现实边界**：完成“仓库里的证据页 + 官网 Story 源码”两处可发布状态；真正提交、推送、
   部署仍须 Ocean 在下一窗口明确授权。Phase 6 的 GitHub description 只给建议文本，不执行外部修改。

完成标准：Story 的架构图包含 CLI engine；产品截图与公证证据都是真实可追溯的；页面不再出现
“demo video is being recorded”这类未兑现占位（若本轮没有视频，改成诚实指向互动 Demo）；所有数字能
指回 ledger；390 / 768 / 1440 无横向溢出，图片和图中文字可读。

### 0-next.4 选中的可选增强（本轮做；但不要和产品欠项混淆）

只选与大量视觉资产和 Story 改动直接相关的三项：

1. **视觉快照回归**：为 `/`、`/zh/`、`/story.html`、`/privacy.html`、`/zh/privacy.html` 建立
   390 / 768 / 1440px 的可重复基线和差异检查；动态/时间相关内容必须固定，避免每次假红。
2. **本地 Lighthouse**：至少覆盖 `/`、`/zh/`、`/story.html`，记录 Performance / Accessibility /
   Best Practices / SEO。它是本地发布前指标，不能冒充线上结果；不要为了追分牺牲真实截图清晰度。
3. **变更面的 WCAG 2.1 AA 重点复核**：自动扫描 + 键盘路径 + 200% 缩放 + 图片 alt/figure 结构 +
   可滚动截图区域的焦点/名称。若未实际跑 VoiceOver，就明确写“未覆盖”，不得称完整正式审计。

本轮不做：线上域名冒烟/生产 SEO、`/zh/story.html`、Safari/Firefox/物理机矩阵。它们仍是可选扩范围，
没有做不算失败。

### 0-next.5 调查任务 C：只写调查报告，不改代码

三个主题各自形成一份独立、可接着拍板的调查文档；必须把“已知事实 / 当前外部事实 / 推论 / 建议”
分开。涉及 2026 年仍会变化的产品、额度、平台支持与官方政策，必须联网查**官方一手资料**并标注
查询日期和链接。

1. **Windows 移植**：盘点 CGEventTap/双击 ⌥、AX/抢焦点、`open -a`、`setpgid`/`killpg`、
   `USER`、CLI 路径、`gmtime_r`/`timegm`、Tauri 打包签名等 macOS/Unix 依赖；给出分阶段移植面、
   Windows 对应机制、必须拥有的 Windows 构建/签名/测试环境、风险和建议先后顺序。不得写兼容层。
2. **稳定免费引擎**：用官方文档比较现实候选的免费额度、登录方式、非交互/流式协议、四个动作的
   能力、取消/超时、macOS/Windows、数据与条款边界；明确“稳定免费且能跑全部四动作”是否仍不存在。
   只做推荐与淘汰理由，不接入 provider、不安装新 CLI。
3. **M4 定时跟进**：基于 `docs/DESIGN_FOLLOW_UP.md`、现有 M3、`recheck_after`、
   `list_threads.following_up`、`applyBriefSuggestion.updated_at` 调查。必须检验两个既有闸门：M3 是否已有
   真实价值证据、自动往里写之前是否已有“往外拿”的动作；给出调度/预算/静默条件/用户控制/失败恢复
   方案和需要 Ocean 回答的问题。不得实现 scheduler 或 schema。

### 0-next.6 Git、交接与禁止事项

- 先记录 `git status --short --branch`。当前基线仍是 `HEAD = origin/main = 33af559`、工作树 41 项、
  暂存区为空；不要 reset/clean/checkout，不要覆盖前几轮未提交成果。
- `docs/HANDOFF.md` 只读。本轮任务完成后更新 `HANDOFF-CODEX.md`、
  `COLLABORATION-CODEX-2026-08-13.md` 和 `NEXT-CODEX-WINDOW-PROMPT.md`，但这些交接文件只留本地。
- 任何提交都逐文件暂存，明确排除所有 HANDOFF/交接文档与未采用的 S2 备选图。禁止 AI、Codex、
  Claude、Anthropic、机器人或生成工具署名/trailer；不改 git user，不用 `--author`。
- 当前这条消息只授权安排下一窗任务，**没有授权本窗口提交/推送/部署**。下一窗口完成实现后仍应在
  实际操作前向 Ocean确认提交、推送、部署各自的权限；GitHub description 永远单独问。
- 不加 LICENSE；不顺手清理既存死 CSS、`updated_at` warning 或 `threads.auto_maintain` 遗留列。

### 2026-08-13 视觉微调（Ocean 最新反馈）

Ocean 认为两块就地放大图仍然太大，而且边框/阴影看起来相互重叠。本轮只调整 CSS：

- 两块图由 `width: 84%; right: 0` 改为 `width: 74%; right: 2.25%`；
- 第一块 `top: 35.29%`，第二块 `top: 62.82%`，仍按真实裁图区中心对齐；
- 实测间隙：390px 为 18.41px、768px 为 17.98px、1440px 为 27.87px；中英文页面根宽仍分别
  等于 390 / 768 / 1440，没有页面级横向溢出。

本轮没有修改 `docs/HANDOFF.md`，没有暂存、提交或推送。Ocean 要求任何后续提交都必须：
**无 AI / Codex / Claude / Anthropic 署名或 trailer；逐文件暂存；排除全部 HANDOFF 与交接文档。**
这些交接文件只留在本地，供下一窗口 Codex 与后续 Claude Code 对照接续。

### 后续任务分层（不要把历史条目重新当欠账）

- `HANDOFF-CODEX` §0.3 的视觉快照回归、Lighthouse、完整 WCAG、线上域名/生产 SEO、
  `/zh/story.html`、跨浏览器等仍是**可选加验或扩范围**；Codex 当前都有能力执行，但未做不等于失败。
- 当前可直接继续的真实任务：给 App「复制使用提示」补 `spool://thread/<id>` 资源入口；重拍并更新
  README 的真实界面截图；录制 2–3 分钟演示与 Hero 短版；完成 case-study 第四至六期（架构图、
  截图/公证证据、页面收口；仓库 description 是另一个外部动作）；用隔离库验线轴进格动画和新库提示。
- 必须先有 Ocean 决策、真实客户端或外部环境：第 6/7 句与 Claude Desktop 写入侧真跑；
  `stale_at` / `recheck_after` 主动提醒的交互形态；M4 定时跟进；Windows 移植；免费引擎选择；
  MCP 注册表、Show HN、Product Hunt、Antigravity 等外部动作。
- `HANDOFF.md` §0-ship.2 的 Demo「3 条降到 1 条」已经被当前 `site/assets/demo.js` 闭环：页面、Pack、
  MCP 反馈和待审流程都统一为 1 note，并已走完中英三档 12 条路径；不要再照旧条目重做。
- LICENSE 的结论仍是“不加”；既存死 CSS、`updated_at` warning、`threads.auto_maintain` 遗留列均有意
  保留，不要顺手清理。

## 0-final. 上一轮完成面（**历史证据；当前开工以 §0-next 为准**）

### 0-final.1 结论

**当前没有遗留的网站实现欠项。** 上轮唯一失败的四张细节图已全部改成能到达完整句末的真实裁图，
没有伪造、重绘或修改产品内容；`docs/screenshots/S2.png` 与网站总览图逐字节相同。

用户提供了三份 S2：`S2-1.png` 与 `S2-2.png` 逐字节相同（2624 × 1930），最终选用
`S2.png`（2144 × 1822），因为它的正文折行更紧凑，同样装下完整句子时裁宽少约 24%。
两份未采用的原图是用户文件，保留在 `docs/screenshots/`，不要替他删除。

### 0-final.2 最终裁图与布局

| 派生图 | 真实源与裁切区域 `(x, y, width, height)` | 最终尺寸 |
| --- | --- | --- |
| `project-window-source-detail` | S2 `(570, 660, 1465, 410)` | 1465 × 410 |
| `project-window-ai-detail` | S2 `(570, 1160, 1465, 370)` | 1465 × 370 |
| `mcp-filed-detail-readable` | `mcp-filed-detail.png` `(1, 1, 1900, 430)` | 1900 × 430 |
| `app-thread-after-detail` | `app-thread-after.png` `(1, 800, 1930, 700)` | 1930 × 700 |

- KEEP 不再使用「左一右二」列。完整 S2 独占一个图位，两块裁图按原笔记带的位置覆盖在它上面，
  统一 `width: 74%`、`right: 2.25%`，顶部为 `35.29%` / `62.82%`；两块之间保留约
  18–28px 的可见间隙，边框和阴影均不重叠。
- 390px 下同一图位内部使用 736px 宽舞台并允许横向滑动；页面本身仍严格等于 390px，
  不产生全页横向滚动。中英文都给这个可滚动区域提供了准确的可访问名称。
- Story 两个既有图位内部以 944px 显示完整宽裁图，390 / 768 / 1440 下均可在图内横向查看句首到句末；
  figcaption 不随图片横向滚动。
- 新总览按实际小屏舞台生成 `project-window-736.webp`；完整 2144px WebP 已比 1088 / 1160px
  重采样版本更小，因此不保留这些候选，HTML 的 `srcset` 已同步为 736 / 2144 两档。

### 0-final.3 本轮实际验证

- 截图生成器完整重跑两次，第二次所有 PNG / WebP **逐字节相同，零漂移**；S2 与
  `project-window.png` SHA-256 相同。
- 中文生成成功；`build-site-zh.test` **9 / 9**，i18n 为 `(none missing)`。
- 全量 Vitest **32 文件 / 361 测试**，TypeScript 干净，Rust **72 / 72**；只有既存的
  `updated_at` 未读取 warning；`git diff --check` PASS。
- 本地静态页面实际检查 `/`、`/zh/`、`/story.html` 的 390 / 768 / 1440px：六个中英文 KEEP
  组合和三个 Story 组合都满足 `document.scrollWidth == viewport`；最终缩小后的两块放大图间隙为
  17.98–27.87px；390px 的图片内横向滚动实际可从句首滑到句末；控制台 0 error / warning。

### 0-final.4 上一轮结束时的边界（当前任务已由 §0-next 更新）

- `src/**`、`src-tauri/**` 仍无改动也无未跟踪文件；`docs/HANDOFF.md` 的现有 diff 是上一轮验收
  写入，当前窗口没有改它。
- 暂存区为空；没有提交、推送、部署。推 `main` 会直接更新 spoolapp.org；这条授权边界继续有效，
  但当前实际下一步已改为 §0-next 的截图、case-study 与调查任务。
- 不要重新实现下面的历史 §0，也不要把 KEEP 恢复成右栏双图或把完整正文重新裁断。

## 0-prev. 历史开工面（**已由 0-final 闭环，不再照此实施**）

### 0.1 结论（2026-08-13 更新：Claude Code 已独立验收完毕）

**上一轮的页面实现已经通过验收，只剩一件没签。** Claude Code 按下面 §0.2 原有的七项逐条实测，
**六项通过、一项不通过**。完整验收记录见 `docs/HANDOFF.md` 的新增章节 **§0-accept**。

下一窗的活是 **§0.2 那一件**（重切细节裁图），**不是重新验收，也不是照历史任务单重写页面**。

⚠️ **工作区仍是 32 条未提交改动，`HEAD` = `origin/main` = `33af559`。没有暂存、提交、推送、部署。**

#### 0.1.1 已经验过的六项 —— **不要重验，也不要「顺手改」**

| 已闭环的项目 | 实测结论 |
| --- | --- |
| 最终工作区重跑生成器 + 完整自动测试 | 全绿：`build-site-zh.test` 9/9、`vitest` 361/361、`cargo` 72/72、`tsc` 干净、i18n `(none missing)`、`git diff --check` PASS。⭐ **46 个生成文件重跑后逐字节相同，零漂移** |
| 中文首页通读 | 未发现机翻腔、歧义或事实偏差。Hero 精确为 `同一个项目，<br>不必解释第二遍。` |
| 中英 Privacy 对照 | 逐段一致，页脚导航无漏译，`docs/PRIVACY.md` 与网页同步。中文比英文多「更正提议进待审、AI 不能替你作废」两句，**两句都是真的，属中文更完整，别删** |
| 键盘路径 | Tab 34 站（EN 1440）/ 28 站（ZH 390），**0 缺焦点框、0 往回跳**；13 个 `summary` 的 Enter 与 Space 都能开合；语言切换 Enter 双向双档全通 |
| 390px 全部触控目标 | 46 个（含弹窗打开、FAQ 展开、Demo 各阶段）。**所有按钮 ≥ 44px**；7 个 18px 页脚链接最小中心距 52px，**通过 WCAG 2.5.8 间距豁免** |
| 图片加载与几何 | **60/60 加载成功**；768/1440 单行三图、顶边误差 0、底边 ≤1.53px；四个 `zoom-box` 与裁图坐标**逐一精确对上** |

⚠️ **两个看着像 bug、其实不是的地方，别去「修」：**
1. Hero 写「第二遍」、尾部 CTA 写「第二次」——**英文源本身就是两句不同的话**
   （`Never explain your project twice.` / `Stop explaining the same project again.`）。
2. 首页 Pack 预览条里 `#2` 的措辞比完整 Pack 短一截 —— **英文页也一样**，是既有写法，不是重译引入的。

### 0.2 ⚠️⚠️ 唯一欠着的一件：细节裁图把笔记正文从中间切断

**Ocean 已拍板：走「重切 + 重算列宽」这条路。**

#### 0.2.1 问题是什么

四张「放大镜」细节图的右边缘都切在句子中间，**裁图 PNG 本身就是这样**（不是渲染问题）；
在 1440 的页面上能看见橙色框的右边缘**从字中间穿过去**。

| 图 | 图上能读到 | 被切掉的 |
| --- | --- | --- |
| `project-window-source-detail` | `A model that does well on the data it was trained on` | 后半句全没了（⭐ **只显示约 47%**） |
| 同上 | `Regularisation is a fee charged for complexity: t` | 后面整句 |
| `project-window-ai-detail` | `Revision plan: redo problem set 3 with the fee i` / `Before Friday: problem set 3 question 2 is the o` | 两条都切 |
| `mcp-filed-detail-readable` / `app-thread-after-detail` | `Order of work: rewrite the resume summary first` / `Next step: the current resume still leads with wo` | 同上 |

**要紧在于：上一轮任务书写的就是「让 `02 · KEEP` 的笔记正文可读」，被切掉的正好是笔记正文。**
`alt` 也跟着对不上 —— 它承诺「the quoted passage / 引用原文」，画面里读不到完整的那句。

✅ **没切坏的、不要动的**：编号、日期、来源、`Claude · MCP` 署名、引用回指五样**都清楚可读**；
SAVE 那两张（`capture-page-source-detail` / `capture-toast`）**完全没问题**；
Story 全景图 `alt` 的六条记录**完全准确**；Story 的 **16:04** 时间戳修正**是对的**。

#### 0.2.2 ⭐ 已经量好的坐标（直接用，别再猜）

Claude Code 已在 `docs/screenshots/S2.png`（3600 × 2260）上量过正文的真实右端：

| 内容 | 正文右端（S2 绝对 x） | 现在的裁图 | 装下整句所需宽度 |
| --- | --- | --- | --- |
| note #2 引用原文 | ≈ **2104** | `620..1320`（宽 700） | ≥ 1484 |
| note #3 整句 | ≈ **2748** | 同上 | ≥ 2128 |
| 悬停操作图标（**不要框进去**） | 起于 ≈ **3190** | — | 裁宽 ≤ 2570 即可避开 |

⭐ **结论：`project-window-*-detail` 两张的裁宽应从 700 提到约 2200**（`620..2820`，
正文右端外留约 72px 余白，且天然避开 3190 起的悬停图标）。
`sips` 语法是 `-c 高 宽 --cropOffset 上 左`，所以两条命令的目标形态是：

```bash
sips -c 410 2200 --cropOffset 590 620 project-window.png --out project-window-source-detail.png
sips -c 410 2200 --cropOffset 980 620 project-window.png --out project-window-ai-detail.png
```

Story 那两张（`mcp-filed-detail.png`、`app-thread-after.png`）**请照同样方法自己量一遍再定**，
不要直接套 2200 —— 它们的源图尺寸和版式与 S2 不同。

#### 0.2.3 ⚠️⚠️ 必须先解决的冲突：加宽之后「单行三图」大概率保不住

2200 × 410 的宽高比是 **5.37 : 1**（现在是 1.71 : 1）。
这种细长条**塞不进现在那个「大图在左、两张小图在右」的右栏**：
1440 下整个 figure 约 1088px，右栏就算给到 65%（约 700px），
2200 宽的条被压到 0.318 倍，正文只剩约 7px 高，**比现在还不可读**。
要让它真读得清，这两条基本得**占满整幅宽度**。

⚠️ **而「单行三图」是 Ocean 上一轮专门指定的布局。** 也就是说：
**「单行三图」和「笔记正文可读」在 3600px 宽的源图上是互相打架的，不能两个都要。**
`site.css` 里那两个按宽高比解出来的列宽（SAVE 左栏 58.95% / KEEP 65.11%）也会跟着作废。

**三条路，动手前先让 Ocean 挑（不要自己替他选）：**

| 路 | 做法 | 代价 |
| --- | --- | --- |
| **甲** | 总览图单独一行，两条宽裁图**满宽堆在它下面** | 放弃单行三图；页面变长 |
| **乙** | 保留单行三图，但只把 note #2 的引用原文切全（裁宽约 1500），**note #3 接受仍被切** | 布局不动；任务书只闭环一半 |
| **丙** ⭐ | **请 Ocean 把 Spool 窗口调窄重拍一张 S2**，正文自然折行，700～1000px 的裁图就能装下整句 | 需要 Ocean 动手重拍；但**单行三图和正文可读可以同时保住**，是唯一两全的路 |

⚠️ **丙看着最省事也最干净，但它要 Ocean 重拍，不是你能自己做的。**
**不得伪造、重绘、改动截图里的产品内容，也不得复用旧界面截图**（这条边界没变）。

### 0.3 边界：这些不许做，或做了不算欠账

| 事项 | 性质 | 下一窗应如何处理 |
| --- | --- | --- |
| 暂存、提交、推送、部署 | ⚠️ **Ocean 明确要求不要做** | 只改工作区并报告；**推 `main` 会直接更新 spoolapp.org**，未经 Ocean 新的明确许可不得执行 |
| 修改 app 实现、配置或测试 | 明确超出范围 | 确认 `src/**`、`src-tauri/**` 无 diff 也无未跟踪文件，不要顺手改 app |
| 手改 `site/zh/*.html` 或手工修派生截图 | ⚠️ 明确禁止的实现路径 | 只改中文源与 `build-site-shots.sh`，再重跑生成器 |
| 改写 `docs/HANDOFF.md` | Claude Code 自己的工作史 | ⚠️ **只读。** 它新增了 §0-accept（验收记录），那是 Claude Code 那一侧的开工面，不要动 |
| 伪造/重绘/修改截图里的产品内容，或复用旧界面截图 | ⚠️ 硬红线 | 只能从**当前真实源图**裁切；要换源图必须 Ocean 重拍 |
| 恢复「约一分钟」「两分钟」等时长承诺 | 无实测计时 | 四处已删除；除非先有真实计时，否则不得恢复 |
| 新增 `/zh/story.html` | 现有中文生成链只有首页与 Privacy | 不要把缺少新页面误判为漏译；要加需 Ocean 另行扩范围 |
| 线上域名冒烟与生产 SEO 检查 | 因未部署而无法进行 | 不要用本地结果冒充线上结果 |
| 启动 Tauri app 做 GUI 冒烟 | 对象是静态官网 | 不要用 `npm run tauri dev` 代替网站验收 |
| Safari / Firefox / 物理机 / 连续扫宽 | 只要求 390 / 768 / 1440 三档 | 可作为发布前 QA 提议，**不能记成失败** |
| 视觉快照回归、Lighthouse、完整 WCAG 审计 | 可选增强 | 可另开任务；不要与已完成的 ARIA / 触控 / alt 检查混为一谈 |

### 0.4 下一窗开工清单

1. **先保护工作区。** 记录 `git status --short --branch`；**不要 reset、clean、checkout、暂存、提交、推送**。
   当前 32 条改动全部只在工作区里，其中既有 Codex 两轮的成果，也是唯一的副本。
2. **确认范围没越界。** 下面四条应无输出（第一条不能省，只看 `git diff` 会漏掉未跟踪的 app 文件）：

   ```bash
   git status --short -- src src-tauri
   git diff --name-only -- src src-tauri
   git diff -- docs/HANDOFF.md
   git diff --cached
   ```

3. ⚠️ **先把 §0.2.3 那个冲突交给 Ocean 拍板（甲 / 乙 / 丙），拿到答复再动手。**
   在他选之前**不要**改 `build-site-shots.sh`，也不要改 `site.css` 的列宽 —— 三条路改的地方不一样，
   选错会把已经验收通过的布局白拆一遍。
4. **动手时只改源，不改生成物。** 裁图坐标改 `scripts/build-site-shots.sh`；
   框选位置改 `site/assets/site.css` 里那四个 `zoom-box` 百分比
   （⚠️ **它们必须继续与裁图坐标精确对应**，现在是对上的，别改坏）；
   `alt` 改 `scripts/site-zh-strings.mjs` 与 `site/index.html`。然后依次重跑：

   ```bash
   bash scripts/build-site-shots.sh
   node scripts/build-site-zh.mjs
   ```

5. **同步收尾三件事**：`width` / `height` / `srcset` / `sizes` / `<source media>` 要跟着新尺寸改，
   否则会布局跳动；中英文 `alt` 要如实描述**新画面**（现在那句「引用原文 / the quoted passage」
   在裁图切全之前是不成立的）；`project-window-mobile` 那类无引用的旧资源不要复活。
6. **重跑 §4 全部自动验证**，并确认 `git diff --check` 通过。
7. **用静态服务器自验**（不要用根目录 Vite 或 Tauri app 代替）：

   ```bash
   python3 -m http.server 4173 --bind 127.0.0.1 --directory site
   ```

   在 100% 缩放下过 `/`、`/zh/` 的 390 / 768 / 1440px。
   ⭐ **验收线只有一条：三档下，KEEP 与 Story 细节图里的笔记正文能读到整句，句子不再被右边缘切断。**
   同时确认横向溢出仍为 0、控制台 0 报错、四个编号与框选仍一一对应。
8. **只报你真改了什么。** 六项已验收的东西（§0.1.1）不用重验，也不要写进结论里充数。

### 0.5 接续时先读什么

1. 先读根目录 `CLAUDE.md`。⚠️ 尤其 **§5 提交署名那条硬规矩**。
2. 再读 `docs/HANDOFF.md` 的 **§0-accept**（Claude Code 的独立验收记录，本轮的判定依据）
   和 **§0-ship**（08-12 推上线那一窗）。⚠️ **两节都只读，不要改写。**
3. Codex 两轮的实现细节与证据见 `docs/COLLABORATION-CODEX-2026-08-13.md`。
4. `docs/NEXT-CODEX-WINDOW-PROMPT.md` 是**历史任务单**，页面实现已完成。
   ⚠️ **不要再照它改写页面**；它里面唯一还没闭环的，就是本文件 §0.2 那一件。

## 1. 本轮完成状态

### 1.1 产品截图与响应式排版

首页的 SAVE 与 KEEP 都改成了“完整窗口上下文 + 同一张真实截图的框选放大”：

- SAVE：左侧直接使用 `docs/screenshots/S1.png` 的完整 3600 × 2260 截图；两个编号框分别
  圈出标签页/地址与保存确认浮窗，虚线连到右侧对应放大图。
- KEEP：左侧使用与 `docs/screenshots/S2.png` 逐像素相同的完整项目窗口；两个编号框分别
  圈出 `#2/#3` 来源与批注、`#4/#5` 用户笔记与 `Claude · MCP` 署名/引用，再连到右侧放大图。
- Story：MCP 写回改用可读裁图；完整项目图另配方形细节图。

网站总览与细节图均由 `scripts/build-site-shots.sh` 从文档中的真实源图重建：

| 网站图片 | 源图与精确区域 | 尺寸 |
| --- | --- | --- |
| `capture-page` | `docs/screenshots/S1.png` 完整复制 | 3600 × 2260 |
| `capture-page-source-detail` | S1 `(1, 1, 800, 260)` | 800 × 260 |
| `capture-toast` | S1 `(2880, 0, 680, 392)` | 680 × 392 |
| `project-window` | `docs/screenshots/S2.png` 完整复制 | 3600 × 2260 |
| `project-window-source-detail` | S2 `(620, 590, 700, 410)` | 700 × 410 |
| `project-window-ai-detail` | S2 `(620, 980, 700, 410)` | 700 × 410 |
| `mcp-filed-detail-readable` | `mcp-filed-detail.png` | 700 × 430 |
| `app-thread-after-detail` | `app-thread-after.png` | 700 × 700 |

旧的 `project-window-mobile.png` 已被两张更明确的 KEEP 细节图替代并移除。首页截图块改成
全宽 proof 布局：701px 及以上为完整大图在左、两张框选细节图在右侧上下排列，三张图共同组成
一行；列宽由源图与两张裁图的真实宽高比计算，因此左右顶边重合，底边误差不超过 1.6px。
更窄时隐藏跨栏连接线并回落为纵向，但保留框选和编号对应，避免文字再次缩小。`width`、`height`、
WebP fallback、`srcset` 和 `sizes` 已同步。

### 1.2 全站中文重译

本轮以英文事实源重新翻译了全部现有中文，不是在生成物上局部修词：

- `scripts/site-zh-strings.mjs`：首页正文、导航、按钮、FAQ、SEO、图片描述、noscript、
  视频与导航的可访问文本。
- `site/assets/demo.js` 的 `STR.zh`：互动 Demo 每一步、Pack、AI 回复、MCP trace、
  Keep / Drop 两种结局和运行时 ARIA。
- `scripts/site-zh-privacy.html` 与 `docs/PRIVACY.md`：Privacy 全文。
- `site/zh/index.html` 与 `site/zh/privacy.html`：只由生成器重建，没有手改。

术语统一为：工作区、项目、笔记、批注、Pack、来源、跟进、周回顾、跟进目标、提议、待审、
作废、更正、输入监控、辅助功能、浏览器自动化。普通 ChatGPT / Codex、MCP 配置与 heartbeat、
CLI 动作、Gemini 限制、AI 写回边界和三条主动交接路径均按真实实现表述。

英文源里原有 4 处未经实测的时长承诺没有直接翻译，而是先改回可证实的无时长说法，随后再生成
中文。构建器新增了 `data-i18n-aria` 通路，并统一转义图片描述、ARIA 与 HEAD 属性。站点专项测试
现覆盖所有中文图片描述、品牌视频 ARIA、noscript、Privacy 页脚、SEO metadata、属性转义、
生成物同步和无废弃键。

## 2. 仍须保持的事实边界

1. Input Monitoring 缺失时，跨应用双击 `⌥` 捕捉不可用；自定义捕捉快捷键仍可用。
2. Accessibility 是可选权限，只用于吞掉第二次 `⌥`，避免相同手势的 app 一起响应。
3. 浏览器 Automation 用于取得标签页来源；拒绝后仍能捕捉，来源退化为浏览器名。
4. Spool 不自行上传。内容只有在用户手动粘贴 Pack、让外部 AI 通过 MCP 读取，或运行本机
   CLI 动作时，才会进入别的程序或对应服务商。
5. 普通 ChatGPT 对话不能访问本机 stdio MCP；ChatGPT 桌面端里的 Codex 对话可以。
6. 一键接入只保证配置写入；客户端是否实际连上要看 heartbeat。
7. Spool UI 当前 CLI 主动作是 Follow Up 与 Weekly Review，另有 AI 草拟跟进目标；
   Distill / Thread Health 留在 MCP 面。Claude Code、Codex、Gemini 可作 CLI 引擎，
   但 Gemini 不支持 Follow Up。
8. AI 可新增明确署名的笔记；对用户旧原文的更正提议进入待审。AI 不能删除、替用户作废原文，
   也不能把 AI 内容伪装成用户内容。
9. 不恢复“约一分钟”“两分钟”等时长承诺，除非先有中英文、手机和桌面的真实用户计时。

## 3. 源文件与生成链

- 英文首页事实源：`site/index.html`
- 首页中文字符串源：`scripts/site-zh-strings.mjs`
- Demo 中英文运行时源：`site/assets/demo.js`
- 英文 Privacy 源：`site/privacy.html`
- 中文 Privacy 模板：`scripts/site-zh-privacy.html`
- 中文生成物：`site/zh/index.html`、`site/zh/privacy.html`
- 截图裁图/WebP 生成：`scripts/build-site-shots.sh`

生成顺序：

```bash
bash scripts/build-site-shots.sh
node scripts/build-site-zh.mjs
```

不要手改 `site/zh/*.html`，也不要手工修派生裁图。

## 4. Codex 已执行的验证证据

自动验证：

- `bash -n scripts/build-site-shots.sh` 与完整截图重建：通过；派生图重复生成 SHA 一致。
- `node --check site/assets/demo.js`：通过。
- `node scripts/build-site-zh.mjs`：成功生成两张中文页。
- `npx vitest run scripts/build-site-zh.test.mjs`：9 / 9 通过。
- `node scripts/i18n-check.mjs`：`(none missing)`。
- `npx vitest run`：32 个测试文件、361 / 361 通过。
- `npx tsc --noEmit`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：72 / 72 通过；仅有既存的
  `updated_at` 未读取 warning。
- `git diff --check`：通过。

Codex 本地浏览器矩阵（100% 缩放）：

- `/`、`/zh/`、`/privacy.html`、`/zh/privacy.html`、`/story.html` 全部在
  390 / 768 / 1440px 检查，共 15 个页面/视口组合，横向溢出均为 0。
- 首页和 Story 的全部产品截图逐张滚入视口；27 次图片/视口加载全部成功，图片描述均非空。
- 中英文 Demo 在三档宽度分别完整走过 Keep 与 Drop，共 12 条流程；Keep 最终 2 条笔记，
  Drop 仍为原来的 1 条，待审卡均正确消失。
- Demo 三档各阶段都无横向溢出；390px 所有可见按钮最小高度为 44px。
- 浏览器控制台 error / warning 为 0。
- 后续布局调整又单独复验中英文首页：768 / 1440px 的 SAVE 与 KEEP 都是左一右二的单行三图，
  390px 正确回落；6 个页面/视口组合的 36 次图片加载全部成功，横向溢出和控制台错误均为 0。
- 中文 Hero 最终渲染为 `同一个项目，<br>不必解释第二遍。`。
- 最终放大镜调整中，SAVE / KEEP 的四个框均按真实裁图坐标叠加；768 / 1440px 左右顶边误差为
  0，底边误差分别不超过 1.5 / 1.6px，连接线与编号端点可见。390px 保留框选与编号并正确回落。

## 5. 边界与后续（2026-08-13 验收后更新）

- `git status --short -- src src-tauri` 与对应 diff 均为空；app 实现、配置和测试均未修改。
- ⚠️ **`docs/HANDOFF.md` 现在有 diff —— 是 Claude Code 自己加的 §0-accept 验收章节，属它自己的
  工作史。** 上面 §0.3 那条「不要改写 `docs/HANDOFF.md`」对 Codex 依然有效：**只读。**
- 没有提交、推送或部署。`main` 推送会触发官网上线，必须先让 Ocean 审阅并明确许可。
- 上一轮独立验收的六个通过项仍有效；当时唯一不通过的「细节裁图切断正文」已由
  §0-final 记录的就地放大镜与完整宽裁图闭环。
- 历史 §0-prev.3 列出的是硬边界与可选增强，不应被当作实现失败。
- 后续继续改网站时：先保护工作区里这些未提交改动，改源后重跑两个生成器，并沿用
  390 / 768 / 1440px 矩阵；不要让完整句子再次被裁图边缘切断。
