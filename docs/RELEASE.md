# Spool 发布手册（Developer ID 公证直发）

路线：**Developer ID 签名 + Apple 公证 + .dmg 直发**（不上 Mac App Store——沙盒与
CGEventTap/私有 API/浏览器 AppleScript 硬冲突，见 PLAN_EN.md 及 2026-07-06 决策）。

## 0. 一次性准备（需要 Apple 开发者账号，$99/年）

1. 注册 [Apple Developer Program](https://developer.apple.com/programs/)。
2. 在 [Certificates](https://developer.apple.com/account/resources/certificates/list)
   创建 **Developer ID Application** 证书，下载并双击导入钥匙串。
   确认：`security find-identity -v -p codesigning` 能列出
   `Developer ID Application: <名字> (<TEAM_ID>)`。
3. 在 [appleid.apple.com](https://appleid.apple.com) → 登录与安全 → App 专用密码，
   生成一个专用密码（公证用）。

## 1. 每次发布的环境变量

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: <名字> (<TEAM_ID>)"
export APPLE_ID="jinhz0531@gmail.com"   # 2026-07-13：开发者账号邮箱（旧 kimocean0531 已弃用）
export APPLE_PASSWORD="<app专用密码>"
export APPLE_TEAM_ID="<TEAM_ID>"
```

Tauri 检测到这四个变量后会自动完成：签名（含 hardened runtime）→ notarytool
提交公证 → staple 装订。缺任何一个则跳过对应步骤。

**⚠️ Tauri 只公证 `.app`，不公证 `.dmg`**（2026-07-30 实测）。它给 dmg 签名，
但不提交公证——用户从网上下载的是 dmg，Gatekeeper 查的也是 dmg，未公证就会弹
「无法验证开发者」。所以 §2 第 4 步的补公证是**必做**，不是可选。

## 2. 发布步骤

```bash
# 1. 版本号三处同步：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml
# 2. 基线检查
npx tsc -b && npx vitest run && (cd src-tauri && cargo check)
# 3. 开打之前先清场（见 §2.1——不清就会在最后一步失败）
ls /Volumes/                                          # 不该有 Spool / Spool 1 / dmg.*
rm -f src-tauri/target/release/bundle/macos/rw.*.dmg  # 上次失败留下的临时读写卷
# 4. 构建 + 签名 + 公证 app（联网；公证排队 2 分钟到 45 分钟都遇到过）
npm run tauri build
# 5. 补公证 dmg 本身（Tauri 不做，必做）
DMG=src-tauri/target/release/bundle/dmg/Spool_<版本>_aarch64.dmg
xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" --wait
xcrun stapler staple "$DMG"
# 6. 产物
ls src-tauri/target/release/bundle/dmg/     # Spool_<版本>_aarch64.dmg
ls src-tauri/target/release/bundle/macos/   # Spool.app
```

**别用 `| tail` 接 `npm run tauri build`**：管道会把退出码换成 tail 的 0，
构建失败也看着像成功（2026-07-30 就这么被骗过一次）。重定向到文件再看。

## 2.1 `bundle_dmg.sh` 失败 = 卷名被占（2026-07-30 实录）

症状：app 签名与公证全部成功，最后一步
`failed to bundle project error running bundle_dmg.sh`。

原因：脚本挂载新卷时要占用卷名 `Spool`，而上次失败留下的**幽灵卷**还挂着——
包括「dmg 文件已被删除但卷仍在挂载」这种看不见的残留。当时 `/Volumes` 下有
`Spool`、`Spool 1`、`dmg.e8lMfv` 三个。

```bash
hdiutil info | grep -E "image-path|/Volumes"   # 找出 /dev/diskN 与来源
hdiutil detach /dev/diskN -force               # 逐个卸载
rm -f src-tauri/target/release/bundle/macos/rw.*.dmg
```
清完重跑 `npm run tauri build` 即通过。**每次构建后确认 `/Volumes` 只剩
`Macintosh HD`**，否则下一次必然再撞。

## 3. 发布前验收清单

- [ ] 全新机器（或删除 `~/Library/Application Support/com.oceanjin.spool` 后）安装 .dmg，首启建库正常
- [ ] **两个产物都要查**（dmg 漏公证是最容易漏的一项）：
      `spctl -a -vv -t install <Spool.app>` 与 `spctl -a -vv -t install <dmg>`
      都必须是 `accepted` + `source=Notarized Developer ID`。
      dmg 若显示 `Unnotarized Developer ID`，回到 §2 第 5 步补公证。
- [ ] `codesign -dvv <Spool.app>` 的 Authority 第一行是 Developer ID 而不是 `Spool Dev`
      （tauri.conf.json 里配的是开发证书，靠环境变量覆盖；覆盖失败会静默用错证书）
- [ ] 双击 ⌥ 捕捉：首启系统弹「输入监听」授权（未授权时主窗口有引导条）→ 授权并重启后捕捉可用
- [ ] 抓包确认零出网：本体无任何云出口（2026-07-09 剔除内置 AI 后 CSP connect-src 只放行 Tauri IPC；MCP 走 stdio 子进程，不占网络端口）
- [ ] 全新安装零配置即全功能：捕捉/打包/搜索可用；教程脉络「欢迎使用 Spool」出现、整条可删且不复现
- [ ] 中文输入法下 Composer 回车确认候选词不误发（2026-07 修复的回归项）
- [ ] 旧版本数据库直接升级启动（迁移注册表自动走，升级前自动留快照）
- [ ] README 的截图与当前 UI 一致（字体打包后外观有变，需重截）

## 4. 已知边界

- **CSP**：`connect-src` 只放行 Tauri IPC（`'self' ipc: http://ipc.localhost`）——
  webview 层结构性无法发起任何外部网络请求（2026-07-09 MCP-first 决策的执行面）。
  未来若有功能需要出网，必须回到 §2.7 过滤器重新论证。
- **更新通道**：直发意味着没有自动更新。短期靠 GitHub Releases 页手动下载；
  若要应用内更新，需引入 `tauri-plugin-updater`（PLAN §4 规定新依赖需 Ocean 批准）。
- **Windows 构建**：`targets: all` 下 Windows 产物未签名；Windows 分发另需
  代码签名证书，当前不在范围内。

## 5. 开发期签名与 TCC（2026-07-08）

- **为什么**：macOS 的 TCC 授权（输入监听等）绑定到二进制的代码签名 designated
  requirement。ad-hoc 签名的 DR 就是 CDHash 本身，每次重编译都变——于是每装一个
  新构建，已授予的输入监听就失效（系统设置里开关看着还开着，但 preflight 返回
  false；2026-07-08 实测踩坑，恢复步骤已写进主窗口引导条）。
- **做法**：`tauri.conf.json` → `bundle.macOS.signingIdentity: "Spool Dev"`。
  "Spool Dev" 是本机登录钥匙串里的自签代码签名证书（2026-07-08 创建）。用固定
  证书签名后 DR 锚定到证书而非 CDHash，重编译不再打断授权（切换签名身份后的
  **第一个**构建仍需按引导条重授权一次）。
- **与正式发布的关系**：§1 的 `APPLE_SIGNING_IDENTITY` 环境变量在发布时覆盖此
  配置（Developer ID 优先）。首次正式发布时用
  `codesign -dvv src-tauri/target/release/bundle/macos/Spool.app` 验证 Authority
  确实是 Developer ID；若未覆盖，临时把 signingIdentity 改为 Developer ID 串。
- **换机重建证书**：钥匙串访问 → 证书助理 → 创建证书（名称 Spool Dev / 自签名根
  证书 / 类型选**代码签名**）；或 openssl 生成后
  `openssl pkcs12 -export -legacy` 再 `security import ... -T /usr/bin/codesign`
  并 `security add-trusted-cert -p codeSign <crt>`（macOS 的 security 不认
  OpenSSL 3 默认加密的 p12，必须 `-legacy`）。

## 6. 法务/内容配套

- 隐私政策：`docs/PRIVACY.md`（发布页/官网需可访问链接）
- 字体许可：Geist / Geist Mono / Fraunces 均为 OFL，许可文本随源码在
  `src/assets/fonts/OFL-*.txt`，随应用打包分发，合规。
- 许可证：**未定**（Ocean 2026-07-06：不要擅自添加 LICENSE 文件）。公开 GitHub 仓库前由 Ocean 决定采用何种许可后再补。
