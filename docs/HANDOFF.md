# 交接文档 — 2026-08-03 下午(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**本窗三个提交已按 Ocean 明示全部推上 main**(2026-08-03 下午)。工作区干净。
基线全绿:`npx tsc -b` / `npx vitest run`(**157**)/ `cargo test`(**16**,含跨语言
golden 对照 `golden_pack_matches_fixture`)。真库全程没碰。

本窗做完的三件事:

1. **app 内术语统一成 项目/project**(`1823ab5`)—— 上一窗只做到文档层,这次补上 app 层,
   Ocean 批复「连 MCP 散文一起改」。**实机隔离构建逐屏验收过**,中英各一遍。
2. **MCP 设置页英文两句粘连**(`caec556`)—— 实机验收时看到的,句号后少一个空格。
3. **官网中文重新表达**(`75ac159`)—— §6 那一轮,英文一个字没碰,**已部署上线**
   (Deploy site workflow success)。

**👉 下一窗从 §1 挑。上一版交接的 §1 两件事已全部做完。**

---

## 1. 下一窗可以做的(按建议顺序)

**§1 原来那两件已经清空了。** 剩下的都在下面,按「能不能现在动手」分:

### 1.1 现在就能做的

| # | 事情 | 在哪 |
|---|---|---|
| A | **长期计划清单里挑一条开工** —— 第 2 条 Claude Code 引擎位设计稿**已批复可开工**,是唯一一条不需要再拍板的 | §4 表格 |
| B | **网页工程债**:中文独立 URL(`/zh/` + hreflang)、图片 srcset、story 页中文提示 | §5.3 |

### 1.2 要等别的事先完成

| # | 事情 | 卡在哪 |
|---|---|---|
| C | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §2 |
| D | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| E | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.4 |

---

## 2. 🚩 截图现在是旧术语了(本窗新增的欠账,别忘)

**今天把 app 内术语从「脉络/thread」改成「项目/project」之后,官网上所有 app 截图里
的文案都成了旧版。** 最明显的一处:MCP 段那张图里 AI 回的是
"…or open a specific **thread**?"——现在的构建会说 project。

这条**并进 §1 的 C**(截图整体替换),不要单独开一轮:
- Ocean 2026-08-02 已批:重建隔离演示环境作展示,**截图做完整替换**(不是补一两张),
  **整件事安排在 app 代码全部做完之后,和录演示视频一起做**。
- 同时要修的老问题:step 02 主截图、day1/week6 增长图、OG 分享卡、交互演示
  (`site/assets/demo.js` 的 EN+ZH 两套脚本)讲的都是 "Job search / 找工作",
  而首页白纸黑字写着「找工作这类短期事务不是主攻对象」——**文案和图片在互相拆台**。
- 怎么修:演示库里现成就有 `Machine learning course`(Study 工作区)和 `Portfolio site`,
  把主截图和增长对照换成「机器学习课」那条线,天然贴「上课/学一个领域」这个受众。
  脚本 `scripts/seed-growth-demo.sh day1|week6` 现在写死的是找工作的内容,要改。

---

## 3. 本窗改动的边界与代价(后来人会问的)

### 3.1 术语统一:动了什么、刻意没动什么

改的三层:GUI(i18n 字典 34 条 + 17 个组件调用点)、打包正文(`REF_MARKER` →
`→ Referenced project: `、`UNKNOWN_THREAD` → `(unknown project)`)、MCP 散文
(mcp.rs 的工具描述 / 报错 / server instructions / `compress_pack` 描述)。

**刻意没动(别顺手改)**:
1. **MCP 工具名** `list_threads` / `create_thread` / `set_thread_summary` —— 对外接口契约,
   v0.3.0 已有人配好在用,改名等于把别人跑通的配置弄坏。
2. **参数名 / 字段名** `thread_id`、`thread_title`、`ref_thread_id` —— 同上。
3. **SQL 表名** `threads`、**资源 URI 前缀** `spool://thread/`。
4. 源码目录名 `src/components/ThreadView/`、Rust 标识符(纯内部)。
5. 「a spool viewed from above, its thread pulling free」—— 线轴上那根线的本义。
6. **测试夹具里的标题字符串**(`'沉睡脉络'`、`'被指脉络'`、query.test.ts 的 `'脉络'`)
   —— 那是测试数据,不是产品文案。

### 3.2 已知代价:老库的教程不再自动换语言(Ocean 已批准)

`retranslateTutorial` 靠「和种子一字不差」判断用户没动过。本窗改了教程种子文案,
**老库里的教程块从此对不上种子,切语言时不再跟着换**。内容不丢不坏,只是停在原语言。
v0.3.0 才 10 次下载,影响面很小 —— Ocean 2026-08-03 明示接受这个代价。

### 3.3 顺带平掉的两笔旧账

- `'删除脉络'` 改完与既有的 `'删除项目'` 撞键。按 `'删除工作区'` 的现成先例并成一个键,
  同时修好 `'删除项目': 'thread delete'` 这处中英本来就对不上的文案。
- `'没有捕捉目标脉络'` 直译会变成「捕捉目标项目」,改成「没有捕捉目标 — 打开 Spool
  在项目顶栏点『捕捉到此』」。

### 3.4 ⚠️ golden 重生有个坑

`GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts` 会把
`golden-pack.expected.txt` 里**所有时间戳按本机时区平移**(本机 UTC+8,相对已提交版本
差 7 小时),一次重生产生 9 行 diff,其中 7 行与改动无关。

测试本身用 `normalizeDates` 把日期归一化后再比,**所以不影响通过**。规程:
**重生之后只保留该保留的行,把时间戳 `git checkout` 回去**,别把时区噪声提交进去。

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | **未开工**。现在只有 `compress_pack` 一个(`src-tauri/src/mcp.rs` 的 `prompts/list`) | `docs/DESIGN_NEXT_STAGE.md` §4.2 |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手 | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工 | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md`(2026-08-03 从 git 历史捞回并复核了代码坐标) |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」(见 §3.1),但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新。

---

## 5. 环境与现状

### 5.1 隔离验证环境

- **验证构建**:`src-tauri/target/release/bundle/macos/Spool.app`(本窗建的,identifier
  `com.oceanjin.spool.verify`)。**`tauri.conf.json` 的 identifier 已复位成
  `com.oceanjin.spool`**,git 里干净 —— 下次要重建隔离构建,记得改完**立刻**建、
  建完**立刻**改回来。verify 的数据目录本窗已删。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目,默认播 `language:"en"`)、
  `scripts/seed-growth-demo.sh day1|week6`。两个都**只写 verify 数据目录**,真库不碰。
- ⚠️ **首启验证专用 id `.fr1` / `.fr2` / `.fr3` 全都用掉了**。`.fr3` 就是桌面上那个
  `~/Desktop/Spool-首启试装/Spool.app`,**而且还在后台跑着**。再验「启动不弹框」
  **必须换 `.fr4`**。
- ⚠️ **窗口重叠**:`.fr3` 的窗口和新建 verify 构建**默认同坐标**(350,119 · 1100x720),
  很容易拍错窗口并误判「改动没生效」。完整规程和四条踩坑记录已写进 memory
  `isolated-verify-workflow` §10 的 2026-08-03 补充,动手前先读那条。

### 5.2 官网现在的骨架

开头(含信任 chip)→ 那两分钟 → demo → 这是给谁用的(长期做一件事·三张卡)→
怎么用三步 → 中段下载 CTA → 它每周都在变强 → MCP + 客户端阵容 →
你装的到底是什么(权限说明 + 签名公证 + 单文件 + 不追踪 + 一个人做的)→
FAQ 八条 → 标志 → 下载。

**advice 明确表扬、别在后续改版里弄丢的三样**:alt 文本质量、截图是真实界面不是
渲染稿、主动声明「截图用的是演示库,无个人内容」。

**中文文案的判据(本窗定的,后续改中文照这个来)**:念出来不像翻译腔;不堆「它的」
「们」「被」;长定语拆短句;英文的破折号插入语在中文里改成独立句。
`site/privacy.html` 的中文本窗核过,是中文优先写的,不用改;`site/story.html` 正文
**有意只用英文**(portfolio / 申请材料),不是漏译。

### 5.3 网页工程债(还没做的)

- **中文独立 URL**(`/zh/` + hreflang):是对的,但**牵动 Pages 部署结构**,单独一轮。
- 图片 `srcset`:真实 `height` 已补(CLS 已解决),但 2000+px 原图直出没换成多尺寸。
- 中文用户点「中文」再进 story 页会看到一句中文提示说该页只有英文 —— 要么翻译整页,
  要么该页隐藏语言切换。

### 5.4 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿之后(dmg 公证已确认,不再是卡点)。
4. ❌ 刷好评、假装用户安利:不做。

### 5.5 商标结论(动官网/README 提到客户端名字时必看)

2026-08-02 逐家查过官方页面:**六家没有一家可以直接把 logo 摆上我们官网**。
Visual Studio Code **明文禁止**用图标标识/推广自己的产品,且**禁止 `VS Code` 这类简写**;
Anthropic / OpenAI 要**事先书面批准**;Windsurf 要先问;Cursor 最宽松但也没明确许可。
**文字如实说「支持 Cursor」安全(指名性使用),贴 logo 不安全,把 logo 改成单色也不安全。**
完整来源清单在 `docs/DESIGN_MCP_ECOSYSTEM.md` §8,**会过期,下次动这块前重查**。

### 5.6 几条已核实、别再翻案的事实

- **「已签名公证」是真的,可以写**。Releases 上那份 dmg 拉下来实测:
  `xcrun stapler validate` → worked;`spctl -a -vv -t install` → accepted /
  `Notarized Developer ID` / `Hanze JIN (Q5Y5JRXZ58)`。dmg 和里面的 Spool.app 都钉了票。
- ⚠️ **「macOS 12+」是 advice 编的,别写**。实测 `LSMinimumSystemVersion` 是 **10.13**,
  `tauri.conf.json` 从来没设过最低版本。官网只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。
- 自动化测试实际是 **157 vitest + 16 cargo**(本窗数字)。官网没写数字,回避掉了。
- **本地签名凭据文件已结案**:Ocean 2026-08-02 批复「文件留在本机就行,`.gitignore` 挡住即可」。
  `docs/ID.txt` 已在 `.gitignore`,并核实**从未进过任何一次提交**。不撤销、不重发、不挪走,
  **更不许任何人擅自删他的文件**。

### 5.7 还欠的一笔小账

**教程种子里的 MCP 说明还停在「一键接入 Claude Desktop / Cursor」,实际支持六个。**
Ocean 说这句「预留到以后和其他教程修订一起做」。
(设置页折叠段的实机截图**本窗已补上**,§7.6 那笔账清了。)

---

## 6. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。提交后自检:
   `git log -1 --pretty=%B | grep -iE 'co-authored-by|🤖|generated with|noreply@'` 必须为空。
   (⚠️ **别 grep `claude` / `anthropic`** —— 第三方品牌名属于产品内容,必然误报。)
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;每次合成输入前重新定位窗口边界。
   ⚠️ `npm run tauri dev` 走真库路径,别为了看一眼文案就跑它。
4. i18n:**中文即键**;新 GUI 文案同步补 EN。**官网文案要大白话,中文是重写不是翻译**
   (判据见 §5.2)。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   **重生后把无关的时间戳漂移还原**(见 §3.4);动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main **只在改了 `site/**` 时**才触发 `pages.yml` 部署官网(workflow 有 paths 过滤)。
   本窗前两个提交只碰 src/,没有部署;第三个提交碰了 `site/`,**已部署且 success**。
8. **密钥永不上传**:Apple 专用密码这类凭据**可以留在本机文件里**(见 §5.6),
   但**绝不进 git、绝不进聊天、绝不进任何要发出去的文档**。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
   (`docs/webimproveadvice.txt` 一直是未跟踪状态,不是本窗产生的,别顺手提交它。)
10. **`t()` 的键对不上 tsc 抓不到** —— 会静默回落成中文,英文界面当场露出中文。
    改 i18n 之后跑一遍脚本核对:把 `src/lib/i18n/index.ts` 的键集合抽出来,
    比对所有 `t('…')` / `tr('…')` 字面量,以及 `UNDO_OP_LABEL` / PackDialog / useTrayMenu
    这类**把中文放进映射表再交给 t()** 的地方(正则扫不到调用点,要单独比对)。
