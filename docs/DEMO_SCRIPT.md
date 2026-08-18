# 演示视频分镜 — v0.5.0(Ocean 实机录制)

> **状态**:Ocean 2026-08-15 决策 8「先不做视频」仍然有效。**这份是稿子,不是排期。**
> 想拍的时候照着拍即可;不拍也不欠什么——官网首页那个可交互演示已经把同一条环走完了
> (`site/index.html` 的 `#demo`),story 页现在明说「没有占位视频」,不存在等着被填的空框。
>
> 目标:2 分 30 秒,官网与申请 portfolio 共用。
> **UI 语言:英文。** ⚠️ 这一条 2026-08-18 改了——app 默认英文/跟随系统,官网主语言是英文,
> 受众也是英文。旧稿写的是「UI 保持中文 + 英文字幕」,那会让视频和它要配的两个页面对不上。
> 不配音,每幕一两行字幕,后期 iMovie / CapCut 加。

## 录制准备(开拍前一次做完)

1. **绝不用真库录。** 跑 `scripts/seed-demo-library.sh` ——它写的是隔离 identifier
   (`com.oceanjin.spool.verify`)的数据目录,**碰不到真库**,而且和官网所有截图用的是
   同一个库,视频与网页因此天然一致。库里已经预置了课程、找工作、租房、练日语等多条线,
   侧栏一眼就能看出「Spool 不是只给某一种人用的」。
2. ⭐ **它已经把捕捉快捷键绑成 `⌘⇧K`**,理由写在脚本注释里:绑定的快捷键走
   `RegisterEventHotKey`,不需要输入监控授权;而双击 ⌥ 需要,隔离 identifier 从来没被授过权,
   为一个演示去授权会在系统设置里多出第二个「Spool」,不值得。
   **所以第 1、2 幕按 ⌘⇧K,别按双击 ⌥。**成片里两者的画面完全一样。
3. 桌面清场:勿扰模式、藏无关 Dock 图标、素色壁纸。
4. 录屏:QuickTime(⌘⇧5)全屏 1080p+;鼠标移动放慢,点击前停半秒。
5. 每幕单独录一条,后期拼——不要追求一条过。

## 分镜

官网首页把这条环讲成三段(`01 · SAVE` / `02 · KEEP` / `03 · HAND IT OVER`),
下面的幕次就按那三段排,字幕直接用页面上的说法,免得两处各讲一套。

| # | 时间 | 画面(你操作什么) | 英文字幕 |
|---|------|------------------|----------|
| 0 | 0:00–0:10 | logo 装配动画(`docs/logo/spool-logo-assembly.mp4` 直接剪入)→ 标题卡 | **Spool 思簿** — a context hub for long-running projects |
| 1 | 0:10–0:25 | 浏览器里一篇课程材料,选中一段 ⌘C → 按捕捉键 → 右上角浮窗安静确认,**光标已经在批注框里**,直接打一句想法 → Enter。**主窗全程没有出现** | Copy anything. One key. It lands in the project you are on — with its source. |
| 2 | 0:25–0:40 | 换一个来源(AI 网页对话)再捕捉一条,这次不写批注,点别处跳过 | Nothing to decide at capture time. The main window never comes forward. |
| 3 | 0:40–1:10 | 打开 Spool 主窗:刚捕捉的两块在时间线最上面,带编号、时间、来源;把其中一条批注当成标题读;侧栏能看到「Capturing ●」落在哪个项目上 | A list, not a chat. Append-only, time-ordered, quiet. Your own note ranks highest. |
| 4 | 1:10–1:45 | 点 Pack → **range 选 All**(旧稿写的「选意图」已经没有了,v0.4.0 把三种任务类型删了,Pack 现在只交上下文)→ 复制 → 粘进任意网页 AI,AI 接着答 | One click packs the project. One paste re-briefs any AI. No AI in the loop — same project, same bytes. |
| 5 | 1:45–2:10 | Claude Desktop:让它搜库并归档一条结论 → 切回 Spool,新块出现在**用户那块下面**,标着 `Claude · MCP`,带一条 `↩` 指回它回答的那一块 | Connect your own AI over MCP. It reads, files, and signs its work — and can never overwrite yours. |
| 6 | 2:10–2:25 | 右栏跟进清单扫一眼:一条「永久跟进」、一条「单次跟进」,单次那条点「已解决」收掉 | It keeps watching what you told it to watch — and closes a question once it has an answer. |
| 7 | 2:25–2:40 | 设置页 Privacy/Advanced 一瞥 → 结尾卡:logo + 官网 URL | No account. No cloud. Your data stays on your machine.<br>spoolapp.org |

### 可选的第 8 幕(Windows)

v0.5.0 起 Windows 也能跑。要不要入镜看用途:**给申请看**建议加,它证明的是移植能力;
**给官网看**可以不加,首页已经写清楚两个平台了。

真要拍就只拍一件事:**Windows 上双击 Ctrl,同一张捕捉卡弹出来**。
字幕:`Same gesture on Windows — double-tap Ctrl.`
⚠️ 别拍安装过程:Windows 版没签名,SmartScreen 会拦一次,那一幕会把观众的注意力
全带去「这东西安全吗」,而那个问题官网 FAQ 已经答了。

## 后期

- 字幕:白底黑字或站点米色系,位置统一底部;每幕不超过两行。
- 节奏:幕间硬切即可,不要转场特效(安静原则同样适用于视频)。
- 输出:1080p H.264 mp4,目标 < 40MB(能进 GitHub Release 附件与官网)。
- 放哪儿:story 页现在写的是「没有占位视频,去看可交互演示」。真拍出来了,
  **那句话要跟着改**(`story-demo` 键,中英两侧都要),别让页面一边说没有视频、
  一边放着视频。

## 备选(如果暂时不想录)

按同一分镜截 7 张静态图 + 字幕,先用图,视频后补。
⚠️ 截图走 `docs/MCP_SCREENSHOT_GUIDE.md` 那套流程,和官网截图同一个库、同一套规矩。
