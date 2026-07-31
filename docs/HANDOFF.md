# 交接文档 — 2026-08-01(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`capture-note-first`、`double-tap-exclusivity`、
> `isolated-verify-workflow`、`next-stage-goals-website-portfolio`、`mcp-first-pivot`、
> `spool-db-wipe-incident`、`ui-language-follows-system`)。完成后删除本文件。

---

## 0. 一句话状态

**21 个提交在本地 main 未推送**(本窗贡献 `a3cfba2` 和这次的文档提交)。基线全绿:
`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。Ocean 本机
`/Applications/Spool.app` 还是 `a696d4a` 那批(2026-08-01 01:25,见 §4.6),
两个授权都在,tap 在 `HID/active`。真库 `integrity_check ok`,v8 / 15 块。

**Ocean 2026-08-01 手测把上一版欠的全结了**(§1.3),note-first 只剩「Spool 不在前台时
键盘不进浮窗」一条。本窗按 §1.1 的定案改完了代码(`a3cfba2`),**但它必须真手指验**,
而验它要先换装 —— **换装等 Ocean 明示**(§1.2 是完整的验收单)。
剩下的长线是 §2 的 MCP 生态宣传。

---

## 1. ⚠️ 主线:note-first 收尾

### 1.1 定案:不走 AppKit,走辅助功能(`a3cfba2`,已实现待验)

**问题收敛到唯一一条**:Spool 不在前台时,双击 ⌥ 弹出的浮窗拿不到键盘。
根因是 macOS 只把键盘发给**活跃应用** —— 浮窗即使是 Spool 自己的 key window 也收不到
(手写 NSPanel 子类那次拿到了 `isKeyWindow=true`,键盘照样不来,已证伪、已回退)。

**C-1 原样(热键回调里同步 `NSApp.activate`)判死,别再试。**
§1.4 测出激活请求不是「过期作废」而是**挂起**,所以「授权窗口过期」本来就不是失败原因,
把调用提前到 Rust 侧同步执行改变不了结果,只会把闪窗成因一原样请回来。
何况真实触发路径是双击 ⌥ —— CGEventTap 只是**观测**,事件根本没投递给 Spool,
「刚收到用户按键的 app」这个赌注在这条路径上最站不住。

**改走的路**:给应用元素设 `AXFrontmost`(= `System Events` 的
`set frontmost of process` 底下那个调用)。**立即生效不排队**,对任何 pid 都能用,
所以同一个调用管两个方向:弹出时把前台拿过来,关闭时按 pid 还回去。
**不新增授权**(抑制型 tap 本来就要辅助功能)、**不新增依赖**(externs 声明在已链接的
ApplicationServices 上,跟 `AXIsProcessTrusted` 一个路子)。**C-2 `tauri-nspanel` 不用批了。**

完整推导、落地要点、行为变化都在 `docs/DESIGN_CAPTURE_NOTE_FIRST.md` §3.6。三条要记住的:

- 激活在 `win.show()` **之后**;先激活的话拿到 key 的会是主窗。
- 只在「用户人在别的 app」时激活,与压低主窗同一个判据。**Spool 已在前台那条路径一行没动**
  (Ocean 已验过它是好的)。
- 没有辅助功能授权时整段不触发,行为与改动前完全一致。

### 1.2 ⚠️ 下一个窗口的第一件事:换装 + 真手指验收

**脚本验不了,只能真手指按。** 正式版 tap 在 HID 层看不见 `CGEventPost` 的合成事件;
隔离构建又没有辅助功能授权,AX 这条路直接不触发 —— 两头堵死(§4.3 的 ⚠️ 和设计稿 §3.6)。

**换装需 Ocean 明示(硬规则 7)**,步骤照抄 §4.6(签名身份必须一模一样,否则两个授权当场失效)。
换装前照例 `VACUUM INTO` 快照真库。

**验收单(在 TextEdit 之类的别的 app 里双击 ⌥,四条关闭路径各走一遍)**:

| 看什么 | 通过标准 |
|---|---|
| 弹出后**直接打字** | 字进批注框 —— **这条是这次改动的全部目的** |
| 浮窗在的那几秒前台是谁 | **是 Spool。这是对的,别当 bug** —— 见下面的 ⚠️ |
| 主窗 | 全程不动(压在 -1 层) |
| Enter / Esc / 点 ✕ / 8 秒自动消失 | 关掉之后**前台回到来源 app**,四条都要回 |
| stderr | 不该出现 `[capture] AXFrontmost refused` |

⚠️ **和上一轮的判据是相反的,对表时别看错。** Ocean 2026-08-01 那轮测的是**不激活**的版本,
判据是「前台该一直是你原来那个 app」;现在**要零摩擦打字就必须拿前台**,这是 C 路线的定义,
不是回归。新的判据是「**关闭之后**必须还回去」。

⚠️ **唯一没证实的技术点**:`AXFrontmost` 设在**自己** pid 上会不会被拒。对别的 app 设是
窗口管理器的常规操作;对自己设没有公开反例也没有公开保证。
**被拒时的表现**:stderr 打 `[capture] AXFrontmost refused`,浮窗照旧可用,
点一下批注框再打字(点击是 OS 永远认的激活来源)。
**若真被拒,下一步**:让**别的进程**代劳 —— `osascript` 让 System Events 把 Spool 自己的
pid 设成 frontmost。那是「别人来激活」的已知可行形态,代价是热路径多一个子进程。

**如果连那条也不行,才回 A(接受「点一下再打字」)**,并且**必须同批改文案**:
`site/index.html` 的 `l1-p`、`site/assets/i18n.js` 的中文对应项、`README.md` 里
「光标已经在批注框里 / cursor already in the note box」。这批文案已提交但**未推送**,
正好赶得上改。**验收通过就不用改** —— 那句话届时是准的。

### 1.3 上一版欠的三条验证 —— 全结了(Ocean 2026-08-01 手测)

1. **中文输入法**下 Enter/Esc 误触发:**✅ 不误触发,结案。**
2. **闪窗**三条(不碰它 / 点 ✕ / 写字后 Esc·Enter):**✅ 全过,`a696d4a` 结案。**
3. §1.4 存疑的那条:**✅ Spool 已在前台时批注框确实拿到光标**,不点也能打字 ——
   §4.3 记的那条 ✅ 是准的,上一版验不出来只是因为 HID tap 看不见合成键入。
   **note-first 的前提没有变弱。**

### 1.4 闪窗定案(`a696d4a`):两个独立成因,`ecd71a9` 一个都没打中

完整推导、实测表格与两条局限写在 `docs/DESIGN_CAPTURE_NOTE_FIRST.md` §3.5。摘要:

- **成因一(主因):`win.set_focus()` 里的 `activateIgnoringOtherApps:YES`。**
  从后台 app 调用时现代 macOS 不是「忽略」而是**挂起**,等 Spool 下次有够格当 key 的
  窗口时兑现 —— 正好是浮窗被 `orderOut` 那一瞬。所以主窗是**关闭时**窜前的,
  调隐藏/激活的先后顺序不可能拦住。**比闪窗更严重的是**:没人碰的那次捕捉(8 秒自动消失)
  走不到归还分支,Spool 直接把前台端走不还。**修法:删掉 `set_focus()`** ——
  `win.show()` 本身就是 `makeKeyAndOrderFront`,该做的一件不少。
- **成因二(Ocean 说的「点 × 会闪」):点浮窗必然激活 Spool,macOS 按 app 整体分层。**
  修法:浮窗存续期间把主窗压到 `BelowNormalWindowLevel`(`set_always_on_bottom`,
  不引依赖不写 objc),来源 app 激活之后再恢复。
- **顺带**:焦点归还基本没生效过 —— 前台查询只有 80ms 预算却要跑 osascript。
  Rust 侧改为兜底读 2 秒内的 `FRONTMOST_CACHE`。

**验证方法本身建议留用**:`CGWindowListCopyWindowInfo` 每 20ms 采一次 z-order(十几行 C,
源码在会话 scratchpad)。z-order 是客观事实,比「看着像闪了一下」可靠;
上一版就是因为只能靠合成点击复现才判断错了成因。

⚠️ **隔离构建验不了的一条**(§3.5 有详情):新 identifier 没有 System Events 自动化授权,
`get_foreground_app()` 恒 None,「有来源 app」那条分支是用临时环境变量喂进去验的。
(当时列的第二条 —— Spool 已在前台时批注框有没有光标 —— Ocean 已手测 ✅,见 §1.3。)

⚠️ **隔离构建从此也验不了 §1.1 那条改动**:AX 那条路要辅助功能授权,隔离 identifier 没有,
整段不触发;而给它授权又会把 tap 推到 HID 层、合成事件就消失了。**两头堵死,只能真手指。**

---

## 2. 新任务:把 MCP 生态讲清楚(官网 + app 内)

**Ocean 2026-07-31 提出。** 两层目的:对外**用已支持的客户端阵容拉动下载**
(让本来就在用这些工具的人产生兴趣),对内**别让用户看不懂**。

### 2.1 官网:MCP 客户端阵容 + 品牌 logo

现在官网只在流程里提了一句 MCP,没有「支持哪些客户端」的直观呈现。要加一段展示一键接入
已覆盖的六个:**Claude Desktop / Claude Code / Cursor / VS Code / Windsurf /
ChatGPT · Codex**,最好带各自 logo,一眼看懂。

**动手前先想清楚三件事**:
- **logo 是第三方商标**。要用各家官方 brand assets 并遵守其使用规范(多数允许「表示
  兼容性」的引用,但对变形、配色、暗示背书有限制)。这属于对外风险面,
  **先把打算用的清单和来源列给 Ocean 过一眼**,别直接扒图。拿不准就退一步用纯文字 +
  统一风格的单色图标。
- **官网是静态站且 CSP 严格**,资源必须自托管在 `site/assets/`,不能外链 CDN。
- **文案要大白话**(硬规则 4)。别写「支持 Model Context Protocol」,
  要写「你已经在用的 AI 工具,一键就能读到你的 Spool」。

### 2.2 官网 + app:说明「VS Code / Claude Code 的 MCP 跟桌面版不一样」

这是 Ocean 特别点出的困惑点。差异讲人话:

| | Claude Desktop / ChatGPT 桌面版 | **Claude Code / VS Code** |
|---|---|---|
| 形态 | 独立聊天 app | 编辑器里 / 命令行里的 AI |
| 接好后在哪用 | 直接在聊天框里说 | 在编辑器的 AI 面板 / 终端里说 |
| 生效时机 | 重启客户端 | 重启客户端(VS Code 要重开窗口) |
| 用户容易卡在哪 | 以为装了就能用 | **以为要回 Spool 里操作**,其实是回编辑器里问 AI |

落点两处:
- **官网**:阵容展示里给这两个加一句区分说明。
- **app 内**:`src/components/Settings/McpConfig.tsx` 客户端列表下面。那里已经有
  「示例用法:接入后可以对 AI 说什么」折叠段,**建议在同一处扩一句「在哪儿说」**,
  而不是新开一块 UI —— 设置页已经不短了。
- ⚠️ 教程种子里那条 MCP 说明**只影响新装库**(5/29 红线),存量用户看不到,
  所以设置页那处才是老用户的入口(`docs/DESIGN_MCP_ONBOARDING.md` B1 方案)。

**这是设计类任务,按硬规则 6 先出方案交 Ocean 批,再动手。**

---

## 3. 杂项规矩(本窗新增)

- **`AGENTS.md` 已按 Ocean 2026-08-01 明示删除**(那是 Codex 版的同一份行为规则,
  `CLAUDE.md` 已经覆盖)。它从来没进过 git,所以这里没有提交。
  ⚠️ 仍然别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
- **推送需 Ocean 明示**(硬规则 7)。`git rev-list --count origin/main..main` = **21**
  (跨好几个窗口攒下来的)。
  ⚠️ 推 main 会触发 `pages.yml` 自动部署官网,而官网文案里「光标已经在批注框里」那句
  **要等 §1.2 的验收结果才知道准不准** —— 验收通过它就是准的,被拒且兜底也不行才要改。
  **别在验收前推。**

---

## 4. 本窗完成记录

### 4.1 权限提示条:B 路线判死,回退 A(`c757553`)

探针结论:输入监听授权翻转后,**同一进程**的 `CGPreflightListenEventAccess` 永远返回
false(同一签名的二进制新开进程立刻返回 true)—— CG 按进程缓存 TCC 判定,免重启重建 tap
不成立。改为 `granted-later` 态加「立即重启 Spool」按钮 + Rust 侧 `restart_app` 命令
(`app.restart()`,**没引 plugin-process**)。探针已彻底清理(进程、TCC 记录、桌面 app)。

### 4.2 MCP 一键接入三个拍板(`b506f13`)+ **真机验证全过**

| 拍板 | 落地 |
|---|---|
| ① ChatGPT 桌面版 / Codex | `~/.codex/config.toml` 的 `[mcp_servers.spool]`,引 `toml_edit`(非 `toml`) |
| ② 国内 GUI 型客户端 | 只给「复制配置」,文案改成明说「你的 AI 工具不在上面?」 |
| ③ 未装的客户端 | 继续灰显 + 「去下载」按钮开官网(`open_mcp_client_page`) |

**真机验证(Ocean 授权后做,先备份了两个配置文件)**:把 Claude Code 与 VS Code 的条目
故意改成 stale → UI 正确识别「路径已变」→ 点「更新配置」→ 两边都修好;
`~/.claude.json` 的 **50 个顶层键与 6 个 projects 状态一字未动**,`.bak` 已生成;
之后 `claude mcp list` 报 **✓ Connected**。VS Code 的键名是 `servers`(不是 `mcpServers`)。

**Codex 那条是最好的真实验证**:`[mcp_servers.spool]` 被合并进一个含 marketplaces、
十几个 plugins、嵌套 env 表和内联数组的真实大 TOML,**其余内容完全没被重排** ——
这就是选 `toml_edit` 的理由。过程中截图还意外拍到 Codex 桌面版正通过 MCP 读 Ocean 的库,
列出「3 个主题…6 条内容,1 条置顶」,与实际吻合。

### 4.3 捕捉重构:note-first + 删收集面板(`89166e1` `7e1ddd6` `ecd71a9`)

**收集面板整体删除**(38 文件,-1746 行):单击/双击/长按挤在一个键上、时间窗重叠
(单击结算 300ms < 双击窗 500ms),单击行为漂移是**结构性歧义**,不是可修 bug。
批量摘录由「连续双击 + 主窗多选合并」替代。

**三个对 Ocean 原始想法的修正**(理由见设计稿,别回退):点外部时**空框才算没笔记**;
批注框**不能用 onBlur 提交**(浮窗内点图钉/改投都会 blur);自动消失改成跟「框里有没有字」走。

**脚本实测通过五条**:双击后光标在批注框(**Spool 已在前台时** —— Ocean 2026-08-01
真手指复核过,这条 ✅ 是准的)、Enter 保存、Esc 丢弃、点外部保留非空草稿、空框 8 秒自走。
外加英文种子含新教程行、MCP 二进制回归正常。**没通过的那条就是 §1.1,已改待验。**

### 4.4 桌面正式版换新

`/Applications/Spool.app` 已换成本批构建(Developer ID 签名、`codesign --verify` 通过)。
换装前真库备份在
`~/Library/Application Support/com.oceanjin.spool/backup-pre-noteFirst-20260731/`。
旧版进废纸篓,**没留下「Spool 2.app」**。
⚠️ 装机版**未公证**(公证要 App 专用密码,按硬规则 8 不落盘),本地拷贝无 quarantine 标记
所以启动不受影响;**正式发版必须补 RELEASE.md 的公证步骤**。
另:本次 dmg 打包曾失败(`/Volumes` 有遗留挂载),已按 RELEASE.md §2.1 清场。

### 4.5 「unverified file」结论:不用管

Chrome 那个提示来自 **Google Safe Browsing 的下载信誉**(按全网下载量算),与 Apple 公证
是两套独立系统 —— 公证管的是 macOS Gatekeeper,那条链路上一批已端到端验过。
Ocean 观察到 Codex 的下载也一样,正好印证。下载量上来会自己消失。**已定调跳过。**

### 4.6 换装含闪窗修复的构建(2026-08-01,Ocean 明示)

`/Applications/Spool.app` 已换成 `a696d4a` 这批。**关键一步是签名身份必须和旧装机版一模一样**
(TCC 的 csreq 绑代码签名,换签名 = 两个授权当场失效,memory `isolated-verify-workflow` §6):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)"
npx tauri build --bundles app        # 只出 .app,本地换装不需要 dmg
ditto <新>/Spool.app /Applications/Spool.app   # 用 ditto 不用 cp -R,保签名
```

装前查了 `mdfind kMDItemCFBundleIdentifier` 只有两个认领者,装后仍是两个 ——
**没留下「Spool 2.app」**。旧版进废纸篓 `Spool-0.3.0-pre-flashfix-<时间>.app`。
真库换装前 `VACUUM INTO` 快照:`~/Desktop/spool-snapshot-20260801-pre-flashfix-install.db`
(`integrity_check ok`,v8,15 块);库的 `user_version` 与代码 `SCHEMA_VERSION` 都是 8,
不触发任何迁移分支。

**换装后启动日志一行定生死**:
`[double-tap] installed at HID/active (consumed double-taps are deleted from the stream …)`
—— 出现这行就说明输入监听 + 辅助功能都还在。抓法:
`open --stdout out.log --stderr err.log -a /Applications/Spool.app`。

⚠️ **未公证**(公证要 App 专用密码,硬规则 8 不落盘)。本地 `ditto` 进去的拷贝没有
quarantine 标记,启动不受影响;**对外发版必须补 RELEASE.md §2 第 5 步。**
⚠️ 换装时 Claude Desktop 的 `--mcp` 子进程没动(它们持有旧 inode,继续工作到自己退出为止)。

---

## 5. 再往后(优先级不变)

1. **官网表单选型**(邮箱订阅 + 反馈)—— 静态站收表单要第三方,**选型必须 Ocean 单独批**。
2. **M1 AI 引擎**(`docs/DESIGN_AI_ENGINE.md` 已全批)—— 范围见该文 §5。
   两条约束:宪法探针是验收必测;不新增权限面。
3. **Windows 版**(排最后)。勘查结论在 `git show 8c58388:docs/HANDOFF.md` §4,
   三个待拍板点:捕捉手势替代、签名分发花钱、首版范围。
4. **截图重拍**:含捕捉浮窗的两张(`site/assets/shots/capture-toast.png`、
   `docs/screenshots/capture-toast.png`)—— 但**等 §1.2 拍板后再拍**,不然白拍。
   数据环境照旧 `scripts/seed-demo-library.sh`(写 verify 目录,不碰真库)。
   其余截图不受影响,别动。

---

## 6. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
   (注意:提交信息里出现「Claude Desktop / Claude Code」这类**第三方客户端品牌名**属于
   产品内容,不是署名,允许 —— 自检别把 `claude` 一词也 grep 进去,会误报。)
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
