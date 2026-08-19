# Codex × Claude Code 协作说明 — 2026-08-13

> **2026-08-13 收口更新：此前“下一轮尚未执行”的状态已过期。** README 七张隔离真实截图、
> release 截图项、Story 八节/完整架构/三张证据图/公证卡、ledger 追加 §7、五路由三档全页视觉
> 基线、本地 Lighthouse、重点 WCAG，以及 Windows/免费引擎/M4 三份只读调查均已完成。最终入口
> 是 `docs/HANDOFF-CODEX.md §0-close`；下面 `§0-final` 及以后保留前几轮实现史。
>
> ⛔ **2026-08-15 状态更正：** 本文件原写「没有提交、推送、部署……仍需 Ocean 分别明确授权」，
> **这几句已作废** —— 成果在 08-13 16:19 就提交推送上线了。
> 当前 `HEAD = origin/main = **42f2c79**`，两次 Pages 部署均 success，spoolapp.org 已是新版。
> **当前开工面是 `docs/BACKLOG-2026-08-19.md`。**
>
> `src/**`、`src-tauri/**` 未改。最终自动验证为 Vitest 361/361、TypeScript clean、Rust 72/72、
> 中文专项 9/9、i18n `(none missing)`、全页视觉回归 15/15、三页 Lighthouse accessibility/
> best-practices/SEO 均 100 —— **这些数字 2026-08-15 已独立复现，仍然有效**。
> VoiceOver、跨浏览器、物理 Windows 与生产检查未覆盖。

这份文档记录 Codex 在 Claude Code 官网基线之上的两轮接续工作。它不替代
`docs/HANDOFF.md`；Claude Code 原来的工作史仍以该文档最新的 `§0-ship` 为准。
本文件只记录本工作区内尚未提交的网站改动、决策和验证证据。

> **历史开工记录（现已执行）。** 当时的入口是 `docs/HANDOFF-CODEX.md §0-next`，可直接交给
> 下一窗口的完整提示词是 `docs/NEXT-CODEX-WINDOW-PROMPT.md`。范围包括：隔离真实 UI 重建 README
> 截图并关闭 release 截图项；更新架构图、产品截图和公证证据并收口 Story/case-study；视觉快照、
> 本地 Lighthouse 与重点 WCAG；Windows、稳定免费引擎、M4 只做调查，不写 app 代码。GitHub
> description 是单独外部动作，不在本轮自动执行。

> 2026-08-13 最后微调：Ocean 要求两块就地放大图再小一些并彻底分开。最终 CSS 为
> `width: 74%`、`right: 2.25%`、`top: 35.29% / 62.82%`；390 / 768 / 1440px 实测间隙分别
> 18.41 / 17.98 / 27.87px，中英文均无页面级横向溢出。任何后续提交必须排除本文件和全部
> HANDOFF/交接文件，并禁止任何 AI 署名或 trailer。
>
> 这段后续盘点要求已被 `HANDOFF-CODEX.md §0-close` 取代。旧 HANDOFF 里的 Demo
> 3→1 已由当前一条笔记流程完成；视觉回归、Lighthouse、完整 WCAG、线上 SEO 和 `/zh/story.html`
> 是可选增强，不是当前代码欠账。

## 0-final. 第三轮闭环：完整正文的就地放大镜

上一轮独立验收只留下一个失败项：四张细节裁图从句中切断正文。Ocean 先选择了重拍 S2，随后把
布局要求收敛为：**KEEP 只占一个完整图片位置，两张放大图直接叠在总览图里的原记录位置，不再放在
右栏。** 本轮按这个最终要求完成实现和三档验收。

### 0-final.1 S2 选择与真实裁图

- 用户提供的 `S2-1.png` 与 `S2-2.png` 都是 2624 × 1930 且逐字节相同；选用的 `S2.png` 是
  2144 × 1822，正文折行更紧，同样装下完整句子时裁宽从约 1920px 降到 1465px。
- `project-window-source-detail`：S2 `(570, 660, 1465, 410)`，完整包含 #2 来源、批注、引用原文到
  `fix.`，以及 #3 来源和两行正文到 `themselves.`。
- `project-window-ai-detail`：S2 `(570, 1160, 1465, 370)`，完整包含 #4 复习计划，以及 #5 的
  `Claude · MCP` 署名、两行正文和回指引用。
- Story 两图分别改为 `(1, 1, 1900, 430)` 与 `(1, 800, 1930, 700)`；用户笔记、AI 笔记和批注都
  能到达真实句末。所有裁图仍由 `scripts/build-site-shots.sh` 从真实源图确定性生成。

### 0-final.2 最终页面结构

- KEEP 完整 S2 独占一个图位；两个裁图 `width: 74%`、`right: 2.25%`，分别在 `top: 35.29%` 与
  `62.82%` 覆盖回原记录带。两个编号仍保留放大镜手柄，两图之间保留约 18–28px 间隙，不再有右栏、
  连接线或额外页面长度。
- 390px 下，完整图和叠层仍属于同一个图位；内部舞台为 736px，可在图内左右滑动读取句首到句末，
  但页面根元素始终保持 390px。中英文可访问名称明确说明窄屏的图片内滑动。
- Story 保持原来的单图位和 caption；宽裁图在 944px 内部画布上显示，外层 342 / 480 / 576px
  图位可横向滚动，caption 不随图片移动。
- 新总览按实际小屏舞台生成 736px 响应式候选；完整 2144px WebP 已比 1088 / 1160px 重采样版本
  更小，因此 HTML 只保留 736 / 2144 两档候选。

### 0-final.3 验证与交付边界

- 截图生成完整重跑后再次重跑，全部 PNG / WebP 逐字节相同；S2 与网站总览图 SHA 相同。
- 中文专项 9 / 9、i18n `(none missing)`、Vitest 361 / 361、TypeScript PASS、Rust 72 / 72、
  `git diff --check` PASS。
- `/`、`/zh/`、`/story.html` 的 390 / 768 / 1440px 实测均无页面级横向溢出；KEEP 两块叠图的
  最终间隙为 17.98–27.87px；390px 与 Story 的内部横向滚动均实际滑到句末；控制台 0 error / warning。
- `src/**`、`src-tauri/**` 未动；没有暂存、提交、推送或部署。当前下一步只剩 Ocean 审阅和另行
  明确授权发布。

## 0-prev. 历史验收导航

- 验收结论、**待补验项、明确未做事项**及 Claude Code 最短清单，以
  `docs/HANDOFF-CODEX.md` 的 §0 为唯一入口。
- 本文件保留实现细节、文件范围和已完成验证的证据，避免在交接入口重复堆叠。
- 本节描述的是第三轮前的状态；最终状态以 `§0-final` 为准。
- `docs/NEXT-CODEX-WINDOW-PROMPT.md` 是本轮开工前的历史输入；不要再次实现页面，其中尚缺证据的
  原始验收项已经收敛到 handoff §0.2。

## 1. 接手基线与边界

- 接手提交：`33af559`。
- Claude Code 已完成无人脸 S1、逐屏收束、真实 Pack 展示、空图位清零、MCP 内容合并、
  移动端语言切换、对比度与 ARIA 修正。
- Codex 第一轮把互动 Demo 从三条笔记真正收成一条闭合证据链，并校正官网、Privacy、Story、
  README 中的产品事实。
- Ocean 随后明确要求：全面解决产品截图可读性，重点修复 `02 · KEEP`；并从英文事实源重译
  首页、动态 Demo、Privacy、SEO 和图片描述的全部现有中文。
- 两轮都遵守同一边界：不改 `src/**`、`src-tauri/**`，不手改中文生成物，不提交、不推送。

## 2. 截图与响应式实现

### 2.1 首页

SAVE 与 KEEP 统一为全宽 proof 区块，文字列限制行长，截图区域在 68rem 内排版：

- SAVE 左图是 `docs/screenshots/S1.png` 的完整 3600 × 2260 场景；橙色框圈出网页标签/地址，
  绿色框圈出右上角保存浮窗，虚线分别指到右侧对应的编号放大图。
- KEEP 左图是完整 S2 项目窗口；橙色框圈出 `#2/#3` 来源、批注与引用原文，绿色框圈出
  `#4/#5`、`Claude · MCP` 署名及回指引用，再分别连到右侧放大图。
- 701px 及以上使用单行三图：完整大图在左，两张细节图在右侧上下排列。列宽不是手调近似值，
  而是由总览与两张裁图的宽高比、1rem 间距解出；SAVE 左栏约占 58.95%，KEEP 约占 65.11%。
  更窄时隐藏跨栏虚线、保留框与编号并回落为纵向。

### 2.2 Story

- 原 `mcp-filed-detail` 超宽图改用 700 × 430 可读裁图。
- `app-thread-after` 保留完整六条记录的上下文，并补 700 × 700 细节图。
- 原图片描述写成 14:56，与像素内容不符；已按真实截图校正为 16:04。

### 2.3 可重复生成

`scripts/build-site-shots.sh` 会先把 `docs/screenshots/S1.png`、`S2.png` 逐像素复制为网站总览图，
再执行确定性 `sips` 裁图并生成 WebP。这样替换 S1/S2 时，总览、框选区域和右侧放大图会一起更新，
不会出现总览与细节静默失配。旧的 `project-window-mobile.png` 已无引用，由两张语义更明确的
细节图替代后移除。

三档实际尺寸：

| 页面/图片 | 390px | 768px | 1440px |
| --- | --- | --- | --- |
| KEEP 两张细节图 | 342 × 201 | 237 × 139 | 365 × 214 |
| Story MCP 细节图 | 342 × 211 | 576 × 355 | 576 × 355 |
| Story 方形细节图 | 342 × 342 | 480 × 480 | 480 × 480 |

## 3. 中文重译与事实校正

### 3.1 翻译源与覆盖面

- 首页静态内容、SEO、图片描述：`scripts/site-zh-strings.mjs`
- Demo 所有动态状态：`site/assets/demo.js` 的 `STR.zh`
- Privacy 网页模板：`scripts/site-zh-privacy.html`
- 中文公开隐私说明：`docs/PRIVACY.md`
- `site/zh/index.html`、`site/zh/privacy.html` 由 `scripts/build-site-zh.mjs` 重建

重译覆盖导航、正文、CTA、FAQ、Pack 说明、Demo guide/按钮/AI 回复/MCP trace/两种结局、
noscript、Privacy 页脚、页面 title/description、Open Graph/Twitter 字段、图片描述、品牌视频
和运行时侧栏 ARIA。没有把截图中真实显示的英文 UI 伪称成中文。

### 3.2 术语与事实

统一采用“工作区、项目、笔记、批注、Pack、来源、跟进、周回顾、跟进目标、提议、待审、
作废、更正、输入监控、辅助功能、浏览器自动化”。Privacy 的 HTML 与 Markdown 逐段一致，
并明确：

- 手动粘贴、MCP、CLI 是三条用户主动交接内容的路径；Spool 不自行上传。
- 普通 ChatGPT 与 Codex 的本机 MCP 能力不同。
- 周回顾和起草目标没有网页工具，但所需内容仍可能交给 CLI 服务商。
- AI 只能新增署名内容；对用户内容的更正进入待审，不得删除、冒充或替用户作废原文。
- 输入监控、辅助功能、浏览器自动化分别做什么，以及拒绝后的具体影响。

英文首页原有 `two minutes`、`about a minute`、`next thirty seconds`、`ready in a minute`
四处未量证承诺。它们与既有事实边界冲突，因此先从英文源改成无时长、可证实的表达，再同步中文，
而不是直接翻译成中文承诺。

### 3.3 生成器与回归测试

中文构建器保留 `data-i18n` / `data-i18n-alt`，新增 `data-i18n-aria`；HEAD、alt 和 ARIA
属性统一做 HTML 属性转义。专项测试由 5 项扩充到 9 项，覆盖：

- 两张中文生成物与源同步；
- 所有 `alt-*` 键都写入最终图片描述；
- 品牌视频可访问名称；
- noscript 与 Privacy 页脚无漏译；
- title、description、OG、Twitter metadata；
- alt、ARIA、metadata 属性转义；
- 中文字符串无废弃键。

## 4. 修改范围与当前工作区

网站与运行时：

- `site/index.html`
- `site/privacy.html`
- `site/story.html`
- `site/assets/demo.js`
- `site/assets/site.css`

截图生成与新增资源：

- `scripts/build-site-shots.sh`
- `site/assets/shots/capture-page.png`
- `site/assets/shots/capture-page.webp`
- `site/assets/shots/capture-page-580.webp`
- `site/assets/shots/capture-page-1160.webp`
- `site/assets/shots/capture-toast.png`
- `site/assets/shots/capture-page-source-detail.{png,webp}`
- `site/assets/shots/project-window-source-detail.{png,webp}`
- `site/assets/shots/project-window-ai-detail.{png,webp}`
- `site/assets/shots/mcp-filed-detail-readable.{png,webp}`
- `site/assets/shots/app-thread-after-detail.{png,webp}`

中文源、生成器与生成物：

- `scripts/site-zh-strings.mjs`
- `scripts/site-zh-privacy.html`
- `scripts/build-site-zh.mjs`
- `scripts/build-site-zh.test.mjs`
- `site/zh/index.html`（生成）
- `site/zh/privacy.html`（生成）

公开说明与交接：

- `README.md`
- `docs/PRIVACY.md`
- `docs/HANDOFF-CODEX.md`
- `docs/COLLABORATION-CODEX-2026-08-13.md`
- `docs/NEXT-CODEX-WINDOW-PROMPT.md`（实现已完成的历史任务单；验收缺口见 handoff §0.2）

工作区位于 `main`，`HEAD` 与 `origin/main` 均为 `33af559`；相对该提交保留全部未提交改动，
暂存区为空。这里同时包含前一轮网站事实校正和本轮截图/翻译工作，验收时不要清理、还原或只挑
最新几项查看。

## 5. 自动验证

最终版本实际执行：

```text
bash -n scripts/build-site-shots.sh                         PASS
bash scripts/build-site-shots.sh                            PASS
node --check site/assets/demo.js                            PASS
node --check scripts/build-site-zh.mjs                      PASS
node --check scripts/site-zh-strings.mjs                    PASS
node scripts/build-site-zh.mjs                              PASS
npx vitest run scripts/build-site-zh.test.mjs               9 / 9
node scripts/i18n-check.mjs                                 (none missing)
npx vitest run                                              32 files / 361 tests
npx tsc --noEmit                                            PASS
cargo test --manifest-path src-tauri/Cargo.toml             72 / 72
git diff --check                                            PASS
```

Rust 只输出仓库既有的 `updated_at` 未读取 warning；没有测试失败。

## 6. Codex 已执行的三档本地浏览器矩阵

以下是 Codex 已留下的通过证据，但不替代 handoff §0.2 中尚缺的中文/Privacy 通读、键盘、完整
触控目标、逐图肉眼语义和浏览器版本记录。Claude Code 独立验收时应补齐这些项目。

使用仓库根目录下的 `site/` 静态服务，在浏览器 100% 缩放下验收 390、768、1440px：

- `/`、`/zh/`、`/privacy.html`、`/zh/privacy.html`、`/story.html` 共 15 个页面/视口组合，
  全部 `scrollWidth == viewport`。
- 首页 6 张、Story 3 张实际产品图逐张滚入视口；三档共 27 次加载全部完成，intrinsic size
  非零，图片描述非空。
- 中英文 Demo 在三档分别完整走过 Keep 和 Drop，共 12 条路径；Clipboard 成功提示来自真实
  `navigator.clipboard.writeText` 成功分支。
- Keep 后项目有 2 条记录；Drop 后仍为 1 条；两者都完成 5 个 rail step，待审卡不残留。
- 三档每个 Demo 阶段横向溢出均为 0；390px 可见按钮最小高度 44px。
- 中文侧栏运行时 ARIA 为“工作区与项目”，英文为 “Workspaces and projects”。
- 控制台 error / warning 为 0。

Ocean 后续指定单行三图布局，并要求恢复中文 Hero 标题。调整后又针对中英文首页复验：

- 768 / 1440px 的 SAVE、KEEP 均为大图在左、两张小图在右侧上下排列；几何位置检查确认三张图
  同属一行。
- 390px 保持纵向可读回落；三档中英文页面横向溢出均为 0。
- 6 个页面/视口组合中的 36 次 proof 图片加载全部成功，控制台 error / warning 为 0。
- 中文 Hero 的最终 HTML 为 `同一个项目，<br>不必解释第二遍。`。

随后又把单行三图升级为框选放大镜结构：

- SAVE 的两个裁框是 S1 的 `(1,1,800,260)` 与 `(2880,0,680,392)`；KEEP 的两个裁框是
  S2 的 `(620,590,700,410)` 与 `(620,980,700,410)`，四张放大图都与对应源区域逐像素一致。
- 768 / 1440px 下，左总览与右侧两图堆叠的顶边误差为 0；SAVE 底边误差约 1.5 / 1.6px，
  KEEP 约 1.0 / 1.1px。
- 390px 隐藏跨栏虚线但保留框选、编号和全宽放大图；中英文均无横向溢出。

截图人工检查也覆盖了三档首页 KEEP 和 Story；390px 下关键来源、批注、署名与引用均可读，
未出现异常裁断或突兀放大。

## 7. 当前边界与交付状态

- 最终整理时再次只读核对：工作树共 41 个条目，暂存区为空，`HEAD` 与 `origin/main` 都是
  `33af559`。
- 两张 `site/zh/` 生成物都与当前 `renderAll()` 输出一致，中文字符串 `unused=[]`；S1、S2 与
  对应网站总览图的 SHA 分别一致。
- `git status --short -- src src-tauri` 与对应 diff 均为空；app 未修改，也没有未跟踪的 app 文件。
- `docs/HANDOFF.md` 的现有 diff 是上一轮独立验收记录；当前窗口只读，没有改写。
- 中文生成物只由生成器更新，派生截图只由截图脚本更新。
- 没有提交、推送或部署；工作区改动保留给 Ocean 审阅。
- 当前没有已知的阻断性代码问题；上一轮唯一未签的裁图问题已在 `§0-final` 闭环。下一步是 Ocean
  审阅，而不是继续照历史任务单改写。
- 明确未执行但不属于代码欠项的事项在 handoff §0.3：其中提交/推送/部署与 app 改动是明确边界，
  线上验收受未部署限制，跨浏览器/物理机、视觉回归自动化和正式可访问性审计是可选加验；都不应
  被含糊地写成“页面还没做完”。
