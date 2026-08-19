# 截图指南 — 官网素材(2026-07-29 第二版:演示库已重建,场景更广)

> 你只需要做两件事:**照抄提示词** + **截图**。
> 隔离环境、演示库、Claude Desktop 配置都已就位,真库全程不入镜、不被读。

## 0. 已替你准备好的(仅知悉)

- **隔离演示 App**:`~/Desktop/Spool-Demo/Spool.app`(identifier `com.oceanjin.spool.verify`,
  与正式版数据彻底隔离)。
- **演示库**:英文界面,**3 个工作区 / 8 个项目 / 18 条笔记**,场景刻意铺开——
  找工作、作品集网站、面试准备、机器学习课、日语、租房、半马训练、菜谱(已自动沉睡)。
  侧栏要能一眼说明:**Spool 不是只给某一类人用的**。
  主角项目是 **Job search**(5 条笔记、跨三周、四种来源:自己的目标 / 招聘页 /
  AI 对话 / 招聘方邮件),deadline 是本周五。
  日期按**运行当天**动态生成,所以随时重跑都新鲜:`scripts/seed-demo-library.sh`。
- **Claude Desktop 配置**:已注入独立的 `spool-demo` 条目(带 `SPOOL_DATA_DIR`
  指向演示库);你原有的 `spool` 条目未动,原配置备份在同目录 `.bak-demo`。
  ⚠️ **2026-08-19 更新**:这条曾被移除,当天按 Ocean 拍板**又加回去了**
  (Ocean 2026-08-19 拍板「把 `spool-demo` 加回 Claude Desktop」;⚠️ 改完必须 ⌘Q 完全退出
  Claude Desktop 再开,它不会重连),命令指向 `~/Desktop/Spool/Spool-Demo/Spool.app`
  里的 0.6.0 二进制;加回前的配置备份在 `.bak-pre-demo-20260819`。
  握手实测:19 个工具、演示库 3 工作区 / 8 项目。
  ⚠️ **开拍前还要动两处**:演示库现在的 `settings.json` 是 `"language": "zh"` +
  `"theme": "valentine"`(0.6.0 那轮改的),而这份指南要的是**英文界面**——
  拍之前把这两行改回 `"en"` / `"classic"`,否则拍出来和官网其余截图不是一套。
  ⚠️ 路径更正:演示 App 在 **`~/Desktop/Spool/Spool-Demo/`**,不是 `~/Desktop/Spool-Demo/`。

## 1. 开拍前(5 分钟)

1. 勿扰模式;素色壁纸;浅色模式。
2. 打开 `~/Desktop/Spool-Demo/Spool.app`(首次右键 → 打开)。
   确认看到的是**英文界面 + Job search**——这就是演示库,不是真库。
3. **完全退出并重开 Claude Desktop**(菜单栏退出,不是关窗口)。

## 2. 应用内截图(4 张)

| 文件名 | 怎么拍 | 要点 |
|--------|--------|------|
| `app-project.png` | 选中 **Job search**,整窗 | 侧栏三个工作区全展开,能看见八个项目名 |
| `app-pack.png` | 在 Job search 点 **Pack**,弹窗打开后整窗 | 能看到分组标题(我的笔记 / 来源 / AI 写的) |
| `app-digest.png` | 任选一个项目 → ⋯ → 标记完成,看沉淀页 | 拍完可撤销 |
| `app-capture.png`(可选) | 从 Safari 复制一句再双击 ⌥,拍浮层确认的瞬间 | 能同时看到浮层与背后的网页最好 |

## 3. Claude Desktop 里依次输入的提示词(4 条)

1. `Use the spool-demo server. What's in my Spool? List my workspaces and projects.`
   → 等它调用工具后,**点开 tool-call 卡片**让工具名和返回可见。
2. `Where am I with my job search? Pull that project and tell me where I left off.`
3. `Search my Spool for "resume" — what did I decide about the layout?`
4. `Save this into Job search as the next step: the resume still leads with work history — move the projects section above it before Friday's batch.`
   → 发完切到 Spool 窗口,新笔记出现,署名 **Claude · MCP**。

> 每条都带上 "Use the spool-demo server." 最稳(否则它可能去读你的真库)。
> 也可以在 Claude Desktop 的连接器设置里临时关掉 `spool` 条目。

## 4. MCP 截图(3 张)

| 文件名 | 内容 | 要点 |
|--------|------|------|
| `mcp-tools.png` | 提示词 1 的对话,tool-call 卡片展开 | 工具名与项目列表清晰可读 |
| `mcp-digest.png` | 提示词 2 的回答 | 体现 AI 把跨三周、跨来源的笔记织成一段话 |
| `mcp-filed.png` | **并排**:左 Claude Desktop(提示词 4),右 Spool 新笔记带 Claude · MCP 署名 | 主图 |

## 5. 交付与收尾

- 全部放 `docs/screenshots/`,喊我一声。我会重新裁切(去空白、切特写)、接进官网四标签、
  更新图注。
- 清理(**等你确认后我才执行**):移除 `spool-demo` 配置条目(恢复 `.bak-demo`)、
  删 `~/Desktop/Spool-Demo` 与演示库目录。
