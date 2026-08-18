# 设计稿 — Claude Code 引擎位(DESIGN_NEXT_STAGE §4.1 细化)

> 状态:**M1 / M2 / M3 全部落地(2026-08-05)**,实机探针见 `archive/EVAL_M1_M2_M3.md`。
> **§7 引擎位泛化 + Codex 第二引擎已落地(2026-08-06)** —— 参数按 codex-cli 0.146.1
> 逐条实测(§7.3),**唯独「模型真的写进一块」那一格没验到**,原因和补验步骤在 §7.6。
> ⏸ **§7.7 是新的待拍板项**:Ocean 08-06 提出「codex 也该算订阅档,要不要再补一个真的
> 稳定免费的档」。
> 2026-07-29 Ocean 批 §4.1 升主线;同日 §6 四项全部通过
> (动作命名照 §1.1/写入开关作为渲染前提/超时默认 5 分钟上限 10/M1 先做「提炼结论」)。
> 目标版本 v0.4.0。
>
> ⚠️ **实现期改掉的一处 §1.2 措辞**:「运行中该菜单组禁用」和「全局任务队列串行」
> 直接读会互相打架 —— 全局禁用就没人能往队列里放东西。落地时按后者:
> **锁按脉络**(同一条脉络不排第二个),别的项目照常可以排队等。

## 0. 定位与边界

一句话:**检测到用户已安装 Claude Code CLI 时,Spool 提供"让 AI 维护这条脉络"的
入口,背后 `claude -p` headless 挂上 Spool 自己的 MCP server。**
GUI 是策展面,CLI 是引擎,MCP 是总线;费用走用户已有的 Claude 订阅,零 API key。

不动摇的前提:
- **本体零 AI 不变**:`claude` 不存在时,一切入口不渲染,产品完整可用。
- **Spool 本体零出网不变**:出网发生在 Claude Code 进程内(用户已装、已登录、
  已信任的工具);CSP 不放宽,webview 仍无外网。
- **宪法 5 不变**:AI 经 MCP 写入 = 带来源标签、append-only;用户手写内容对机器只读。
  本功能不新增任何写路径,复用现有 MCP 工具面。

## 1. UX

### 1.1 入口(ThreadView 头部 ⋯ 菜单)

⚠️ **2026-08-06 深夜 Ocean 改名了(「让所有功能变得精明扼要」),下表的动作名已过时:**
**提炼结论 → 压缩 / 整理去重 → 去重 / 生成周回顾 → 周回顾 / 找找新进展 → 跟进**。
改的**只有用户看到的标签** —— 下面这张表里的 prompt 名(`thread_health` / `distill` /
`weekly_review`)是 MCP 契约,**一个字没动**。留档见 `DESIGN_WORKBENCH.md` §9.7,
「压缩」这个名字带来的行为要求见 §9.8。

⋯ 菜单新增子组「让 AI 维护」,三个动作(与 §4.2 的 MCP prompts 同源):

| 动作 | 背后 prompt | 产出 |
|------|------------|------|
| 整理去重 | `thread_health` | AI 检查重复/悬空/摘要过期,把发现按块归档 |
| 提炼结论 | `distill` | 把脉络提炼成一条结论块(带来源标签) |
| 生成周回顾 | `weekly_review` | 拉 digest → 产出一段周回顾块 |

渲染条件(三者同时):`claude` CLI 检测到 + MCP 服务开关开 + 「允许 AI 写入」开关开。
**不新增权限面**——复用用户已经理解的两个开关,隐私叙事零增量。
任一条件不满足,菜单组整个不出现(不出灰置项,安静原则)。

### 1.2 运行中

- 脉络头部出现「AI 整理中 ●」pill(样式同「捕捉中 ●」),点击可取消。
- 不弹窗、不遮挡;用户可以继续操作,包括切走。
- 同一脉络同时只允许一个任务;全局任务队列串行(避免写竞争)。运行中该菜单组禁用。

### 1.3 完成 / 失败

- 完成:AI 写入的块按现有 MCP 路径自然落进块流(来源标签自动),toast 一行
  「AI 归档了 N 块」。§4.3 的「AI 活动」折叠区(另行实现)提供事后审计面。
- 失败:toast 一行 + 可展开详情(超时/CLI 报错/解析失败)。绝不留半成品状态。

### 1.4 设置(MCP tab 内新小节「本机 AI 引擎」)

- 检测状态行:`claude 2.0.50 ✓` / 「未检测到 Claude Code」+ 安装链接
- 开关「在脉络菜单显示 AI 维护动作」(默认**开**,检测到才有意义)
- 超时上限(默认 5 分钟,不可高于 10 分钟)

## 2. 技术设计

### 2.1 检测

启动时与设置页刷新时 `which claude` + `claude --version`(带短超时)。
最低版本要求以实现期实测为准(需要 `-p` + `--mcp-config` + `--allowedTools` 三件齐)。

### 2.2 调用(Rust 侧,新模块 `src-tauri/src/engine.rs`)

```
claude -p "<prompt 文本(注入 thread_id)>"
  --mcp-config <临时文件>        # {"mcpServers":{"spool":{"command":"<mcp_exe_path>","args":["--mcp"]}}}
  --allowedTools "mcp__spool__*" # 只放行 Spool 的 MCP 工具
  --output-format json
  --max-turns <N>
```

- MCP 配置复用现有 `mcp_exe_path`(即当前可执行文件自身 + `--mcp`),与
  Claude Desktop 一键接入同一口径——**多进程同库并发是已经在跑的模型**,不新增风险面。
- prompt 文本与 §4.2 的三个 MCP prompts **同一常量源**(mcp.rs),一份维护两处受益。
- **不使用** `--dangerously-skip-permissions`;非 Spool 工具(Bash/文件/网络)一律不放行。
- 子进程:进程组启动,取消/超时 kill 整组;stdout JSON 解析结果,stderr 进错误详情;
  env 传最小集(PATH + HOME,claude 登录态需要)。
- 临时 mcp-config 写入应用支持目录,用后即删。

### 2.3 失败模式

| 情形 | 表现 |
|------|------|
| claude 未安装 | 入口不渲染(设置页可见检测状态) |
| claude 未登录 / 订阅限额 | CLI 报错透传到 toast 详情,提示到 Claude Code 里处理 |
| 超时 | kill 进程组,toast「已停止:超过 N 分钟」;已写入的块保留(append-only,无回滚概念) |
| 输出解析失败 | 视为失败报详情;写入的块同样保留并可在活动面看到 |
| 用户取消 | 同超时路径 |

### 2.4 宪法与安全探针(验收必测)

1. 让 AI 试图修改用户手写块 → MCP 写面必须拒绝(现有约束,加探针固定住)。
2. prompt 内注入「运行 shell 命令」类指令 → allowedTools 白名单外的调用不可发生。
3. 全程抓包:Spool 本体进程零出网(出网只在 claude 进程)。

## 3. i18n

中文即键,EN 同步:「让 AI 维护」「整理去重」「提炼结论」「生成周回顾」
「AI 整理中」「AI 归档了 {n} 块」「本机 AI 引擎」等。

## 4. 测试计划

- 单测(TS):入口渲染条件矩阵(检测 × 两开关);运行中禁用态。
- 单测(Rust):mcp-config 生成、CLI 参数拼装、输出解析、超时/取消(mock 子进程)。
- 集成冒烟(isolated-verify 流程,隔离库):真实 `claude -p` 跑「提炼结论」端到端,
  验证块落库带来源标签。
- 宪法探针:§2.4 三项。
- golden 不受影响(不触碰 assemble.ts / templates.ts;若 §4.2 prompts 文本落在
  mcp.rs,遵守 GOLDEN_WRITE 规则同步)。

## 5. 分期(每期独立提交、独立可回退)

- ✅ **M1**(2026-08-05):检测 + 设置小节 + 单动作「提炼结论」端到端 —— 先证明管道。
  ⚠️ 当时的「取消」只有超时,真取消是 M2 补的。
- ✅ **M2**(2026-08-05):三动作齐 + **真取消**(子进程自己起进程组,取消/超时 kill 整组
  —— 只杀父进程会把 claude 拉起来的 `spool --mcp` 留在那儿端着库)+ 串行队列
  + toast 细化(失败带可折叠的 CLI 原话)。**「归档了 N 块」的 N 是数出来的**,
  而且只数带 MCP 来源标签的行,免得把用户自己的捕捉算进去。
- ✅ **M3**(2026-08-05):「AI 活动」折叠区。**纯推导,不建表** —— source 标签说明是
  AI 写的,created_at 说明什么时候;再存一份的唯一后果是这个面板可能和块本身对不上,
  而审计面最不能出的就是这个。两层:本次会话按下的动作(内存)+ AI 写的块(推导,
  不分是从 Spool 菜单跑的还是别的客户端半夜写的)。

## 6. ✅ 四项全部照建议定案(2026-07-29 通过,2026-08-06 Ocean 再次确认「全部统一你的建议」)

1. ✅ **三个动作就叫「整理去重 / 提炼结论 / 生成周回顾」**,照 §1.1 的用词。
2. ✅ **「允许 AI 写入」开关是渲染前提。** 否掉那个替代方案(只要 MCP 开关、写入没开时
   降级成只读报告)—— 三个动作的产出都是写回一块,读权限不够用,
   降级版会让用户在菜单里看见一个"做一半"的功能。
3. ✅ **默认超时 5 分钟,上限 10 分钟。** 上限在 Rust 侧 `clamp_timeout_secs` 强制,
   不信任设置页 —— 那个值来自 `settings.json`,用户能手改。
4. ✅ **M1 先做「提炼结论」**(最短路径证明管道)。已落地。

---

## 7. 引擎位泛化 + Codex 第二引擎(2026-08-06 Ocean 拍板)

### 7.1 为什么现在做

**没有 Claude 订阅的人,引擎位对他等于不存在。** 这是这个功能今天最大的洞:
检测不到 `claude`,整组菜单不渲染(§1.1 的安静原则),他连"这儿本来有东西"都不知道。

2026 年免费闸门关了一大半(调研留档在 `DESIGN_FOLLOW_UP.md` §7),
**唯一零门槛还活着的是 Codex CLI**:所有 ChatGPT 套餐都带它,包括 Free 档,
`codex exec` 无头跑,不要 API key、不要信用卡。用户装一个 CLI、拿已有的
ChatGPT 账号登录,引擎位就活了。

这条路不撤回 7/09 的 MCP-first 决策,反而是它的延长线:**Spool 仍然不内置任何 AI、
不存任何 key、不发任何 HTTP**,出网仍然发生在用户自己已装已登录的 CLI 进程里(§0)。

### 7.2 形状:两个预设,不是「任意命令」

⚠️ **明确不做「让用户填一行命令」。** 两个理由:

1. **抽象不出来。** 每个 CLI 的参数名、MCP 配置的喂法、输出 JSON 的形状全不一样
   (见 7.3 对照表)。做成自由文本框,等于把「参数拼错了就静默降级成无工具运行」
   这个坑交给用户。
2. **那是把安全白名单交出去。** §2.2 那条「非 Spool 工具一律不放行」是靠我们自己
   拼的参数保证的。用户填的命令行里没有 `--allowedTools`,整条防线就没了。

所以是**枚举**:`Engine::Claude` / `Engine::Codex`,各自一份适配,加第三个要写代码。

### 7.3 三个预设的差别(claude / codex ✅ 2026-08-06 实测,codex-cli **0.146.1**;
### gemini ✅ 2026-08-10 实测,gemini-cli **0.54.4**)

| | claude | codex | **gemini** |
|---|---|---|---|
| 无头子命令 | `claude -p "<prompt>"` | `codex exec "<prompt>"`(prompt 是位置参数,**必须放最后**) | `gemini -p "<prompt>"` |
| 输出 | `--output-format json` → **一个** JSON 信封,取 `result` / `is_error` | `--json` → 事件流;**成功的正文改从 `-o <文件>` 读**,见下 | ✅ `-o json` → **一个**信封 `{session_id, response, stats}`;也有 `-o stream-json` |
| MCP 怎么喂 | `--mcp-config <临时文件>`,用后即删 | ✅ `-c mcp_servers.spool.command=…` 一组覆盖,**不写文件** | ⚠️ **只能写文件**:`<cwd>/.gemini/settings.json`(项目级)。**所以必须把 cwd 设成我们自己造的临时目录** —— 没有等价于 `--mcp-config` 的命令行开关 |
| 隔离 | 临时配置本身就是边界 | ✅ **`--ignore-user-config`** —— 不加载用户自己的 config.toml,**但登录照用**(它 help 原话:auth still uses CODEX_HOME) | ⚠️⚠️ **没有等价开关。** 用户 `~/.gemini/settings.json` 里的 MCP 服务器**照样会被加载并真的起进程**(实测:塞一个 `intruder` 进去,`gemini mcp list` 显示它 Connected)。**能挡住的只有下一格** |
| 工具白名单 | `--allowedTools "mcp__spool__…"` | ✅ `-c mcp_servers.spool.enabled_tools=[…]`(裸名,不带 `mcp__spool__` 前缀) | ✅ 两层:服务器上的 `includeTools`(裸名)+ **`--allowed-mcp-server-names spool`**。⚠️ 后者是挡住上一格那个洞的**唯一**东西 —— 实测 intruder 的工具**一个都没进模型的工具表**(spool 14 个全在) |
| 内置终端工具 | Bash 不在白名单 = 用不了 | ⚠️ **摘不掉**(没有 `tools.shell` 这个配置键)。只能 `--sandbox read-only` | ✅ **摘得掉**,比 codex 强:`tools.exclude: [run_shell_command, write_file, replace, read_file, …]`。⚠️ **但这个键已被标记废弃**("will be removed in 1.0, migrate to Policy Engine"),**升级会炸** |
| 轮数上限 | `--max-turns 12` | ⚠️ **没有对应参数**,唯一的天花板是超时 | ⚠️ **也没有**,同 codex |
| 登录态 | 钥匙串,账户名取自 `USER` | `~/.codex/auth.json` → 只要 `HOME`;`CODEX_HOME` 若用户设过要一起传 | ✅ **`GEMINI_API_KEY` 环境变量**,不碰钥匙串、不碰 HOME |
| 无头放行 | 靠白名单 | `approval_policy="never"` | `--approval-mode yolo` |
| ⚠️ **工作区信任** | 无此概念 | 无此概念 | ⚠️⚠️ **必须 `GEMINI_CLI_TRUST_WORKSPACE=true`**,否则 **MCP 服务器被静默禁用**(`mcp list` 才会说出口:「configured but disabled because this folder is untrusted」)。⚠️ **`--skip-trust` 不管用** —— 实测加了它模型仍然答 `NO_MCP_TOOLS`。**这一格是整件事最大的坑,`--help` 里一个字都没有** |
| 模型 | 别名 `opus/sonnet/haiku`,真跑确认过 | 目录 | ⚠️ **`-m` 不可靠**:传 `gemini-3.6-flash`,报错回来说的是 `model: gemini-3.5-flash`。**别把 `-m` 当成"钉住了"** |

⚠️ **gemini 那一列的三格是"必须做对否则静默失败"**:工作区信任(不设 = 没有工具)、
cwd(不设 = 读不到我们写的 MCP 配置)、`--allowed-mcp-server-names`(不设 = 用户自己的
服务器混进来)。**三格都不会报错,只会安静地不是你以为的那样。**

**怎么测出来的**(不花模型额度的办法,下次照做):

- **`--strict-config` 是把尺子。** 它对**不认识的配置键**直接报错。所以把「要试的键」
  和「一个肯定不存在的键」一起传:报错只提到那个假键 = 要试的键是真的。
  这样能在**不发生任何模型调用**的情况下问出整张配置表。
- **`codex mcp get spool` 会把合并后的服务器配置打印出来** —— 用它确认 `-c` 覆盖
  真的进去了(`enabled_tools: get_pack, list_threads` 原样回显)。
- **MCP 服务器是在模型那一步之前就启动的。** 把 `mcp_servers.spool.command` 指向一个
  记录 argv/env 再 exec 真二进制的包装脚本,哪怕这次跑因为额度失败,包装脚本也已经写下了
  日志 —— 于是「服务器起没起、参数和环境变量对不对」这件事**不花一次额度就能验**。

⚠️ **实测里三条会咬人的**:

1. **stdin 必须给 `/dev/null`。** 否则 `codex exec` 打印「Reading additional input from
   stdin...」然后挂着等。Rust 那侧 `output_with_timeout` 本来就设了 `Stdio::null()`,
   算是躲过一劫。
2. **成功那一格的事件形状没验到**(见 7.6),所以**正文改成从 `-o <文件>` 读** ——
   失败形状是真跑出来的,成功形状是猜的,不拿猜的去解析。
3. **nvm 装的 CLI,检测器原来找不到。** `npm i -g @openai/codex` 落在
   `~/.nvm/versions/node/v24.11.0/bin/codex`,而 GUI app 继承的是 launchd 的 PATH
   (`which` 查不到),候选路径表里也没有这一层 —— **在刚装完 codex 的那台机器上,
   设置页会说「没检测到」**。现在按 node 版本目录遍历。

### 7.4 选哪个引擎

- 只检测到一个 → 用它,设置页显示 `codex 0.146.1 ✓`,不问用户。
- 两个都检测到 → 设置页给一个二选一,默认 `claude`(能力更强,而且现有用户已经在用它)。
- 一个都没有 → 现状不变(菜单组不渲染),但设置页那一行要**同时**给两条安装路。

⚠️ **原稿这里写的是「把『Codex 免费档也能用』这句话说出来」,08-06 撤掉了。**
Ocean 当天的判断(实测撞上额度墙之后):**Codex 和 Claude Code 都该算订阅档,不算免费**。
所以设置页那一行只给两条安装路,一句「免费」都不说 —— 说了就是把用户往
「装完发现跑两次就锁一个月」上引。真要补一档**稳定免费**的,是另一个决策,见 §7.7。

### 7.5 这一节明确不做的

- 不内置任何 API key,不在 app 里发 HTTP(§0 的前提一个字不改)。
- 不做「任意命令」自由配置(7.2)。
- 不为 codex 单独做一套动作。三个动作、prompt 常量、串行队列、真取消、
  「AI 活动」折叠区——**全部复用**,泛化只发生在"怎么起这个进程、怎么读它的输出"这一层。

### 7.6-bis ✅ 2026-08-10:codex 真跑通了一次,V2 那三件结掉两件半

**额度恢复后跑了一次 `distill`(真库副本,exit 0)。四个事件,全部形状如下:**

```
{"type":"thread.started","thread_id":"019fdd7a-…"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"…"}}
{"type":"turn.completed","usage":{"input_tokens":22691,"cached_input_tokens":11008,
  "cache_write_input_tokens":0,"output_tokens":288,"reasoning_output_tokens":106}}
```

| V2 的三件 | 结果 |
|---|---|
| **花费字段** | ✅ **有 token,没有美元。** `turn.completed.usage` 五个计数器,**没有 `total_cost_usd` 那种字段**。→ 已接上(`parse_codex_usage`),运行卡片显示 token 数 + 「花费未知」。⚠️ **绝不写 0** —— 那会被读成「这次是免费的」 |
| **流式事件名** | ✅ **成功路径的四个名字拿到了**(上面)。⚠️ **工具调用那一格仍然没见过** —— 这次跑它没调任何 MCP 工具(原因见下),所以 `item` 的其他 type 还是未知 |
| **模型目录** | ❌ **答案是「拿不到」**:四个事件里**没有任何地方说跑的是哪个模型**。→ 所以 codex 的模型选择器**继续不做**,理由从「没验过」升级成「**验过了,拿不到**」。`EngineKind::models()` 对 codex 返回空表 |

⚠️ **顺带证实了 §7.8.3**:codex 这次也是**一块都没写**(32→32),正文最后一句是
「如果你同意这块结论,我再将它追加回〈申请规划〉」。**三个引擎在写入闸这里行为完全一致**,
这是提示词的设计,不是哪个引擎的毛病。

⚠️ **两条环境噪音,别当成 bug**:
① 即使 `< /dev/null`,stderr 仍会打一行 `Reading additional input from stdin...`(不影响);
② `ERROR codex_models_manager::cache: failed to load models cache: missing field
`base_instructions`` —— codex 自己的模型缓存坏了,和 Spool 无关。

### 7.6 ⚠️ 唯一没验到的那一格,和补验的办法

**没验到的是「模型真的调了 Spool 的工具、真的写进一块」。**
卡点不在代码:**Ocean 的 ChatGPT 是 Free 档,Codex 额度已经用完**,
原话是 `You've hit your usage limit. Upgrade to Plus…, or try again at Sep 4th, 2026 9:33 AM`。
换句话说这台机器一个月内跑不了 codex 的模型。

已经验到的边界是:参数全对、隔离生效、MCP 服务器起来了(argv 和 env 都对)、
**连上了 OpenAI 并拿回了账号级的答复** —— 差的只有模型那一步。

**补验步骤(额度回来之后,五分钟):**

1. `scripts/seed-mcp-lab.sh` 重建实验室,把 `…/com.oceanjin.spool.lab/data` 拷一份到临时目录。
2. 用 `prompts/get` 取一次 `distill` 的提示词(见 §7.3 的探针写法)。
3. `codex exec` 照 `engine.rs` 的 `codex_args()` 拼一遍,外加
   `-c "mcp_servers.spool.env={SPOOL_DATA_DIR=\"<副本>\"}"` 指向副本。
4. 看两件事:**块数有没有 +1**,以及新块的 `source` 是不是 `Codex · MCP` 一类的标签。
5. 顺手验白名单真的拦得住:把 `enabled_tools` 改成只留 `list_threads`,再让它去 `add_block`。

⚠️ **在这一步做完之前,设置页里 codex 那条路应当被视为「参数已验、产出未验」。**

### 7.7 ⏸ 待 Ocean 拍板:要不要补一个「真的稳定免费」的引擎档(2026-08-06 他提出)

**他的原话**:「codex 免费额度不多,那么 codex 应该和 Claude Code 都算作订阅档,
而不是免费,考虑加入其他稳定免费的档位比如 Gemini api 或者其他更好用的,
虽然需要 api 但是为了用户使用体验需要做出妥协。」

**先说清楚这件事的现状**:§7.1 把 codex 当成「给没订阅的人补上引擎位」的答案,
而 08-06 的实测把这个前提打掉了一半 —— Free 档是真的带 Codex,但**额度小到跑两次就锁一个月**。
所以今天的真相是:**引擎位仍然只服务有订阅的人。**

**关键分辨:「要 key」有两种形状,代价差得非常远。**

| | 形状 A:**再加一个 CLI 预设**(如 gemini CLI) | 形状 B:Spool 自己存 key、自己发请求 |
|---|---|---|
| key 存在哪 | 用户配在**那个 CLI 里**,Spool 看都看不到 | Spool 的 settings.json |
| 谁出网 | 子进程(跟今天 claude/codex 一模一样) | **Spool 本体** |
| 零出网叙事 | ✅ 一个字不用改 | ❌ 官网、隐私页、README 全要改口 |
| 2026-07-09 MCP-first 决策 | ✅ 不违反 | ❌ 直接推翻 |
| 工作量 | 一个 `EngineKind` + 一份适配(§7.2 说的"写代码") | 新的网络层 + key 存储 + 错误面 |

**我的建议:走形状 A。** 它把 Ocean 要的东西(稳定免费的档位、用户自己带 key)全给了,
代价只是"多写一份适配",而**不用动那条已经写在官网上的承诺**。
`groqKey` / `geminiKey` 这两个明文 key 正是 07-09 那次从 settings.json 里**删掉**的东西
(见 `settingsStore.ts` 的 `LEGACY_AI_KEYS`,现在还在做开机清理);形状 B 等于把它们请回来。

**2026-08 的事实**(细表在 `DESIGN_FOLLOW_UP.md` §7):Gemini CLI 的**免费 Google 账号登录
6/18 停了**,所以走 gemini CLI 也得让用户去申请一个 API key;但 **Gemini API 免费层还在**
(Flash 每天 1500 次),这一档是真的稳定、真的够用。

### ✅ 2026-08-06 Ocean 拍板:**做,走形状 A**

原话:「免费档位:接受建议 A」。所以:

- **做** —— 补第三个引擎档,让没有 Claude / ChatGPT 订阅的人也有引擎位。
- **形状 A** —— 它是**再一个 CLI 预设**,不是 Spool 自己发请求。
  key 由用户配在那个 CLI 里,**Spool 不存 key、不发 HTTP、零出网叙事一个字不改**,
  §0 的三条前提和 2026-07-09 的 MCP-first 决策全部原样成立。
- **③ 选哪个 CLI 还没定死**,建议 gemini CLI(Gemini API 免费层 Flash 每天 1500 次,
  是这一档里唯一真的稳定的)。**动手前先重查 §7 那张表**,它会过期。
  ⚠️⚠️ **「每天 1500 次」这个数 2026-08-10 实测已经不成立了 —— 真值是每天 20 次。
  见 §7.8。这一节剩下的判断仍然成立,但「真的稳定够用」这半句必须删掉。**

**落地时照 §7.2 的规矩**:加一个引擎 = 一个 `EngineKind` 枚举值 + 一份参数适配 +
一份输出解析 + **一轮真机实测**(§7.3 那张表要长出第三列)。⚠️ 尤其是这三格:
它有没有 `--ignore-user-config` 那种隔离手段、工具白名单怎么写、内置 shell 能不能关。
⚠️ 在真机实测之前**不要**把枚举值先加上占位 —— 没有"先占个位"这种中间状态。

---

## 7.8 ⭐⭐ 实测账:Gemini 免费档到底能不能当「默认维护工具」(2026-08-10)

**Ocean 的原话**:「检测 gemini 免费 api 到底能不能作为 spool 的默认维护工具完成好所有任务」。
**跑法**:他真库的**副本**(`sqlite3 .backup`,32 块 / 3 项目 / schema v14),
隔离 HOME + 隔离 cwd,喂的是 `prompts/get` 和 `guidance_text()` 取出来的**真提示词**,
不是手抄的。gemini-cli 0.54.4。

### 7.8.1 一句话结论

> **不能当默认档。** 轻的两个动作(压缩、体检)它做得**好**;
> 重的两个(跟进、周回顾)**结构上跑不完** —— 不是答得差,是**额度在半路耗光**。
> 免费层是**每个模型每天 20 次请求**,而一次跟进要烧掉的正好是这个数。

### 7.8.2 逐条实测

| 动作 | 模型 | 结果 | API 请求数 | 耗时 |
|---|---|---|---|---|
| **体检 thread_health** | gemini-3-flash-preview | ✅ **好** —— 认出摘要过期,给了新摘要建议,判据说得出来 | 2 | 39s |
| **压缩 distill** | gemini-3-flash-preview | ✅ **好** —— 11 块真材料提炼成一块结论,分了「已定 / 未定 / 卡点」三段 | 2 | 28s |
| 工具连通 | gemini-3.5-flash-lite | ✅ 14 个 Spool 工具全在,`list_threads` 答 3(对) | 2 | 3s |
| **跟进 follow_up** | gemini-3-flash-preview | ❌ **跑不完** —— 前台撞 10 分钟超时,后台重跑**烧光当天 20 次额度后失败** | 20(封顶) | >10 min |
| **周回顾 weekly_review** | 要 3.6-flash,**实际跑的是 3.5-flash** | ❌ 额度已空,直接失败 | — | — |
| **对照:claude 跑同一份 distill** | haiku→sonnet | ✅ 同样的好,**同样一块没写** | 1 轮 | 28s · **$0.062** |

### 7.8.3 ⚠️ 一条差点写成 bug 的观察(先记下来,免得下次又查一遍)

**压缩和体检跑完,库里一块都没多**(32→32)。第一反应是「Gemini 不肯写」——**错的**。

提示词自己写着:「先把这块念给用户听。**他同意之后**,用 add_block 存回」。
**无头跑没人能点头,所以不写才是对的。** 拿 claude 跑同一份提示词,行为**一模一样**
(它也问了「你同意这个方向吗?」),`engineStore.ts:336-345` 那段注释早就把这件事讲清楚了:

> headless, nobody can agree, so writing nothing is **CORRECT**

→ **这一条不是 Gemini 的短板,三个引擎在这里完全一致。** 别再当 bug 查。

### 7.8.4 额度的真实形状(这才是拦路的那一格)

- **免费层 = 每个模型每天 20 次请求。** 报错原文:
  `Quota exceeded for metric: …/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash`
- ⚠️ **是「天」不是「分钟」**:错误里写着 `Please retry in 23s`,**但等了 65 秒、又等了 25 分钟,照样拒**。
  别被那句 retry 骗了。
- ✅ **额度按模型分池**:3.5-flash 空了,3-flash-preview / flash-lite / flash-latest 还能用。
  这是唯一的缓冲,**也是唯一能让这一档勉强活着的东西**。
- ⚠️ **CLI 的重试会自己把额度烧光。** 一次撞限 → 它连着重试 → 20 次用完 →
  它对用户说的是「**You have exhausted your daily quota on this model**」,
  一句**每天只能跑一次半**的真相被说成了「你今天用完了」。
- ⚠️ **单次开销大**:一句 "Reply with exactly: PONG" 也要 **15,502 tokens** ——
  内置系统提示 + 工具定义就这么大。接上 14 个 Spool 工具之后,一次普通跑 25k–53k tokens。
- ⚠️ **`-m` 钉不住模型**:传 `gemini-3.6-flash`,报错回来说的是 `gemini-3.5-flash`。
  **所以「换个模型绕开额度」这条路也不牢靠。**

### 7.8.5 那还做不做?怎么做

**做,但定位要改** —— 不是「默认档」,是「**没有订阅的人的入门档**」。三条落地口径:

1. ⚠️ **别把它设成默认。** §7.4 的选择顺序保持 `claude → codex → gemini`。
   理由和 08-06 撤掉「codex 免费」那句话是同一条:**说了就是把用户往
   「装完发现跑一次半就没了」上引。**
2. ⚠️ **跟进这个动作,在 gemini 档上应当直接不给。** 它是唯一多轮 agentic 的动作,
   实测就是它烧光额度的。给一个必然失败的按钮,比不给这个按钮更伤。
   —— 这跟 §7.5「不为 codex 单独做一套动作」不冲突:那说的是**别做新动作**,
   这说的是**已有动作按引擎能力关掉一个**,和「检测不到就整组不渲染」是同一个安静原则。
3. **设置页那一行要说真话**:一句「免费层每个模型每天约 20 次请求,够压缩和体检,
   不够联网跟进」。⚠️ 按 §7.4 已经定下的规矩,**一句「免费」都不能单独说**。

### 7.8.6 安全上的一格意外收获,和一格必须说出口的退步

- ✅ **比 codex 强的一格**:gemini 的内置 shell / 写文件工具**摘得掉**
  (`tools.exclude`),codex 摘不掉。实测排除后,模型手上只剩 Spool 的 14 个工具
  加几个无害的(`update_topic` / `enter_plan_mode`)。
  ⚠️ **但这个键已被官方标记废弃,1.0 会删** —— 这是一个**有保质期的**安全保证。
- ⚠️ **比两个都弱的一格**:用户自己 `~/.gemini/settings.json` 里的 MCP 服务器
  **拦不住被加载、被起进程**(claude 有 `--strict-mcp-config`,codex 有
  `--ignore-user-config`,gemini 没有对应开关)。
  **能挡住的只是"它的工具进不了模型的工具表"**(`--allowed-mcp-server-names`)。
  → **诚实的说法**:在 gemini 档上,"只有 Spool 的工具"仍然成立;
  "只有 Spool 的进程"**不成立**。§7.3 那张表已经按这个口径改了。

---

⚠️ **这一轮还欠着一件事:模型选择器要在这里装回来。**
2026-08-07 晚 Ocean 拍板把右侧栏的模型选择器**整个撤掉**(`opus` 那个别名是坏的,
全稿 `DESIGN_WORKBENCH.md` §9.13.10),原话「**模型先删掉,但是记录,后续还是要更新回去,
和 Gemini CLI 放一起做**」。理由正好落在这一节:那个选择器是 **claude 专属的半张表**
(`status.selected === 'claude'` 才显示),而第三个引擎逼着「哪个引擎能选哪些模型」
重做成一张完整的表。**底下的线一根没断**(设置键、`ai_engine_run` 的 `model`、
`--model` 都在),要复原的是 `EngineBar.tsx` 里那个 `<select>` 和 `engineStore.ts` 里
那一行硬 `null`。

---

## 7.9 ⭐⭐ 免费档复查(2026-08-11)—— Gemini 的免费入口已经被 Google 关掉了

Ocean 2026-08-11 问的原题:「**目前可以接入的能够符合 spool 所有功能的免费 AI 还有没有**」。
这一节是当天重新查 + 重新实测的结论。⚠️ **§7.8 那一节仍然成立,但它的前提变了** ——
当时以为「免费档 = 额度小」,现在是「免费档的那扇门已经不在了」。

### 7.9.1 实测:这台机器上 gemini 现在根本跑不起来

`~/.gemini/` 里只有 2026-04 的 `oauth_creds.json`,**没有 `settings.json`,没有 `.env`**。
按 §7.3 的配方无头跑一次(隔离 cwd、`GEMINI_CLI_TRUST_WORKSPACE=true`),拿到:

```
exit 41 · stdout 0 字节 · stderr:
{ "error": { "message": "Please set an Auth method in your ~/.gemini/settings.json
  or specify one of the following environment variables before running:
  GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA", "code": 41 } }
```

**这就是 Ocean 那句「压缩 没跑成 / could not read the CLI's JSON output: EOF…」的真身。**
不是额度问题,是**这台机器上 gemini 没有可用的认证**。为什么他看到的是一句 serde 报错
而不是上面这句人话,见 §7.9.4。

### 7.9.2 ⚠️ 「用 Google 账号登录」这条免费路 **2026-06-18 已经被 Google 停掉**

补上 `security.auth.selectedType = "oauth-personal"`(⚠️ 0.54.4 的键是
**`security.auth.selectedType`**,不是老文档里那个扁平的 `selectedAuthType`)之后再跑,
拿到的是这一句:

```
IneligibleTierError: This client is no longer supported for Gemini Code Assist for
individuals. To continue using Gemini, please migrate to the Antigravity suite of
products: https://antigravity.google
```

对得上 Google 自己的公告:**2026-06-18 起 Gemini CLI 与 Gemini Code Assist IDE 扩展
对「AI Pro / Ultra 用户」和「免费使用的个人」全部停止服务**,企业 License 不受影响。
→ **网上那些「1000 次/天」「1500 次/天」的数字全是过期的**,别再拿它们估算。

### 7.9.3 结论表:今天还剩什么

| 档 | 免费? | MCP | 无头 | 能不能跑全部四个动作 |
|---|---|---|---|---|
| **Claude Code** | ❌ 订阅 | ✅ | ✅ | ✅ 四个都行 |
| **Codex** | ❌ 订阅 | ✅ | ✅ | ✅ 四个都行 |
| **Gemini CLI(E3)** | ⚠️ 只剩 **AI Studio API key** 这一条路 | ✅ | ✅ | ❌ 只够 压缩/去重(§7.8 实测 ~20 次/天/模型) |
| **Antigravity CLI**(Google 指定的继任者) | ⚠️ 有免费档,**~20 次/天 Flash**,5 小时滚动刷新 | ✅ 有,但闭源、配置格式全变 | ? 未实测 | ❌ 额度天花板和 E3 一样 |
| **GitHub Copilot CLI** | ✅ 有免费档 | ✅ | ✅ `-p` | ❌ 免费档 **每月 50 次** agent/chat 请求 |
| **Qwen Code** | ❌ 免费 OAuth **2026-04-15 已停** | ✅ | ✅ | ❌ |
| **opencode / Goose 这类自带 provider 的** | 取决于背后接谁 | ✅ | ✅ | ❌ 绕回同一个额度问题,且联网那半仍然没有 |

**答案:没有。** §4-9 记的那条「真正稳定免费又能跑全部四个动作的档仍然不存在」不但还成立,
**缺口还变大了** —— 唯一的免费入口(Google 账号登录)在两个月前关掉了。

⚠️⚠️ **一条要给 Ocean 看的推论**:E3 这个免费档今天只跑得动 **压缩 / 去重**,
而这两个正是他 2026-08-11 亲自判定「没什么用」的两个动作;
他想加强的 **跟进 / 周回顾**,恰好是免费档跑不了的两个。
**所以「往跟进 + 周回顾 走」等于承认 Spool 的 AI 功能是订阅制的。**
这是个产品取舍,不是技术问题,留给他拍板 —— 展开在 `DESIGN_WORKBENCH.md` §11。

### 7.9.4 ⚠️ 顺手修掉的一个真 bug:解析器的抱怨盖住了 CLI 的人话

`run_action` 失败路径上原来写的是 `parse_gemini_envelope(&stdout).err()`,
而那个 `Err` 有**两种**含义:「gemini 说它失败了」和「我读不懂这段」。
stdout 是空的时候返回的是后者,于是 `unwrap_or_else(stderr)` 那条回退**永远轮不到**,
用户看到的是 `EOF while parsing a value at line 1 column 0`,
而真正有用的那句「Please set an Auth method…」被扔了。

两处都改了(`engine.rs`):

1. **信封要在 stdout 和 stderr 两条流上找。** 实测:认证失败时**整个 `-o json` 信封在
   stderr 上,stdout 是空的**;而且信封上面还压着 gemini 自己的两行警告
   (`tools.exclude` 弃用提示、`YOLO mode is enabled`),所以整段直接 parse 一定失败 ——
   `gemini_envelope_value` 先整段试,再从最后一个行首 `{` 起试。
2. **新增 `parse_gemini_error(stdout, stderr)`,只在真读到 `{"error":{"message":…}}` 时
   返回 `Some`。** 读不到就返回 `None`,让调用方回退去显示 CLI 的原始输出 ——
   §2.3「CLI 自己的话最有用」这条规矩靠的就是这个回退。

✅ 三个测试钉住(其中一个是上面那段 stderr 的逐字复刻)。


### 7.9.5 Antigravity CLI 查了(Ocean 2026-08-11 让先查再决定)—— 结论:**不改变答案**

⚠️ **只读了文档,没有装、没有实测。** 这台机器上没装 `agy`,而它的安装方式是
`curl -fsSL https://antigravity.google/cli/install.sh | bash` —— 往用户机器上装东西
要 Ocean 明示。**所以下面每一条都要按 §6.2-ter 打折:文档写的 ≠ 真的**
(75 倍那次教训就在同一个厂商身上)。

| 项 | 查到的 | 对 Spool 意味着什么 |
|---|---|---|
| 额度 | 免费档 **~20 次/天 Flash**,5 小时滚动刷新(第三方博客,非官方) | **天花板和现在一样** —— 跟进/周回顾照样跑不了 |
| 二进制 | `agy` | 引擎检测的 `candidate_paths` 要另写一份 |
| 无头一次性跑 | ⚠️ **官方安装文档只写了 `--version` / `--help` / 交互式 TUI**;有博客说它「默认 YOLO(-y) 以免无头时卡住」 | **Spool 的引擎契约需要 `-p` + 机器可读输出,两样都没查到明文** |
| MCP 配置 | 全局 `~/.gemini/config/mcp_config.json`,或工作区 `.agents/mcp_config.json` | 工作区那条也许能复用 gemini 的临时 cwd 招数;**没有 `--mcp-config` 之类的单次覆盖** |
| 工具限制 | `disabledTools` —— **是一张 DENY 名单** | ⚠️ §2.2 要的是 ALLOW 名单。「只给这 14 个」用 deny 名单**表达不出来** |
| 审批 | 「工具默认是 Ask 模式,执行前要批准」,另有 `mcp(server/*)` 之类的权限模式 | ⚠️ **和今天刚修的 codex 那个 bug 一模一样的形状**:无头没人批 → 静默取消 |
| 源码 | 闭源 | 「翻二进制字符串确认真相」这招(救过这个项目好几次)更难用了 |

**结论:光额度这一条就足够了 —— 20 次/天,和现在一样,所以 Antigravity 不改变 §7.9.3 的答案。**
其余六条只是额外的代价。⚠️ **要真正确认,得装上去跑一次**;要不要装,等 Ocean 一句话。
