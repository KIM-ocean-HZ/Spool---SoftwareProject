# 归档 — 已经做完的设计稿

这里的稿子**都已经落地了**,留着只是为了回答「当初为什么这么改」。
**不要照它们开工**,也不要把里面的「待办」当成待办 —— 那些话是写稿当天的语气,不是今天的状态。

⚠️ 有几份的开头还写着「待 Ocean 批复」。**那是过期的标题**:2026-08-05 逐条对过代码,
东西早就在产品里跑了(比如 `check_library`、设置 tab 化、自动沉睡、第二条教程脉络)。
标题没改是因为当时的人做完就走了,没回来改开头那一行。

| 稿子 | 落地的东西 |
|---|---|
| `DESIGN_CAPTURE_NOTE_FIRST.md` | 双击 ⌥ 直达批注框,收集面板砍掉 |
| `DESIGN_CAPTURE_HELPER_PROCESS.md` | 捕捉浮窗挪进独立进程,主窗不再被顶起 |
| `DESIGN_FIRST_RUN.md` | 装完之后的头 60 秒,五条全落地 |
| `DESIGN_DATA_HYGIENE.md` | `check_library` 只读体检工具 |
| `DESIGN_UI_MINIMAL.md` | 设置 tab 化、权限横幅收成一行等呈现层整理 |
| `DESIGN_UX_FRICTION.md` | 自动沉睡(14 天无活动折叠)等四项交互摩擦 |
| `DESIGN_MCP_ONBOARDING.md` | 「让 AI 用上你的 Spool」教程脉络 |
| `DESIGN_MCP_ONECLICK.md` | 六个客户端的一键接入 |
| `DESIGN_MCP_ECOSYSTEM.md` | 官网 + app 内把 MCP 生态讲清楚 |
| `DESIGN_SITE_PITCH.md` | 官网三档改造(Ocean「三档全做」) |
| `DESIGN_EN_TYPOGRAPHY.md` | EN 排版审计与整改 |
| `DESIGN_NEXT_STAGE.md` | 发布收尾 / 官网 / portfolio / 产品下一程的总路线 |
| `DESIGN_SITE_REBUILD.md` | 官网整页重做(A0)—— 2026-08-11 上线 |
| `SITE_POSITIONING.md` | 官网卖什么、怎么排的判断稿(2026-08-12) |
| `SITE_REVISION_LIST.md` | 官网逐屏修改清单(2026-08-12)—— 逐条做完 |

**`DESIGN_NEXT_STAGE.md` 特别说明**:它是一份**路线图**,不是单点方案。2026-08-05 逐条对过代码:

- §4.1 Claude Code 引擎位 —— ✅ 已细化成 `docs/DESIGN_AI_ENGINE.md`,M1 做完了
- §4.2 MCP prompts 面(weekly_review / thread_health / distill)—— ✅ 三个都在跑
- §4.3 AI 活动面 · §4.4「我的思考」凸显 · §4.5 首日价值 —— ❌ **还没做**

后三条**已经搬进 HANDOFF §4 的长期计划清单**,别只在这里找 —— 这份稿子是归档件,
不会再更新。

## 调查与自评(2026-08-18 归档)

这三份**不是设计稿,是调查**:它们回答的问题当时都拿到了答案,而答案已经变成决定了。
留着是为了「当初为什么这么定」,**别照它们开工**。

| 文件 | 当时问的 | 后来定的 |
|---|---|---|
| `INVESTIGATION_FREE_AI_ENGINES_2026-08-13.md` | 有没有稳定免费、能跑全部四个动作的引擎 | ⛔ 2026-08-15 放弃这条路 |
| `INVESTIGATION_M4_SCHEDULED_FOLLOW_UP_2026-08-13.md` | 跟进要不要做定时调度器 | ⛔ 2026-08-15 不做,换成会话内跟进(`DESIGN_FOLLOW_UP` §8) |
| `INVESTIGATION_WINDOWS_PORT_2026-08-13.md` | Windows 移植要付什么代价 | ✅ 做了,v0.5.0 已发布(`DESIGN_WINDOWS_PORT.md` 是落地稿) |

| 文件 | 干什么用 |
|---|---|
| `EVAL_M1_M2_M3.md` | 引擎位 + MCP 写入的自评与实机探针结果(2026-08-05) |

## 外部材料（2026-08-21 归档）

| 文件 | 是什么 | 结论在哪 |
|---|---|---|
| `essayprove-gpt-analysis.md` | MemTrapBench 论文 + 一位老师的点评 + 三轮 GPT 分析的**原始粘贴**（776 行）。⛔ 里面有一条对 Spool 现状的描述是错的（读了过期的 `SPOOL_OVERVIEW.md`） | `docs/REVIEW_MEMTRAPBENCH-2026-08-21.md`，排期在 `WORKPLAN-2026-08-20.md` §9.13 |

## 交接与工作面（2026-08-22 归档）

⛔ **这一批全部是"当时的开工面"，现在都不是了。开工看 `docs/HANDOFF-2026-08-22.md`。**

2026-08-22 Ocean 的要求：「不允许任务无限堆积在一个文件夹，这会导致上下文过长，执行不准确」。
所以任务只留在一个地方（`WORKPLAN-2026-08-22.md`），历次工作面全部转档。

| 文件 | 是什么 | 里面还值钱的是什么 |
|---|---|---|
| `WORKPLAN-2026-08-20.md` | 上一个工作面，2814 行 | ⭐ **实测留档**：四轮 API 实测的结论（§9.3–§9.12）、被推翻的成本表（§6.2 vs §9.3）、论文排期（§9.13）、收费怎么做（§6.1）、企业微信怎么接（§4.1.5）。⛔ **待办部分已经全部搬进 `WORKPLAN-2026-08-22.md`，别照这份排期** |
| `HANDOFF-2026-08-19.md` | v0.6.1 发布后的交接 | §2 那张**工程护栏表**（"改回去测试照样绿"的那类）—— ⭐ **已整张搬进 `WORKPLAN-2026-08-22.md` §4.2**，这里只是原件 |
| `HANDOFF.md` | 最长的那份工作史（2760 行，77 个版本） | 早期每一件事的来龙去脉。设计稿里大量 `§6.x` 引用指的就是它 |
| `HANDOFF-2026-08-15.md` | 08-15 至 08-16 三窗 | 落地记录 |
| `HANDOFF-CODEX.md` · `NEXT-CODEX-WINDOW-PROMPT.md` · `COLLABORATION-CODEX-2026-08-13.md` | Codex 协作那几轮 | ⛔ 那条路 08-15 已拆、插件已卸 |
| `RELEASE-0.5.0-HANDOFF.md` | v0.5.0 发布收尾 | 发布手册以 `RELEASE.md` 为准 |
| `BACKLOG-2026-08-15.md` · `BACKLOG-2026-08-19.md` | 两份旧任务队列 | 已并进 `WORKPLAN-2026-08-20.md`，再并进新工作计划 |
| `Spool-strategy-2026-08-19.md` · `Spool-header-analysis-2026-8-19.md` · `SPOOL-WORKORDER-v0.7-2026-08-20.md` | 方向判断 / 表头八条 / v0.7 功能工作单 | 三份都已并进工作面；表头八条**全部做完了** |
| `CHECK-2026-08-17.md` | 一次人工检查记录 | 当时的验收结论 |
