# Windows 版勘查 — 排在所有任务最后(Ocean 2026-07-30 定序)

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
