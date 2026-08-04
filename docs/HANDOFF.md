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

**MCP 三个新 prompt 已实现并提交;两份实机评审报告已分诊,下一窗照 §2.7 动手**
(2026-08-04 凌晨)。工作区干净,**没推 main**(没碰 `site/**`,推不推等 Ocean 说)。
基线全绿:`npx tsc -b` / `npx vitest run`(**160**)/ `cargo test`(**17**,+1)。
真库这一窗**一个字都没动**(MCP 实验室走 `SPOOL_DATA_DIR`,和真库物理隔离)。

这一窗做完的两件事:

1. **`weekly_review` / `thread_health` / `distill` 三个 MCP prompt**(§4 第 1 条)+
   实机自测的隔离实验室与评审提示词。详见 §2.5。
2. **中文页 alt / `<noscript>` 这条按 Ocean 的话销案**,不写了。详见 §2.3。
3. **两份实机评审报告(ChatGPT 5/10、Claude 6.5/10)逐条验过并分诊** —— 11 条真 bug、
   2 条假问题(已实测证伪)、1 条根子在我的种子数据、7 条要 Ocean 拍板。**详见 §2.7,
   下一窗的主线就是它**。分诊只做了分析,一行代码没改(Ocean 明示执行留给下一窗)。

上一窗的两件事(网页工程债 B `7fa8fe7` 已上线、`/Applications/Spool.app` 换成 main 构建)
仍然有效,细节在 §2.1–2.2 与 §3。

**👉 下一窗:直接开 §2.7 的 G 小节(动手顺序),第一批不需要任何拍板。**

---

## 1. 下一窗可以做的(按建议顺序)

### 1.1 现在就能做的

| # | 事情 | 在哪 |
|---|---|---|
| A | **长期计划清单里挑一条开工** —— 第 2 条 Claude Code 引擎位设计稿**已批复可开工**,是唯一一条不需要再拍板的 | §4 表格 |
| B | 🚩 **按实机评审报告修** —— 两份报告已到并分诊完毕(哪些是真 bug、哪两条是假问题、哪些要 Ocean 拍板、动手顺序)。**下一窗的主线** | §2.7 |

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

**第一轮实机反馈已经收到一条(2026-08-03 深夜,评审 AI 连都没连上就报了出来)**:
**服务器不会自证身份。** 真库那台和实验室那台的工具描述一模一样,唯一的区别是
**服务器注册名 —— 而那个名字是客户端配置里定的,不是 Spool 自己说的**。
AI 的原话:「如果今天你换个措辞说'测试环境叫 spool',我就会照着做,连库都不会怀疑。」
写入只能追加、没有删除接口,一旦接错,脏数据就永久留在真库里。已修:
- `library_identity()` —— `initialize` 的 instructions **第一行**就说明这台服务器读的是
  默认库(`com.oceanjin.spool`)还是 `SPOOL_DATA_DIR` 指定的自定义库。
  **这一步不读任何数据**,所以 AI 可以在碰库之前先验身份(评审 AI 拒绝调 `spool` 的
  `list_threads` 是对的 —— 原来的第 0 步要求它读数据才能验环境,是个死结)。
- `check_library` 头部也带同一行,给一条「调个只读工具就能核对」的路。
- 自定义目录只报最后两级路径(`…/com.oceanjin.spool.lab/data`),不漏 home 路径。

**实机自测的东西已经备好,等 Ocean 的报告**:
- `scripts/seed-mcp-lab.sh` —— 一键建隔离实验室
  (`~/Library/Application Support/com.oceanjin.spool.lab/`),
  **靠 `SPOOL_DATA_DIR` 隔离,不需要改 identifier 重建**(env 写在启动脚本里,
  客户端就算不支持 per-server env 也指不到真库);`--connect` / `--disconnect` 会把
  `spool_lab` 这条写进/删出**三个客户端**:Claude Desktop、**Claude Code
  (`~/.claude.json`,第一轮就是漏了它才卡住)**、`~/.codex/config.toml`(**先备份,
  绝不碰 `spool` 那条**;三个文件的 merge 都拿他真实配置的副本试过,可反复执行)。
  ⚠️ `~/.claude.json` 是 Claude Code 自己的状态文件,**它可能在退出时回写**——
  写进去之后要复查一眼 `spool_lab` 还在不在。
- `docs/MCP_LAB_PROMPT.md` —— 两份可整段复制的评审提示词(A:Claude Desktop + Claude Code;
  B:ChatGPT 桌面版)。
  不是普通使用流程,是**让 AI 主动找茬**:必跑清单、越界参数、一致性对账、缺什么功能、
  **它还想要什么权限**。第 0 步是**环境识别闸门**(本机同时装着真 Spool):
  必须先看服务器自报的 `LIBRARY:` 那一行(不读数据),再报出实验室标记
  `SPOOL-MCP-LAB-2026-08-03`,才准往下走。
  文末那张「埋了什么」的表是给 Ocean 自己对答案的,别喂给 AI。

### 2.7 🚩 实机评审两份报告的分诊(2026-08-04 凌晨,**下一窗按这个动手**)

ChatGPT 桌面版给 5/10、Claude Desktop(Cowork)给 6.5/10。两份都跑完了读与写,
**两份都没跑成 prompts**(见下 D-7)。逐条验过之后的分诊如下 —— **别照单全收,有两条是错的**。

#### A. 假问题(我实测证伪,不要动手修)

| 报告里的说法 | 实测 | 结论 |
|---|---|---|
| ChatGPT P1「check_library 承诺扫项目摘要,却漏掉〈租房〉摘要里的裸 id」 | 摘要扫描是好的;`sbKq9XmNp3Vr7YzC2zgT` **只有 20 位**,不符合 21 位 nanoid 形状 | **检测器没错,是我的种子数据造错了**(见 C) |
| Claude P0-4「find_similar 扫到 39 块 > check_library 的 37,疑似读到软删内容」 | 同一份库同一时刻实测:两边都是 **43**(库里 45 块,含 2 块在软删项目/工作区里,两边都正确排除了) | **时间差造成的错觉** —— 它们两次调用之间自己写了 2 块。软删过滤是好的 |

#### B. 确认为真、且在主路径上(不需要拍板,直接修)

| # | 问题 | 实测证据 | 根因 |
|---|---|---|---|
| B-1 | **get_pack 超预算不降级,而且建议你走一条同样走不通的路** | `max_chars=8000` → 只回 140 字的"超了";照它说的换 `range=pinned` → **同一句话**(11774 > 8000) | 骨架 4418 + 一个**置顶**块挂着 **7800 字的附件抽取正文** = 底线 11774。`budgeted_pack` 永不裁置顶,底线放不下就整个放弃 → 退回统计文案。**附件正文在 pack 里完全不受预算约束(单附件 8000 上限太松)** |
| B-2 | **`range=last7/last30` 把置顶块整个丢掉** | `range=last7` → `(no pinned blocks)`,目标句和作业截止日全没了 | `filter_blocks_for_range` 只按时间筛。而超预算裁剪里置顶是"永不删"的最高档——同一个概念两处相反 |
| B-3 | **range 模式下 pack 表头写「3 blocks total」** | 实测确认 | pack 是给用户粘给别的 AI 的,对面会以为这门课总共 3 条。⚠️ 改表头要动 `assemble.ts`+`templates.ts`+golden+`mcp.rs` 四处(硬规则 5) |
| B-4 | **`approx_pack_chars` 的"骨架另加约 3k"低估 47%** | 实测骨架 **4418**;Claude 正是照这个估了 8000 然后什么也没拿到 | 这个字段唯一用途就是估预算 |
| B-5 | **get_blocks 完全不暴露附件** | 返回字段只有 content/annotation/source/pinned/ref_* | 而 get_pack 超预算时恰恰建议"用 get_blocks 读全量" —— 照做会静默丢掉 7800 字的讲义正文 |
| B-6 | **search_blocks 的命中里没有 source** | 命中字段:snippet/annotation/thread_title/workspace/ids | 授权四类全靠 source 判定。搜完必须再调 get_blocks 才知道哪条是课程材料、哪条是 AI 写的 |
| B-7 | search_blocks 没有 offset | `total 23 / returned 20`,上限 50 之后拿不到 | 库大了就是硬墙 |
| B-8 | list_threads 不暴露摘要作者 | 只能"先写→被拒→再转告用户" | `summary_source` 在库里,没往外给 |
| B-9 | 数值参数静默改值 | `since_days=999`→90、`limit=-5`→1 条、`context=99`→24、小数→默认 | 两份报告独立提了同一条。建议:不报错,但回显 effective 值 |
| B-10 | create_thread 允许同工作区同名,零提示 | Claude 建的〈MCP 评审记录〉和 Codex 早先建的重名了,而且删不掉 | |
| B-11 | 文案小账 | digest 表头「共 11 条在库」其实是 11 **个项目**;instructions 说锚点是"truncated pointers"但短的会整条给全;空项目 get_pack 不带项目名;半角/全角混排 | |

#### C. 我自己欠的一笔:实验室种子数据是错的 —— **已修(2026-08-04)**

**「埋了什么」表里写的两处「裸 id 泄漏」,当时实际是 19 位和 20 位** —— 真 id 是 21 位。
检测器按规格工作,两份报告却都据此下了"检测器漏报"的结论(一份判 P1、一份判 P0)。

修完了:**播种的 62 个 id 全部补齐到 21 位**(原来块 id 19 位、项目/工作区 id 20 位,
整个实验室都在低测这条检测线),三处埋的泄漏改成真的 21 位形状,并且**故意分成两类**——
正文里那两条指向现存对象(报告写「→ 指向现存块/项目」),摘要里那条指向不存在的对象
(写「→ 未指向现存对象」),把 `resolve_fragment` 两条分支都覆盖上。
重跑验证:`check_library` 现在报 **3 处裸 id + 1 处悬空引用**,一处不漏。
提示词 C-5 里给测试者抄的那个示例 id 也跟着改了(原来写着"21 位"、给的却是 19 位的串)。

**教训(留给以后)**:埋坑的数据必须先自测能被抓到,否则测出来的是假问题、还会带偏评审。

#### D. 需要 Ocean 拍板的设计题(**别自作主张动手**)

| # | 题目 | 两边怎么说 | 我的建议 |
|---|---|---|---|
| D-1 | **add_block 检测到裸 id 之后,是警告后照写(现状),还是拒绝?** | ChatGPT 判 P0 要求硬拒;Claude 要求写前拦截或 `dry_run` | **改**。现状的理由是"警告可被忽略,审计要可重复",但**写只能追加、没有删除接口**,一次误写就是永久垃圾——两个评审员都撞上了,而且都改不掉。建议:默认拒绝 + 显式 `allow_raw_id=true` 逃生口 |
| D-2 | **裸 id 检测要不要从"恰好 21 位"放宽到长度区间** | Claude 主张 16–24 位 + 大小写数字混排 | **不轻易改**。放宽会在捕捉来的网页/代码/token 上大量误报,而 check_library 是"只读报告 + 处置留给用户"的东西,误报的代价是用户失去信任。可先做:拿库内真实 id 建索引做精确比对(纯本机),比放宽形状更准 |
| D-3 | **要不要给 AI 一个"撤回我刚写的那块"的接口** | ChatGPT 说与底线冲突、宁可不要;Claude 说限本会话+限自己署名则不冲突 | 倾向**不做**,改用 D-1 的写前拦截。append-only 是宪法级承诺,为了救一个可以在写前避免的错误去开洞不划算 |
| D-4 | **附件正文能不能被搜到** | 两份都提。实测:讲义里的句子 `total = 0` | **值得做,但这是这批唯一要动 schema 的**(FTS 表要加一列 → schema v9 + 迁移 + 双侧锁步常量)。单独一轮 |
| D-5 | **语义检索**("验证曲线的横轴该用什么"整句搜 0 命中) | Claude 列为缺失功能第 1 条 | **不做**。本地 embedding = 新依赖 + 模型体积;走云端 embedding 直接撞"零出网"。可先用便宜办法缓解:查询分词后多关键词 OR |
| D-6 | **`structuredContent`(MCP 2025-06-18)** | ChatGPT 判 P1「跨客户端很脆」 | 认同方向,但**排在 B 之后**。现在所有工具返回都是"文本里塞 JSON",客户端可能把原始 JSON 直接摊给用户看 |
| D-7 | 🚩 **prompts 这个面本身押不押得中** | **ChatGPT/Codex 不暴露 prompts;Claude Desktop(Cowork)也不暴露** —— 两个客户端 B 节全没跑成 | **最重要的一条**。设计稿说 prompts 是"零学习成本的功能发现面",但实测两个主力客户端根本不露出来(Claude Code 露,形式是 `/mcp__spool_lab__distill`)。建议:①先在 Claude Code 里把 B 节补测,验证代码本身;②认真考虑把三个 prompt **同时**做成只读工具(函数已经写好,多一个调用面约 40 行),这样在哪个客户端都能用,而且是模型按用户意图主动调,比让用户去翻斜杠菜单更符合"大白话说话"的产品叙事 |

#### E. 两份报告独立要到了长期计划里已有的东西(信号很强)

- 「只看我自己写的」切片 —— 正是 §4 第 4 条「我的思考凸显」。两个 AI 都说:回答"我卡在哪"
  的答案在用户自己敲的那几条里,而 `source_contains` **表达不了"source 为空"**。
- 「截止日期能主动冒出来」 —— 正是 §4 第 5 条首日价值里的日卡方向。
- 「查重之后告诉他哪条留着最合适」 —— find_similar 已经返回 pinned/has_annotation/length,
  差的只是一句判断。

#### F. 明确表扬、重构时别弄丢的

四条能让不懂技术的人自己解决问题的报错:workspace 传错时列出现有工作区、get_pack 传错 id
说"先用 list_threads"、find_similar 同传两个范围参数说"二选一"、set_thread_summary 拒绝覆盖
用户手写摘要那段(**两份报告都点名表扬了这一条**)。还有 append-only + 授权四类分级。

#### G. 下一窗的动手顺序(每批一个提交)

1. **第一批(不需拍板)**:~~C 的种子修复~~(已做)→ B-1(附件正文纳入预算 + 拒绝文案不再推荐刚失败的路)
   → B-2 → B-4/B-5/B-6/B-7/B-8/B-9/B-10/B-11。B-3 单独一个提交(要动四处 + 重生 golden)。
   验收:拿实验室重跑 A 组必跑清单,`max_chars=8000` 必须拿到部分 pack。
2. **第二批(拍板后)**:D-1 → D-7 的②。
3. **第三批(单独设计稿)**:D-4(schema v9)、E 的三条并进 §4 第 4/5 条。

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
- **MCP 实验室**:`scripts/seed-mcp-lab.sh`
  (`~/Library/Application Support/com.oceanjin.spool.lab/`,见 §2.5)。
  ⚠️ **别把它挪进桌面/文稿/下载** —— 那三个是 TCC 保护目录,Claude Desktop 没被授权时
  连启动脚本都 exec 不了(`Operation not permitted` + 一连上就断,2026-08-03 实测踩过)。
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
