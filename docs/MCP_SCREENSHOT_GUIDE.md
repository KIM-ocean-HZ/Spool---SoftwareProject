# MCP 截图指南 — 官网素材(2026-07-29 更新:环境已全部替你建好)

> 你只需要做两件事:**依次输入提示词** + **截三张图**。
> 隔离环境、演示库、Claude Desktop 配置都已就位,真库全程不入镜、不被读。

## 0. 已替你准备好的东西(不用动手,仅知悉)

- **隔离演示 App**:`~/Desktop/Spool-Demo/Spool.app`(identifier `com.oceanjin.spool.verify`,
  与正式版数据完全隔离)。
- **演示库**:`~/Library/Application Support/com.oceanjin.spool.verify/`——
  EN 界面,2 个工作区 / 4 条脉络 / 9 块,主角脉络 `Distributed scheduling paper`
  (带 deadline、置顶块、批注、arXiv/Mail 来源),MCP 双开关已开。
  MCP 面与 GUI 启动我都已实测通过。想重置就跑 `scripts/seed-demo-library.sh`。
- **Claude Desktop 配置**:已注入独立的 `spool-demo` 服务条目(带 `SPOOL_DATA_DIR`
  指向演示库;你原有的 `spool` 条目未动,原配置备份在同目录 `.bak-demo`)。

## 1. 开拍(5 分钟)

1. 勿扰模式;素色壁纸;浅色模式。
2. 打开 `~/Desktop/Spool-Demo/Spool.app`(首次右键 → 打开)。确认看到的是
   **英文界面 + Distributed scheduling paper**——这就是演示库,不是真库。
3. **完全重启 Claude Desktop**(菜单栏退出再开),让它加载 `spool-demo`。

## 2. 依次输入的提示词(Claude Desktop)

1. `What's in my Spool library? List my workspaces and threads.`
   → 等它调用工具后,**点开 tool-call 卡片**让 `list_threads` 与结果可见。
2. `Pull the digest of my "Distributed scheduling paper" thread and give me a one-paragraph status of where I left off.`
3. `Search my Spool library for "straggler" — where did I discuss the comparison table?`
4. `File this conclusion into "Distributed scheduling paper": The §3.2 argument is complete — local O(1) reversibility answers the truncation question.`
   → 发完切到 Spool 窗口,新块出现,来源徽标 **Claude · MCP**。

> 若 Claude 同时看到 `spool`(真库)和 `spool-demo` 两个服务,提示词前加一句
> "Use the spool-demo server." 即可;或截图期间在 Claude Desktop 的连接器设置里
> 临时关掉 `spool`。

## 3. 交付三张图(1440px+ 宽,PNG,放 `docs/screenshots/`)

| 文件名 | 内容 | 要点 |
|--------|------|------|
| `mcp-tools.png` | 提示词 1 的对话,tool-call 卡片展开 | 工具名与返回的脉络列表清晰可读 |
| `mcp-digest.png` | 提示词 2 的回答 | 体现 AI 拿到整条脉络上下文后的状态汇报 |
| `mcp-filed.png` | **并排**:左 Claude Desktop(提示词 4),右 Spool 新块带 Claude · MCP 徽标 | 主图——AI 写回、署名可见 |

## 4. 拍完喊我,我来收尾

- 三张图接进官网 `#mcp` 区与 /story(替换模拟 trace 占位)。
- 清理:移除 `spool-demo` 配置条目(恢复 `.bak-demo`)、删 `~/Desktop/Spool-Demo`
  与演示库目录。**清理动作等你确认后我执行**,不会自作主张删东西。
