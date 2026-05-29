# 数据库备份与恢复（Spool / 思簿）

本机运行手册。Spool 是 local-first 应用，**所有用户数据只在本地一个 SQLite 文件里**，不在本仓库、也不上云。把这份文档当作"数据没了怎么办"的应急指南。

## 1. 数据存放在哪

Bundle identifier：`com.oceanjin.spool`

| 文件 | 路径 | 说明 |
|---|---|---|
| 主库 | `~/Library/Application Support/com.oceanjin.spool/spool.db` | SQLite，WAL 模式 |
| WAL / SHM | 同目录 `spool.db-wal`、`spool.db-shm` | 预写日志与共享内存，**备份时三件一起拷**，否则快照可能不一致 |
| 设置 | 同目录 `settings.json` | API keys、Ollama 端点等（经 `tauri-plugin-store`） |

数据库连接串是代码里的 `sqlite:spool.db`（见 [`src/lib/db/client.ts`](../src/lib/db/client.ts)），`tauri-plugin-sql` 会把它解析到上面这个 app 配置目录。

## 2. 代码里已有的防护

`migrateSchema()`（[`src/lib/db/client.ts`](../src/lib/db/client.ts)）有两道防线：

1. **迁移前自动快照** —— 任何 `user_version` 变更前，用 `VACUUM INTO` 在同目录写一份一致性备份：`spool.pre-migration-v<旧版本>-<时间戳>.db`。失败不阻塞启动。
2. **拒绝清空非空库** —— 兜底"重建"分支在 `DROP` 之前先数行数；**只要库里还有真实数据，就抛错拒绝重建**，不再无条件删表。只有真正的空库（全新安装）才会从零建表。

> ⚠️ **触发提醒**：不要用 `SCHEMA_VERSION` 与现有库不匹配的旧构建去打开同一个库（例如 `git checkout` 到一个旧 commit 再 `npm run tauri dev`）。现在这种情况 App 会**启动报错并明确提示**，而不是默默清空——这是防护生效，不是 bug。换回版本匹配的构建即可。

## 3. 随手手动备份

退出 App 后直接拷三件套：

```bash
SRC=~/Library/Application\ Support/com.oceanjin.spool
DEST=~/Desktop/spool-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST" && cp -p "$SRC"/spool.db* "$SRC"/settings.json "$DEST"/
```

或 App 运行中取一致快照（无需停 App，纯 SQL）：

```bash
sqlite3 "$SRC/spool.db" "VACUUM INTO '$HOME/Desktop/spool-snapshot-$(date +%Y%m%d-%H%M).db'"
```

## 4. 恢复办法

**情况 A：有备份/快照** —— 退出 App，把快照覆盖回 `spool.db`，并删除旧的 `spool.db-wal`、`spool.db-shm`（避免脏 WAL 盖掉刚恢复的库），再启动。

**情况 B：误删 / 被清空，但没有快照** —— SQLite 默认 `secure_delete=off`，删掉的行通常还留在 free page，可彫出：

```bash
# 先复制出来，绝不在原库上操作；越早抢救越好——继续使用会让新写入覆盖 free page
cp -p "$SRC/spool.db" /tmp/work.db
sqlite3 /tmp/work.db ".recover" | sqlite3 /tmp/recovered.db
# 删掉的行落在 lost_and_found 表，按列形态对回 blocks（9 列：id/thread_id/kind/content/annotation/ref_thread_id/source/pinned/created_at）
sqlite3 /tmp/recovered.db "SELECT COUNT(*) FROM lost_and_found WHERE nfield=9 AND c2 IN ('text','ref');"
```

> 抢救数据时**第一步永远是先停 App、再把整组文件拷一份出来**，所有分析都在副本上做。运行中的 App 会持续写库，可能覆盖掉待恢复的 free page。

## 5. 2026-05-29 数据丢失事件（归档）

- **现象**：约 15:11 全部 blocks 被清空，App 重置回初始 收件箱/未分类。
- **根因**：`migrateSchema` 的兜底分支在遇到不认识的 `user_version` 时无条件 `DROP` 全表重建——很可能是开发中切到了一个 `SCHEMA_VERSION` 与库不匹配的旧构建所触发，且重建前没有备份。
- **恢复结果**：从 free page 彫出 **33 个块（5/24–5/29）**，按内容重组进 **启发式搜索 / COMP2054-ADE / 升学与毕业** 三个工作区；5/24 之前的数据已被覆盖，不可恢复；被删线程的原名/原工作区不可恢复。
- **后续**：本次加入了第 2 节的两道防线，防止同类清空再次发生。
- **当时快照**：`~/Desktop/spool-db-backup-20260529-152028/`（含原始三件套、`RECOVERED.md` 全文、`pre-import/`、`pre-reorg/`）。
