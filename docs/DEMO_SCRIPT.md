# 演示视频分镜 — v0.3.0(Ocean 实机录制)

> 目标:2 分 30 秒,官网 /story 与申请 portfolio 共用。
> 录制语言:UI 保持中文(真实、有辨识度),**字幕用英文**(受众是申请委员会),
> 不需要配音——每幕一两行字幕即可,后期 iMovie / CapCut 加。

## 录制准备(开拍前一次做完)

1. **绝不用真库录**:走 isolated-verify 流程(隔离 identifier 构建 + 干净演示库),
   真库数据不入镜。演示库预置:工作区「研究」+ 脉络「分布式调度论文」,
   预放 3–4 块有真实感的内容(可参考现有截图里的素材)。
2. 桌面清场:关通知(勿扰模式)、藏无关 Dock 图标、壁纸素色。
3. 录屏:QuickTime(⌘⇧5)全屏 1080p+;鼠标移动放慢,点击前停半秒。
4. 每幕单独录一条,后期拼——不要追求一条过。

## 分镜

| # | 时间 | 画面(你操作什么) | 英文字幕 |
|---|------|------------------|----------|
| 0 | 0:00–0:10 | logo 装配动画(docs/logo/spool-logo-assembly.mp4 直接剪入)→ 标题卡 | **Spool 思簿** — a context hub for long-running projects |
| 1 | 0:10–0:25 | Safari 里一篇论文/文章,选中一段 ⌘C → **双击 ⌥** → 右上角浮层安静确认(主窗口不出现) | Copy anything. Double-tap ⌥. Captured — with its source. |
| 2 | 0:25–0:40 | 换一个来源(AI 网页对话/PDF)再捕捉一条;浮层再次确认 | No window switch. No decisions. One keypress. |
| 3 | 0:40–1:10 | 打开 Spool 主窗口:块流显示刚捕捉的块(时间+来源标签);给一块写一条批注;侧栏可见「捕捉中 ●」 | Fragments thread into an append-only timeline. Your annotations rank highest. |
| 4 | 1:10–1:45 | 点「打包」→ 选意图 → 复制 → 粘到任意网页 AI,AI 基于上下文接着答 | One click packs the thread. One paste re-briefs any AI. Deterministic — no AI in the loop. |
| 5 | 1:45–2:20 | Claude Desktop:让 Claude 搜库并归档一条结论 → 切回 Spool,新块出现,来源标签「Claude · MCP」 | Connect your own AI over MCP. It reads, files, and signs its work — and can never overwrite yours. |
| 6 | 2:20–2:35 | 设置页隐私区一瞥 → 结尾卡:logo + 官网 URL | No account. No cloud. Your data stays home.<br>spoolapp.org |

## 后期

- 字幕:白底黑字或站点米色系,位置统一底部;每幕不超过两行。
- 节奏:幕间硬切即可,不要转场特效(安静原则同样适用于视频)。
- 输出:1080p H.264 mp4,目标 < 40MB(能进 GitHub Release 附件与官网)。
- 完成后:埋进 site/story.html 的预留位,替换"coming with v0.3.0"一句。

## 备选(如果暂时不想录)

按同一分镜截 6 张静态图 + 字幕,官网先用图,视频后补。
