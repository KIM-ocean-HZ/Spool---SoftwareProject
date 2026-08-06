# 交接文档 — 2026-08-07(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。

---

## 0. 一句话状态

**第一梯队(`DESIGN_WORKBENCH.md` §9 的右侧栏重构)全部落地:R1–R5 + W3-c + W4。
隔离验证过、真机跑过一次流式运行、本机残留 Spool 已清理。
✅ **已换装**(2026-08-07,Ocean 明示)。**

基线:`npx tsc --noEmit` 干净 / `npx vitest run` **217**(原 210)/ `cargo test` **44**(原 39)。

### 0.1 ✅ 已换装(Ocean 明示)

走的 memory `isolated-verify-workflow` §21:
`VACUUM INTO` 备份真库 → **核签名身份**(装着的是 `Spool Dev` 自签,所以直接用默认构建)
→ 核 identifier + `codesign --verify --deep --strict` → 按 pid 停 GUI 进程
→ 旧版 `mv` 到 `~/Desktop/Spool-旧版备份-2026-08-06T21-22-07/`(**没删**)
→ `ditto` 新版进 `/Applications` → `open --stdout/--stderr` 抓日志 → 行数逐项核对 → MCP 烟雾测试。

结果:
- **schema 没动(v12→v12,不迁移)**,workspaces 1 / threads 3 / blocks 20 /
  attachments 0 / engine_runs 1 / proposals 0 **逐项一致**,`engine_runs` 16 列还在
- ✅ **`[double-tap] installed at HID/active`** —— **输入监听/辅助功能授权活下来了**。
  这就是「必须先看装着的那版是什么签名身份、再用同一个身份构建」的全部意义(memory §21 ②)
- MCP:**14 个工具**,`list_threads` 正常返回
- ⚠️ **这次没杀 `spool --mcp` 子进程**,schema 没变所以旧进程照样能用 ——
  **Ocean 不需要重开 MCP 客户端**(上一次换装升了 schema 才必须重开)

⚠️ **主窗没截到图**:Spool 是托盘应用,启动后主窗**不跳前**(memory §24),
所以换装后拿不到窗口 bounds。**但前端产物跟隔离验证那次是同一份**,
那次按 pid 截过图、**没白屏**(§6.2-bis)。要眼见为实只能 Ocean 自己点托盘图标。

### 0.2 ⏸ 等 Ocean 的一件

**右侧栏默认还是收起的**(`railCollapsed` 默认 true)。入口是主窗右上角那个 ⊳。
要改成默认展开是 `settingsStore.ts` 一行 —— 等他说。

### 0.3 ⚠️ 08-07 这台机器死机过一次(原因没查出来)

Ocean 报的,发生在隔离验证跑到一半的时候。**没有 kernel panic 日志,也没有 Spool 的崩溃报告**
—— 说明是硬挂起后强制重启,没留下痕迹,**所以我不能说是什么造成的**。

能说的只有当时机器上的一件事实:**同时跑着两个 Spool**(装着的正式版 + 隔离验证版),
**两个都往输入事件流里装了双击 ⌥ 的 tap**。memory `double-tap-exclusivity` 记着这一层
**会主动删事件**,两个实例在那里抢是**说得通的一条嫌疑**,但没有证据,别当结论写。

**下一窗的操作纪律**:隔离验证跑完**当场按 pid 杀干净**,别让它跟正式版长时间并存
(§6.2-bis 第 7 步本来就写着,这次是拖了)。

---

## 1. 这一窗做完的(逐条对应 §9)

全部细节在 `DESIGN_WORKBENCH.md` **§9.9 / §9.10 / §9.11**,这里只写下一窗必须知道的。

| # | 结果 | 一句话 |
|---|---|---|
| **R1** | ✅ | 右侧栏 320→**250**、下限 260→**190**,现在比左侧栏窄;中间区下限 360→**420** |
| **R2** | ✅ | `AiActivity.tsx` **删了**,并进右侧栏。⚠️「待你过目 N 条」仍常驻 |
| **R3** | ✅ | ⋯ 菜单**整个删了**,主视图正好三个按钮:打包 / 捕捉到此 / 完成项目 |
| **R4** | ✅ | 右侧栏拆成 4 个组件;顺序是「流式进度占主体、控制项折叠在最后」。⚠️ **项目管理区第一版做错了,当天返工** —— 见 §1.3 |
| **R5** | ✅ | 设置页多了独立的「AI 引擎」一项 |
| **W3-c** | ✅ 只有 claude | **codex 是测不出来,不是没做** —— 见 §2.2 |
| **W4** | ✅ | 边跑边读 + 打字效果;**解析不了会回退**,不让一次运行整个失败 |

### 1.1 ⚠️⚠️ 项目管理区返工了一次 —— 下一窗别照第一版的思路做

**我第一版把它做成了右侧栏顶部一格、默认折叠。Ocean 当天推翻:**
> 「而不是在右侧边栏中和每个项目共用,**这会有歧义**,且**没有占据位置,用户并不会使用**」

**✅ 现在的形状(他给的,已落地)——「项目管理」是一个左侧栏置顶的「总项目」:**

```
左侧栏(置顶,长得和普通项目一样)   中间(它的「工作区」)        右侧栏(和普通项目不一样!)
┌──────────────────┐          ┌────────────────────┐   ┌──────────────┐
│ ⊞ 项目管理  2个快到期│  ──点─→  │ 项目矩阵            │   │ 周回顾        │
│ 最近               │          │ ┌────┐┌────┐┌────┐│   │ 自动维护 [开关]│
│  未分类            │          │ │卡片││卡片││卡片││   └──────────────┘
│  ⋯                │          │ └────┘└────┘└────┘│
└──────────────────┘          └────────────────────┘
```

- **卡片上有**:完成情况(状态点 + 块数)、DDL(快到期/逾期变色)、**摘要**、**完成项目**按钮
- **点卡片 = 跳转到那个项目**（⚠️ 这**推翻**了 §9.4 原来「不许当第二个导航」那条)
- **没有「总结项目」** —— Ocean 原话「总结项目去掉,没有用」
- **排序**:DDL / 创建时间

⚠️ **最要紧的一条:右侧栏从此只讲「左边开着的是谁」。**
开着普通项目 → 三个维护按钮 + 它自己的流式进度 + 它自己的待过目;
开着项目管理 → 周回顾 + 自动维护总开关。**同一个面板不再同时讲两个范围** —— 这就是他说的「歧义」。

全稿在 `DESIGN_WORKBENCH.md` **§9.12**,动这块之前必须读。

⚠️ 两个实现上的坑,都写在 §9.12 里:`boardOpen` 为什么是 flag 不是假 activeId;
`dueInDays` 为什么必须比日历天(直接减毫秒会让「今天到期」永远显示成「还有 1 天」)。

### 1.2 ⚠️ 两个「以后再加入口就用这个」的字段

- `engineStore.briefOpen` —— 跟进目标编辑器(上一窗立的)
- `threadsStore.completingId` —— **完成项目面板(这一窗新立的)**。
  项目管理区能完成**不在屏幕上**的项目,所以它从 `ThreadView` 的局部 state 挪到 `App` 挂一次。

**两边都是同一个教训:两个入口各自 `useState` 就会叠两层模态。**

### 1.3 ⚠️ 顺手补的一整块:右侧栏的英文一直是缺的

上一窗做的右侧栏**一个字都没进 i18n 字典**。而**英文是默认语言**
(memory `ui-language-follows-system`),所以默认用户看到的是一片中文。
这一窗把整块补齐了(约 60 条)。

⚠️ **下次加 UI 记得跑一遍这个检查**,它比肉眼可靠:

```
node -e "
const fs=require('fs'),path=require('path');const files=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const st=fs.statSync(p);
if(st.isDirectory())walk(p);else if(/\.(tsx?|ts)\$/.test(f)&&!/\.test\./.test(f))files.push(p);}})('src');
const en=fs.readFileSync('src/lib/i18n/index.ts','utf8');const keys=new Set();
for(const f of files){const s=fs.readFileSync(f,'utf8');
for(const m of s.matchAll(/\bt\(\s*'((?:[^'\\\\]|\\\\.)*)'/g)) keys.add(m[1]+'\t'+f);}
console.log([...keys].filter(x=>/[一-鿿]/.test(x.split('\t')[0])&&!en.includes(\"'\"+x.split('\t')[0]+\"'\")).join('\n')||'(none)');"
```

---

## 2. 这一窗问出来的真机事实(都花过钱,别再重复探)

三次真跑,一共约 **$0.07**(全用 haiku)。

### 2.1 ✅ claude 信封的花费字段 —— **确认了,上一窗那个悬案关掉**

上一窗写着「嵌套没真机核对过」。核了,**当初猜的形状全对**:
`total_cost_usd` 在顶层、三个输入计数在 `usage` 下、`modelUsage` 用模型 id 当 key
(实测拿到 `claude-haiku-4-5-20251001`)。解析仍然保持容错 —— 字段是 CLI 的,改名只能让
卡片显示「花费未知」,不许把一次成功的运行变成失败。

### 2.2 ⚠️ codex 的模型/effort:**给不了,而且这是测量结果**

两条,任何一条单独都够:

1. 它的模型是**服务端下发的目录**(二进制里是 `model_catalog_json` /
   `supportedReasoningEfforts` / `defaultReasoningEffort`),不是编译进去的常量;
2. **它不在本地校验 `-c` 的值** —— `model_reasoning_effort="bogus-effort"` 照单全收,
   还在开跑横幅上原样打印出来。

**合起来:猜一个名字不会当场报错,会等用户等完一次运行之后在 API 那头失败。**
所以宁可不给选。补它需要**一次能跑完的 codex 运行**,额度 **9/4** 才回来。

### 2.3 ✅ claude 流式的确切形状(W4 的全部依据)

- `--output-format stream-json` 在 `--print` 下**必须配 `--verbose`**,否则直接拒绝启动
- 行类型:`system`(init)/ `stream_event` / `assistant` / `user` / `result`
- 打字来自 `stream_event` → `event.content_block_delta` → `delta.text_delta.text`
- 工具调用来自 `stream_event` → `event.content_block_start` → `content_block.tool_use.name`
- ⭐ **最后那行 `result` 跟 `--output-format json` 的整个输出一模一样** ——
  所以答案还是用**原来那个验证过的解析器**读,新增的只是它前面那些行

### 2.4 ⚠️ 补上的一个洞:claude 一直在加载用户自己的 MCP 服务器

探流式时看见的:`system/init` 行里列着**另一个库**的工具 —— 传了 `--mcp-config`,
但没传 `--strict-mcp-config`,用户 `~/.claude` 里的服务器**全跟着进来**。

**不是安全洞**(白名单照样拒),**是钱**:每次运行都把一堆用不上的工具定义塞进上下文。
补完之后真机核过:init 行里只剩 Spool 自己的 14 个工具,`permission_denials: []`。

---

## 3. 下一窗要做的

⚠️ **主线:`DESIGN_CONTEXT_HYGIENE.md` 那一摊(上下文卫生)。**
Ocean 明示它排在右侧栏重构之后,现在右侧栏做完了,**轮到它了**。

### 第一梯队 —— 上下文卫生(`DESIGN_CONTEXT_HYGIENE.md`)

| # | 事情 | 状态 |
|---|---|---|
| **W7** | **批注当标题** | ✅ 已采纳,**这一摊的第一件**。理由见 `DESIGN_WORKBENCH.md` §7:**多数块没有批注**,所以「有批注的才当标题」,没批注的一个字不动。⚠️ 动块流要先读 §6.5 的 golden fixture 规矩 |
| **H2** | **取代关系**(schema **v13**) | 拍板过了,形状在 `DESIGN_CONTEXT_HYGIENE.md` §3.1.2。两处:`blocks.stale_at` + `ref_kind`(cites / supersedes / corrects)。⚠️ **只有用户能提,AI 不许**。⚠️ **「压缩」这个名字在等它** —— 见 `DESIGN_WORKBENCH.md` §9.8 |
| **H3** | **剪贴板 pack 极简化 + 表头重写** | 拍板过了。⚠️ golden 三侧 + 表头**任何 locale 下保持英文**。数字:golden fixture 那份 pack 4,329 字符,表头占 **2,616(60%)** |
| **H4** | **超预算时降级成目录**(而不是直接扔掉老块) | 未拍板细节,形状在 §3.3 |
| **H5** | **AI 一句话标签** | ⚠️ **排最后是有理由的** —— 做完 W7/H2/H4 很可能就不缺它了 |

⚠️ **一条跨条目的工程提醒**:W7 / H2 / H3 / H4 **全都动 pack 或块流渲染**,
而那是 golden 锁步的(硬规则 5)。**能合并成一次 fixture 重生就合并** ——
分四次重生是四倍的机会把时间戳漂 7 小时(§6.5)。

### 其余(顺序不变)

| # | 事情 | 状态 |
|---|---|---|
| **C** | **v0.4.0 收口** | ⏸ Ocean 明示往后推。右侧栏这一摊现在做完了,**可以问他要不要收口了** |
| **E3** | **第三个引擎档(Gemini CLI)** | ✅ 可开工。Ocean 明确点名了 gemini。照 §7.2 的规矩,`DESIGN_AI_ENGINE.md` §7.3 那张表要长出第三列。⚠️ **顺带**:`EngineBar.tsx` 的模型选择器现在是 `status.selected === 'claude'` 才显示,加引擎时要一起想 |
| **V2** | **codex 那条路的最后一格** | ⚠️ 等额度(**9/4 恢复**)。**一次跑通能同时解决三件**:codex 的花费字段、codex 的模型目录、codex 的流式事件名(§2.2 / §2.3) |
| **M3** | Follow up 的去重静默 | ✅ 可开工(`DESIGN_FOLLOW_UP` §4 M3) |
| ~~R1–R5 / W3-c / W4~~ | ~~右侧栏重构~~ | ✅ **已落地**(本窗) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | **写入开关能否默认打开** | 等待审面跑过一段真实使用 |
| F | **截图 + 演示脚本整体重建** | Ocean 已批:排在 app 代码全部做完之后,和录演示视频一起做。⚠️ **右侧栏刚整个换了样子,旧图更旧了** |
| G | **Hero 内嵌 15 秒演示视频** | 视频没录之前这一屏保持现状 |
| H | **对外动作**(MCP 注册表挂号 / Show HN / Product Hunt) | 每一件都需 Ocean 单独明示 |

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ **已落地**(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ **已落地**(2026-08-06)
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**(这是这套东西真正的回报)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ **引擎位泛化成两个预设(claude / codex)也落地了**(2026-08-06)。
   ⏸ **v0.4.0 收口被 Ocean 明示往后推**(08-06 晚),等右侧栏这一摊做完 ——
   **08-07:右侧栏做完了,可以问他。**
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路。⚠️ M2 的取消走 `setpgid` + `killpg`(Unix 专属),
   移植时这一段要重写。⚠️ `run_env()` 里的 `USER` 在 Windows 上是 `USERNAME`,别照抄。
   ⚠️ 引擎检测的候选路径表(`candidate_paths`)整个是 macOS/Unix 形状
   (`~/.nvm/…`、`/opt/homebrew/bin`),Windows 上要另写一份。
   ⚠️ **新增(08-07)**:`stream_with_timeout` 的两个读取线程本身是跨平台的,
   但**杀进程组那一段仍然是 Unix 专属**,跟 M2 的取消是同一处
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档,
   **所以搬到这里**):
   - ~~**AI 活动面**~~ —— ✅ **已落地**(M3)。VSCode 敢让插件干活,是因为 Source Control
     面板让你**看得见**它干了什么。⚠️ **08-06 晚:这条的正确形态是右侧栏**;
     **08-07:那个折叠区已经删掉并入右侧栏了(R2)**
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"。
     ⚠️ **就是第一梯队的 W7**,现在轮到它了
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   **M3 没新东西就静默** / M4 定时(**只在 M2/M3 被证明有用之后**)
9. ⚠️ **引擎档位问题** —— `DESIGN_AI_ENGINE.md` §7.7。
   实测证明 Codex 免费档不构成一条路(额度撞墙锁一个月),**引擎位今天仍然只服务
   有订阅的人**。补一个真的稳定免费的档:**08-06 晚 Ocean 点名了 Gemini CLI**,见 §3 的 E3
10. ⚠️ **工作台** —— 全稿 `DESIGN_WORKBENCH.md`。五阶段:
    ~~一 地基(schema v12 + 花费解析)~~ ✅ / ~~二 右侧栏~~ ✅ /
    ~~三 自动化 + 周回顾独立~~ ✅ / ~~四 流式进度~~ ✅(08-07)/
    ~~五 右侧栏重构(§9)~~ ✅(08-07)。**这一摊整个做完了。**
11. ⚠️ **上下文卫生** —— 全稿 `DESIGN_CONTEXT_HYGIENE.md`。
    治两个病:**上下文太长** 和 **信息过时**。含一轮前沿调研(2026-08 查,会过期)。
    五件:W7 批注当标题 → 取代关系(v13)→ pack 极简化 + 表头重写 →
    超预算目录降级 → AI 一句话标签。
    ⚠️ **08-07 起这是主线**(第 10 条做完了)。
    ⚠️ 调研里对 Spool 最要紧的一条:业界公认的四种记忆治理策略
    (年龄 / 新鲜度 / 显著性 / 取代),**Spool 已经有三种,缺的正好是治过时的那一种**;
    而「显著性」那一格 Spool 是全行业最强的形态(pin + 高亮 + 批注是用户亲手给的,
    别人要靠模型猜)

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. **块正文里的截止日期没人管** —— 库里躺着"截止时间是九天后",没有任何东西会提醒他。
   ⚠️ **08-07 走了半步**:右侧栏的项目管理区现在按 `threads.deadline` 排序、快到期会变色。
   **但块正文里那种日期还是没人管** —— 那要能从正文里认出日期,是另一件事
4. **重复块:用户想清但清不动** —— 缺的不是删除权限,是**从发现到动手之间的那一步**。
   → 归宿是 `DESIGN_CONTEXT_HYGIENE.md` §3.1 的取代关系(**第一梯队 H2**)
5. **摘要没有写作时间** —— `thread_health` 自己承认"Spool 不记录摘要写作时间"
6. **一件事被拆成两个项目**(机器学习课 / 机器学习课作业),用户得自己记得两边都看。
   **pack 按项目切,而用户的"一件事"跨了两个项目**

⚠️ **第 4、6 条跟 Follow up 直接相关** —— Follow up 是个进货口,而这两条是出口堵着。

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图,**而且右侧栏 08-07 整个换了样子,更旧了**。
  要求见 memory `next-stage-goals-website-portfolio`(**多场景铁律**:每张图要是一个真实使用场景)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 217 通过
cargo test --manifest-path src-tauri/Cargo.toml   # 44 通过
```

改任何 pack 渲染都要跑满这三条 —— 两侧渲染器有 golden 平价测试盯着。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。** 在仓库根目录直接跑会
`could not find Cargo.toml`。

⚠️ **新增(08-07)**:`engine.rs` 里有三个测试真的会 fork 子进程
(`a_run_is_read_line_by_line…` / `a_noisy_stderr…` / `a_run_can_be_cancelled…`)。
它们**共用一个 `STREAM_TESTS` 互斥锁**,因为 `RUNNING_PGID` 是**一个全局**
(生产上由 `run_action` 的「已有运行在跑」守卫保证只有一个)。
**再加会跑子进程的测试,记得也上这把锁**,否则它会偷走取消测试要杀的那个 pid。

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`。写全路径最省事
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
  (`…/com.oceanjin.spool.lab/data`)。指到父目录 → 读不到 `settings.json` →
  服务器报「MCP 服务未开启」,**看起来像开关没开,其实是路径错**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在 `/tmp` 的副本上做**,别往真实验室追加块
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧。要隔离 GUI 只能改 identifier(下条)

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏** ——
`ReviewPanel` 里一个 zustand selector 每次返回新数组,当 hook selector 用就无限重渲染
(React #185)。**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**
(`selectAllThreadsFlat(useThreadsStore.getState())`),**绝不能当 hook selector**。
组件要这张表就订阅 `threadsByWorkspace` 再 `useMemo` 摊平 ——
**`ProjectBoard.tsx` 就是这么写的,照抄它。**

✅ **08-07 照隔离流程看过了,新右侧栏没白屏。** 配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(本窗用 `com.oceanjin.spool.wb2`)
2. `npm run tauri build -- --bundles app`
3. 预置 `~/Library/Application Support/<新id>/settings.json`
   (本窗写的 `{"mcpEnabled":true,"mcpWriteEnabled":true,"railCollapsed":false,"language":"zh"}`)
4. `open -n <app> --stdout /tmp/x.out --stderr /tmp/x.err` 起来抓日志
5. ⚠️ **按 pid 取窗口 bounds,别按名字** —— 用 `CGWindowListCopyWindowInfo` 写十几行 C。
   **正式版和验证版窗口会重叠**(实测:正式版 32,59 / 验证版 350,120),
   按名字取会拍到正式版,然后你会以为改动没生效
6. `screencapture -x -R"x,y,w,h"`
7. ⚠️⚠️ **收尾要当场做,别拖**:按 pid 杀进程(**绝不用模糊 `pkill -f spool`,正式版一直在跑**)、
   删数据目录、复位 identifier。**08-07 拖了这一步,期间机器死机过一次(§0.2)。**

⚠️ **合成鼠标点击驱动不了这个 webview**(08-06 实测)。
`CGEventPost` 的 mouseMoved **能**让按钮进 hover 态,但紧跟的 down/up
**不触发 React 的 onClick**。**要眼见为实,只能让 Ocean 自己点。**

⚠️ **所以「按钮点下去会怎样」这一层永远验不到。** 本窗的对策:凡是跨语言/跨进程的契约
**都用测试钉住**(`progress_crosses_to_js_as_a_tagged_object` 钉 Rust→JS 的事件形状,
`engine_kind_round_trips_through_the_wire_name` 钉引擎名)。**照这个办法办。**

### 6.2-ter ⚠️ 子进程的活,必须真跑一次

08-06 上午修的那个 bug:参数拼装测过、进程组杀伤测过、纯函数测过,**结果三个动作全是坏的**,
因为没人真跑过一次带登录的运行(env 里缺 `USER`)。

✅ **08-07 照做了**:把 Spool 拼出来的 argv **一字不差**地在终端上跑了一次
(haiku + 隔离库),验到了 §2.1 / §2.3 / §2.4 三件。**这招值得固定下来** ——
不用点按钮,不用等 UI,直接验最容易坏的那一层。

⚠️ **仍然没真跑过的**:codex 的一切(额度 9/4)。

### 6.2-quater ⚠️ 探子进程可以不花模型额度

- **`--strict-config`(codex)**:把「要试的配置键」和「一个肯定不存在的键」一起传,
  报错只提假键 = 要试的键是真的。
  ⚠️ **08-07 发现这招有边界**:它验的是**键**,**不验值** ——
  `model_reasoning_effort="bogus-effort"` 照样通过。
- **拿包装脚本当探针**:把 MCP 服务器的 command 指向一个「记 argv/env 再 exec 真二进制」的
  sh 脚本。哪怕这次跑因为额度失败,**脚本也已经写下了日志**。
- **翻二进制里的字符串**:`strings <codex 二进制> | grep -oE 'gpt-5[a-z0-9.-]*'` 能翻出模型名,
  **但 08-07 也是这招证明了不该用它们** —— 旁边就是 `model_catalog_json`
  和 `supportedReasoningEfforts`,说明真名单是**服务端下发的**,二进制里那些只是残留。
  **能证明「这个词在里面」,不能证明「它现在还有效」。**
- **`--help` 是一手资料**:claude 的模型别名(opus / sonnet / haiku)就是它自己写的,
  这比翻字符串强,因为是这个版本自己声明的。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`。** 在仓库根目录跑会因为找不到
   `Cargo.toml` **静默失败**,探针照跑,结果长得像「修复没生效」。
   **看到 `Finished` 那一行再往下走。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
   数不对就是在测旧进程,停下来重开客户端
3. ✅ **三个 seed 脚本现在都从 `client.ts` 读 schema 版本了** —— 升 schema 不用再手改脚本。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**,否则它打印
   「Reading additional input from stdin...」然后挂着等。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **`mcp.rs` 有个测试会读 `client.ts` 的源码比对两边**,漂了会红,不用担心漏。
   **本窗没动 schema,还是 v12。**

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 —— 这些是**给模型读的契约,任何 locale 下都保持英文**
(见 `mcp.rs` 文件头 §两个受众)。

⚠️ **08-07 的教训:这条规则没有任何自动检查,所以整个右侧栏漏了一窗都没人发现。**
§1.2 那段脚本贴着,**每次加 UI 跑一遍**。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。** fixture 的期望文件是在 UTC+1 下生成的,
直接在本机(UTC+8)重生会让**每个时间戳整体漂 7 小时**。
日期归一化让测试两种情况都过,所以**测试不会拦住你**。

### 6.6 提交与推送

**08-07 这一窗:代码 + 文档已提交,工作区干净。**

- ⚠️ **推送要单独问 Ocean。** 之前的「推送」明示不是长期授权。
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**
- ⚠️ **`git add -A` 会把 Ocean 在 IDE 里的顺手改动一起带走。** 提交前扫一眼
  `git status --short`,不认识的改动先看 diff。

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

⚠️ **验证有效**:给他三个选择题、每个选项都写清「代价是什么/好处是什么」,
他三题都秒选了推荐项。**别只列选项名。**
