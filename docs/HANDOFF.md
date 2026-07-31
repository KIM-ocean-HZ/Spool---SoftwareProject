# 交接文档 — 2026-07-31 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`capture-note-first`、`double-tap-exclusivity`、
> `isolated-verify-workflow`、`next-stage-goals-website-portfolio`、`mcp-first-pivot`、
> `spool-db-wipe-incident`、`ui-language-follows-system`)。完成后删除本文件。

---

## 0. 一句话状态

**上一版交接的四件事全部做完**:§2.1(权限提示条死胡同)、MCP 一键接入三个拍板、
捕捉方式重构(note-first + 砍收集面板)、Ocean 桌面正式版换新。
基线全绿:`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。
**十二个提交都在本地 main,未推送。**

Ocean 本机现状:**两个授权都已就位**(辅助功能 + 输入监听),`/Applications/Spool.app`
已是本批次构建,tap 装在 `HID/active`(独占生效)。真库已备份,验证全程未触碰。

---

## 1. ⚠️ 待 Ocean 动手(只剩验证类,没有拍板)

1. 【三分钟】**真手指验一遍新捕捉**。日常场景:在浏览器/邮件里 ⌘C,双击 ⌥,
   **光标应该已经在批注框里** —— 直接打字,Enter 保存(Shift+Enter 换行),
   Esc 跳过,点旁边任意处也算完(框里有字会保留)。
   要确认的两条是脚本验不了的(理由见 §4.2):
   - **打完 Enter 之后,键盘焦点有没有回到你原来那个 app**(下一个 ⌘C 是不是还进原处)。
   - **中文输入法**下打批注:组合汉字时按 Enter/Esc 会不会误触发保存/丢弃。
2. 【可选】**长按 ⌥ 现在没有任何反应了** —— 收集面板整体删除,这是设计结果不是坏了。
   理由见 `docs/DESIGN_CAPTURE_NOTE_FIRST.md` §1.3;如果你其实还想要批量摘录,
   现在的替代是「连续双击 + 主窗多选合并」,不满意就说,回滚点是 `89166e1`。
3. 【截图】涉及捕捉的图要重拍(浮窗多了批注框),数据环境备好了 —— 见 §3。
4. 【演示视频】`docs/DEMO_SCRIPT.md` 分镜仍有效,但**分镜 2/3 的解说词要按 note-first 改**
   (原稿是「捕捉 → 回主窗写批注」,现在批注在捕捉当场就写完了)。

---

## 2. 本批次做完的四件事

### 2.1 权限提示条死胡同 ✅(`c757553`)—— B 路线判死,回退 A

上一版留的探针跑完了,**结论是 B 不成立**:输入监听授权翻转后,
**同一进程**的 `CGPreflightListenEventAccess` 永远返回 false(同一个签名的二进制
新开一个进程立刻返回 true)。CG 侧按进程缓存 TCC 判定,免重启重建 tap 这条路走不通。

所以按预案回退 A:`granted-later` 态加「**立即重启 Spool**」按钮,
Rust 侧新增 `restart_app` 命令(`app.restart()`,**没引 plugin-process**)。
文案同步缩短成「已授权 — 重启 Spool 后生效」并补了英文。

探针已按要求清理:进程杀掉、`tccutil reset` 收回授权、`~/Desktop/SpoolTapProbe.app` 删除,
TCC 表里 `com.oceanjin.spool.tapprobe` 记录数归零。

### 2.2 MCP 一键接入三个拍板 ✅(`b506f13`)

| 拍板 | 落地 |
|---|---|
| ① ChatGPT 桌面版 / Codex:**做** | `~/.codex/config.toml` 的 `[mcp_servers.spool]`;引 `toml_edit`(非 `toml`)—— round-trip 保留用户注释与格式,merge 一个表不重排整个文件 |
| ② 国内 GUI 型客户端:**只给复制配置** | 原「高级:手动粘贴」改成明说「你的 AI 工具不在上面?(Cherry Studio、DeepChat 等)复制这段配置,粘进它的 MCP 设置页」 |
| ③ 没装的:**灰显 + 提示装哪个** | 灰色行尾加「去下载」按钮,开对应官网(`open_mcp_client_page`,固定 URL 表) |

**两个坑记一笔**:`openai.com/codex` 对非浏览器 UA 返 403(用
`developers.openai.com/codex` 代替,已验活);`toml_edit` 最新版拉不下来(网络),
锁在本地缓存已有的 `0.25.11`,`cargo check --offline` 通过。

⚠️ **一键接入按钮仍然没在真机点过**(会写 Ocean 真实的 `~/.claude.json` / VS Code
/ Codex 配置)。单元测试覆盖了合并/备份/拒写坏文件;要真机验先备份那几个文件。

### 2.3 捕捉重构:note-first + 收集面板整体删除 ✅(`89166e1`、`7e1ddd6`)

**Ocean 的想法审查通过,附三个修正**,完整推理在 `docs/DESIGN_CAPTURE_NOTE_FIRST.md`。
一句话:双击 ⌥ 后浮窗默认展开批注框**并拿键盘焦点**,直接打字零摩擦。

三个修正(**别回退**,理由都在设计稿 §1.2–1.4 和 memory `capture-note-first`):
1. Ocean 说「点击外部即代表无笔记」——按字面做会扔掉已敲的字。改成
   **点外部:空框才算没笔记,有字保存**。
2. 收集面板判定为**结构性缺陷**而非可修 bug:单击结算窗 300ms < 双击窗 500ms,
   间隔 300–500ms 的两击必然先缩放再配成双击。所以是删掉,不是修。
3. 自动消失条件从「未展开」改成「**框里没字**」——否则 note-first 下浮窗永不自动关。

删除面很大(38 文件,-1746 行):`collect.rs`、collect 窗口、`src/collect/`、
`useCollect*`、`collectStore`、`lib/collect/`、长按/单击定时器、`collect_send` 撤销类型。

### 2.4 Ocean 桌面正式版换新 ✅

`/Applications/Spool.app` 已换成本批次构建(Developer ID 签名,`codesign --verify` 通过)。
换装前真库备份在
`~/Library/Application Support/com.oceanjin.spool/backup-pre-noteFirst-20260731/`,
**换装后 sha256 与备份逐字节一致**(v8、integrity ok、12 块)。
旧版移到废纸篓(`Spool-0.3.0-pre-noteFirst-*.app`),**没有留下「Spool 2.app」**。

⚠️ 这个装机版**未公证**(公证要 App 专用密码,按硬规则 8 不落盘)。本地拷贝没有
quarantine 标记,启动不受影响;但**正式发版时必须补 §RELEASE 的公证步骤**。
另:本次 `npm run tauri build` 的 dmg 打包失败(`/Volumes` 有上次遗留的
`dmg.*` 挂载)——已按 RELEASE.md §2.1 清场(卸载卷 + 删 `rw.*.dmg`),下次能正常打。

---

## 3. 截图数据环境(Ocean 重拍用)

演示库脚本没变:`scripts/seed-demo-library.sh`,写进 `com.oceanjin.spool.verify`
数据目录(英文种子、多场景侧栏),**不碰真库**。

**本批次受影响、需要重拍的图**:凡是含捕捉浮窗的 ——
- `site/assets/shots/capture-toast.png`(官网首页 01 · SAVE 那张)
- `docs/screenshots/capture-toast.png`(README)

新浮窗比旧的高一截:内容 + 归属行 + **批注框(带 placeholder「留一句想法…」)**
+ Done 按钮 + 页脚。要拍「已经写了字」的状态更能说明 leave a note 的卖点。

其余截图(主窗口、打包弹窗、完成态、所有 `mcp-*`)**不受影响,别动**。

拍摄手法照旧走 memory `isolated-verify-workflow` 第 4、13 条(先激活目标 app 再
`screencapture -R`)。⚠️ 但**手势要真手指按**——见 §4.2。

---

## 4. 两条会绊住下一个窗口的事实

### 4.1 教程种子改了,存量库拿不到

教程里原「收集模式:长按 ⌥…」那条已改成「留下想法 / Leave a note」(中英各一)。
按 5/29 红线**只有空库重建路径会播种**,所以 **Ocean 自己那份库里还是旧文案**
(而且旧文案现在描述的是一个已经不存在的功能)。这是既定取舍,不是 bug。
`client.test.ts` 里有条 FTS 断言搜教程原文,改文案要同步改它。

### 4.2 ⚠️ 装了正式版之后,合成事件再也测不了手势

两个授权齐全时 tap 装在 **HID 层**,而 `CGEventPost` 注入的事件进的是 **session 层**,
**HID tap 完全看不见**(实测连 `1st-of-pair` 日志都不打)。
早期用 C 探针能合成触发双击,是因为那些隔离构建**没有授权**、tap 退到了 session/listen-only。

**规程**:脚本验证手势 → 必须用**从未授权过的全新 identifier**
(本次用 `com.oceanjin.spool.nf`;`tccutil reset` 对磁盘上不存在的 bundle 报 -10814,
换新 identifier 比清授权省事)。正式版上的行为 → 只能真手指按。已记进 memory。

本次就是这么验的,**note-first 五条路径全部脚本实测通过**(结果表在
`DESIGN_CAPTURE_NOTE_FIRST.md` §3),隔离环境已拆干净(app、数据目录、缓存、
identifier 均已还原,`mdfind` 无认领者)。

---

## 5. 接下来该做什么(按 Ocean 之前定的优先级)

1. **推送**。十二个提交还在本地。**对外动作需 Ocean 明示**(硬规则 7)。
   推之前注意:本批次改了官网文案(`site/index.html`、`assets/i18n.js`、`privacy.html`),
   一推 main 就会触发 `pages.yml` 自动部署官网。
2. **官网表单选型**(邮箱订阅 + 反馈)—— 静态站收表单要第三方,**选型必须 Ocean 单独批**
   (硬规则 2)。这是 §3.1 那件事真正的下一步,别自己挑一家接上去。
3. **M1 AI 引擎**(`docs/DESIGN_AI_ENGINE.md` 已全批)—— 范围见该文 §5:
   检测 + 设置页小节 + 单动作「提炼结论」端到端。两条约束:宪法探针是验收必测;
   不新增权限面。
4. **Windows 版**(Ocean:排到最后)。勘查结论保留在上一版 HANDOFF §4 的 git 历史里
   (`git show 8c58388:docs/HANDOFF.md`),三个待拍板点是:捕捉手势替代、签名分发花钱、首版范围。

---

## 6. 硬规则(违反即事故)

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
