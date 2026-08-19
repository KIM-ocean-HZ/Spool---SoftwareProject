# 下一窗口 Codex 提示词 — README 真实截图、case-study 收口与三项调查

> **已完成，禁止重复执行。** 本文件是 2026-08-13 开工前的历史任务单；最终事实与验证见
> `docs/HANDOFF-CODEX.md §0-close`。
>
> ⛔ **2026-08-15 状态更正：** 上面这段原本写着「未暂存、未提交、未推送、未部署」——
> **已全部作废。** 成果在 08-13 16:19 就提交并推送上线了，
> 当前 `HEAD = origin/main = 42f2c79`，spoolapp.org 已是新版。
> **当前开工面是 `docs/BACKLOG-2026-08-19.md`，不是本文件。**
>
> 三项调查的结论仍然有效，但 Ocean 已在 2026-08-15 分别拍板：Windows 首版跳过双击手势与签名；
> 免费引擎这条路放弃；M4 定时调度不做、跟进改成 MCP 会话内主动提议。详见 backlog §2。

以下保留原始任务单，仅供追溯，不再是待办：

---

你现在接手 `/Users/hzjin/Desktop/Knote`。先完整阅读并遵守：

1. 根目录 `CLAUDE.md`；
2. `docs/HANDOFF-CODEX.md §0-next`（**唯一开工面**）；
3. `docs/HANDOFF.md` 顶部当前状态、`§0-site.7` 隔离演示安全规矩、`§5.1` 截图要求、`§6.6` Git 规矩；
4. `docs/DESIGN_CASE_STUDY.md`、`docs/CASE_STUDY_PAGE.md`、`docs/CASE_STUDY_LEDGER.md`；
5. `docs/RELEASE.md §3`。

当前 `main` 的 `HEAD` 与 `origin/main` 都是 `33af559`，工作树已有约 41 项前几轮未提交的网站成果，
暂存区为空。先现场复核，禁止 reset、clean、checkout，禁止把未跟踪的派生图或交接文件当垃圾清掉。
`docs/HANDOFF.md` 只读。

## 本轮目标

### A. 用真实界面重建 README 截图套件

- 使用隔离演示库和当前真实 Spool UI，更新 README 现有六个场景，并覆盖 release 点名已变化的
  W7 块流、圆圈编号、260px 左栏/线轴面板、右侧栏和项目管理。
- 开始前重新验证 `~/Desktop/Spool-Demo/Spool.app` 的 identifier 是
  `com.oceanjin.spool.verify`，进程只打开 verify 数据库，对正式库零句柄。
- 如果无法无歧义地区分隔离版和正式版，立即停止并请 Ocean 手动完成对应动作；不得用可能静默命中
  正式进程的 pid 截图方式。
- 图片必须来自真实 UI；不得生成、重绘或拼造产品内容。只允许裁边、缩放和压缩。
- 逐张检查无私人信息、无旧 UI、无悬浮残影；同步更新 README 文案和 alt。
- 全部条件满足后，把 `docs/RELEASE.md §3` 的 README 截图项改为 `[x]`，删除过期的不合格警告。

### B. 完成 case-study 仓库与 Story 页面

- 更新 `site/story.html` 架构图，事实源是 `docs/CASE_STUDY_PAGE.md §3`：GUI/捕捉窗、Rust/Tauri、
  单一 SQLite、MCP stdio、外部 MCP 客户端、CLI engine 子进程及两条真正的出网路径都要出现。
- 从新截图中选 2–4 张接入 Story，讲清“捕捉 → 项目脉络 → AI 有署名地写回”；不要机械重复 README。
- 公证事实来自 `docs/CASE_STUDY_LEDGER.md §1.2`。优先用保存的真实回执图；找不到原始图就用
  语义化 HTML 证据卡呈现已保存的 submission id / Accepted / tag / SHA / Gatekeeper 结论，明确来源；
  **绝不伪造终端截图，也不接触 Apple 凭据。**
- 对齐 `docs/CASE_STUDY_PAGE.md` 八栏与 Story；ledger 只增不改，用带日期的新记录收口。
- 移除 Story 中“demo video is being recorded”的未兑现占位；没有视频就诚实引导互动 Demo。
- 390 / 768 / 1440px 检查图片清晰度、alt、figure/caption、横向溢出和控制台。
- 仓库 description 是单独外部动作：只给 Ocean 一条建议文本，**不要调用 `gh repo edit`**。

### C. 做必要的可选增强

只做以下三项，并把它们记作发布前增强，不要反写成产品缺陷：

1. 五条静态路由的 390 / 768 / 1440 可重复视觉快照回归；动态内容需固定，避免假红；
2. `/`、`/zh/`、`/story.html` 的本地 Lighthouse 四分类报告；不得冒充生产分数；
3. 变更页面的 WCAG 2.1 AA 重点复核：自动扫描、键盘、200% 缩放、alt/figure、可滚动图片区域。
   没实际跑 VoiceOver 就明确写未覆盖，不能称“完整正式审计”。

本轮不做线上域名/生产 SEO、`/zh/story.html`、跨浏览器和物理机矩阵。

### D. 三项调查，只写报告，不写代码

为 Windows 移植、稳定免费引擎、M4 定时跟进分别写独立调查文档。对可能变化的 2026 年产品、额度、
平台支持和政策，必须查官方一手资料，附日期与链接；事实、推论、建议分开。

1. Windows：盘点所有 macOS/Unix 专属通路，给阶段计划、Windows 对应机制、测试/签名环境和风险；
2. 免费引擎：比较现实候选的免费额度、认证、非交互协议、四动作能力、取消超时、跨平台和隐私条款，
   明确“稳定免费且能跑全部四动作”是否存在；不安装、不接入；
3. M4：核对 M3 价值证据与“先有往外拿动作”的闸门，提出调度、预算、静默、控制、恢复方案和
   Ocean 决策题；不实现 scheduler、schema 或 UI。

## 验收与交付边界

- 截图与网站生成链按仓库现有顺序运行；中文生成物不得手改。
- 运行截图/Story相关专项检查、全量 Vitest、TypeScript、Rust、i18n 和 `git diff --check`。
- 最后核对正式库零访问、`docs/HANDOFF.md` 没被本窗口改写、调查阶段 app 代码零 diff。
- 完成后更新本文件、`HANDOFF-CODEX.md` 与 collaboration 文档，记录真实结果与未覆盖项。
- 任何提交都逐文件暂存，排除全部 HANDOFF/交接文档和未采用的 S2 备选图。
- Git 历史禁止任何 AI / Codex / Claude / Anthropic 署名或 trailer；不改 git user，不用 `--author`。
- 提交、推送、部署以及 GitHub description 是四个需要分别确认的外部动作。没有 Ocean 当窗明确许可，
  就只保留工作区成果并报告。

最终回复用中文，先说完成结果，再分别列：真实截图、case-study、可选 QA、三项调查、验证、仍需 Ocean
拍板的事项，以及 Git/部署状态。

---
