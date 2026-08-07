#!/bin/bash
# Builds the ISOLATED WORKBENCH lab — a throwaway library shaped for the four engine
# actions, so 跟进 / 周回顾 / 压缩 / 去重 can each be run against material that actually
# gives them something to do (Ocean 2026-08-07: 「构建一个测试环境，环境需要符合 follow up，
# 周回顾，和两个维护的场景，然后调用这些功能进行测试」).
#
# ⚠️ It is a SEPARATE library from seed-mcp-lab.sh's, and that is deliberate: that one is
# shaped to hammer the MCP tool surface from a chat client, this one is shaped so the four
# actions have honest input. Running both does not disturb either.
#
# ⚠️ **It can never reach the real library** — memory `spool-db-wipe-incident`. Isolation is
# two-layer:
#   * the MCP server and the engine read `SPOOL_DATA_DIR` (mcp.rs app_data_dir honours it
#     before the default path), and the launcher below exports it itself, so a client that
#     ignores per-server `env` blocks still cannot point at the real db;
#   * the directory name carries a `.wb` suffix, so even the default path would miss.
# The one thing to keep true: never point this at com.oceanjin.spool.
#
# Usage:
#   scripts/seed-workbench-lab.sh          seed (wipes and rebuilds the lab library)
#   scripts/seed-workbench-lab.sh --argv <action> [project]   print the exact argv a run uses
#
# What is in it, and which action each part is FOR:
#
#   压缩 (distill)      向量库选型          14 blocks of contradictory research + the user's
#                                          own annotations. There IS a conclusion in there;
#                                          the point is whether the run finds it.
#   去重 (thread_health) 论文阅读           the same clip captured twice (near-verbatim), the
#                                          same FACT restated in different words several
#                                          times, a citation pointing at a deleted block, and
#                                          a summary written before half of it arrived (so
#                                          「摘要过期了」 is true, not decorative).
#
#     ⚠️ Both kinds of duplicate are in there on purpose, because the first cut of this
#     fixture only had the second kind and 去重 correctly reported 「疑似重复(0)」 — measured
#     2026-08-07. The detector is a character-trigram Jaccard ≥ 0.6 (the same one behind
#     find_similar_blocks), so it finds a paragraph you clipped twice and does NOT find the
#     same claim written out again in different words. That is the honest scope of a
#     mechanical scan, and it is worth knowing which one you are testing: a fixture full of
#     paraphrases makes a working detector look broken. (The paraphrase case is the debt
#     DESIGN_CONTEXT_HYGIENE §3.1 owns — 取代关系 — not something 去重 can reach today.)
#   跟进 (follow_up)     Tauri 2 升级       a follow_up_brief naming things that genuinely
#                                          move on the open web. Nothing else in the library
#                                          has a brief, so the button is off everywhere else
#                                          — which is itself worth seeing.
#   周回顾 (weekly_review) all of the above  every project has blocks dated across the last
#                                          six days, in a believable order. A review run on
#                                          a library where everything landed at once has
#                                          nothing to say about a *week*.
#
# And, for judging the 项目管理 screen rather than the actions: the deadlines below cover
# overdue / today / due-soon / far-off / none / finished, which is every state the row
# colouring has (lib/threads/deadline.ts).
set -euo pipefail

LAB="$HOME/Library/Application Support/com.oceanjin.spool.wb"
DATA="$LAB/data"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_SRC="$REPO/src-tauri/target/release/spool"

# ---------------------------------------------------------------------------------------
# --argv: print the argv Spool would build for one action, so it can be run by hand in a
# terminal against this library. HANDOFF §6.2-ter — the layer that breaks most often is the
# child process, and running its exact argv verifies it without needing a button press
# (synthetic clicks do not drive the webview, §6.2-bis).
# ---------------------------------------------------------------------------------------
if [ "${1:-}" = "--argv" ]; then
  ACTION="${2:?usage: --argv <distill|thread_health|weekly_review|follow_up> [project]}"
  PROJECT="${3:-}"
  cat <<EOF
Run it like this (haiku keeps it cheap; --effort is a Spool setting, not a CLI flag):

  SPOOL_DATA_DIR="$DATA" \\
  CLAUDE_CODE_EFFORT_LEVEL=low \\
  claude -p "<the guidance text for $ACTION${PROJECT:+ · $PROJECT}>" \\
    --mcp-config /tmp/spool-wb-mcp.json \\
    --strict-mcp-config \\
    --allowedTools "<see engine.rs allowed_tools>" \\
    --output-format stream-json --verbose --include-partial-messages \\
    --max-turns 12 --model haiku

with /tmp/spool-wb-mcp.json holding:

  {"mcpServers":{"spool":{"command":"$LAB/spool-wb-server","args":["--mcp"]}}}
EOF
  exit 0
fi

if [ ! -x "$BIN_SRC" ]; then
  echo "找不到构建好的二进制:$BIN_SRC" >&2
  echo "先跑一次:cd src-tauri && cargo build --release" >&2
  exit 1
fi

rm -rf "$LAB"
mkdir -p "$DATA" "$LAB/bin"

# Its own copy of the binary, so a later rebuild in the repo cannot silently change what a
# connected client is talking to.
cp "$BIN_SRC" "$LAB/bin/spool"

cat > "$LAB/spool-wb-server" <<LAUNCHER
#!/bin/sh
# Spool workbench lab server — reads ONLY the workbench lab library, never the real one.
SPOOL_DATA_DIR="$DATA"
export SPOOL_DATA_DIR
exec "$LAB/bin/spool" "\$@"
LAUNCHER
chmod +x "$LAB/spool-wb-server"

# Both consent toggles ON — the four actions all write, so a read-only lab could not test
# them. `railCollapsed` false so the panel under test is the first thing on screen.
cat > "$DATA/settings.json" <<'JSON'
{"mcpEnabled":true,"mcpWriteEnabled":true,"aiEngineActionsEnabled":true,"railCollapsed":false,"aiAutoMaintain":false,"language":"zh","resolvedLanguage":"zh","autoExtractAttachments":true}
JSON

sqlite3 "$DATA/spool.db" < "$REPO/src/lib/db/schema.sql"

# ⚠️ Read from client.ts, never typed here. mcp.rs refuses a schema version it was not built
# for, and that refusal reads as 「MCP 服务未开启」 from the client side — a hard-coded number
# one release behind costs a whole test round before anyone suspects the lab (2026-08-05).
SCHEMA_VERSION="$(sed -n 's/^const SCHEMA_VERSION = \([0-9]*\);.*/\1/p' "$REPO/src/lib/db/client.ts")"
[ -n "$SCHEMA_VERSION" ] || { echo "读不出 client.ts 的 SCHEMA_VERSION,停下" >&2; exit 1; }
echo "· schema 版本取自 client.ts:v$SCHEMA_VERSION"

# ms-epoch of a local wall-clock time N days ago. Everything below is relative to the run
# day, so the library always looks like it was used this week — which is the whole premise
# of 周回顾.
sqlite3 "$DATA/spool.db" <<'SQL'
PRAGMA user_version = SCHEMA_VERSION_PLACEHOLDER;

INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES
 ('WbWsBuild00000000001','在做的',0,
  CAST(strftime('%s', date('now','localtime','-60 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 08:00:00','utc')*1000 AS INTEGER)),
 ('WbWsRead000000000002','在读的',1,
  CAST(strftime('%s', date('now','localtime','-45 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 22:00:00','utc')*1000 AS INTEGER));

INSERT INTO threads (id, workspace_id, title, summary, summary_source, digest, deadline,
                     status, is_capture_target, created_at, updated_at, completed_at,
                     follow_up_brief) VALUES
 -- ===== 压缩 的料:一堆互相矛盾的调研,结论就埋在里面 =====
 -- No summary at all, so 压缩 has somewhere to put its conclusion and nothing to overwrite.
 -- Deadline 2 days out → the board row goes 「快到期」 orange.
 ('WbThVectorDb000000001','WbWsBuild00000000001','选哪个向量库',NULL,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+2 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',1,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 10:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 09:20:00','utc')*1000 AS INTEGER),NULL,NULL),

 -- ===== 去重 的料:同一件事被抓了好几遍,摘要写在一半材料到齐之前 =====
 -- OVERDUE by 3 days → the board row goes red. The stale summary is the point: it says
 -- something the later blocks contradict, so 「摘要过期了」 is a finding, not a formality.
 ('WbThPaperNotes0000002','WbWsRead000000000002','论文阅读:检索增强',
  '目前看下来,RAG 的瓶颈主要在向量检索的召回率上。','user',NULL,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 14:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 22:00:00','utc')*1000 AS INTEGER),NULL,NULL),

 -- ===== 跟进 的料:唯一一个定了 brief 的项目 =====
 -- Due today → the board row says 「今天到期」, the one case that only works because
 -- dueInDays compares calendar days rather than subtracting milliseconds (§9.4's trap).
 ('WbThTauriUpgrade00003','WbWsBuild00000000001','Tauri 2 升级',
  '卡在 2.x 的 API 变动上,想等一个稳定版本再动。','user',NULL,
  CAST(strftime('%s', date('now','localtime') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 11:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 16:00:00','utc')*1000 AS INTEGER),NULL,
  '1. Tauri 有没有出新的小版本,有没有破坏性改动
2. tauri-plugin-store 和 tauri-plugin-sql 有没有跟着更新
3. 有没有人写过 v1 → v2 迁移踩坑的文章'),

 -- ===== 周回顾 需要的第四个项目:没有截止日期,但这周一直在动 =====
 ('WbThWritingHabit00004','WbWsRead000000000002','写作习惯',NULL,NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-14 days') || ' 08:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 07:30:00','utc')*1000 AS INTEGER),NULL,NULL),

 -- ===== 一个已完成的,给 项目管理 的「已完成 + 重新打开」那一半 =====
 ('WbThOldLanding0000005','WbWsBuild00000000001','官网落地页改版',NULL,NULL,
  '最后定的是:首屏只讲一句话,把三个卖点挪到第二屏。改完转化没变,但跳出率降了。',NULL,'done',0,
  CAST(strftime('%s', date('now','localtime','-55 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 18:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 18:00:00','utc')*1000 AS INTEGER),NULL);

-- ---------------------------------------------------------------------------------------
-- 压缩 的料。Contradictory on purpose: three candidates, each praised somewhere and
-- damned somewhere else, plus the user's own annotations pointing at what actually matters.
-- 💭 annotations are the highest-signal authority in a pack, so a good 压缩 leans on them.
-- ---------------------------------------------------------------------------------------
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, seq, created_at) VALUES
 ('WbBlVec01','WbThVectorDb000000001','text',
  'pgvector 的好处是不用多一个服务。HNSW 索引在 0.5.0 之后才有,之前只有 ivfflat,召回率差一截。',
  '我们已经在用 Postgres 了,少一个服务是真的省事','pgvector 文档',1,1,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 10:05:00','utc')*1000 AS INTEGER)),
 ('WbBlVec02','WbThVectorDb000000001','text',
  'Qdrant 的过滤性能在带 payload 过滤的场景下明显好过 pgvector,官方 benchmark 里差 3-5 倍。',NULL,
  'Qdrant benchmark',0,2,
  CAST(strftime('%s', date('now','localtime','-20 days') || ' 15:30:00','utc')*1000 AS INTEGER)),
 ('WbBlVec03','WbThVectorDb000000001','text',
  '但那个 benchmark 是 Qdrant 自己发的,数据集也是他们挑的。第三方复现的数字差距只有 1.5 倍左右。',
  '厂商自测的数字要打折','Hacker News 讨论',0,3,
  CAST(strftime('%s', date('now','localtime','-20 days') || ' 15:45:00','utc')*1000 AS INTEGER)),
 ('WbBlVec04','WbThVectorDb000000001','text',
  'Milvus 功能最全,但要跑 etcd + MinIO + 自己的 3 个组件,单机部署都要 4 个容器。',
  '我们一共就两个人,这个运维量不现实','Milvus 部署文档',1,4,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 09:10:00','utc')*1000 AS INTEGER)),
 ('WbBlVec05','WbThVectorDb000000001','text',
  '我们的数据量:现在 8 万条,一年内估计到 50 万条。单条向量 1536 维。',
  '这个规模其实三个都能扛,所以性能不该是决定因素',NULL,1,5,
  CAST(strftime('%s', date('now','localtime','-17 days') || ' 11:00:00','utc')*1000 AS INTEGER)),
 ('WbBlVec06','WbThVectorDb000000001','text',
  'pgvector 在 100 万条以内,HNSW 索引下 p95 延迟大概 20-40ms,够用了。',NULL,'某篇实测博客',0,6,
  CAST(strftime('%s', date('now','localtime','-16 days') || ' 14:20:00','utc')*1000 AS INTEGER)),
 ('WbBlVec07','WbThVectorDb000000001','text',
  'Qdrant 有托管版,免费额度 1GB。省运维,但数据出本机了。',
  '数据出本机这条,对我们这个产品是硬伤','Qdrant Cloud 定价页',0,7,
  CAST(strftime('%s', date('now','localtime','-15 days') || ' 10:00:00','utc')*1000 AS INTEGER)),
 ('WbBlVec08','WbThVectorDb000000001','text',
  '备份这件事:pgvector 跟着 pg_dump 走,不用单独想。Qdrant 和 Milvus 都要另外做快照。',NULL,NULL,0,8,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 16:40:00','utc')*1000 AS INTEGER)),
 ('WbBlVec09','WbThVectorDb000000001','text',
  '试了一下 pgvector 的 HNSW 建索引,8 万条大概 90 秒,可以接受。',NULL,NULL,0,9,
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 20:15:00','utc')*1000 AS INTEGER)),
 ('WbBlVec10','WbThVectorDb000000001','text',
  '又看到一篇说 pgvector 在高并发写入时索引更新会阻塞查询。要确认一下我们的写入频率。',
  '我们是批量夜里灌数据,白天几乎不写。所以这条对我们不成立',NULL,0,10,
  CAST(strftime('%s', date('now','localtime','-4 days') || ' 09:30:00','utc')*1000 AS INTEGER)),
 ('WbBlVec11','WbThVectorDb000000001','text',
  'Qdrant 的 Rust 客户端质量比 pgvector 那边的 sqlx 组合要好用一点。',NULL,NULL,0,11,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 13:00:00','utc')*1000 AS INTEGER)),
 ('WbBlVec12','WbThVectorDb000000001','text',
  '成本:pgvector 等于零(已有的机器)。Qdrant 托管版最小档 25 刀一个月。',NULL,NULL,0,12,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 11:20:00','utc')*1000 AS INTEGER)),
 ('WbBlVec13','WbThVectorDb000000001','text',
  '问了一圈,做过类似规模的两个人都说这个量级别折腾,先用最省事的。',NULL,NULL,0,13,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 19:00:00','utc')*1000 AS INTEGER)),
 ('WbBlVec14','WbThVectorDb000000001','text',
  '还没定。下周三之前要给个说法,不然后端那边没法排期。',
  '我自己其实已经倾向 pgvector 了,就是想有个书面理由',NULL,1,14,
  CAST(strftime('%s', date('now','localtime') || ' 09:20:00','utc')*1000 AS INTEGER));

-- ---------------------------------------------------------------------------------------
-- 去重 的料。The same three facts, captured over and over from different apps — which is
-- exactly how it happens in real use: you read the same claim in a paper, a blog post and
-- a thread, and clip all three without noticing.
-- ---------------------------------------------------------------------------------------
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, ref_block_id, pinned, seq, created_at) VALUES
 -- fact 1 × 4
 ('WbBlPap01','WbThPaperNotes0000002','text',
  'RAG 的召回率上限主要由 chunk 切分策略决定,而不是 embedding 模型。',NULL,'原论文 §4.2',NULL,1,1,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 14:05:00','utc')*1000 AS INTEGER)),
 ('WbBlPap02','WbThPaperNotes0000002','text',
  '召回率的上限其实卡在 chunk 怎么切,换 embedding 模型带来的提升远小于此。',NULL,'某篇综述',NULL,0,2,
  CAST(strftime('%s', date('now','localtime','-26 days') || ' 09:30:00','utc')*1000 AS INTEGER)),
 ('WbBlPap03','WbThPaperNotes0000002','text',
  '切分策略 > embedding 模型选型。这是 RAG 召回率的主要矛盾。',NULL,'Twitter 讨论串',NULL,0,3,
  CAST(strftime('%s', date('now','localtime','-19 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 ('WbBlPap04','WbThPaperNotes0000002','text',
  '再次确认:chunk 切分比 embedding 模型重要得多。',NULL,'另一篇博客',NULL,0,4,
  CAST(strftime('%s', date('now','localtime','-11 days') || ' 15:00:00','utc')*1000 AS INTEGER)),
 -- fact 2 × 3
 ('WbBlPap05','WbThPaperNotes0000002','text',
  '重排(rerank)能把 top-5 的准确率拉高 15-20 个百分点,代价是一次额外的模型调用。',NULL,'原论文 §5.1',NULL,1,5,
  CAST(strftime('%s', date('now','localtime','-28 days') || ' 10:00:00','utc')*1000 AS INTEGER)),
 ('WbBlPap06','WbThPaperNotes0000002','text',
  '加了 rerank 之后 top-5 准确率能涨 15%% 以上,但要多一次模型调用。',NULL,'实践总结',NULL,0,6,
  CAST(strftime('%s', date('now','localtime','-17 days') || ' 11:30:00','utc')*1000 AS INTEGER)),
 ('WbBlPap07','WbThPaperNotes0000002','text',
  'rerank 值得加,+15~20% 准确率。',NULL,NULL,NULL,0,7,
  CAST(strftime('%s', date('now','localtime','-8 days') || ' 20:00:00','utc')*1000 AS INTEGER)),
 -- fact 3 × 2, and the one that CONTRADICTS the thread's stale summary
 ('WbBlPap08','WbThPaperNotes0000002','text',
  '后来的实验说明,真正的瓶颈不在检索召回,而在生成阶段没有正确使用检索到的证据。',
  '这条推翻了我前面写的摘要','近期一篇复现论文',NULL,1,8,
  CAST(strftime('%s', date('now','localtime','-5 days') || ' 16:20:00','utc')*1000 AS INTEGER)),
 ('WbBlPap09','WbThPaperNotes0000002','text',
  '瓶颈其实在生成端:检索到了正确的段落,模型也常常不用它。',NULL,'同一篇的讨论',NULL,0,9,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 10:40:00','utc')*1000 AS INTEGER)),
 -- a citation pointing at a block that no longer exists — 去重 should notice
 ('WbBlPap10','WbThPaperNotes0000002','text',
  '接着上面那条:所以评测要分开看检索指标和生成指标。',NULL,NULL,'WbBlDeleted999',0,10,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 22:00:00','utc')*1000 AS INTEGER)),
 -- ⚠️ The NEAR-VERBATIM pair the detector can actually see: the same paragraph clipped
 -- twice, weeks apart, from two different apps — which is how it really happens. Only the
 -- trailing sentence differs. Without a pair like this the run reports 「疑似重复(0)」 and
 -- the fixture proves nothing (measured 2026-08-07).
 ('WbBlPap11','WbThPaperNotes0000002','text',
  '一个常被忽略的点:检索器和生成器是分开训练的,所以检索指标涨了不代表最终答案会更准。评测必须端到端做,单看 recall@k 会骗人。',
  NULL,'原论文 §6',NULL,0,11,
  CAST(strftime('%s', date('now','localtime','-24 days') || ' 09:00:00','utc')*1000 AS INTEGER)),
 ('WbBlPap12','WbThPaperNotes0000002','text',
  '一个常被忽略的点:检索器和生成器是分开训练的,所以检索指标涨了不代表最终答案会更准。评测必须端到端做,单看 recall@k 会骗人。这一点在附录里又提了一次。',
  NULL,'Zotero 笔记',NULL,0,12,
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 11:15:00','utc')*1000 AS INTEGER));

-- ---------------------------------------------------------------------------------------
-- 跟进 的料。Enough for the brief to be grounded — the run reads these to know what is
-- already known, then goes out and looks for what is not.
-- ---------------------------------------------------------------------------------------
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, seq, created_at) VALUES
 ('WbBlTau01','WbThTauriUpgrade00003','text',
  '现在锁在 tauri 2.0 的一个早期小版本上。升级卡点是 plugin-store 的 API 改过一次。',NULL,NULL,1,1,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 11:05:00','utc')*1000 AS INTEGER)),
 ('WbBlTau02','WbThTauriUpgrade00003','text',
  'plugin-sql 那边我们用的是 sqlite 特性,迁移的时候要盯着 schema 版本别漂。',NULL,NULL,0,2,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 09:00:00','utc')*1000 AS INTEGER)),
 ('WbBlTau03','WbThTauriUpgrade00003','text',
  '上次看的时候还没有 v1→v2 的完整迁移指南,只有零散的 changelog。',
  '这条最该更新一下','官方文档',0,3,
  CAST(strftime('%s', date('now','localtime','-7 days') || ' 14:30:00','utc')*1000 AS INTEGER)),
 ('WbBlTau04','WbThTauriUpgrade00003','text',
  '暂时先不动,等一个明确说「无破坏性改动」的版本。',NULL,NULL,0,4,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 16:00:00','utc')*1000 AS INTEGER));

-- ---------------------------------------------------------------------------------------
-- 周回顾 的料。The fourth project exists mostly so the review has a fourth thing to say,
-- and so the board is not three rows long.
-- ---------------------------------------------------------------------------------------
INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, seq, created_at) VALUES
 ('WbBlWri01','WbThWritingHabit00004','text',
  '早上写比晚上写效率高,但只在没开会的日子成立。',NULL,NULL,0,1,
  CAST(strftime('%s', date('now','localtime','-14 days') || ' 08:05:00','utc')*1000 AS INTEGER)),
 ('WbBlWri02','WbThWritingHabit00004','text',
  '连续写了 5 天,第 3 天最难,过了就顺了。',NULL,NULL,0,2,
  CAST(strftime('%s', date('now','localtime','-6 days') || ' 07:40:00','utc')*1000 AS INTEGER)),
 ('WbBlWri03','WbThWritingHabit00004','text',
  '把「写多少字」换成「写多久」之后,反而写得多了。',
  '这条我想留着','某本书',1,3,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 07:20:00','utc')*1000 AS INTEGER)),
 ('WbBlWri04','WbThWritingHabit00004','text',
  '今天只写了 20 分钟,但把卡了一周的那段开头写出来了。',NULL,NULL,0,4,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 07:30:00','utc')*1000 AS INTEGER));

INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, seq, created_at) VALUES
 ('WbBlLan01','WbThOldLanding0000005','text',
  '首屏原来堆了三个卖点,眼动测试里没人看到第三个。',NULL,NULL,0,1,
  CAST(strftime('%s', date('now','localtime','-50 days') || ' 10:00:00','utc')*1000 AS INTEGER)),
 ('WbBlLan02','WbThOldLanding0000005','text',
  '改成一句话之后,跳出率从 61%% 降到 48%%。',NULL,'分析后台',1,2,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 17:00:00','utc')*1000 AS INTEGER));
SQL

# The PRAGMA cannot be parameterised, so it is substituted into the heredoc after the fact.
sqlite3 "$DATA/spool.db" "PRAGMA user_version = $SCHEMA_VERSION;"

# ⚠️ Two copies, because the two readers look in different places and SPOOL_DATA_DIR only
# steers one of them (HANDOFF §6.2: 「SPOOL_DATA_DIR 对 GUI 无效,只管 MCP 那一侧」):
#   * the MCP server reads $LAB/data — that is what the launcher exports;
#   * the GUI reads ~/Library/Application Support/<identifier>/ directly, because
#     tauri-plugin-sql resolves `sqlite:spool.db` against the app data dir and the store
#     plugin does the same for settings.json.
# So a build whose identifier is com.oceanjin.spool.wb finds the library at $LAB's root.
cp "$DATA/spool.db" "$LAB/spool.db"
cp "$DATA/settings.json" "$LAB/settings.json"

BLOCKS=$(sqlite3 "$DATA/spool.db" "SELECT COUNT(*) FROM blocks;")
THREADS=$(sqlite3 "$DATA/spool.db" "SELECT COUNT(*) FROM threads WHERE deleted_at IS NULL;")

cat <<EOF

工作台测试库建好了。

  库在这里   $DATA
  项目 $THREADS 个,信息块 $BLOCKS 块

四个动作各自的料:
  压缩   → 「选哪个向量库」   14 块自相矛盾的调研,结论埋在里面
  去重   → 「论文阅读:检索增强」 同一件事抓了好几遍 + 摘要已经被后面的块推翻 + 一条断掉的引用
  跟进   → 「Tauri 2 升级」    全库唯一定了「在盯什么」的项目
  周回顾 → 四个项目都有这一周的块

项目管理那一屏顺便能看全:逾期 / 今天到期 / 快到期 / 没有截止日期 / 已完成,各一个。

用 GUI 看它:把 tauri.conf.json 的 identifier 临时改成 com.oceanjin.spool.wb,
再 npm run tauri build -- --bundles app —— 收尾记得改回来(HANDOFF §6.2-bis 第 7 步)。

只想跑动作、不开窗口:
  scripts/seed-workbench-lab.sh --argv distill 选哪个向量库
EOF
