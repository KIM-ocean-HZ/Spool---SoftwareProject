# 交接文档 — 2026-07-30 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`double-tap-exclusivity`、`next-stage-goals-website-portfolio`、
> `isolated-verify-workflow`、`distribution-route-notarized-dmg`、`mcp-first-pivot`、
> `spool-db-wipe-incident`)。完成后删除本文件。

---

## 0. 一句话状态

**v0.3.0 已经公开发布**——tag、Release、dmg 都上线了,官网那个「Download for macOS」
现在真的能下到东西(下载链路端到端实测过);**发布前唯一没做的干净安装冒烟测试已做完并通过**;
本机回到了「新用户」状态,历史数据完整归档在桌面;截图临时环境拆干净了。
基线全绿:`npx tsc -b` / `npx vitest run`(152)。
**下一个窗口的主线:Windows 版**(§2 有已勘查好的坐标和三个待拍板)。

---

## 1. ⚠️ 待 Ocean 动手(按紧急程度)

1. 【你自己用 app 的前提】**去授权 Input Monitoring**。冒烟测试里看到:
   Accessibility 已授,**Input Monitoring 没授**。没有它,双击 ⌥ 只在 Spool 自己
   在前台时才有效——日常场景(在别的 app 里 ⌘C 然后双击)是不工作的。
   系统设置 → 隐私与安全性 → 输入监听 → 勾上 Spool → **托盘图标退出 → 重新打开**
   (授权只在下次启动生效)。
   ⚠️ 顺带一提:这个「半授权」状态还有个副作用,会抢掉 Claude Desktop 的双击 ⌥,
   见 §3.3——那是个值得改的产品问题。
2. 【历史数据要不要装回来】桌面 `Spool-Data-Archive-2026-07-30/`,
   里面 `README.txt` 写了恢复步骤(三条命令)。现在 app 里是全新的空库 + 教程脉络。
   废纸篓里还有第二份保险(`com.oceanjin.spool-pre-clean-install-2026-07-30`),
   确认归档没问题后可以清空废纸篓。
3. 【重启 Claude Desktop】我把配置里的 `spool-demo` 条目删了(演示环境已拆),
   重启客户端才生效。正式的 `spool` 条目保留着,指向新装的 `/Applications/Spool.app`。
4. 【只剩你能做的】演示视频——`docs/DEMO_SCRIPT.md` 分镜已写好,你实机录。
5. 【一个上游决策,挡着 EN 截图】**默认语言要不要跟随系统 locale?内置教程要不要出 EN 版?**
   现状:默认 `zh`(§18 rule 11),教程脉络只有中文一版(冒烟测试实测)。
   英文用户下载后第一眼是中文界面。这个不定,双语截图就没法做——
   详见 `docs/DESIGN_EN_TYPOGRAPHY.md` 末尾的批复段。

---

## 2. 下一个窗口的主线:Windows 版

### 2.0 动手前先拍三个板(硬规则 6:设计类任务先出方案)

**A. 捕捉手势在 Windows 怎么落地** —— 这是整件事最大的设计缺口。
macOS 的双击 ⌥ 独占方案在 Windows 没有对应物:Alt 单键在 Windows 会激活菜单栏,
要做全局双击手势得上 `WH_KEYBOARD_LL` 低级键盘钩子并吞掉事件,风险高
(容易被杀软/EDR 当键盘记录器)。
**我的建议:首版不做双击手势**,直接用**已经跨平台的可绑定全局快捷键**——
`lib.rs` 里的 `capture_acc` 路径今天在 macOS 上就是「逃生舱」,代码是现成的、
平台无关的,给 Windows 一个默认绑定即可。双击手势留到 v2 再单独评估。

**B. 签名与分发** —— Windows 没有 Developer ID 的等价物,三条路:
(a) Azure Trusted Signing(约 $10/月,要企业实体验证);
(b) EV 代码签名证书(几百刀/年 + 硬件令牌);
(c) 不签名直发——SmartScreen 会拦,且新证书本来也要攒信誉。
**这是花钱和身份认证的决定,必须你拍,我不替你选。**

**C. 首版范围** —— 建议:能装能跑 + 快捷键捕捉 + 打包 + MCP 能接上。
**不**追求 overlay 的非激活完美和 click-outside 消失(那两件依赖 macOS 特性)。

### 2.1 现成坐标(2026-07-30 已勘查,省掉下个窗口的摸索)

**已经跨平台、别重复造:**

| 东西 | 位置 | 现状 |
|---|---|---|
| 数据目录 | `src-tauri/src/mcp.rs:492` `app_data_dir()` | 已有 `APPDATA` 分支,Windows 路径已对 |
| 打开文件 | `src-tauri/src/capture.rs:606` | 已有 windows 分支(`explorer`) |
| 搜索/撤销快捷键 | `src-tauri/src/capture.rs:305,319` | 已有 non-macOS 变体(Ctrl+Shift+F / Ctrl+Z) |
| 权限探针 | `src-tauri/src/lib.rs:33,50` | non-macOS 直接返回 `true`,不会弹引导条 |
| 双击模块 | `src-tauri/src/double_tap.rs:53` | 整个模块 `#![cfg(target_os = "macos")]`;`lib.rs:292` 的 install 调用也已 gated——**Windows 能编译,只是没有手势** |
| 字体 | `src/styles/fonts.css` + `src/styles/tokens.css:44` | Geist/Fraunces/GeistMono 是打包的 ttf;`--font-ui` 里**已经写了 `'Microsoft YaHei'` 兜底** |
| SQLite / WAL / 迁移 | `src/lib/db/client.ts` | 纯 SQL,平台无关 |

**必须新写或改的:**

| 要动的地方 | 位置 | 问题 |
|---|---|---|
| **一键接入 MCP 客户端** | `src-tauri/src/mcp.rs:2914` `client_config_paths()` | **没有任何 OS gate**,写死 `HOME` + `Library/Application Support/Claude`。Windows 上会直接失败。要加:Claude Desktop → `%APPDATA%\Claude\claude_desktop_config.json`;Cursor → `%USERPROFILE%\.cursor\mcp.json` |
| 前台应用名 | `src-tauri/src/capture.rs:83` | non-macOS 返回 `None`(macOS 用 osascript)。Windows 要 `GetForegroundWindow` + `QueryFullProcessImageName`,否则捕捉块的来源标签是空的 |
| overlay 不抢焦点 | `src-tauri/src/capture.rs` overlay 段 | macOS 靠 `focus: false` 就够;Windows 要 `WS_EX_NOACTIVATE`,否则捕捉时会把用户从原 app 里踢出来。**这是首版最可能翻车的一处** |
| click-outside 消失 | `src-tauri/src/capture.rs:772` | 明确标了 macOS-only(CGEventTap)。Windows 要另想或先不做 |
| 打包配置 | `src-tauri/tauri.conf.json` | `bundle.targets` 是 `all`,但 `bundle.windows` 是空 `{}`——NSIS/MSI 走默认,签名没配 |

### 2.2 一个硬约束:本机编译不了 Windows

`rustup target list --installed` 只有 `aarch64-apple-darwin`,连 `cargo check`
都过不去。**建议第一步就是拿 GitHub Actions `windows-latest` 把「能编译」这条
底线拿下**——这也是唯一不需要你先买证书就能推进的一步。仓库现在没有任何
workflow,得新建。

---

## 3. 本批次做完了什么

### 3.1 v0.3.0 发布(已上线,可验证)

- tag `v0.3.0` → commit `2697822`,已推。
- Release: <https://github.com/KIM-ocean-HZ/spool/releases/tag/v0.3.0>,
  非草稿、非预发布,附 `Spool_0.3.0_aarch64.dmg`(7,540,829 字节)。
- **下载链路端到端验过**:`/releases/latest` 302 跳到 v0.3.0;
  实际下载回来的 dmg **sha256 与本地公证产物逐字节一致**
  (`5e68ecfe…54c`),且下载副本 `stapler validate` / `spctl` / `syspolicy_check`
  三项全过 —— 用户拿到的就是公证过的那份。
- 发布说明写了:Apple Silicon 限定、两个权限怎么授、数据在本机、MCP 可选、
  没有自动更新通道、界面默认中文(EN 在设置里)。

### 3.2 干净安装冒烟测试(全过)

真库先归档(两份、逐文件 sha256 校验)再清空 app 路径,然后从 **dmg** 装
(不是从构建目录拷),全程有日志和截图:

| 项 | 结果 |
|---|---|
| 首启建库 | ✅ 直接建到 v8,`integrity_check ok`,自动写 pre-migration 快照 |
| 教程脉络 | ✅ 「欢迎使用 Spool」+「让 AI 用上你的 Spool」+「未分类」(捕捉目标),12 块 |
| 双击 ⌥ 捕捉 | ✅ 日志 `TRIGGER gap=193ms` → 块落进「未分类」,并 `suppressed ⌥ press/release`(独占生效) |
| 打包 ⌘⇧P | ✅ 打包窗 → Copy to clipboard,3,213 字符 |
| 搜索 ⌘⇧F | ✅ 中文 FTS 两条命中、高亮、面包屑都对 |
| 教程可删且不复现 | ✅ 软删后重启不回来;捕捉目标自愈保留 |
| Gatekeeper | ✅ app 与 dmg:`spctl` accepted + Notarized Developer ID + stapled + `syspolicy_check` 通过 |
| 签名主体 | ✅ Developer ID(不是 `Spool Dev`),hardened runtime |
| MCP | ✅ 新装的二进制 `--mcp` 起得来,10 个工具,数据目录正确 |

**没做的**(需要你的手或另开工具):中文输入法回车确认候选词(要真 IME)、
抓包零出网(之前验过,这次没重跑)、旧库升级(真库已归档,不拿真数据试)。

**测试期间发现的两件事(都已处理):**

1. **`/Applications/Spool 2.app`** —— 一个今早 09:10 的旧构建,和正式版**同一个
   bundle id**。我用 bundle id 唤起 app 时,LaunchServices 挑中的是它而不是新装的那个,
   一度让我以为新装的崩了。已移到废纸篓。**以后手工拷 app 进 /Applications 时,
   注意别让 Finder 留下「Spool 2.app」**——同 id 两个 bundle 会互相抢。
2. **`~/Library/LaunchAgents/Spool.plist` 指向 `src-tauri/target/debug/spool`** ——
   开机自启拉起的是**仓库里的 debug 构建**。这正是 `spool-db-wipe-incident` 那类
   「旧构建对着真库跑」的隐患。已删(备份在归档目录 `residual-state/`)。
   要开机自启的话,在新装的 app 里重新打开那个开关,它会写正确的路径。

### 3.3 值得改的产品问题:半授权状态会抢掉别人的手势

冒烟测试撞出来的真实状态:**Accessibility 授了、Input Monitoring 没授**。
此时 `double_tap.rs` 的行为是:

- tap 装在 `HID/active`(最高档,能从事件流里删事件);
- 但 `COPY_GATE_ACTIVE` 跟的是 **Input Monitoring**(`double_tap.rs:569`),
  所以 copy-gate **是关的**;
- 结果:**任何一次裸的双击 ⌥(没有先 ⌘C)都会被 Spool 捕捉并从事件流里删掉**,
  Claude Desktop 的同款手势收不到。日志实测:`TRIGGER gap=193ms (⌘C 164222197ms ago)`
  —— 那个 ⌘C 时间戳是空的,门却没拦住。

copy-gate 的设计初衷正是「裸双击让给 Claude Desktop」(见 `double-tap-exclusivity`)。
**建议的修法:抑制(suppression)只在 copy-gate 真正生效时才开启**,
也就是把 SUPPRESS 也绑到 Input Monitoring 上——没有 gate 就不该独占。
这是个小改动,但要配实机验证,单独一个任务做。

### 3.4 EN 区标(已提交 `6ab0152`)

`DESIGN_EN_TYPOGRAPHY.md` 两项待拍板按你的授权替你定了:

- **区标选 A**:EN 下 `uppercase`,`tracking-wide` 保留,**字号不动**。
  两处(`RecentSection.tsx` / `FocusSection.tsx`)。中文分支完全没变。
- **官网/README 不换 EN 截图**:双语站配单语截图,换成 EN 只是把割裂镜像给
  中文访客;而且默认语言和教程目前都是中文,EN 截图反而不如中文截图诚实。
  终局是「按语言各一套、跟 `?lang` 切换」,前置是 §1.5 那个决策。
  完整理由写在设计稿末尾。
- **仍欠**:EN 下的实际观感没在真机看过(静态改动),要和将来那次 EN 走查一起做。

### 3.5 临时环境已拆(原 §4)

`~/Desktop/Spool-Demo`(移到废纸篓)、`com.oceanjin.spool.verify` 数据目录与
WebKit 缓存(已删)、Claude Desktop 配置里的 `spool-demo` 条目(已删,
改动前备份 `claude_desktop_config.json.bak-precleanup-20260730`)。
`mdfind` 复查:已经没有任何 bundle 认领 `com.oceanjin.spool.verify`。

---

## 4. M1(AI 引擎)—— 仍然有效,只是排在 Windows 后面

`docs/DESIGN_AI_ENGINE.md` **已全批**(§6 四项 2026-07-29 通过)。范围按 §5:
**检测 + 设置页小节 + 单动作「提炼结论」端到端(含取消/超时)**——先证明管道。

| 要动的地方 | 位置 | 现状 |
|---|---|---|
| 新模块 `engine.rs` | `src-tauri/src/` | 待建 |
| 两个开关(渲染前提) | `src/stores/settingsStore.ts` | `mcpEnabled` / `mcpWriteEnabled`,默认 false |
| Rust 侧读同两个开关 | `src-tauri/src/mcp.rs:530` | 已存在,直接复用,**别新写一套** |
| 设置页「本机 AI 引擎」小节 | `src/components/Settings/McpConfig.tsx` | MCP tab 的宿主 |
| ⋯ 菜单加「让 AI 维护」组 | `src/components/ThreadView/ThreadHeader.tsx:251` | 照现有两项的 className 抄 |
| MCP prompts 面 | `src-tauri/src/mcp.rs:3077` | 现在只有 `compress_pack`;prompt 文本要与 engine.rs 同一常量源 |

**两条约束**:①宪法探针(§2.4)是验收必测,不是可选;②不新增权限面——
入口渲染条件 = 检测到客户端 + `mcpEnabled` + `mcpWriteEnabled`,缺一整组不出现。

---

## 5. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
4. i18n:中文即键,新 GUI 文案同步补 EN。**官网文案要大白话**。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点)同样需要明示。**
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
