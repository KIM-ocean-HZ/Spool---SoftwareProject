#!/bin/bash
# Builds the ISOLATED MCP lab — a throwaway Spool library plus its own server binary,
# for hammering the MCP surface from a real client (Claude Desktop / ChatGPT desktop)
# without touching the real library. See docs/MCP_LAB_PROMPT.md for the test prompts.
#
# Isolation is by SPOOL_DATA_DIR (mcp.rs app_data_dir() honours it before the default
# path), so the lab needs no separate bundle identifier and never opens the real
# ~/Library/Application Support/com.oceanjin.spool/spool.db. The launcher script below
# is what the client spawns; the env var lives inside it, so a client that ignores
# per-server `env` blocks cannot accidentally point the server at the real library.
#
# Usage:
#   scripts/seed-mcp-lab.sh              seed the lab, print the connect instructions
#   scripts/seed-mcp-lab.sh --connect    also write the lab entry into every client
#   scripts/seed-mcp-lab.sh --disconnect remove the lab entry from every client
#
# Clients covered: Claude Desktop, Claude Code (~/.claude.json), ChatGPT desktop / Codex.
#
# Re-runnable: wipes and rebuilds the lab library and re-copies the binary each time.
set -euo pipefail

# NOT on the Desktop: ~/Desktop, ~/Documents and ~/Downloads are TCC-protected, and a
# client without that grant (Claude Desktop, 2026-08-03) cannot even exec the launcher —
# "/bin/sh: …/spool-lab-server: Operation not permitted", server disconnects on start.
# Application Support is not TCC-gated, and the `.lab` suffix mirrors the `.verify` one.
LAB="$HOME/Library/Application Support/com.oceanjin.spool.lab"
DATA="$LAB/data"
LEGACY_LAB="$HOME/Desktop/Spool-MCP-Lab"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_SRC="$REPO/src-tauri/target/release/spool"
MARKER="SPOOL-MCP-LAB-2026-08-03"

CLAUDE_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CODEX_CFG="$HOME/.codex/config.toml"
CC_CFG="$HOME/.claude.json"

# ---------------------------------------------------------------------------------------
# --connect / --disconnect: the lab entry is named spool_lab, NEVER spool — the real
# library's entry must survive untouched. Both paths back up the file first.
# ---------------------------------------------------------------------------------------
connect_claude() {
  local action="$1" # add | remove
  [ -f "$CLAUDE_CFG" ] || { echo "· Claude Desktop 没装(或没配过),跳过"; return; }
  cp "$CLAUDE_CFG" "$CLAUDE_CFG.bak"
  ACTION="$action" LAUNCHER="$LAB/spool-lab-server" python3 - "$CLAUDE_CFG" <<'PY'
import json, os, sys
path = sys.argv[1]
cfg = json.load(open(path))
servers = cfg.setdefault("mcpServers", {})
if os.environ["ACTION"] == "add":
    servers["spool_lab"] = {"command": os.environ["LAUNCHER"], "args": ["--mcp"]}
else:
    servers.pop("spool_lab", None)
json.dump(cfg, open(path, "w"), ensure_ascii=False, indent=2)
PY
  [ "$action" = add ] && echo "· Claude Desktop: 已写入 spool_lab(旧文件备份成 .bak)" \
                      || echo "· Claude Desktop: 已删除 spool_lab(旧文件备份成 .bak)"
}

# Claude Code (CLI) keeps user-scope servers in ~/.claude.json's top-level mcpServers,
# alongside a pile of its own state (onboarding, per-project settings) — merge one key
# only. The entry carries an explicit "type", matching what `claude mcp add` writes.
connect_claude_code() {
  local action="$1"
  [ -f "$CC_CFG" ] || { echo "· Claude Code 没装(或没配过),跳过"; return; }
  cp "$CC_CFG" "$CC_CFG.bak"
  ACTION="$action" LAUNCHER="$LAB/spool-lab-server" python3 - "$CC_CFG" <<'PY'
import json, os, sys
path = sys.argv[1]
cfg = json.load(open(path))
servers = cfg.setdefault("mcpServers", {})
if os.environ["ACTION"] == "add":
    servers["spool_lab"] = {
        "type": "stdio", "command": os.environ["LAUNCHER"], "args": ["--mcp"], "env": {}
    }
else:
    servers.pop("spool_lab", None)
json.dump(cfg, open(path, "w"), ensure_ascii=False, indent=2)
PY
  [ "$action" = add ] && echo "· Claude Code: 已写入 spool_lab(旧文件备份成 .bak)" \
                      || echo "· Claude Code: 已删除 spool_lab(旧文件备份成 .bak)"
}

connect_codex() {
  local action="$1"
  [ -f "$CODEX_CFG" ] || { echo "· ChatGPT 桌面版/Codex 没装(或没配过),跳过"; return; }
  cp "$CODEX_CFG" "$CODEX_CFG.bak"
  # Drop any existing [mcp_servers.spool_lab] table (from its header to the next header
  # at line start, or EOF), then append a fresh one for --connect. Every other table is
  # copied verbatim — including [mcp_servers.spool], the real library's entry.
  ACTION="$action" LAUNCHER="$LAB/spool-lab-server" python3 - "$CODEX_CFG" <<'PY'
import os, re, sys
path = sys.argv[1]
text = open(path).read()
text = re.sub(r'(?ms)^\[mcp_servers\.spool_lab\].*?(?=^\[|\Z)', '', text).rstrip() + "\n"
if os.environ["ACTION"] == "add":
    text += ('\n[mcp_servers.spool_lab]\ncommand = "%s"\nargs = ["--mcp"]\n'
             % os.environ["LAUNCHER"])
open(path, "w").write(text)
PY
  [ "$action" = add ] && echo "· ChatGPT 桌面版/Codex: 已写入 spool_lab(旧文件备份成 .bak)" \
                      || echo "· ChatGPT 桌面版/Codex: 已删除 spool_lab(旧文件备份成 .bak)"
}

if [ "${1:-}" = "--disconnect" ]; then
  connect_claude remove
  connect_claude_code remove
  connect_codex remove
  echo
  echo "断开完成。客户端要重启一次才会生效。"
  echo "实验室文件夹还在,不要了就删:rm -rf \"$LAB\""
  exit 0
fi

# ---------------------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------------------
if [ ! -x "$BIN_SRC" ]; then
  echo "找不到构建好的二进制:$BIN_SRC" >&2
  echo "先在 src-tauri 目录跑一次:cargo build --release" >&2
  exit 1
fi

rm -rf "$LAB"
mkdir -p "$DATA" "$LAB/bin"
# The 2026-08-03 first cut lived on the Desktop; clear it so no client keeps a stale path.
if [ -d "$LEGACY_LAB" ]; then
  rm -rf "$LEGACY_LAB"
  echo "(顺手删掉了桌面上那份旧的:$LEGACY_LAB)"
fi

# The lab runs its OWN copy of the binary: a later `cargo clean` / rebuild in the repo
# can't silently change what the client is talking to. Changed the code? Re-run this.
cp "$BIN_SRC" "$LAB/bin/spool"

cat > "$LAB/spool-lab-server" <<LAUNCHER
#!/bin/sh
# Spool MCP lab server — reads ONLY the lab library, never the real one.
SPOOL_DATA_DIR="$DATA"
export SPOOL_DATA_DIR
exec "$LAB/bin/spool" "\$@"
LAUNCHER
chmod +x "$LAB/spool-lab-server"

# Both consent toggles ON: the lab exists to exercise the write path too.
cat > "$DATA/settings.json" <<'JSON'
{"mcpEnabled":true,"mcpWriteEnabled":true,"language":"zh","autoExtractAttachments":true}
JSON

sqlite3 "$DATA/spool.db" < "$REPO/src/lib/db/schema.sql"

sqlite3 "$DATA/spool.db" <<SQL
PRAGMA user_version = 8;

-- Dates are relative to the run day, so the library always looks current.
-- ms-epoch of a local wall-clock time: strftime('%s', date('now','localtime','-N days') || ' HH:MM:00','utc')*1000

INSERT INTO workspaces (id, title, sort_order, created_at, updated_at) VALUES
 ('LabWsSelfCheck000001','LAB 自检',0,
  CAST(strftime('%s', date('now','localtime','-90 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 08:00:00','utc')*1000 AS INTEGER)),
 ('LabWsStudy0000000002','学业',1,
  CAST(strftime('%s', date('now','localtime','-70 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 21:30:00','utc')*1000 AS INTEGER)),
 ('LabWsWork00000000003','工作',2,
  CAST(strftime('%s', date('now','localtime','-64 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 17:12:00','utc')*1000 AS INTEGER)),
 ('LabWsLife00000000004','生活',3,
  CAST(strftime('%s', date('now','localtime','-58 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 19:40:00','utc')*1000 AS INTEGER)),
 -- soft-deleted workspace: its thread below must never surface anywhere
 ('LabWsGone00000000005','已删掉的工作区',4,
  CAST(strftime('%s', date('now','localtime','-80 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 09:00:00','utc')*1000 AS INTEGER));
UPDATE workspaces SET deleted_at =
  CAST(strftime('%s', date('now','localtime','-39 days') || ' 09:00:00','utc')*1000 AS INTEGER)
  WHERE id = 'LabWsGone00000000005';

INSERT INTO threads (id, workspace_id, title, summary, summary_source, digest, deadline,
                     status, is_capture_target, created_at, updated_at, completed_at) VALUES
 -- ===== marker project: the environment self-check reads this =====
 ('LabThSelfCheck000001','LabWsSelfCheck000001','🧪 LAB 环境自检',
  '$MARKER — 这是隔离测试库,不是真库。','user',NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-90 days') || ' 09:05:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 08:00:00','utc')*1000 AS INTEGER),NULL),

 -- ===== 学业 =====
 -- the deep one: mixed authorities, duplicates, a dangling citation, leaked ids,
 -- attachments with inlined extracted text. No summary → set_thread_summary may write.
 ('LabThMlCourse0000002','LabWsStudy0000000002','机器学习课',NULL,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+9 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-63 days') || ' 10:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime') || ' 21:30:00','utc')*1000 AS INTEGER),NULL),
 -- same-prefix title: 「机器学习课」 must not silently resolve to this one
 ('LabThMlHomework00003','LabWsStudy0000000002','机器学习课作业',
  '第六周作业:验证曲线,周日截止。','mcp',NULL,
  CAST(strftime('%s', date('now','localtime','+3 days') || ' 23:59:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 20:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 22:05:00','utc')*1000 AS INTEGER),NULL),
 ('LabThJapanese0000004','LabWsStudy0000000002','日语练习',NULL,NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-55 days') || ' 22:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 22:40:00','utc')*1000 AS INTEGER),NULL),

 -- ===== 工作 =====
 -- user-written summary: set_thread_summary MUST refuse to overwrite it
 ('LabThJobHunt00000005','LabWsWork00000000003','找工作',
  '先把简历开头那段改完,再写 Acme 的求职信。','user',NULL,
  CAST(strftime('%s', date('now','localtime','weekday 5') || ' 18:00:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-33 days') || ' 09:30:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 17:12:00','utc')*1000 AS INTEGER),NULL),
 -- dormant + pinned only: the digest's "置顶锚点" path
 ('LabThPortfolio000006','LabWsWork00000000003','作品集官网',NULL,NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-47 days') || ' 20:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-41 days') || ' 22:15:00','utc')*1000 AS INTEGER),NULL),
 -- a finished project, with a conclusion digest
 ('LabThResume000000007','LabWsWork00000000003','简历改版',
  '已定稿:项目经历放最上面。','mcp','最终版把项目经历提到工作经历之前,一页纸。',NULL,'done',0,
  CAST(strftime('%s', date('now','localtime','-60 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 18:30:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 18:30:00','utc')*1000 AS INTEGER)),

 -- ===== 生活 =====
 ('LabThHalfMarathon008','LabWsLife00000000004','半马训练',NULL,NULL,NULL,
  CAST(strftime('%s', date('now','localtime','+45 days') || ' 08:00:00','utc')*1000 AS INTEGER),
  'active',0,
  CAST(strftime('%s', date('now','localtime','-50 days') || ' 07:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 08:20:00','utc')*1000 AS INTEGER),NULL),
 -- summary carrying a leaked raw id: check_library's extended surface
 ('LabThRenting00000009','LabWsLife00000000004','租房',
  '看房清单见 sbKq9XmNp3Vr7YzC2zgT 那一条。','mcp',NULL,NULL,'parked',0,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 12:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 19:40:00','utc')*1000 AS INTEGER),NULL),
 -- empty project: get_pack / distill must degrade gracefully
 ('LabThRecipes00000010','LabWsLife00000000004','菜谱',NULL,NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-28 days') || ' 19:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-28 days') || ' 19:00:00','utc')*1000 AS INTEGER),NULL),
 -- the capture target (双击 ⌥ 落到这里)
 ('LabThInbox0000000011','LabWsLife00000000004','未分类',NULL,NULL,NULL,NULL,'active',1,
  CAST(strftime('%s', date('now','localtime','-26 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 23:10:00','utc')*1000 AS INTEGER),NULL),
 -- soft-deleted thread, and a live thread inside the deleted workspace: neither exists
 ('LabThDeleted00000012','LabWsLife00000000004','已删掉的项目',NULL,NULL,NULL,NULL,'active',0,
  CAST(strftime('%s', date('now','localtime','-35 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-34 days') || ' 09:00:00','utc')*1000 AS INTEGER),NULL),
 ('LabThOrphan000000013','LabWsGone00000000005','孤儿项目(工作区已删)',NULL,NULL,NULL,NULL,
  'active',0,
  CAST(strftime('%s', date('now','localtime','-80 days') || ' 09:00:00','utc')*1000 AS INTEGER),
  CAST(strftime('%s', date('now','localtime','-45 days') || ' 09:00:00','utc')*1000 AS INTEGER),NULL);
UPDATE threads SET deleted_at =
  CAST(strftime('%s', date('now','localtime','-33 days') || ' 09:00:00','utc')*1000 AS INTEGER)
  WHERE id = 'LabThDeleted00000012';

INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, ref_block_id, created_at) VALUES
 -- ===== 🧪 LAB 环境自检 =====
 ('LabBkSelfCheck000001','LabThSelfCheck000001','text',
  '$MARKER
这是 Spool 的隔离测试库,不是任何人的真实资料库。里面的项目、块、批注都是为了测试 MCP 接口造出来的假数据。
如果你在这个库里看不到本条,说明你连错了服务器——立刻停手,不要读、不要写,先告诉用户。',
  '连上之后第一件事:确认能看到这一条。',NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-90 days') || ' 09:05:00','utc')*1000 AS INTEGER)),
 ('LabBkSelfCheck000002','LabThSelfCheck000001','text',
  '本库故意埋了这些情况:重复块、指向已删块的引用、正文里露出的内部 id、空项目(菜谱)、
已软删的项目与工作区、超长附件正文、用户手写摘要(不许被 AI 覆盖)、AI 写的摘要(可以覆盖)。
它们是待发现的问题现场,不是需要你替用户清理的垃圾。',
  NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-90 days') || ' 09:06:00','utc')*1000 AS INTEGER)),

 -- ===== 机器学习课(深)=====
 ('LabBkMl000000000001','LabThMlCourse0000002','text',
  '这门课我的目标不是分数,是能自己判断一个模型是不是在骗我。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-63 days') || ' 10:05:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000002','LabThMlCourse0000002','text',
  'Lecture 3: gradient descent takes a step in the direction of steepest descent of the loss; ==the learning rate decides whether you converge or oscillate==.',
  '这句就是我一直没搞懂的地方。','course.edu · Safari',1,NULL,
  CAST(strftime('%s', date('now','localtime','-56 days') || ' 10:20:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000003','LabThMlCourse0000002','text',
  '过拟合的直觉:模型把训练集的噪声也背下来了。验证集掉头往上的那一刻,就是它开始背答案的时候。',
  NULL,'AI chat · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-48 days') || ' 21:10:00','utc')*1000 AS INTEGER)),
 -- duplicate pair (captured twice) + a lightly edited third copy → 3-block group
 ('LabBkMl000000000004','LabThMlCourse0000002','text',
  '正则化不是让模型变笨,是给它加一个「别太自信」的代价项。',NULL,'course.edu · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-44 days') || ' 11:00:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000005','LabThMlCourse0000002','text',
  '正则化不是让模型变笨,是给它加一个「别太自信」的代价项。',NULL,'course.edu · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-44 days') || ' 11:02:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000006','LabThMlCourse0000002','text',
  '正则化不是让模型变笨,而是给它加一个"别太自信"的代价项。',
  '同一句话我存了三遍。',NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-43 days') || ' 09:15:00','utc')*1000 AS INTEGER)),
 -- process-shaped trace: read for the user's evolving questions, not for facts
 ('LabBkMl000000000007','LabThMlCourse0000002','text',
  '我:验证集和测试集到底差在哪?
AI:验证集用来调超参,测试集只在最后用一次。
我:那我每次调完都看一眼测试集会怎样?
AI:那测试集就被你调进去了,它不再是没见过的数据。
我:所以我之前那份报告的分数是虚的?',
  NULL,'ChatGPT · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 23:30:00','utc')*1000 AS INTEGER)),
 -- long synthesis block (~1.5k chars)
 ('LabBkMl000000000008','LabThMlCourse0000002','text',
  '偏差-方差分解的完整说法:泛化误差可以拆成三块。第一块是偏差,来自模型本身表达能力不够,
比如用一条直线去拟合一条曲线,不管给多少数据都拟合不上去;第二块是方差,来自模型对训练集的
具体抽样太敏感,换一批数据就换一套参数,表现在验证曲线上就是训练误差很低、验证误差很高;
第三块是噪声,来自数据本身的不可约误差,谁也消不掉。实践上,欠拟合(高偏差)的解法是加特征、
换更强的模型、训练更久;过拟合(高方差)的解法是加数据、加正则、减小模型、早停。
两者的诊断依据都是同一张验证曲线:训练误差和验证误差都高 → 偏差问题;训练误差低而验证误差
高且差距随数据量增加而缩小 → 方差问题。作业里要交的正是这张图,而不是一个准确率数字。',
  '这段是 AI 写的框架,不能当事实引,但结构好用。','Claude · MCP',0,NULL,
  CAST(strftime('%s', date('now','localtime','-38 days') || ' 20:00:00','utc')*1000 AS INTEGER)),
 -- leaked internal id in visible text (D-ID) + a leaked spool:// URI (D-URI)
 ('LabBkMl000000000009','LabThMlCourse0000002','text',
  '接着上次那条讲(见 LabBkMl000000000008),第三节课的推导可以直接套用。',
  NULL,'Claude · MCP',0,NULL,
  CAST(strftime('%s', date('now','localtime','-36 days') || ' 10:00:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000010','LabThMlCourse0000002','text',
  '完整上下文在 spool://thread/LabThMlCourse0000002 里。',NULL,'ChatGPT · MCP',0,NULL,
  CAST(strftime('%s', date('now','localtime','-35 days') || ' 10:05:00','utc')*1000 AS INTEGER)),
 -- dangling citation: the cited block never existed
 ('LabBkMl000000000011','LabThMlCourse0000002','text',
  '综上,第六周作业应该交验证曲线而不是准确率。',
  '这条是站在被删掉的那块上写的。','Claude · MCP',0,'LabBkMissing00000001',
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 19:00:00','utc')*1000 AS INTEGER)),
 -- the user's own thinking: sourceless, highest signal
 ('LabBkMl000000000012','LabThMlCourse0000002','text',
  '我到现在也不敢说自己会调超参。每次都是试出来的,说不清为什么。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-22 days') || ' 23:50:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000013','LabThMlCourse0000002','text',
  '助教说:验证集划分只要不泄漏时间顺序,随机划就行;时间序列数据例外,必须按时间切。',
  '==时间序列必须按时间切==','course.edu · Mail',0,NULL,
  CAST(strftime('%s', date('now','localtime','-14 days') || ' 15:20:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000014','LabThMlCourse0000002','text',
  '第六周作业要交:验证曲线一张 + 三句话解释。截止时间是九天后的 23:59。',
  NULL,'course.edu · Safari',1,NULL,
  CAST(strftime('%s', date('now','localtime','-7 days') || ' 09:00:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000015','LabThMlCourse0000002','text',
  '今天试了一下:把学习率从 0.1 降到 0.01,曲线就不抖了,但收敛慢了一倍。',
  '这算是我第一次自己看懂了曲线。',NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 22:40:00','utc')*1000 AS INTEGER)),
 ('LabBkMl000000000016','LabThMlCourse0000002','text',
  '明天要问助教:验证曲线的横轴用训练集大小还是用 epoch?',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime') || ' 21:30:00','utc')*1000 AS INTEGER)),

 -- ===== 机器学习课作业 =====
 ('LabBkHw000000000001','LabThMlHomework00003','text',
  '作业模板下载下来了,要求用 matplotlib 画,不能截图别人的。',NULL,'course.edu · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-21 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 -- cross-project duplicate of LabBkMl000000000004
 ('LabBkHw000000000002','LabThMlHomework00003','text',
  '正则化不是让模型变笨,是给它加一个「别太自信」的代价项。',NULL,'course.edu · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-20 days') || ' 20:10:00','utc')*1000 AS INTEGER)),
 ('LabBkHw000000000003','LabThMlHomework00003','text',
  '验证曲线画出来了,但横轴我用的是 epoch,和助教说的可能不一样。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 22:05:00','utc')*1000 AS INTEGER)),

 -- ===== 日语练习 =====
 ('LabBkJp000000000001','LabThJapanese0000004','text',
  '〜てしまう 有两个意思:做完了,或者后悔做了。靠上下文分。',NULL,'Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-55 days') || ' 22:10:00','utc')*1000 AS INTEGER)),
 ('LabBkJp000000000002','LabThJapanese0000004','text',
  '睡前二十分钟听力,比周末一次听一小时管用。这是我自己试出来的。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-40 days') || ' 22:40:00','utc')*1000 AS INTEGER)),
 ('LabBkJp000000000003','LabThJapanese0000004','text',
  '今日は雨だったので、家で単語を三十個だけ覚えた。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-12 days') || ' 22:40:00','utc')*1000 AS INTEGER)),

 -- ===== 找工作 =====
 ('LabBkJob00000000001','LabThJobHunt00000005','text',
  '目标:十一月中之前投出五份认真写的,不铺量。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-33 days') || ' 09:31:00','utc')*1000 AS INTEGER)),
 ('LabBkJob00000000002','LabThJobHunt00000005','text',
  'Acme 在招数据分析:要 SQL,Python 加分。小团队,直接向运营负责人汇报。',
  '目前最像的一个。','acme.com · Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 11:40:00','utc')*1000 AS INTEGER)),
 ('LabBkJob00000000003','LabThJobHunt00000005','text',
  '转行的简历,项目经历要放在工作经历前面——招聘的人在第一屏只花六秒。',
  '这条决定了简历怎么排。','AI chat · Safari',1,NULL,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 14:05:00','utc')*1000 AS INTEGER)),
 ('LabBkJob00000000004','LabThJobHunt00000005','text',
  'HR 回信:他们两周集中看一次,下一批本周五截止。',NULL,'Mail',0,NULL,
  CAST(strftime('%s', date('now','localtime','-1 days') || ' 17:12:00','utc')*1000 AS INTEGER)),

 -- ===== 作品集官网(沉寂,只剩置顶)=====
 ('LabBkPort0000000001','LabThPortfolio000006','text',
  '最多放三个项目,其余全砍。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-47 days') || ' 20:05:00','utc')*1000 AS INTEGER)),
 ('LabBkPort0000000002','LabThPortfolio000006','text',
  '案例写三段最顺:问题是什么、我做了什么、结果变了什么。每个项目配一个数字。',
  '三个项目都照这个模板写。','Safari',1,NULL,
  CAST(strftime('%s', date('now','localtime','-41 days') || ' 22:15:00','utc')*1000 AS INTEGER)),

 -- ===== 简历改版(已完成)=====
 ('LabBkRes00000000001','LabThResume000000007','text',
  '定稿:项目经历提到最前面,压到一页。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 18:30:00','utc')*1000 AS INTEGER)),

 -- ===== 半马训练 =====
 ('LabBkRun00000000001','LabThHalfMarathon008','text',
  '每周加量别超过一成,不然受伤概率陡增。',NULL,'Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-50 days') || ' 07:30:00','utc')*1000 AS INTEGER)),
 ('LabBkRun00000000002','LabThHalfMarathon008','text',
  '长距离改到周日早上——周六永远跑不成。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-2 days') || ' 08:20:00','utc')*1000 AS INTEGER)),

 -- ===== 租房 =====
 ('LabBkRent0000000001','LabThRenting00000009','text',
  '预算一个月一千八以内,走路能到地铁,不要一楼。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-30 days') || ' 12:05:00','utc')*1000 AS INTEGER)),
 ('LabBkRent0000000002','LabThRenting00000009','text',
  '房东:周六下午两点看房,带身份证和收入证明。',NULL,'Mail',0,NULL,
  CAST(strftime('%s', date('now','localtime','-9 days') || ' 19:40:00','utc')*1000 AS INTEGER)),

 -- ===== 未分类(捕捉落点)=====
 ('LabBkInbox000000001','LabThInbox0000000011','text',
  '「上下文工程」这个说法最近老看到,回头查查到底指什么。',NULL,'Safari',0,NULL,
  CAST(strftime('%s', date('now','localtime','-10 days') || ' 12:00:00','utc')*1000 AS INTEGER)),
 ('LabBkInbox000000002','LabThInbox0000000011','text',
  '待办:把机器学习课那三条重复的合并掉。',NULL,NULL,0,NULL,
  CAST(strftime('%s', date('now','localtime','-3 days') || ' 23:10:00','utc')*1000 AS INTEGER)),

 -- ===== 不该出现的(软删的项目 / 已删工作区里的项目)=====
 ('LabBkDeleted0000001','LabThDeleted00000012','text',
  '如果你看到这一条,说明软删的项目漏出来了——这是 bug,请报告。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-35 days') || ' 09:05:00','utc')*1000 AS INTEGER)),
 ('LabBkOrphan00000001','LabThOrphan000000013','text',
  '如果你看到这一条,说明已删工作区里的项目漏出来了——这是 bug,请报告。',NULL,NULL,1,NULL,
  CAST(strftime('%s', date('now','localtime','-80 days') || ' 09:05:00','utc')*1000 AS INTEGER));

-- Attachments: one long inlined lecture extract (pack length stress), one URL, one
-- folder whose path does not exist, one failed extraction.
INSERT INTO attachments (id, block_id, kind, target, label, extracted_text, extracted_at,
                         extraction_kind, include_in_pack, created_at) VALUES
 ('LabAtLecture00000001','LabBkMl000000000002','file',
  '$LAB/files/lecture-03.pdf','lecture-03.pdf',
  replace(hex(zeroblob(120)),'00','第三讲讲义正文。梯度下降的每一步都要在下降最快的方向上走一小段,步长由学习率决定;步子太大会在谷底两侧来回弹,步子太小则收敛得慢。'),
  CAST(strftime('%s','now')*1000 AS INTEGER),'pdf',1,
  CAST(strftime('%s', date('now','localtime','-56 days') || ' 10:21:00','utc')*1000 AS INTEGER)),
 ('LabAtSlides000000002','LabBkMl000000000014','url',
  'https://course.edu/week6/homework','week6 homework',NULL,NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-7 days') || ' 09:01:00','utc')*1000 AS INTEGER)),
 ('LabAtFolder000000003','LabBkJob00000000002','folder',
  '$LAB/files/不存在的目录','求职材料',NULL,NULL,NULL,0,
  CAST(strftime('%s', date('now','localtime','-25 days') || ' 11:41:00','utc')*1000 AS INTEGER)),
 ('LabAtBroken000000004','LabBkJob00000000003','file',
  '$LAB/files/scan.png','scan.png',NULL,
  CAST(strftime('%s','now')*1000 AS INTEGER),'failed',0,
  CAST(strftime('%s', date('now','localtime','-18 days') || ' 14:06:00','utc')*1000 AS INTEGER));
SQL

echo
echo "隔离实验室建好了:$LAB"
sqlite3 "$DATA/spool.db" "SELECT '  工作区 ' || (SELECT COUNT(*) FROM workspaces WHERE deleted_at IS NULL) ||
  ' · 项目 ' || (SELECT COUNT(*) FROM threads WHERE deleted_at IS NULL) ||
  ' · 块 ' || (SELECT COUNT(*) FROM blocks) ||
  ' · 附件 ' || (SELECT COUNT(*) FROM attachments) ||
  '(另有 1 个软删项目 + 1 个软删工作区,不该被任何工具看见)';"

if [ "${1:-}" = "--connect" ]; then
  echo
  connect_claude add
  connect_claude_code add
  connect_codex add
  echo
  echo "客户端要完全退出再打开一次才会加载新服务器。"
else
  cat <<TXT

接上去(哪个客户端要测就接哪个,服务器名字必须是 spool_lab,别叫 spool):

  Claude Desktop → 编辑
  $CLAUDE_CFG
  在 "mcpServers" 里加一条:
    "spool_lab": { "command": "$LAB/spool-lab-server", "args": ["--mcp"] }

  Claude Code → 编辑
  $CC_CFG
  在顶层 "mcpServers" 里加一条:
    "spool_lab": { "type": "stdio", "command": "$LAB/spool-lab-server", "args": ["--mcp"], "env": {} }

  ChatGPT 桌面版 → 编辑
  $CODEX_CFG
  在文件末尾加一段:
    [mcp_servers.spool_lab]
    command = "$LAB/spool-lab-server"
    args = ["--mcp"]

  懒得手改:重跑一次 scripts/seed-mcp-lab.sh --connect(会先备份原文件)。
  测完拆掉:scripts/seed-mcp-lab.sh --disconnect,再 rm -rf "$LAB"。
TXT
fi

echo
echo "提示词在 docs/MCP_LAB_PROMPT.md。改了 Rust 代码要先 cargo build --release,再重跑本脚本。"
