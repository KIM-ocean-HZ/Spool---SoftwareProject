# 交接文档 — 2026-07-07（给下一个 Claude agent）

> 由上一会话的 Claude 撰写。你的任务：完成下方「五个任务」。先通读本文件与 CLAUDE.md，
> 需要细节时按指针查 PLAN_EN.md 对应小节（不要整读，见 §18.1.3）。完成全部任务后删除本文件。

## 0. 项目状态快照

- 产品：Spool（思簿）— 长期项目的上下文中枢，Tauri 2 + React 18 + TS + SQLite。macOS 主平台。
- 分支 main；基线全绿：`npx vitest run`（160 测试）、`npx tsc -b`、`cd src-tauri && cargo check` 必须始终保持全绿。
- 近期已落地（均实机验证过）：IME 全局防护（`src/lib/utils/ime.ts`）、CSP、字体打包（OFL，`src/assets/fonts/`）、
  命名式迁移注册表（`src/lib/db/client.ts`，仅主窗口执行迁移+种子）、Pack 范围选择器 + AI 压缩（`PackDialog.tsx`）、
  MCP 服务器（`spool --mcp`，`src-tauri/src/mcp.rs`）、中英文切换（`src/lib/i18n/index.ts`）。
- 发布路线已定：**Developer ID 公证直发 .dmg，不上 Mac App Store**（沙盒与 CGEventTap/私有API 冲突）。步骤见 `docs/RELEASE.md`。

## 1. 硬性规则（违反任何一条都是事故）

1. **git 身份**：绝不在提交/代码/文档中出现 Claude / Anthropic / Co-Authored-By / 🤖 等任何署名。
   每次提交后自检：`git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'` 必须为空。见 CLAUDE.md §5。
2. **绝不添加 LICENSE 文件**（Ocean 2026-07-06 明确指示：许可未定）。
3. **绝不触碰真实数据库** `~/Library/Application Support/com.oceanjin.spool/`（2026-05-29 有误清库事故）。
   实机验证一律用隔离环境（见 §2）。
4. **新依赖需 Ocean 批准**（PLAN §4/§18.3）；本次五个任务原则上零新依赖（任务一可能需要 core-graphics 的既有 crate 内 API，属已批准范围）。
5. **i18n 约定**：所有用户可见文案在调用处写简体中文，经 `t()`/`useT()` 渲染（中文即字典键），
   新文案必须同时在 `src/lib/i18n/index.ts` 的 EN 表补英文词条。组件内注意变量遮蔽（map 参数不要叫 `t`）。
6. **§12 提示词逐字锁定**（summarizeStatus/summarizeDigest/route 不可动）；`compressPack.ts` 是实验提示词，可调。
7. **golden 同步纪律**：改 `src/lib/pack/assemble.ts` 或 `templates.ts` 后，必须
   `GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts` 重新生成期望文件，并同步修改
   `src-tauri/src/mcp.rs` 的 Rust 渲染器直到 `cargo test` 通过（跨语言字节级对拍）。
8. 每个任务独立提交，repo 风格 `fix(scope): ...` / `feat(scope): ...`，提交信息说清 why。

## 2. 实机验证操作手册（已踩坑验证的流程）

- **隔离构建**：把 `src-tauri/tauri.conf.json` 的 identifier 临时改为 `com.oceanjin.spool.verify`
  → `npx tauri build --bundles app` → 数据落在 `~/Library/Application Support/com.oceanjin.spool.verify/`（可预置 settings.json/种子数据）
  → 验证完 `pkill -x spool`、删除 verify 目录、**恢复 identifier 为 `com.oceanjin.spool`**。
- **必须用 `open <path>/Spool.app` 启动**（LaunchServices 给 GUI 会话）；直接跑二进制 WebView 起不来。
  debug 构建加载 devUrl（需 vite dev server），release 构建才嵌 dist——验证前端改动一律用 release bundle。
- 截图：`screencapture -x`（需非沙盒 bash）+ `sips -c 720 1100 --cropOffset 158 730` 裁剪（窗口通常在 730,158 尺寸 1100×720）。
  AX 脚本可驱动 UI（`osascript` System Events），但注意系统中文输入法会拦截合成按键的 Enter。
- **MCP 烟雾测试**（不需要 GUI）：造隔离数据目录（用 `src/lib/db/schema.sql` 建库 + `PRAGMA user_version=5` + 种子行 +
  `echo '{"mcpEnabled":true}' > settings.json`），然后
  `printf '<一行一个JSON-RPC>' | SPOOL_DATA_DIR=<目录> src-tauri/target/debug/spool --mcp`。
  方法序列：initialize → notifications/initialized → tools/list → tools/call。

## 3. 五个任务（按此顺序执行）

### 任务一：双击/长按 ⌥ 在其他应用里无效（最高优先级——这是产品命脉）

**现象**（Ocean 实测）：双击 ⌥ 和长按 ⌥ 只在 Spool 自己的窗口内有效，在其他应用里无反应；
设置里自定义的全局快捷键正常。

**根因（已由代码证实，置信度高）**：`src-tauri/src/double_tap.rs` 用 `CGEventTapOptions::ListenOnly`
创建键盘事件监听，但**从未调用 `CGPreflightListenEventAccess()` / `CGRequestListenEventAccess()`**。
macOS 规则：未获得「输入监听」(Input Monitoring) TCC 授权的 listen-only tap **只收得到本进程的事件**——
这精确解释了"app 内有效、别处无效"。自定义快捷键走 `tauri-plugin-global-shortcut`（Carbon RegisterEventHotKey），
不需要该权限，所以正常。另注意：**开发期每次重编译 ad-hoc 签名变化会使已授予的 TCC 失效**，需重新授权；
Developer ID 正式签名后授权才稳定——测试时留意这点，别把授权失效误判为代码退化。

**要做的**：
1. 在 `double_tap.rs` install 路径里：先 `CGPreflightListenEventAccess()` 探测；未授权则调
   `CGRequestListenEventAccess()` 触发系统弹窗（这两个 API 在 core-graphics crate 的 sys 层，若未暴露可用
   `extern "C"` 声明，链接 CoreGraphics，不算新依赖）。
2. 前端首启引导：未授权时在主窗口显示一条安静的提示条（非弹窗，遵守 §2.5「安静」），说明双击 ⌥ 需要
   「输入监听」权限，附按钮打开系统设置
   （`open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"`），
   授权后自动重建 tap（授权变化通常需要重启 app——如是，提示里写明"授权后请重启 Spool"）。文案走 i18n。
3. **移除 ⌘⇧C**：Ocean 已弃用。范围：
   - `capture.rs`/`lib.rs` 里默认捕捉快捷键的注册改为不注册默认值（settings 里用户自定义过的保留生效）；
   - UI 文案全扫（空状态、README、设置描述里所有 ⌘⇧C 字样——grep `⇧C` 和 `Shift+C`）改为双击 ⌥ 表述；
   - **注意**：⌘⇧C 目前还是收集面板打开时的"直写逃生舱"（§20.9）和 useCapture 里 `viaShortcut` 分支的来源。
     处理：自定义快捷键继续扮演逃生舱角色（payload `true` 逻辑保留），只是不再有默认绑定；
     PLAN §9.4/§10.2/§14.1 对应表述加一行 2026-07-07 修订说明。
   - 设置里的快捷键录制器保留（用户说自定义快捷键没问题）。

**验收**：真机（release bundle + 授权后）在浏览器/备忘录里双击 ⌥ 能捕捉、长按 ⌥ 能开收集面板；
未授权时首启能看到引导条并能跳到系统设置；全 repo 无 ⌘⇧C 残留文案；160+ 测试与 cargo check 全绿。

### 任务二：更换标题衬线字体（Instrument Serif 太窄，不美观）

**现状**：`--font-serif: 'Instrument Serif', 'Songti SC', ...`（tokens.css），字体文件在
`src/assets/fonts/`，@font-face 在 `src/styles/fonts.css`（format 必须写 `truetype`，WebKit 不认
`truetype-variations`）。Instrument Serif 是窄长的展示衬线，Ocean 嫌窄。

**要做的**：从 google/fonts 仓库（OFL）选一款更宽、更优雅的衬线替换，候选（按推荐序）：
**Fraunces**（宽厚有个性，variable）、**Playfair Display**（经典高对比）、**Lora**（稳重耐看）。
下载 ttf + OFL.txt 进 `src/assets/fonts/`（删除 InstrumentSerif 两个文件及其 OFL），更新 fonts.css 的
@font-face（含 italic 轴或单独 italic 文件）、tokens.css 的 `--font-serif` 栈、PLAN §4 字体行与 §13.4。
可以先各出一张实机截图给 Ocean 选，或直接用 Fraunces（Ocean 授权过"自行决定"类审美决策时倾向直接做，
但字体是他点名不满的项——**建议先出对比截图问一次**）。中文部分仍走 Songti 回退，不受影响。

**验收**：实机截图确认 "Spool" 字标与标题观感（宽度、优雅度）明显改善；构建产物含新字体文件；无 CSP 违规（本地加载）。

### 任务三：Thread 显示总字数 + 超长提示

**需求**：每条脉络显示内容总字数；超过阈值时安静提示"内容过多可能导致打包不准确，建议使用打包范围或压缩"。

**建议设计**（遵守 §2.5 安静原则，不要弹窗）：
- 字数=该 thread 全部 block 的 `content.length + (annotation?.length ?? 0)` 之和
  （已开启"加入 Pack"的附件提取文本是否计入：建议计入并在 hover 提示里说明，因为它们真的会进 pack）。
- 展示位置：ThreadHeader 的元信息行（状态胶囊/截止日期那一行）加一个 mono 小字 `{n} 字`；
  超阈值时字变 `--status-parked` 色并追加安静的一句提示（title 或小字），点击可直接打开 PackDialog。
- 阈值：建议 20,000 字符起黄色提示（约对应主流模型可靠处理的粘贴规模），可定义常量并注释理由。
- 全部文案走 i18n（中文键 + EN 词条）。计算放 `useMemo`，blocks 变化时重算（几百块的求和是纳秒级，无性能问题）。

**验收**：打开长 thread 能看到字数；超阈值出现提示；点击提示进入打包对话框；i18n 双语可切。

### 任务四：AI 压缩输出垃圾（41,137 字符 → 700 字符）；Ocean 要求"强制 API"

**根因（已由代码证实）**：`router.quality` 的回退链是 quality(20s超时) → fast(Groq, 5s) → local(qwen3:8b)。
41k 字符的压缩任务：Gemini 20 秒内大概率答不完 → 超时降级 → Groq/本地小模型上下文塞爆，只"看到"截断的
输入，输出 700 字的胡编摘要。且 `PackDialog.handleCompress` 只有"结果不能比原文长"的守卫，**没有下限守卫**。

**要做的**（Ocean 明确要"强制 API"= 压缩只走云端）：
1. `router.ts` 增加一种调用方式（如 `callTier('quality', prompt, { timeoutMs })` 已存在可直用，或加
   `RouteOptions.noFallback`）：压缩**只走 Gemini（quality），失败即失败，绝不回退本地/fast**。
   先例：§20.10 图片 OCR 就是 Gemini-only、无本地回退（"cloud-or-nothing"任务类）。
2. 压缩超时放宽到 ~120s（长输入合理耗时），仅对压缩调用生效（`timeoutMs` 参数已支持）。
3. 加下限守卫：压缩结果 < 原文的 ~15%（或丢失了任何 `note:` 行/无来源行——Personal 是不可压内容，
   可用简单行扫描校验）→ 判定失败，静默禁用按钮（现有 aiState='failed' 路径）。
4. Gemini 不可用（无 key/隐私模式）时压缩按钮隐藏或禁用并提示「压缩需要云端 AI(Gemini)」——不要让它
   静默落到本地小模型。`compressPack.ts` 提示词可一并调优（它不受 §12 锁定）。
5. 若想更稳：超长 pack 分段压缩（只分 Full Record，按块边界切 ~30k/段，逐段压缩后拼回）——可选，先把
   1–4 做扎实，分段作为第二步视效果决定。
6. PLAN §17 pack-compression 行补一句 2026-07-07 修订（Gemini-only + 守卫）。

**验收**：用真实 Gemini key 压缩一个 40k+ 字符 pack：结果保留全部章节骨架与 note:/无来源行、长度合理
（数千至上万字符量级）；无 key 时按钮不可用且提示明确；超时/失败绝不落到本地模型；测试全绿。

### 任务五：MCP 连不上（Server disconnected）+ 一键懒人配置

**现象**：Claude 客户端报 `MCP spool: Server disconnected`；且 Ocean 认为现在"复制 JSON 片段"的配置
方式太复杂，要"下载即用"的一键接入。

**诊断优先（先复现再修）**——按序排查：
1. 看 Claude Desktop 日志：`~/Library/Logs/Claude/mcp-server-spool.log` 与 `mcp.log`，拿到真实报错。
2. 检查 Ocean 的 `~/Library/Application Support/Claude/claude_desktop_config.json` 里 spool 条目的
   command 路径：**高度怀疑是路径失效**——设置面板的片段取自 `current_exe()`，如果当时是 dev/verify 构建，
   路径指向 `target/debug/spool` 或已被清理/重建的 bundle → Claude 一启动 spawn 失败即 disconnected。
   （上一会话多次重建 verify bundle，这是最可能的肇因。）
3. 手动管道测试该 command 路径的二进制（见 §2 烟雾测试），确认协议层本身健康（上一会话验证过 debug 版全通）。
4. 若日志显示协议问题：注意 Claude Desktop 会调 `resources/list`/`prompts/list`，`mcp.rs` 对未知方法
   回 -32601（合规），但可在 initialize 的 capabilities 里保持只声明 tools；必要时对这两个方法返回空列表
   而非错误（一行改动，更保险）。

**一键配置设计**（替换现在的复制片段）：
- 设置 → MCP 区块改为：检测 + 按钮。新增 Rust 命令 `configure_mcp_client(client)`：
  - `claude`：读 `~/Library/Application Support/Claude/claude_desktop_config.json`（不存在则建），
    **先备份**（写 `.bak`），merge `mcpServers.spool = { command: <current_exe>, args: ["--mcp"] }`，写回。
  - `cursor`：同理 `~/.cursor/mcp.json`。
  - 返回状态供 UI 显示（未安装该客户端 / 已配置✓ / 刚写入，请重启客户端）。
- UI：两个按钮「一键接入 Claude」「一键接入 Cursor」+ 状态徽标 + 保留"复制配置"作为高级回退；
  点按钮时若 mcpEnabled 为 OFF 顺手打开它（一次点击完成全部）。文案 i18n。
- **路径稳定性**：写入的 command 用 current_exe；若检测到路径不在 /Applications 下（dev 构建），
  在 UI 上提示"当前是开发构建，安装正式版后需重新接入"。
- 不做静默自动写入（尊重用户系统，按钮=授权动作）；PLAN §20.12 补一段 2026-07-07 修订记录此变更。

**验收**：真机：点「一键接入 Claude」→ 重启 Claude Desktop → `@spool` 工具可见、`list_threads`/`get_pack`
可用（拿隔离数据目录或 Ocean 自己的真库只读验证均可——注意 get_pack 是只读，连真库安全，但**别写**）；
配置文件有 .bak 备份；旧 disconnected 根因在提交信息里写明。

## 4. 其他背景（按需使用）

- 撤销环/合并/收集/搜索导航等交互契约详见 PLAN §9.13/§20.1/§20.9/§9.10；改动它们前先读对应小节。
- `window.__spool` 暴露了各 store（App.tsx），实机调试可用。
- 上一会话的多代理 code-review 因会话额度耗尽未跑成；五个任务完成后建议补一轮 `/code-review high`。
- 完成后：更新本文件为已完成状态或直接删除，并在 PLAN 尾注追加一行修订记录。
