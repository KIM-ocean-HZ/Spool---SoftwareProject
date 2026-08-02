# 交接文档 — 2026-08-01(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`capture-note-first`、`spool-db-wipe-incident`、
> `double-tap-exclusivity`、`isolated-verify-workflow`、`write-plainly-for-ocean`、
> `next-stage-goals-website-portfolio`、`mcp-first-pivot`、`ui-language-follows-system`)。
> 完成后删除本文件。
>
> **捕捉这条线到此收官(§1 已验收、已换装、已推送)。本窗要做的是 §2:MCP 生态宣传 ——
> 那是设计类任务,按硬规则 6 先出方案交 Ocean 批,再动手。**

---

## 0. 一句话状态

**已推送到 `origin/main`**(2026-08-02,Ocean 明示;这次推送同时触发了 `pages.yml` 部署官网)。
基线全绿:`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。
真库 `integrity_check ok`,v8 / 15 块 / 3 脉络 / 1 工作区。

**捕捉这条线收官了。** 浮窗挪进独立进程(`74b87f1`)设计稿四关**全过**,
最后那关 **Ocean 2026-08-02 真手指验收:全部通过** —— 主窗不再沉底、点浮窗主窗也不动、
note-first 五条与四条关闭路径全对、图钉与改投正常。
`/Applications/Spool.app` 就是这批(§4),两个授权都活着。

**👉 下一件事是 §2:把 MCP 生态讲清楚(官网 + app 内)。设计类任务,先出方案交 Ocean 批。**

---

## 1. 已收官:辅助进程改造 —— Ocean 2026-08-02 真手指验收全部通过

装机版就是这批(§4)。他逐条验过的:

**第一组(这次改动的全部目的)**:窗口栈里 Spool 主窗夹在中间,从别的 app ⌘C + 双击 ⌥ ——

1. ✅ 浮窗弹出那一刻主窗**纹丝不动**(以前会沉到最底下)。
2. ✅ **用鼠标点浮窗(✕/图钉/批注框)主窗也不动** —— 这条是重点,旧架构下点 ✕ 会闪就是它。
3. ✅ 关掉浮窗后窗口顺序不变。

**第二组(note-first 回归,与 `a3cfba2` 那次同一批,清单见 §5.1)**:✅ 五条全过 ——
不点鼠标直接打字进批注框、Enter 保存、Esc 丢弃、点 ✕ 关闭、8 秒自走,
四条关闭路径**前台都回到来源 app**。浮窗上的**图钉与改投**(现在绕一圈回主进程写库)也正常。

**所以设计稿 `docs/DESIGN_CAPTURE_HELPER_PROCESS.md` 四关全过,那份设计稿可以视为完结。**

⚠️ 两件对以后有用的既成事实:
- **活动监视器里会多一个 `spool --overlay` 进程**,常驻 87MB —— 设计里认过的代价,不是 bug。
- **Dock 里不会多图标**(辅助进程 Accessory 策略,`lsappinfo` 报 `UIElement`)。

---

## 2. 下一件事:把 MCP 生态讲清楚(官网 + app 内)

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

## 3. 上一窗完成记录:浮窗挪进独立进程(`74b87f1`)

设计稿 `docs/DESIGN_CAPTURE_HELPER_PROCESS.md` 已补 §6.1「实现与验收结果」,细节看那里。
这里只留下一个窗口需要知道的:

### 3.1 现在的形态

- `spool --overlay` 是**同一个二进制的第二个进程**,主进程在 setup 里拉起并监管
  (`src-tauri/src/overlay.rs`)。协议是 stdin/stdout 一行一个 JSON,跟 `--mcp` 一个路子。
- 辅助进程是 **Accessory 策略**(无 Dock 图标),**不需要任何 TCC 授权** ——
  由主进程 `ax_set_frontmost(辅助进程 pid)` 激活它。
- 🚨 **辅助进程零 SQLite**。浮窗六个 DB 调用改走 IPC 回主窗执行
  (`src/overlay/db.ts` 发,`src/hooks/useOverlayDbHost.ts` 收)。
  三道锁:没注册 sql 插件、capability 撤了 sql 权限、打包产物里 sqlite 命中数为 0。
  **以后动浮窗时别顺手从 `@/lib/db` import 东西**,那就是 5/29 事故的前提。
- 已删:`park_main_window`/`unpark_main_window`/`MAIN_WINDOW_PARKED`、
  `tauri.conf.json` 的 `overlay` 窗口声明、主进程所有 `emit_to(OVERLAY_LABEL, …)`。

### 3.2 自动化验过的(隔离构建 `com.oceanjin.spool.helperproc`,已清干净)

- **点浮窗后活跃 app 确实是辅助进程**(`lsappinfo front` 出的是它的 pid),
  **而 z-order 层 0 一帧没变** —— 这就是旧架构「点 ✕ 会闪」的成因二,压低已删,主窗照样不动。
- `lsof` 只有主进程持有 `spool.db`;六个 DB 操作(置顶/改投/批注/两个列表)全走通。
- 主进程 `kill -9` → 辅助进程 **1 秒内自退**(stdin EOF);辅助进程被杀 → 主进程重拉。
- 失败提示条、撤销卡片、⌘Z、8 秒自走、Enter 保存、✕ 关闭,全部实测正常。

### 3.3 改造中顺手补掉的一个坑

两个授权都没有、且用户**点过**浮窗时,辅助进程是活跃 app,藏掉它唯一的窗口会让前台
卡在一个「没有窗口可打字」的 app 上(实测确实卡住)。修法:这种「两条归还路都不知道
该还给谁」的情况下让辅助进程 `NSApp hide:` 退位,macOS 把前台交给下一个 app。
实测退位正确、下次 `unhide` 不抢焦点。**Ocean 本机两个授权都有,走不到这条路。**

### 3.4 遗留的小事(不是这次改动引入的,没动)

`src-tauri/capabilities/collect.json` 还留着,但 `collect` 窗口在 2026-07-31
删收集面板时就没了。是死文件,**没删是因为不在本次改动范围内** —— 下一个窗口顺手清掉即可。

---

## 4. 换装记录(2026-08-02 11:16,Ocean 明示)—— 已完成

`/Applications/Spool.app` 现在是 `74b87f1`。签名身份一字未改
(`com.oceanjin.spool` / `Developer ID Application: Hanze JIN (Q5Y5JRXZ58)`),
`codesign --verify --strict` 通过且 **satisfies its Designated Requirement** ——
所以两个 TCC 授权都活着,启动日志两行齐了:

```
[overlay] helper started (pid 26904)
[double-tap] installed at HID/active (consumed double-taps are deleted from the stream …)
```

- 换装前真库快照:`~/Desktop/spool-snapshot-20260802-111557-pre-helperproc-install.db`
  (`integrity_check ok`,v8,15 块 / 3 脉络 / 1 工作区)。**换装后真库复查一模一样**,
  没有新的 `pre-migration` 文件,任何迁移分支都没触发。
- 旧版进废纸篓 `Spool-0.3.0-pre-helperproc-20260802-111658.app`。
- `mdfind` 认领者两个(`/Applications/Spool.app` + 构建产物),**没留下「Spool 2.app」**。
- 进程树对了:主进程 26893,辅助进程 26904 是它的子进程;
  `lsappinfo` 报辅助进程 `ApplicationType=UIElement`(= Accessory,**Dock 里不会多一个图标**),
  主进程是 `Foreground`。
- Claude Desktop 那三个 `--mcp` 子进程没动(持有旧 inode,继续工作到自己退出为止)。
- ⚠️ **未公证**(公证要 App 专用密码,硬规则 8 不落盘);本地 `ditto` 进去的拷贝没有
  quarantine 标记,启动不受影响;**对外发版必须补 RELEASE.md §2 第 5 步。**

### 4.1 下次换装照抄这套

**关键是签名身份必须一模一样**
(TCC 的 csreq 绑代码签名,换签名 = 两个授权当场失效,memory `isolated-verify-workflow` §6):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)"
npx tauri build --bundles app        # 只出 .app,本地换装不需要 dmg
ditto <新>/Spool.app /Applications/Spool.app   # 用 ditto 不用 cp -R,保签名
```

换装前后照旧要做的:
- 真库 `VACUUM INTO` 快照到桌面,记 `integrity_check` / `user_version` / 块数;
- `mdfind kMDItemCFBundleIdentifier` 数认领者,换装前后都必须是**两个**,
  别留下「Spool 2.app」(memory `isolated-verify-workflow` §11);
- 退出用 `osascript -e 'tell application "Spool" to quit'`(优雅退出,别 kill);
- 启动日志一行定生死:
  `open --stdout out.log --stderr err.log -a /Applications/Spool.app`,
  要看到 `[double-tap] installed at HID/active`(说明两个授权都还在)。
  **这次还要多看一行**:`[overlay] helper started (pid …)`。
- ⚠️ **未公证**(公证要 App 专用密码,硬规则 8 不落盘);本地 `ditto` 进去的拷贝没有
  quarantine 标记,启动不受影响;**对外发版必须补 RELEASE.md §2 第 5 步。**
- ⚠️ Claude Desktop 的 `--mcp` 子进程不用管(它们持有旧 inode,继续工作到自己退出为止)。

---

## 5. 背景:note-first 这条线已经收官(`a3cfba2` 起)

完整推导在 `docs/DESIGN_CAPTURE_NOTE_FIRST.md` §3.5 / §3.6。要点:

- **不走 AppKit,走辅助功能。** `activateIgnoringOtherApps:` 从后台调用不是「忽略」
  而是**挂起**,会在下次 Spool 有够格当 key 的窗口时兑现 —— 那就是闪窗。
  改用 `AXFrontmost`(= `System Events` 的 `set frontmost of process`),**立即生效不排队**,
  对任何 pid 都能用,所以同一个调用管两个方向。**C-1 判死,别再试。**
- **激活在 `show()` 之后**;先激活的话拿到 key 的会是别的窗口。
- 没有辅助功能授权时整段不触发,行为与改动前一致。

### 5.1 Ocean 2026-08-01 真手指验过的(§1.2 那批,换装后要回归的就是这些)

- ✅ 从别的 app 双击 ⌥ 后**不点鼠标直接打字,字进批注框**。
- ✅ 主窗四条路径一次都没跳到最前。
- ✅ Enter / Esc / 点 ✕ / 8 秒自走,**四条关掉后前台都回到来源 app**。
- ✅ 中文输入法下 Enter/Esc 不误触发。
- ✅ Spool 已在前台时批注框也拿得到光标。

所以官网与 README 那句「光标已经在批注框里 / cursor already in the note box」是准确的,不用改。

---

## 6. 再往后(优先级不变)

1. **官网表单选型**(邮箱订阅 + 反馈)—— 静态站收表单要第三方,**选型必须 Ocean 单独批**。
2. **M1 AI 引擎**(`docs/DESIGN_AI_ENGINE.md` 已全批)—— 范围见该文 §5。
   两条约束:宪法探针是验收必测;不新增权限面。
3. **Windows 版**(排最后)。勘查结论在 `git show 8c58388:docs/HANDOFF.md` §4,
   三个待拍板点:捕捉手势替代、签名分发花钱、首版范围。
   ⚠️ 注意浮窗进程这次的改动是 macOS 形态(Accessory / AXFrontmost),Windows 要另想。
4. **截图重拍**:含捕捉浮窗的两张(`site/assets/shots/capture-toast.png`、
   `docs/screenshots/capture-toast.png`)。数据环境照旧
   `scripts/seed-demo-library.sh`(写 verify 目录,不碰真库)。其余截图不受影响,别动。

---

## 7. 硬规则(违反即事故)

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
   ⚠️ 推 main 会触发 `pages.yml` 自动部署官网。
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
