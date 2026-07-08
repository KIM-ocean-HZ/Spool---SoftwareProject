# 交接文档 — 2026-07-08 晚（给下一个会话）

> 由上一会话撰写。三个任务按序做：①修复"已授权输入监听却仍不生效 + 引导条不消失"；
> ②全面 bug 检查；③深化 strong-MCP 路线。完成后删除本文件。
> 先读 CLAUDE.md 与 memory（isolated-verify-workflow 手册必读——实机验证/探针/抓日志技巧都在里面）。

## 0. 状态快照

- main @ `11b321f`，基线全绿：`npx vitest run`（161）、`npx tsc -b`、`cd src-tauri && cargo test`（5）。
- `/Applications/Spool.app` = 2026-07-08 含全部修复的构建（**ad-hoc 签名**，这是任务一的核心背景）。
- Claude Desktop 的 MCP 配置指向 `/Applications/Spool.app/Contents/MacOS/spool`（路径稳定，binary 原地更新）。
- 近两日已落地：Input Monitoring preflight+引导条、⌘⇧C 退役、Fraunces、字数提示、压缩 Gemini-only+守卫、
  MCP 一键接入、快捷键清除按钮、copy-gate（⌘C 10s 内双击 ⌥ 才捕捉）、MCP 写工具（§20.13 v1：
  create_thread / add_block / compress_pack prompt / mcpWriteEnabled 开关 / GUI 焦点刷新）。
- 用户数据目录是 2026-07-08 13:51 用户自己重置后的新库（schema v5）——**内容虽少但用户在用，动手前
  先 `VACUUM INTO` 备份一次**（手册有命令）。旧 settings 没了：Gemini key 需用户重填。

## 1. 硬规则（同前，违反即事故）

1. git 提交/代码/文档**绝不出现任何 AI 署名**（Claude/Anthropic/Co-Authored-By/🤖…）。每次提交后自检：
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空
   （提交信息里作为第三方产品名出现的 "Claude Desktop" 属产品内容，允许；除此之外一律不行）。
2. 绝不添加 LICENSE；新依赖需 Ocean 批准（本批任务原则上零新依赖）。
3. 真库 `~/Library/Application Support/com.oceanjin.spool/` 只读诊断可以，写入/清理绝不做；实机验证用
   隔离 identifier 流程（memory 手册 §1）。
4. i18n：中文即字典键，新文案同时补 `src/lib/i18n/index.ts` 的 EN 词条。
5. §12 提示词逐字锁定（summarizeStatus/summarizeDigest/route）；compressPack.ts 与 mcp.rs 的
   compress_prompt_text 是姊妹提示词（语义同步，见代码注释），可调但要一起调。
6. 改 `assemble.ts`/`templates.ts` 必须重新生成 golden 并同步 mcp.rs Rust 渲染器到 `cargo test` 全绿。
7. 每任务独立提交，`fix(scope):` / `feat(scope):`，说清 why。

## 2. 任务一（最高优先级）：已授权输入监听，但仍然无效 + 引导条不消失

**现象**（Ocean 实测，2026-07-08 晚）：系统设置里已授予输入监听，但（a）长按 ⌥ / ⌘C 后双击 ⌥
仍只在 Spool 自己窗口内有效；（b）主窗口顶部引导条一直停在"打开系统设置"态，不翻转、不消失。

**关键线索**：引导条的状态来自 `input_monitoring_granted` 命令 → `CGPreflightListenEventAccess()`。
它仍显示未授权态 = **preflight 在当前运行的 app 里返回 false**——这不是 UI bug，是授权真的没有
落到这个二进制上。两个候选根因，按序排查：

1. **TCC 授权绑定代码签名（csreq）**。ad-hoc 构建每次重编译 CDHash 都变；系统设置里那个 "Spool"
   条目很可能登记的是**旧签名**的构建——开关看着是开的，但对现在这个二进制无效。验证方法（手册 §8）：
   `pkill -x spool; open --stderr /tmp/spool-err.log /Applications/Spool.app`，看
   `[double-tap] Input Monitoring …` 行：若系统设置显示已开而日志 `granted=false`，即此根因。
2. **没有完全退出**。关窗口只是 hide（app 常驻 tray）；preflight 结果在旧进程里可能不刷新。
   完全退出 = tray 菜单 → 退出 Spool，再启动。

**要做的**：
1. 先复现取证（stderr 日志），确定是根因 1 还是 2。
2. 立即可用的用户侧修复路径（验证后写成操作指引给 Ocean，并考虑放进引导条/文档）：
   系统设置 → 隐私与安全性 → 输入监听 → 用 − 删除旧 "Spool" 条目 → 完全退出并重启 Spool →
   响应新的系统弹窗授权 → 再次完全退出重启。（`tccutil reset ListenEvent` 是全量重置的备选，
   会波及其它 app 的授权，慎用并告知。）
3. **治本：稳定签名身份**，让授权跨重建存活。tauri.conf.json → `bundle.macOS.signingIdentity`：
   优先方案是本机自签证书（Keychain Access 创建 code-signing 证书，如 "Spool Dev"），dev/内部构建
   统一用它签；正式发布走 RELEASE.md 既定的 Developer ID。落地后在 docs/RELEASE.md 记一段
   "开发期签名与 TCC" 说明。零新依赖，属配置改动。
4. **产品侧韧性**（视排查结果取舍）：
   - 引导条现在只在窗口 focus 时重查；若证实"授权后运行中的进程 preflight 不翻转"，把文案改成
     明确的"完全退出（托盘菜单 → 退出）并重启"，避免用户以为关窗口=重启；可加一个"重新检测"按钮。
   - 若证实是 csreq 陈旧，引导条可加一句"若已授权仍看到本条：请在系统设置删除旧的 Spool 条目后重试"。
5. 授权成功后，**补测 copy-gate 的 T2 场景**（上次因未授权无法测）：授权后 tap 能看到 keyDown，
   合成 ⌘C → 双击 ⌥ 应 TRIGGER；裸双击应 IGNORED。探针写法照 memory 手册 §7（20 行 C，
   `clang -framework ApplicationServices`，必须 `CGEventSetTimestamp(..., CLOCK_UPTIME_RAW)`）。

**验收**：授权+完全重启后 stderr `granted=true`；引导条消失；在浏览器/备忘录里 ⌘C→双击 ⌥ 能捕捉、
长按 ⌥ 出收集面板、裸双击不触发 Spool（Claude 弹窗独享该手势——它自己弹是预期，不是 bug）；
重编译一次后授权仍然有效（稳定签名生效的证明）。

## 3. 任务二：全面 bug 检查

- 跑 `/code-review high`，范围覆盖 `efe6efa..HEAD`（近两日全部改动）。重点关注：
  double_tap.rs 的原子状态机（copy-gate 加入后 press_id/时间戳交互）、capture.rs `set_shortcuts`
  的 Option 化注册/回滚路径、PackDialog 压缩守卫（compressionKeepsPersonal 的正则边界）、
  mcp.rs 写路径（两进程并发、SQL 参数化、错误信息）、GeneralConfig 的多状态 UI。
- 确认发现后逐项修复、独立提交；不确定的发现列出来给 Ocean。

## 4. 任务三：深化 strong-MCP（§20.13 v2 —— 先设计，扩张范围问过 Ocean 再实现）

Ocean 的愿景（2026-07-08 原话意译）：在第三方平台顺利使用 Spool；GUI 更像"浏览/策展器"；
用户在 Claude 聊天中检索信息，Claude 直接读取 thread 并加工、写回。v1（已建）只有
create_thread/add_block/compress prompt。v2 设计要回答"还差哪些接口才能闭环"：

- **检索**：`search_blocks(query)` —— §9.10 已有 FTS 实现，评估能否在 mcp.rs 复用同一 SQL；
  这是"在网上快速提取信息→找到该放哪条 thread"的关键一环。
- **读元数据**：get_pack 太重的场景（客户端只想看列表/摘要）是否需要 `get_thread_meta`。
- **状态操作**：`update_thread_status`（active/parked/done）——已是"修改用户数据"，宪法边界
  （Principle 5：策展属于用户）需要论证，倾向不做或只做 Ocean 明确点头的子集。
- **AI 自纠**：允许 AI 更新**自己写入的块**（source 含 "· MCP" 的块）？"只增不改"的例外口子，
  要论证清楚再动。
- **MCP resources**：把 threads 暴露为 resources（客户端 @-mention 原生体验）+ listChanged 通知；
  评估 Claude Desktop 对 resources 的实际支持程度再决定。
- **配套**：AI 写入的 GUI 安静提示（角标/侧栏小点？遵守 §2.5）；写入审计（block 已有 source，
  是否够）；undo 集成（v1 明确接受不进 undo ring，v2 重新评估）。
- 产出：PLAN §20.13 v2 修订（含取舍论证与 kill 标准更新）+ 实现获批的最小集 + MCP 烟雾测试覆盖。

## 5. 完成后

全绿（vitest/tsc/cargo test）→ PLAN 尾注追加 2026-07-08 晚批次 → 删除本文件 → 总结
（任务一根因必须写清是 csreq 还是重启问题，以及稳定签名是否生效）。
