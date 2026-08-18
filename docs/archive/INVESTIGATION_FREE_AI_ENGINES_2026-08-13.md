# 稳定免费 AI 引擎调查（2026-08-13）

> ⛔ **2026-08-15 Ocean 拍板：放弃这条路。** 不再寻找、评估或接入免费托管引擎。
> 本报告转为留档，记录「为什么 2026-08-13 时点上不存在稳定免费且能跑全部四动作的引擎」。
> **不要再把它当成待办或候选清单。** 当前任务面见 `docs/BACKLOG-2026-08-15.md`。

> 性质：交接任务 D2 的只读调查报告；未安装、登录、接入或实跑任何新 provider。
>
> 外部资料统一查询/复核日期：2026-08-13（Asia/Shanghai）。
>
> 证据规则：仓库材料只用于描述 Spool 的既有约束和既往实测；候选产品的现状只采用候选厂商自己的文档、公告、定价页或官方代码仓库。下文将「仓库已知事实」「当前外部事实」「推论」「建议」分开陈述。

## 0. 结论先行

**截至 2026-08-13，没有找到一个可被 Spool 当作默认 provider 的、由官方稳定承诺免费、并能可靠完成全部四个动作的托管 AI 引擎。**

这不是说“完全不能零成本跑”：

- Codex Free、Gemini API-key 免费层、Antigravity 的非付费配额和 GitHub Copilot Free 都是真实候选，但至少缺少一项关键保证：明确且足够的持续配额、Free 对 CLI 自动化的稳定权益、免费搜索发现能力，或无冲突的资格说明。
- OpenCode/Goose + Ollama 一类本地组合可以把模型推理的边际费用降到零，但它是需要用户硬件、模型选择、搜索服务和额外编排器的自托管栈，不是一个现成、跨机器表现稳定的 Spool provider。
- Claude Code 仍是能力基线，Qwen Code 仍是较完整的 CLI 外壳；前者没有免费方案，后者的官方 OAuth 免费模型已停止。

因此本报告的发布判定是：**不新增免费 provider；保留“实验候选”而不把任何候选描述成“稳定免费全四动作”。**

## 1. 判定口径

### 1.1 “稳定免费”

本报告要求同时满足：

1. 无需付费订阅、预充值、绑定按量计费，且不是一次性试用金或短期促销；
2. 官方公开说明持续权益或可复核的额度下限，而不是仅写“视容量而定”“可能调整”；
3. 登录方式允许本机完成一次人工认证后长期非交互运行，或提供不产生按量账单的正式机器凭据；
4. 不依赖违反条款的 OAuth 复用、逆向接口或未获授权的账号共享；
5. 在 macOS 与 Windows 的受支持路径上均可运行。

“免费层最大值”不等于“稳定额度下限”；官方没有公布数值时，也不把一次本机观察外推成长期承诺。

### 1.2 “能跑全部四动作”

必须由同一套可交付方案覆盖：

| Spool 动作 | 必要能力 |
| --- | --- |
| 压缩（<code>distill</code>） | 读取线程、判断重点、经 Spool MCP 写入压缩结果 |
| 去重（<code>thread_health</code>） | 读取线程、识别重复/过期内容、经 Spool MCP 执行维护写入 |
| 周回顾（<code>weekly_review</code>） | 跨线程读取、较长上下文、多步推理、经 Spool MCP 写入回顾 |
| 跟进（<code>follow_up</code>） | 读取线程、公开网页搜索与抓取、来源判断、多步推理、经 Spool MCP 写入候选跟进 |

除模型质量外，方案还必须有：非交互入口、可解析的流式事件、可预设的 MCP 写权限、不会等待人工批准的失败行为，以及可由 Spool 强制取消/超时的子进程。

### 1.3 状态符号

- **满足**：官方材料明确提供，且没有已知冲突；
- **条件满足**：机制存在，但权益、模型、搜索、权限或当前端到端实测尚未闭环；
- **不满足**：缺少决定性能力或不是免费；
- **未知**：官方材料没有给出足够信息；未知不按满足计。

## 2. 仓库已知事实

本节只陈述 <code>CLAUDE.md</code>、<code>docs/HANDOFF-CODEX.md</code> 与 <code>docs/DESIGN_AI_ENGINE.md</code> 中已经记录的事实，不代表候选厂商截至查询日的现状。

1. Spool 当前有四个用户可见 AI 动作：压缩、去重、周回顾、跟进。前三项是维护动作；跟进还需要真实网页搜索/抓取。
2. provider 契约是本地子 CLI。Spool 通过 stdio MCP 暴露工具，本身不保存 provider 密钥，也不代替 provider 发 HTTP 请求。
3. 维护动作需要写权限。若 provider 在 headless 模式仍等待用户确认，正确行为只能是拒绝写入或失败，不能假装完成。
4. 当前宿主把 provider 放入独立进程组；用户取消或超时会终止整个进程组。默认超时 5 分钟，允许配置到 10 分钟；任务串行执行，子进程 stdin 为空。
5. 跟进是最重的动作：它同时需要 Spool MCP 与 provider 的网页发现/抓取能力，并且通常是多轮工具循环。周回顾也属于重任务，但不强制实时网页。
6. 2026-08-10 对 Gemini CLI 0.54.4 的隔离数据库副本实测中，去重约 2 次模型请求/39 秒，压缩约 2 次/28 秒；跟进消耗 20 次请求、超过 10 分钟仍失败，随后额度不足，周回顾未执行。
7. 仓库曾观察到 Gemini 的旧免费层约 20 请求/模型/天，并记录过 Google 账号登录路径；这些是历史观测，不应继续作为当前额度事实。
8. 既有设计结论已经认为 Claude、Codex、Gemini、Antigravity、Copilot CLI、Qwen Code 与通用 CLI 外壳中没有“稳定免费全四动作”候选。本报告的任务是用 2026-08-13 的官方资料重新检查该结论，而不是沿用旧表。

## 3. 当前外部事实

本节只并列官方页面所写内容。遇到页面冲突或未给信息时，只记录“冲突/未说明”；是否因此淘汰候选放在第 4 节判断。

### 3.1 Claude Code

- **免费与登录。** 官方入门文档列出的模型访问方式是有有效计费的 Anthropic Console、Claude Pro/Max，或受支持的企业云；Pro/Max 本身是付费订阅。官方没有给 Claude Code 列出长期 $0 个人层。[入门](https://docs.anthropic.com/en/docs/claude-code/getting-started)；[Pro/Max 使用说明](https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- **非交互与协议。** <code>claude -p</code> 支持 text、json、stream-json，支持限制轮数、允许/禁止工具、权限提示工具和 MCP。[CLI 参考](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- **平台。** 官方支持 macOS、Linux；Windows 路径包括 WSL 与 Git Bash。[系统要求](https://docs.anthropic.com/en/docs/claude-code/setup)
- **数据边界。** Anthropic 区分消费者与商业使用：消费者 Free/Pro/Max（含 Claude Code）的内容是否用于模型改进取决于用户选择及安全审查等例外；商业/API 内容默认不用于训练，除非加入相应计划。[消费者训练说明](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training)；[商业/API 说明](https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training)

### 3.2 OpenAI Codex

- **免费与登录。** OpenAI 当前定价页明确写 Codex 包含在 ChatGPT Free 中，Free 为 $0/月并定位于快速编码任务；同一页面没有公布 Free 的数值额度。页面对 Plus 明列 CLI 等界面，对 Free 卡片没有逐项列出界面权益。[Codex 定价](https://learn.chatgpt.com/docs/pricing)
- **认证边界。** Codex CLI 可用 ChatGPT 浏览器登录，凭据会缓存并自动刷新；无浏览器环境可用 beta 的 device-code。API key 适合程序化工作，但按标准 API 费率计费，因而不是免费路径。[认证](https://learn.chatgpt.com/docs/auth)
- **非交互与协议。** <code>codex exec</code> 是官方的脚本/CI 入口；默认把进度写 stderr、最终消息写 stdout，<code>--json</code> 输出 JSONL 事件流；可显式配置 sandbox/approval，必需 MCP 初始化失败时会直接报错。[非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)
- **MCP 与网页。** 本地 Codex 客户端支持 stdio 与 Streamable HTTP MCP；可把审批设为 never。官方安全文档也说明 Codex 有缓存/实时网页搜索开关，但联网与搜索需要明确配置。[MCP](https://learn.chatgpt.com/docs/extend/mcp)；[审批与网络](https://learn.chatgpt.com/docs/agent-approvals-security)
- **平台。** 当前文档覆盖 macOS 和 Windows 原生/WSL 路径。[CLI](https://learn.chatgpt.com/docs/codex/cli)；[Windows/WSL](https://learn.chatgpt.com/docs/windows/wsl)
- **数据边界。** 官方认证页明确说明 ChatGPT 登录与 API key 登录受不同的数据处理策略控制；本次复核的 Codex 文档没有在 Free 卡片旁给出完整的保留/训练说明，因此个人 Free 路径需要以账号中的 ChatGPT 数据设置为准。API 内容默认不用于训练，默认滥用监控日志最长保留 30 天；远程 MCP 是第三方服务，发送给它的数据还受第三方策略约束。[认证](https://learn.chatgpt.com/docs/auth)；[OpenAI API 数据控制](https://platform.openai.com/docs/guides/your-data)

### 3.3 Gemini CLI / Gemini API-key 免费层

- **免费与登录。** Gemini CLI 配额页把无付费的 API-key 路径列为最多 250 次模型请求/用户/天、仅 Flash；API key 由 <code>GEMINI_API_KEY</code> 提供。Gemini API 的实际限额按项目、层级与模型变化，以 AI Studio 中显示为准，官方明确不保证所有项目得到相同上限。[CLI 配额](https://geminicli.com/docs/resources/quota-and-pricing/)；[认证](https://geminicli.com/docs/get-started/authentication/)；[API 限额](https://ai.google.dev/gemini-api/docs/rate-limits)
- **官方资料冲突。** CLI 配额页仍展示 Google 账号个人配额，但 Google 在 2026-05-19 的官方迁移公告中说明：自 2026-06-18 起，Gemini CLI 和 Code Assist 扩展停止向 Google AI Pro/Ultra 与免费个人 Code Assist 用户提供请求服务，建议迁移到 Antigravity。本节把两者记为冲突证据。[迁移公告](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)；[Code Assist 关闭提示](https://developers.google.com/gemini-code-assist/docs/write-code-gemini)
- **非交互与协议。** Gemini CLI 支持 <code>-p</code> headless，支持单次 JSON 与 stream-json/JSONL；事件包含初始化、消息、工具调用、工具结果、错误和最终结果，并定义退出码。[Headless 文档](https://geminicli.com/docs/cli/headless)；[官方仓库中的协议说明](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)
- **MCP、权限与网页。** 配置支持 MCP server 选择、工具 allowlist 和 approval mode。CLI 有 <code>google_web_search</code> 与 <code>web_fetch</code> 工具。[配置](https://geminicli.com/docs/reference/configuration/)；[工具目录](https://geminicli.com/docs/reference/tools/)；[网页搜索](https://geminicli.com/docs/tools/web-search/)
- **免费搜索边界。** Gemini API 当前定价表显示 Gemini 3.5 Flash 与 3.6 Flash 都有免费输入/输出层，但两者的 Google Search Grounding 在 Free tier 均不可用；同页另列某些旧模型/工具组合的不同免费数值。[Gemini API 定价](https://ai.google.dev/gemini-api/docs/pricing)
- **平台与数据。** 文档给出 macOS/Linux 与 Windows PowerShell 的认证路径。无付费 API-key 使用受 Gemini API unpaid terms 与 Google Privacy Policy 约束；免费层内容可用于改进 Google 产品。CLI 使用统计可选择退出；借第三方客户端复用 Gemini CLI OAuth 凭据违反官方说明的条款边界。[认证](https://geminicli.com/docs/get-started/authentication/)；[条款与隐私](https://geminicli.com/docs/resources/tos-privacy/)；[API 定价的数据说明](https://ai.google.dev/gemini-api/docs/pricing)

### 3.4 Google Antigravity CLI

- **免费与配额。** Antigravity plans 页面称非 Pro/Ultra 用户有按周刷新、工作量相关且受容量影响的基础配额，并说明配额可调整；没有给出数值下限。Google One 帮助页同时把 Antigravity 可用性列在 AI Pro/Ultra 权益内。本节把两者记为冲突证据。[Antigravity plans](https://antigravity.google/docs/plans)；[Google One 权益说明](https://support.google.com/googleone/answer/16105039?hl=en)
- **登录。** CLI 优先从操作系统安全 keyring 静默读取已有会话；没有会话时走浏览器 Google Sign-In。SSH 场景可复制授权 URL、再粘贴授权码；凭据存入 Apple Keychain、Windows Credential Manager 或 Linux keyring 路径。[安装与认证](https://antigravity.google/docs/cli-getting-started)；[keyring 排障](https://antigravity.google/docs/cli/troubleshooting)
- **非交互与协议。** <code>agy -p</code> 可非交互运行。2026-07-28 的官方 changelog 记录了 text、json、stream-json 输出，stream-json 是带初始化、步骤更新和结果的强类型 NDJSON；同一更新把 headless 中需要批准的工具改为软拒绝而不是无限等待，并增加 MCP 工具超时。[CLI 最佳实践](https://antigravity.google/docs/cli/best-practices)；[changelog](https://antigravity.google/changelog?plan=free)
- **MCP 与权限。** Antigravity 支持 stdio、SSE、HTTP MCP；CLI 权限规则可针对 MCP server/tool、URL 读取等设置 allow/deny/ask。[MCP](https://antigravity.google/docs/mcp)；[CLI 权限](https://www.antigravity.google/docs/cli-permissions)
- **网页能力。** Antigravity 官方概览把 web search、Chrome 与 Web MCP 列为共享 agent harness 能力；CLI 权限引擎也单列 <code>read_url</code>/<code>execute_url</code>，未预先 allow 时默认询问。[产品概览](https://antigravity.google/docs/overview)；[CLI 权限](https://antigravity.google/docs/cli/permissions)
- **平台。** 官方入门页给出 macOS/Linux 与 Windows 安装路径。[入门](https://antigravity.google/docs/cli/getting-started)
- **数据边界。** plans 页面把个人账号使用放在 Google 服务条款边界内；本次检索到的 Antigravity 官方 CLI/plans 页面没有给出足以单独判断内容保留、训练选择及 MCP 外发细节的完整说明。因此这些项目在本报告中记为未知，而不是默认安全。

### 3.5 GitHub Copilot CLI Free

- **免费与登录。** Copilot Free 为 $0 个人计划、无需信用卡，包含 Copilot CLI、agent mode、MCP 集成和程序化模式。当前计划页把 chat、agent mode、Copilot CLI 等统一放入 GitHub AI Credits，并只把 Free 描述为“有限的 chat 和 agent 使用”，没有公布数值额度；Free 也不能购买额外 AI Credits。CLI 可通过 GitHub device OAuth 登录，也支持环境 token；BYOK 另受模型提供方计费。[当前计划页](https://github.com/features/copilot/plans)；[CLI 认证](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli)
- **非交互与协议。** <code>copilot -p</code> 可程序化运行；<code>--output-format=json</code> 输出 JSONL。CLI 支持会话级 MCP 配置、MCP/tool allow/deny、无提问模式与 MCP 超时参数。[程序化运行](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically)；[CLI 命令参考](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)；[程序化参考](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference)
- **网页能力。** 官方 CLI 工具参考列出 <code>web_fetch</code>；当前 CLI 还提供内置 research agent，能搜索 GitHub 与网页并生成带引用的报告。官方专题页把 <code>/research</code> 用法写在交互会话中；命令参考另有 <code>--agent</code> 和程序化 <code>-p</code>，但没有在同一官方流程中明确演示“headless research + 随后调用业务 MCP 写入”。[CLI 工具/agent 参考](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)；[Research agent](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/research)
- **平台。** 官方支持 Linux、macOS、Windows PowerShell/WSL。[Copilot CLI 概览](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli)
- **数据边界。** GitHub 对个人 Copilot 计划说明，提示词、建议和代码片段可能用于模型训练，个人可按官方控制项选择退出；托管模型还受相应模型提供方与 GitHub 的协议边界。[模型托管与数据](https://docs.github.com/en/copilot/reference/ai-models/model-hosting)

### 3.6 Qwen Code

- **免费与登录。** Qwen Code 官方文档明确：Qwen OAuth 免费层已于 2026-04-15 停止；当前路径是付费 Alibaba Cloud Coding Plan、API key、第三方 provider 或本地 endpoint。[认证](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/)
- **非交互与协议。** <code>-p</code> 支持 JSON/stream-json、resume、结构化输出，并提供 <code>--max-wall-time</code>、最大工具调用数与最大会话轮数等硬上限。[Headless](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/)
- **MCP 与网页。** Qwen Code 支持 MCP、server 级 include/exclude 及全局 allow/deny。内置 <code>web_fetch</code>；网页搜索依赖额外 MCP 或已有的 Bailian API key，CLI 本身没有提供一个独立、稳定、无条件免费的搜索后端。[MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/)；[工具简介](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/introduction/)；[2026-07-23 更新](https://qwenlm.github.io/qwen-code-docs/en/blog/updates/weekly-update-2026-07-23/)
- **平台与数据。** 官方覆盖 Windows、macOS、Linux。Qwen Code 自身说明不会把提示、代码和响应用于训练；BYOK 数据由实际 provider 的条款决定，遥测可选。[入门](https://qwenlm.github.io/qwen-code-docs/en/)；[条款与隐私](https://qwenlm.github.io/qwen-code-docs/en/users/support/tos-privacy/)

### 3.7 OpenCode / Goose + Ollama 本地栈

- **产品边界。** OpenCode 与 Goose 是开源 agent/编排器，不是自带免费推理额度的模型引擎。两者都支持多个远程或本地 provider；要么提供 API key/订阅，要么自行运行本地模型。[OpenCode provider](https://opencode.ai/docs/providers/)；[Goose 官方站](https://block.github.io/goose/)；[Goose 官方仓库](https://github.com/aaif-goose/goose)
- **OpenCode 协议。** <code>opencode run</code> 提供非交互运行与 JSON 事件格式，并支持 MCP；Windows 官方仍建议 WSL 路径。[CLI](https://opencode.ai/docs/cli/)；[MCP](https://opencode.ai/docs/mcp-servers/)；[安装/平台](https://opencode.ai/docs/)
- **网页能力。** OpenCode 的 <code>websearch</code> 可经托管 Exa MCP 使用且文档称无需单独 API key，但没有在该页公布可依赖的数值配额或 SLA；<code>webfetch</code> 另行提供。[OpenCode 工具](https://opencode.ai/docs/tools/)
- **本地推理。** Ollama Free 计划可在用户自己的硬件上运行开源模型；支持工具调用、流式多轮 agent loop，macOS 与 Windows 均有受支持路径。[定价](https://ollama.com/pricing)；[工具调用](https://docs.ollama.com/capabilities/tool-calling)；[GPU/平台](https://docs.ollama.com/gpu)
- **搜索与资源。** Ollama Web Search/Fetch 需要免费 Ollama 账号，官方称有免费层但没有在文档中给出可作为产品承诺的数值下限。官方还建议 agent/搜索使用较大的上下文；实际可用模型、速度和质量取决于用户 CPU/GPU、内存与模型大小。[Web Search](https://docs.ollama.com/capabilities/web-search)；[上下文长度](https://docs.ollama.com/context-length)
- **数据边界。** 本地生成可以不把推理正文发送给远程模型 provider；一旦启用 Ollama/Exa 网页搜索或其他 MCP，查询与抓取内容进入相应远程服务的策略边界。OpenCode 声明自身不存储代码/上下文并直接调用 provider，但分享等可选功能会改变边界。[OpenCode 企业/数据说明](https://opencode.ai/docs/enterprise/)

## 4. 推论

本节把第 2 节的 Spool 约束应用到第 3 节的外部事实。以下均是推论，不冒充厂商承诺或端到端实测。

### 4.1 总表

| 候选 | 稳定免费 | headless + 流式 | Spool MCP 写入 | 跟进所需搜索/抓取 | macOS/Windows | 全四动作判定 |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | 不满足：无 $0 层 | 满足 | 满足 | 满足 | 满足（Windows 有受支持兼容路径） | **不满足：不是免费** |
| Codex Free | 条件满足：$0 存在，但 Free 数值额度及界面权益未完整公布 | 满足 | 满足 | 满足，需显式允许搜索/网络 | 满足 | **条件满足能力，不满足“稳定免费”** |
| Gemini API-key Free | 条件满足：250/日是最大值，实际限额可变；账号路径发生迁移 | 满足 | 条件满足 | 不满足/未知：当前 3.5/3.6 Flash 免费层无 Search Grounding | 满足 | **不满足：跟进与稳定性未闭环** |
| Antigravity 非付费配额 | 不满足：额度无数值、容量相关，且资格页面冲突 | 满足 | 满足 | 条件满足 | 满足 | **技术形状最接近，但不是稳定免费承诺** |
| Copilot CLI Free | 免费，但 agent/CLI 只标“limited”且无数值额度 | 满足 | 满足 | 条件满足：内建 research 可搜网页；headless 后续业务写入组合未文档化 | 满足 | **条件满足能力，不满足“稳定免费”** |
| Qwen Code | 不满足：官方免费 OAuth 已停止 | 满足 | 满足 | 条件满足：搜索另需 provider | 满足 | **不满足：只是可换后端的外壳** |
| OpenCode/Goose + Ollama | 本地推理可 $0，但依赖硬件；远程搜索免费额度不明确 | OpenCode 满足；Goose 本次未找到同等级事件协议承诺 | 条件满足 | 条件满足，依赖 Ollama/Exa/其他 MCP | 条件满足（部分 Windows 路径偏 WSL） | **仅实验性自托管栈，不是默认 provider** |

#### 四动作逐项投影

这是由官方机制向 Spool 工作流作出的能力投影，不是当前版本的端到端通过记录。

| 候选 | 压缩 | 去重 | 周回顾 | 跟进 | 主要未决条件 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 技术满足 | 技术满足 | 技术满足 | 技术满足 | 没有免费层 |
| Codex Free | 条件满足 | 条件满足 | 条件满足 | 条件满足 | Free 数值额度、Free CLI 持续权益及 Spool 实测 |
| Gemini API-key Free | 条件满足 | 条件满足 | 条件满足 | 不满足/未知 | 当前免费 Flash 无 Google Search Grounding；重任务历史失败 |
| Antigravity 非付费配额 | 条件满足 | 条件满足 | 条件满足 | 条件满足 | Free 资格冲突、无数值额度、尚无 Spool 实测 |
| Copilot CLI Free | 条件满足 | 条件满足 | 条件满足 | 条件满足 | AI Credits 无数值；headless research 后接 Spool 写入未验证 |
| Qwen Code | 外壳满足 | 外壳满足 | 外壳满足 | 外壳条件满足 | 没有官方免费模型；搜索另需 provider |
| OpenCode/Goose + Ollama | 条件满足 | 条件满足 | 条件满足 | 条件满足 | 硬件、模型质量、编排器协议和远程搜索额度 |

### 4.2 为什么 Codex Free 仍不能直接通过

Codex 的技术契约已经覆盖 Spool 所需的关键形状：<code>exec</code>、JSONL、stdio MCP、非交互审批和网页搜索。变化点是官方现已明确列出 $0 Free。

但 Spool 的重任务不是“快速编码任务”：仓库中的一次跟进已经展示 20 次模型请求与 10 分钟仍未完成。Free 页面既没有数值额度，也没有单独承诺 CLI 自动化的持续吞吐；官方还把 API key 明确定位为程序化路径，而 API key 按量收费。因此：

- 可以把 Codex Free 作为人工验证候选；
- 不能据此承诺定时维护或四动作全量可用；
- 不能把一次已登录机器上的成功视为可分发、可持续的免费服务等级。

### 4.3 为什么 Gemini 的“250/日”仍不够

250/日相较仓库曾记录的 20/日是明显变化，但它是 CLI 页面给出的最大值，API 页又说明实际限额因项目/模型而异。更关键的是：

1. Google 账号个人路径已被具日期的迁移公告关闭，旧配额页仍残留相应行；
2. 免费 API-key 被限制到 Flash，而当前 3.5/3.6 Flash 定价表明确没有免费 Search Grounding；
3. 跟进必须先发现网页再抓取，不能只靠已知 URL 的 <code>web_fetch</code>；
4. 历史隔离实测已经显示，模型请求数够用也不等于 10 分钟内能完成重任务。

所以 Gemini 可继续做压缩/去重的实验对照，但没有官方证据支持“同一个免费配置稳定跑完跟进和周回顾”。

### 4.4 为什么 Antigravity 是最值得观察、却仍不能发布

Antigravity 在 2026 年 7 月补齐了 Spool 最关心的技术缺口：非交互 <code>-p</code>、NDJSON、MCP 工具超时、headless 审批软拒绝和细粒度权限。单看 CLI 形状，它是本轮最接近 Claude/Codex 的免费候选。

发布阻碍来自权益而不是协议：官方只写按周刷新、工作量/容量相关且可修改的配额，另一个 Google 官方权益页又把可用性系在 Pro/Ultra 上。没有数值下限、没有无冲突的 Free 资格，就不能把它描述为稳定免费。数据保留/训练边界也仍需单独确认。

### 4.5 为什么 Copilot Free 的当前权益仍不适合四动作

GitHub 已明确把 CLI、chat 和 agent mode 计入 AI Credits，却只把 Free 写成“limited”，没有公开数值下限，也不允许 Free 购买额外 credits。因模型与功能而异的扣减使 Spool 无法在发布前换算每月可完成多少次重任务。内建 research agent 已能搜索网页，这是相较既有设计的重要进步；剩余协议缺口是官方只演示交互式 <code>/research</code>，没有证明一个 <code>-p</code> 会话能完成研究、把结果交还主 agent、再通过 Spool MCP 写入且不等待批准。因此 Copilot Free 可进入隔离验证，但仍不是已证明的稳定全四动作方案。

### 4.6 本地模型栈是否构成反例

不构成“稳定免费默认 provider”的反例，但构成“零边际费用实验方案”的例子。

本地模型没有云端 token 费，理论上配合 OpenCode/Goose 的 MCP 和 Ollama/Exa 搜索可以覆盖四动作。然而可交付性取决于：

- 用户是否有足够 CPU/GPU、内存和磁盘；
- 本地模型是否能在 Spool 的真实线程长度下稳定工具调用；
- Windows 原生与 WSL 的路径差异；
- 免费搜索服务未公布的限额与数据边界；
- 新增编排器、模型下载和权限配置的维护成本。

在没有硬件分档与隔离数据库端到端结果前，只能标记为 research/experimental，不能作为所有用户的 provider。

### 4.7 取消与超时的共同结论

Qwen Code 明确提供 wall-time/tool/session 上限，Antigravity 明确增加 MCP 工具超时，其他 CLI 也各有轮数、工具或协议级失败事件。但这些内部限制不能替代 Spool 当前的宿主硬边界：

| 候选 | 官方可用的自身边界 | 对 Spool 的含义 |
| --- | --- | --- |
| Claude Code | <code>--max-turns</code> 等轮数/工具边界 | 仍需宿主墙钟超时与进程组终止 |
| Codex | JSONL 有 turn completed/failed/error；当前 <code>exec</code> 参考未给墙钟参数 | 以 Spool 5–10 分钟为最终硬上限 |
| Gemini CLI | stream-json 有 error/result 与明确退出码；headless 页未给主任务墙钟参数 | 以退出事件判正常结束，超时由宿主杀进程组 |
| Antigravity | MCP 工具 timeout；headless 需批准时软拒绝 | 可减少挂起，但主任务仍受宿主墙钟控制 |
| Copilot CLI | MCP timeout、<code>--max-autopilot-continues</code> 与无提问模式 | 限制循环次数，仍保留宿主硬超时 |
| Qwen Code | <code>--max-wall-time</code>、最大工具数、最大会话轮数 | 同时启用 CLI 自限与 Spool 外层超时 |
| 本地组合 | 依编排器/模型而异 | 必须沿用 Spool 外层取消，且验证模型服务子进程不会遗留 |

- provider 可能卡在模型请求、网络、MCP 子进程或自身 bug；
- headless 审批必须预先允许或快速拒绝，不能等待 stdin；
- Spool 仍应以独立进程组取消，并以 5–10 分钟墙钟超时作为最终保险；
- 只有在隔离数据库上验证“取消后没有孤儿子进程、没有半写状态”，才算通过取消测试。

## 5. 对既有结论的更新

| 既有记录 | 2026-08-13 更新 | 对最终结论的影响 |
| --- | --- | --- |
| Gemini 免费层约 20 请求/日 | 官方 CLI 页面现列 API-key 免费最多 250 请求/日、Flash only；实际 API 限额仍可变 | 轻动作的试验空间变大；搜索和重任务阻碍仍在 |
| Gemini 可用个人 Google 登录 | 官方公告指定自 2026-06-18 起关闭该服务路径并迁移到 Antigravity | 不能继续把旧 OAuth 当当前方案 |
| Antigravity 缺少稳定 headless 协议 | 2026-07-28 已有 text/json/stream-json、强类型 NDJSON、headless 软拒绝和 MCP timeout | 技术优先级上升，但免费权益仍不稳定 |
| Codex 不按免费候选处理 | 当前官方定价页明确列出 $0 Free | 成为现实候选；Free 数值额度与持续自动化权益仍不足以发布 |
| Copilot CLI Free 可作低成本备选 | 当前 $0 层明确包含 CLI/程序化模式与内建网页 research，但 agent/CLI 额度仅标“limited”、无数值，headless research + MCP 写入组合未闭环 | 可进入隔离试验，不适合四动作默认引擎 |
| Qwen OAuth 有免费模型 | 官方免费 OAuth 于 2026-04-15 停止 | 不再是免费推理候选，只保留 CLI 外壳价值 |

**更新后的结论仍然是“没有稳定免费全四动作候选”，但观察顺序发生变化：Antigravity、Copilot CLI Free 与 Codex Free 上升，Gemini 退到轻动作实验，Qwen OAuth 退出。**

## 6. 建议

本节是建议，不是已经实施的变更。

1. **本轮不接入任何 provider。** 没有候选通过“稳定免费 + 全四动作”的共同门槛。
2. **下一次只做三个隔离 POC，且先等权益清楚：**
   - Antigravity：优先验证账号是否真实具有非付费 CLI 配额、四动作、NDJSON、权限软拒绝和 10 分钟取消；
   - Copilot CLI Free：记录真实 AI Credits 扣减，用程序化 research + Spool MCP 完成一次跟进，并验证无提问/超时；
   - Codex Free：先核实 Free 账号的 CLI 可用界面与可见额度，再测四动作；不得自动切到付费 API key；
3. **Gemini 只作为轻动作对照。** 除非 Google 官方明确给出免费 Flash 的可用 Search Grounding，或提供另一个正式免费搜索组合，否则不要再把跟进纳入其可交付范围。
4. **为“稳定”设置发布门槛：**
   - 官方给出无冲突的免费资格与可复核额度；
   - macOS 和 Windows 均能完成一次登录后非交互运行；
   - 四动作在同一个隔离数据库副本上各连续成功至少 3 次；
   - 每个动作均在 10 分钟内结束，取消后无孤儿进程；
   - 写动作只通过 Spool MCP，审批不会等待 stdin；
   - 跟进引用真实网页，搜索/抓取没有引入未披露的第二个付费服务；
   - 数据使用、保留、训练选项与遥测能在 UI/文档中向用户说明。
5. **保留有偿引擎作为可靠路径。** “提供一个稳定的付费 provider + 明示试验性免费选项”比宣称不存在的免费 SLA 更诚实。
6. **本地栈放到第二阶段。** OpenCode + Ollama 只在定义了最低硬件档后测试，并把本地模型推理与远程搜索分别计账。
7. **复查触发器而不是固定日历承诺：** Antigravity 公布 Free 数值额度/统一资格、Codex 公布 Free CLI 限额、Gemini 免费 Flash 恢复 Search Grounding、Copilot Free 公布 AI Credits 数值、Qwen 恢复官方免费模型时，再重开调查。

## 7. 官方来源索引

所有链接均于 2026-08-13 查询或复核；以下是主要一手资料，正文中的逐项链接构成完整引用清单。

### OpenAI

- [Codex 定价与 Free](https://learn.chatgpt.com/docs/pricing)
- [Codex 认证](https://learn.chatgpt.com/docs/auth)
- [Codex 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Codex 审批与网络](https://learn.chatgpt.com/docs/agent-approvals-security)
- [OpenAI API 数据控制](https://platform.openai.com/docs/guides/your-data)

### Google

- [Gemini CLI 配额与定价](https://geminicli.com/docs/resources/quota-and-pricing/)
- [Gemini CLI 认证](https://geminicli.com/docs/get-started/authentication/)
- [Gemini CLI headless](https://geminicli.com/docs/cli/headless)
- [Gemini API 定价与免费搜索边界](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini CLI 向 Antigravity 迁移公告（2026-05-19；6 月 18 日停止消费者请求）](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [Gemini CLI 条款与隐私](https://geminicli.com/docs/resources/tos-privacy/)
- [Antigravity plans](https://antigravity.google/docs/plans)
- [Antigravity 安装与认证](https://antigravity.google/docs/cli-getting-started)
- [Antigravity changelog](https://antigravity.google/changelog?plan=free)
- [Antigravity MCP](https://antigravity.google/docs/mcp)
- [Antigravity CLI 权限](https://www.antigravity.google/docs/cli-permissions)
- [Antigravity 产品/网页能力概览](https://antigravity.google/docs/overview)
- [Google One 的 Antigravity 权益说明](https://support.google.com/googleone/answer/16105039?hl=en)

### GitHub

- [Copilot 当前计划与 AI Credits](https://github.com/features/copilot/plans)
- [Copilot CLI 程序化运行](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically)
- [Copilot CLI 命令参考](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- [Copilot CLI Research agent](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/research)
- [Copilot 模型托管与数据](https://docs.github.com/en/copilot/reference/ai-models/model-hosting)

### Anthropic

- [Claude Code 入门与认证](https://docs.anthropic.com/en/docs/claude-code/getting-started)
- [Claude Code CLI 参考](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [Claude 消费者训练说明](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training)

### Qwen

- [Qwen Code 认证与免费 OAuth 终止](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/)
- [Qwen Code headless](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/)
- [Qwen Code MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/)
- [Qwen Code 条款与隐私](https://qwenlm.github.io/qwen-code-docs/en/users/support/tos-privacy/)

### OpenCode、Goose 与 Ollama

- [OpenCode provider](https://opencode.ai/docs/providers/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/)
- [OpenCode 工具](https://opencode.ai/docs/tools/)
- [Goose 官方站](https://block.github.io/goose/)
- [Ollama 定价](https://ollama.com/pricing)
- [Ollama 工具调用](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama Web Search](https://docs.ollama.com/capabilities/web-search)

## 8. 最终回答

如果“稳定免费”指官方持续承诺、无需付费凭据、额度足以支撑重任务、能无交互使用 Spool MCP 写入并完成网页跟进，答案是：**不存在已被官方资料和仓库实测共同证明的候选。**

最接近的是 Antigravity（技术协议已补齐）、Copilot CLI Free（CLI/MCP/程序化 research 已具备）与 Codex Free（官方已有 $0 层），但三者都没有足以承诺重任务的 Free 数值额度；Antigravity 还存在资格冲突，Copilot 与 Codex 的 headless 四动作组合也未在 Spool 上闭环。它们目前只能进入后续隔离验证，不能进入 provider 实现。
