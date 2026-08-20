# 下载量看板 —— 怎么用，数字什么意思

> **起点：2026-08-20，累计 32 次下载。** 这是第一个快照，在这之前没有任何历史。
>
> ⚠️⚠️ **2026-08-20 更正（Ocean 本人）：这 32 次全部是他自己测试下载的。真实外部下载 = 0。**
> **32 是噪声底，不是起点。** 从今天起超出自测的那部分才是信号。
> 别拿这批数字算平台分布、算比例、算「有多少老用户」—— 那都是在算他自己。
> GitHub 只报累计总数、不保留历史曲线，所以「每天新增多少」这条线从今天开始才有。

---

## 1. 每天怎么跑（已经装好了，不用管）

一个 launchd 定时任务，**每天 09:30 自动跑**，装在这台机器上：

```bash
bash scripts/metrics-install-daily.sh          # 装 / 重装
bash scripts/metrics-install-daily.sh remove   # 卸掉
launchctl kickstart gui/$(id -u)/org.spoolapp.metrics.daily   # 立刻跑一次
```

**笔记本合着盖过夜也不会丢**：`StartCalendarInterval` 在错过的时刻会在下次唤醒时补跑。
就算真漏了一天也不算丢——GitHub 那个计数是累计的，下一次读数会把这段并进来，
看板上那根柱子会写成 `+7 / 2d`，告诉你它盖了几天。

## 2. 自己看的时候

```bash
node scripts/metrics-dashboard.mjs
open docs/metrics/dashboard.html
```

看板是**本地一个 HTML 文件**，不部署、不上线、不联网——只有你自己看
（2026-08-20 你定的：「看板给谁看？我自己看」）。

## 3. 「一个下载」怎么算 —— 四个数相加

**你定的口径（2026-08-20）：把所有资产的下载数全部相加。**

每次发布有四个资产，同一份字节挂了两个名字：

| 名字 | 谁在用 |
|---|---|
| `Spool_0.6.1_aarch64.dmg` / `Spool_0.6.1_x64-setup.exe` | 带版本号，发布页上的 |
| `Spool-macOS-arm64.dmg` / `Spool-windows-x64-setup.exe` | 固定名，**官网下载按钮走的是这两个** |

`BACKLOG-2026-08-19.md` §1.1 当时担心「四个全加会双算」。**实际上不会**：
一个人装 app 只会点其中一个链接，四个数加起来算的是**链接被点了几次**，不是人头。
所以这个口径是对的，照做。

⚠️ 但它**不是**「有多少人在用」。它数的是下载动作：同一个人换机器再下一次算两次，
下了不装也算一次。想知道有多少人真的在用，下载量回答不了——那要另外的东西，而那件事
会撞零出网红线（见 `WORKPLAN-2026-08-20.md`）。

## 4. 数据存在哪，为什么不在这个仓库里

**存在 `~/Library/Application Support/spool-metrics/downloads.csv`。**

这不是随便选的位置，是被 macOS 逼的：

> 这个仓库在 `~/Desktop` 下面，而 **Desktop 是 TCC 保护目录**。launchd 定时任务没有
> 界面会话，弹不出授权框，所以它只要碰一下 Desktop —— 哪怕只是**读取那个脚本文件**，
> 或者只是被设了一个在 Desktop 下的 `WorkingDirectory` —— 就会**永远卡死在 `getcwd()` 里**，
> 没有报错、没有日志、`launchctl` 只显示 `state = running`。
>
> **2026-08-20 用三个 launchd 探针实测确认：**
>
> | 探针 | 脚本位置 | WorkingDirectory | 结果 |
> |---|---|---|---|
> | A | Desktop 外 | **Desktop 仓库** | ⛔ 卡死 |
> | B | Desktop 外 | 不设 | ✅ 退出码 0 |
> | C | **Desktop 仓库内** | 不设 | ⛔ 卡死 |
>
> 所以定时任务碰的每一样东西都在 Desktop 外面：`metrics-install-daily.sh` 会把
> `metrics-snapshot.mjs` **复制**一份到存储目录，定时任务跑的是那一份。
> **改了 `scripts/metrics-snapshot.mjs` 之后要重跑一次安装脚本**，那份副本才会更新。

**仓库里那份 `docs/metrics/downloads.csv` 是镜像**，每次跑 `metrics-dashboard.mjs`
时从存储目录单向复制过来，为的是 git 里也有一份可以提交、能备份。
方向只有一个（存储 → 仓库），因为定时任务够不着仓库，存储那份永远是新的。

## 5. 还有一个坑：`gh` 用不了

第一版用 `gh api` 取数，**在定时任务里同样会卡死**：`gh` 的 token 存在 macOS 钥匙串里，
后台任务访问钥匙串会等一个没人能点的授权框。

现在改成**直接用不带鉴权的 HTTPS 打公开 API**（发布信息本来就是公开的，不需要 token）。
未鉴权限额是每小时 60 次，这里一天用 1 次。**不要「优化」回 `gh`。**

## 6. 文件清单

| 文件 | 干什么 |
|---|---|
| `scripts/metrics-snapshot.mjs` | 取数、按天存一行；同一天重复跑是覆盖，不是追加 |
| `scripts/metrics-dashboard.mjs` | 生成 `docs/metrics/dashboard.html`，顺便把 CSV 镜像回仓库 |
| `scripts/metrics-install-daily.sh` | 装/卸每天 09:30 的定时任务 |
| `~/Library/Application Support/spool-metrics/downloads.csv` | **真数据** |
| `~/Library/Application Support/spool-metrics/snapshot.log` | 定时任务的日志，出问题先看这个 |
