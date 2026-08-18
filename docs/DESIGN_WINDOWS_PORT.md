# Windows 版勘查 — 排在所有任务最后(Ocean 2026-07-30 定序)

> ⚠️ **2026-08-18:首版已经动工,落地记录在本文件 §5(最新,看那一节)。**
> 下面 §1–§4 是 2026-07-30 的勘查原文,**§2 那张「已经跨平台、别重复造」的表已经不准了**
> (它说「双击模块 gated,所以 Windows 能编译」—— 那条 2026-08-13 就被
> `INVESTIGATION_WINDOWS_PORT_2026-08-13.md` 推翻了)。留着看当时的判断,别照它开工。

> **为什么单独成文**:这份勘查原本只写在 HANDOFF 里,2026-08-02 那次交接改写把它丢了
> (Ocean 2026-08-03 发现)。交接文档每窗都会重写,**长期计划不能只活在那里**——所以搬到
> 这里,HANDOFF 只留一行指针。
>
> 勘查日期 2026-07-30,**代码坐标 2026-08-03 复核过一遍**(下面的行号是复核后的)。
> 再隔几窗要动手时,先按「怎么找」那一列重新定位,别信行号。

## 1. 动手前先拍三个板(都需要 Ocean 本人决定)

- **A. 捕捉手势**:Windows 没有「双击 ⌥ 独占」的对应物 —— Alt 单键会激活菜单栏;
  做全局双击要 `WH_KEYBOARD_LL` 低级钩子并吞事件,容易被杀软误判。
  **建议首版不做双击手势**,直接用已经跨平台的**可绑定全局快捷键**
  (`set_shortcuts` 那条路径,今天在 macOS 上就是逃生舱)。
- **B. 签名分发**:没有 Developer ID 的等价物。三条路:
  (a) Azure Trusted Signing(约 $10/月,要企业实体验证)/
  (b) EV 证书(几百刀/年 + 硬件令牌)/
  (c) 不签名(SmartScreen 会拦下载)。**花钱 + 身份的决定,只能 Ocean 拍。**
- **C. 首版范围**:建议 = 能装能跑 + 快捷键捕捉 + 打包 + MCP 接得上;
  **不**追浮窗「不抢焦点」的完美形态,也不追 click-outside 消失。

## 2. 已经跨平台、别重复造

| 东西 | 现在在哪(2026-08-03 复核) | 怎么找 | 现状 |
|---|---|---|---|
| 数据目录 | `src-tauri/src/mcp.rs:503` | 搜 `APPDATA` | 已有 Windows 分支 |
| 打开文件 | `src-tauri/src/capture.rs:608` | 搜 `explorer` | 已有 Windows 分支 |
| 搜索/撤销快捷键 | `src-tauri/src/capture.rs:305,319` | 搜 `not(target_os = "macos")` | 已有 non-macOS 变体(Ctrl+Shift+F / Ctrl+Z) |
| 权限探针 | `src-tauri/src/lib.rs:35,50,66` | 搜 `_granted`、`request_capture_access` | non-macOS 一律返回 `true`(2026-08-03 新增的 `request_capture_access` 也照此办理) |
| 双击模块 | `src-tauri/src/double_tap.rs:60` | 搜 `#![cfg(target_os` | 整模块 macOS-only,调用点也 gated → **Windows 能编译,只是没手势** |
| 字体 | `src/styles/tokens.css:44` | 搜 `YaHei` | Geist/Fraunces 打包 ttf,`--font-ui` 已写 `'Microsoft YaHei'` 兜底 |

## 3. 必须新写或改

| 要动的地方 | 现在在哪 | 问题 |
|---|---|---|
| **一键接入 MCP 客户端** | `src-tauri/src/mcp.rs:2931` (`client_config_paths`) | **没有 OS gate**,写死 `HOME` + `Library/Application Support/Claude`,Windows 直接失败 |
| 前台应用名 | `src-tauri/src/capture.rs:51` (`get_foreground_app`) | non-macOS 返回 `None` → 来源标签空。要 `GetForegroundWindow` + `QueryFullProcessImageName` |
| 浮窗不抢焦点 | `capture.rs` 的 overlay 段 | macOS 靠 `focus:false` 够;Windows 要 `WS_EX_NOACTIVATE`。**最可能翻车处** |
| click-outside 消失 | `capture.rs` → `double_tap::arm_overlay_dismiss`(958/1061) | 靠 CGEventTap,明确 macOS-only |
| 打包配置 | `src-tauri/tauri.conf.json` | `bundle.windows` 是空 `{}`,签名没配 |

## 4. 硬约束:本机编译不了 Windows

`rustup target list --installed` 只有 `aarch64-apple-darwin`。
**第一步就该用 CI 把「能编译」拿下** —— 仓库已经有 `.github/workflows/pages.yml`
(官网自动部署),照它的样子加一个 `windows-latest` 的 build workflow 即可,不是从零搭。
⚠️ 加 workflow 属于对外动作的边缘(会跑在 GitHub 上),动之前跟 Ocean 说一声。

---

## 5. 首版落地(2026-08-18,分支 `windows-port`)

> 状态:**代码写完、macOS 侧全绿、Windows 侧只有 CI 编译过**。
> 一行都没有在真 Windows 上跑过 —— 装机验收由 Ocean 做,清单见
> `docs/WINDOWS-CHECK.md`。

### 5.1 开工前拍的两条(Ocean 2026-08-18)

| # | 事项 | 他定的 |
|---|---|---|
| 1 | 怎么编译 | **GitHub Actions**(这台 Mac 只有 `aarch64-apple-darwin`,连 `cargo check` 都过不去 —— libsqlite3-sys 要为目标平台编 C) |
| 2 | 捕捉默认快捷键 | **先不定** —— 首版不给默认值,第一次启动引导他自己按一个 |

⭐ 第 2 条**逼出了一个不加不行的东西**:macOS 上「捕捉是空的」有横幅解释(权限没给),
Windows 上没有权限这回事,于是首启会是**一个功能完全静默、且看不出为什么静默的 app**。
所以 `PermissionBanner` 多了一个 `unbound` 相位 —— 它跟权限无关,但它跟那三个相位是
**同一形状的问题**:捕捉是死的,而原因在屏幕上看不见。**语言切换器也在那条横幅里**,
不复用它的话 Windows 首启连换语言的入口都没有。

### 5.2 修掉的东西,按「症状离原因有多远」排

| 改的地方 | 原来会怎样 |
|---|---|
| `capture.rs` `RESTORE_FOCUS_APP` 加 cfg 门 | 编译不过 —— `Mutex` 的 import 在 macOS 门里,静态量在门外 |
| `systime.rs`(新)+ `mcp.rs` 四处调用点 | 编译不过 —— `localtime_r` / `gmtime_r` / `timegm` 是 Unix 扩展,Windows 的 libc 里**没有声明** |
| `mcp.rs` `new_id` 走 CNG | ⚠️ **编译得过**。`/dev/urandom` 是一个**路径**不是一个符号,所以服务起得来、只读工具也跑得通,一直到第一次 `create_thread` / `add_block` 才报「随机源不可用」 |
| `mcp.rs` `user_home()` / `client_app_data_root()` | 一键接入无条件读 `HOME`;Windows 没这个变量。更坏的是 `client_guidance_path` 用的是 `.ok()?` —— **变量不存在和「这个客户端没有指导文件」是同一个值**,于是「接入成功」会盖住半件没做的事 |
| `assemble.ts` / `mcp.rs` 的 `base_name` 认 `\` | ⚠️ **隐私回归**:打包是**专门要离开这台机器**的东西,而 `/` 版本会让 `C:\Users\Ocean\...` 原样进包 —— 注释还写着「只外发文件名」 |
| `engine.rs` `detect()` 在 Windows 直接 `missing()` | 取消一次运行是 `kill(-pgid)`,Windows 那一支是空的 |
| `lib.rs` 托盘图标 | `icon_as_template` 是 macOS 概念,Windows 直接忽略 → 那张黑色模板图**画在 Windows 11 的深色托盘上**。关窗只是隐藏,托盘是回到 app、也是退出 app 的唯一路 |
| `lib.rs` `open_mcp_client_page` 改走 `capture::open_default_handler` | 非 macOS 一律返回 `macOS only` —— 而「MCP 接得上」在首版范围里,没装客户端的用户第一步就是那个下载页 |
| 界面文案(见 §5.3) | ⌘ 键帽、双击 ⌥、输入监听权限 |

### 5.3 文案:两类,处理方式不一样

1. **纯键帽**(`⌘⇧F`、`⌘Z`、`⌘,`)—— `lib/platform.ts` 的 `localizeKeyCaps`,
   挂在 `i18n` 的 `t()` / `useT()` 出口上,**一处**。行为本来就是对的
   (键盘处理一直读 `metaKey || ctrlKey`),错的只是标签。
2. **描述一个 Windows 没有的动作**(「双击 ⌥」「打开输入监听权限」)——
   ⚠️ **这一类不能机械替换**。替换出来是一句读着很顺、但那个动作根本做不了的指令。
   按调用点用 `IS_MAC` 选文案:`ShortcutConfig`、`BlockFeed` 空状态、
   `CaptureOverlay` 的「剪贴板为空」、`ThreadHeader` 的「捕捉到此」提示。

⭐ `ShortcutConfig` 那两句是这条规矩最值钱的例子:macOS 上捕捉快捷键的说明是
**「可选 —— 双击 ⌥ 之外的备用捕捉键」**,而 Windows 上它是**唯一的门**。
照搬等于叫人跳过屋里唯一那扇门。

### 5.4 打包

`tauri.windows.conf.json`(平台配置和通用配置自动 merge),三条都是决定不是默认:

- `targets: ["nsis"]` —— 不出 MSI。MSI 要 WiX 和 Windows 的 VBSCRIPT 可选功能,
  首版换不到任何东西(调查报告 §4.1 #8)。
- `webviewInstallMode: downloadBootstrapper` —— 装的时候联网拉 WebView2。
  `offlineInstaller` 会让安装包大 127MB;现代 Windows 基本自带这个运行时。
  ⚠️ **离线机器上会卡在这一步**,这是已知代价。
- `nsis.installMode: currentUser` —— 装进用户目录,**不需要管理员权限**。

⚠️ **通用配置里的 `macOSPrivateApi` 和 `bundle.macOS.signingIdentity` 故意没有搬走。**
Windows 会忽略它们,而搬动它们要赌 Tauri 的 merge 行为 —— 赌输了是 macOS 的浮窗
不透明或签名身份丢了,那是拿一个能跑的平台去换一个还没跑过的平台的整洁。

**不签名**(Ocean 2026-08-15 决策 5),所以 SmartScreen 会拦,首次运行要手动放行。

### 5.5 ⚠️ 首版故意不做的,和它们各自的理由

| 不做 | 为什么 |
|---|---|
| **双击 Alt 手势** | 要 `WH_KEYBOARD_LL` 低级键盘钩子 + 吞键,杀软容易误判。Ocean 2026-08-15 决策 4 |
| **click-outside 消失** | 同一条钩子路(`WH_MOUSE_LL`)。Esc / ✕ / 8 秒自动消失仍然在 |
| **浮窗抢焦点 / 还焦点** | Windows 明确限制后台进程抢前台(`SetForegroundWindow` 可能直接被拒)。**首版不承诺「弹出即可打字」** —— 点一下笔记框再打字,数据一条都不会丢 |
| **Engine(AI 维护 / 联网跟进)** | 见 §5.2。开它之前要先做 Job Object 全树取消 |
| **浏览器活动标签页** | 没有通用 API。来源退到**窗口标题**,浏览器的窗口标题本来就带着当前标签页 |
| **签名** | 决策 5 |

### 5.6 ⚠️ 一行都没在真 Windows 上跑过

CI 证明的是**能编译、能打出安装包、单测在 Windows 上是绿的**。它证明不了:
托盘图标看不看得见、浮窗透不透明、快捷键注册会不会撞、`spool.exe --mcp` 被真客户端
拉起来会不会闪黑框、一键接入写进去的路径客户端认不认。**这些全在 Ocean 的清单上。**

## 6. 第一次真机验收(2026-08-17 Ocean 装机 / 2026-08-18 修完)

> 装的是 08-17 的绿色构建。**23 条通过,3 条不过,外加 1 个小插曲和 4 件他自己发现的事。**
> 清单原文和第二轮要验的东西都在 `docs/WINDOWS-CHECK.md`。

### 6.1 他报的,和真正的原因

| 他看到的 | 真正的原因 | 改法 |
|---|---|---|
| **#13** ✕ 把整个 app 关了 | 两个嫌疑,都堵上了:`ExitRequested` 在最后一个窗口被销毁时会结束事件循环(macOS 不会,所以只在这里发作);而托盘**左键默认弹菜单**,Windows 用户拿左键当「把窗口叫回来」 | `run()` 改成 `build().run(cb)`,`code.is_none()` 时 `prevent_exit`(有 code 的是 `app.exit()` / `restart()`,照放);非 macOS 关掉 `show_menu_on_left_click`,左键 = 显示主窗口 |
| **#20** 什么组合键都收,连 Ctrl+Z | 录制器只要求「有一个修饰键」。全局快捷键是**从别的所有软件嘴里抢走**的,绑了 Ctrl+Z 之后 Word、浏览器的撤销全死,而且没有任何线索指回 Spool | `lib/capture/shortcut.ts` 的 `reservedChordMeaning`:**单个主修饰键 + 全系统通用键**(Z Y X C V A S F P N O W T Q)一律拒,并说出会丢什么;多一个 Shift/Alt 就放行 |
| **#24** Esc 关不掉卡片 | ⚠️ **是首版故意不做的那条(§5.5「浮窗抢焦点」)的后果,不是独立 bug**:卡片从来没拿到过键盘,所以 Esc 没人收 | 见 6.2 |
| **#34** `SpaceTimeAStarPlanner` 被当成内部 id 拦下 | 形状检测只看「21 位 + 有大小写混排」,这正好是每一个 21 字母的 CamelCase 类名 | 再加一条:必须**含数字或 `-`/`_`**。真 nanoid 不含的概率 (52/64)^21 ≈ 1.3%,而**库里真实存在的 id 由精确查表兜底**(`real_id_hit`),那才是这道防线真正防的东西 |

### 6.2 ⚠️ §5.5 里「浮窗抢焦点」那一条,推翻了

原文写的是「Windows 明确限制后台进程抢前台」。**对了一半。** Windows 拒绝的是
**不在用户交互里的进程**;而**正在处理用户刚按下的热键的那个进程**是
`SetForegroundWindow` 文档里明写的例外(它「收到了最后一个输入事件」)。捕捉这条路
**只可能**由那个热键进来,所以我们要的那一瞬间,权利就在手上。

难点是权利在**主进程**手里,而窗口在**浮窗子进程**里(§DESIGN_CAPTURE_HELPER_PROCESS)。
Win32 对这件事有专门的接口:主进程 `AllowSetForegroundWindow(helper_pid)` 把权利转让,
子进程再用自己的 `set_focus()` 花掉。还回去也一样 —— 只有**当前持有前台的那个进程**
说话算数,所以源窗口的 HWND 随 `hide-now` 消息发给子进程,由它 `SetForegroundWindow`
之后再隐藏自己。这与 macOS 那条路是同一形状(主进程 `ax_set_frontmost(helper_pid)`),
只是换了机制。

⚠️ **子进程报的是「事后 `GetForegroundWindow` 属不属于我」,不是「调用返回了 TRUE」。**
没抢到就退回旧行为(点一下再打字)并**补上全局撤销键** —— 和 macOS 那条 AXFrontmost 被拒的
分支同一个道理。

⚠️ 顺带修掉一个只在 Windows 上存在的坑:卡片显示期间会全局占用 Ctrl+Z(macOS 上因为
卡片有焦点,这一步是跳过的)。也就是说卡片在的那 8 秒,用户在 Word 里按 Ctrl+Z 撤销的是
**Spool 的捕捉**。抢到焦点之后这条路自动关上,和 macOS 一致。

### 6.3 他自己发现的四件

1. **窗口底部被任务栏挡住**(2560×1600 笔记本)。`tauri.conf.json` 的 1600×1000 是**逻辑**像素,
   150% 缩放下那块屏幕只有 1706×1066 逻辑,减去任务栏放不下。
   → 启动时按 `Monitor::work_area()`(任务栏之外的那块)夹一下再居中,**装饰高度是量的不是猜的**
   (`set_size` 设的是内容区)。**只在 Windows 上做** —— Mac 没人报过,而这一分支的规矩是 Mac 不动。
2. **VS Code 一键接入不完整**:`mcp.json` 写进去了,VS Code 还要「命令面板 → MCP: List Servers →
   Start Server → reload window」。⚠️ **最后那一下 Spool 替不掉**:VS Code 不会自动跑一个
   它没见过的 MCP 服务,那是它的安全模型。→ 接入成功后**按客户端**给出「还差哪几步」,
   VS Code 另有一段可展开的分步教学(Ocean:「实在不行就给出详细教程放在二级页面里」)。
3. **没装 CLI 时「周回顾」只剩一句安装广告** → 左栏那一行按 `available` 隐藏,**所有平台**(他拍的板)。
   ⚠️ 同时发现反向的一个错:右栏的**「跟进内容」原本也跟着 CLI 一起藏**,而跟进清单是 MCP 也能读写的东西
   —— Windows 上等于「写得进、看不见」。现在只有「联网搜索」那个按钮跟着 CLI 走。
4. **引擎只能被动搜到,加不了** → `detect_manual`:设置里可以手填/选一个 CLI 路径,
   **靠文件名认引擎**(`--version` 还是要跑通),探测和真正运行走同一个值,
   免得「设置里说找到了、一跑说没有」。外加一段大白话:引擎是你自己装的命令行工具、
   **Spool 里永远没有填 API key 的地方**。

### 6.4 那次编译失败(`runs/32044993155`)

Ocean 报的红叉是当天**最早**的一次,挂在 `git config core.autocrlf` 之前:Git for Windows
会把签出的文本文件改成 CRLF,而两套测试是**逐字节**比对提交进仓库的固定文件的。
`9b992a9` 已经修了(checkout 前先关掉换行转换),同一天后面三次全绿。**没有遗留问题。**
