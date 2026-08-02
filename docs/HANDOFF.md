# 交接文档 — 2026-08-02(给下一个窗口)

> 先读 CLAUDE.md 与 memory(`next-stage-goals-website-portfolio`、`write-plainly-for-ocean`、
> `spool-db-wipe-incident`、`isolated-verify-workflow`、`mcp-first-pivot`、
> `ui-language-follows-system`、`capture-note-first`、`double-tap-exclusivity`)。
> 完成后删除本文件。

---

## 0. 一句话状态

**本地已提交 `8e92776`,还没推。** 基线全绿:`npx tsc -b` / `npx vitest run`(152)。
上一批(捕捉浮窗独立进程)已推送、已换装、Ocean 真手指验收全过,那条线彻底收官。

**本窗做完的是官网这条线:MCP 生态展示 + 整站定位改写(Ocean「三档全做」)。**

**👉 下一件事,按顺序:①问 Ocean 要不要推(推 main 会自动部署官网);
②装完之后头 60 秒的首启审计;③对外动作要他明示。**

---

## 1. 本窗完成:官网改口 + MCP 阵容(`8e92776`)

两份设计稿都已批、都已落地,细节看稿子,这里只留下一个窗口要知道的:

- `docs/DESIGN_MCP_ECOSYSTEM.md` —— 批复:**方案 A(纯文字名字 + 我们自己画的中性图标)**,
  教程种子预留。
- `docs/DESIGN_SITE_PITCH.md` —— 批复:**三档全做**。稿子开头记了两处与原稿的出入。

### 1.1 商标这件事(以后动官网/README 前必看)

**2026-08-02 逐家查过官方页面,结论是六家里没有一家可以直接把 logo 摆上我们官网:**

- **Visual Studio Code 明文禁止** —— 它的「Not OK」清单里写着:用图标标识或推广你自己的
  产品/服务/应用、用图标把你的东西和微软扯上关系、改画或重绘图标。图标只有两种许可用法:
  讲 VS Code 的文档/教程/博客,以及链到 code.visualstudio.com。
  **它还禁止 `VS Code` / `vscode` 这类简写**,所以代码里现在一律写 `Visual Studio Code`。
- **Anthropic / OpenAI 要事先书面批准**(前者 marketing@anthropic.com,
  后者 partnercomms@openai.com;「Powered by OpenAI」徽章只给 API 客户,我们不是)。
- **Windsurf** 说「本页没写到的用法请带效果图来问」,**Cursor** 最宽松但也没明确许可。

⚠️ **用文字如实说「支持 Cursor」是安全的(指名性使用),贴 logo 不是。**
「把他家 logo 改成单色」也不安全 —— VS Code 那条把「重绘」一并禁了。
来源清单在 `DESIGN_MCP_ECOSYSTEM.md` §8,**会过期,下次动这块前重查**。

### 1.2 官网现在的骨架(改过顺序,别照老印象改)

开头 → **那两分钟**(原「为什么会有它」,重写并前移到 demo 之前)→ demo →
**这说的是不是你** → **你需要学的东西:没有** → 怎么用 → 三个承诺 → 应用本身 →
**它每周都在变强** → MCP(重写)+ **客户端阵容** → 隐私 → **这东西谁做的** → 标志 → 下载。

核心定位一句话:**卖「你每天都要把项目重新解释一遍」这件烦人事,不卖长期积累。**
积累出来的优势是**留存**的故事,拉新只能靠当天就能兑现的痛点 —— 所以 Hero 里
「第一个下午就能用上,不是攒够了才有用」那句是有意为之,**别顺手删掉**。

### 1.3 顺带修掉的一个老 bug

`#mcp .shot` 与 `.pack-shot` 的 `max-width` 盖过了通用的 `.shot { max-width: 100% }`,
**390px 窄屏下整页横向滚动到 856px**(改动前就有)。改成 `min(…, 100%)`,现在两种语言
都是 390 = 视口宽。**以后再给 `.shot` 加特例宽度,记得套 `min(…, 100%)`。**

---

## 2. 下一件事

### 2.1 先问 Ocean:要不要推

`8e92776` 只在本地。⚠️ **推 main 会触发 `pages.yml` 自动部署官网**(硬规则 7,要他明示)。

### 2.2 首启头 60 秒审计(我的建议:排在最前)

理由写在 `DESIGN_SITE_PITCH.md` §6 末尾:**官网把人骗进来了,如果打开 app 十分钟
还没体会到那个「哦!」的瞬间,前面全白做。** 新库会播种两条教程脉络,但首启体验
从没被系统审过。这是设计类任务,**按硬规则 6 先出方案**。

### 2.3 还欠的两笔账(都不急,但别忘)

- **app 设置页那处改动没有实机截图**。是纯文案改动、tsc 与 152 个用例都过,
  但没跑过隔离构建 —— 故意的:`npm run tauri dev` 走的是真库路径(硬规则 3 / 5-29 红线),
  为一行文案不值当。**下次任何一次隔离验证顺手看一眼折叠段就行。**
- **教程种子里的 MCP 说明还停在「一键接入 Claude Desktop / Cursor」**,实际支持六个。
  只影响新装库(5/29 红线),**留到以后和其他教程文案修订一起做**(Ocean 2026-08-02 明示预留)。

### 2.4 对外动作(全部需 Ocean 单独明示,一件都没做)

1. **MCP 官方注册表挂号**(<https://registry.modelcontextprotocol.io>)——
   投入产出比最高:那里的人本来就在找 MCP server,不用教育。
2. demo 链接单独给个短地址(它是唯一「不用装就能证明有用」的东西)。
3. Show HN / Product Hunt —— **只有一次机会**,等页面定稿且 dmg 已公证之后再说。
4. ❌ 刷好评、假装用户安利:不做。

---

## 3. 再往后(优先级不变)

1. **官网表单选型**(邮箱订阅 + 反馈)—— 静态站收表单要第三方,**选型必须 Ocean 单独批**。
2. **M1 AI 引擎**(`docs/DESIGN_AI_ENGINE.md` 已全批)—— 范围见该文 §5。
   两条约束:宪法探针是验收必测;不新增权限面。
3. **Windows 版**(排最后)。勘查结论在 `git show 8c58388:docs/HANDOFF.md` §4,
   三个待拍板点:捕捉手势替代、签名分发花钱、首版范围。
   ⚠️ 浮窗进程那次的改动是 macOS 形态(Accessory / AXFrontmost),Windows 要另想。
4. **截图重拍**:含捕捉浮窗的两张(`site/assets/shots/capture-toast.png`、
   `docs/screenshots/capture-toast.png`)。数据环境照旧 `scripts/seed-demo-library.sh`
   (写 verify 目录,不碰真库)。其余截图不受影响,别动。
   —— 如果哪天要把「它每周都在变强」那两张示意图换成真截图,也在这一轮一起做。
5. **死文件**:`src-tauri/capabilities/collect.json` 还留着,但 `collect` 窗口
   2026-07-31 删收集面板时就没了。**一直没删是因为每次都不在改动范围内**,顺手清掉即可。

---

## 4. 装机版现状(没动)

`/Applications/Spool.app` 仍是 `74b87f1`(浮窗独立进程那批),两个 TCC 授权都活着。
本窗只改了官网与设置页文案,**没有换装、没有碰真库**。
下次换装照抄 `git show a02ef42:docs/HANDOFF.md` §4.1 那套(签名身份必须一字不改)。

---

## 5. 硬规则(违反即事故)

1. git/代码/文档**绝不出现 AI 署名**。每次提交后自检:
   `git log -1 --pretty=%B | grep -iE 'co-authored-by|🤖|generated with|noreply@'` 必须为空。
   (⚠️ **别 grep `claude` / `anthropic` 这类词** —— 提交信息里出现
   「Claude Desktop / Claude Code / Anthropic」这类**第三方品牌名**属于产品内容,
   不是署名,允许;拿它们做自检必然误报。本窗就误报过一次。)
2. 绝不添加 LICENSE(Ocean 未定);新依赖需 Ocean 批准。
3. 真库动前备份;实机验证走隔离 identifier 流程;**每次合成输入前重新定位窗口边界**。
   ⚠️ `npm run tauri dev` 走真库路径,别为了看一眼文案就跑它。
4. i18n:**中文即键**(代码 key 用中文,与 UI 默认语言无关),新 GUI 文案同步补 EN。
   **官网文案要大白话**;官网中文是**重写不是翻译**。
5. 改 `assemble.ts`/`templates.ts` 输出必须 GOLDEN_WRITE=1 重生 golden 并同步 mcp.rs;
   动 schema 必须迁移注册表 + 双侧锁步常量 + 真库备份。
6. 每任务独立提交;**设计类任务先出方案交 Ocean 批复再动手**。
7. 换装/清数据/迁移等破坏性操作前核对证据链,且需 Ocean 明示。
   **对外动作(发 Release、推公开站点、去第三方注册表挂号)同样需要明示。**
   ⚠️ 推 main 会触发 `pages.yml` 自动部署官网。
8. **密钥永不落盘**:Apple 专用密码之类只当环境变量用,不写进任何文件、不进 git。
9. ⚠️ 别用 `git add -A` 一把梭,提交前先 `git status --short` 看一眼。
