# docs/ 里都有什么

**开工只看 `HANDOFF-2026-08-22.md`。** 要知道某一批具体做什么,再翻 `WORKPLAN-2026-08-22.md`。
本文件是目录,只回答「这份文件是干什么的、还活着吗」。

⛔ **`archive/` 里的东西一律不用来开工**,包括那七份旧交接和 `archive/WORKPLAN-2026-08-20.md`。
2026-08-22 按 Ocean 的要求清过一遍:**任务只许待在一个地方**,其余全部转档。

## 开工面(三份,只有这三份)

| 文件 | 干什么用 |
|---|---|
| ⭐ `HANDOFF-2026-08-22.md` | **每次开工先读它。** 现在什么状态、这一窗做哪几件、等 Ocean 回答什么、动手前的护栏 |
| ⭐ `WORKPLAN-2026-08-22.md` | **全部未完成任务** + 施工细节 + 红线速查 + 事实基准 + 「做完的事去哪查」 |
| `COMPRESS-UX-2026-08-22.md` | 压缩功能的十一条交互问题(2026-08-22 Ocean 实际使用后提的),排期在工作计划 D 批 |

## 活着的(会被改、会被照着开工)

| 文件 | 干什么用 | 状态 |
|---|---|---|
| `SPOOL_OVERVIEW.md` | ⭐ **总览(英文)** —— 一份读完就懂 Spool 的全貌:产品、架构、数据、MCP、红线、已量到的数、还没定的商业化四件。**给第一次来的人或 AI 看的入口**;它只做汇总,每一条都指回真正的出处 | 随发布更新 |
| `DESIGN_AI_ENGINE.md` | Claude Code / Codex / Gemini 引擎位 | M1/M2/M3 + 第三个档(Gemini CLI)全落地 |
| `DESIGN_WORKBENCH.md` | 工作台(右侧栏、自动维护、流式进度) | 全落地 |
| `DESIGN_CONTEXT_HYGIENE.md` | 上下文卫生(长度 + 过时) | 已落地;**剩 §9.5 分流** |
| `DESIGN_FOLLOW_UP.md` | 跟进 —— §8 是会话内跟进(清单化 + MCP 提条目/收尾) | M5/M6 已落地(schema v22);**§8.5 第 4 条 `get_pack` 挂不挂待答条目没定** |
| `DESIGN_MCP_WRITE_ROLE.md` | MCP 写入权限该干什么(角色定位 + 待审队列) | 已落地 |
| `DESIGN_MCP_INTENT_ROUTING.md` | 意图路由 —— 让模型找得到那几扇门 | 已落地 |
| `DESIGN_PROJECT_FILES.md` | 附件从块级搬到项目级 + MCP 申请访问文件 | 已落地(schema v15/v19) |
| `DESIGN_CAPTURE_FOCUS.md` | 捕捉直达打字 / 焦点 —— **要动捕捉或焦点必读** | 已落地 |
| `DESIGN_LIBRARY_TRANSFER.md` | 换机器:整库导出 / 导入(导入是合并) | 已落地 |
| `DESIGN_WORKSPACE_PACK.md` | 工作区嵌套 + 打包整个工作区成文件夹 | 已落地(schema v23) |
| `DESIGN_WINDOWS_PORT.md` | Windows 版落地稿 | ✅ v0.5.0 已发布;**未签名**是已知欠账 |
| `DESIGN_FIRST_DAY_VALUE.md` | 首日价值面板 | 已落地 |
| `DESIGN_CASE_STUDY.md` | 公开 case-study 的计划与理由 | 第一、三期已落地;四五六期在等 |
| `CASE_STUDY_LEDGER.md` | ⭐ **台账:每个可披露的数字 + 怎么复算 + 失败与修复**(英文) | **只增不改**;规矩在 `DESIGN_CASE_STUDY` §6.3 |
| `CASE_STUDY_PAGE.md` | **给人读的那一版**:八栏正文,将来上官网(英文) | 会重写,**但不许出现台账查不到的数字** |
| `WINDOWS-CHECK.md` | 装机后的人工验收清单(两个平台都在用) | 持续维护 |
| `REVIEW_MEMTRAPBENCH-2026-08-21.md` | MemTrapBench 论文审核 —— 四类陷阱的定义、对 Spool 的真正作用、⛔ 对外口径 | 结论件,排期在工作计划 E 批 |
| `Deepseek-API-compress-test.md` | ⭐ **压缩/作废检测的实测台账** —— 四轮 130 次的原始数据与真实账单 | **只增不改** |
| `PROMO-VERDICT-2026-08-20.md` | 宣发第一批为什么整批被否 + 三条硬约束 | 宣发重开工前必读 |
| `FEEDBACK-FORM-2026-08-22.md` | 官网表单换问卷星 / SurveyMars 的全过程 | 已落地 |
| `CHECK-DISPLAY-2026-08-21.md` | 主窗装不进屏幕的实测与修复 | 剩验收② |
| `METRICS.md` | 下载量看板 + `~/Desktop` 的 TCC 陷阱 | 持续维护 |

⚠️ **数字只有一处权威:`CASE_STUDY_LEDGER.md`。** 别在设计稿里再记一份 ——
`DESIGN_CASE_STUDY` §2.1 那张表已经因此过期过一次(现在标注了以台账为准)。

## 手册(需要时查,不常改)

| 文件 | 干什么用 |
|---|---|
| `RELEASE.md` | 发版流程(公证直发 `.dmg`)+ **§0.0 当前版本状态** |
| `RELEASE_NOTES_v0.5.0.md` | v0.5.0 的发布说明原文(`gh release create --notes-file` 用的就是它) |
| `DB_BACKUP_AND_RECOVERY.md` | 真库备份与恢复 —— **动库之前必读** |
| `PRIVACY.md` | 隐私声明。⚠️ **一共三处要一起改**:本文件、`site/privacy.html`、`scripts/site-zh-privacy.html`(改完跑 `node scripts/build-site-zh.mjs`) |
| `MCP_SCREENSHOT_GUIDE.md` | 官网截图怎么拍 |
| `DEMO_SCRIPT.md` | 演示视频分镜 |
| `QA_SITE_2026-08-13.md` | 官网静态页 QA + **视觉基线怎么跑**(台账 §7 引它) |
| `MCP_LAB_PROMPT.md` | 隔离实验室的评审提示词 |

## `archive/` — 已经做完的、已经定了的

做完的设计稿、以及问题已经有答案的调查,全在 `archive/`,**别照它们开工**。
里面有几份的开头还写着「待 Ocean 批复」,那是过期的标题,不是今天的状态 ——
详见 `archive/README.md`。

- `archive/mcp-reviews/` — 三轮 MCP 评审的原始记录 + 下次开评审前必看的三条
- `archive/site/` — 官网改版评审意见(2026-08-02)

## 不在 git 里的

- `ID.txt` —— 签名/公证用的 Apple 凭据,`.gitignore` 里挡着,**别提交、别贴进任何文档**。
- `screenshots/S2-1.png`、`S2-2.png`、`mcp-filed-full-2026-08-13.png` —— 拍了但没采用的图。
