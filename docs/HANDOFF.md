# 交接文档 — 2026-08-05(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**第二轮评审留下的六条设计级问题全部修完**(那六条是同一件事:*规矩写在「给 AI 的话」里,
没写进数据结构*),**实验室已用新程序重播、六条改动逐条实机验过,第三轮评审提示词已重写。**
(2026-08-05)

**Ocean 明示:先不推 main。** 推之前必须再问一次。本地已攒 **25** 个提交,工作区干净
(`docs/MCP_feedback.md`、`docs/webimproveadvice.txt` 是未跟踪的资料文件,别顺手提交)。
基线全绿:`npx tsc -b` / `npx vitest run`(**164**)/ `cargo test`(**21**)。

**👉 下一窗第一件事:把第三轮评审发出去**(`docs/MCP_LAB_PROMPT.md` 已经是第三轮的,
实验室今天刚重播过,直接从 §1 的 A 开始)。

---

## 1. 下一窗要做的

| # | 事情 | 卡在哪 |
|---|---|---|
| A | **发第三轮评审**:提示词和实验室都已就绪。⚠️ **一个客户端测完、重播一次实验室、再测下一个**(上一轮三个并行,互相看得见对方写的块,数字全要打折) | 可开工,不需要拍板 |
| B | **Claude Code 引擎位**(§4 第 2 条,已批复可开工,目标 v0.4.0) | **Ocean 2026-08-05 明示:先留着,等第三轮测试结果出来再动** |
| C | **三条较轻的 MCP 旧账**(§3.1)—— 不拍板也能修 | 可开工,建议等第三轮报告一起排 |
| D | **AI 写坏的块怎么回收:另一半还没定**(§3.1 最后一条) | **等 Ocean 明示** |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| F | **截图 + 演示脚本整体重建**(找工作 → 机器学习课) | Ocean 已批:**排在 app 代码全部做完之后,和录演示视频一起做**。见 §3.3 |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示。见 §5.5 |

---

## 2. 这一窗做了什么

Ocean 2026-08-05 明示:**六条要拍板的全部按建议走**,先做 A(修那六条)和 D(重写提示词);
C 的引擎位留着等下一轮测试结果。**A、D 都做完了。**

### 2.1 六条设计级问题(提交 `b3be2f8`、`d1893df`、`f900acf`)

上一轮三份报告的落点是同一句话:**只要 AI 听话就一切正常;有一次不听话,就没有第二道闸。**
这六条把闸门从「嘱咐」搬进了代码。

| # | 修了什么 | 关键取舍 |
|---|---|---|
| 1 | **裸 id 从"写完警告"改成硬拒绝**(add_block / set_thread_summary / create_thread) | 两层检查:**D-2** 拿库内真实 id 做子串比对(能说出是哪一块,报的是可见编号 `#8`,不是 id);**D-1** 只认形状(21 位、大小写混排)。两层话术不同,是故意的 |
| 2 | **add_block 加 `dry_run`** | 预演告诉你"存下去会是 #17",不写任何东西。这是"写之前先给用户看一眼"最小的那一步 |
| 3 | **报错正文不再回显任何 id** | `thread_id="nope"` 的报错整句不含 "nope",改成指路 `list_threads`。错误信息是最容易被原样念给用户的东西 |
| 4 | **distill 的 Block IDs 表挪出 pack 正文** | pack 的定位是"用户原样粘给别的 AI 的东西",id 表现在在闭界之后 |
| 5 | **pack 里不再印绝对路径** | 附件只剩文件名,网址整条留着(网址本来就是公开的)。`get_blocks` 的 JSON **仍有**完整路径 —— 那份是给调用方当参数用的,不出门 |
| 6 | **材料和指令之间加了机器能认的界** | `⟦SPOOL:MATERIAL⟧` … `⟦/SPOOL:MATERIAL⟧`。用户正文里若出现同形闭界,拼装时改写成 `(/SPOOL:MATERIAL)` 圆括号版,**全文只会有一个真闭界** |

⚠️ **第 5 条是两侧锁步改动**(`src/lib/pack/assemble.ts` + `mcp.rs`),**触发了 golden 重生**,
重生带来的 7 小时时间戳漂移已还原(硬规则 5)。

**补的测试**:老的 `add_block_warns_on_suspect_raw_id` 已删除(它验的行为不存在了),
换成 `write_tools_refuse_raw_ids_and_can_dry_run` —— 断言的是**行数没变**(真的没写进去),
不是断言警告字符串。pack 无路径那条断言的是**性质**:`expect(out).not.toContain('/Users/hzjin')`。

### 2.2 六条都做了实机验证(不是只跑单元测试)

实验室用新程序重播过一次(39 块 / 11 个可见项目,干净的),然后**直接用 stdio 喂 JSON-RPC**
逐条验(手法见 §5.2 那条 🆕)。结果:

| 验的 | 实测 |
|---|---|
| 裸 id 四个位置 | content / annotation / summary / title 全部拒,**块数留在 39 一个没多** |
| 粘前缀 `见block:LabBk…吧` | 照样拒(子串比对,不靠分词) |
| `spool://` URI | 拒,话术说的是「项目〈机器学习课〉的内部 id」 |
| 形状像但库里没有 | 拒,但话术是「21 位、大小写混排、和内部 id 一个形状」 |
| **正常长英文词** | `internationalization`(20)、`counterrevolutionaries`(22)、纯数字 21 位、base64 —— **全部放行**。这是这条修复最大的误伤风险,专门验了 |
| dry_run | 报 `would_be_seq:17` / `written:false`;去掉 dry_run 真写,编号确实 17 |
| 报错 | 不含 "nope" |
| id 表 | pack 正文 13207 结束,`---` 之后才是 `## Block IDs` |
| pack 路径 | 全文 `/Users/` 出现 **0 次** |
| 材料界 | 开界 95 → 闭界 13320 → id 表 13949,顺序恒定 |

### 2.3 第三轮评审提示词(提交 `90b3508`)

`docs/MCP_LAB_PROMPT.md` 已重写。**回归表从 R11 扩到 R17**,新的六条是重点。
删掉/改掉三处已经过期的:

- 老 `C5.e`「故意塞裸 id,看它怎么警告你」→ 现在是硬拒绝,没有"警告完你打算怎么办"这一步了,
  升级成 R12(六个子场景,含误伤边界)。
- 老 `N1`「你分得清材料和指令吗」→ 现在有界了,改成 R17 正面验它(包括问 AI 猜没猜到伪造闭界会被转义)。
- 「附件正文搜不到」从"别再报"名单里**挪出来** —— v9 已经能搜了,写着搜不到会让 AI 主动
  对用户说错话。改成 R12 之外的一条正面验证点。

**对答案表全部用新程序重测**(第三轮判报告真假就看这张表):

| 项 | 上一轮 | 这一轮 |
|---|---|---|
| pack 全文 | 13229 | **13207**(差的 87 就是去掉的三处路径) |
| `approx_pack_chars` | 12979(低 2%,会静默丢块) | **13432**(高 1.7%,方向安全) |
| `max_chars=8000` | 7637 | **7615** |
| 拒绝时报的下限 | 4137 | **4060** |

还补了一条以前没写的:**39 块和 37 块都是对的** —— 库里 39,其中 2 块躺在软删项目和孤儿项目里,
工具报 37。AI 要是报 39,那是软删过滤漏了,属最严重级别。

---

## 3. 还没还的旧账

### 3.1 MCP 侧剩下的(都不卡拍板,除了最后一条)

**三条较轻的**(第二轮报的,一直排在六条大的后面):

1. `list_threads` 补 `last_block_at` —— 现在 AI 写一条摘要就能把项目顶到"最近活跃"第一位。
2. 附件命中那一栏没有 `source` —— 判不了权威类别(四类里的哪一类)。
3. pack 里跨项目的 `↩ cites:` 不标项目名 —— 读的人会以为被引的块就在同一个项目里。

**一条要 Ocean 明示的**:🚩 **AI 写坏的块没有回收路径**。
上一轮 Claude Desktop 自己写坏了一块(客户端把 `annotation` 参数灌进了正文),
当场知道写坏了却什么都做不了。这一窗做的 `dry_run` 解决的是**写之前**那一半;
**写之后**那一半(「撤回我自己刚写的块」,限 AI 署名 + 短时间窗)还没定。
它不违反"AI 绝不改用户写下的字",但边界要 Ocean 划。

### 3.2 三方都提到的「缺什么功能」(产品向,不是 bug)

去重后按被提及次数排。⚠️ 第 1 条这一窗只做了一半(`dry_run` 是接口侧的预演,
app 里的确认面没做):

1. **写之前先给用户看一眼**("存到哪里、正文是什么、依据是哪块",点头才落地)—— 三方都提。
   **接口侧已有 `dry_run`,GUI 侧未做**
2. **AI 到底往我库里写了什么** —— app 里一个"AI 最近写入"的列表,能跳过去就地改
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他
4. **重复块:用户想清但清不动** —— 库里就躺着他自己写的"待办:把那三条重复的合并掉",
   从 08-01 拖到今天。缺的不是删除权限,是**从发现到动手之间的那一步**
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间,过期与否你自己判断"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看

### 3.3 🚩 截图现在是旧术语了(五窗未还)

术语从「脉络/thread」改成「项目/project」之后,**官网上所有 app 截图里的文案都成了旧版**。
最明显的一处:MCP 段那张图里 AI 回的是 "…or open a specific **thread**?"。

这条**并进 §1 的 F**(截图整体替换),不要单独开一轮:
- Ocean 2026-08-02 已批:重建隔离演示环境作展示,**截图做完整替换**,
  **整件事安排在 app 代码全部做完之后,和录演示视频一起做**。
- 同时要修的老问题:step 02 主截图、day1/week6 增长图、OG 分享卡、交互演示
  (`site/assets/demo.js` 的 EN+ZH 两套脚本)讲的都是 "Job search / 找工作",
  而首页白纸黑字写着「找工作这类短期事务不是主攻对象」——**文案和图片在互相拆台**。
- 怎么修:演示库里现成就有 `Machine learning course`(Study 工作区)和 `Portfolio site`。
  脚本 `scripts/seed-growth-demo.sh day1|week6` 现在写死的是找工作的内容,要改。
- **重拍时注意:块上现在多了 `#12` 这个新视觉元素**。
- ⚠️ **换完截图记得重跑 `scripts/build-site-shots.sh`**,再把它打印的 srcset 贴回 HTML。

### 3.4 其余旧账

- `site/assets/shots/mcp-ask.png` 没有任何页面引用。本来就是死文件,要删得 Ocean 点头。
- 没有 sitemap.xml、没有 robots.txt。没人提过,不确定要不要。
  (中文页 alt / `<noscript>` 已由 Ocean 2026-08-03 拍板**不写**,销案。)
- **App 自己的搜索框仍搜不到附件正文**。MCP 侧已经能搜(v9),app 侧要改就得动
  `SearchField` 类型、片段渲染、块内 `<mark>` 跳转那一整条链,是另一件事。
- ⚠️ **界面上那个 `#n` 至今没有人眼验过**。Spool 是托盘应用,主窗不跳前
  (`capture-note-first` 那条铁律),AX 里取不到 window 1。数据库和 pack 这两层都是全的,
  要眼见为实,Ocean 自己点开主窗看一眼就行。

---

## 4. 🚩 长期计划清单(**每次改写交接都必须原样带上这一节**)

Ocean 2026-08-03 指出:**MCP 新增接口和 Windows 版这两条,在 08-02 那次交接改写里弄丢了。**
教训:交接文档每窗重写,**长期计划只写在这里就会蒸发**。所以每条都有一份活在设计稿里,
这一节只是**索引 + 状态**;改写交接时照抄这一节,别删。

| # | 计划 | 状态 | 细节在哪 |
|---|---|---|---|
| 1 | **MCP 新增三个 prompt**:`weekly_review`(拉 digest → 周回顾块)、`thread_health`(查重+悬空+摘要过期,与 `check_library` 同口径)、`distill`(一条脉络提炼成结论块) | ✅ **已实现,第二轮三方评审已验**。第 4、6 条遗留问题(id 表进了 pack / 材料无界)**2026-08-05 已修** | 原设计 `docs/DESIGN_NEXT_STAGE.md` §4.2(⚠️「斜杠菜单即发现面」的前提已被实测推翻) |
| 2 | **Claude Code 引擎位**(`claude -p` headless + 挂自己的 MCP server) | 设计稿**已批复可开工**,目标 v0.4.0,未动手。⚠️ **Ocean 2026-08-05:先留着,等第三轮测试结果出来再动** | `docs/DESIGN_AI_ENGINE.md`(§4.1 的细化稿) |
| 3 | **AI 活动面**(脉络级折叠区,纯读,从 source + 时间聚合) | 未开工。**三方评审又要到了这条**(见 §3.2 第 2 项) | `DESIGN_NEXT_STAGE.md` §4.3 |
| 4 | **「我的思考」凸显**(只看我写的过滤;摘要区分我的批注 vs AI 结论) | 未开工。三份实机报告独立要到了这条(`source_contains` 表达不了「source 为空」) | `DESIGN_NEXT_STAGE.md` §4.4 |
| 5 | **首日价值三小项**(捕捉满三条提示打包 / 今天读了什么日卡 / 讲透「没配 MCP 也全功能」) | 未开工。⚠️ 其中「提示打包」与首启那轮做的一次性收口是同一块地,做之前先看 `DESIGN_FIRST_RUN.md` §7 | `DESIGN_NEXT_STAGE.md` §4.5 |
| 7 | **MCP 零摩擦使用引导** | ✅ **2026-08-04 全部落地**(四个决定),设计稿已删。第二轮评审对 Z1–Z4 的回答见 `docs/MCP_feedback.md` | 实现见 08-04 版交接 §2.3 |
| 8 | **schema v9 那一轮**:块的可见编号(H-1)+ PDF 正文能被搜到(H-3) | ✅ **2026-08-04 落地,真库已迁移**。app 搜索框那半截见 §3.4 | 实现见 08-04 版交接 §2.1 |
| 9 | **D-1:add_block 硬拒绝裸 id** + **D-2:拿库内真实 id 建索引做精确比对** | ✅ **2026-08-05 落地**(提交 `d1893df`),实机验过含误伤边界 | 见 §2.1 第 1 条 |
| 10 | 🆕 **AI 写坏的块怎么回收(写之后那一半)** | `dry_run` 已解决"写之前";"撤回我自己刚写的"**要 Ocean 划边界** | 见 §3.1 最后一条 |
| 6 | **Windows 版** | **排在所有任务最后**(Ocean 2026-07-30 定序),现在别动。三个待拍板(手势 / 签名花钱 / 首版范围)都要他本人决定 | `docs/DESIGN_WINDOWS_PORT.md` |

> 上表第 1、3 条里的「脉络」是**设计稿原文的措辞**,照抄未改。真去实现时注意:
> app 内现在一律叫「项目 / project」,但 MCP 工具名仍是 `list_threads` 这一套。

明确**不做**的(别再提):app 内嵌 LLM / API key 输入面(mcp-first-pivot 已否决)、
OCR 截图捕捉、应用内自动更新、语义检索(本地 embedding 太重 / 云端撞「零出网」)、
AI 的删除/撤回/编辑接口(append-only 是宪法级承诺 —— ⚠️ §4 第 10 条要的是
「回收 AI 自己刚写的」,和这条不是一回事,别混为一谈)。

---

## 5. 环境与现状

### 5.1 真库与备份

- 真库:`~/Library/Application Support/com.oceanjin.spool/spool.db`,**现在是 schema v9**。
- 最近备份:`spool.db.backup-20260804-175245-preinstall-v9`(换装前,`sqlite3 .backup`,已核对)。
  更早两份:`spool.db.backup-20260804-141006-preschema-v9`、`spool.db.backup-20260803-215543-preinstall`。
- app 自己在迁移前又存了一份:`spool.pre-migration-v8-2026-08-04T09-55-44-152Z.db`。
- **这一窗没有碰真库**(改的全是 MCP 侧代码,验证全在实验室里做)。

### 5.2 隔离验证环境

- **MCP 实验室**:`scripts/seed-mcp-lab.sh`
  (`~/Library/Application Support/com.oceanjin.spool.lab/`)。
  🆕 **2026-08-05 已用新程序重播,是干净的**(39 块 / 11 个可见项目,没有评审残留)。
  - ⚠️ **别把它挪进桌面/文稿/下载** —— 那三个是 TCC 保护目录,Claude Desktop 没被授权时
    连启动脚本都 exec 不了(`Operation not permitted` + 一连上就断,2026-08-03 实测踩过)。
  - ⚠️ 它走的是**另一条隔离路线** —— `SPOOL_DATA_DIR` + 二进制副本,**不改 identifier、
    不装 app、不碰 GUI**。
  - 🆕 **只想验一处改动、又不想惊动别人的会话**:直接用 stdio 喂 JSON-RPC 给那份程序副本 ——
    `initialize` → `notifications/initialized` → `tools/call`,三行就能问出任何工具的真实返回。
    这一窗那两张对答案表就是这么测的。别人在跑评审时,这是唯一安全的验证手法。
- **验证构建**:`src-tauri/target/release/bundle/macos/Spool.app`。⚠️ 它现在是
  `com.oceanjin.spool` + Developer ID 签名(08-04 换装用的就是它),**不是 verify 构建**。
  要做隔离验证,得改 identifier 重建 —— 改完**立刻**建、建完**立刻**改回来。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目,默认播 `language:"en"`)、
  `scripts/seed-growth-demo.sh day1|week6`。两个都**只写 verify 数据目录**,真库不碰。
- ⚠️ **首启验证专用 id `.fr1` / `.fr2` / `.fr3` 全都用掉了**。再验「启动不弹框」**必须换 `.fr4`**。
- ⚠️ **窗口重叠**:`.fr3` 的窗口和新建 verify 构建**默认同坐标**(350,119 · 1100x720),
  很容易拍错窗口并误判「改动没生效」。完整规程在 memory `isolated-verify-workflow` §10。

### 5.3 换装:`/Applications/Spool.app`

08-04 那窗做过一次。再来一次照抄:

1. **先备份真库**(硬规则 3)。
2. ⚠️ **`target/release/bundle` 里那个构建的 identifier 可能是 `com.oceanjin.spool.verify`,
   绝不能直接装** —— 装上去会指向 verify 数据目录,看起来就像「数据全没了」。装之前
   `PlistBuddy -c 'Print :CFBundleIdentifier'` 核一眼。
3. ⚠️ **必须用 Developer ID 签,不能用默认的 `Spool Dev`。** 换签名身份 = macOS 认成另一个
   app = 已授的输入监控/辅助功能权限当场失效,双击 ⌥ 捕捉会停摆。装之前把新旧两边的
   `codesign -dvv` 比一遍。用环境变量覆盖,不改文件:

   ```
   APPLE_SIGNING_IDENTITY="Developer ID Application: Hanze JIN (Q5Y5JRXZ58)" \
     npm run tauri build -- --bundles app
   ```
4. **`osascript -e 'tell application "Spool" to quit'` 带不走它** —— 托盘应用。
   换完要杀掉旧的主进程和 `--overlay` 进程,再 `open -a`。
5. 本地构建**没有公证**,但本地构建的文件没有 quarantine 属性,Gatekeeper 不拦。
   (对外发 Release 仍要走公证,见 memory `distribution-route-notarized-dmg`。)

### 5.4 官网现在的骨架

开头(含信任 chip)→ 那两分钟 → demo → 这是给谁用的(长期做一件事·三张卡)→
怎么用三步 → 中段下载 CTA → 它每周都在变强 → MCP + 客户端阵容 →
你装的到底是什么(权限说明 + 签名公证 + 单文件 + 不追踪 + 一个人做的)→
FAQ 八条 → 标志 → 下载。

- `/` 是英文,`/zh/` 是中文。**英文 HTML 是唯一手写源**;
  `scripts/build-site-zh.mjs` 生成中文页,产物提交进 git。
  ⚠️ **改完英文页必须重跑 `node scripts/build-site-zh.mjs`**(忘了会被 vitest 抓到)。
- 隐私政策的中文是**权威版本、按中文写的**,存在 `scripts/site-zh-privacy.html`。
- **story 页有意没有中文版**(portfolio / 申请材料),所以该页**没有语言切换按钮**。
  这是 Ocean 2026-08-03 的选择,别自作主张加回去。
- 截图是**无损 WebP**(像素完全不变),每张包一层 `<picture>`,原 PNG 留作回退。
  ⚠️ `picture { display: block }` 是必须的,还有两条兄弟选择器跟着改了名。
- **advice 明确表扬、别在后续改版里弄丢的三样**:alt 文本质量、截图是真实界面不是
  渲染稿、主动声明「截图用的是演示库,无个人内容」。
- **中文文案的判据**:念出来不像翻译腔;不堆「它的」「们」「被」;长定语拆短句;
  英文的破折号插入语在中文里改成独立句。

### 5.5 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿之后。
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
  `Notarized Developer ID` / `Hanze JIN (Q5Y5JRXZ58)`。
  (⚠️ **本机 `/Applications` 里装的是本地构建,没公证** —— 见 §5.3。
  这不影响官网那句话,官网说的是下载包。)
- ⚠️ **「macOS 12+」是 advice 编的,别写**。实测 `LSMinimumSystemVersion` 是 **10.13**。
  官网只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。
- 自动化测试实际是 **164 vitest + 21 cargo**(本窗数字)。官网没写数字,回避掉了。
- **本地签名凭据文件已结案**:Ocean 2026-08-02 批复「文件留在本机就行,`.gitignore` 挡住即可」。
  `docs/ID.txt` 已在 `.gitignore`,并核实**从未进过任何一次提交**。不撤销、不重发、不挪走,
  **更不许任何人擅自删他的文件**。
- **`max_chars` 是按 Unicode 码点算的**,JS 的 `.length` 数同一段文本会更大
  (📌 这类星区字符每个多算 1)。第二轮有报告把这 10 个字符的差当成 bug 报了,不是。
- 🆕 **实验室里 39 块和 37 块都对**:库里 39,其中 2 块在软删项目和孤儿项目里,
  工具只该看见 37。报告里出现 39 才是 bug。

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
   (判据见 §5.4)。⚠️ **改了 `site/index.html` 或 `site/privacy.html` 要重跑
   `node scripts/build-site-zh.mjs`**(忘了会被 vitest 抓到)。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   **重生后把无关的时间戳漂移还原**(本机 UTC+8,一次重生会平移 7 小时);
   动 schema 必须迁移注册表 + 双侧锁步常量(`EXPECTED_SCHEMA_VERSION` 现在是 **9**)+ 真库备份。
   > 💡 改之前先 grep 一下 golden 里有没有那句话 —— 没有就不用重生,能省一整套流程。
   > (08-04 改 range 表头就没触发;08-05 改附件路径**触发了**,漂移已还原。)
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main **只在改了 `site/**` 时**才触发 `pages.yml` 部署官网(workflow 有 paths 过滤)。
8. **密钥永不上传**:Apple 专用密码这类凭据**可以留在本机文件里**(见 §5.7),
   但**绝不进 git、绝不进聊天、绝不进任何要发出去的文档**。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
   (`docs/webimproveadvice.txt` 和 `docs/MCP_feedback.md` 一直是未跟踪状态,别顺手提交。)
10. **`t()` 的键对不上 tsc 抓不到** —— 会静默回落成中文,英文界面当场露出中文。
    改 i18n 之后跑一遍脚本核对:把 `src/lib/i18n/index.ts` 的键集合抽出来,
    比对所有 `t('…')` / `tr('…')` 字面量,以及 `UNDO_OP_LABEL` / PackDialog / useTrayMenu
    这类**把中文放进映射表再交给 t()** 的地方(正则扫不到调用点,要单独比对)。
11. **改了 Rust 的 MCP 代码,客户端不重启就还是旧程序。**
    `cargo build --release` → `scripts/seed-mcp-lab.sh` → **重启客户端**,三步缺一不可。
    ⚠️ 重播实验室会冲掉别人正在跑的评审会话 —— 别人在测的时候,改用 §5.2 那条 stdio 办法。
12. **mcp.rs 里给用户看的新文案必须走 `t!` / `ts!`,两种语言一起写。**
    漏了不会报错,只会在英文界面下冒出一句中文。改完可以扫一遍:
    `grep -n '[一-龥]' src-tauri/src/mcp.rs | grep -v 't!(' | grep -v 'ts!('`
    —— 剩下的应该只有注释和 `t!` 的中文那一半。
13. **给人看的那一行(`human_headline`)是独立的事实来源,会和数据对不上。**
    08-04 那轮三条谎话全出在这里。加或改这一行,**必须同时加断言**:
    `mcp::tests::headlines_never_pass_a_filtered_count_off_as_the_total`。
14. 🆕 **拦写入的检查,必须连"不该拦的"一起测。**
    裸 id 硬拒绝那条最大的风险不是漏拦,是**误伤** —— 一个 21 位的正常英文词被拒,
    AI 就再也写不进正常内容。测试里 `internationalization` / `counterrevolutionaries`
    那两条断言是防线,别删。

