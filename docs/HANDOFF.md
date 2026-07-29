# 交接文档 — 2026-07-29(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`double-tap-exclusivity`、`next-stage-goals-website-portfolio`、
> `isolated-verify-workflow`、`distribution-route-notarized-dmg`、`mcp-first-pivot`、
> `spool-db-wipe-incident`)。完成后删除本文件。

---

## 0. 一句话状态

**官网 https://spoolapp.org 已上线**(中英双语、可交互演示、真实 MCP 截图);
**双击 ⌥ 独占修复已构建但未安装**——Ocean 需自己换装并实机验证;
**发布仍卡在 Developer ID 证书**(Ocean 的 Apple 确认邮件未到)。
基线全绿:`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。

---

## 1. ⚠️ 第一件事:让 ⌥ 修复真正生效(Ocean 动手)

**现状**:`/Applications/Spool.app` 是 **7/14 的旧构建**,修复从未运行过——这就是
Ocean 报告"Claude Desktop 仍然跟着弹"的原因。新构建已就绪:

```
src-tauri/target/release/bundle/macos/Spool.app   # 2026-07-29 17:28,签名 Spool Dev
```

**换装(需 Ocean 明示后执行,硬规则 7)**:
```bash
osascript -e 'quit app "Spool"'
rm -rf /Applications/Spool.app
cp -R src-tauri/target/release/bundle/macos/Spool.app /Applications/
open /Applications/Spool.app
```

**首次启动会多弹一个「辅助功能」授权**(主动 tap 的系统要求)。授权后
**必须完全退出再开一次**——TCC 授权对已创建的 tap 不追溯。

**验收**:
1. `⌘C` → 双击 ⌥ → Spool 浮层出现,**Claude Desktop 不弹**。
2. 单独双击 ⌥(没按 ⌘C)→ Claude 的快速输入照常弹出(手势没被独占死)。
3. `open --stderr /tmp/spool.log /Applications/Spool.app` 后看日志应有
   `[double-tap] installed at HID/active`。若是 `session/active` 或
   `session/listen-only`,说明辅助功能没给到或 HID 层拿不到。

**若仍然弹**:说明 Claude Desktop 走的是 IOHIDManager 一类比 CGEventTap 更上游的路径,
CGEventTap 无解(见 memory `double-tap-exclusivity`)。唯一解是在 **Claude Desktop 设置里**
关掉它自己的双击 ⌥ 快速输入——这不牺牲 Spool 任何功能。

---

## 2. 本批次做完了什么

### 2.1 官网 spoolapp.org

- **域名**:GoDaddy 注册(¥69 首年,**续费会涨,记得看价**),apex 四条 A 记录指向
  GitHub Pages,www 走 CNAME;证书 approved、强制 HTTPS 已开。
  `site/CNAME` 已入库——**删了它下次部署就掉绑定**。
- **文案全部重写为大白话**(Ocean 要求:普通人和中文用户都要看得懂)。
  砍掉 provenance / deterministic / append-only / zero-friction 等词;
  标题从 "Your projects, never re-explained" 改成 **"Never explain your project twice"**;
  循环三步改成 Save / Keep / Paste。中文是**重写**不是翻译。
- **交互演示**(`site/assets/demo.js`):四幕状态机,场景是**找工作**(最普遍的跨周多来源项目)。
  每完成一步指令横幅才更新、下一个该点的地方有脉冲光环;第三步 composer **预填**好草稿;
  MCP 那幕是客户端对话样式(工具调用卡片逐条浮现)。中英双语,切语言即整体重建。
- **真实截图**:9 张来自隔离演示库,已裁切接入。最值钱的是
  `mcp-filed-detail.png`——用户笔记在上、AI 的块在下、`↩` 引用线指回那条笔记,
  一张图证明"有署名 / 只追加 / 引用了你的话"。
- **线轴母题**(2026-07-29 最后一版):段落间的直线段**已删除**(Ocean:突兀且看不懂)。
  改为左右留白里各挂一个**具象线轴**,S 形丝线随滚动被拉出、上滚收回,线轴同步转动,
  线头小圆点沿曲线走。`min-width: 1240px` 以下隐藏,`prefers-reduced-motion` 下关闭。

### 2.2 双击 ⌥ 独占(代码已进,待实机验证)

`src-tauri/src/double_tap.rs` 重写:tap 从 listen-only 改为**主动 tap**,Spool 消费双击时
把第二次 ⌥ 的按下与抬起从事件流删除。创建顺序 HID/active → session/active →
session/listen-only。**core-graphics crate 的包装器结构上无法删除事件**,所以改用裸
`CGEventTapCreate` + 自己的 trampoline。隐私政策已补「辅助功能」权限行(中英)。

### 2.3 演示库

`scripts/seed-demo-library.sh` 重建:3 工作区 / 8 个项目 / 18 条笔记,
场景刻意铺开(找工作、作品集、面试、机器学习课、日语、租房、半马、菜谱)。
**日期按运行当天动态生成**,随时重跑都新鲜。主角项目 Job search 跨三周四种来源。

---

## 3. 待 Ocean 拍板/动手(按阻塞程度)

1. 【阻塞发布】**Developer ID 证书**——确认邮件到了之后:创建并导入证书 → 生成 App 专用密码
   → 在你自己的终端 export 四个变量(RELEASE.md §1)→ `npm run tauri build`。跑完喊我,
   后面的验收、tag、GitHub Release 我全包。
2. 【阻塞 ⌥ 修复】**换装 + 实机验证**(§1)。
3. 【阻塞 M1】`docs/DESIGN_AI_ENGINE.md` §6 四个小项批复(动作命名 / 写入开关作为渲染前提 /
   超时 5 分钟 / M1 先做「提炼结论」)。批了就能开工。
4. `docs/DESIGN_EN_TYPOGRAPHY.md` 两项批复(区标小型大写方案 / 官网换 EN 截图)。
5. 演示视频(`docs/DEMO_SCRIPT.md` 分镜已写好,Ocean 实机录)。

---

## 4. 临时环境(等 Ocean 确认后清理)

截图用的隔离环境**仍在**,我没动:
- `~/Desktop/Spool-Demo/Spool.app`(identifier `com.oceanjin.spool.verify`)
- `~/Library/Application Support/com.oceanjin.spool.verify/`(演示库)
- Claude Desktop 配置里的 `spool-demo` 条目(原配置备份在同目录 `.bak-demo`)

Ocean 说截图齐了就清理。

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
