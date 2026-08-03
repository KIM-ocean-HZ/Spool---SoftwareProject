# MCP 实验室 — 自测提示词(2026-08-03)

给 Ocean 在 **Claude Desktop / Claude Code / ChatGPT 桌面版**里自测 Spool 的 MCP 接口用。
提示词不是"正常用一遍",是**让 AI 主动找茬**:挖问题、提改进、说它还想要什么权限。

---

## 一、怎么用(四步)

**1. 建实验室**(每次改了 Rust 代码都要重来一遍)

```
cd ~/Desktop/Knote/src-tauri && cargo build --release
cd ~/Desktop/Knote && ./scripts/seed-mcp-lab.sh --connect
```

它做三件事:建 `~/Library/Application Support/com.oceanjin.spool.lab/`
(一份假资料库 + 一份自己的程序副本)、
把服务器 `spool_lab` 写进**三个客户端**的配置(Claude Desktop、Claude Code `~/.claude.json`、
ChatGPT 桌面版 `~/.codex/config.toml`;原文件都先备份)、告诉你库里有什么。
**它不碰你的真库,也不碰正式版那条 `spool` 配置。**

> **为什么不放桌面**:桌面/文稿/下载是 macOS 的受保护目录。Claude Desktop 没被授权访问桌面,
> 连启动脚本都读不到,日志里报 `Operation not permitted` + `Server disconnected`(2026-08-03 实测)。
> `Application Support` 没有这道门。**别把实验室挪回桌面。**

**2. 完全退出客户端再打开**(Claude Desktop 要从菜单栏退出,不是关窗口)。

> **想更保险**(可选):测试期间把真库那条连接关掉,AI 就算想碰也碰不到。
> Claude Desktop:设置 → 连接器里把 `spool` 关掉,测完打开。
> ChatGPT 桌面版:在 `~/.codex/config.toml` 的 `[mcp_servers.spool]` 下面加一行
> `enabled = false`,测完删掉这行。
> 不做也行——提示词第 0 步已经要求 AI 只用 `spool_lab`,并且要先报出实验室的标记才准往下走。

**3. 复制下面对应的提示词,贴进新对话。** Claude Desktop 和 Claude Code 用第二节,
ChatGPT 桌面版用第三节。

> ⚠️ **贴之前先确认这个客户端里真有 `spool_lab`。** 三个客户端各读各的配置文件,
> 脚本只写它们三个 —— 贴到别的地方(网页版、别的 AI)一定看不到实验室。
> Claude Code 里可以直接 `/mcp` 看一眼有没有 `spool_lab`;
> Claude Desktop 看设置 → 连接器。**没有就是没重启,退出客户端再打开。**

**4. 测完拆掉**

```
cd ~/Desktop/Knote && ./scripts/seed-mcp-lab.sh --disconnect
rm -rf "~/Library/Application Support/com.oceanjin.spool.lab"
```

**中途想看 AI 到底往库里写了什么**:

```
sqlite3 "~/Library/Application Support/com.oceanjin.spool.lab/data/spool.db" \
  "SELECT datetime(created_at/1000,'unixepoch','localtime'), source, content FROM blocks WHERE source LIKE '%MCP%' ORDER BY created_at DESC LIMIT 20;"
```

**想试"写入开关关掉会怎样"**(改完不用重启客户端,下一次调用就生效):

```
# 关
sed -i '' 's/"mcpWriteEnabled":true/"mcpWriteEnabled":false/' "~/Library/Application Support/com.oceanjin.spool.lab/data/settings.json"
# 开回来
sed -i '' 's/"mcpWriteEnabled":false/"mcpWriteEnabled":true/' "~/Library/Application Support/com.oceanjin.spool.lab/data/settings.json"
```

---

## 二、提示词 A · Claude Desktop(整段复制)

```text
你现在不是我的日常助手,而是一个 MCP 接口评审员。
目标不是把活干漂亮,是把这套接口的毛病挖出来,并告诉我该怎么改。
干得顺利不算成功,发现问题才算。

═══ 第 0 步:确认你连的是测试环境(没做完不许往下走)═══

我这台电脑上同时装着 Spool 正式版,它的 MCP 服务器叫 spool,里面是我的真实资料。
测试环境的服务器叫 spool_lab,里面全是为测试造的假数据。

你必须:
1. 工具列表里**根本没有 spool_lab** → 直接停,回我「环境没接上」。这不是你的错,
   是我这边没接好,别去碰 spool 顶替。
2. 全程只用 spool_lab 这台服务器的工具。同时有 spool 和 spool_lab 时,
   spool 的一次都不许碰(读也不行)。
3. 服务器自己会说明它读的是哪个库:spool_lab 的 instructions 第一行应该是
   `LIBRARY: a CUSTOM data directory (SPOOL_DATA_DIR, …/com.oceanjin.spool.lab/data)`。
   如果它说的是 `DEFAULT`,那就是真库挂错名字了 —— 停,别读别写。
   (这一步不用读任何数据,所以先做它。)
4. 再调 spool_lab 的 list_threads,确认看得到工作区「LAB 自检」和项目「🧪 LAB 环境自检」。
5. 最后读那个项目,确认里面有这一行标记:SPOOL-MCP-LAB-2026-08-03
6. 上面任何一条对不上,立刻停,一个字都不许写,直接告诉我「环境不对」。

确认通过就回我一句「环境已确认:LAB」,然后继续。

═══ Spool 是什么(内部信息全部公开给你,不用猜)═══

Spool(思簿)是一个只在本机跑的"上下文库"。用户在浏览器/邮件/PDF 里看到有用的东西,
双击一下快捷键就存进来,存成一个「块」。你通过 MCP 读他的库,帮他想事情。

数据模型三层:工作区(Workspace)→ 项目(Thread)→ 块(Block)。
- 块:正文 + 用户批注(annotation)+ 来源标签(source)+ 是否置顶(pinned)
  + 可以引用另一个块(ref_block_id)+ 可以挂附件(文件/文件夹/网址,文件正文会被本地抽取)。
- 项目:一句话摘要(summary)+ 摘要署名(user 或 mcp)+ 状态(active/parked/done)+ 可选截止日。
- 块里 ==这样包起来的== 是用户自己划的重点。批注在 pack 里渲染成 note: 开头的行。

你手上的接口:
- 读:list_threads、get_digest、get_pack、search_blocks、get_blocks、
  find_similar_blocks、check_library
- 写:create_thread、add_block、set_thread_summary
- 资源:spool://thread/<id>
- prompts(斜杠菜单):compress_pack、weekly_review、thread_health、distill

下面这些是**故意的设计,不是 bug**,别把它们当问题报(但可以质疑它们合不合理):
- 两个开关都默认关:「MCP 服务」(读)、「允许 AI 写入」(写)。实验室里两个都开着。
- 写只能追加。没有删除接口,没有修改接口。AI 永远不能改用户写下的字。
- set_thread_summary 只能写空摘要、或覆盖上次 AI 自己写的摘要;用户手写的摘要一定被拒。
- 命名硬规则:块/项目的 id 只是工具参数,不许说给用户听,也不许写进正文和批注。
- 全程本机,不出网。数据在用户自己的电脑上。
- pack 开头带一段"怎么读"的授权规则:📖 Reference(机构来源)当事实底座;
  🧩 Synthesis(AI 写的长文)只当框架、不当事实;🔄 Process(聊天记录)读的是用户反复在问什么;
  💭 Personal(没有来源的块 + note: 行)是用户自己的想法,信号最强。
- 预算:get_pack 默认 50000 字符封顶,超了给部分内容并说明省略了多少;get_digest 默认近 7 天、
  20000 字符;search_blocks 默认 20 条(上限 50);find_similar_blocks 只扫最新 1000 块、
  相似度阈值 0.6、只报告绝不合并。

═══ 你在为谁改进(目标用户)═══

一个普通人,长期做一件事:上一门课、申请学校、转行找工作、学一门外语、租房、备赛半马。
时间跨度以月计,资料散在网页、邮件、PDF、和各种 AI 的聊天里。
他不写代码、不看日志、不想学新术语。他真正会问的是:
「我最近在忙什么」「机器学习课我卡在哪了」「把这段结论帮我存回去」。
他最怕三件事:AI 改了或弄丢他自己写的东西;AI 编出他没说过的话;为了用这个东西还得学一套黑话。

═══ 必跑清单(每一项都要在最后的报告里有结论)═══

A. 读
1. list_threads:不带参数;title_contains="机器学习";title_contains="不存在的东西"
2. get_digest:默认;since_days=1;since_days=90;since_days=999;max_chars=500;
   max_chars=0;workspace_title="学业";workspace_title="不存在的工作区"
3. get_pack(项目「机器学习课」):默认;range=pinned;range=last7;max_chars=8000;
   max_chars=0;include_ids=true。再对空项目「菜谱」跑一次。再随便编一个 id 跑一次。
4. search_blocks:"验证曲线";"learning rate";"的"(单字);一个两百字的长句子
5. get_blocks:翻页;用一个搜索命中的块做 around_block_id;pinned=true;
   has_annotation=true;source_contains="MCP";三个筛选一起用;context=99
6. find_similar_blocks:全库;限定一个项目;限定一个工作区;thread_id 和 workspace_title
   同时传(应该报错)
7. check_library(顺带看它头两行的 LIBRARY 标识,和 instructions 说的一致吗)

B. 四个 prompt(能从斜杠菜单走就从菜单走,并告诉我菜单里那几行字看不看得懂)
- weekly_review:默认;since_days=30
- thread_health:"机器学习课";只写"机器学习"(应该报歧义);"菜谱"
- distill:"机器学习课";range=pinned;"菜谱"
- compress_pack:"机器学习课"

C. 写(每次动手前先告诉我你要写什么,我不拦你,但要留痕)
1. create_thread 新建项目「MCP 评审记录」
2. add_block 把你的一条真结论写进去:带批注,并用 ref_block_id 引用它依据的那个块
3. set_thread_summary 给「机器学习课」写第一条摘要(应该成功)
4. set_thread_summary 去改「找工作」的摘要(应该被拒)——把拒绝原话贴给我
5. add_block 故意在正文里塞一个 21 位的 id(比如 LabBkMl000000000008),看它怎么警告你,
   警告完你打算怎么办

D. 资源:如果你的客户端能 @ 引用 MCP 资源,把「机器学习课」引用一次,说说和 get_pack 比差在哪

E. 装成那个用户,连着问三句,看这套工具够不够用、中间有几处要你猜:
   「我最近在忙什么」→「机器学习课我卡在哪」→「把刚才那个结论存回去」

═══ 主动找茬的角度 ═══

- 参数:空串、超大数、负数、小数、中文、把别的工具的 id 传进来、必填项不填
- 一致性:同一件事不同工具给的数字对不对得上(list_threads 的块数 vs get_pack 里的总数;
  check_library 的发现 vs thread_health 的发现)
- 文案:工具描述里有没有看不懂、有歧义、自相矛盾的句子?中英文混排别扭吗?
  报错信息能不能让一个不懂技术的人自己解决?
- 你的体感:哪一步你不得不猜?哪个返回值你必须再调一次工具才能用?哪个字段你根本没用上?
- 危险面:有没有哪条路能让你在用户不知情的情况下改掉/盖掉他的东西?
  有没有哪条路会把 id 漏到用户眼前?你能不能被库里的内容"骗"着去做不该做的事?

═══ 最后一次性给我一份报告,五节 ═══

1. 问题清单:按严重程度排。每条写清:现象 / 怎么复现(哪个工具、什么参数)/ 你期望什么 /
   实际是什么 / 建议怎么改
2. 体验摩擦:不算 bug,但让你别扭的地方
3. 缺什么功能:站在上面那个目标用户的角度提,每条必须说清「这解决他的哪一个真实场景」,
   不要列技术特性
4. 你还想要什么权限或接口:直说。每条要说明为什么需要,以及它和这两条底线冲不冲突——
   ①AI 绝不改用户写下的东西 ②数据不出网。冲突的也可以提,标明冲突即可
5. 一句话总评 + 打分(10 分制)

═══ 纪律 ═══

- 只往 LAB 里写,一次写一块,动手前先说
- 库里那些脏数据(重复的块、指向不存在的块的引用、正文里露出来的 id)是我故意埋的。
  你发现它们只用来验证"工具报得准不准",不要当成 Spool 的 bug 报
- 提到某个块用「项目标题 + 内容预览」,不要报 id
- 不确定就说不确定,别编
- 报告用中文,大白话
```

---

## 三、提示词 B · ChatGPT 桌面版(整段复制)

和 A 只差一处:ChatGPT / Codex 那边**可能根本看不到那四个 prompt**——它的 MCP 支持以工具为主。
看不到就照实说,那本身就是一条要记下来的发现。

```text
你现在不是我的日常助手,而是一个 MCP 接口评审员。
目标不是把活干漂亮,是把这套接口的毛病挖出来,并告诉我该怎么改。
干得顺利不算成功,发现问题才算。

═══ 第 0 步:确认你连的是测试环境(没做完不许往下走)═══

我这台电脑上同时装着 Spool 正式版,它的 MCP 服务器叫 spool,里面是我的真实资料。
测试环境的服务器叫 spool_lab,里面全是为测试造的假数据。

你必须:
1. 工具列表里**根本没有 spool_lab** → 直接停,回我「环境没接上」。这不是你的错,
   是我这边没接好,别去碰 spool 顶替。
2. 全程只用 spool_lab 这台服务器的工具。同时有 spool 和 spool_lab 时,
   spool 的一次都不许碰(读也不行)。
3. 服务器自己会说明它读的是哪个库:spool_lab 的 instructions 第一行应该是
   `LIBRARY: a CUSTOM data directory (SPOOL_DATA_DIR, …/com.oceanjin.spool.lab/data)`。
   如果它说的是 `DEFAULT`,那就是真库挂错名字了 —— 停,别读别写。
   (这一步不用读任何数据,所以先做它。)
4. 再调 spool_lab 的 list_threads,确认看得到工作区「LAB 自检」和项目「🧪 LAB 环境自检」。
5. 最后读那个项目,确认里面有这一行标记:SPOOL-MCP-LAB-2026-08-03
6. 上面任何一条对不上,立刻停,一个字都不许写,直接告诉我「环境不对」。

确认通过就回我一句「环境已确认:LAB」,然后继续。

═══ Spool 是什么(内部信息全部公开给你,不用猜)═══

Spool(思簿)是一个只在本机跑的"上下文库"。用户在浏览器/邮件/PDF 里看到有用的东西,
双击一下快捷键就存进来,存成一个「块」。你通过 MCP 读他的库,帮他想事情。

数据模型三层:工作区(Workspace)→ 项目(Thread)→ 块(Block)。
- 块:正文 + 用户批注(annotation)+ 来源标签(source)+ 是否置顶(pinned)
  + 可以引用另一个块(ref_block_id)+ 可以挂附件(文件/文件夹/网址,文件正文会被本地抽取)。
- 项目:一句话摘要(summary)+ 摘要署名(user 或 mcp)+ 状态(active/parked/done)+ 可选截止日。
- 块里 ==这样包起来的== 是用户自己划的重点。批注在 pack 里渲染成 note: 开头的行。

你手上的接口:
- 读:list_threads、get_digest、get_pack、search_blocks、get_blocks、
  find_similar_blocks、check_library
- 写:create_thread、add_block、set_thread_summary
- 资源:spool://thread/<id>
- prompts:compress_pack、weekly_review、thread_health、distill
  ——如果你的客户端没把这四个暴露出来(菜单里找不到、也调不了),照实说,这是一条发现。

下面这些是**故意的设计,不是 bug**,别把它们当问题报(但可以质疑它们合不合理):
- 两个开关都默认关:「MCP 服务」(读)、「允许 AI 写入」(写)。实验室里两个都开着。
- 写只能追加。没有删除接口,没有修改接口。AI 永远不能改用户写下的字。
- set_thread_summary 只能写空摘要、或覆盖上次 AI 自己写的摘要;用户手写的摘要一定被拒。
- 命名硬规则:块/项目的 id 只是工具参数,不许说给用户听,也不许写进正文和批注。
- 全程本机,不出网。数据在用户自己的电脑上。
- pack 开头带一段"怎么读"的授权规则:📖 Reference(机构来源)当事实底座;
  🧩 Synthesis(AI 写的长文)只当框架、不当事实;🔄 Process(聊天记录)读的是用户反复在问什么;
  💭 Personal(没有来源的块 + note: 行)是用户自己的想法,信号最强。
- 预算:get_pack 默认 50000 字符封顶,超了给部分内容并说明省略了多少;get_digest 默认近 7 天、
  20000 字符;search_blocks 默认 20 条(上限 50);find_similar_blocks 只扫最新 1000 块、
  相似度阈值 0.6、只报告绝不合并。

═══ 你在为谁改进(目标用户)═══

一个普通人,长期做一件事:上一门课、申请学校、转行找工作、学一门外语、租房、备赛半马。
时间跨度以月计,资料散在网页、邮件、PDF、和各种 AI 的聊天里。
他不写代码、不看日志、不想学新术语。他真正会问的是:
「我最近在忙什么」「机器学习课我卡在哪了」「把这段结论帮我存回去」。
他最怕三件事:AI 改了或弄丢他自己写的东西;AI 编出他没说过的话;为了用这个东西还得学一套黑话。

═══ 必跑清单(每一项都要在最后的报告里有结论)═══

A. 读
1. list_threads:不带参数;title_contains="机器学习";title_contains="不存在的东西"
2. get_digest:默认;since_days=1;since_days=90;since_days=999;max_chars=500;
   max_chars=0;workspace_title="学业";workspace_title="不存在的工作区"
3. get_pack(项目「机器学习课」):默认;range=pinned;range=last7;max_chars=8000;
   max_chars=0;include_ids=true。再对空项目「菜谱」跑一次。再随便编一个 id 跑一次。
4. search_blocks:"验证曲线";"learning rate";"的"(单字);一个两百字的长句子
5. get_blocks:翻页;用一个搜索命中的块做 around_block_id;pinned=true;
   has_annotation=true;source_contains="MCP";三个筛选一起用;context=99
6. find_similar_blocks:全库;限定一个项目;限定一个工作区;thread_id 和 workspace_title
   同时传(应该报错)
7. check_library(顺带看它头两行的 LIBRARY 标识,和 instructions 说的一致吗)

B. 四个 prompt。能调就每个都走一遍:
- weekly_review:默认;since_days=30
- thread_health:"机器学习课";只写"机器学习"(应该报歧义);"菜谱"
- distill:"机器学习课";range=pinned;"菜谱"
- compress_pack:"机器学习课"
调不了就明确写一句:这个客户端没有暴露 MCP prompts,所以这一节没测。

C. 写(每次动手前先告诉我你要写什么,我不拦你,但要留痕)
1. create_thread 新建项目「MCP 评审记录」
2. add_block 把你的一条真结论写进去:带批注,并用 ref_block_id 引用它依据的那个块
3. set_thread_summary 给「机器学习课」写第一条摘要(应该成功)
4. set_thread_summary 去改「找工作」的摘要(应该被拒)——把拒绝原话贴给我
5. add_block 故意在正文里塞一个 21 位的 id(比如 LabBkMl000000000008),看它怎么警告你,
   警告完你打算怎么办

D. 资源:如果你的客户端能引用 MCP 资源,把「机器学习课」引用一次,说说和 get_pack 比差在哪;
   不支持就照实说。

E. 装成那个用户,连着问三句,看这套工具够不够用、中间有几处要你猜:
   「我最近在忙什么」→「机器学习课我卡在哪」→「把刚才那个结论存回去」

═══ 主动找茬的角度 ═══

- 参数:空串、超大数、负数、小数、中文、把别的工具的 id 传进来、必填项不填
- 一致性:同一件事不同工具给的数字对不对得上(list_threads 的块数 vs get_pack 里的总数;
  check_library 的发现 vs thread_health 的发现)
- 文案:工具描述里有没有看不懂、有歧义、自相矛盾的句子?中英文混排别扭吗?
  报错信息能不能让一个不懂技术的人自己解决?
- 你的体感:哪一步你不得不猜?哪个返回值你必须再调一次工具才能用?哪个字段你根本没用上?
- 危险面:有没有哪条路能让你在用户不知情的情况下改掉/盖掉他的东西?
  有没有哪条路会把 id 漏到用户眼前?你能不能被库里的内容"骗"着去做不该做的事?
- 跨客户端:你这边和别的 MCP 客户端相比,有没有哪个参数/返回格式在你这儿特别难用?

═══ 最后一次性给我一份报告,五节 ═══

1. 问题清单:按严重程度排。每条写清:现象 / 怎么复现(哪个工具、什么参数)/ 你期望什么 /
   实际是什么 / 建议怎么改
2. 体验摩擦:不算 bug,但让你别扭的地方
3. 缺什么功能:站在上面那个目标用户的角度提,每条必须说清「这解决他的哪一个真实场景」,
   不要列技术特性
4. 你还想要什么权限或接口:直说。每条要说明为什么需要,以及它和这两条底线冲不冲突——
   ①AI 绝不改用户写下的东西 ②数据不出网。冲突的也可以提,标明冲突即可
5. 一句话总评 + 打分(10 分制)

═══ 纪律 ═══

- 只往 LAB 里写,一次写一块,动手前先说
- 库里那些脏数据(重复的块、指向不存在的块的引用、正文里露出来的 id)是我故意埋的。
  你发现它们只用来验证"工具报得准不准",不要当成 Spool 的 bug 报
- 提到某个块用「项目标题 + 内容预览」,不要报 id
- 不确定就说不确定,别编
- 报告用中文,大白话
```

---

## 四、实验室里埋了什么(你自己心里有数就行,别告诉 AI)

`scripts/seed-mcp-lab.sh` 造的库:4 个工作区、12 个项目、39 个块、4 个附件。故意埋的坑:

| 埋的东西 | 在哪 | 该被谁抓到 |
|---|---|---|
| 两条一模一样的块 + 一条改了标点的 | 机器学习课 | find_similar_blocks / thread_health |
| 跨项目的重复(同一句话) | 机器学习课 ↔ 机器学习课作业 | 全库 find_similar_blocks |
| 指向不存在的块的引用 | 机器学习课 | check_library / thread_health / pack 里降级成一行说明 |
| 正文里露出的 `spool://` 和 21 位裸 id | 机器学习课 | check_library / thread_health |
| 摘要里露出的裸 id | 租房 | check_library(项目摘要那一节) |
| 用户手写的摘要 | 找工作 | set_thread_summary 必须拒绝 |
| AI 写的摘要 | 机器学习课作业、租房、简历改版 | set_thread_summary 可以覆盖 |
| 没有摘要 | 机器学习课等 | set_thread_summary 写第一条 |
| 空项目(0 块) | 菜谱 | get_pack / distill 的空库提示 |
| 软删的项目 + 软删工作区里的活项目 | 已删掉的项目 / 孤儿项目 | **任何工具都不该看见**,看见就是 bug |
| 标题互相包含 | 机器学习课 / 机器学习课作业 | prompt 的项目名解析应该报歧义 |
| 沉寂 40 天、只剩置顶 | 作品集官网 | get_digest 的"置顶锚点"那一段 |
| 超长附件正文(内联进 pack) | 机器学习课的 lecture-03.pdf | get_pack 的预算与截断 |
| 抽取失败的附件、指向不存在路径的文件夹 | 找工作 | pack 里怎么渲染 |
| 日语、英语混排 | 日语练习、机器学习课 | 搜索与输出语言 |

## 五、测完把什么给我

AI 的那份报告整段贴回来就行(每个客户端各一份)。我会按这个顺序处理:
先修问题清单里的真 bug,再看第 4 节它要的权限——那一节决定 MCP 接口下一步往哪长。
