//! §20.12 MCP local server — `spool --mcp`.
//!
//! A minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0),
//! run when the binary is launched with `--mcp` INSTEAD of the GUI (main.rs branches
//! before the Tauri builder, so single-instance handoff never fires). MCP clients
//! (Claude, Cursor, …) spawn this process themselves; nothing listens on any port and
//! nothing runs unless the user configured their client — plus the tools refuse until
//! the 「MCP 服务」 toggle in Spool's settings is ON (default OFF, §20.12).
//!
//! Exactly two READ-ONLY tools (§20.12 scope):
//!   list_threads          — workspaces + live threads, so the client can discover ids.
//!   get_pack(thread_id, range?) — the §9.5 pack text for one thread.
//!
//! The pack renderer below is a line-for-line port of src/lib/pack/assemble.ts +
//! templates.ts. **Sync discipline**: any change to those files must be mirrored here;
//! the cross-language golden test (`golden_pack_matches_fixture` + the TS twin in
//! assemble.test.ts, both asserting against src/lib/pack/fixtures/golden-pack.expected.txt)
//! fails until the two renderers agree byte-for-byte (timestamps normalized — local-time
//! rendering makes raw bytes timezone-dependent).

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;

// ---------------------------------------------------------------------------------------
// Template constants — verbatim from src/lib/pack/templates.ts (see sync discipline above).
// ---------------------------------------------------------------------------------------

const NOTE_INDENT: &str = "    ";
const EXTRACT_INDENT: &str = "      ";
const PINNED_PREFIX: &str = "📌 ";
const EXTRACT_CHAR_CAP: usize = 8000;

const SOURCE_MARKER: &str = " · from ";
const NOTE_MARKER: &str = "note: ";
const FILE_MARKER: &str = "↳ attached file: ";
const FOLDER_MARKER: &str = "↳ attached folder: ";
const URL_MARKER: &str = "↳ attached URL: ";
const REF_MARKER: &str = "→ Referenced thread: ";
const ATTACHMENT_SEE_BELOW: &str = " — see Related Files & Links section below";

const SECTION_PINNED: &str = "## Pinned Blocks";
const SECTION_LOG: &str = "## Full Record (chronological)";
const SECTION_FILES: &str = "## Related Files & Links";

const EMPTY_PINNED_LINE: &str = "(no pinned blocks)";
const EMPTY_LOG_LINE: &str = "(no blocks yet)";
const UNKNOWN_THREAD: &str = "(unknown thread)";

const INSTRUCTION_HEADER: &str = r#"---

## How to Read This Context

The blocks below come from FOUR different authority categories. Treat each
category according to the rules in this section. This sorting matters —
mishandling categories will produce wrong or unsafe output.

### 📖 Reference (authoritative)
Blocks whose `source` looks like an institutional / official artifact:
- email clients (Mail, Outlook, etc.)
- school / institutional domains
- file attachments (PDF, docx, slides)
- forum / platform posts from authoritative figures

**Handling**: Treat as ground truth. Do not contradict. Do not extrapolate
beyond what they say. If they conflict with other categories, Reference wins.

### 🧩 Synthesis (already-formed understanding)
Blocks whose `source` is another AI tool (Claude, ChatGPT, Gemini, etc.)
AND whose content has the shape of a long structured explanation (headings,
formulas, multi-paragraph essays).

**Handling**: These are someone else's synthesis. They may be useful as
background or framing, but their correctness is not guaranteed. Do not
treat them as facts. If they contradict Reference, defer to Reference.
Do not copy them wholesale into your output.

### 🔄 Process (conversation traces — read for evolution, not facts)
Blocks whose `source` is another AI tool AND whose content has the shape
of a question-and-answer dialogue (multiple turns, short exchanges,
dialogue markers like "User:" or "Q:" or "我:", high question density).

**Handling**: The literal content of these blocks is NOT a reliable source
of facts. What IS reliable is the user's evolving questions — what they
ask repeatedly, where they got confused, what they kept circling back to.
Extract these as signals of the user's cognitive gaps and address them,
but never quote the AI responses inside these blocks as if they were
authoritative.

### 💭 Personal (the user's own hypotheses and notes)
Blocks with no `source` field — these are typed by the user directly
into Spool. They represent the user's current understanding, often
incomplete or speculative.

**Handling**: Read these to understand where the user currently stands.
If they contain factual errors, point them out directly — do not protect
the user's feelings at the cost of correctness.

### ⭐ User-highlighted spans (`==…==`)
Substrings wrapped in `==…==` inside any block above are sentence-level key points the user emphasized at capture time — prioritize them. They coexist with pinned blocks (pin = whole block is core context; highlight = a sentence within a block is key); when a highlight sits inside a pinned block, treat it as one emphasis, not two.

---"#;

const OUTPUT_LANGUAGE: &str = r#"## Output Language

Respond in Simplified Chinese unless content itself dictates otherwise
(e.g. don't translate quoted English source material). Technical terms
may stay in their original language."#;

fn truncation_marker(remainder: usize) -> String {
    format!("[... truncated, {remainder} more chars not shown ...]")
}

// ---------------------------------------------------------------------------------------
// Data rows
// ---------------------------------------------------------------------------------------

pub struct BlockRow {
    pub id: String,
    pub kind: String,
    pub content: String,
    pub annotation: Option<String>,
    pub ref_thread_id: Option<String>,
    pub source: Option<String>,
    pub pinned: bool,
    pub created_at: i64,
}

pub struct AttachmentRow {
    pub block_id: String,
    pub kind: String,
    pub target: String,
    pub label: String,
    pub extracted_text: Option<String>,
    pub extraction_kind: Option<String>,
    pub include_in_pack: bool,
}

// ---------------------------------------------------------------------------------------
// Time formatting — local time via libc::localtime_r, mirroring the frontend's
// formatPackTime/formatPackDate (JS Date renders in the machine's local zone; the pack
// must read identically whether produced by PackDialog or by this server).
// ---------------------------------------------------------------------------------------

fn local_tm(epoch_ms: i64) -> libc::tm {
    let secs = (epoch_ms.div_euclid(1000)) as libc::time_t;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe {
        libc::localtime_r(&secs, &mut tm);
    }
    tm
}

pub fn format_pack_time(epoch_ms: i64) -> String {
    let tm = local_tm(epoch_ms);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min
    )
}

pub fn format_pack_date(epoch_ms: i64) -> String {
    let tm = local_tm(epoch_ms);
    format!("{:04}-{:02}-{:02}", tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday)
}

// ---------------------------------------------------------------------------------------
// Renderer — port of assemble.ts (sync discipline in the module header).
// ---------------------------------------------------------------------------------------

fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn attachment_label(a: &AttachmentRow) -> &str {
    let trimmed = a.label.trim();
    if trimmed.is_empty() {
        &a.target
    } else {
        trimmed
    }
}

// JS `text.slice(0, 8000)` counts UTF-16 code units; here we count chars (Unicode
// scalars). They agree for everything except astral-plane characters straddling the
// cap — an acceptable off-by-a-few on an 8000-char truncation boundary.
fn render_extracted_text(text: &str) -> String {
    let total = text.chars().count();
    let (body, marker) = if total > EXTRACT_CHAR_CAP {
        let body: String = text.chars().take(EXTRACT_CHAR_CAP).collect();
        (body, format!("\n{}", truncation_marker(total - EXTRACT_CHAR_CAP)))
    } else {
        (text.to_string(), String::new())
    };
    format!("{body}{marker}")
        .split('\n')
        .map(|line| format!("{EXTRACT_INDENT}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_attachment(a: &AttachmentRow) -> Vec<String> {
    let label = attachment_label(a);
    if a.kind == "url" {
        return vec![format!("{NOTE_INDENT}{URL_MARKER}{label} — {}", a.target)];
    }
    if a.kind == "folder" {
        return vec![format!("{NOTE_INDENT}{FOLDER_MARKER}{label}{ATTACHMENT_SEE_BELOW}")];
    }
    // kind == "file"
    if let Some(text) = a.extracted_text.as_deref() {
        if a.include_in_pack {
            let ext_kind = a.extraction_kind.as_deref().unwrap_or("text");
            return vec![
                format!("{NOTE_INDENT}{FILE_MARKER}{label} ({ext_kind})"),
                render_extracted_text(text),
            ];
        }
    }
    vec![format!("{NOTE_INDENT}{FILE_MARKER}{label}{ATTACHMENT_SEE_BELOW}")]
}

fn render_block(
    b: &BlockRow,
    attachments: &[AttachmentRow],
    ref_titles: &std::collections::HashMap<String, String>,
) -> Vec<String> {
    let time = format_pack_time(b.created_at);
    let star = if b.pinned { PINNED_PREFIX } else { "" };
    let mut lines: Vec<String> = Vec::new();

    if b.kind == "ref" {
        let from_map = b
            .ref_thread_id
            .as_ref()
            .and_then(|id| ref_titles.get(id))
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty());
        let title = from_map.unwrap_or(if b.content.is_empty() { UNKNOWN_THREAD } else { &b.content });
        lines.push(format!("{star}[{time}] {REF_MARKER}{title}"));
    } else {
        let bracket = match b.source.as_deref() {
            Some(src) => format!("{time}{SOURCE_MARKER}{src}"),
            None => time,
        };
        lines.push(format!("{star}[{bracket}] {}", b.content.trim()));
    }

    if let Some(note) = b.annotation.as_deref() {
        if !note.trim().is_empty() {
            lines.push(format!("{NOTE_INDENT}{NOTE_MARKER}{}", one_line(note)));
        }
    }
    for a in attachments.iter().filter(|a| a.block_id == b.id) {
        lines.extend(render_attachment(a));
    }
    lines
}

// §17 range filter — port of filterBlocksForRange (assemble.ts).
pub fn filter_blocks_for_range(blocks: Vec<BlockRow>, range: &str, now_ms: i64) -> Vec<BlockRow> {
    match range {
        "pinned" => blocks.into_iter().filter(|b| b.pinned).collect(),
        "last7" | "last30" => {
            let days: i64 = if range == "last7" { 7 } else { 30 };
            let cutoff = now_ms - days * 86_400_000;
            blocks.into_iter().filter(|b| b.created_at >= cutoff).collect()
        }
        _ => blocks, // "all"
    }
}

pub fn assemble_pack(
    thread_title: &str,
    blocks: &[BlockRow],
    attachments: &[AttachmentRow],
    ref_titles: &std::collections::HashMap<String, String>,
    now_ms: i64,
) -> String {
    let date_str = format_pack_date(now_ms);
    let mut out: Vec<String> = Vec::new();

    let title = if thread_title.is_empty() { "(untitled)" } else { thread_title };
    out.push(format!(
        "# Project Context: {title}\n\nGenerated by Spool on {date_str}. {} blocks total.",
        blocks.len()
    ));
    out.push(String::new());
    out.push(INSTRUCTION_HEADER.to_string());

    out.push(String::new());
    out.push(SECTION_PINNED.to_string());
    out.push(String::new());
    let pinned: Vec<&BlockRow> = blocks.iter().filter(|b| b.pinned).collect();
    if pinned.is_empty() {
        out.push(EMPTY_PINNED_LINE.to_string());
    } else {
        for b in &pinned {
            out.extend(render_block(b, attachments, ref_titles));
        }
    }

    out.push(String::new());
    out.push(SECTION_LOG.to_string());
    out.push(String::new());
    if blocks.is_empty() {
        out.push(EMPTY_LOG_LINE.to_string());
    } else {
        for b in blocks {
            out.extend(render_block(b, attachments, ref_titles));
        }
    }

    if !attachments.is_empty() {
        out.push(String::new());
        out.push(SECTION_FILES.to_string());
        out.push(String::new());
        for a in attachments {
            let not_inlined = if a.kind == "file" && a.extracted_text.is_some() && !a.include_in_pack
            {
                "  [extracted: yes, not inlined]"
            } else {
                ""
            };
            out.push(format!("- {} — {}{not_inlined}", attachment_label(a), a.target));
        }
    }

    // MCP packs carry no §20.7 task template (design decision Q3) — the user states the
    // task in their own chat turn. Straight to the closing language directive.
    out.push(String::new());
    out.push("---".to_string());
    out.push(String::new());
    out.push(OUTPUT_LANGUAGE.to_string());

    out.join("\n") + "\n"
}

// ---------------------------------------------------------------------------------------
// App data dir + settings gate
// ---------------------------------------------------------------------------------------

// Must mirror tauri.conf.json's identifier — the GUI stores spool.db / settings.json
// under the Tauri app-config dir derived from it. SPOOL_DATA_DIR overrides for tests.
const APP_IDENTIFIER: &str = "com.oceanjin.spool";

fn app_data_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("SPOOL_DATA_DIR") {
        return Some(PathBuf::from(dir));
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home).join("Library/Application Support").join(APP_IDENTIFIER))
    }
    #[cfg(target_os = "windows")]
    {
        let roaming = std::env::var("APPDATA").ok()?;
        Some(PathBuf::from(roaming).join(APP_IDENTIFIER))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let base = std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|_| std::env::var("HOME").map(|h| PathBuf::from(h).join(".config")))
            .ok()?;
        Some(base.join(APP_IDENTIFIER))
    }
}

// The 「MCP 服务」 toggle (§20.12, default OFF) persisted by the frontend's settings
// store (tauri-plugin-store → settings.json in the same dir as spool.db).
fn mcp_enabled(dir: &std::path::Path) -> bool {
    let Ok(raw) = std::fs::read_to_string(dir.join("settings.json")) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    v.get("mcpEnabled").and_then(Value::as_bool).unwrap_or(false)
}

// ---------------------------------------------------------------------------------------
// Queries (read-only connection per call — freshness by construction, §20.12 Q4)
// ---------------------------------------------------------------------------------------

fn open_db(dir: &std::path::Path) -> Result<Connection, String> {
    let path = dir.join("spool.db");
    if !path.exists() {
        return Err("Spool 数据库不存在 — 请先启动一次 Spool 应用。".to_string());
    }
    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("打开数据库失败: {e}"))
}

fn list_threads_json(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.status, t.updated_at, w.title,
                    (SELECT COUNT(*) FROM blocks b WHERE b.thread_id = t.id)
             FROM threads t JOIN workspaces w ON w.id = t.workspace_id
             WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL
             ORDER BY w.sort_order ASC, w.created_at ASC, t.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "thread_id": r.get::<_, String>(0)?,
                "title": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?,
                "updated_at": format_pack_time(r.get::<_, i64>(3)?),
                "workspace": r.get::<_, String>(4)?,
                "blocks": r.get::<_, i64>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())
}

fn get_pack_text(conn: &Connection, thread_id: &str, range: &str) -> Result<String, String> {
    let (title, deleted): (String, Option<i64>) = conn
        .query_row(
            "SELECT title, deleted_at FROM threads WHERE id = ?1",
            [thread_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| format!("没有 id 为 {thread_id} 的脉络 — 先用 list_threads 查看有效 id。"))?;
    if deleted.is_some() {
        return Err("该脉络已被删除。".to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, kind, content, annotation, ref_thread_id, source, pinned, created_at
             FROM blocks WHERE thread_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let blocks: Vec<BlockRow> = stmt
        .query_map([thread_id], |r| {
            Ok(BlockRow {
                id: r.get(0)?,
                kind: r.get(1)?,
                content: r.get(2)?,
                annotation: r.get(3)?,
                ref_thread_id: r.get(4)?,
                source: r.get(5)?,
                pinned: r.get::<_, i64>(6)? == 1,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let blocks = filter_blocks_for_range(blocks, range, now_ms);

    // Attachments narrowed to the surviving blocks — mirrors PackDialog's range behavior
    // ("Related Files & Links" must not point at content the pack omitted).
    let mut stmt = conn
        .prepare(
            "SELECT a.block_id, a.kind, a.target, a.label, a.extracted_text,
                    a.extraction_kind, a.include_in_pack
             FROM attachments a JOIN blocks b ON b.id = a.block_id
             WHERE b.thread_id = ?1 ORDER BY a.created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let block_ids: std::collections::HashSet<&str> = blocks.iter().map(|b| b.id.as_str()).collect();
    let attachments: Vec<AttachmentRow> = stmt
        .query_map([thread_id], |r| {
            Ok(AttachmentRow {
                block_id: r.get(0)?,
                kind: r.get(1)?,
                target: r.get(2)?,
                label: r.get(3)?,
                extracted_text: r.get(4)?,
                extraction_kind: r.get(5)?,
                include_in_pack: r.get::<_, i64>(6)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|a| block_ids.contains(a.block_id.as_str()))
        .collect();

    // Titles for rendering kind=ref blocks. All threads (even deleted) — the renderer
    // falls back to the ref block's own content snapshot when the map misses.
    let mut stmt = conn.prepare("SELECT id, title FROM threads").map_err(|e| e.to_string())?;
    let ref_titles: std::collections::HashMap<String, String> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    Ok(assemble_pack(&title, &blocks, &attachments, &ref_titles, now_ms))
}

// ---------------------------------------------------------------------------------------
// JSON-RPC / MCP loop
// ---------------------------------------------------------------------------------------

const RANGE_VALUES: [&str; 4] = ["all", "pinned", "last7", "last30"];

fn tools_descriptor() -> Value {
    json!([
        {
            "name": "list_threads",
            "description": "List every workspace and live thread in Spool (思簿), with thread ids, status, block counts and last-updated times. Call this first to find the thread_id for get_pack.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_pack",
            "description": "Return Spool's paste-ready context briefing (the 'pack') for one thread — the full project context a user would otherwise paste by hand. The text starts with reading instructions; follow them.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Thread id from list_threads." },
                    "range": {
                        "type": "string",
                        "enum": RANGE_VALUES,
                        "description": "Optional scope: all (default), pinned (user-marked core blocks only), last7 / last30 (blocks captured in the last N days)."
                    }
                },
                "required": ["thread_id"],
                "additionalProperties": false
            }
        }
    ])
}

fn tool_result_text(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

fn handle_tool_call(params: &Value) -> Value {
    let Some(dir) = app_data_dir() else {
        return tool_result_text("无法定位 Spool 数据目录。".to_string(), true);
    };
    if !mcp_enabled(&dir) {
        return tool_result_text(
            "Spool 的 MCP 服务未开启。请在 Spool → 设置 → 通用 → 「MCP 服务」打开开关后重试。"
                .to_string(),
            true,
        );
    }
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

    let run = || -> Result<String, String> {
        let conn = open_db(&dir)?;
        match name {
            "list_threads" => list_threads_json(&conn),
            "get_pack" => {
                let thread_id = args
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .ok_or("缺少 thread_id 参数。")?;
                let range = args.get("range").and_then(Value::as_str).unwrap_or("all");
                if !RANGE_VALUES.contains(&range) {
                    return Err(format!("range 必须是 {RANGE_VALUES:?} 之一。"));
                }
                get_pack_text(&conn, thread_id, range)
            }
            other => Err(format!("未知工具: {other}")),
        }
    };

    match run() {
        Ok(text) => tool_result_text(text, false),
        Err(msg) => tool_result_text(msg, true),
    }
}

fn handle_request(method: &str, params: &Value) -> Result<Value, (i64, String)> {
    match method {
        "initialize" => {
            // Echo the client's protocol version (they only send ones they support);
            // fall back to the last revision this server was written against.
            let proto = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("2024-11-05");
            Ok(json!({
                "protocolVersion": proto,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "spool", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Spool (思簿) is the user's local context hub. Use list_threads to discover projects, then get_pack to pull one thread's full context briefing before helping with it."
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools_descriptor() })),
        "tools/call" => Ok(handle_tool_call(params)),
        _ => Err((-32601, format!("method not found: {method}"))),
    }
}

pub fn run() {
    // stdout carries ONLY protocol frames; all logging goes to stderr.
    eprintln!("[mcp] spool --mcp starting (data dir: {:?})", app_data_dir());
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(line) else {
            eprintln!("[mcp] skipping unparseable line");
            continue;
        };
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let id = msg.get("id").cloned();
        let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));

        // Notifications (no id) get no response — including notifications/initialized.
        let Some(id) = id else { continue };

        let response = match handle_request(method, &params) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => json!({
                "jsonrpc": "2.0", "id": id,
                "error": { "code": code, "message": message }
            }),
        };
        let mut out = stdout.lock();
        if writeln!(out, "{response}").and_then(|()| out.flush()).is_err() {
            break; // client closed the pipe
        }
    }
    eprintln!("[mcp] stdin closed; exiting");
}

// ---------------------------------------------------------------------------------------
// Golden equivalence test — see module header. The fixture + expected text live under
// src/lib/pack/fixtures/ and are shared with the TS twin in assemble.test.ts.
// ---------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    const FIXTURE: &str = include_str!("../../src/lib/pack/fixtures/golden-pack.json");
    const EXPECTED: &str = include_str!("../../src/lib/pack/fixtures/golden-pack.expected.txt");

    // Replace every YYYY-MM-DD[ HH:MM] with a fixed token — local-time rendering makes
    // raw bytes timezone-dependent, and the golden file must hold on any machine. The
    // TS twin applies the same normalization (assemble.test.ts).
    fn normalize_dates(s: &str) -> String {
        let b: Vec<char> = s.chars().collect();
        let is_d = |c: char| c.is_ascii_digit();
        let mut out = String::new();
        let mut i = 0;
        while i < b.len() {
            let date_ahead = i + 10 <= b.len()
                && is_d(b[i]) && is_d(b[i + 1]) && is_d(b[i + 2]) && is_d(b[i + 3])
                && b[i + 4] == '-' && is_d(b[i + 5]) && is_d(b[i + 6])
                && b[i + 7] == '-' && is_d(b[i + 8]) && is_d(b[i + 9]);
            if date_ahead {
                let mut j = i + 10;
                let time_ahead = j + 6 <= b.len()
                    && b[j] == ' ' && is_d(b[j + 1]) && is_d(b[j + 2]) && b[j + 3] == ':'
                    && is_d(b[j + 4]) && is_d(b[j + 5]);
                if time_ahead {
                    j += 6;
                }
                out.push_str("<DATE>");
                i = j;
            } else {
                out.push(b[i]);
                i += 1;
            }
        }
        out
    }

    fn fixture_rows() -> (String, Vec<BlockRow>, Vec<AttachmentRow>, HashMap<String, String>, i64) {
        let v: Value = serde_json::from_str(FIXTURE).unwrap();
        let title = v["thread"]["title"].as_str().unwrap().to_string();
        let now = v["now"].as_i64().unwrap();
        let blocks = v["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| BlockRow {
                id: b["id"].as_str().unwrap().to_string(),
                kind: b["kind"].as_str().unwrap().to_string(),
                content: b["content"].as_str().unwrap().to_string(),
                annotation: b["annotation"].as_str().map(String::from),
                ref_thread_id: b["refThreadId"].as_str().map(String::from),
                source: b["source"].as_str().map(String::from),
                pinned: b["pinned"].as_bool().unwrap(),
                created_at: b["createdAt"].as_i64().unwrap(),
            })
            .collect();
        let attachments = v["attachments"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| AttachmentRow {
                block_id: a["blockId"].as_str().unwrap().to_string(),
                kind: a["kind"].as_str().unwrap().to_string(),
                target: a["target"].as_str().unwrap().to_string(),
                label: a["label"].as_str().unwrap().to_string(),
                extracted_text: a["extractedText"].as_str().map(String::from),
                extraction_kind: a["extractionKind"].as_str().map(String::from),
                include_in_pack: a["includeInPack"].as_bool().unwrap(),
            })
            .collect();
        let ref_titles = v["refTitles"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, val)| (k.clone(), val.as_str().unwrap().to_string()))
            .collect();
        (title, blocks, attachments, ref_titles, now)
    }

    #[test]
    fn golden_pack_matches_fixture() {
        let (title, blocks, attachments, ref_titles, now) = fixture_rows();
        let out = assemble_pack(&title, &blocks, &attachments, &ref_titles, now);
        assert_eq!(normalize_dates(&out), normalize_dates(EXPECTED));
    }

    #[test]
    fn range_filter_matches_ts_semantics() {
        let (_, blocks, _, _, now) = fixture_rows();
        let total = blocks.len();
        let all = filter_blocks_for_range(fixture_rows().1, "all", now).len();
        let pinned = filter_blocks_for_range(fixture_rows().1, "pinned", now).len();
        assert_eq!(all, total);
        assert!(pinned < total && pinned >= 1);
        for b in filter_blocks_for_range(fixture_rows().1, "pinned", now) {
            assert!(b.pinned);
        }
        for b in filter_blocks_for_range(fixture_rows().1, "last7", now) {
            assert!(b.created_at >= now - 7 * 86_400_000);
        }
    }

    #[test]
    fn pack_time_format_shape() {
        let s = format_pack_time(1_750_000_000_000);
        assert_eq!(s.len(), 16);
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[13..14], ":");
    }
}
