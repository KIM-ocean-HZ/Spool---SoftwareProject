# Windows 移植调查（2026-08-13）

> 状态：调查报告；未实现、未编译 Windows、未改产品代码。
>
> 审计对象：`src/**`、`src-tauri/src/**`、`src-tauri/Cargo.toml`、
> `src-tauri/tauri.conf.json`，以及现有 `docs/DESIGN_WINDOWS_PORT.md`。
>
> 外部资料查询日：**2026-08-13**。外部事实只采用 Microsoft、Tauri、
> Anthropic、OpenAI、Google、VS Code 的官方一手资料，直接链接见正文和 §8。

## 0. 结论先行

当前代码不是“Windows 能编译，只是没有双击 Option 手势”。至少有两个直接的 Windows
编译阻断项：`capture.rs` 在 Windows 下没有导入 `Mutex`，却无条件声明了一个 `Mutex`
静态量；`mcp.rs` 无条件调用 Unix 扩展 `localtime_r`、`gmtime_r`、`timegm`，并调用
`mktime`。此外，即使只修到能编译，Windows 首次启动也没有默认捕捉入口，Engine 的取消/
超时不能终止进程树，前台来源、浮窗抢焦点与还焦点、MCP 一键接入、客户端拉前、Windows
路径脱敏和平台文案都未完成。

因此建议的顺序不是先做安装包，而是：

1. 先拍板首版边界、Windows 最低版本/架构、分发和签名主体；
2. 在真实 Windows MSVC 环境拿下编译、测试与路径/时间语义；
3. 做一个不依赖低级键盘钩子的可用捕捉闭环；
4. 用 Job Object 完成 Engine 全进程树取消后，才在 Windows 开放 Engine；
5. 完成 MCP 客户端真机矩阵，再做签名安装包和干净机发布验收；
6. 双击 Alt 与全局 click-outside 只作为后续可选实验，不作为首版门槛。

这不是兼容层方案。每个平台专属面都应采用 `cfg(target_os = "windows")` 下的 Windows
原生实现，并由一个小的内部平台接口向共同业务逻辑提供相同语义；不引入 Wine、WSL、
POSIX 模拟层或把 Unix 命令偷偷带进 Windows 发行版。

---

## 1. 范围、证据和分类规则

### 1.1 本次实际检查

- 完整阅读 `CLAUDE.md`、`docs/HANDOFF-CODEX.md` 的 §0-next.5 和
  `docs/DESIGN_WINDOWS_PORT.md`。
- 枚举并扫描 `src/**` 与 `src-tauri/src/**` 的 180 个项目文件；另查
  `Cargo.toml`、`Cargo.lock` 和 Tauri 配置。`src-tauri/target/**` 与
  `src-tauri/gen/**` 是生成/构建产物，不作为源码事实源。
- 搜索全部 `cfg`、`libc` 调用、子进程创建、环境变量、绝对 Unix 路径、Apple 框架 FFI、
  `osascript`/`open`/`explorer`、Mac 键帽和平台权限文案。
- 核对本机锁定的 `libc 0.2.186` Windows 模块：没有本代码调用的
  `localtime_r`、`gmtime_r`、`timegm`、`mktime` 声明。
- 核对本机锁定的 `tauri-plugin-sql 2.4.0` 与 `tauri 2.11.0` 路径解析源码，区分
  Windows 的 Roaming AppData 与 Local AppData，未仅凭仓库注释推测 SQLite 位置。
- 记录本机工具链：只有 `aarch64-apple-darwin` Rust target；因此没有把 macOS
  交叉检查冒充 Windows 构建或真机结果。

### 1.2 四类信息的含义

- **仓库已知事实**：能直接从当前仓库代码、配置或本机依赖源码验证。
- **当前外部事实**：截至查询日，官方文档明确承诺或限制的行为。
- **推论**：把仓库事实与平台事实组合后得到的判断；没有冒充实测。
- **建议**：待 Ocean 拍板或后续实现、测试的方案。

后文保持这四类分开。任何“能在 Windows 上工作”的句子，只有经过真实 Windows 环境
验证后才能从“推论/建议”升级为“已知事实”。

---

## 2. 仓库已知事实

### 2.1 直接编译与测试阻断

| 严重度 | 位置 | 当前代码事实 | Windows 影响 |
| --- | --- | --- | --- |
| Blocker | `src-tauri/src/capture.rs:2-6,757` | `std::sync::Mutex` 的 import 只在 `target_os = "macos"` 下存在，但 `RESTORE_FOCUS_APP: Mutex<Option<String>>` 无条件编译 | Windows 名称解析失败 |
| Blocker | `src-tauri/src/mcp.rs:405-478,2070-2078` | 无 OS gate 调用 `libc::localtime_r`、`gmtime_r`、`timegm`、`mktime` | 锁定的 `libc 0.2.186` Windows 模块没有声明这四个函数；当前实现不能直接编译 |
| Runtime blocker | `src-tauri/src/mcp.rs:3371-3380` | `new_id()` 无 OS gate，固定从 `/dev/urandom` 读取 21 bytes | Windows 没有这个设备路径；MCP `create_thread`/`add_block` 到生成 ID 时会报“随机源不可用”，所以读通不等于写通 |
| Test blocker | `src-tauri/src/engine.rs:2085-2132` | 多个未加 Windows gate 的测试启动 `/bin/sh`，并用 `sleep`、`head`、`tr`、`/dev/zero` | 测试代码本身可编译，但在 Windows 运行必然找不到这些 Unix 程序/设备，不能形成 Windows 绿灯 |
| Test blocker | `src-tauri/src/engine.rs:1582-1593` | `candidate_paths_cover_the_version_managed_install_dirs` 无平台 gate，依赖 `HOME` 并断言存在 `.local/bin` 与 `/opt/homebrew/bin` 候选 | Windows runner 通常不提供这组 Unix home/安装路径语义；即使产品检测改好，测试也必须按平台重写 |
| Coverage gap | `src-tauri/src/engine.rs:2138-2160` | 唯一验证“取消会带走孙进程”的测试仅 `#[cfg(unix)]` | 最关键的 Windows 进程安全性质完全没有测试 |

这两项源码阻断已经推翻 `docs/DESIGN_WINDOWS_PORT.md` 中“双击模块 gated，所以 Windows
能编译”的旧结论。旧文在 2026-08-03 复核后，代码又继续演进；它可以保留为历史决策背景，
不能再作为当前可编译证据。

### 2.2 捕捉手势、全局快捷键和权限

| 面 | 当前仓库事实 |
| --- | --- |
| 双击 Option | `src-tauri/src/double_tap.rs` 整个模块是 macOS-only。它用 CGEventTap/CoreGraphics/ApplicationServices 监听 flags、鼠标和复制/剪切上下文，识别双击 ⌥，必要时抑制第二个 Alt 事件，并承担 click-outside 监听。安装点 `src-tauri/src/lib.rs:550-555` 也只在 macOS 编译。 |
| 权限 | `input_monitoring_granted`、`accessibility_granted`、`request_capture_access` 在非 macOS 分支返回成功/`true`；这只是“无需 macOS TCC 权限”的占位语义，不代表 Windows 捕捉、来源或焦点能力已实现。 |
| 可用的跨平台基础 | `tauri-plugin-global-shortcut` 已接入。`capture.rs:398-489` 能解析并动态注册用户快捷键；搜索在非 macOS 用 Ctrl+Shift+F，撤销用 Ctrl+Z。 |
| 首次启动默认值 | `src/stores/settingsStore.ts:32-35` 和 `src/lib/capture/shortcut.ts:1-16` 明确把 `captureShortcut` 默认设为 `null`，理由是 macOS 依赖双击 ⌥。Windows 没有双击模块，也没有默认捕捉 chord。 |
| 键帽显示 | `src/lib/capture/shortcut.ts:34-71` 无条件把 Meta/Control/Alt/Shift 格式化为 `⌘⌃⌥⇧`；Windows 即使成功注册 Ctrl/Alt，界面仍会显示 Mac 键帽。 |
| 用户文案 | `PermissionBanner`、`Settings/ShortcutConfig`、`ThreadView/BlockFeed`、`ThreadHeader`、`Sidebar`、`Search/InBlockNavigator`、`ProjectBoard`、`mcp/ClientMenu`、`overlay/CaptureOverlay`、`useCapture`、数据库 welcome seed 和 `i18n` 中存在大量 `⌘`、`⌥`、Input Monitoring、Accessibility、Automation、Safari 文案。多数键盘事件逻辑已用 `metaKey || ctrlKey`，但说明和可见标签不是平台化的。 |
| 设置页 | `Settings/AdvancedConfig.tsx` 无条件渲染 macOS 专属 `BrowserAutomation`；Windows 会看到 Safari/Automation 权限行，调用后只得到“仅 macOS 需要授权”的失败。 |

### 2.3 前台来源、AX、焦点与浮窗

| 面 | 当前仓库事实 |
| --- | --- |
| 前台来源 | `capture.rs:50-87` 的 `get_foreground_app()` 在非 macOS 直接返回 `None`。macOS 分支用 `osascript` 取前台进程，再为 Safari/Chromium allowlist 读活动标签页标题。 |
| AX 焦点 | `capture.rs:821-915` 直接链接 ApplicationServices，使用 `AXFocusedApplication` 和 `AXFrontmost`，按 PID 获取/切换前台应用；全部是 macOS-only。 |
| 焦点缓存 | `RESTORE_FOCUS_APP` 无条件声明但只在 macOS 路径读写；PID stash、cache 和激活开关均为 macOS-only。 |
| 浮窗进程 | `overlay.rs:95-161` 从当前可执行文件启动第二个 `spool --overlay` 进程；`main.rs:11-17` 在进入 Tauri 主程序前分流。该思路本身没有硬编码 macOS 可执行路径。 |
| 浮窗属性 | helper 窗口是透明、无装饰、置顶、跳过任务栏、初始 `focused(false)`；但“shown 后夺焦点、hide 前还焦点、hide 后退让前台”只在 macOS 实现。`on_overlay_shown()` 在 Windows 无动作；`on_overlay_hide()` 在 Windows 只隐藏。 |
| click-outside | 捕捉卡和撤销卡的 click-outside 依赖 `double_tap::arm_overlay_dismiss`，调用点仅 macOS；Windows 没有等价行为。 |
| 可编辑性冲突 | 当前 note-first 设计要求捕捉卡出现后键盘立即进入备注框。一个永久“不激活”的 Windows 窗口无法同时兑现这个目标；仓库当前没有定义 Windows 的降级交互。 |

### 2.4 打开目标、拉前客户端和系统设置

| 位置 | 当前仓库事实 |
| --- | --- |
| `capture.rs:584-614` | 打开文件/文件夹/URL 在 Windows 已有 `explorer <target>` 分支；不是 shell 拼串，但仍是外部进程约定。 |
| `lib.rs:223-248` | 打开 MCP 客户端下载页只在 macOS 执行 `open <url>`；Windows 返回 `macOS only`。 |
| `lib.rs:270-300` | 把 MCP 客户端拉前只在 macOS 执行 `open -a <app>`；Windows 返回 `macOS only`。 |
| `lib.rs:315-328` | 打开 Input Monitoring 设置只支持 Apple settings URL；Windows 应隐藏这条产品路径，而不是寻找伪等价设置页。 |

### 2.5 Engine 子进程、取消和环境

| 面 | 当前仓库事实 |
| --- | --- |
| Unix 进程组 | `engine.rs:226-264,1363-1379` 在 Unix spawn 前执行 `setpgid(0,0)`，把 child PID 当 PGID；取消时 `kill(-pgid, SIGTERM)`，150 ms 后 `SIGKILL`。 |
| Windows 取消 | `kill_group()` 的 non-Unix 分支是空操作。超时路径随后会 `child.kill()`，但用户主动取消没有对应的 child kill；即使父进程被杀，也没有终止孙进程的保证。 |
| 风险为何高 | 代码注释和 Unix 测试明确把 `spool --mcp` 孙进程纳入安全目标，因为孤儿 MCP 进程会继续持有 SQLite 库。Windows 当前没有实现这个不变量。 |
| 状态类型 | 全局状态是 `AtomicI32` PGID；Windows 需要管理 HANDLE 生命周期，这个类型不能表达 Windows 的原生进程树所有权。 |
| CLI 发现 | `candidate_paths()` 只列 `$HOME/.claude/local/claude`、Unix dot-bin、nvm、Homebrew 和 `/usr/local`/`/usr/bin`；fallback 固定执行 `/usr/bin/which`。Windows 找不到任何 `.exe`/`.cmd`。 |
| HOME | `dirs_home()` 只读取 `HOME`。 |
| 运行环境 | Engine 先 `env_clear()`，再只传 `PATH`、`HOME`、`USER`，以及少数 provider 变量。`USER` 的注释针对 macOS Keychain。Windows 常用的 `USERPROFILE`、`USERNAME`、`APPDATA`、`LOCALAPPDATA`、`SystemRoot`、`ComSpec`、`PATHEXT`、`TEMP`/`TMP` 没有传入。 |
| Windows 子系统 | `main.rs:1` 的 release build 使用 `windows_subsystem = "windows"`；`spool.exe --mcp` 仍在 Tauri 之前走 stdio server，但必须在真实客户端中验证继承管道且不弹 console。 |

### 2.6 MCP 数据目录和一键接入

| 面 | 当前仓库事实 |
| --- | --- |
| 数据目录基础 | `mcp.rs:1094-1116` 已有 Windows 分支：`%APPDATA%/com.oceanjin.spool`。锁定的 `tauri-plugin-sql 2.4.0` 把相对 SQLite URL 映射到 `app_config_dir()`；锁定的 Tauri 2.11.0 在 Windows 把它映射到 Roaming AppData，所以设计上与 `%APPDATA%` 对齐。`lib.rs:495-501` 另行预建的是 Local AppData，注释与 plugin 实际目录不一致，但 plugin 会自行创建 config dir。最终仍需 Windows 真机核对。 |
| 客户端配置 | `mcp.rs:6295-6337` 的 `client_config_paths()` 无 OS gate，先强制读取 `HOME`，并硬编码 `Library/Application Support/Claude`、`Library/Application Support/Code` 和 Unix dot-path。Windows 一键接入会误判或写错位置。 |
| 客户端指导文件 | `mcp.rs:6523-6530` 的 `client_guidance_path()` 同样只读取 `HOME`，再写 `.codex/AGENTS.md` 或 `.claude/CLAUDE.md`。即使配置注册另行修好，Windows 未提供 `HOME` 时这一步仍会静默跳过；不能把“接入成功”推论成指导文件已经生效。 |
| 客户端范围 | 当前 allowlist 包含 Claude Desktop/Code、Cursor、VS Code、Windsurf、Codex；不同客户端共用一套基于路径猜测的 merge 逻辑。没有 Windows profile、商店版路径、安装类型或命令行注册测试。 |
| stdio 命令 | 一键接入会把当前 executable 和 `--mcp` 写给客户端。安装后绝对 `spool.exe` 路径是否能被各客户端启动、升级后是否 stale、空格/Unicode 路径是否安全，尚无 Windows 证据。 |

### 2.7 时间、路径和可外发 Pack

| 面 | 当前仓库事实 |
| --- | --- |
| 时间 | Rust MCP server 直接用 Unix libc 的 local/UTC 转换和 `mktime` 做 Pack 时间、日期解析和 digest 窗口；TS 前端用 JS `Date`。两份实现有同步约束。 |
| Windows 路径脱敏 | `src/lib/pack/assemble.ts:153-165` 和 `mcp.rs:489-504` 的 basename 只识别 `/`。`C:\Users\Ocean\Secret\file.pdf` 在 Windows 会原样进入 Pack，而注释宣称本地路径只外发文件名。 |
| 已有可复用例子 | `src/lib/utils/openTarget.ts` 已同时识别 `/` 与 `\\`，证明前端已有处理双分隔符的局部做法，但 Pack 的 TS/Rust twin 没有采用。 |

Windows 路径问题不是“美化”：Pack 是明确会被粘贴到外部 AI 的产物，所以完整用户目录泄漏应视为
公开 beta 前的隐私阻断项。

### 2.8 Tauri 配置、托盘与打包

| 面 | 当前仓库事实 |
| --- | --- |
| Cargo | macOS CoreGraphics/CoreFoundation 依赖已经按 target gate；但通用 Tauri feature 含 `macos-private-api`。 |
| Tauri config | `app.macOSPrivateApi: true` 和 `bundle.macOS.signingIdentity` 写在通用配置；`bundle.targets` 是 `"all"`；没有 `bundle.windows` 签名、安装器或 WebView2 策略。现有设计稿所说“`bundle.windows` 是空 `{}`”也已不符合当前文件——当前是根本没有该字段。 |
| 图标 | bundle 已包含 `.ico`，这是现成资产，不等于安装器/托盘在 Windows 已验收。 |
| 托盘 | `TrayIconBuilder.icon_as_template(true)` 是 macOS 模板图语义；Windows 图标呈现、菜单、close-to-tray、single-instance 尚未真机验证。 |
| 自启动 | 代码用 Tauri autostart plugin，并传 `MacosLauncher::LaunchAgent`。插件本身有 Windows 后端，但当前调用只从 macOS 运行过，需 smoke test。 |

---

## 3. 当前外部事实（官方资料，查询于 2026-08-13）

### 3.1 输入与全局快捷键

1. Win32 `RegisterHotKey` 定义系统级组合快捷键，通过 `WM_HOTKEY` 投递；组合可含 Alt、Ctrl、
   Shift，Windows 键组合保留给操作系统。Tauri 的 global-shortcut plugin 官方支持 Windows。
   [Microsoft RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey)，
   [Tauri Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/)
2. 捕捉单独 Alt 的按下/抬起和选择性吞键需要低级键盘事件面，例如
   `SetWindowsHookExW(WH_KEYBOARD_LL)`；全局鼠标 click-outside 则对应
   `WH_MOUSE_LL`。这类 hook 需要消息循环，是全局共享资源，应尽快调用下一 hook。
   [SetWindowsHookExW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexw)
3. `LowLevelKeyboardProc` 官方要求 callback 在 hook timeout 内返回；Windows 7 及以后超时会静默
   移除 hook，Windows 10 1709 以后 timeout 上限为 1000 ms。官方建议若必须使用，放在专用线程、
   立即把工作移交 worker；多数只需监控的场景优先 Raw Input。
   [LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)

这些是可用机制，不是“双击 Alt 应该做”的产品结论。

### 3.2 前台窗口、来源、激活与打开目标

1. Windows 原生链路可从 `GetForegroundWindow` 得 HWND，以
   `GetWindowThreadProcessId` 得 PID，用最小权限 `OpenProcess` 和
   `QueryFullProcessImageNameW` 取得 executable；`GetWindowTextW` 可读 top-level
   caption。它们能提供“窗口/进程来源”，不自动等价于浏览器活动标签页。
   [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)，
   [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid)，
   [OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess)，
   [QueryFullProcessImageNameW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-queryfullprocessimagenamew)，
   [GetWindowTextW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw)
2. `SetForegroundWindow` 明确受前台锁和用户最后输入等条件限制；即便条件看似满足也可能被拒绝。
   官方明确说应用不能在用户操作别的窗口时强行拉前，只能由系统闪烁任务栏提示。
   [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
3. `SetWindowPos` 的 `SWP_NOACTIVATE` 可以显示/定位窗口而不激活；这是 notice/undo 卡的原生工具，
   但不可拿来承诺可编辑 note box 会自动获得键盘。
   [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
4. `ShellExecuteW` 的 `open` verb 可打开文件或文件夹，并按 Shell 注册的 verb/handler 分派；
   `ShellExecuteExW` 可在适用时取得被启动应用的信息。
   [ShellExecuteW](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecutew)

### 3.3 进程树和取消

1. Job Object 用于把多个进程作为一个单元管理；默认情况下，被加入 job 的进程所创建的 children
   也进入同一 job。`TerminateJobObject` 可结束 job 中全部进程。
2. `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 能在最后一个 job HANDLE 关闭时结束全部关联进程；
   `CreateJobObjectW`、`SetInformationJobObject`、`AssignProcessToJobObject` 和
   `TerminateJobObject` 是直接的 Windows 原生组合。
3. 官方流程把“创建空 job”和“把 process assign 进去”分成两步；只有 process 已关联后，默认 child
   才继承 job。官方还记录了 already-in-job、nested job、access rights 和 suspended process 等约束。

来源：[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)，
[CreateJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw)，
[SetInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-setinformationjobobject)，
[AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)，
[TerminateJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-terminatejobobject)。

### 3.4 Windows CRT 时间接口

MSVC/UCRT 的原生 64-bit 对应面是 `_localtime64_s`、`_gmtime64_s`、`_mkgmtime64`、
`_mktime64`。前两个 `_s` 函数的 Microsoft signature 和 Unix `_r`/C 标准变体不相同，且会返回
错误码；`_mkgmtime64` 把 UTC `tm` 转 epoch，`_mktime64` 处理本地时间/DST。

来源：[_localtime64_s](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/localtime-s-localtime32-s-localtime64-s?view=msvc-170)，
[_gmtime64_s](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/gmtime-s-gmtime32-s-gmtime64-s?view=msvc-170)，
[_mkgmtime64](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/mkgmtime-mkgmtime32-mkgmtime64?view=msvc-170)，
[_mktime64](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/mktime-mktime32-mktime64?view=msvc-170)。

### 3.5 Windows 安全随机数

Microsoft 当前安全 API 指南要求用 CNG `BCryptGenRandom`，而不是非密码学 PRNG；传
`BCRYPT_USE_SYSTEM_PREFERRED_RNG` 时可使用系统首选随机源而无需自行管理 algorithm handle。
函数返回状态码，调用方必须检查失败。

来源：[BCryptGenRandom](https://learn.microsoft.com/en-us/windows/win32/api/bcrypt/nf-bcrypt-bcryptgenrandom)，
[Microsoft Security API best practices](https://learn.microsoft.com/en-us/windows/win32/secbp/best-practices-for-the-security-apis)。

### 3.6 CLI 与 MCP 的当前官方入口

1. Claude Code 官方支持 native Windows 和 WSL；native 安装可通过 PowerShell/CMD 或 WinGet，
   native installer 的卸载路径显示 executable 位于
   `%USERPROFILE%\.local\bin\claude.exe`。官方 MCP CLI 支持
   `claude mcp add ... -- <command> [args...]`，user scope 存在 `~/.claude.json`。
   [Claude Code installation](https://code.claude.com/docs/en/installation)，
   [Claude Code MCP](https://code.claude.com/docs/en/mcp)
2. VS Code 官方支持 `code --add-mcp <json>` 写入 user profile，也支持“Open User
   Configuration”；多个 VS Code profile 各自拥有 MCP 配置，不能假定一个固定全局文件覆盖全部用户。
   [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)，
   [VS Code Profiles](https://code.visualstudio.com/docs/configure/profiles)
3. Gemini CLI 官方系统需求是 Node.js 20+，支持 Windows；官方有
   `gemini mcp add`，user/project scope 分别写用户或项目 settings。
   [Gemini CLI](https://google-gemini.github.io/gemini-cli/)，
   [Gemini MCP](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)
4. Codex CLI 当前官方页提供 Windows 安装选项、`codex mcp` 与本地 CLI 工作流，但本调查没有据此
   猜测一个固定 Windows 安装路径；应以用户机器上实际解析到的 executable 和官方命令为准。
   [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)

### 3.7 Tauri Windows 构建、安装器和 WebView2

1. Tauri Windows 开发要求 Microsoft C++ Build Tools（勾选 Desktop development with C++）和
   WebView2；Rust 应使用 MSVC host target。MSI 构建还需要 Windows 的 VBSCRIPT optional feature。
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
2. Tauri Windows 输出支持 WiX `.msi` 与 NSIS `-setup.exe`；MSI 只能在 Windows 创建。
   NSIS 可从 macOS/Linux 交叉构建，但 Tauri 明确说 caveat 多、测试少，只应在 Windows VM/CI 不可用时
   作为最后手段。
   [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
3. WebView2 安装策略必须显式决定。默认 `downloadBootstrapper` 需要联网且不增加 installer 体积；
   `offlineInstaller` 约增加 127 MB；`skip` 不推荐。现代 Windows 通常已有 runtime，但干净机/
   离线机仍要测试。
4. Tauri 支持 `tauri.windows.conf.json` 和 `tauri.macos.conf.json` 与通用配置 merge，适合隔离
   `macOSPrivateApi`、Mac signing identity 和 Windows bundle/signing 字段。
   [Tauri platform-specific configuration](https://v2.tauri.app/develop/configuration-files/)
5. Tauri 的 global-shortcut 和 autostart plugins 官方平台表都包含 Windows；这证明有支持面，
   不证明本仓库当前配置和行为已通过 Windows 验证。
   [Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/)，
   [Autostart](https://v2.tauri.app/plugin/autostart/)

### 3.8 代码签名与 SmartScreen（这里以 Microsoft 2026 文档为准）

1. Microsoft 2026-04-21 的比较页与 2026-05-06 的 SmartScreen 页明确：OV、EV、Azure
   Artifact Signing 的新文件都可能先显示 SmartScreen；EV 自 2024 起不再首发绕过。
2. Azure Trusted Signing 已改名 **Artifact Signing**。Basic 为 $9.99/月、每月 5,000 次签名；
   需要付费 Azure subscription 和身份验证，不需要 USB token。组织当前仅美国、加拿大、欧盟、英国
   可用；个人仅美国、加拿大可用。
3. 传统 OV 是无法使用 Artifact Signing 时的可选项；CA/Browser Forum 自 2023-06 起要求公开
   代码签名私钥存于合规硬件 token/HSM 或云 HSM。仅为了 SmartScreen 购买 EV 已无意义。
4. Microsoft Store 的 MSIX 路径由 Microsoft 重签，可避免 SmartScreen download warning；但通过
   Store 提交现成 MSI/EXE 时，publisher 仍需先用受信 CA 证书签名。不能把两条 Store 路径混为一谈。
5. 对 Store 外发行，Microsoft 建议每个 release 都签名并保持同一 publisher identity；签名后再修改
   文件会破坏签名。Tauri 支持证书 thumbprint/digest/timestamp，也支持 `signCommand` 接 Artifact
   Signing 或其他签名服务。

来源：[Microsoft code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)，
[SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)，
[Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)，
[Artifact Signing SKU](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku)，
[CA/B Forum Code Signing Baseline Requirements](https://cabforum.org/working-groups/code-signing/requirements/)，
[Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/)。

注意：Tauri signing 页仍有“EV 会立即获得 SmartScreen reputation”的旧句子；它与更晚更新的
Microsoft 2026 官方页冲突。本报告采用 Microsoft 当前平台政策，不沿用 Tauri 那句旧说明，也因此
修正现有 `DESIGN_WINDOWS_PORT.md` 的 EV 路由描述。

---

## 4. 推论（不是 Windows 实测）

### 4.1 当前状态判断

1. **当前 Windows target 预期不能编译。** 这是由无条件 `Mutex` 类型引用和 Unix libc symbol
   引用推导出的；本机没有 Windows toolchain，尚未用 MSVC 编译器实际出错。
2. **只修编译仍不是可用 alpha。** Windows 首启没有双击模块且默认 capture shortcut 为 null，用户
   不先发现设置并手绑就无法从别的应用捕捉。
3. **Engine 不能安全开放。** 用户取消路径在 Windows 实际是 no-op；超时最多杀直接 child，孙进程
   可能继续运行和持库。它会破坏“停止就是整棵树停止”的既有产品承诺。
4. **note-first 不能照搬 macOS 的焦点承诺。** Windows 明确限制后台抢前台；自动聚焦可能成功也可能
   被拒绝。首版若把“弹出即可打字”写死为成功条件，会得到无法稳定兑现的行为。
5. **来源标签可先做到进程/窗口级，不能假装浏览器 tab。** User32 链路足以给 app/executable 和
   top-level caption；浏览器活动 tab 标题没有统一通用 API，需要逐客户端 UI Automation/扩展协议和
   单独隐私、稳定性验证。
6. **MCP 一键接入不是换几个路径分隔符。** profile、安装渠道、client CLI、当前 executable、升级后的
   stale path 和 stdio 继承都需按客户端测试。继续扩充硬编码路径会形成不可维护的猜测表。
7. **Pack 有真实 Windows 隐私回归。** 当前 basename 会把整个 `C:\Users\...` 外发；此项应早于
   任何 Windows beta。
8. **`targets: "all"` 不是合适的首个 Windows release 配置。** 它同时拉入 MSI/VBSCRIPT 和 NSIS，
   扩大工具链与验收面；先选一种发行物更可控。
9. **当前 macOS 主机不具备发布证据能力。** Tauri 也把 NSIS cross-build 定位为 last resort；
   Windows 构建、SignTool 验证、安装/升级/卸载、SmartScreen 和真实客户端必须在 Windows 完成。
10. **Job Object 的 assign 时序必须专门设计。** 如果先让 provider 正常运行、再 assign，provider
    可能在关联前已经创建 child；官方的默认 child 继承不能追溯覆盖这段窗口。
11. **不能按显示名称照搬 `open -a`。** ShellExecute 解决“打开已注册目标”，不保证按任意产品名找到
    并拉前一个既有实例；客户端 focus 需要经过验证的 process/window identity 和失败降级。
12. **Engine 启动的 MCP 在 Windows 会先丢数据目录。** Engine 的 `env_clear()` allowlist 没有
    `APPDATA`；provider 再启动 `spool.exe --mcp` 时通常只能继承这份裁剪后的环境，而 Windows
    `mcp_data_dir()` 正好依赖 `APPDATA`。即使 provider 本体找到了，Spool 工具仍很可能报找不到库。
13. **Windows MCP 写入有独立于编译的阻断。** `/dev/urandom` 是运行期打开；修完 libc 让 server
    启动后，读取类工具可能正常，但 `create_thread`/`add_block` 到生成 ID 才失败，容易被只读 smoke
    test 漏掉。

### 4.2 不应做的“伪跨平台”

- 不把 `HOME` 人工映射到 `USERPROFILE` 后继续运行一套 Unix 路径猜测。
- 不在 Windows 打包 `/bin/sh`、`which`、`open`、`kill` 或 coreutils。
- 不用 WSL 作为 Windows GUI/子进程的运行依赖；WSL 只能是个别 CLI 的用户自选环境，不是 Spool
  Windows 版的实现基础。
- 不用 `explorer.exe`/`cmd.exe` 字符串拼接模拟 Shell API。
- 不把一个“大量 `cfg` 的同函数”当平台抽象；平台层应按职责分文件、暴露窄接口，并各自在本机测试。
- 不为了“手感一致”吞掉所有 Alt 双击；Alt 是 Windows 菜单/access-key 语义的一部分，冲突成本由
  Windows 用户承担。

---

## 5. 建议方案

### 5.1 先由 Ocean 拍板的六件事

| 决策 | 建议默认 | 为什么必须先决定 |
| --- | --- | --- |
| Windows 首版捕捉入口 | **可配置组合快捷键；首启给一个 Windows 默认 chord，并允许跳过/改绑** | 不依赖低级 hook；还需用真机冲突测试选最终 chord，报告不替用户拍死具体组合 |
| 双击 Alt | **首版不做** | 需 `WH_KEYBOARD_LL`、消息循环、吞键策略和完整冲突/可访问性矩阵；不是可用首版的必要条件 |
| note-first 焦点 | **通知无激活；捕捉卡出现后提示“点击后输入”，用户点击才激活** | 与 Windows 前台限制一致；若实测快捷键触发后可稳定激活，再逐步优化，不先承诺 |
| Engine beta | **Windows 默认禁用，直到 Job Object 进程树测试通过** | 防孤儿 provider/MCP 进程继续计费或持库 |
| 架构与最低系统 | **先做 Windows 11 x64；是否覆盖 Windows 10/ARM64 另拍板** | x64 单矩阵能控制首版成本；2026 年不应仅因 Tauri 技术上支持旧系统就自动承诺旧系统 |
| 分发/签名 | **先决定 direct NSIS 还是 Store；direct release 必须签名** | 决定 legal identity、证书资格、CI secret、安装器和 SmartScreen 预期 |

还需确认签名主体的法律实体类型和注册国家/地区。没有这些信息，不能判断 Artifact Signing 是否可用，
也不应购买 EV 或把 unsigned build 当公开发行方案。

### 5.2 平台面与 Windows 原生对应机制

| 现有 macOS/Unix 面 | Windows 原生实现建议 | 首版状态 |
| --- | --- | --- |
| CGEventTap 双击 ⌥ | 组合快捷键继续用 Tauri global shortcut/`RegisterHotKey`；双 Alt 若以后做，用专用线程上的 `WH_KEYBOARD_LL` 状态机 | 组合快捷键必做；双 Alt 延后 |
| CGEventTap click-outside | 首版用显式关闭、Esc、提交和 timeout；若数据证明必要，再独立做 `WH_MOUSE_LL`，不得和双 Alt 共用脆弱大回调 | 延后 |
| Input Monitoring/Accessibility banner | Windows 隐藏 TCC banner；改成“快捷键未绑定/注册冲突”的可操作状态，不虚构权限 | 必做 |
| AppleScript 前台 app | `GetForegroundWindow` → PID → `QueryFullProcessImageNameW`；caption 可用 `GetWindowTextW`，并明确 label 是窗口标题 | 必做 |
| AppleScript 浏览器 tab | 首版只到 browser process/window caption；UI Automation 或浏览器专属协议作为逐客户端后续增强 | 延后 |
| AX 取/设前台 | stash `{HWND, PID}`，恢复前先验证 handle/PID；显式处理 `SetForegroundWindow` 失败，不能保证成功 | 必做降级语义 |
| non-activating overlay | notice/undo 用 `SetWindowPos(... SWP_NOACTIVATE)`；可编辑卡只在用户点击或系统允许时激活 | 必做 |
| `open <target>` / `explorer` | 封装 `ShellExecuteW`/`ShellExecuteExW` 的 `open` verb，传 UTF-16 绝对目标 | 必做 |
| `open -a <name>` | 对已支持的 GUI 客户端保存/发现真实 HWND+process identity，再 best-effort `SetForegroundWindow`；找不到时只复制问题并说明手动粘贴 | 按客户端做，不猜 app name |
| `setpgid`/`killpg` | Job Object + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；保存 job HANDLE，取消/超时用 `TerminateJobObject`，关闭时兜底 | Engine 开放前必做 |
| Unix `which` 和固定 bin 路径 | Windows PATH+PATHEXT/`SearchPathW`，加 provider 官方可验证路径；优先 native `.exe` | 必做 |
| `.cmd`/`.bat` shim | 只对明确支持的 provider 使用已解析的 `ComSpec` 和专用参数构造/测试；绝不拼入用户 prompt/path | 需要 Gemini/npm 路线时做 |
| `HOME`/`USER` allowlist | 按 provider 文档建立 Windows allowlist：至少评估 `USERPROFILE`、`USERNAME`、`APPDATA`、`LOCALAPPDATA`、`SystemRoot`、`ComSpec`、`PATHEXT`、`TEMP`/`TMP`；不直接放开整个父环境 | 必做 |
| Unix libc time | Windows 专属 time 模块调用 UCRT 64-bit API并转换到内部结构；共同层保留现有格式/错误语义 | 编译前必做 |
| `/dev/urandom` | Windows 专属随机源用 CNG `BCryptGenRandom(BCRYPT_USE_SYSTEM_PREFERRED_RNG)`，严格检查状态；共同 ID 逻辑只消费已填充 bytes | MCP 写入前必做 |
| `/` basename | TS/Rust 共用语义都明确把 `/`、`\\` 当输入分隔符；不能只依赖测试主机的 `Path` 语义，必须让非 Windows CI 也能验证 Windows 字符串 | beta 前必做 |
| macOS Tauri config/sign | `tauri.macos.conf.json` 与 `tauri.windows.conf.json` 分离；Windows 明确 installer、WebView2、签名命令 | 打包前必做 |

内部结构建议按职责拆 `platform/windows/{foreground,process_tree,open,time}.rs` 与对应 macOS
模块；共同业务层只看到 `ForegroundSource`、`ProcessTreeGuard`、`open_target()`、时间转换等窄接口。
这是原生双实现，不是兼容层。

### 5.3 分阶段顺序和每阶段退出门

#### P0 — 产品边界与环境（先于代码）

- 拍板 §5.1 的六项，确定 Windows client 支持矩阵。
- 建 Windows 11 x64 MSVC 本机构建机或 VM，以及 `windows-latest` CI；CI workflow 是否创建/
  运行仍需单独授权。
- 选 direct NSIS 或 Store 路线，核实签名主体资格；签名资源尚未就绪也可先做内部 unsigned dev build，
  但不得公开分发。

**退出门**：真实 Windows 上能运行 Node/Rust/Tauri prerequisites；CI 能 checkout，但此阶段不要求产品编译。

#### P1 — 编译与纯逻辑正确性

- 修 `Mutex` gate/归属、把 time 转换拆为 Unix/Windows 原生模块，并用 Windows CNG 替代
  `/dev/urandom` 路径。
- 把 `/bin/sh` 测试改成平台测试或分别 gate；为 Windows 写 PowerShell-free/native test helper，避免测试
  自己依赖用户 shell。
- 修 TS/Rust Pack Windows basename，并补 `C:\Users\...`、UNC、尾随 slash/backslash、Unicode
  文件名测试。
- 拆 Tauri 平台 config；先把 Windows target 明确成单一 NSIS dev artifact。

**退出门**：Windows MSVC `cargo check`、Rust tests、前端 build/test 全绿；macOS 原测试不回归。

#### P2 — 可用的捕捉、数据与基础 MCP

- Windows 首启提供可发现、可改绑、冲突可恢复的组合快捷键；全部键帽、onboarding、empty state、
  toast 和 settings 文案平台化。
- 隐藏 Input Monitoring/Automation UI；来源先做 process/window 级。
- 实现 Windows overlay 的 non-activating notice 和“点击后输入”捕捉卡；明确 focus restore 是
  best-effort，失败不丢数据、不把键盘困在隐藏 helper。
- 打开目标改用 Shell API；验证拖放、picker、Unicode/空格路径。
- 证明 `%APPDATA%`/Tauri resolver/`spool.exe --mcp` 指向同一库，且 helper/MCP second process
  不触发 single-instance GUI 或第二个写连接。
- MCP 先支持一个小矩阵：优先使用客户端官方注册命令；没有官方命令才写已验证的 Windows config。

**退出门**：标准用户在干净 Windows VM 能从另一个 app 触发捕捉、保存、撤销、搜索、打 Pack；
至少一个真实 MCP client 能启动已安装的 `spool.exe --mcp` 并完成读写授权矩阵。

#### P3 — Engine 进程安全（公开 Engine 前硬门）

- 用 Job Object 重做 Windows run state；取消和 timeout 统一终止整个 job。
- 解决 assign race、nested job 和 HANDLE 清理；同一时刻只能有一个 published run。
- 做 Windows provider 发现和 per-provider env allowlist；真实验证 Claude/Codex/Gemini 中实际纳入首版的
  provider，不因“找到同名 shim”就宣称可用。
- 构造 parent → grandchild → `spool --mcp` 的测试；取消后全部退出，SQLite 无残留 handle，下一次 run
  能立即开始。

**退出门**：取消、timeout、正常退出、spawn 失败、app 退出五条路径都无孤儿子孙进程；才解除
Windows 的 Engine feature gate。

#### P4 — 客户端与桌面壳完整矩阵

- 对每个列为“支持”的 client 跑安装检测、注册、status、stale path、升级后重连、copy-and-focus；
  unsupported client 不显示一键承诺。
- 验证 tray icon/menu、开机启动、close-to-tray、single-instance、overlay helper 重启、睡眠唤醒后的
  shortcut、multiple profiles。
- 验证多屏、125/150/200% DPI、主副屏负坐标、窗口移动、键盘布局、IME、长路径/UNC、非 ASCII
  用户名。

**退出门**：支持矩阵每格都有版本、安装方式和结果；没有“理论支持”的绿色勾。

#### P5 — 签名、安装和发布候选

- direct 路线建议先出 NSIS x64；根据目标用户联网条件选择 WebView2 downloaded bootstrapper 或
  offline installer。只有 enterprise/Store 需求明确时再增加 MSI/MSIX 面。
- 在受保护 release pipeline 中签 app executable 和 installer；用 SHA-256 digest 与 RFC 3161
  timestamp，签后不再修改；SignTool 验 publisher、chain、timestamp。
- clean VM 做下载（带 Mark-of-the-Web）、安装、首次启动、升级、降级拒绝、卸载、保留/删除用户数据、
  断网 WebView2、标准用户/UAC。
- 发布说明如实说明新 publisher 可能仍遇 SmartScreen；不要宣称 EV/Artifact Signing 会首发免警告。

**退出门**：签名和 installer 可复现；clean VM 安装/升级/卸载通过；所有 P1–P4 回归通过；Ocean
单独批准公开分发。

### 5.4 必须拥有的 Windows 环境

| 环境 | 最低用途 | 必须项 |
| --- | --- | --- |
| Windows build/CI | 每次变更的编译与单测 | Windows x64 hosted/self-hosted runner，`x86_64-pc-windows-msvc`，Microsoft C++ Build Tools 的 Desktop development with C++、Windows SDK、WebView2、Node LTS、Rust stable MSVC |
| 干净标准用户 VM | 安装与首次使用 | 无开发工具、无预装 Spool；可做 online/offline snapshot、Mark-of-the-Web、UAC、卸载/升级回滚 |
| 日常真机或持久 VM | 交互行为 | 多屏/混合 DPI、IME、睡眠唤醒、tray、autostart、global shortcut、focus 竞争 |
| Client matrix VM | MCP/Engine | 每个承诺支持的 client/provider，至少覆盖官方 native 安装与一个路径含空格/Unicode 的账户 |
| 签名 runner | release only | Windows SDK/SignTool；受保护身份或 HSM/Artifact Signing；最小权限、release-only secret、不可把私钥提交仓库 |
| 可选 ARM64 环境 | 只有决定支持后 | 真 ARM64 或受支持 VM；不能用 x64 构建成功推断 ARM64 可用 |

如果决定支持 Windows 10，应增加一台仍在目标支持政策内的 Windows 10 环境，并单独定义 WebView2/
安全更新前提；不要把 Windows 11 绿灯泛化到 Windows 10。

### 5.5 必须的测试清单

#### 编译和纯逻辑

- Windows MSVC debug/release build；`spool.exe`、`--overlay`、`--mcp` 三入口都启动。
- local/UTC 时间：DST 前后、本地午夜、UTC date round-trip、非法 2 月/4 月日期、时区变更、负数/
  过大 epoch 的既有错误语义。
- ID 随机源：连续生成、长度/字母表、CNG 失败传播；MCP `create_thread` 与 `add_block` 在真实
  Windows 上各完成一次写入。
- Pack 路径：drive absolute、UNC、mixed separator、尾随分隔符、Unicode、空 label；TS/Rust 输出完全一致。
- 所有 frontend 键盘提示与真实 chord 一致；没有 Windows 页面显示 Input Monitoring/Safari/⌘/⌥。

#### 捕捉与窗口

- 快捷键注册成功、冲突、改绑、解绑、重启恢复、sleep/wake 重注册。
- 来源进程退出/窗口销毁/PID 重用时不把焦点还给错误 app。
- `SetForegroundWindow` 成功与拒绝两条路径；拒绝时用户点击可输入，关闭后没有隐藏 active helper。
- notice/undo 不激活；note 卡 keyboard/IME 输入、Esc、Enter、timeout、拖动、显式关闭均不丢数据。
- mixed-DPI 多屏坐标、负坐标、任务栏位置变化和屏幕拔插。

#### Engine 与 MCP

- Job Object 的 parent/child/grandchild 全树：正常完成、取消、timeout、app crash/exit、provider 自己
  spawn job、assign 失败；无残留 `spool.exe --mcp` 和 DB handle。
- provider detection 覆盖 native `.exe` 与纳入支持范围的 `.cmd`；环境最小化后认证仍工作，且不把无关
  secret 注入 child。
- 每个 MCP client：官方命令注册、profile、status、stale executable、路径含空格、客户端重启、
  read/write toggle、installed app upgrade。

#### Desktop 与发布

- single-instance、close-to-tray、quit、autostart、tray menu/icon、overlay helper supervision。
- file/folder/URL open、drag-drop、picker、长路径/UNC/Unicode 用户名。
- NSIS（及若选择的 MSI/MSIX）install/repair/upgrade/uninstall；WebView2 present/missing/offline。
- SignTool 验 executable/installer 的 signature、publisher、timestamp；clean VM 首次下载行为有记录。

---

## 6. 风险、优先级与停止条件

| 风险 | 概率/影响 | 先后 | 停止条件 |
| --- | --- | --- | --- |
| 当前 Windows 编译失败 | 高/阻断 | P1 第一 | MSVC CI 未绿，不进入 UI/打包 |
| Windows 无默认捕捉入口 | 必然/高 | P2 第一 | 首启不能完成异应用捕捉，不称 alpha 可用 |
| Engine 取消泄漏整棵树 | 高/严重 | P3 硬门 | grandchild/DB handle 测试未过，Windows Engine 必须保持禁用 |
| Pack 暴露完整 `C:\Users\...` | 必然/严重隐私 | P1 | TS/Rust Windows path 测试未过，不发 beta |
| 抢焦点被 OS 拒绝 | 中高/高体验 | P2 | 无可点击降级或把键盘困在 helper，不发 beta |
| MCP 配置写错 profile/路径 | 高/高 | P2/P4 | 未在真实 client/version 验证，不显示“一键已支持” |
| MCP 读通但写入因随机源/数据目录失败 | 必然或高/高 | P1/P2 | Windows 真机未各跑一次 `create_thread`、`add_block`，不得称读写接入成功 |
| 低级 Alt/mouse hook 不稳定或冲突 | 高/中高 | P5 后可选 | 无明确用户价值证据就不实现；一旦吞系统 Alt/菜单语义即停止实验 |
| 安装器/WebView2/升级损坏数据 | 中/严重 | P5 | clean VM upgrade + data-preservation 未过，不公开 |
| 签名主体不可用/SmartScreen 预期错误 | 中高/高发行 | P0/P5 | 身份/国家/渠道未拍板，不购买证书、不公开 unsigned build |
| 硬编码 Mac 文案误导 | 必然/中 | P2 | Windows UI 仍出现平台错误 onboarding，不发 alpha |

最容易造成“能启动但不可信”的三项是进程树取消、Pack 路径隐私和 MCP 配置。它们的优先级高于
双 Alt、浏览器 tab title 和浮窗 click-outside 的手感追平。

---

## 7. 建议的 Windows 首版定义

一个诚实、可验收的首版应是：

- Windows 11 x64 原生 Tauri 应用，可安装、签名、升级和卸载；
- 用户有清楚的默认组合快捷键，也能改绑/解绑；不承诺双 Alt；
- 从其他 app 捕捉会保存内容和 process/window 来源；浏览器 tab title 是可选增强；
- notice 不抢焦点；编辑捕捉卡在系统允许时激活，否则明确要求点击，不丢数据；
- Pack、文件打开、SQLite、tray、autostart、single-instance、overlay helper 都通过 Windows 真机；
- MCP 只列经过真实客户端验证的少量矩阵；
- Engine 只有在 Job Object 全树取消通过后才出现；
- 不依赖 WSL、Unix shell、兼容层或用户手装 coreutils。

这比“所有 macOS 手感逐项复刻”范围更小，但能保住 Spool 的核心承诺：捕捉可靠、数据只在用户
允许的路径外发、取消真的停止、接入状态不撒谎。

---

## 8. 官方来源索引

以下全部于 **2026-08-13** 查询；链接直接指向官方页面。

### Microsoft / Windows

- [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey)
- [SetWindowsHookExW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexw)
- [LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)
- [GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)
- [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid)
- [OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess)
- [QueryFullProcessImageNameW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-queryfullprocessimagenamew)
- [GetWindowTextW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw)
- [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
- [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos)
- [ShellExecuteW](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecutew)
- [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [CreateJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw)
- [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)
- [TerminateJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-terminatejobobject)
- [SetInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-setinformationjobobject)
- [_localtime64_s](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/localtime-s-localtime32-s-localtime64-s?view=msvc-170)
- [_gmtime64_s](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/gmtime-s-gmtime32-s-gmtime64-s?view=msvc-170)
- [_mkgmtime64](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/mkgmtime-mkgmtime32-mkgmtime64?view=msvc-170)
- [_mktime64](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/mktime-mktime32-mktime64?view=msvc-170)
- [BCryptGenRandom](https://learn.microsoft.com/en-us/windows/win32/api/bcrypt/nf-bcrypt-bcryptgenrandom)
- [Microsoft Security API best practices](https://learn.microsoft.com/en-us/windows/win32/secbp/best-practices-for-the-security-apis)
- [Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
- [Artifact Signing SKU](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku)
- [CA/B Forum Code Signing requirements](https://cabforum.org/working-groups/code-signing/requirements/)

### Tauri

- [Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
- [Platform-specific configuration](https://v2.tauri.app/develop/configuration-files/)
- [Microsoft Store distribution](https://v2.tauri.app/distribute/microsoft-store/)
- [Global Shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/)
- [Autostart plugin](https://v2.tauri.app/plugin/autostart/)

### CLI / MCP clients

- [Claude Code installation](https://code.claude.com/docs/en/installation)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)
- [Gemini CLI](https://google-gemini.github.io/gemini-cli/)
- [Gemini CLI MCP](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)
- [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code Profiles](https://code.visualstudio.com/docs/configure/profiles)

---

## 9. 本调查没有完成的事

- 没有安装 Windows Rust target、cargo-xwin、Wine、WSL、CLI 或新依赖。
- 没有在 Windows 编译、运行、签名或测试；没有把 macOS 的测试结果当 Windows 证据。
- 没有创建 CI workflow、Azure/Store/证书资源，也没有发生外部写入。
- 没有修改 `src/**`、`src-tauri/**`、现有设计稿或交接文件。
- 没有暂存、提交、推送或部署。

下一次实施开始时，先在真实 Windows MSVC 环境重跑源码定位与官方政策查询；行号、CLI 安装方式、
签名价格/地域和 Windows/Tauri 支持政策都可能继续变化。
