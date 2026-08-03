# 交接文档 — 2026-08-03 深夜(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**MCP 三个新 prompt 已实现并提交**(2026-08-03 深夜)。工作区干净,**没推 main**
(没碰 `site/**`,推不推等 Ocean 说)。
基线全绿:`npx tsc -b` / `npx vitest run`(**160**)/ `cargo test`(**17**,+1)。
真库这一窗**一个字都没动**(MCP 实验室走 `SPOOL_DATA_DIR`,和真库物理隔离)。

这一窗做完的两件事:

1. **`weekly_review` / `thread_health` / `distill` 三个 MCP prompt**(§4 第 1 条)+
   实机自测的隔离实验室与评审提示词。详见 §2.5。
2. **中文页 alt / `<noscript>` 这条按 Ocean 的话销案**,不写了。详见 §2.3。

上一窗的两件事(网页工程债 B `7fa8fe7` 已上线、`/Applications/Spool.app` 换成 main 构建)
仍然有效,细节在 §2.1–2.2 与 §3。

**👉 下一窗:先看 Ocean 的 MCP 评审报告(§1.1 B),没有报告就从 §1 挑别的。**

---

## 1. 下一窗可以做的(按建议顺序)

### 1.1 现在就能做的

| # | 事情 | 在哪 |
|---|---|---|
| A | **长期计划清单里挑一条开工** —— 第 2 条 Claude Code 引擎位设计稿**已批复可开工**,是唯一一条不需要再拍板的 | §4 表格 |
| B | **MCP 三个新 prompt 的实机反馈** —— Ocean 在 Claude Desktop / ChatGPT 桌面版跑完评审提示词后会给报告,按报告修 | §2.5 |

### 1.2 要等别的事先完成

| # | 事情 | 卡在哪 |
|---|---|---|
| C | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §2.4 |
| D | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| E | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

---

## 2. 本窗改动的边界与代价(后来人会问的)

### 2.1 语言从「JS 换文字」变成「换网址」——这是架构改动,别改回去

`/` 是英文,`/zh/` 是中文。搜索引擎现在能抓到中文正文,分享出去的链接也不会打开成英文。

- **英文 HTML 是唯一手写源。** `scripts/build-site-zh.mjs` 读 `data-i18n` 键,套
  `scripts/site-zh-strings.mjs` 的中文,生成 `site/zh/index.html` 与 `site/zh/privacy.html`。
- **产物提交进 git**,`pages.yml` 一个字没动 —— 部署上去的东西在仓库里看得见。
- ⚠️ **改完英文页必须重跑 `node scripts/build-site-zh.mjs`。** 忘了也不会漏出去:
  `scripts/build-site-zh.test.mjs` 会重新生成再比对,不一致就红(已验证真的会红)。
- **隐私政策的中文是权威版本、按中文写的**,不是逐句翻译,所以整块存在
  `scripts/site-zh-privacy.html`,由生成器换进去。英文页从此只剩英文。
- `assets/i18n.js` 已删,换成 `assets/lang.js`:不再改 DOM,只告诉交互演示当前是哪种语言,
  并把旧的 `?lang=zh` 链接转到新网址(`/?lang=zh`、`/privacy.html?lang=zh` 都实测过)。
- **story 页有意没有中文版**(portfolio / 申请材料),所以该页**没有语言切换按钮**,
  页顶那句像道歉的中文提示也删了。这是 Ocean 2026-08-03 的选择,别自作主张加回去。

### 2.2 🚩 截图换成无损 WebP —— 偏离了 advice 的建议,理由在这里

advice 写的是「加 srcset」。照做量了一遍,**对这些图是负收益**:

- UI 截图是像素对齐的,大片同色区 PNG 压得极好(capture-page 2030px 才 300K)。
- 重采样会在每条边缘造出中间色、把平坦区打碎 —— **同一张图缩到 760px 反而从 64K 涨到 176K**。
- 真正的杠杆是编码格式:**无损 WebP,像素完全不变**,整套 2358K → 1124K。
  (顺带量过:有损 WebP q92 反而比无损大,截图是合成图,别用有损。)

怎么做的:
- 每张图包一层 `<picture>`,WebP 在前、原 PNG 留作回退 —— 零兼容风险,`alt` /
  `width` / `height` / `loading` 全留在 `<img>` 上没动。
- **只有 `app-thread-before` / `app-thread-after` 这两张**(原图本身带重采样噪点)
  缩小之后确实更小,给了它们真的 `srcset` + `sizes`;其余都是单一候选。
- `scripts/build-site-shots.sh` **自己量**:窄图比原图小 10% 以上才留。换截图之后重跑它,
  它会把该贴进 HTML 的 `srcset` 打印出来。
- 首页一个 Retina 访客实际下载量:**2119K → 571K**。

⚠️ **`picture { display: block }` 是必须的**,还有两条兄弟选择器跟着改了名
(`.pack-shot + .shot-caption` → `.pack-pic + …`;`.shot-group .shot-caption + .shot`
→ `… + picture`)—— 包一层 `<picture>` 会打断兄弟选择器,动这块 CSS 前先看一眼。

### 2.3 中文页的 alt 文本 / `<noscript>`:Ocean 2026-08-03 决定**不写**,这条销案

`/zh/` 上那 12 条图片 alt + 1 句 `<noscript>` 保持英文。不是欠账,是决定。别再提。

### 2.4 🚩 截图现在是旧术语了(上窗欠账,仍未还)

术语从「脉络/thread」改成「项目/project」之后,**官网上所有 app 截图里的文案都成了旧版**。
最明显的一处:MCP 段那张图里 AI 回的是 "…or open a specific **thread**?"。

这条**并进 §1 的 C**(截图整体替换),不要单独开一轮:
- Ocean 2026-08-02 已批:重建隔离演示环境作展示,**截图做完整替换**(不是补一两张),
  **整件事安排在 app 代码全部做完之后,和录演示视频一起做**。
- 同时要修的老问题:step 02 主截图、day1/week6 增长图、OG 分享卡、交互演示
  (`site/assets/demo.js` 的 EN+ZH 两套脚本)讲的都是 "Job search / 找工作",
  而首页白纸黑字写着「找工作这类短期事务不是主攻对象」——**文案和图片在互相拆台**。
- 怎么修:演示库里现成就有 `Machine learning course`(Study 工作区)和 `Portfolio site`,
  把主截图和增长对照换成「机器学习课」那条线。脚本 `scripts/seed-growth-demo.sh day1|week6`
  现在写死的是找工作的内容,要改。
- ⚠️ **换完截图记得重跑 `scripts/build-site-shots.sh`**,再把它打印的 srcset 贴回 HTML。

### 2.5 MCP 新增三个 prompt(本窗做的,§4 第 1 条已开工)

`src-tauri/src/mcp.rs` 的 `prompts/list` 从 1 个变 4 个:`compress_pack` +
**`weekly_review` / `thread_health` / `distill`**(`DESIGN_NEXT_STAGE.md` §4.2 的原计划)。
契约和 compress_pack 一样:**Spool 只负责把确定性的材料装配好,想事情的是客户端那个模型**;
写入仍然要两个开关 + 用户在对话里点头。

- **参数用项目标题,不用 id。** prompt 的参数是**人**在客户端弹窗里手敲的,而硬规则是
  「id 不许出现在用户面前」。新加的 `resolve_thread()` 先按 id 试,再按标题包含匹配,
  完全同名优先,匹配到多个就报歧义并列出候选。`compress_pack` 的 `thread_id` 也走了同一个
  解析器(**参数名没改**,只是现在也认标题)。
- `thread_health` 是 `check_library` 的三个检测器缩到单个项目(查重用 find_similar_blocks
  的口径),外加「判断摘要过没过期」的材料 —— **过期与否不由 Spool 判定**,库里没有摘要
  写作时间这个字段,报告里写明了让模型自己判断。
- `distill` embed 的是 pack + Block IDs 表(所以模型能用 `ref_block_id` 引用它依据的块),
  预算沿用 get_pack 的 50000。
- 三个 prompt 都会先读一次「允许 AI 写入」开关:**关着就直接告诉模型别调写入工具**,
  免得用户点了头才被工具拒绝。
- 顺手抽了一个 `source_family()`(署名家族标签),让 check_library 和 thread_health
  不会各写一份字面量。
- 测试:`prompts_resolve_by_title_and_report_thread_health`(cargo 17 个,+1)。
  另外拿 release 二进制 + 临时数据目录**跑过真 stdio**:四个 prompt 都回得来,
  标题解析、歧义报错、缺参数报错、空项目报错都对。

**实机自测的东西已经备好,等 Ocean 的报告**:
- `scripts/seed-mcp-lab.sh` —— 一键建隔离实验室(桌面 `Spool-MCP-Lab/`),
  **靠 `SPOOL_DATA_DIR` 隔离,不需要改 identifier 重建**(env 写在启动脚本里,
  客户端就算不支持 per-server env 也指不到真库);`--connect` / `--disconnect` 会把
  `spool_lab` 这条写进/删出 Claude Desktop 与 `~/.codex/config.toml`(**先备份,
  绝不碰 `spool` 那条**;两个文件的 merge 都拿他真实配置的副本试过,可反复执行)。
- `docs/MCP_LAB_PROMPT.md` —— 两份可整段复制的评审提示词(Claude Desktop / ChatGPT 桌面版)。
  不是普通使用流程,是**让 AI 主动找茬**:必跑清单、越界参数、一致性对账、缺什么功能、
  **它还想要什么权限**。第 0 步是**环境识别闸门**(本机同时装着真 Spool):
  必须先报出实验室标记 `SPOOL-MCP-LAB-2026-08-03` 才准往下走。
  文末那张「埋了什么」的表是给 Ocean 自己对答案的,别喂给 AI。

### 2.6 `site/assets/shots/mcp-ask.png` 没有任何页面引用

本来就是死文件,本窗没动(CLAUDE.md §3:不擅自删预先存在的死代码)。要删得 Ocean 点头。

---

## 3. 换装:`/Applications/Spool.app` 已换成当前 main 的构建

Ocean 2026-08-03 明示。做法和**为什么这么做**,下次换装照抄:

1. **先备份真库**(硬规则 3)。备份路径见 §5.1,哈希核对过一致。
2. ⚠️ **`target/release/bundle` 里那个构建的 identifier 是 `com.oceanjin.spool.verify`,
   绝不能直接装** —— 装上去会指向 verify 数据目录,看起来就像「数据全没了」。
   必须重新构建(`tauri.conf.json` 里是 `com.oceanjin.spool`,git 干净)。
3. ⚠️ **必须用 Developer ID 签,不能用默认的 `Spool Dev`。**
   `tauri.conf.json` 里写死的是 `"signingIdentity": "Spool Dev"`,直接构建出来是 Dev 签名;
   **换签名身份 = macOS 认成另一个 app = 已授的输入监控/辅助功能权限当场失效,
   双击 ⌥ 捕捉会停摆。** 用环境变量覆盖,不改文件:

   ```
   APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)" \
     npm run tauri build -- --bundles app
   ```

   两个证书本机都有(`security find-identity -v -p codesigning`)。
4. 本地构建**没有公证**,但本地构建的文件没有 quarantine 属性,Gatekeeper 不拦。
   (对外发 Release 仍然要走公证,那条路见 memory `distribution-route-notarized-dmg`。)

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | **已实现**(2026-08-03,`prompts/list` 现在 4 个)。**等 Ocean 实机评审报告后再改** | 实现与自测环境见 §2.5;原设计 `docs/DESIGN_NEXT_STAGE.md` §4.2 |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手 | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md`(2026-08-03 从 git 历史捞回并复核了代码坐标) |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」,但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新。

---

## 5. 环境与现状

### 5.1 真库与备份

- 真库:`~/Library/Application Support/com.oceanjin.spool/spool.db`
- **本窗换装前的备份**:同目录 `spool.db.backup-20260803-215543-preinstall`,
  哈希与当时的真库一致。这次换装不涉及 schema 迁移(`1823ab5` 之后没动过 schema)。

### 5.2 隔离验证环境

- **验证构建**:`src-tauri/target/release/bundle/macos/Spool.app`。⚠️ **本窗末尾它是
  `com.oceanjin.spool` + Developer ID 签名**(为了换装重建的),**不再是 verify 构建**。
  下次要做隔离验证,得改 identifier 重建 —— 改完**立刻**建、建完**立刻**改回来。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目,默认播 `language:"en"`)、
  `scripts/seed-growth-demo.sh day1|week6`。两个都**只写 verify 数据目录**,真库不碰。
- **MCP 实验室**:`scripts/seed-mcp-lab.sh`(桌面 `Spool-MCP-Lab/`,见 §2.5)。
  ⚠️ 它走的是**另一条隔离路线** —— `SPOOL_DATA_DIR` + 二进制副本,**不改 identifier、
  不装 app、不碰 GUI**。只验 MCP 面时用它,比重建 verify 构建轻得多;
  要验窗口/权限/首启仍然只能走下面那套 identifier 流程。
- ⚠️ **首启验证专用 id `.fr1` / `.fr2` / `.fr3` 全都用掉了**。`.fr3` 就是桌面上那个
  `~/Desktop/Spool-首启试装/Spool.app`。再验「启动不弹框」**必须换 `.fr4`**。
- ⚠️ **窗口重叠**:`.fr3` 的窗口和新建 verify 构建**默认同坐标**(350,119 · 1100x720),
  很容易拍错窗口并误判「改动没生效」。完整规程和四条踩坑记录已写进 memory
  `isolated-verify-workflow` §10 的 2026-08-03 补充,动手前先读那条。

### 5.3 官网现在的骨架

开头(含信任 chip)→ 那两分钟 → demo → 这是给谁用的(长期做一件事·三张卡)→
怎么用三步 → 中段下载 CTA → 它每周都在变强 → MCP + 客户端阵容 →
你装的到底是什么(权限说明 + 签名公证 + 单文件 + 不追踪 + 一个人做的)→
FAQ 八条 → 标志 → 下载。

**advice 明确表扬、别在后续改版里弄丢的三样**:alt 文本质量、截图是真实界面不是
渲染稿、主动声明「截图用的是演示库,无个人内容」。
(⚠️ 第二样是本窗选无损 WebP 而不是量化压缩的原因 —— 像素一个都没变。)

**中文文案的判据(后续改中文照这个来)**:念出来不像翻译腔;不堆「它的」「们」「被」;
长定语拆短句;英文的破折号插入语在中文里改成独立句。
`site/privacy.html` 的中文是中文优先写的,不用改;`site/story.html` 正文
**有意只用英文**(portfolio / 申请材料),不是漏译。

### 5.4 网页工程债(还剩什么)

上一版这一节的三条**已全部做完**(中文独立 URL、srcset、story 页提示)。剩下:
- 没有 sitemap.xml、没有 robots.txt。没人提过,不确定要不要。
(中文页 alt / `<noscript>` 已由 Ocean 拍板不写,见 §2.3。)

### 5.5 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿之后(dmg 公证已确认,不再是卡点)。
4. ❌ 刷好评、假装用户安利:不做。

### 5.6 商标结论(动官网/README 提到客户端名字时必看)

2026-08-02 逐家查过官方页面:**六家没有一家可以直接把 logo 摆上我们官网**。
Visual Studio Code **明文禁止**用图标标识/推广自己的产品,且**禁止 `VS Code` 这类简写**;
Anthropic / OpenAI 要**事先书面批准**;Windsurf 要先问;Cursor 最宽松但也没明确许可。
**文字如实说「支持 Cursor」安全(指名性使用),贴 logo 不安全,把 logo 改成单色也不安全。**
完整来源清单在 `docs/DESIGN_MCP_ECOSYSTEM.md` §8,**会过期,下次动这块前重查**。

### 5.7 几条已核实、别再翻案的事实

- **「已签名公证」是真的,可以写**。Releases 上那份 dmg 拉下来实测:
  `xcrun stapler validate` → worked;`spctl -a -vv -t install` → accepted /
  `Notarized Developer ID` / `Hanze JIN (Q5Y5JRXZ58)`。dmg 和里面的 Spool.app 都钉了票。
  (⚠️ **本机 `/Applications` 里现在装的是本地构建,没公证** —— 见 §3。这不影响官网那句话,
  官网说的是下载包。)
- ⚠️ **「macOS 12+」是 advice 编的,别写**。实测 `LSMinimumSystemVersion` 是 **10.13**,
  `tauri.conf.json` 从来没设过最低版本。官网只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。
- 自动化测试实际是 **160 vitest + 16 cargo**(本窗数字)。官网没写数字,回避掉了。
- **本地签名凭据文件已结案**:Ocean 2026-08-02 批复「文件留在本机就行,`.gitignore` 挡住即可」。
  `docs/ID.txt` 已在 `.gitignore`,并核实**从未进过任何一次提交**。不撤销、不重发、不挪走,
  **更不许任何人擅自删他的文件**。

### 5.8 还欠的一笔小账

**教程种子里的 MCP 说明还停在「一键接入 Claude Desktop / Cursor」,实际支持六个。**
Ocean 说这句「预留到以后和其他教程修订一起做」。

---

## 6. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。提交后自检:
   `git log -1 --pretty=%B | grep -iE 'co-authored-by|🤖|generated with|noreply@'` 必须为空。
   (⚠️ **别 grep `claude` / `anthropic`** —— 第三方品牌名属于产品内容,必然误报。)
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
   (⚠️ `cwebp` 是 `scripts/build-site-shots.sh` 的前置,本机 homebrew 已有,不是 npm 依赖。)
3. 真库动前备份;实机验证走隔离 identifier 流程;每次合成输入前重新定位窗口边界。
   ⚠️ `npm run tauri dev` 走真库路径,别为了看一眼文案就跑它。
4. i18n:**中文即键**;新 GUI 文案同步补 EN。**官网文案要大白话,中文是重写不是翻译**
   (判据见 §5.3)。⚠️ **改了 `site/index.html` 或 `site/privacy.html` 要重跑
   `node scripts/build-site-zh.mjs`**(忘了会被 vitest 抓到)。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   **重生后把无关的时间戳漂移还原**(本机 UTC+8,一次重生会平移 7 小时,产生 7 行无关 diff。
   测试用 `normalizeDates` 归一化后比对,不影响通过,但别把时区噪声提交进去);
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main **只在改了 `site/**` 时**才触发 `pages.yml` 部署官网(workflow 有 paths 过滤)。
8. **密钥永不上传**:Apple 专用密码这类凭据**可以留在本机文件里**(见 §5.7),
   但**绝不进 git、绝不进聊天、绝不进任何要发出去的文档**。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
   (`docs/webimproveadvice.txt` 一直是未跟踪状态,不是本窗产生的,别顺手提交它。)
10. **`t()` 的键对不上 tsc 抓不到** —— 会静默回落成中文,英文界面当场露出中文。
    改 i18n 之后跑一遍脚本核对:把 `src/lib/i18n/index.ts` 的键集合抽出来,
    比对所有 `t('…')` / `tr('…')` 字面量,以及 `UNDO_OP_LABEL` / PackDialog / useTrayMenu
    这类**把中文放进映射表再交给 t()** 的地方(正则扫不到调用点,要单独比对)。
