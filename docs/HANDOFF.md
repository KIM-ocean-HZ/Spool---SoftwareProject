# 交接文档 — 2026-07-30(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`double-tap-exclusivity`、`next-stage-goals-website-portfolio`、
> `isolated-verify-workflow`、`distribution-route-notarized-dmg`、`mcp-first-pivot`、
> `spool-db-wipe-incident`)。完成后删除本文件。

---

## 0. 一句话状态

**v0.3.0 的可分发产物已经做好并验收通过**——app 与 dmg 双双签名、公证、staple;
**官网已是最新版**(六条反馈 + 极简线轴 + 中文排版整顿都已上线);
**下一个窗口的主线是 M1**(AI 引擎设计稿已全批,§2 有开工坐标)。
基线全绿:`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。

---

## 1. ⚠️ 待 Ocean 动手(按紧急程度)

1. 【安全】**撤销那个 App 专用密码**。2026-07-30 构建时它被贴进了对话,
   到 appleid.apple.com → 登录与安全 → App 专用密码,删掉重生一个。
   本仓库里没有任何地方写过它(已确认),但对话记录留了痕。
2. 【一条命令】`git push` —— 只剩 1 个提交(README 那笔)。
3. 【让下载按钮有意义】**发 GitHub Release**。现在 `/releases/latest` 会跳到一个
   **空的 releases 页**,而官网的「Download for macOS」和 README 的下载链接都指向它。
   产物就位:
   ```
   src-tauri/target/release/bundle/dmg/Spool_0.3.0_aarch64.dmg   # 7,539,139 字节
   ```
   我可以全包 tag + Release(含发布说明),**但这是对外动作,要你先点头**。
4. 【发布前唯一没做的验收】**干净安装冒烟测试**:换一台机器,或删掉
   `~/Library/Application Support/com.oceanjin.spool` 后装这个 dmg,确认首启建库、
   教程脉络出现、捕捉可用。RELEASE.md §3 是完整清单;签名/公证那几项我已经跑过了(见 §3.1)。
5. `docs/DESIGN_EN_TYPOGRAPHY.md` 两项批复(区标小型大写方案 / 官网换 EN 截图)——仍待。
6. 演示视频(`docs/DEMO_SCRIPT.md` 分镜已写好,Ocean 实机录)。
7. 截图临时环境仍在(§4),说齐了就清理。

---

## 2. 下一个窗口的主线:M1(AI 引擎)

`docs/DESIGN_AI_ENGINE.md` **已全批**(§6 四项 2026-07-29 通过)。M1 的范围按 §5:
**检测 + 设置页小节 + 单动作「提炼结论」端到端(含取消/超时)**——先证明管道,
不铺三个动作。

### 2.1 现成的坐标(省掉下一个窗口的摸索)

| 要动的地方 | 位置 | 现状 |
|---|---|---|
| 新模块 `engine.rs` | `src-tauri/src/` | 现有 `capture.rs` `collect.rs` `double_tap.rs` `mcp.rs` `lib.rs` `main.rs`,engine.rs 待建 |
| 两个开关(渲染前提) | `src/stores/settingsStore.ts` | 键名就是 `mcpEnabled` / `mcpWriteEnabled`,都默认 false、都在 `PersistableKey` 里 |
| Rust 侧读同两个开关 | `src-tauri/src/mcp.rs:530` | `mcp_write_enabled()` / `mcp_enabled()` 已存在,直接复用,**别新写一套** |
| 设置页「本机 AI 引擎」小节 | `src/components/Settings/McpConfig.tsx` | MCP tab 的宿主,新小节加在这里 |
| ⋯ 菜单加「让 AI 维护」组 | `src/components/ThreadView/ThreadHeader.tsx:251` | 下拉容器就在这行起;现有两项是「完成项目/重新打开」和「设为捕捉目标」,照它们的 className 抄 |
| MCP prompts 面 | `src-tauri/src/mcp.rs:3077` | `prompts/list` 现在只有一个 `compress_pack`;§4.2 的三个 prompt 将来并进这里,**prompt 文本要与 engine.rs 同一常量源** |
| i18n | `src/lib/i18n/index.ts` | 中文即键,新文案同步补 EN(硬规则 4) |

### 2.2 开工前必读的两条约束

- **宪法探针(§2.4)是验收必测**,不是可选:①让 AI 试改用户手写块→MCP 写面必须拒;
  ②prompt 里塞「跑 shell」→allowedTools 白名单外不可发生;③抓包确认 Spool 本体零出网。
- **不新增权限面**:入口渲染条件 = `claude` 检测到 + `mcpEnabled` + `mcpWriteEnabled`,
  三者缺一整组不出现(不出灰置项)。这是隐私叙事零增量的前提,别为了「好发现」破例。

---

## 3. 本批次做完了什么

### 3.1 v0.3.0 构建 + 公证(2026-07-30,已验收)

| 项 | 结果 |
|---|---|
| app 签名 | `Developer ID Application: Hanze JIN (Q5Y5JRXZ58)`,hardened runtime,已时间戳 |
| app 公证 | Accepted,id `2bab4b29-1ebd-4c61-a71e-3c161843ae9a`,已 staple |
| dmg 公证 | Accepted,id `448fcc2b-1a02-421e-80c5-c391e03f053b`,已 staple |
| `spctl` app | `accepted · source=Notarized Developer ID` |
| `spctl` dmg | `accepted · source=Notarized Developer ID` |
| dmg 内的 app | 挂载后 `spctl` 同样 accepted,版本 0.3.0,布局 `Spool.app` + `Applications` |

**踩到两个坑,已写进 RELEASE.md,别再摸一遍:**

1. **Tauri 只公证 `.app`,不公证 `.dmg`**。它给 dmg 签名,所以第一次跑完
   `spctl` 对 dmg 是 `rejected · Unnotarized Developer ID`——用户下载的是 dmg,
   Gatekeeper 查的也是 dmg,那就会弹「无法验证开发者」。必须手工补
   `notarytool submit` + `stapler staple`(RELEASE.md §2 第 5 步)。
2. **`bundle_dmg.sh` 失败 = 卷名 `Spool` 被幽灵卷占住**。当时 `/Volumes` 下挂着
   `Spool`(来自一个**已被删除但仍挂载**的旧 dmg)、`Spool 1`、`dmg.e8lMfv` 三个。
   `hdiutil detach` 逐个卸载 + 删掉 `bundle/macos/rw.*.dmg` 后重跑即通过。
   **每次构建后确认 `/Volumes` 只剩 `Macintosh HD`**。
3. 附带教训:**别用 `npm run tauri build | tail`**——管道把退出码换成 tail 的 0,
   构建失败看着像成功。重定向到文件再看。

### 3.2 README 翻新

- **四张截图全是死链**(指向 `main.png`/`capture.png`/…,而磁盘上叫 `app-*.png`)。
  修好,并扩到六张带说明:一条脉络 → 捕捉浮层 → 打包窗 → digest → MCP 读库 → MCP 署名写回。
  三张精修图从官网资产目录搬过来,避开原始整屏图(其中一张带着书签栏)。
- 头部加 spoolapp.org 与下载入口;Status 段写清分发路线(公证直发、不上 MAS)
  与「没有自动更新通道」;⌥ 那段补上「辅助功能是双击独占的前提」。

### 3.3 上一批已推上线的(origin/main = 3f47e09)

官网六条反馈、线轴极简版(点击可下滑一屏)、中文排版整顿(全角标点/去假斜体/
zh 行高字距)、`?lang=zh|en` 直链、多选批量删除。细节见 git log。

---

## 4. 临时环境(等 Ocean 确认后清理)

截图用的隔离环境**仍在**,未动:
- `~/Desktop/Spool-Demo/Spool.app`(identifier `com.oceanjin.spool.verify`)
- `~/Library/Application Support/com.oceanjin.spool.verify/`(演示库)
- Claude Desktop 配置里的 `spool-demo` 条目(原配置备份在同目录 `.bak-demo`)

---

## 5. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=full | grep -iE 'anthropic|co-authored|🤖|generated with'` 必须为空。
   注意:提交信息里写产品集成对象的名字也会命中含 'claude' 的自检——措辞绕开即可。
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
4. i18n:中文即键,新 GUI 文案同步补 EN。**官网文案要大白话**。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点)同样需要明示。**
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
