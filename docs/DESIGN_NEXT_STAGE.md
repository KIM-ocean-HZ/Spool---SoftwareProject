# 设计稿 — 发布收尾 · 官网 · Portfolio · 产品下一程(2026-07-29)

> 状态:**待 Ocean 批复**。前提:Ocean 2026-07-29 拍板——公证直发(HANDOFF §2 路 A)
> 定案、**不做 MAS lite**、全力一个版本;新增两个目标:官方网站(入口+宣传)、
> 研究生申请 portfolio 素材;**沙盒规则不再是任何功能设计的过滤器**。
> 本稿依据 HANDOFF §2/§3 与该拍板撰写,批复后逐轨执行、每任务独立提交。

---

## 0. 拍板的直接影响

- HANDOFF §2 的硬冲突**解除**:发布路径 = Developer ID 公证 .dmg + GitHub Release,唯一。
- 功能设计的"MAS 沙盒能否过审"过滤器**永久移除**——CGEventTap、`macos-private-api`、
  spawn 外部二进制(→ §4.1 成为可能)、`fs:scope **` 全部保留且可继续依赖。
- 仓库实测已是 **public**(github.com/KIM-ocean-HZ/Spool---SoftwareProject),
  GitHub Release 当下载主机、GitHub Pages 当官网托管都可直接用,无需另开仓库。

## 1. 轨道一:v0.3.0 公证发布(本周;唯一硬阻塞在 Ocean 手上)

实测现状(2026-07-29):钥匙串只有 `Spool Dev` 自签证书,
**尚无 Developer ID Application 证书**;现有 dmg(07-14 产物)是 Spool Dev 签名,
不可公证分发,需要重新构建。

**Ocean 三步(只能你做,细节见 RELEASE.md §0/§1):**
1. developer.apple.com → Certificates → 创建 **Developer ID Application** 证书,
   下载双击导入。验证:`security find-identity -v -p codesigning` 多出一行 Developer ID。
2. appleid.apple.com → 登录与安全 → 生成一枚 **App 专用密码**(公证用,可随时吊销)。
3. 在**你自己的终端**里 export 四个环境变量(RELEASE.md §1)后跑
   `npm run tauri build`——密码绝不进聊天/文件/提交,故构建一步由你执行;跑完喊我。

**我接手:**`codesign -dvv` 验 Authority 是 Developer ID(不是 Spool Dev)→
`spctl -a -vv -t install` 须 `accepted · Notarized Developer ID` →
RELEASE.md §3 验收清单逐项(注意:全新库现在种**两条**教程脉络)→
tag `v0.3.0` + GitHub Release(dmg + 发布说明 + PRIVACY 链接 +
TCC 重授权说明:签名从 Spool Dev 换 Developer ID,输入监听会失效一次)。

**随发布决策(见 §6):**PRIVACY.md:45 联系邮箱、仓库改名。

## 2. 轨道二:官网(入口 + 宣传)

**定位**:下载入口 + 三句话讲清产品 + 隐私承诺公开化 + portfolio 的公开门面。

**技术选型(建议)**:纯静态 HTML/CSS,仓库内 `site/` 目录,GitHub Actions 部署到
GitHub Pages。零运行时依赖、零成本、和产品极简气质一致;内容量撑不起 SSG 框架,
也符合"新依赖需 Ocean 批准"的精神(Pages 官方部署 action 除外,属 CI 不属产品依赖)。

**信息结构(一主页 + 两子页):**
1. 首屏:logo(docs/logo 现成)+ 一句话定位 + 下载按钮 + 30 秒演示(GIF/视频)
   - 下载按钮用 `…/releases/latest/download/<固定文件名>` 形式,永远指最新版,不写死版本号
2. 三能力区:零摩擦捕捉(双击 ⌥)/ 出处保真的 pack / MCP 让 AI 长期维护你的库
3. 隐私区:本体零出网(CSP 结构性封死)、数据只在本机 SQLite → 链接 /privacy
4. `/privacy`:PRIVACY.md 渲染版(发布页要求的可访问链接就指这里)
5. `/story`:工程叙事页(与轨道三共用,见 §3)

**语言**:EN 为主(申请材料受众)、中文为辅;倾向双页面而非运行时 i18n 切换,简单。
**域名**:默认 `kim-ocean-hz.github.io/<repo>`;自定义域名(约 $10/年)可选,待拍板。

**验收**:Pages 上线可访问;下载按钮在新 Release 发出后无需改站即指向新版;
移动端排版不破;截图与 0.3.0 实际 UI 一致(RELEASE.md §3 同款要求)。

## 3. 轨道三:Portfolio(研究生申请)

产出三件,素材全部已有或随发布自然产生:

1. **工程叙事页 `/story`(EN)**:问题动机 → 设计宪法(安静原则/出处保真/本体零 AI)
   → 架构(Tauri + Rust + SQLite + MCP;跨语言 golden 锁步、digest 逐字节确定性、
   schema 迁移注册表 + 双侧锁步常量)→ **过程证据**:R2 8.5 → R5 9.8 的评审弧线、
   5/29 数据事故的复盘与之后的防护体系——事故复盘在申请材料里是少见的加分项,
   展示的是工程成熟度而非完美履历 → 截图 + 演示视频嵌入。
2. **2–3 分钟演示视频**:双击 ⌥ 捕捉 → 脉络整理 → 打包 → Claude Desktop 经 MCP
   读写回。Ocean 实机录屏(我出分镜脚本),或先用 GIF 序列顶替、视频后补。
3. **一页 PDF**(申请系统上传用):/story 配 print CSS 直接打印导出,含官网 URL,
   不引额外工具链。

## 4. 轨道四:产品升级(基于 Ocean 07-13 设想,沙盒约束解除后)

每项标注它回应设想里的哪一条。

### 4.1 Claude Code 引擎位(回应「app 内调 AI 但不花钱」+「Spool=VSCode、Claude Code=插件」)——本程旗舰

沙盒解除后,HANDOFF §3.1 的"可选增强"具备升主线的条件:检测到 `claude` CLI
(本机实测已装,2.0.50)即出现「让 AI 维护这条脉络」入口,背后
`claude -p` **headless 模式 + 挂上 Spool 自己的 MCP server**——模型经 MCP 工具
读库、写回自动带来源标签,走用户已付费的 Claude 订阅,**零 API key、零新增出网面**
(出网发生在用户已信任的 Claude Code 里,Spool 本体依旧零出网)。
这把「编辑器 + 插件」的循环**闭合进 app 内**:GUI 是策展面,CLI 是引擎,MCP 是总线。

- 首批动作三个,与 §4.2 的 prompts **同源复用**:整理去重 / 提炼结论 / 生成周回顾
- 宪法 5 不动摇:AI 绝不改用户手写内容(prompt 硬约束 + 写入面来源标签 +
  §4.3 活动面事后可审计)
- `claude` 不存在则入口**整个不渲染**——"零配置零 AI 也全功能"的叙事不受损
- 待细化的风险面:子进程超时/取消/进度 UX、首次调用的信任提示、并发写入时序
- 与 mcp-first-pivot **不冲突**:没有内置 provider、没有 key 输入面,只是委托
  用户已安装并信任的工具。批复后先出独立细化设计稿再动手(硬规则 6)。

### 4.2 MCP prompts 面(回应「长期维护」)——最省力的高杠杆

现在只有 compress_pack。加三个:`weekly_review`(拉 digest → 产出周回顾块)、
`thread_health`(查重 + 悬空 + 摘要过期,与 check_library 共用口径)、
`distill`(把一条脉络提炼成结论块)。用户在 Claude Desktop 斜杠菜单直接看到
——零学习成本的功能发现面;§4.1 的动作集直接复用,一份维护两处受益。

### 4.3 AI 活动面(回应「长期维护」的可见性)

脉络级「AI 活动」折叠区,纯读,从 source 标签 + 时间聚合。VSCode 敢让插件干活,
是因为 Source Control 面板让你**看得见**它干了什么;这也是 §4.1 的信任基础。

### 4.4 「我的思考」凸显(回应「突出用户自身的思考」)

块流「只看我写的」过滤;摘要卡片区分"我的批注 vs AI 的结论";pack 已把
`note:` 行与无来源块当最高信号(instructions 写明),GUI 补齐同一口径。

### 4.5 首日价值(回应「没信心用户长期用」)

- 捕捉满三条 → 一行安静提示"打个包试试"(遵守安静原则,不弹窗)
- 「今天读了什么」日卡:当天捕捉自动拼一张卡——本体零 AI 就能做
- README 与教程把「MCP 没配也全功能:pack 直接粘给任何网页版 AI」讲透

### 4.6 明确不做 / 暂缓

- Spool 内嵌 LLM / API key 输入面:已否决(mcp-first-pivot),不回头
- OCR 截图捕捉:07-09 随内置 AI 一并拆除;Apple Vision 本地 OCR 虽不违背零出网,
  重开需单独论证,本程不提
- 应用内自动更新(tauri-plugin-updater):新依赖需批准,发布后看用户量再议

## 5. 排期建议(批复后按此推进)

| 阶段 | 内容 | 出口 |
|------|------|------|
| 本周 | 轨道一:证书 → 公证构建 → 验收 → Release | v0.3.0 公开可下载 |
| 下周 | 轨道二官网骨架 + 轨道三 /story 初稿(EN) | Pages 上线 |
| 第三周 | §4.2 prompts + §4.4 我的思考(小而独立,先行) | v0.3.x |
| 第四周起 | §4.1 细化设计稿 → 批复 → 实现;§4.3 活动面随行 | v0.4.0 |
| 穿插 | §4.5 三小项;演示视频分镜与录制 | — |

## 6. 需 Ocean 拍板清单(按阻塞程度排序)

1. 【阻塞发布】Developer ID 证书 + App 专用密码 + 你终端跑构建(§1 三步)
2. 【阻塞发布页】PRIVACY.md:45 对外联系邮箱:建议统一 jinhz0531@gmail.com,确认?
3. 【建议随发布】仓库改名(现 `Spool---SoftwareProject` 会出现在发布页/官网/
   申请材料的所有 URL 里;GitHub 改名自动 301,本地 `git remote set-url` 即可)。
   建议 `spool` 或 `spool-app`,定名权在你
4. 官网:GitHub Pages 免费路线可以?要自定义域名吗?EN 为主 + 中文子页可以?
5. 轨道四批复:§4.1 升主线是否同意?§4.2–4.5 优先级有无调整?
6. 演示视频:你实机录(我出分镜)还是先 GIF 后补视频?
