# 交接文档 — 2026-07-31 深夜(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`capture-note-first`、`double-tap-exclusivity`、
> `isolated-verify-workflow`、`next-stage-goals-website-portfolio`、`mcp-first-pivot`、
> `spool-db-wipe-incident`、`ui-language-follows-system`)。完成后删除本文件。

---

## 0. 一句话状态

**七个提交都在本地 main,未推送。** 基线全绿:`npx tsc -b` / `npx vitest run`(152)/
`cargo test`(16)。Ocean 本机 `/Applications/Spool.app` 已是本批构建,两个授权都在,
tap 在 `HID/active`。真库已备份,验证全程未被污染(12 块、`integrity_check ok`)。

上一版交接的四件事全做完了(§4)。**这一版只剩一件真正的活:§1 的 note-first 收尾。**
另外新加一件产品向任务:**官网/app 里把 MCP 生态讲清楚**(§2)。

---

## 1. ⚠️ 主线:note-first 收尾(Ocean 已拍板走 C)

### 1.1 现状:弹窗做好了,但「直接打字」在 macOS 上还没打通

**实测(隔离构建 + 可绑定快捷键,来源 app = TextEdit)**:浮窗正常弹出、批注框和
placeholder 都在,**但接着打的字全进了 TextEdit,批注是 NULL**;前台自始至终是 TextEdit。

两条 macOS 硬约束叠在一起:
1. **键盘事件只发给「活跃应用」** —— 浮窗即使是自己 app 内的 key window 也收不到。
2. **后台 app 不能自行抢占激活** —— `win.set_focus()` 无效,直接调
   `[NSApp activateIgnoringOtherApps:YES]` 也无效(现代 macOS 的协作式激活)。

**已经试过并回退、别重走**:把浮窗运行时 `object_setClass` 成 NSPanel 子类(覆写
`canBecomeKeyWindow` / `canBecomeMainWindow`)。确实拿到了 `isKeyWindow=true` 且点击不再
抢激活,**但键盘照样不来** —— 印证约束 1。实验代码已从 `capture.rs` 移除,结论留在
`docs/DESIGN_CAPTURE_NOTE_FIRST.md` §3。

**当前实际可达的是「点一下批注框再打字」**:用户点击是合法的激活来源,点完 Spool 被激活、
光标进框、打字与 Enter 保存全部正常,来源 app 内容不受影响(已实测)。

### 1.2 Ocean 拍板:**先走 C,实在不行再回 A**

**C = 继续攻**,两条路:

- **C-1 在热键回调里同步激活**(先试这条,不花钱不引依赖)。
  赌的是 macOS 给「刚收到用户按键的那个 app」一个短暂的激活授权窗口。
  **关键点**:现在链路是 `hotkey → Rust emit → JS 监听 → invoke show_capture_overlay`,
  绕了一整圈异步,轮到激活时授权窗口早过期了。要试就得在**收到热键/tap 事件的那一刻、
  在 Rust 侧同步**把 app 激活,再让后续流程走原路。双击 ⌥ 同理(在 `double_tap.rs` 回调里)。
- **C-2 引 `tauri-nspanel`**。**依赖需 Ocean 单独批**(硬规则 2)。
  注意手写 NSPanel 版本已证伪:若该插件也只是同一套 AppKit API,大概率同样结果 ——
  批之前先想清楚它凭什么能绕过约束 1,别为了引而引。

**A = 接受「点一下再打字」**(兜底)。若回 A,**必须同批改文案**:
`site/index.html` 的 `l1-p`、`site/assets/i18n.js` 的中文对应项、`README.md` 里
「光标已经在批注框里 / cursor already in the note box」这句是**不准确的**
(只有 Spool 已在前台时才成立)。这批文案已提交但**未推送**,正好赶得上改。

### 1.3 还欠 Ocean 两条真手指验证(脚本验不了)

1. **闪窗 bug 是否真修好**。`ecd71a9` 改了顺序(先激活来源 app、再隐藏浮窗),
   推理清楚但我用合成点击复现不了(点击总落到别的窗口上)。**请点一下浮窗的 × 确认**。
2. **中文输入法**下写批注:组合汉字时按 Enter / Esc 会不会误触发保存或丢弃。

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

- **`AGENTS.md` 不提交。** 仓库根目录有个未跟踪的 `AGENTS.md`(Codex 版的同一份行为规则),
  **Ocean 2026-07-31 明确:不提交**。⚠️ 别用 `git add -A` 一把梭,会把它扫进去
  (本窗发生过一次,已拆出来)。提交前先 `git status --short` 看一眼。
- **推送需 Ocean 明示**(硬规则 7)。七个提交都在本地。
  ⚠️ 推 main 会触发 `pages.yml` 自动部署官网,而官网文案里「光标已经在批注框里」那句
  在 §1.2 拍板前是不准确的 —— **别在改文案前推**。

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

**脚本实测通过五条**:双击后光标在批注框(**Spool 已在前台时**)、Enter 保存、Esc 丢弃、
点外部保留非空草稿、空框 8 秒自走。外加英文种子含新教程行、MCP 二进制回归正常。
**没通过的那条就是 §1.1。**

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
