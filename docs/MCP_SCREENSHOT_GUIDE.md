# MCP 截图指南 — 官网素材(Ocean 实机操作)

> 目的:官网 MCP 区(index `#mcp`)与 /story 需要**真实的 Claude Desktop ↔ Spool 会话截图**。
> 我无法驱动 Claude Desktop,按本指南操作,产出三张图放到 `docs/screenshots/`,
> 文件名照 §4,我来接进官网(替换现在的模拟 trace 占位)。

## 1. 准备(一次性,约 15 分钟)

1. **绝不用真库**:走 isolated-verify 隔离流程(隔离 identifier 构建 + 干净演示库)。
   真库数据一个字都不入镜。
2. **语言切 EN**:设置 → 语言 → English(官网是英文站,截图文案要一致)。
3. **建演示库结构**(为了侧栏好看,树要有层次):
   - 工作区 **Research**:thread `Distributed scheduling paper`(主角,见 §2)、
     `Rust study notes`(随便放 1–2 块)、`Course report`(空的也行)
   - 工作区 **Life**:thread `Recipes`(放 1 块)
4. **开 MCP**:设置 → MCP → 开服务 + 开「允许 AI 写入」→ 一键接入 Claude Desktop →
   完全退出并重启 Claude Desktop(菜单栏退出,不是关窗口)。
5. 桌面清场:勿扰模式、素色壁纸、Dock 隐藏无关图标。浅色模式。

## 2. 主角 thread 的内容(逐块照抄)

`Distributed scheduling paper`,设 deadline 为本周五。六块按顺序:

| # | 正文 | 来源 | 批注 |
|---|------|------|------|
| 1 | Target: submit the revision by Aug 15. Reviewer 2's main objection is truncation. | 无(手写) | — |
| 2 | Chapter 4 classifies straggler mitigation as speculative, proactive, or hybrid — orthogonal to our incremental/deadline split. | 捕捉时来源改成 arXiv(或从真 arXiv 页面捕捉) | Cite as contrast in related work. |
| 3 | Incremental evaluation doesn't require divisibility — only locally O(1) reversible updates. Sums qualify; products too, via the log domain. | 从任意 AI 网页对话捕捉(来源显示浏览器/站名即可) | This is the skeleton sentence for §3.2. |
| 4 | Revision order: fix the formula numbering in §3.2 first, then add the straggler comparison table. | 无(手写) | — |
| 5 | Committee notes: the revised §3.2 argument resolves the truncation question; one more pass on notation. | Mail(或手动改来源) | — |

> 块 2/3/5 若嫌改来源麻烦,直接从真实的 Safari/邮件窗口复制-捕捉,来源自动就对了。

## 3. Claude Desktop 里依次输入的提示词

1. `What's in my Spool library? List my workspaces and threads.`
   → **等它调用工具后,点开 tool-call 卡片**让 `list_threads` 可见。
2. `Pull the digest of my "Distributed scheduling paper" thread and give me a one-paragraph status of where I left off.`
3. `Search my Spool library for "straggler" — where did I discuss the comparison table?`
4. `File this conclusion into "Distributed scheduling paper": The §3.2 argument is complete — local O(1) reversibility answers the truncation question.`
   → 发完后**切到 Spool**,新块会出现,来源徽标是 Claude · MCP。

## 4. 要交付的三张图(1440px+ 宽,PNG)

| 文件名 | 内容 | 要点 |
|--------|------|------|
| `mcp-tools.png` | 提示词 1 的对话,tool-call 卡片展开 | 让 "spool" 和工具名清晰可读 |
| `mcp-digest.png` | 提示词 2 的回答 | 体现 AI 拿到整条脉络的上下文 |
| `mcp-filed.png` | **并排**:左 Claude Desktop(提示词 4),右 Spool 块流新块带 Claude · MCP 徽标 | 这是主图——AI 写回、署名可见 |

## 5. 交付后我做什么

- `mcp-filed.png` 进官网 `#mcp` 区替换模拟 trace(trace 缩为小图或撤下)
- `mcp-tools.png` / `mcp-digest.png` 进 /story 与 README 的 MCP 段
- 若将来重摄 EN 全套 UI 截图(DESIGN_EN_TYPOGRAPHY 批后),这批 MCP 图风格已经对齐,不用重拍
