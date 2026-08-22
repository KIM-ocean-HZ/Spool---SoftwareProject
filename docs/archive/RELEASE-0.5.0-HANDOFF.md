# 交接 —— v0.5.0 发布收尾 + 双平台上官网（2026-08-18）

> 这一窗做完了：调研 Windows 双击 Ctrl 绕过杀软（用 Raw Input）、实现并实机验通、
> 默认捕捉键两端对齐 Mac、合并 `windows-port` → `main`、版本号 0.5.0、Mac 侧签名+公证。
> **没做完的是「发布」这最后一段和「双平台上官网」。** 下面每条都能照着机械执行。

---

## 0. 现在的确切状态

| 项 | 状态 |
|---|---|
| `main` = `windows-port` = `origin/*` | **`55aa065`**，版本 0.5.0，零未推 |
| Mac dmg | ✅ **已签名+公证+装订**，`accepted` / `source=Notarized Developer ID`。<br>产物：`src-tauri/target/release/bundle/dmg/Spool_0.5.0_aarch64.dmg`（7.7M）<br>⭐ **备份在 `~/Desktop/Spool_0.5.0_aarch64.dmg`**（拷贝后复验仍 accepted）—— `cargo clean` 会冲掉 bundle 里那份，桌面这份是退路 |
| Mac 公证回执 | `id: e02a0bd1-2501-4ed9-8d77-581ddaa3fb6d` · `status: Accepted`（.app 和 dmg 各公证过一次） |
| Windows 安装包 | ✅ CI run **32149620645**（sha 55aa065，0.5.0）artifact `spool-windows-nsis`。<br>已下到 `/tmp/winexe/Spool_0.5.0_x64-setup.exe`（5.3M，**未签名**，Ocean 2026-08-15 决策 5） |
| tag `v0.5.0` | ❌ 还没打 |
| GitHub Release | ❌ 还没建（当前 Latest 仍是 v0.4.0） |
| 官网 | ❌ 只有 macOS 下载，未加 Windows；FAQ 有两处已变成假话（见 §2） |

⚠️ **红线照旧**：提交禁止任何 AI/Claude/Anthropic 署名（`CLAUDE.md §5`，自查用窄版只查提交信息）；
推送走 gh token 的 HTTPS URL，推完 `git update-ref` 手动补远端引用；
`site/zh/*.html` 不手改，改源再 `node scripts/build-site-zh.mjs`；
**不擅自加 LICENSE**（memory：Ocean 许可未定）。

---

## 1. 发布（A 段）—— 都是对外动作，要 Ocean 授权执行

> `RELEASE.md §2` 有两条实测坑已内联在下面：① 先打 tag 再建 release，否则
> `--target <sha>` 被 GitHub 拒；② 每个 Release 必须带一份**固定名**资产，否则官网
> `releases/latest/download/<固定名>` 会 404。

```bash
cd /Users/hzjin/Desktop/Knote

# 1) 打 tag（打在 55aa065 上）并推（走 gh token HTTPS）
git tag -a v0.5.0 -m "v0.5.0 — Windows 首版 + 双击 Ctrl 捕捉，跟进/库迁移/工作区嵌套" 55aa065
TOKEN=$(gh auth token)
git push "https://x-access-token:${TOKEN}@github.com/KIM-ocean-HZ/spool.git" v0.5.0
git update-ref refs/tags/v0.5.0 v0.5.0   # 本地引用一般不用补，tag 推送后 GitHub 侧即有

# 2) 备好四个资产：两个带版本号 + 两个固定名（官网下载按钮指着固定名）
cp ~/Desktop/Spool_0.5.0_aarch64.dmg /tmp/Spool-macOS-arm64.dmg          # 固定名 mac
cp /tmp/winexe/Spool_0.5.0_x64-setup.exe /tmp/Spool-windows-x64-setup.exe # 固定名 win

# 3) 建 Release + 一次传四个资产（--notes-file 用 §3 的发布说明；--verify-tag 认已推的 tag）
gh release create v0.5.0 --verify-tag --title "Spool 0.5.0 — Windows 首版 + 统一的双击捕捉" \
  --notes-file docs/RELEASE_NOTES_v0.5.0.md \
  ~/Desktop/Spool_0.5.0_aarch64.dmg \
  /tmp/Spool-macOS-arm64.dmg \
  /tmp/winexe/Spool_0.5.0_x64-setup.exe \
  /tmp/Spool-windows-x64-setup.exe
```

**验收**（建完立即做）：
```bash
gh release view v0.5.0 --json assets -q '.assets[].name'   # 必须四个都在
curl -sSIL https://github.com/KIM-ocean-HZ/spool/releases/latest/download/Spool-macOS-arm64.dmg | grep -i "^HTTP"      # 期望 200/302
curl -sSIL https://github.com/KIM-ocean-HZ/spool/releases/latest/download/Spool-windows-x64-setup.exe | grep -i "^HTTP" # 期望 200/302
```

**回执入账**：把 `id: e02a0bd1-2501-4ed9-8d77-581ddaa3fb6d` / `Accepted` / tag `v0.5.0` /
Gatekeeper `accepted + Notarized Developer ID` **追加**进 `CASE_STUDY_LEDGER.md §1.2`（只增不改，仿 v0.4.0 那条）。

---

## 2. 双平台上官网（B 段）—— ⚠️ 不是换个链接，是"定位改成双平台"

官网现在通篇是"Mac 应用"。加 Windows 下载**必须**连带把已经变成假话的文案一起改，否则自相矛盾。
改 `site/**` 推 `main` 会触发 pages 部署（**一推就上线**，想清楚再推）。

**改英文源 `site/index.html`：**
1. 加一个 **Windows 下载**入口 → `https://github.com/KIM-ocean-HZ/spool/releases/latest/download/Spool-windows-x64-setup.exe`
   （macOS 那个按钮/链接出现 4 处：line 55 / 72 / 341 / 630，Windows 至少主 CTA 处并排一个）
2. **改掉已成假话的文案**（这几条现在直接说反了）：
   - `<title>`（line 6）"for macOS" → 含 Windows
   - FAQ **`a2`**（line 567）"Spool is a Mac app, the capture shortcut is built on macOS-specific APIs" —— **现在是假的**，Windows 有双击 Ctrl（Raw Input）
   - **`story-b1`**（`scripts/site-zh-strings.mjs` line 347 中文 + 英文源 story.html）"actually macOS-only" —— **假的**
   - `chip-arch`（line 77）"Apple Silicon Mac" → 补 Windows (x64)
   - `mid-cta-fine`（line 342）"Apple Silicon Mac (arm64) · signed & notarised" —— Windows 是**未签名**，细则要分平台写（别把"已公证"安到 Windows 头上）
   - 权限那节（line 490 `perm-h` 起）是 macOS 专属（输入监听）—— Windows 不需要这类授权，要么分平台写、要么注明"仅 macOS"
3. **中文站**：以上每一条在 `scripts/site-zh-strings.mjs` 里都有对应键，改源；**新增键**要给英文源加 `data-i18n` 标记。改完 `node scripts/build-site-zh.mjs` 重新生成，**别手改 `site/zh/*.html`**。
4. 布局若变，跑 `scripts/visual-regression.sh` 更新基线（改了文案的提交必须连基线一起提，否则下一个人看到一片红 —— backlog §4.4 教训）。
5. 验证：`node scripts/i18n-check.mjs`（none missing）、`npx vitest run scripts/build-site-zh.test.mjs`、`git diff --check`。

⭐ **这一段和「README 精修」同源**：两处都要把定位从"Mac 专属"改成"Mac + Windows"。建议一起做。

---

## 3. 发布说明 `docs/RELEASE_NOTES_v0.5.0.md`

**下一窗先把这个文件建出来**（`gh release create --notes-file` 指着它）。草稿素材（本窗已拟，可删改）：

```markdown
自 v0.4.0（101 个提交）以来最大的一件是 **Windows 首版**，外加一批主线新功能。

### Windows 首版
- 未签名 NSIS 安装包，能装能跑；**双击 Ctrl 捕捉**（Raw Input 实现，绕开杀软对键盘钩子的启发式）；关窗到托盘；打包、MCP 接入齐活。
- 捕捉手势与 macOS 彻底统一：两端都是「双击一个修饰键」，出厂不绑快捷键，想要的人自己在设置里加。

### 捕捉与撤销
- 捕捉浮窗直达打字修复；浮窗按屏幕可用区域定位，不再被菜单栏压掉上边框。
- 自己写下的块现在能撤销；空输入框里 ⌘Z/Ctrl+Z 归「撤销上一步操作」。

### 跟进 / 上下文
- 跟进面板改成一份行清单，MCP 能主动提条目也能收尾（单次 / 永久跟进）。
- 换机器：设置 → 高级 →「换机器」导出/导入整个库（导入是合并）。
- 工作区可嵌套 + 首字母排序 + 打包整个工作区成文件夹；左栏多选。

**Spool 本体仍然零出网，数据永远只在本机。**

**macOS**：Apple Silicon，已签名 + Apple 公证。**Windows**：x64，未签名（首版）。
```

---

## 4. 五点任务里还没动的（原始交接）

1. **精修 README**（去中文如"全局快捷键/一键接入"、专业化、双平台定位）。
   ⚠️ **"补 MIT/许可说明"这条要先问 Ocean** —— memory 记着「许可未定，绝不擅自加 LICENSE」。
   所以是**问清许可状态**，不是自己写 MIT。
2. **官网 01·SAVE 左图顶部遮挡** —— backlog §4.5 说浮窗定位已从"显示器原点"改成"可用区域"
   （`capture.rs` `work_area()`），产品侧修好了，但**S1 截图是旧位置拍的**，要用新版
   **重拍 S1** 再重建截图链（`build-site-shots.sh`）。这条本质是「重拍 + 重跑生成链」。
3. **整理代码库文档** —— docs 下 handoff/design 一大堆（本文件也是新增的一份，用完可删）。
   建议：把 08-13 那三份 Codex 交接、过期的 NEXT-CODEX 等归档到 `docs/archive/`。
4. **精修视频演示脚本**（`docs/DEMO_SCRIPT.md`）—— 内容按官网文案来；Ocean 08-15 决策 8 原是
   「先不做视频」，但脚本本身可以先精修。

---

## 5. 发布后建议 Ocean 亲手验（可选，不阻塞发布）

- **Mac 手指验 #70–75**（`WINDOWS-CHECK.md`）：撤销（写入/删除/框里有字）、卡顿（引擎页/右栏/浏览器测试不再冻）。自动化门禁全绿，这几条是单测覆盖不到的交互项。
- **全新装 dmg**：删 `~/Library/Application Support/com.oceanjin.spool` 后装，首启建库正常、教程出现。
- **Windows 全新装**：双击 Ctrl 弹捕捉、打包、MCP 接得上。

---

## 6. 本窗自动化验证留档（发布决策的依据）

- Mac：`cargo test` **99/99**、`vitest` **430/430**、`tsc` clean、`i18n` none missing（只剩有意保留的 `updated_at` warning）
- Windows：CI 全绿（`npm build` → vitest → **cargo test 真机编译 double_tap_win.rs** → NSIS → artifact）
- 双击 Ctrl：Ocean 实机验通（"我测试双击没有问题"）
- 产物：dmg + .app 均 `accepted` + `Notarized Developer ID` + Developer ID 签名 + 0.5.0
