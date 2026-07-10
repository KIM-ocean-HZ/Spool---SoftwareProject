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
export APPLE_ID="kimocean0531@gmail.com"
export APPLE_PASSWORD="<app专用密码>"
export APPLE_TEAM_ID="<TEAM_ID>"
```

Tauri 检测到这四个变量后会自动完成：签名（含 hardened runtime）→ notarytool
提交公证 → staple 装订。缺任何一个则跳过对应步骤。

## 2. 发布步骤

```bash
# 1. 版本号三处同步：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml
# 2. 基线检查
npx tsc -b && npx vitest run && (cd src-tauri && cargo check)
# 3. 构建 + 签名 + 公证（联网，公证通常 1-10 分钟）
npm run tauri build
# 4. 产物
ls src-tauri/target/release/bundle/dmg/     # Spool_<版本>_aarch64.dmg
ls src-tauri/target/release/bundle/macos/   # Spool.app
```

## 3. 发布前验收清单

- [ ] 全新机器（或删除 `~/Library/Application Support/com.oceanjin.spool` 后）安装 .dmg，首启建库正常
- [ ] `spctl -a -vv -t install src-tauri/target/release/bundle/macos/Spool.app` 显示 `accepted · Notarized Developer ID`
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
