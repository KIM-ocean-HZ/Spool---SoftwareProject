# 交接文档 — 2026-07-29 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`double-tap-exclusivity`、`next-stage-goals-website-portfolio`、
> `isolated-verify-workflow`、`distribution-route-notarized-dmg`、`mcp-first-pivot`、
> `spool-db-wipe-incident`)。完成后删除本文件。

---

## 0. 一句话状态

**双击 ⌥ 修复实机验证通过并已提交**(Ocean 确认:捕捉时 Claude Desktop 不再弹);
**官网六条反馈全部改完**(含线轴母题重做),连同批量删除共 **7 个提交在本地未推**——
push 即触发 Pages 部署,留给 Ocean 过目后执行;
**AI 引擎设计稿 §6 四项全批,M1 可开工**;发布仍卡 Developer ID 证书。
基线全绿:`npx tsc -b` / `npx vitest run`(152)/ `cargo test`(16)。

---

## 1. ⚠️ 待 Ocean 动手(按阻塞程度)

1. 【一条命令】`git push` —— 会自动部署官网(workflow 只认 `site/**`)。
   六条反馈的修改、线轴极简版、中文排版整顿都在里面;想先看再推:
   本地 `open site/index.html` 预览(窗口宽度 ≥1240 才显示线轴),
   中文版直接开 `site/index.html?lang=zh`(新加的直链参数)。
2. 【阻塞发布】**Developer ID 证书**——确认邮件到了之后:创建并导入证书 → App 专用密码
   → export 四个变量(RELEASE.md §1)→ `npm run tauri build`。跑完喊我,验收/tag/Release 我全包。
3. `docs/DESIGN_EN_TYPOGRAPHY.md` 两项批复(区标小型大写方案 / 官网换 EN 截图)——仍待。
4. 演示视频(`docs/DEMO_SCRIPT.md` 分镜已写好,Ocean 实机录)。
5. 截图临时环境仍在(见 §4),Ocean 说齐了就清理。

## 2. 下一个窗口的主线:M1

`docs/DESIGN_AI_ENGINE.md` **已全批**(§6 四项 2026-07-29 通过,状态行已更新)。
按 §5 分期从 M1 开始:检测(`which claude` + 版本)+ 设置页「本机 AI 引擎」小节 +
单动作「提炼结论」端到端(含取消/超时)。宪法探针 §2.4 三项是验收必测。

---

## 3. 本批次做完了什么(7 个提交,全部未推)

### 3.1 双击 ⌥ 独占 — 完成闭环

`a0c6954`:HID 层主动 tap(比一切 session tap 上游,不受启动顺序影响),
回退链 HID/active → session/active → session/listen-only。**Ocean 已换装并实机验证**:
捕捉时对方不弹、裸双击对方照常。细节与陷阱全在 memory `double-tap-exclusivity`。

### 3.2 官网 — Ocean 六条反馈逐条落地

| # | 反馈 | 做法(提交) |
|---|------|------------|
| 1 | Save 段弹窗看不出是弹窗 | 真实页面截图(含蓝色选区)做底,真实 toast 浮在右上角带投影;假 mock 删除(`c34ecdb`) |
| 2 | Paste 段不是真截图 | 换成打包弹窗的真实裁切,竖版 23rem(`273d6eb`) |
| 3 | MCP 图占满屏 + 只有顶部切换 | 图限宽 52rem;`data-arrows` 组两侧加 ‹ › 循环切换(`f81f350`) |
| 4 | 线轴太呆板 | 见 §3.3(`14a33f0`) |
| 5 | 演示指令横幅太像高亮 | 横幅改白底+左侧强调线,琥珀只留给待复制句子(`e5b33f7`) |
| 6 | 多选缺批量删除 | 见 §3.4(`459f861`) |

验证方式:Chrome 无头整页截图逐段目检(scratchpad 里有 harness,session 结束即弃)。
新截图源自 `~/Desktop/app-capture.png`、`~/Desktop/app-pack.png`(未裁原图,PIL 裁切)。

### 3.3 线轴母题重做(第二轮:Ocean 反馈后的极简版)

- **第一轮**做了具象线轴(轮辐/纱纹/刻点),Ocean 嫌复杂,**第二轮砍到四个元素**:
  单圈轮缘 + 琥珀卷带 + 出线尾弧 + 轴心。转动线索只靠尾弧。
- **不对称**:左轴 62px 在 76px 高度、右轴 50px 在 38vh,曲线/节奏/转向各不相同,
  右侧滞后 5% 进度才出线。
- **从满到空**:卷带随进度变薄,读完只剩轮缘和轴心;倒着滚回去重新卷满。
- **物理转动**:θ 按「放出弧长 ÷ 当前卷径」积分,越空转越快,回滚反转。
- **点击线轴 = 拉线**:页面平滑下滑约 0.85 屏(pointer-events 只开在线轴上,
  无键盘焦点,aria-hidden 保持)。
- 第一轮的「线头小圆点」已整个删除——fixed 定位在去掉 `scaleX(-1)` 后失去参照,
  两颗都钉在视口左缘(即 Ocean 问的"左边两个小点")。
- 两个坑已修:dash 度量改用路径自身用户单位(`pathLength`+`non-scaling-stroke`
  在拉伸 svg 上不可靠);母题 z-index 提到 3(否则 .alt 全宽底色会盖住中部的右轴)。

### 3.4 中文排版整顿(Ocean:「很混乱」)

- **全角标点统一**:i18n.js / demo.js 的中文文案里 250+ 处半角 `,:;?!()` 转全角
  (脚本只在紧邻 CJK 时替换;demo 里模拟 MCP 工具调用的伪代码 chip 刻意保持半角)。
  story / privacy 的中文本来就是全角,只补了一处括号。
- **中文永不斜体**:「思簿」标记、em、blockquote、demo 批注在 zh 模式全部直立
  (CJK 无斜体传统,假斜只是把笔画掰歪)。
- **zh 模式版式**(`html[lang="zh-CN"]` 生效):正文行高 1.8;标题去负字距,
  H1 行高 1.3、H2 1.42。字体栈不动——Fraunces→宋体做标题、Geist→苹方做正文,
  本来就是标准「宋标黑文」,乱的是标点和斜体。
- 新增 **`?lang=zh|en` 直链参数**(压过 localStorage 记忆),中文版可直接分享。

### 3.5 批量删除

MergeToolbar 加「删除」按钮:与合并同款两步确认、urgent 色;逐个走单块 `remove`,
每块各自入 §9.13 撤销栈(⌘Z 从最新开始逐个回来),确认文案如实说明。i18n 四键补 EN。

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
