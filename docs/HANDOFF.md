# 交接文档 — 2026-07-31(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`double-tap-exclusivity`、`next-stage-goals-website-portfolio`、
> `isolated-verify-workflow`、`distribution-route-notarized-dmg`、`mcp-first-pivot`、
> `spool-db-wipe-incident`)。完成后删除本文件。

---

## 0. 一句话状态

**v0.3.0 已公开发布**,官网下载按钮**直接下 dmg**。
主线「上手体验」四件事**只剩 §2.1 一件**:2.2(英文教程)、2.3(默认跟随系统语言 + 提示条切语言)
已落地并实机验证过,§5.3(半授权抢手势)也一并修了。基线全绿:`npx tsc -b` /
`npx vitest run`(155)。**未推送**,五个提交都在本地 main。

**§2.1 卡在一个探针上,要你两步**(见 §1.1):Ocean 选了 B 路线(免重启重建 tap),
探针已经写好在跑,但需要你授权它、敲几下键盘才能出结论。**Windows 版仍排最后。**

---

## 1. ⚠️ 待 Ocean 动手

1. 【挡着 §2.1,两分钟】**给探针授权并敲几下键盘**。
   `SpoolTapProbe.app` 已在跑(会话 scratchpad 里,源码 `tapprobe.c`,几分钟可重建):
   系统设置 → 隐私与安全性 → **输入监听 → 勾上 SpoolTapProbe**(别退出它),
   然后在任意窗口随便敲几下键盘。探针会自己判 B 路线能不能成并写进日志。
   完事后把 SpoolTapProbe 从那个列表里 − 掉,别留着。
2. 【你自己用 app 的前提】**去授权 Input Monitoring**。冒烟测试实测:
   Accessibility 已授,**Input Monitoring 没授**。没有它,双击 ⌥ 只在 Spool 自己在前台
   时有效——日常场景(在别的 app 里 ⌘C 再双击)不工作。
   系统设置 → 隐私与安全性 → 输入监听 → 勾 Spool → **托盘退出 → 重开**。
   ⚠️ 这个「半授权」状态原本会抢掉 Claude Desktop 的双击 ⌥ —— **已在本批次修掉**(§5.6),
   但你装的正式版还是旧的,授权前仍是那个行为。
3. 【历史数据要不要装回】桌面 `Spool-Data-Archive-2026-07-30/`,`README.txt` 有恢复步骤。
   现在 app 里是全新空库 + 教程脉络。废纸篓里还有第二份保险,确认无误后可清空。
4. 【重启 Claude Desktop】`spool-demo` 条目已删,重启才生效。
5. 【一个小澄清,挡着 §4.2】现在 app 的一键接入只支持
   Claude Desktop 与 Cursor 两个目标
   (`claude mcp add` / `~/.claude.json` / 项目级 `.mcp.json`),没做。
   要不要把它加成第一等公民,决定了 §4.2 的第一步。
6. 【演示视频】`docs/DEMO_SCRIPT.md` 分镜已写好,你实机录。
   Ocean 已定:**录英文版**——英文教程现在有了(§5.6),干净安装在你这台机器上
   首启就是全英文,可以开录了。**但要用干净数据目录录**:你日常那份库的
   `settings.json` 里有 `language: "zh"`,而且教程行是当初按中文播的,不会回译。

---

## 2. 主线:新用户上手体验 —— **只剩 2.1**

2.2 / 2.3 已于 2026-07-31 落地并实机验证(做法与结论见 §5.6),下面的原始需求描述保留作背景。
**2.1 还没动产品代码**:Ocean 选了 B 路线,探针已写好在跑,等 §1.1 那两步出结论。

### 2.1 权限提示条「授权成功后也不消失」(⏳ 待探针结论)

**Ocean 2026-07-31 拍板:走 B(先验证免重启重建 tap),不是 A。**
探针 `tapprobe.c`(会话 scratchpad,`clang -framework ApplicationServices` 即可编译,
签 "Spool Dev" 打成 `SpoolTapProbe.app`,`open --stderr <log>` 起)分别数两个 tap 的 keyDown:
tap1 在授权**前**建(今天 Spool 的行为,预期永远聋),tap2 在授权翻转**后**当场重建——
tap2 收得到全局 keyDown 就说明 B 可行。keyDown 是唯一判据(flagsChanged/鼠标不用授权也收得到)。
**探针只测输入监听、只用 listen-only tap**;主动 tap 还要辅助功能,那部分等 B 成立后再连带验。

- **B 成立** → 在 `double_tap.rs` 里做「授权翻转时重建 tap」(顺带把 `COPY_GATE_ACTIVE`
  和 §5.6 的 suppress 判定一起刷新),提示条的 `granted-later` 态直接不再需要,自然消失。
- **B 不成立** → 回退 A:`granted-later` 态加「立即重启 Spool」按钮。
  Tauri v2 的 `app.restart()` 在 Rust 侧,**加个 command 就行,不必引 plugin-process**
  (`@tauri-apps/plugin-process` 没装,装它要按硬规则 2 过审)。

原始背景:

**现象**(Ocean 报):设置成功了,提示条还在。
**根因**(已定位,不用再查):`src/components/PermissionBanner.tsx:38-43` 的状态机有三态
`hidden / denied / granted-later`。授权后重新检查会走进 **`granted-later`**,
文案换成「已授权 — 完全退出 Spool 并重新打开后生效」,然后**永远停在那里**,
直到用户自己重启 app。这是**当初有意为之**:TCC 授权对已创建的 CGEventTap 不追溯
(`double_tap.rs` 模块注释 + memory `double-tap-exclusivity` 最后一条),
tap 在授权前就建好了,不重启确实不生效。

**所以这不是纯 bug,是个死胡同 UI**。

### 2.2 新手教程出英文版 ✅ 已完成(2026-07-31)

**现状**:`src/lib/db/client.ts:313` `seedTutorialThread()` 里两条脉络
(「欢迎使用 Spool」「让 AI 用上你的 Spool」)的标题、摘要、12 个块**全是硬编码中文字面量**,
不走 i18n。所以 UI 切成 English 后,教程还是中文——Ocean 看到的就是这个。

**要做**:按语言播种。Ocean 的要求是「**除了 logo,全是英文**」。
- 给 `seedTutorialThread(db, lang)` 传语言,中英两套文案并存(12 块 × 2)。
- ⚠️ **红线**:种子只允许在**空库重建路径**跑(5/29 数据事故的根因就是重复播种,
  见 memory `spool-db-wipe-incident`)。**绝不能**为了"补英文教程"给存量库播种。
- ⚠️ **顺序陷阱**:首启时 `settings.json` 还不存在,语言得从系统 locale 现场判定
  (见 2.3),所以**语言判定必须排在 DB 初始化之前**。这是 2.2 和 2.3 必须同批做的原因。
- 老用户拿不到英文教程(不给存量库播种)——他们的入口是设置里的 MCP 示例段,
  见 `docs/DESIGN_MCP_ONBOARDING.md` 的 B1 方案。

### 2.3 默认英文 + 跟随系统语言 + 提示条能切语言 ✅ 已完成(2026-07-31)

Ocean 定了三件:
1. **默认打开是英文版**。现在是 `src/stores/settingsStore.ts:87` `language: 'zh'`
   (原 §18 rule 11「中文即键」是**代码里的 key 用中文**,和 UI 默认语言是两回事,
   改默认不违反那条规则——但 i18n 硬规则 4「中文即键」照旧,新文案还是中文当 key)。
2. **能跟随用户电脑的语言自动切换**(他说「如果可以的话」——可以做,
   webview 里 `navigator.language` 就够,不必引 `@tauri-apps/plugin-os`)。
   建议逻辑:用户从没手动设过 → 跟系统(`zh*` → zh,其他 → en);
   手动设过 → 永远尊重用户,别再自动覆盖。
3. **提示条能切语言 + 一键跳设置**。现在 `PermissionBanner` 只有「打开系统设置 / 详情 / ×」,
   没有语言入口。和 2.1 一起改这个组件,一次改完。

**验收(三条已全部实机验过,见 §5.6)**:干净安装(删数据目录)在英文系统上首启 →
英文 UI + 英文教程;中文系统上首启 → 中文 UI + 中文教程;手动切过语言的用户重启后不被覆盖。
隔离验证流程见 memory `isolated-verify-workflow`(第 11-13 条是这次新踩的坑)。

---

## 3. 再下一批(Ocean 已提出,但不急)

### 3.1 邮件订阅 + 新版本推送 + 反馈入口 —— **已定调:只放官网**

**Ocean 2026-07-31 批复:接受建议,不在 app 内做邮箱收集。**
理由是那个叙事冲突:Spool 对外承诺「无需账号 · 不做任何追踪 · 断网可用 · 本体零出网」
(官网 fineprint、README、发布说明、隐私页全这么写,CSP 的 `connect-src` 只放行 Tauri IPC,
memory `mcp-first-pivot`),做进 app 等于亲手推翻卖点。已记进 memory
`email-collection-website-only`。

所以这件事的形状是:
- 邮箱订阅、反馈入口**都在官网**;app 里最多一个外链按钮(点了开浏览器),
  **不内建检查更新的出网**。
- 官网是 GitHub Pages 静态站(`.github/workflows/pages.yml` 自动部署),
  **收表单需要第三方**(邮件列表服务或表单服务)——**选型仍要 Ocean 单独批**(硬规则 2)。
  这是这件事真正的下一步,别自己挑一家就接上去。

### 3.2 MCP 上手教育 + 其他 AI 客户端

Ocean 的顾虑很对:用户可能**不知道 MCP 是什么**,甚至**没装 Claude Desktop 这类桌面端**。

**好消息:方案早写好了,一直没批** —— `docs/DESIGN_MCP_ONBOARDING.md`(2026-07-12,
四个待拍板点在 §0)。其中 A2「第二条种子脉络」**已经实现了**
(就是现在的「让 AI 用上你的 Spool」,冒烟测试里能看到 6 块场景文案)。
**下一个窗口该做的是把那份设计稿的剩余项走完**(尤其 B1:设置里给老用户的入口),
而不是从零再设计一遍。注意那份文案现在也只有中文,和 2.2 是同一批活。

**「ChatGPT / 国内 AI 有没有支持 MCP」** —— 我不能凭记忆给你答案,
这属于会过期的外部事实,**动手前用联网检索现场确认**(哪些客户端、配置文件在哪、
是不是 stdio)。方向上 MCP 早已不是 Claude 独有,但具体清单必须查证后再写进产品。
另外 Ocean 定了优先级:**先把 Claude 那条路做到完美,再扩别的品牌**——
所以这件事的第一步是 §1.4 那个澄清(Claude Code 要不要做成一键接入),不是做调研。

---

## 4. 最后一项:Windows 版(Ocean:排到最后,现在别动)

勘查结果留着,将来直接用。

### 4.1 动手前先拍三个板

- **A. 捕捉手势**:Windows 没有「双击 ⌥ 独占」的对应物(Alt 单键会激活菜单栏;
  做全局双击要 `WH_KEYBOARD_LL` 低级钩子并吞事件,易被杀软误判)。
  **建议首版不做双击手势**,直接用已经跨平台的**可绑定全局快捷键**
  (`lib.rs` 的 `capture_acc` 路径,今天在 macOS 上就是逃生舱)。
- **B. 签名分发**:没有 Developer ID 的等价物。(a) Azure Trusted Signing(约 $10/月,
  要企业实体验证)/(b) EV 证书(几百刀/年 + 硬件令牌)/(c) 不签名(SmartScreen 会拦)。
  **花钱和身份的决定,必须 Ocean 拍。**
- **C. 首版范围**:建议 = 能装能跑 + 快捷键捕捉 + 打包 + MCP 接得上;
  **不**追 overlay 非激活完美和 click-outside。

### 4.2 已经跨平台、别重复造

| 东西 | 位置 | 现状 |
|---|---|---|
| 数据目录 | `src-tauri/src/mcp.rs:492` | 已有 `APPDATA` 分支 |
| 打开文件 | `src-tauri/src/capture.rs:606` | 已有 windows 分支(`explorer`) |
| 搜索/撤销快捷键 | `src-tauri/src/capture.rs:305,319` | 已有 non-macOS 变体(Ctrl+Shift+F / Ctrl+Z) |
| 权限探针 | `src-tauri/src/lib.rs:33,50` | non-macOS 返回 `true` |
| 双击模块 | `src-tauri/src/double_tap.rs:53` | 整模块 `#![cfg(macos)]`,`lib.rs:292` 的调用也 gated → **Windows 能编译,只是没手势** |
| 字体 | `src/styles/tokens.css:44` | Geist/Fraunces 打包 ttf;`--font-ui` **已写 `'Microsoft YaHei'` 兜底** |

### 4.3 必须新写或改

| 要动的地方 | 位置 | 问题 |
|---|---|---|
| **一键接入 MCP 客户端** | `src-tauri/src/mcp.rs:2914` | **没有 OS gate**,写死 `HOME` + `Library/Application Support/Claude`,Windows 直接失败 |
| 前台应用名 | `src-tauri/src/capture.rs:83` | non-macOS 返回 `None` → 来源标签空。要 `GetForegroundWindow` + `QueryFullProcessImageName` |
| overlay 不抢焦点 | `capture.rs` overlay 段 | macOS 靠 `focus:false` 够;Windows 要 `WS_EX_NOACTIVATE`。**最可能翻车处** |
| click-outside 消失 | `src-tauri/src/capture.rs:772` | 明确标了 macOS-only(CGEventTap) |
| 打包配置 | `src-tauri/tauri.conf.json` | `bundle.windows` 是空 `{}`,签名没配 |

### 4.4 硬约束:本机编译不了 Windows

`rustup target list --installed` 只有 `aarch64-apple-darwin`。
**第一步就该用 CI 把「能编译」拿下**——仓库已经有 `.github/workflows/pages.yml`
(官网自动部署),照它的样子加一个 `windows-latest` 的 build workflow 即可,不是从零搭。

---

## 5. 已完成记录(5.1–5.5 是 0.3.0 那批,5.6 是 2026-07-31 这批)

### 5.1 v0.3.0 发布 + 下载直连(都已上线可验证)

- tag `v0.3.0` → `2697822`;Release 非草稿非预发布:
  <https://github.com/KIM-ocean-HZ/spool/releases/tag/v0.3.0>
- **两个资产**:`Spool_0.3.0_aarch64.dmg`(带版本号)与 **`Spool-macOS-arm64.dmg`
  (固定名)**。官网/README 的下载按钮直连后者的
  `/releases/latest/download/…`,点一下就开始下,且永远指向最新版。
- ⚠️ **每次发布都必须补传那份固定名的副本**,漏了官网按钮当场 404 ——
  已写进 `docs/RELEASE.md §2.0.1`,含发布后自检命令。
- 下载链路端到端验过两次(改前改后):HTTP 200、**下载回来的 sha256 与本地公证产物
  逐字节一致**(`5e68ecfe…54c`)、下载副本 `stapler validate` / `spctl` /
  `syspolicy_check` 全过。
- 首页 fineprint 补了「Apple 芯片」——直连下载后用户不再经过 Releases 页,
  机型要求必须在按钮边上说清。

### 5.2 干净安装冒烟测试(全过)

真库先归档(两份、逐文件 sha256 校验)再清空 app 路径,从 **dmg** 装(不是从构建目录拷):

| 项 | 结果 |
|---|---|
| 首启建库 | ✅ 直建 v8,`integrity_check ok`,自动写 pre-migration 快照 |
| 教程脉络 | ✅ 两条 + 「未分类」捕捉目标,12 块 |
| 双击 ⌥ 捕捉 | ✅ `TRIGGER gap=193ms` → 块落进「未分类」,并 `suppressed ⌥ press/release` |
| 打包 ⌘⇧P | ✅ 打包窗 → 复制到剪贴板,3,213 字符 |
| 搜索 ⌘⇧F | ✅ 中文 FTS 两条命中、高亮、面包屑都对 |
| 教程可删且不复现 | ✅ 软删后重启不回来;捕捉目标自愈保留 |
| Gatekeeper | ✅ app 与 dmg 全过(含 `syspolicy_check`) |
| MCP | ✅ 新装二进制 `--mcp` 起得来,10 工具,数据目录正确 |

**没做的**:中文输入法回车(要真 IME)、抓包零出网(之前验过,这次没重跑)、
旧库升级(真库已归档,不拿真数据试)。

**两个现场发现(都已处理)**:
1. `/Applications/Spool 2.app` —— 今早 09:10 的旧构建,**同一个 bundle id**,
   按 bundle id 唤起时 LaunchServices 挑中了它。已移废纸篓。
   **以后手工拷 app 进 /Applications 别留「Spool 2.app」。**
2. `~/Library/LaunchAgents/Spool.plist` 指向 **`src-tauri/target/debug/spool`** ——
   开机自启拉起仓库里的 debug 构建对着真库跑,正是 5/29 事故的模式。已删(备份在归档目录)。

### 5.3 值得改的产品问题:半授权状态会抢掉别人的手势 ✅ 已修(见 5.6)

实测状态「Accessibility 授了、Input Monitoring 没授」下:
tap 装在 `HID/active`(能删事件),但 `COPY_GATE_ACTIVE` 跟的是 **Input Monitoring**
(`double_tap.rs:569`),于是 copy-gate **关闭** →
**任何裸双击 ⌥ 都被 Spool 捕捉并从事件流删掉**,Claude Desktop 的同款手势收不到,
和 copy-gate 的设计初衷正好相反。日志实证:`TRIGGER gap=193ms (⌘C 164222197ms ago)`。
**修法(已实施,`4b68f33`)**:把 SUPPRESS 也绑到 Input Monitoring 上——gate 不生效就不该独占。
⚠️ **但「辅助功能已授 + 输入监听未授」这个组合本身没在实机上复现过**:隔离验证的构建是全新
identifier,两个授权都没有,走的是 `!ax` 那条老分支。**下一个窗口做 §2.1 时顺手补这一验**
(给 verify 构建只授辅助功能,看日志是不是 `session/listen-only` + 那句 §5.3 的说明,
且裸双击 ⌥ 不再被吞)。

### 5.4 EN 区标(已提交 `6ab0152`)

区标选 A:EN 下 `uppercase`、`tracking-wide` 保留、**字号不动**,中文分支不变。
官网/README **没有**换 EN 截图——理由写在 `docs/DESIGN_EN_TYPOGRAPHY.md` 末尾。
⚠️ 那份批复里「默认语言仍是 zh」的前提**已被 Ocean 推翻**,而且 §2.2/2.3 已经落地(§5.6)——
`docs/DESIGN_EN_TYPOGRAPHY.md` 末尾那段「不换 EN 截图」的理由**现在站不住了**:
默认就是英文,界面和教程都有英文版。**官网/README 换不换 EN 截图,该重新拍板了**
(截图多场景铁律见 memory `next-stage-goals-website-portfolio`)。

### 5.5 临时环境已拆

`~/Desktop/Spool-Demo`(移废纸篓)、`com.oceanjin.spool.verify` 数据目录与 WebKit 缓存(已删)、
Claude Desktop 配置里的 `spool-demo` 条目(已删,改动前备份
`claude_desktop_config.json.bak-precleanup-20260730`)。`mdfind` 复查已无认领者。
2026-07-31 这批的隔离验证环境同样已拆:verify 数据目录/偏好/缓存已删、
`tauri.conf.json` 的 identifier 已还原、`target/…/Spool.app`(带 verify identifier)已删,
`mdfind` 复查无认领者。**唯一还在的是 §1.1 的 `SpoolTapProbe.app`**(还在等你授权)。

### 5.6 上手体验:2.2 + 2.3 + 5.3(2026-07-31,五个提交,**未推送**)

`9940a68` `4b68f33` `0637c74` `58ea941` `a9f9fa5`。基线:`npx tsc -b` 干净,
`npx vitest run` 155 全过(新增 3 个用例),`cargo check` 干净。

**做了什么**

| 位置 | 改动 |
|---|---|
| `src/lib/db/client.ts` | 教程两条脉络中英两套文案(`TUTORIAL` 表),`seedTutorialThread(db, lang)` / `seedDefaults(db, lang)`;「收件箱/未分类」「Spool 指南」也按语言取 |
| `src/stores/settingsStore.ts` | `language` 初值改 `languageForLocale(navigator.language)`(`zh*` → zh,其余 → en) |
| `src/App.tsx` | 启动顺序:先 `await loadSettings()` → `setSeedLanguage()` → 才开库;应用快捷键那个 effect 改跟 `loaded` 走,不再重复 load |
| `src/components/PermissionBanner.tsx` | 内联 `中文 / English` 切换(Ocean 选的形态),两个 phase 都显示 |
| `src-tauri/src/double_tap.rs` | 主动 tap 改成 `ax && granted` 才建(§5.3 的修法) |

**三条设计约束,改这块前先读**
1. **教程文案是数据,不是 UI 字符串**:落库后可编辑可删,切语言不会也不该回译。
   所以只能在播种那一刻定语言——这就是启动顺序必须「设置在前、开库在后」的原因。
2. **系统判定永不落盘**:`settings.json` 里出现 `language` 只可能是用户手动选过,
   `load()` 让它压过系统判定。别写任何「把检测结果存回去」的代码,那会永久冻结第一次的猜测。
3. **`db/client.ts` 不许 import `settingsStore`**:store 在模块层就碰 Tauri 事件 IPC,
   node 跑的 Vitest 会当场炸。语言经 `setSeedLanguage()` 交进去。

**实机验证(隔离 identifier,已拆干净)**

| 场景 | 结果 |
|---|---|
| 干净安装 @ 英文系统(Ocean 本机 `en-CN`) | ✅ 全英文 UI + `Welcome to Spool` / `Put your AI to work on Spool` / `Inbox` / `Unsorted` / 来源 `Spool Guide`;settings.json 没生成(检测未落盘) |
| 干净安装 @ 模拟中文系统 | ✅ 全中文 UI + 中文教程;同样没落盘 |
| 提示条点「中文」 | ✅ 整个界面当场翻,`settings.json` 写入 `language: "zh"` |
| 手动选过之后重启(系统 locale 仍是中文) | ✅ 界面保持英文,已播种的中文教程行原样不动 |

⚠️ **没验到的**:§5.3 那个修法只做了代码 + `cargo check`,
「辅助功能已授、输入监听未授」的组合没在实机复现过(隔离构建两个授权都没有,走的是旧的 `!ax` 分支)——
补验方法写在 §5.3 里。中文输入法回车、抓包零出网这两项这批也没重跑。

**验证手法值得留着**:`defaults write <bundle-id> AppleLanguages -array "zh-Hans-CN"`
只改一个 app 的 locale,webview 的 `navigator.language` 跟着变——不用动系统设置就能验两条路。
已连同上面三条约束写进 memory `ui-language-follows-system`。

**顺手修的**:教程里两处「设置 → 通用 → 一键接入」写错了,一键接入自 2026-07-12 分标签页后
就在 **MCP** 页,照着点找不到。中英两套一起改(`9940a68`)。
⚠️ **存量库的旧文案不会变**(种子不补存量库),Ocean 自己那份库里还是「设置 → 通用」。

---

## 6. M1(AI 引擎)—— 已全批,排在上面这些之后

`docs/DESIGN_AI_ENGINE.md` **已全批**(§6 四项 2026-07-29 通过)。范围按 §5:
**检测 + 设置页小节 + 单动作「提炼结论」端到端(含取消/超时)**。

| 要动的地方 | 位置 | 现状 |
|---|---|---|
| 新模块 `engine.rs` | `src-tauri/src/` | 待建 |
| 两个开关(渲染前提) | `src/stores/settingsStore.ts` | `mcpEnabled` / `mcpWriteEnabled`,默认 false |
| Rust 侧读同两个开关 | `src-tauri/src/mcp.rs:530` | 已存在,**别新写一套** |
| 设置页「本机 AI 引擎」小节 | `src/components/Settings/McpConfig.tsx` | MCP tab 宿主 |
| ⋯ 菜单加「让 AI 维护」组 | `src/components/ThreadView/ThreadHeader.tsx:251` | 照现有两项抄 className |
| MCP prompts 面 | `src-tauri/src/mcp.rs:3077` | 现只有 `compress_pack`;prompt 文本与 engine.rs 同一常量源 |

**两条约束**:①宪法探针(§2.4)是验收必测;②不新增权限面——入口渲染条件 =
检测到客户端 + `mcpEnabled` + `mcpWriteEnabled`,缺一整组不出现。

---

## 7. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
4. i18n:**中文即键**(代码 key 用中文,与 UI 默认语言无关),新 GUI 文案同步补 EN。
   **官网文案要大白话**。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点)同样需要明示。**
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
