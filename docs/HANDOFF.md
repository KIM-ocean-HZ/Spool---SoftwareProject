# 交接文档 — 2026-08-02 晚(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`next-stage-goals-website-portfolio`、`write-plainly-for-ocean`、
> `no-license-file`、`spool-db-wipe-incident`、`isolated-verify-workflow`、
> `distribution-route-notarized-dmg`、`mcp-first-pivot`、`ui-language-follows-system`)。
> 完成后删除本文件。

---

## 0. 一句话状态

**本地四个提交,一个都没推**(Ocean 明示「先不推送,等我审查」)。
基线全绿:`npx tsc -b` / `npx vitest run`(152)。真库全程没碰。

本窗做完:官网定位改写 + MCP 客户端阵容 + 「每周变强」真截图 + 首启审计方案。
两份设计稿已批已落地,第三份(首启)**五个拍板点 Ocean 已全批,还没动手**。

**👉 下一窗按 §1 的顺序做。动手前必须先看 §2 和 §3 —— 那里有会打架的指令和会写成假话的事实。**

---

## 1. 下一窗要做的三件事(按顺序)

1. **官网内容大改** —— Ocean:「我写了 `docs/webimproveadvice.txt`,在下一窗口**严格阅读执行**」。
   那份稿子把首页从 14 屏压到 9 屏,还给了逐条清单。**先读 §2/§3,再动手。**
2. **首启头 60 秒改造** —— `docs/DESIGN_FIRST_RUN.md`,Ocean 批复:
   **「要你拍板的四件事全部通过」+「拍板点 5 也一起加进本轮」**(见 §5)。
3. **中文版重新表达** —— Ocean:「目前中文版是英文直译,真正的中文用户读着不习惯。
   **等网站内容终版确认后**再改中文表达。」(见 §6)

顺序建议:先 1 后 3(中文要等英文定稿),2 可以夹在中间独立做 —— 它不碰官网。

---

## 2. ⚠️ `webimproveadvice.txt` 与 Ocean 已批决定打架的地方(需要他一句话,别自作主张)

这份 advice 写得很好、大部分该照做。但它有 **7 处和 Ocean 自己几小时前批的东西相反**。
「严格执行」和「他昨天批的」冲突时,**不是你选一个,是拿去问他**。建议做成一张单子,
一次问完,别一条条来回。

| # | advice 要求 | 与什么冲突 | 我的看法(仅供他参考) |
|---|---|---|---|
| 1 | **首页只写给 AI 重度用户/开发者**,找工作/签证/上课降为 FAQ 或次级页 | ① 本窗刚批上线的「这说的是不是你」四张卡就是这些场景;② **和 Ocean 的长期铁律直接冲突**:memory `next-stage-goals-website-portfolio` 里「截图场景必须多元,证明不是只给某类人用的」是他 07-29 亲口定的 | advice 的理由很硬(真实交付门槛就是 Apple Silicon + 两个权限 + 已配好 MCP)。**这是全站最大的一个叉路口,必须他本人定**,定完再改文案 |
| 2 | ~~Hero 主 CTA 换回**下载**~~ **已解决,不用再问** | — | **Ocean 2026-08-02 当场定了:换回下载。已改(橘色实心=下载,演示降为白色描边)。** 剩下的半条仍开着:advice 还建议**在这一屏内嵌 15 秒循环演示视频**,那样按钮可以专心写下载、证据不花按钮位。**视频要录,没录之前这一屏就保持现在这样** |
| 3 | 删掉 hero 那句 "It works the same on your first afternoon as on your hundredth day" | 那句是**专门用来拆 Ocean 自己提的「用户看不到明显好处、只有长期用户才发现便利」**这个顾虑的 | advice 说它和「第六周」自相矛盾——确实同时摆出来会糊涂。但删之前想清楚:删了以后**「当天就能兑现」这件事还有谁在说?** 建议保留其一，别两句都删 |
| 4 | 删掉 "Nothing to learn" 四条、"Three promises" 三卡、"The app — 安静是刻意的" | 前者本窗刚加(拆学习成本),后两者是老内容 | 精华并进信任块是合理的。但「学习成本」这个顾虑是 Ocean 自己提的,**并进去可以,整段蒸发不行** |
| 5 | 「每周变强」并进新的 Before/After 屏 | 本窗刚**实拍了两张真截图**(`site/assets/shots/growth-day1.png` / `growth-week6.png`) | 图别浪费。建议新结构里保留这一对,它是全站唯一能证明「积累」的证据 |
| 6 | **术语统一**:网站 project / README 与 story 叫 thread / 隐私页 threads,选一个全线统一(含 App 内) | 这是**产品级命名决定**,牵动 app UI、i18n(中文即键!)、README、隐私页、MCP 工具描述 | advice 指出的问题是真的。但「顺手在改网页时统一」会炸出一大片 —— **单独拍板、单独做**,别塞进这次改版 |
| 7 | license 那条:「in the open」与 all rights reserved 冲突,要么补 license 要么改措辞 | memory `no-license-file`:**Ocean 明示许可未定,绝不擅自加 LICENSE** | **这条不用问他也能定:改措辞**(改成「构建过程公开 / build log in the open」),**绝不加 LICENSE** |

---

## 3. ⚠️ advice 里**执行不得 / 必须先核实**的事实(照抄会在公开页面上写假话)

advice 是拿网站文本看出来的,有几处外部事实它不可能知道。**我已经实测过,结论如下。**

### 3.1 🚨「已签名公证」—— 在核实之前,官网绝对不许写

advice 的 P0 第一条和它给的 hero 示例都写着「已签名公证」。实测:

```
$ spctl -a -vv -t install /Applications/Spool.app
/Applications/Spool.app: rejected
source=Unnotarized Developer ID
```

装机版是**未公证**的(这个本来就知道,是本地换装的产物,硬规则 8 不落盘 App 专用密码)。
**真正要核实的是「Releases 里那份 dmg 到底公证了没有」** —— README 第 15 行和第 42 行
**已经对外声称 "signed, notarized"**。我本想下载核实,`gh release download` 超时了,没拿到结论。

**下一窗第一件事**(在写任何一个字之前):

```bash
gh release download v0.3.0 -p "Spool-macOS-arm64.dmg" -D /tmp
xcrun stapler validate /tmp/Spool-macOS-arm64.dmg     # 看有没有钉上公证票
spctl -a -vv -t install /tmp/Spool-macOS-arm64.dmg
```

- 结果是**已公证** → 官网可以写,而且该写(这是最便宜的信任分,advice 说得对)。
- 结果是**未公证** → 官网不许写,**而且 README 那两句现在就是在说假话,要立刻改**,
  并把「发版前补公证」提到发布流程最前面(`docs/RELEASE.md` §2 第 5 步)。

### 3.2 「macOS 12+」是 advice 编的,别抄

实测两个 bundle 的 `LSMinimumSystemVersion` 都是 **10.13**,`tauri.conf.json` 里没设过最低版本。
要在官网写系统要求,**先确定真实的最低可运行版本**(Tauri 2 + WKWebView 的实际下限,
不是 plist 里那个继承来的默认值),别把「12+」当事实印上去。
拿不准就只写 **Apple Silicon**(这条是真的,dmg 只有 arm64)。

### 3.3 「170 项自动化测试」不对

实际是 **152 个 vitest + 16 个 cargo test**。要写数字就写核过的数字,别抄。

### 3.4 story 页那句补充,要写成真话

advice 建议给数据库清空事故补一句「发生在发布前的开发环境,**无任何用户数据受影响**」。
⚠️ 按 memory `spool-db-wipe-incident`,5/29 清空的是 **Ocean 自己的真库**。
当时确实没有外部用户,但「无任何用户数据受影响」听起来像「我们有用户群、他们没事」。
**要写就写准确的**:发生在公开发布前,受影响的是作者自己的库,以及后来加了什么防护。
这一页是 portfolio 资产,**诚实本身就是它的价值**,别为了好看把它说滑了。

### 3.5 「grid-3 塞了 4 张卡会掉行」—— 不是 bug

`.grid-3` 是 `auto-fit` + `minmax(16rem, 1fr)`:1440 宽正好一行四张,窄屏自动换行。
本窗实拍验过。这条可以不改。

---

## 4. advice 里没有争议、可以直接做的

这些我核过、也同意,照做就行:

- **加 Open Graph / Twitter Card**(实测全站一个都没有,advice 说得对)。分享到微信/Slack 全是白板。
- **title 加品类关键词**(现在的 title 没人会搜)。
- **中段加下载 CTA**(Hero 之后直到页脚才有第二个,确实太远)。
- **FAQ + 权限说明**。⚠️ **权限这条优先级最高**,理由见 §5:它和首启审计发现的伤口是同一个
  —— 用户在官网没被告知要授权,装完又被一句「双击 ⌥」引到一条此刻走不通的路上。
- **新增「粘贴前后对照」那一屏**(advice 第五屏)。**这是整份 advice 里最值钱的一条**,
  而且现在**有条件拍真的**:隔离构建在 `~/Desktop/Spool-Demo/Spool.app`,
  演示库脚本 `scripts/seed-demo-library.sh` 与 `scripts/seed-growth-demo.sh` 都在(见 §7)。
- **「AI 可以读、可以写,但必须签名」提为 MCP 段标题** —— advice 说这是全站最好的一句,我同意。
- fineprint 拆两处;砍掉重复(它数出来「一次粘贴」出现了 11 次,这个批评是准的)。
- 工程债:ARIA(tab 缺 `aria-controls` / 面板缺 `role="tabpanel"`)、图片 `srcset` 与 `height`(CLS)、
  `prefers-reduced-motion` 与 JS 失效时 `.reveal` 的降级、下载按钮标注 arm64。
- 中文独立 URL(`/zh/` + hreflang):是对的,但**牵动 Pages 部署结构**,算第二批。

**advice 明确表扬、别在改版里弄丢的三样**:alt 文本质量、截图是真实界面不是渲染稿、
主动声明「截图用的是演示库,无个人内容」。

---

## 5. 首启改造:五个拍板点 Ocean 已全批

方案与证据在 `docs/DESIGN_FIRST_RUN.md`(含实拍首启截图 `docs/screenshots/first-run-2026-08-02.png`)。
**Ocean 2026-08-02 批复:四条全过,并且「拍板点 5 和前四点一起加进本轮」。**

所以本轮要做全五条:

1. 首启开在教程脉络「Welcome to Spool」,不开在空的 Unsorted。
2. 空状态文案按授权状态分叉 —— **未授权时绝不叫用户去双击 ⌥ 从别的 app 捕捉**。
3. **把两个系统授权弹窗推迟到用户主动要开捕捉时**(要改 `src-tauri/src/double_tap.rs` 的 `run_tap()`)。
4. 权限横幅改写成「还差一步 + 在那之前你能干什么」。
5. **第一条捕捉成功后的一次性收口**(原稿建议缓做,Ocean 要求本轮一起上)。

⚠️ 第 5 条我原本建议缓做,理由现在依然成立,**做的时候盯住这三点**:
- 它需要一个**一次性状态**(「这个用户已经见过收口了」)。落在 `settings.json`,
  **绝不要落进数据库、更不要进种子** —— 种子只在空库重建路径跑(5/29 红线)。
- 存量用户(包括 Ocean 自己的库)**不该**突然看到这句话。判据要写成「首次捕捉且没见过」,
  而不是「库里只有一条块」。
- 它是 UI 一次性状态里最容易在重构中变成幽灵的那种,**测试要覆盖「见过之后不再出现」**。

第 3 条是唯一动 Rust 的,**必须隔离构建实机回归**(全新 identifier,
memory `isolated-verify-workflow` §14:装了正式版之后合成事件测不了手势)。
验收标准逐条写在设计稿 §5,**不许只看代码**。

---

## 6. 中文版重新表达(等英文终版)

**Ocean 原话:「目前的网站中文版是英文直译,真正的中文用户阅读不习惯。
等网站内容终版确认后修改中文版的语言表达。」**

- 铁律早就写着**「中文文案是重写不是翻译」**(memory `next-stage-goals-website-portfolio`),
  但实际交付出来的还是译文腔 —— 说明光有铁律不够,**得单独排一轮、逐句念出来改**。
- ⚠️ **本窗新写的那些中文也在这一轮的范围内**(那两分钟 / 这说的是不是你 / 没有东西要学 /
  每周变强 / 阵容段 / 谁做的)。别默认「刚写的就不用改」。
- 时机:**英文终版定下来之后**再动,否则改两遍。
- 判据(比「读着顺」可操作):念出来不像翻译腔;没有「它的」「们」「被」的堆叠;
  长定语拆短句;英文的破折号插入语在中文里改成独立句。

---

## 7. 环境与欠账

### 7.1 隔离演示环境(留着没删,下一窗要拍图直接用)

- **隔离 app**:`~/Desktop/Spool-Demo/Spool.app`(identifier `com.oceanjin.spool.verify`,
  与正式版数据彻底隔离)。**`tauri.conf.json` 的 identifier 已复位成 `com.oceanjin.spool`**,
  git 里干净 —— 下次要重建隔离构建,记得改完**立刻**建、建完**立刻**改回来。
- **演示库脚本**:`scripts/seed-demo-library.sh`(8 个项目的常规演示库)、
  `scripts/seed-growth-demo.sh day1|week6`(同一项目两个深度,本窗新增)。
  两个都**只写 verify 数据目录**,真库不碰。
- 拍图的坑都在 memory `isolated-verify-workflow`;本窗新踩的两个:
  **① 截图前把鼠标挪开**(悬停会把块的工具条勾出来,拍进去很假);
  **② 每次重启后窗口位置会变,必须重新取 bounds**(§10 那条规程是真的救命)。

### 7.2 还欠的两笔账

- **app 设置页那处文案改动没有实机截图**(纯文案,tsc + 152 用例都过)。
  下次任何一次隔离验证顺手看一眼折叠段即可。
- **教程种子里的 MCP 说明还停在「一键接入 Claude Desktop / Cursor」**,实际支持六个。
  只影响新装库(5/29 红线)。Ocean 2026-08-02 明示**预留到以后和其他教程修订一起做**。
  ⚠️ 但注意:**首启改造第 1 条要把用户直接送进教程脉络**,送进去之后他读到的就是这句过时的话。
  **建议在做首启那轮时一并把这句改掉**,顺路的事。

### 7.3 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)—— 投入产出比最高。
2. demo 链接单独短地址。
3. Show HN / Product Hunt —— 只有一次机会,等页面定稿 + dmg 公证确认之后。
4. ❌ 刷好评、假装用户安利:不做。

### 7.4 商标结论(动官网/README 提到客户端名字时必看)

2026-08-02 逐家查过官方页面:**六家没有一家可以直接把 logo 摆上我们官网**。
Visual Studio Code **明文禁止**用图标标识/推广自己的产品,且**禁止 `VS Code` 这类简写**;
Anthropic / OpenAI 要**事先书面批准**;Windsurf 要先问;Cursor 最宽松但也没明确许可。
**文字如实说「支持 Cursor」安全(指名性使用),贴 logo 不安全,把 logo 改成单色也不安全。**
完整来源清单在 `docs/DESIGN_MCP_ECOSYSTEM.md` §8,**会过期,下次动这块前重查**。

### 7.5 官网现有骨架(advice 要大改,但改之前得知道现状)

开头 → 那两分钟 → demo → 这说的是不是你 → 你需要学的东西:没有 → 怎么用 →
三个承诺 → 应用本身 → 它每周都在变强 → MCP + 客户端阵容 → 隐私 → 这东西谁做的 → 标志 → 下载。

本窗顺带修掉的老 bug:`#mcp .shot` 与 `.pack-shot` 的 `max-width` 盖过了通用的 `100%`,
390px 下整页横向滚动到 856px。已改成 `min(…, 100%)`。
**以后再给 `.shot` 加特例宽度,记得套 `min(…, 100%)`。**

---

## 8. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。提交后自检:
   `git log -1 --pretty=%B | grep -iE 'co-authored-by|🤖|generated with|noreply@'` 必须为空。
   (⚠️ **别 grep `claude` / `anthropic`** —— 第三方品牌名属于产品内容,必然误报。)
2. 绝不添加 LICENSE(Ocean 未定,见 §2 第 7 条);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;每次合成输入前重新定位窗口边界。
   ⚠️ `npm run tauri dev` 走真库路径,别为了看一眼文案就跑它。
4. i18n:**中文即键**;新 GUI 文案同步补 EN。**官网文案要大白话,中文是重写不是翻译**(§6)。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main 会触发 `pages.yml` 自动部署官网 —— **现在有四个提交待推,Ocean 说等他审完。**
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
