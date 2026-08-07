# 交接文档 — 2026-08-10(给下一个窗口:**开工窗**)

> 先读 CLAUDE.md 与 memory(`isolated-verify-workflow`、`next-stage-goals-website-portfolio`、
> `write-plainly-for-ocean`、`no-license-file`、`spool-db-wipe-incident`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`、
> `double-tap-exclusivity`、`capture-note-first`、`email-collection-website-only`、
> `follow-up-decision`、`claude-code-effort-unavailable`、`chatgpt-mcp-forensics`)。
> 完成后删除本文件。
> ⚠️ **改写这份交接时,§4 的长期计划清单必须原样带上** —— 08-02 那次改写把 MCP 新增接口和
> Windows 版整段弄丢了,Ocean 08-03 才发现。
> ⚠️ **⭐ 失败与修复不要只写在这里。** 这份文件规定要删,而它是 case-study 最值钱的素材来源。
> **新出的每一条,顺手往 `CASE_STUDY_LEDGER.md` §3 追加一条** ——那份台账只增不改
> (规矩在 `DESIGN_CASE_STUDY` §6.3)。

---

## 0. 一句话状态 + ⭐ 下一窗直接从这里开工

**08-10 这一窗:v0.4.0 正式发布了(公证 + Release + 固定名资产,官网下载按钮实测 200)。
拍板第 7、8 条落地。Gemini CLI 引擎档(E3)做完了,含模型选择器装回来。
Gemini 免费档做了一轮高强度实测,结论是「能当入门档,不能当默认档」,全文
`DESIGN_AI_ENGINE` §7.8。没有阻塞项。**

### 0.0 ⭐⭐ 开工顺序

| 序 | 做什么 | 全稿 | 备注 |
|---|---|---|---|
| ~~1~~ | ~~正式发布 v0.4.0~~ | `RELEASE.md` §2/§3 | ✅ **08-10 发完**,见 §1 |
| ~~2~~ | ~~第三个引擎档 Gemini CLI(E3)~~ | `DESIGN_AI_ENGINE` §7.3/§7.8 | ✅ **08-10 落地**,见 §2 |
| **1** | **codex 最后一格(V2)** | — | 额度 ✅ 已恢复、UI ✅ 不用改。剩三件:**花费字段 / 模型目录 / 流式事件名**,一次真跑同时解决 |
| **2** | ⚠️ **Ocean 亲眼看一眼新 UI** | 本文件 §3 | **这一窗没能截到图**(原因在 §3),右侧栏和项目管理都换了样子 |

**以上之后的,顺序未定,都已拍板可开工:**

| 事情 | 全稿 |
|---|---|
| **项目文件库**(附件搬项目级 + **schema v15** + MCP 申请访问) | `DESIGN_PROJECT_FILES.md` —— 四件全拍完(§5),无待定项 |
| **块正文 MD 渲染 + 动作条减到 7 键** | `DESIGN_WORKBENCH.md` §10 |
| **分流「把整场对话分流进项目」(走选项 A)** | `DESIGN_CONTEXT_HYGIENE` §9.5 |
| **MCP 读 follow up brief + 建议改(走过目闸)** | §4-1 |
| **C1 块正文里的截止日期 → 做弹窗提醒** | §5-3 |
| **摘要写作时间记进数据库(UI 不显示)** | §5-5 |
| **写入开关默认打开** | §5-B —— 条件早已满足,只是没人去改 |

---

## 1. ✅ v0.4.0 已发布(08-10)

| 项 | 值 |
|---|---|
| tag | `v0.4.0` → 指向 **`84625db`** |
| 公证 | `.app` `89ebaceb-…` / `.dmg` `f7a15d9a-…`,**都 Accepted** |
| 验收 | 两个产物 `spctl` 都是 `accepted` + `Notarized Developer ID`;`codesign` Authority 第一行是 **Developer ID**(不是 `Spool Dev`) |
| 资产 | 带版本号的 + **固定名 `Spool-macOS-arm64.dmg`**,两份 sha256 一致 |
| 官网按钮 | `curl` 实测 **200** |
| 回执 | 已存进 `CASE_STUDY_LEDGER.md` **§1.2**(台账第二期的落点) |

⚠️ **发布是从 `84625db` 打的,不是从当时的 main HEAD。** 理由:那是 v0.4.0 收口时
跑过基线、装过机、看过窗口的那个代码状态;这一窗新做的东西(工作区改名/加一列)
没有被人眼看过,不该混进一个已经写好发布说明的版本。**下一版把它们带上就行。**

⚠️ **一条实测坑已写进 `RELEASE.md`**:`gh release create --target <短 sha>` 会被
GitHub 拒(`target_commitish is invalid`)。**先本地打标签、推标签,再
`gh release create <tag> --verify-tag`** —— 一次就过。

---

## 2. ⭐⭐ Gemini 免费档实测 + E3 落地(这一窗的主要内容)

**全文在 `DESIGN_AI_ENGINE.md` §7.8,表在 §7.3 第三列。数字进了
`CASE_STUDY_LEDGER.md` §2.5 和 §3.8。这里只留下一窗必须知道的。**

### 2.1 结论:**能当入门档,不能当默认档**

用他真库的**副本**(32 块/3 项目/v14)、真提示词跑的:

| 动作 | 结果 |
|---|---|
| 压缩 distill | ✅ **好**,2 次请求 / 28 秒 |
| 体检 thread_health | ✅ **好**,2 次请求 / 39 秒 |
| 跟进 follow_up | ❌ **烧光当天额度还没跑完** |
| 周回顾 weekly_review | ❌ 额度已空 |

**免费层真值 = 每个模型每天 20 次请求**(不是 §7.7 原先写的 1500,**差 75 倍**)。
✅ **额度按模型分池**,所以模型选择器现在是「今天还能不能跑」的开关,不是装饰。

### 2.2 ⚠️ 三个「做不对就静默失败」的坑(已写进代码注释和测试)

1. **`GEMINI_CLI_TRUST_WORKSPACE=true` 不设 → MCP 服务器被静默禁用**,
   跑完照样花额度,但一个 Spool 工具都没看见。⚠️ **`--skip-trust` 不管用。**
2. **cwd 必须设到我们自己造的临时目录** —— gemini 只从 `<cwd>/.gemini/settings.json`
   读 MCP,没有 `--mcp-config` 这种开关。
3. **`--allowed-mcp-server-names` 不设 → 用户自己的 MCP 服务器混进来。**
   gemini 没有 `--strict-mcp-config` / `--ignore-user-config`,
   用户 `~/.gemini` 里的服务器**照样被起进程**,能挡住的只是它的工具不进模型工具表。

### 2.3 ⚠️ 一条差点写成 bug 的观察(别再查一遍)

**压缩跑完库里一块都没多(32→32)。这是对的,不是 Gemini 的毛病。**
提示词自己写着「先念给用户听,**他同意之后**再 add_block」,无头跑没人能点头。
**拿 claude 跑同一份提示词,行为一模一样**(它也问「你同意这个方向吗?」,花了 $0.062)。
`engineStore.ts:336-345` 那段注释早就写着 `writing nothing is CORRECT`。

### 2.4 API key 放哪(说给用户听的口径)

**`~/.gemini/.env`,gemini 自己的配置里。** 实测:环境变量里完全没有
`GEMINI_API_KEY`、cwd 是我们新造的目录,它照样从那里读到了 key 并跑通。
→ **Spool 不存、不传、也读不到。** 这比原先设想的还干净。
⚠️ Spool 是 Finder 起的,拿不到用户 shell 的环境变量(和 PATH 是同一个老问题),
**所以别指望 `export GEMINI_API_KEY` 那条路。**

### 2.5 模型选择器已按 Ocean 的安排装回来

08-07 他说「模型先删掉,但是记录,后续还是要更新回去,**和 Gemini CLI 放一起做**」。
✅ 装回来了,重建成**按引擎的一张表**(`EngineBar.tsx` 的 `ENGINE_MODELS`)。
⚠️ **`opus` 仍然没放回去** —— 当初删它的 404 实测没复测过,放回去等于把老 bug 装回来。
⚠️ codex 那一列**故意是空的**(它的模型名不在本地校验,给了就是让用户在 API 那头失败)。

---

## 3. ⚠️ 这一窗没做到的一件事:没能截到窗口

§6.2-bis 要求「装完新版一定要看一眼窗口」。**这一窗按隔离配方做了**
(临时改 identifier `com.oceanjin.spool.e3`、隔离库、起进程),**但截图始终只有壁纸** ——
`screencapture` 抓到的那一屏**连 Chrome 和 VS Code 的窗口都没有**,
所以是**抓到了另一个 Space**,不是 app 没起来。⚠️ Swift 工具链在这台机器上也坏了
(SDK 不匹配),`CGWindowList` 那条路当场走不通。

**改用三个旁证,都通过了:**

1. **CPU 稳定 0.0%** —— 08-05 那次白屏是无限重渲染,一定烧 CPU;
2. **数据库真的被打开了**(`spool.db-wal` / `-shm` 当场生成)—— 白屏在挂载阶段就死了,
   根本走不到开库;
3. 进程活了 2 分 46 秒,stderr 没有任何报错。

→ **白屏那一类问题可以排除。但「点开之后长什么样」仍然没人看过**,
而这一窗动了右侧栏、设置页、项目管理三屏。**开工顺序第 2 件就是请 Ocean 自己看一眼。**

⚠️ **收尾已经当场做完**:进程按 pid 杀了、identifier 复位了、测试库删了、
真库一个字节没动(`git status` 干净)。

---

## 4. 长期计划(⚠️ 改写交接时必须原样带上)

> 08-02 那次改写把第 1、3 条整段弄丢了,Ocean 08-03 才发现。**这一节只增不减。**

1. **MCP 新增接口面**(超出现有工具面的部分)
   - ~~`propose_blocks` + 待审面~~ —— ✅ 已落地(2026-08-05),现在 **14 个工具**
   - 溯源:**A 案已批并落地** —— 用现成的 `ref_block_id`,没动 schema 的块结构
   - ~~分流的原文块带来源标签~~ —— ✅ 已落地(2026-08-06)
   - ~~`get_blocks` 的历史过滤位~~ —— ✅ 已落地(2026-08-07,v13 的 `stale`)
   - ~~档③「部分更正」开给 MCP,走提案~~ —— ✅ 已落地(2026-08-08,schema v14)。
     `propose_blocks` 的 item 多一个 `ref_kind`,**只认 `"corrects"`**;
     传 `"supersedes"` 当场拒绝。⚠️ 只开 ③,`stale_at` 那一列 AI 永远碰不到
   - ➕ **新增(已拍板,未开工)**:**MCP 读 follow up brief + 建议改** —— 决定 5。
     ⚠️ 写那一半必须走已有的「过目」闸,直写是注入提权链
     (网页注入 → 改 brief → 改变下次搜索方向)
   - M2:待审闸跑过一段真实使用后,**评估写入开关能否默认打开**。
     ✅ 闸门条件已换(2026-08-08 B3)且**已满足**,⏳ **但默认值还没改**(§5-B)
2. **Claude Code 引擎位**(目标 v0.4.0)—— ✅ M1/M2/M3 全部落地。
   ✅ 引擎位泛化成预设也落地了(2026-08-06)。
   ✅ **v0.4.0 已发布**(2026-08-10)
3. **Windows 版** —— 未开工。⚠️ 现在这一版有 macOS 专属通路(双击 ⌥ 走 HID tap、
   AXFrontmost 抢焦点),移植前先读 memory `double-tap-exclusivity` 和 `capture-note-first`,
   那两条记着哪些路是死路。⚠️ M2 的取消走 `setpgid` + `killpg`(Unix 专属),
   移植时这一段要重写。⚠️ `run_env()` 里的 `USER` 在 Windows 上是 `USERNAME`,别照抄。
   ⚠️ 引擎检测的候选路径表(`candidate_paths`)整个是 macOS/Unix 形状
   (`~/.nvm/…`、`/opt/homebrew/bin`),Windows 上要另写一份。
   ⚠️ `stream_with_timeout` 的两个读取线程本身是跨平台的,
   但**杀进程组那一段仍然是 Unix 专属**,跟 M2 的取消是同一处。
   ⚠️ `focus_mcp_client`(一键问 AI 用来把客户端调到前台的)整个是 `open -a`,
   **Windows 上要另写**
4. **分发**:公证直发 `.dmg`,**不上 MAS**(memory `distribution-route-notarized-dmg`,
   沙盒冲突清单在里面)
5. **LICENSE 仍未定** —— ⚠️ 绝不擅自加(memory `no-license-file`)。
   ✅ **2026-08-08 Ocean 明确答复「不加」** —— 这现在是一条禁令,不只是暂缓。
   后果(公开仓库无许可 = 保留所有权利)要在 case-study 页面主动答一句,
   措辞已写进 `CASE_STUDY_LEDGER.md` §4
6. **对外动作**:MCP 注册表挂号 / Show HN / Product Hunt —— 每件都要 Ocean 单独明示
7. **产品下一程剩下的三条**(原 `DESIGN_NEXT_STAGE.md` §4.3–§4.5,那份稿子已归档)
   - ~~**AI 活动面**~~ —— ✅ 已落地(M3)。⚠️ 正确形态是右侧栏;
     **08-07:那个折叠区已经删掉并入右侧栏了(R2)**
   - **「我的思考」凸显**:块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论"。
     ⚠️ **W7 那一半已经落地了**(08-07 晚,批注当标题);**「只看我写的」过滤还没做**
     —— ⚠️ 这条是 Ocean「提高我的信息权重」那个诉求的正确落点,
     ⚠️⚠️ **而且按 §3.4 第 4 条,它会从"锦上添花"变成"必需品"**
   - **首日价值**:捕捉满三条 → 一行安静提示"打个包试试";「今天读了什么」日卡
8. **Follow up(联网跟进)** —— 全稿 `DESIGN_FOLLOW_UP.md`。四期:
   ~~M1 引擎泛化~~ ✅ / ~~M2 brief + 手动跟进 + 进待审面(schema v11)~~ ✅ /
   ~~M3 没新东西就静默~~ ✅(08-07)/ **M4 定时(仍然只在 M3 被证明有用之后)**
   ⚠️ **硬约束**:`DESIGN_CONTEXT_HYGIENE` §9.5 —— **M4 上线前应当先有一个「往外拿」的动作**。
   定时 = 自动往项目里灌块而另一头没有出口,按真库数字**每周一次跟进约 14 周撞满预算**,
   而那时去重帮不上任何忙
9. ~~**引擎档位问题**~~ —— ✅ **2026-08-10 收了**:第三个档(Gemini CLI)已落地,
   实测账在 `DESIGN_AI_ENGINE` §7.8。
   ⚠️ **但原问题只解决了一半**:引擎位现在有免费入口了,
   **而免费入口跑不了跟进和周回顾**。真正「稳定免费又能跑全部四个动作」的档**仍然不存在**
10. ⚠️ **工作台** —— 全稿 `DESIGN_WORKBENCH.md`。
    一~六期 + §7 notes 当标题(W7)全部 ✅。
    ➕ **§10 未开工**(块正文 MD 渲染 + 动作条减到 7 键)。
    **这一摊已经返工过两轮 —— 下一轮反馈大概率还在这里。**
11. ⚠️ **上下文卫生** —— 全稿 `DESIGN_CONTEXT_HYGIENE.md`。
    五件里 **1/2/3/4 已落地**(08-07 深夜,见 §8),**拍板甲 + 乙已落地**(08-08,§9.3.1),
    **两处反转已落地**(08-09,§1.1-ter)。
    第 5 件(AI 一句话标签)**按稿子自己的判断口径先不做**,缺口记在 §8.6。
    ⚠️ §2 那一节的调研**会过期**(2026-08 查的),下次动这摊之前重查。
    ➕ **§9 是实测账,动这摊之前先读它**
12. ➕ **三份计划稿(2026-08-08 Ocean 提)**
    - **`DESIGN_PROJECT_FILES.md`** —— 附件从块级搬到项目级 + 右侧栏「项目文件」+
      **MCP 申请访问文件**。⚠️ 这一件解开了「自动挂本地文件」当初被否的死结:
      **路径只能从用户的文件选择器来,AI 只能在用户选定的集合里申请**,注入链断了。
      ⚠️ **schema v15**;⚠️ **工具面会从 14 个变 15 个**;✅ 三件待拍板已全部拍完
    - **`DESIGN_WORKBENCH.md` §10** —— 块正文渲染成 Markdown(建议自己写小渲染器,
      不引依赖)+ 动作条从 10 个键减到 7 个(删 复制 / 附加文件 / 附加链接)
    - **`DESIGN_CASE_STUDY.md`** —— 给研究生申请用的公开 case-study。
      ✅ 第一期(台账)、第三期(八栏正文)已落地。
      **剩四、五、六期**,卡在「代码全做完之后」这个时机
13. ➕ **「把整场对话分流进项目」** —— 决定 4,走选项 A,**未开工**。
    ⚠️ **做之前必读 `DESIGN_CONTEXT_HYGIENE` §9.5**:原文块的 `source_text` 是**文档级**的,
    会把 MCP 从全库最省的写入变成最贵的写入,**三到四次分流就撞满一个项目的预算**。
    路线:只把用户的提问序列存成原文块,AI 的结论各自署名 `↩ cites:` 指回去。
    ⚠️⚠️ **它同时是给 `propose_blocks` 造触发场景的那个功能** —— 见 §5-B

---

## 5. 还没还的旧账

1. ~~写之前先给用户看一眼~~ —— ✅ 分流(待审面)+ 运行卡片,两半都做完了
2. ~~AI 到底往我库里写了什么~~ —— ✅ **08-07 搬进右侧栏**(R2)
3. **块正文里的截止日期没人管** —— ✅ **2026-08-08 Ocean 拍板:做一个弹窗之类的提醒。**
   ⚠️ **08-07 走了半步**:项目管理按 `threads.deadline` 排序、快到期会变色。
   **但块正文里那种日期还是没人管** —— 那要能从正文里认出日期,是另一件事。
   ⚠️ **同形的第二例**(`DESIGN_CONTEXT_HYGIENE` §9.6):v13 给了作废/更正这两把刀,
   **但没有任何东西会提醒用户去用**
4. **重复块:用户想清但清不动** —— 对「完全重复」来说,「这条不作数了」(v13 档①)
   就是正确处置。真库〈Flux〉里就有一对(#3/#4,相似度 1.0,各 3,503 字 = 全 pack 的 13%)。
   ✅ 那行字语义勉强 —— **Ocean 说没关系,不改。**
   ⚠️ 仍然欠的只剩一条:`thread_health` **只能报告,不能动手**
5. **摘要没有写作时间** —— ✅ **2026-08-08 Ocean 拍板:记进数据库,但 UI 不显示**
6. **一件事被拆成两个项目** —— ✅ **Ocean:「不管,这种情况几乎没有」。** 留档,因为它仍然是
   「用对话标题自动建项目」被否的理由

⚠️ **第 4、6 条跟 Follow up 直接相关** —— Follow up 是个进货口,而这两条是出口堵着。

### 5-B ⚠️ 写入开关默认打开:条件已满足,但还没改

B3 把闸门条件换成「`add_block` 真跑过且没出事 → 可以默认打开」,而那已经发生了
(08-07 ChatGPT 写进 11 块,两次报错自己恢复)。**所以这件现在是可做的,只是没人做。**

⚠️ **改之前先想清一件事**:Ocean 日常用法(问 AI 核验 → 存结论)**结构上永远落在
`add_block` 那侧**,分流基本不会自发发生。**决定 4 才是真正给 `propose_blocks`
造触发场景的那个功能。**

### 5.1 截图与演示(Ocean 已批时机:app 代码全部做完之后)

- **截图全套重建**:现在官网/README 用的是旧图,**块流(W7)、右侧栏、项目管理都换了样子**。
  要求见 memory `next-stage-goals-website-portfolio`(**多场景铁律**)
- **演示视频**:录完才动 Hero 那一屏
- 顺序是 Ocean 定的:**代码 → 截图 + 视频一起 → 官网那两屏**
- ⚠️ **`RELEASE.md` §3 的验收清单里那一条现在是不合格的**,已标注

### 5.2 其余待办

| # | 事情 | 状态 |
|---|---|---|
| ~~P~~ | ~~正式发布 v0.4.0~~ | ✅ **08-10 发完** |
| ~~E3~~ | ~~第三个引擎档(Gemini CLI)~~ | ✅ **08-10 落地** |
| **V2** | **codex 那条路的最后一格** | **开工顺序第 1**,额度已恢复。剩三件:花费字段、模型目录、流式事件名,**一次跑通同时解决** |
| **M4** | Follow up 定时 | ⚠️ 仍然要等 M3 被证明有用,⚠️ 并且要先有一个「往外拿」的动作(§4-8) |

**要等别的事先完成的**:

| # | 事情 | 卡在哪 |
|---|---|---|
| B | 写入开关能否默认打开 | ✅ 条件已满足 —— 见 §5-B,现在缺的只是有人去改 |
| F | 截图 + 演示脚本整体重建 | Ocean 已批:排在 app 代码全部做完之后 |
| G | Hero 内嵌 15 秒演示视频 | 视频没录之前这一屏保持现状 |
| H | 对外动作 | 每一件都需 Ocean 单独明示 |

---

## 6. 干活须知(踩过的坑)

### 6.1 基线与验证

```
npx tsc --noEmit                                  # 干净
npx vitest run                                    # 268 通过(2026-08-10)
cargo test --manifest-path src-tauri/Cargo.toml   # 51 通过(2026-08-10,E3 加了 6 条)
node scripts/i18n-check.mjs                       # (none missing)
```

改任何 pack 渲染都要跑满前三条 —— 两侧渲染器有 golden 平价测试盯着。
⚠️ **改官网(`site/*.html` 或中文串)之后要跑 `node scripts/build-site-zh.mjs`**。

⚠️ **`cargo test` 必须带 `--manifest-path` 或先 `cd src-tauri`。**

⚠️ **`engine.rs` 里有三个测试真的会 fork 子进程**,它们**共用一个 `STREAM_TESTS` 互斥锁**,
因为 `RUNNING_PGID` 是**一个全局**。**再加会跑子进程的测试,记得也上这把锁。**

### 6.1-bis ⚠️ 漏译检查是仓库里的脚本

`node scripts/i18n-check.mjs`(加 `--dead` 还会列出没人用的字典条目)。
⚠️ 它只看**字面量**。`t(SOME_CONST)` 这种它看不见。
⚠️ **`--dead` 现在报 40 多条,绝大多数是既有的** —— 按 CLAUDE.md §3 没删。

### 6.2 实机验 MCP(stdio 喂 JSON-RPC)

完整手法在 memory `isolated-verify-workflow`。要点:

- 二进制在 `src-tauri/target/release/spool`,跑 `spool --mcp`
- ⚠️ **`SPOOL_DATA_DIR` 要指到装着 `spool.db` 和 `settings.json` 的那一层**
- 要先发 `initialize` + `notifications/initialized`,才能 `tools/call`
- **写侧探针请在副本上做**。⚠️ 08-10 用的做法(推荐照抄):
  `sqlite3 <真库> ".backup <副本>"` —— 比 `cp` 安全(WAL 也对),真库一个字节不动
- ⚠️ **改完 Rust、重新构建之后,已经连上的客户端不会换二进制** —— 必须完全退出重开
- ⚠️ **`SPOOL_DATA_DIR` 对 GUI 无效**,只管 MCP 那一侧
- ⚠️ **一段能直接粘的数工具个数的命令在 `CASE_STUDY_LEDGER.md` §5**

### 6.2-bis ⚠️ 装完新版,一定要**看一眼窗口**

08-05 出过一次:`tsc` 干净、测试全绿、构建签名全过,装上去**主窗白屏**。
**没有任何一条自动化会打开那个窗口。**

⚠️ 通用的一条:**`selectAllThreadsFlat` 只能 imperative 用**,**绝不能当 hook selector**。
组件要这张表就订阅 `threadsByWorkspace` 再 `useMemo` 摊平 —— **`ProjectBoard.tsx` 就是这么写的。**

隔离验证配方:

1. `tauri.conf.json` 的 identifier 临时改一个没用过的(用过 `.wb` / `.e3`)
2. `npm run tauri build -- --bundles app`
3. 库和 settings 预置在 `~/Library/Application Support/<新id>/` 的**根上**
4. `open -n <app> --stdout /tmp/x.out --stderr /tmp/x.err` 起来抓日志
5. ⚠️⚠️ **截图这一步 08-10 整个失败了,别再按老办法硬试**:
   `screencapture -x` 抓到的那一屏**连 Chrome 和 VS Code 都没有**,说明抓的是**另一个 Space**;
   `System Events` 报窗口数 0(脚本宿主没有辅助功能授权);
   **`swift` 走 `CGWindowList` 也不通 —— 这台机器的 Swift SDK 坏了**,编译标准库就报错。
   ✅ **改用三个旁证**(08-10 验过,够用):**CPU 稳定 0.0%**(白屏那次是无限重渲染,一定烧 CPU)、
   **`spool.db-wal` / `-shm` 当场生成**(证明 React 挂载成功、走到了开库)、stderr 无报错。
   ⚠️ **但这只排除白屏,排除不了"长得不对"** —— 那一层还是得 Ocean 自己看。
6. ⚠️ 想看某个项目的块流,就把测试库的 `is_capture_target` 改到那个项目上再起
7. ⚠️⚠️ **收尾当场做**:按**全路径**杀进程(**绝不用模糊 `pkill -f spool`,正式版一直在跑**)、
   复位 identifier、删掉测试库

⚠️ **合成鼠标点击驱动不了这个 webview。** 「点开之后长什么样」这一层**永远验不到**。

### 6.2-ter ⚠️ 子进程 / 外部客户端的活,必须真跑一次

**已被四次独立事件证实**(全部收进 `CASE_STUDY_LEDGER.md` §3.4/§3.5/§3.6/§3.8):
`CLAUDE_CODE_EFFORT_LEVEL`、跟进的 URL 规则、Codex 免费档、
➕ **Gemini 免费额度(稿子写 1500/天,实测 20/天,差 75 倍)**。

**⚠️ 提示词里写了规则 ≠ 规则生效。稿子里写了数字 ≠ 数字是真的。**

**怎么真跑(固定下来):**

1. `scripts/seed-workbench-lab.sh` 建隔离库,或 `sqlite3 .backup` 拷真库副本;
2. **argv 从 Rust 里打印出来,别手抄** —— 临时加一个 `#[test]` 打印,拿完**立刻删掉**;
3. 提示词从 **MCP 的 `prompts/get`** 拿。⚠️ 例外:`follow_up` **不是 MCP prompt**,
   只能用同样的临时 `#[test]` 调 `guidance_text("follow_up", …)` 拿
   —— 记得先 `set_var("SPOOL_DATA_DIR", …)` 指到测试库;
4. `env -i PATH=… HOME=… USER=…` 起,`< /dev/null`;
5. ⚠️ **一次跟进要跑五到十分钟,前台会被 10 分钟超时打断 —— 放后台跑。**

⚠️ **仍然没真跑过的**:codex 的一切、**Claude Desktop 的写入**。

### 6.2-quater ⚠️ 探子进程可以不花模型额度(但有边界)

- **`--strict-config`(codex)**:把「要试的键」和「一个肯定不存在的键」一起传。
  ⚠️ 它验的是**键**,**不验值**。
- **拿包装脚本当探针**;**翻二进制里的字符串**能证明「这个词在里面」,**不能证明「它现在还有效」**。
- ➕ **08-10 新增两条**:
  - **直接打 REST API 是最省的探针** —— 一次 `maxOutputTokens:1` 的 `generateContent`
    就能问出「这个模型这个 key 能不能用、额度还剩不剩」,比起一次 CLI 跑省 10 倍。
    ⚠️ **但它会真的消耗额度**,别拿它做循环扫描。
  - **`ListModels` 返回的名字不等于能用的名字** —— gemini 返回 42 个,
    其中好几个 `generateContent` 直接 404(`no longer available to new users`)。
- ⚠️ **提示词里写了规则,连「模型会不会照做」都答不了。** 只有真跑能答。

### 6.3 ⚠️ 环境坑

1. **`cargo build --release` 必须 `cd src-tauri`(或带 `--manifest-path`)。**
2. **开测第一件事:`tools/list` 数一下工具个数。** 现在是 **14 个**。
3. ✅ **seed 脚本都从 `client.ts` 读 schema 版本**。
4. ⚠️ **`codex exec` 的 stdin 必须给 `/dev/null`**。claude 和 gemini 也一样。
5. ⚠️ **schema 版本有三处要一起动**:`client.ts` 的 `SCHEMA_VERSION`、
   `mcp.rs` 的 `EXPECTED_SCHEMA_VERSION`、`client.test.ts` 里那一堆 `toBe(n)`。
   **现在是 v14**。⚠️ **`client.test.ts` 里还有一个 `downgradeToV13` 要跟着长**。
6. ⚠️ `mcp.rs` 的 `INSTRUCTION_HEADER` 是 `r##"…"##`,**不是 `r#"…"#`**。
7. ⚠️ **版本号三处要一起动**:`package.json` / `src-tauri/tauri.conf.json` /
   `src-tauri/Cargo.toml`(⚠️ `Cargo.lock` 也会变,一起提交)。
8. ➕ **加引擎要动的地方(08-10 走了一遍,照这个清单)**:
   `engine.rs` 的 `EngineKind`(枚举 / `ALL` / `as_str` / `parse` / `models`)、
   参数适配、输出解析、`run_env`、`run_action` 的 match、
   `lib.rs` 的 `open_mcp_client_page`、
   TS 侧 `engineStore.ts` 的 `EngineKind` + `ENGINE_LABEL`、
   `settingsStore.ts` 的 `aiEngine` 联合类型(+ 新模型键要在**四处**登记:
   `PersistableKey` / 接口 / `PERSISTABLE_KEYS` / 默认值)、
   `EngineBar.tsx` 的 `ENGINE_MODELS`、`EngineConfig.tsx` 的安装入口、i18n。
   ⚠️ **`EngineKind::parse` 有一条测试断言「某个不认识的名字返回 None」** ——
   加引擎时那一行要换成另一个还不认识的名字,否则测试会红。

### 6.4 语言双侧(硬规则 12)与它的例外

用户能读到的文案走 `t!`/`ts!`,中文那一半在前。⚠️ **例外**:工具名、工具描述、
`initialize` instructions、pack 的权威表头 **和 `## Notation` 那一节** ——
这些是**给模型读的契约,任何 locale 下都保持英文**。`ai note:` 也属于这一侧,**不翻**。
⚠️ **引擎名(Claude Code / Codex / Gemini CLI)是产品名,也不翻。**

⚠️ **第三个受众**:**case-study 是对外材料,整份英文** —— 台账、页面正文、图上标注全英文。

⚠️ **一条通用判据(Ocean N6 给的)**:回答「只有做这个东西的人才会问的问题」
= **开发者提示,不该出现在界面上**。

### 6.5 golden fixture 重生(硬规则 5)

⚠️ **重生前必须 `TZ=Europe/London`。**

```
TZ=Europe/London GOLDEN_WRITE=1 npx vitest run src/lib/pack/assemble.test.ts
```

⚠️ **能合并成一次重生就合并。**
⚠️ **反过来的一条**:**动 pack 之前先想一遍"输出真的变了吗"**,别条件反射重生。
⚠️ **fixture 现在覆盖 v13/v14**:一个被作废的**置顶**块、一条 `supersedes`、
一条 `corrects`,以及标签阶梯的两处。别删掉这几块。

### 6.6 提交与推送

**08-10 这一窗:代码 + 文档已提交并已推**(Ocean 明示「release同意」)。

- ⚠️ **推送要单独问 Ocean,每次都要。** 他明示的是**那一次**的授权,**不是长期授权。**
- ⚠️ **SSH 推不了(08-07 实测)**:`~/.ssh/id_ed25519` 带口令、agent 空、沙盒弹不出 askpass。
  **走 HTTPS**:`git push https://github.com/KIM-ocean-HZ/spool.git main`
  ⚠️ `git fetch origin` 同理会失败,刷新本地 ref 要
  `git fetch https://github.com/KIM-ocean-HZ/spool.git main:refs/remotes/origin/main`。
  **别去改 remote。**
- ⚠️ **绝不写自己的署名进 git 历史** —— 硬规则见 CLAUDE.md §5。每次提交后自检:
  `git log -1 --pretty=full | grep -iE 'claude|anthropic|co-authored|🤖|generated with'`
  ⚠️ **这个自检会误报**:「Claude Code 引擎位」是功能名、「claude 2.0.50」是 CLI 名、
  「Claude · MCP」是产品自己写的来源标签 —— 这三类是**产品内容**,CLAUDE.md §5 明确允许。
  **判断标准看 author/committer 和 trailer**,不是看正文有没有这个词。
- `docs/ID.txt` 是凭据文件,`.gitignore` 挡着,**别提交**
- ⚠️ **`git add -A` 会把 Ocean 在 IDE 里的顺手改动一起带走。** 提交前扫一眼
  `git status --short`,不认识的改动先看 diff。

### 6.7 给 Ocean 写东西

大白话、一步一个动作,别堆术语(memory `write-plainly-for-ocean`)。
他说过「你写的我没看懂」。凡是"等 Ocean 明示"的,**问的时候要把取舍讲清楚,
不要只报选项名**。

⚠️ **验证有效(三次)**:08-07 晚给他四个选择题、每个选项都写清「好处 / 代价」,
并且**画了 ASCII 草图**,他四题都秒选了推荐项。
08-07 深夜回答他「会不会过载」时**先给结论、再给真实数字表**,他直接拍了两块板。
➕ **08-10 再验**:开工前把「我需要你给的东西」列成 4 条、每条写清**去哪拿、怎么给我、
为什么要**,他一次全答完,没有来回。**问清楚一次比来回三次快。**

### 6.8 测试库怎么用

```
scripts/seed-workbench-lab.sh                     重建(会先清空)
scripts/seed-workbench-lab.sh --argv distill 选哪个向量库   打印怎么手动跑
```

库在 `~/Library/Application Support/com.oceanjin.spool.wb/`。
⚠️ 它和 `seed-mcp-lab.sh` 是**两个库**,互不干扰。

### 6.9 ⚠️ 真库现在长什么样(2026-08-10 量的)

**`PRAGMA user_version = 14`,2 个工作区 / 3 个项目 / 32 块。**
(⚠️ 比 08-09 记的「5 项目 / 31 块」少 —— 中间他自己删过项目,**不是数据丢了**;
块数 32 里有 12 块属于已删的项目。)

⚠️ **库目录里有一批备份文件,占空间。** Ocean 确认没问题之后可以清掉老的
—— ⚠️ **但那是用户数据,清之前必须问他,一份都别自己删。**
