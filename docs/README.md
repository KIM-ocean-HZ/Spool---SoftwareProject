# docs/ 里都有什么

**先读 `HANDOFF.md`** —— 它是「现在该干什么」的唯一入口,每一窗都会重写。
本文件是目录,只回答「这份文件是干什么的、还活着吗」。

## 活着的(会被改、会被照着开工)

| 文件 | 干什么用 | 状态 |
|---|---|---|
| `HANDOFF.md` | 交接:下一窗第一件事、卡在哪、踩过的坑 | 每窗重写 |
| `DESIGN_AI_ENGINE.md` | Claude Code / Codex 引擎位 | M1/M2/M3 全做完;**剩第三个档 Gemini CLI(E3)+ codex 最后一格(V2)** |
| `DESIGN_WORKBENCH.md` | 工作台(右侧栏、自动维护、流式进度) | 一~六期全做完;**剩 §10(块正文 MD 渲染 + 动作条减到 7 键)** |
| `DESIGN_CONTEXT_HYGIENE.md` | 上下文卫生(长度 + 过时) | 五件里四件 + 拍板甲/乙已落地(schema v14);**剩 §9.5 分流** |
| `DESIGN_FOLLOW_UP.md` | 联网跟进 | M1/M2/M3 已落地;**M4 定时要等两个条件** |
| `DESIGN_MCP_WRITE_ROLE.md` | MCP 写入权限该干什么(角色定位 + 待审队列) | 已落地;**§9 记着外部客户端首次真跑的全程** |
| `DESIGN_PROJECT_FILES.md` | 附件从块级搬到项目级 + MCP 申请访问文件 | ✅ 四件全拍完,**未开工**(schema v15) |
| `DESIGN_CASE_STUDY.md` | 公开 case-study 的计划与理由 | ✅ 四件全拍完;**第一期已落地(§6)** |
| `CASE_STUDY_LEDGER.md` | ⭐ **台账:每个可披露的数字 + 怎么复算 + 失败与修复**(英文) | **只增不改**;维护规矩在 `DESIGN_CASE_STUDY` §6.3 |
| `DESIGN_WINDOWS_PORT.md` | Windows 版勘查 | 未开工,排在最后 |
| `EVAL_M1_M2_M3.md` | 引擎位 + MCP 写入的自评 + 实机探针结果 | 留档 |
| `MCP_LAB_PROMPT.md` | 隔离实验室的评审提示词 | 第三轮的,下轮要改 |

⚠️ **数字只有一处权威:`CASE_STUDY_LEDGER.md`。** 别在设计稿里再记一份 ——
`DESIGN_CASE_STUDY` §2.1 那张表已经因此过期过一次(现在标注了以台账为准)。

## 手册(需要时查,不常改)

| 文件 | 干什么用 |
|---|---|
| `RELEASE.md` | 发版流程(公证直发 `.dmg`)+ **§0.0 当前版本状态** |
| `DB_BACKUP_AND_RECOVERY.md` | 真库备份与恢复 —— **动库之前必读** |
| `PRIVACY.md` | 隐私声明。⚠️ **一共三处要一起改**:本文件、`site/privacy.html`、`scripts/site-zh-privacy.html`(改完跑 `node scripts/build-site-zh.mjs`) |
| `MCP_SCREENSHOT_GUIDE.md` | 官网截图怎么拍 |
| `DEMO_SCRIPT.md` | 演示视频分镜 |

## `archive/` — 已经做完的

做完的设计稿全在 `archive/`,**别照它们开工**。里面有几份开头还写着「待 Ocean 批复」,
那是过期的标题,不是今天的状态 —— 详见 `archive/README.md`。

- `archive/mcp-reviews/` — 三轮 MCP 评审的原始记录 + 下次开评审前必看的三条
- `archive/site/` — 官网改版评审意见(2026-08-02)

## 不在 git 里的

`ID.txt` —— 签名/公证用的 Apple 凭据,`.gitignore` 里挡着,**别提交、别贴进任何文档**。
