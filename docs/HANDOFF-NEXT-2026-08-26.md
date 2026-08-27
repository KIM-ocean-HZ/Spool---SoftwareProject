# 交接 —— 2026-08-26（下一件：**渠道**）

> **这一份取代 `archive/HANDOFF-NEXT-2026-08-24.md`。** 那一份 975 行、十六节，装的是
> `S` / `V` / `Q` / `W` / `X` 五批的施工记录 —— **全部做完、全部验过**，所以它整份归档，
> ⛔ 别再照着它开工。要翻某一批当时为什么那么做，去 `docs/archive/` 里找它。
>
> 换一份的理由是 Ocean 自己定的规矩（`WORKPLAN` §0）：
> 「不允许任务无限堆积在一个文件夹，这会导致上下文过长，执行不准确」。

---

## 1. 现在是什么状态

**代码**：`main` 干净，`c57b41c` 之后**四个提交没推**：

| 提交 | 什么 |
|---|---|
| `3e6b8a5` | `W 批` —— 周回顾选得了模型、按周分组 |
| `487d3b5` | 文档：`W 批`去处 + §14.5 自查结论 |
| `5894dbc` | `X 批` —— API 余额看得见了 |
| `c57b41c` | 文档：`X 批`去处 + 换装回执 |

**装机**：`/Applications/Spool.app` 是 `5894dbc` 那一版（2026-08-26 11:47 换的）。
签名 `Developer ID Application: Hanze JIN`，`spctl` 报 `Unnotarized Developer ID`
= 本机 dev build（记忆 `isolated-verify-workflow` §33）。

**库**：v28，54 条脉络 / 335 块 / 22 个工作区。⛔ 换装前后一条没少。

**验收**：✅ **Ocean 08-26 逐条走完，原话「验收都走过了，没问题」。**
`Q` / `W` / `X` 三批到此收口。

**测试**：TS 704 / Rust 139 全绿，`npm run build` 通过。

⚠️ 桌面上留着两份备份（`spool-snapshot-20260826-114634-pre-wx.db` /
`Spool-old-20260826-114634-pre-wx.app`），确认没事了可以删。

---

## 1-bis. 2026-08-27 插进来的三件（Ocean 口头点的，已做完并验过）

⚠️ **这三件不改执行顺序，下一件仍然是渠道 R1。** 它们是 Ocean 08-27 直接点的界面问题，
和渠道无关，也没有动 `docs/EXECUTION_POLICY.md`。

| # | 事 | 一句话 |
|---|---|---|
| 1 | 正文字号三档 | 设置 → 通用 → 正文字号：小 / 中 / 大。**只**改块里的正文和批注，别处不动。默认「中」= 已发布版本的字号 |
| 2 | 查找对齐别的软件 | 窗口在最前面时 **⌘F** 就是查找；划了词再按，搜索框里已经是那个词；查找条不再点一下外面就消失（只有 ✕ / Esc 关得掉）；「所有匹配」那张列表不再被正文压在底下 |
| 3 | 右侧刻度兼作命中图 | 查找开着时，本项目里对上的块，刻度变橙加长；悬浮看**对上的那一行**；点一下跳过去 |

⛔ **有一句没照字面做**：「查找快捷键默认为 cmd F」做成了「**窗口里的** ⌘F」，系统级那个
仍是 ⌘⇧F。系统级的 ⌘F 会把这个键从每一个别的软件手里抢走（撞记忆
`spool-must-not-cost-other-tools`）。要真换，是一句话的事，但代价要 Ocean 点头。
理由全稿在 `docs/FIND-UX-2026-08-27.md` §2。

顺手修了一个旧毛病：全局搜索面板里**按 ↵** 跳转，查找条的框是空的（点结果那条路一直没事）。

**去处 / 改了哪些文件 / 怎么验：`docs/FIND-UX-2026-08-27.md`。**

状态：TS 测试 **712** 全绿（新增 8 个），`npm run build` 通过，隔离构建实机截图逐条核过。
**已换装**（2026-08-27 11:31，`/Applications/Spool.app`）—— 授权没掉、真库正文与批注总字节
前后完全相同，回执在 `FIND-UX-2026-08-27.md` §6。旧的挪到
`Spool.app.pre-finduX-20260827-113057`。

---

## 2. ⛔ 下一件就是**渠道**，别再往前面插东西

`WORKPLAN-2026-08-22.md` §1 的现序：
`A` → `D` → `T` → `B 发版` ✅ → `S` ✅ → `V` ✅ → `Q` ✅ → `W` ✅ → `X` ✅ → **`渠道`** → `E` → `F`。

⚠️ **渠道已经被往后推过五次**（`T` 一次、`S` 一次、`Q` 一次、`W`+`X` 一次，加上
最早那次发版）。每一次都有正当理由，每一次也都是真的推了。

### 2.1 这一批只有两条，而且第二条不能先做

| 序 | 渠道 | 说明 |
|---|---|---|
| **R1** | **官方 MCP Registry**（`mcp-publisher` CLI 提交） | 最便宜的一条 —— 受众**不需要被说服「上下文丢失」这个问题存在**，他们已经在装 MCP server 了 |
| **R2** | ⛔ **Show HN** | **一次性机会，放最后。** ⛔ 前面全部做完再开 |

⚠️ **这一批是被知情削薄的，⛔ 不是漏排**：四带格式发成 skill（`F1`）跟着 `E2` 走，
所以 Show HN 之前**只剩 MCP Registry 一条**。想让它厚起来，唯一的杠杆是把 `E2` 往前挪。

### 2.2 ⛔ 开工前必须先核的一件（**这一件可能整个挡住 R1**）

**Spool 的 MCP server 是装在 `.dmg` 里的一个桌面 app 的子命令（`spool --mcp`），
⛔ 不是 npm / pypi / docker 包。** 而官方 MCP Registry 的条目要指向一个**包**或者
一个**远端 URL**。

⇒ **先去看 registry 今天接受哪几种 package type，Spool 这个形态对不对得上。**
⛔ **别先写 `server.json`**：形态对不上的话，写出来的东西一行都用不上。

三种可能的结局，先想清楚哪种可接受：
- **甲**：registry 收「本地二进制 / 自托管安装」这一类 → 直接提交。
- **乙**：只收包 → 得**额外**发一个 npm 包当安装器（`npx` 拉 dmg？装 app？）。
  ⚠️ 那是一件新工程，⛔ 不是填个表，要先问 Ocean 值不值得。
- **丙**：只收远端 HTTPS MCP server → ⛔ **撞产品红线**（记忆
  `chatgpt-cloud-cannot-reach-local-mcp`：把 Spool 架到公网就不是 Spool 了）。⇒ R1 作废，
  这一批只剩 Show HN，要回去重排。

### 2.3 对外引用数字之前，重数一次（我 08-26 数过了）

⛔ **`WORKPLAN` 里「20 个工具 + 7 个 prompt」那句已经旧了。**
拿装机那一版的二进制探过（`SPOOL_DATA_DIR` 指临时库，⛔ 不碰真库）：

```
tools   = 22
prompts = 7   compress_pack, weekly_review, thread_health, distill,
              triage_conversation, file_this, catch_up
```

⚠️ **每次对外说这个数之前都要重数一遍** —— `Q 批` 刚加过 `set_block_gist`，
一批新工具就是一个新数字。探法：

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 '{"jsonrpc":"2.0","id":3,"method":"prompts/list"}' \
 | SPOOL_DATA_DIR=/tmp/probe-lib /Applications/Spool.app/Contents/MacOS/spool --mcp 2>/dev/null
```

### 2.4 ⛔ 渠道这一批的红线（都在记忆里，这里只点名）

- ⛔ **95/5 那个数字一个字都不许出现**（`stat-95-5-is-void`）。
- ⛔ **MemTrapBench 那篇论文的百分数一个都不许放进讲 Spool 的句子里**（`memtrapbench-paper`）。
- ⛔ **下载量那 32 次全是 Ocean 自测，真实外部用户 = 0**（`spool-download-metrics`）——
  ⛔ 别拿 32 去算任何比例。
- ⚠️ **宣发目前是暂停状态**（`mockups-vs-installing`）：08-20 第一批物料被整批否掉。
  「效果图解禁」只对**宣传物料**那一格有效，且**海报后面必须跟真截图**。
  ⇒ R1 只是一个 registry 条目，不算宣发；R2 是宣发，⛔ 开它之前先问。
- ⚠️ **收费前仓库要转私有，但时机是死的**：渠道 → 付费功能 → 挪走公开文档 → 才转
  （`paid-licensing-mechanics`）。⇒ **R1 在转私有之前，顺序是对的。**
- ⛔ **绝不加 LICENSE**（`no-license-file`，问过三次都是否）。

---

## 3. 还挂着没做的（⛔ 都不挡渠道，但别忘）

### 3.1 发版留下的两条尾巴

| # | 是什么 | 怎么做 |
|---|---|---|
| ① | **`.app` 那次的 submission id 没截住** —— 台账 `CASE_STUDY_LEDGER` §1.2 那一格现在是标记不是数字 | `xcrun notarytool history`，Apple 还留着就能捞。⚠️ 捞到直接填，⛔ 别编 |
| ② | **`RELEASE.md` §3 验收单没走完** —— 「全新机器装 dmg 首启建库」「双击 ⌥ 授权」几条 | ⛔ 只有真手指做得了。已经发出去了 ⇒ 这是**发后复核**，撞到问题就是 0.6.3 |

### 3.2 第六轮实测挖出来、仍然没修的三条

| # | 是什么 | 证据 |
|---|---|---|
| ① | **`split_cuts` 之后没人看一眼正文空不空** —— 撞到一次 `ok=true` 配 **0 字节**压缩稿 | `worthRetrying` 接住了，**但信封是假的** |
| ② | **失败信封不带用量** —— `Envelope::Err` 只有 `ok`/`kind`/`message`/`status`。「已经跑出去的那一段照样算钱」那句护栏**至今拿不到证据** | 那一夜 8 次失败全记 ¥0 ⇒ ¥2.92 是**下限** |
| ③ | **实测台重编一次就要重新授权一次**，而授权框**锁屏状态下弹不出来** | 那一夜因此丢了八小时 |

①② 各是一处判断 / 一个结构体加字段。③ 的做法在记忆 `isolated-verify-workflow` 末尾那一节。

⭐ **`X 批`把 ② 往前推了半步**：`BalanceOutcome` 是照着「失败也要说清是哪一种」那条
纪律新写的，形状可以照抄；但 `Envelope::Err` 本身还是没有 usage。

### 3.3 一个一直没问 Ocean 的（不挡任何事）

**批注要不要能「更正」？** 现在**不能** —— 划在批注上的选区只出「标为重点」。
理由是数据模型：一条更正存 `corrected_quote`，而 pack / `check_quote_occurs` /
`correctedSpans` 三处都拿它去**正文**里找。存批注里的句子 = 一条谁也定位不到的更正。
⇒ 真要做是**另一件事**（得先决定「批注上的更正卡画在哪儿」），
⛔ 不是在 `startCorrection` 里加一行。

### 3.4 ⚠️ `/Applications` 底下堆着八个旧 bundle，266 MB

`Spool.app.previous-*`（08-11 / 08-12 六个）、`Spool.app.pre-v062-*`（08-24 一个）。
⛔ **不是我这一窗留下的**，也⛔ 没删 —— 换装规程说「挪开别直接删」，但没人回头清过。
⇒ 问一句就能全清掉。⚠️ 清之前 `lsof +D` 看一眼有没有进程还执行着里面的 inode
（记忆 §34：换装不打断跑着的 `--mcp` 子进程）。

---

## 4. 这一窗留下的、下一窗会用到的三条经验

1. ⭐ **验一个厂商 API 的地址存不存在，不用碰用户的真 key** —— 拿一个明显是假的 key 去打，
   401/403 = 地址存在，404/405 = 这家没有。⚠️ 反过来不成立（有的网关认证在路由之前）。
   全稿进了记忆 `isolated-verify-workflow` §37。
2. ⭐ **交接文档里写的「根子」要自己去代码里核一遍。** 这一窗 §14.2 ① 那条就是错的
   （说模型选择器的闸是 `showModels`，实际是 `models.length > 0`）——
   照着修会修错地方。
3. ⭐ **「只认成功」的判据 + 定时循环 = 失败时无限重试。** `weeklyReviewDue` 只认
   `outcome='ok'`，所以一次失败之后它一直是 true。CLI 那边只是白转，**API 那边是每十分钟
   烧一次钱**。⇒ 以后凡是「到点了就自动花钱」的东西，都要问一句「失败之后它多久再试一次」。

---

## 5. ⭐ 下一窗开工提示词（照抄）

```
读 docs/HANDOFF-NEXT-2026-08-26.md（整份，不长），以及 docs/WORKPLAN-2026-08-22.md
的「渠道」那一节。

现状一句话：Q / W / X 三批全部做完、换装、并且 Ocean 逐条验过没问题
（四个提交没推：3e6b8a5 / 487d3b5 / 5894dbc / c57b41c）。
⛔ 别回头动那三批。

这一窗做渠道 R1（官方 MCP Registry），按这个顺序：

一、⛔ 先核一件可能整个挡住 R1 的事（§2.2），别先写 server.json：
    Spool 的 MCP server 是桌面 app 的一个子命令（spool --mcp），装在 .dmg 里，
    ⛔ 不是 npm / pypi / docker 包。去看 registry 今天接受哪几种 package type。
    - 收「本地二进制/自托管」→ 直接提交。
    - 只收包 → 得额外发一个安装器包，⚠️ 那是新工程，先问 Ocean 值不值得。
    - 只收远端 HTTPS server → ⛔ 撞产品红线（记忆 chatgpt-cloud-cannot-reach-local-mcp），
      R1 作废，回去重排。

二、形态对得上再动手写条目。⛔ 对外写任何数字之前，用 §2.3 那段命令重数一次
    工具和 prompt（08-26 数是 22 / 7，⛔ WORKPLAN 里「20 个」那句已经旧了）。

三、⛔ R2（Show HN）这一窗不碰 —— 一次性机会，放最后。

红线（§2.4，都在记忆里）：⛔ 95/5 那个数字作废；⛔ MemTrapBench 的百分数不许进
讲 Spool 的句子；⛔ 下载量那 32 次全是自测、真实外部用户 = 0，别拿它算比例；
⚠️ 宣发暂停中，R2 属于宣发，开它之前先问；⛔ 绝不加 LICENSE；
⛔ 不做悬浮窗；⛔ 浏览位置不许按 scrollTop 存；⛔ 用户不能看到测试环境的 Spool；
⛔ 提交不许带任何署名（CLAUDE.md §5，自查 grep 会误报，见记忆
attribution-grep-false-positive）；⛔ 换装必须带 APPLE_SIGNING_IDENTITY
（记忆 isolated-verify-workflow §6-bis）。

⚠️ 顺手可以问 Ocean 的两件（都不挡渠道）：§3.4 那八个旧 bundle（266 MB）要不要清；
§3.1 那两条发版尾巴什么时候补。
```
