# docs/ 里都有什么

**先读 `HANDOFF.md`** —— 它是「现在该干什么」的唯一入口,每一窗都会重写。
本文件是目录,只回答「这份文件是干什么的、还活着吗」。

## 活着的(会被改、会被照着开工)

| 文件 | 干什么用 | 状态 |
|---|---|---|
| `HANDOFF.md` | 交接:下一窗第一件事、卡在哪、踩过的坑 | 每窗重写 |
| `DESIGN_AI_ENGINE.md` | Claude Code 引擎位 | **M1/M2/M3 全做完**,剩 v0.4.0 收口 |
| `DESIGN_MCP_WRITE_ROLE.md` | MCP 写入权限该干什么(角色定位 + 待审队列) | **M1 已落地**;M2(写入开关能否默认打开)等真实使用 |
| `EVAL_M1_M2_M3.md` | 上面两条的自评 + 实机探针结果 | ⚠️ **§5 有一个问题等 Ocean 答** |
| `DESIGN_WINDOWS_PORT.md` | Windows 版勘查 | 未开工,排在最后 |
| `MCP_LAB_PROMPT.md` | 隔离实验室的评审提示词 | 第三轮的,下轮要改 |

## 手册(需要时查,不常改)

| 文件 | 干什么用 |
|---|---|
| `RELEASE.md` | 发版流程(公证直发 `.dmg`) |
| `DB_BACKUP_AND_RECOVERY.md` | 真库备份与恢复 —— **动库之前必读** |
| `PRIVACY.md` | 隐私声明(官网同源) |
| `MCP_SCREENSHOT_GUIDE.md` | 官网截图怎么拍 |
| `DEMO_SCRIPT.md` | 演示视频分镜 |

## `archive/` — 已经做完的

做完的设计稿全在 `archive/`,**别照它们开工**。里面有几份开头还写着「待 Ocean 批复」,
那是过期的标题,不是今天的状态 —— 详见 `archive/README.md`。

- `archive/mcp-reviews/` — 三轮 MCP 评审的原始记录 + 下次开评审前必看的三条
- `archive/site/` — 官网改版评审意见(2026-08-02)

## 不在 git 里的

`ID.txt` —— 签名/公证用的 Apple 凭据,`.gitignore` 里挡着,**别提交、别贴进任何文档**。
