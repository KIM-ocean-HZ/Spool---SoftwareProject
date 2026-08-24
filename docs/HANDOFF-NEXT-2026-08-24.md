# 下一窗交接（2026-08-24 傍晚重写）

> **一句话**：**v0.6.2 发出去了**，B 批整批空了。
> ⭐ 挡在「渠道」前面的东西没有了 —— 顺序上下一件就是渠道。

---

## 1. 发布回执（⛔ 别再重发，也别重打包）

| 项 | 值 |
|---|---|
| tag | `v0.6.2` → `58ec01f`（已推，`origin/main` 已同步） |
| 产物 | `Spool_0.6.2_aarch64.dmg`，**10,390,759 字节** |
| sha256 | `fc74abee8f3c1084d70a885ccdd79520cb200a266b349536c3ad3fb12d992899` |
| 签名 | `Developer ID Application: Hanze JIN (Q5Y5JRXZ58)`，hardened runtime，带时间戳 |
| 公证 | **两个产物都 `accepted` · `source=Notarized Developer ID`** |
| `.dmg` submission | `64c13142-db18-43fc-b208-0a2df177d309` · Accepted |
| 固定名 URL | `releases/latest/download/Spool-macOS-arm64.dmg` 实测 **200**，**下载回来那一份 sha256 相同、staple 还在** |
| 库版本 | **v23 → v24**（`blocks` 加两个可空列，加法式迁移） |
| Windows | ⛔ **这一版没发**（Ocean 08-24 明说只发 macOS） |

全稿在 `CASE_STUDY_LEDGER.md` §1.2，发布说明在 `docs/RELEASE_NOTES_v0.6.2.md`。

---

## 2. ⛔ 发布留下的三件尾巴（都很小，但别忘）

| # | 是什么 | 怎么做 |
|---|---|---|
| **①** | **`.app` 那次的 submission id 没截住** —— 打包跑在终端里，滚屏没留。台账 §1.2 里那一格现在是**标记，不是数字** | `xcrun notarytool history --apple-id … --password … --team-id …`，Apple 还留着就能捞回来。⚠️ 捞到直接填进 §1.2，别编 |
| **②** | **`RELEASE.md` §3 那张验收单没走完** —— 「全新机器装 dmg 首启建库」「双击 ⌥ 授权」那几条 | ⛔ 只有真手指做得了。⚠️ 已经发出去了，所以这是**发后复核**，撞到问题就是 0.6.3 |
| **③** | ✅ **已经换装了**（2026-08-24 16:12，见 §2-bis） | —— |

---

## 2-bis. ✅ `/Applications` 已经换成 v0.6.2 正式版（2026-08-24 16:12）

⚠️ **上一版交接里「装的是 `Spool Dev` 签的 dev build」那句是错的** —— 实测
`codesign -dvv /Applications/Spool.app` 报的一直是 `Developer ID`。**签名身份从头到尾没变**，
所以这次换装 **TCC 授权一条都没掉**（启动 stderr 打的是
`[double-tap] installed at HID/active`，按 §6-bis 这一行就等于两个授权都在）。

| 核了什么 | 结果 |
|---|---|
| identifier | `com.oceanjin.spool`（⛔ 不是 `.verify`，§21 ① 那个坑） |
| 版本 | `0.6.2` |
| 签名 | `Developer ID Application: Hanze JIN (Q5Y5JRXZ58)`，`--verify --deep --strict` 通过 |
| `spctl` | ⭐ **`source=Notarized Developer ID`** —— 这是 §33 里唯一分得出「dev build / 真发布版」的那一条，现在是发布版 |
| **真库** | ⭐ **一个字没动**：`user_version 24`、`integrity_check ok`、五张表逐项一致（21/52/250/1/11）、**250 块正文哈希相同**（`7ddb5b19d0609ed1`）。⛔ 没有新的迁移快照 —— v24→v24 本来就不该跑迁移 |
| 新二进制 | 探针进程验过（§34）：`serverInfo` 报 `0.6.2`，**20 个工具**，`get_block_original` 在，**没有一个缺 `annotations`** |
| `--mcp` 子进程 | **32 个一个没杀**（换 bundle 不打断在跑的进程）。⚠️ 但它们跑的**仍然是旧二进制** —— 每个 AI 客户端要吃到新的都得各自 ⌘Q 重开 |

**留下的两份退路**：库备份 `spool.before-v062-install-20260824-161251.db`；
旧包 `/Applications/Spool.app.pre-v062-20260824-161251` 和
`~/Desktop/Spool-old-20260824-161251-pre-v062-devbuild.app`。⚠️ 确认几天没问题再删。

⚠️ **一个新发现**：从 dmg `ditto` 出来的 bundle 权限是 **owner-only**（`drwx------`），
和原来装的 `drwxr-xr-x` 不一样。已经 `chmod -R go+rX` 归正，**签名没被破坏**
（`--verify --deep --strict` 复跑通过）。⛔ 下次换装记得再看一眼。

---

## 3. 这一窗改的产品代码（就一处）

`d312bef` —— 睡前排队那一格的三条，Ocean 真手指验收之后提的：

1. **时间看不出来能改** → 「几点跑 [扁框]」换成「几点开始 [下拉]:[下拉] 24 小时制」
2. ⛔ **点 01:55 存成 13:55** —— `<input type="time">` 显示 12 还是 24 小时制**由系统区域决定，
   网页这边关不掉**。英文区域下框里写「01:55 PM」，`.value` 给的是 `13:55`。
   ⭐ **差别是钱**：01:55 在 DeepSeek 闲时那一档（北京 00:30–08:30 半价），13:55 是原价。
   ⛔ **别改回 `type="time"`**，理由写在 `CompressBoard.tsx` 的 `HOURS` 常量上面
3. **「今晚一起压」→「今晚自动压缩」**，底下补一行「为什么值得等到夜里」。
   ⚠️ 半价那句后面**必须跟着「换别家就看那家的价目表」** —— 端点是可以改的，
   少了后半句，界面上就多一句假话

---

## 4. ⛔ 第六轮挖出来、**仍然没修**的三条（发版前有意排在后面的）

⭐ 现在发版过去了，动 Rust 的顾虑（要重新公证）也过去了 —— **这三条可以排进去了**。

| # | 是什么 | 证据 |
|---|---|---|
| **①** | **`split_cuts` 之后没人看一眼正文空不空** —— 撞到一次 `ok=true` 配 **0 字节**压缩稿 | §8.15。`worthRetrying` 接住了，**但信封是假的** |
| **②** | **失败信封不带用量** —— `Envelope::Err` 只有 `ok`/`kind`/`message`/`status`。「已经跑出去的那一段照样算钱」那句护栏**至今拿不到证据** | §8.7。那一夜 8 次失败全记 ¥0，所以 ¥2.92 是**下限** |
| **③** | **实测台重编一次就要重新授权一次**，而授权框**锁屏状态下弹不出来** | §8.16。那一夜因此丢了八小时 |

①② 各一处判断 / 一个结构体加字段。③ 的做法写在 §5。

---

## 5. ⛔ 下次做连夜实测之前必读

**钥匙串 ACL 按二进制认，`cargo test` 重编一次就要重新授权一次。**
而**授权框在锁屏状态下弹不出来**，`SecItemCopyMatching` 会**无限期阻塞**。

| 空计划耗时 | 什么意思 |
|---|---|
| **~0.8s** | 已授权过，正常 |
| **~10–75s，屏幕上没有框** | 刚重编过，系统在重新验签。⭐ **正常，等着就好** |
| **几百秒过不去** | ⛔ **屏幕锁了** |

```bash
ioreg -n Root -d1 -r | grep -o 'CGSSessionScreenIsLocked[^,]*'   # = Yes 就是它
```

⭐ **做法**：跑之前一次性把代码改完编完，当着人的面跑一次空计划把授权拿到，
之后整夜一行 Rust 都不要再改。（全稿在记忆 `isolated-verify-workflow` §35。）

---

## 6. 顺序上下一件是什么

`A` → `D` → `T` → `B 发版` ✅ → **`渠道`** → `E` → `F`

**渠道**那一批（`WORKPLAN §渠道`）的前提是「A 批 + B 批全做完」—— **现在成立了**。
✅ **官网也部署过了**（`Deploy site` 2026-08-24 08:05Z，跟着这次推送触发的，success）。
实测复核：`No key` / `nowhere in Spool to put one` / `never sends data anywhere on its own` /
`zero built-in AI` **在线上一条都搜不到了**，新说法 `subprocess, with a key you supplied` 在。
⭐ **B0 那批假话彻底下线了 —— 渠道可以往官网指了。**

**零成本随时插的**：`C 批`五条（`C-a` 重扫 `scope_limited` · `C-b` Safety 纸面复核 ·
`C-c` 零提示那条路 · `C-d` 文档五处 · `C-e` 主窗尺寸验收②）。

**`F 批`（事件层）动之前仍然卡在一件要你拍的事上**：**event 存哪儿**。
三个选项连好处/代价写在 `WORKPLAN §2.F3`。⚠️ 原来那句「⛔ 不建 `events` 表」是在
**错的前提**下写的（`C1` 的数据模型 08-24 被推翻了），要你明说推翻才算数。
⭐ **不受影响的**：`C3` · `C4` · `C5` · `C6`，以及 `C7` 的第 2 条（事件进 pack）。

---

## 7. 归档在哪

`~/Library/Application Support/spool-compress-sweep/2026-08-24-round6/`
⛔ **不进仓库**（里面是真实的选校名单、成绩、个人材料）。清单见上一版交接 §6，没变。
