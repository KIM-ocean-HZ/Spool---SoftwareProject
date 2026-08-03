//! §20.12 MCP local server — `spool --mcp`.
//!
//! A minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0),
//! run when the binary is launched with `--mcp` INSTEAD of the GUI (main.rs branches
//! before the Tauri builder, so single-instance handoff never fires). MCP clients
//! (Claude, Cursor, …) spawn this process themselves; nothing listens on any port and
//! nothing runs unless the user configured their client — plus the tools refuse until
//! the 「MCP 服务」 toggle in Spool's settings is ON (default OFF, §20.12).
//!
//! Tool surface (§20.13 v2.2, 2026-07-10) — reads, gated by mcpEnabled:
//!   list_threads / search_blocks / find_similar_blocks / get_blocks / get_pack,
//!   plus spool://thread/<id> resources and the compress_pack prompt.
//! Writes, additionally gated by mcpWriteEnabled (separate consent):
//!   create_thread / add_block (append-only, attributed) / set_thread_summary
//!   (provenance-guarded — never overwrites a user-written summary).
//!
//! The pack renderer below is a line-for-line port of src/lib/pack/assemble.ts +
//! templates.ts. **Sync discipline**: any change to those files must be mirrored here;
//! the cross-language golden test (`golden_pack_matches_fixture` + the TS twin in
//! assemble.test.ts, both asserting against src/lib/pack/fixtures/golden-pack.expected.txt)
//! fails until the two renderers agree byte-for-byte (timestamps normalized — local-time
//! rendering makes raw bytes timezone-dependent).

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::collections::HashSet;
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
const REF_MARKER: &str = "→ Referenced project: ";
// v2.4 (§20.13 D2) — mirrors templates.ts REF_BLOCK_MARKER / REF_BLOCK_MISSING.
const REF_BLOCK_MARKER: &str = "↩ cites: ";
const REF_BLOCK_MISSING: &str = "(cited block no longer exists)";
const ATTACHMENT_SEE_BELOW: &str = " — see Related Files & Links section below";

const SECTION_PINNED: &str = "## Pinned Blocks";
const SECTION_LOG: &str = "## Full Record (chronological)";
const SECTION_FILES: &str = "## Related Files & Links";

const EMPTY_PINNED_LINE: &str = "(no pinned blocks)";
// 2026-07-09 (P0-3): pinned blocks render in full only in Pinned Blocks; their Full
// Record slot is this placeholder. Mirrors templates.ts PINNED_SEE_ABOVE.
const PINNED_SEE_ABOVE: &str = "(pinned — full text in \"Pinned Blocks\" above)";
const EMPTY_LOG_LINE: &str = "(no blocks yet)";
const UNKNOWN_THREAD: &str = "(unknown project)";

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
    pub ref_block_id: Option<String>,
    pub source: Option<String>,
    pub pinned: bool,
    pub created_at: i64,
}

// v2.4 (D2): cited block id → (content, created_at) — mirrors assemble.ts refBlocks.
pub type RefBlocks = std::collections::HashMap<String, (String, i64)>;

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

// The one block-header line (📌 star, time/source bracket, ref-title fallback) shared
// by the pack and digest renderers — the two surfaces must never drift (they promise
// the same source labels). `content_cap` is the digest's truncation; None = verbatim.
fn block_head_line(
    b: &BlockRow,
    ref_titles: &std::collections::HashMap<String, String>,
    content_cap: Option<usize>,
) -> String {
    let time = format_pack_time(b.created_at);
    let star = if b.pinned { PINNED_PREFIX } else { "" };
    if b.kind == "ref" {
        let from_map = b
            .ref_thread_id
            .as_ref()
            .and_then(|id| ref_titles.get(id))
            .map(|s| s.as_str())
            .filter(|s| !s.is_empty());
        let title = from_map.unwrap_or(if b.content.is_empty() { UNKNOWN_THREAD } else { &b.content });
        return format!("{star}[{time}] {REF_MARKER}{title}");
    }
    let bracket = match b.source.as_deref() {
        Some(src) => format!("{time}{SOURCE_MARKER}{src}"),
        None => time,
    };
    let content = b.content.trim();
    let body: String = match content_cap {
        Some(cap) if content.chars().count() > cap => {
            let head: String = content.chars().take(cap).collect();
            format!("{head}\n{}", truncation_marker(content.chars().count() - cap))
        }
        _ => content.to_string(),
    };
    format!("{star}[{bracket}] {body}")
}

// The `note:` sub-line under a block, shared by both renderers.
fn block_note_line(b: &BlockRow) -> Option<String> {
    let note = b.annotation.as_deref()?;
    if note.trim().is_empty() {
        return None;
    }
    Some(format!("{NOTE_INDENT}{NOTE_MARKER}{}", one_line(note)))
}

fn render_block(
    b: &BlockRow,
    attachments: &[AttachmentRow],
    ref_titles: &std::collections::HashMap<String, String>,
    ref_blocks: &RefBlocks,
) -> Vec<String> {
    let mut lines: Vec<String> = vec![block_head_line(b, ref_titles, None)];
    if let Some(note) = block_note_line(b) {
        lines.push(note);
    }
    if let Some(cited_id) = b.ref_block_id.as_deref() {
        lines.push(match ref_blocks.get(cited_id) {
            Some((content, created_at)) => format!(
                "{NOTE_INDENT}{REF_BLOCK_MARKER}[{}] {}",
                format_pack_time(*created_at),
                head_anchor(content)
            ),
            None => format!("{NOTE_INDENT}{REF_BLOCK_MARKER}{REF_BLOCK_MISSING}"),
        });
    }
    for a in attachments.iter().filter(|a| a.block_id == b.id) {
        lines.extend(render_attachment(a));
    }
    lines
}

// Mirrors assemble.ts renderPinnedPlaceholder — a pinned block's chronological slot.
// R2 field report B2: carries a short head anchor (char-truncated, lockstep with TS).
const PLACEHOLDER_HEAD_CHARS: usize = 40;

fn anchor_n(content: &str, n: usize) -> String {
    let one = one_line(content);
    let chars: Vec<char> = one.chars().collect();
    if chars.len() <= n {
        one
    } else {
        let mut s: String = chars[..n].iter().collect();
        s.push('…');
        s
    }
}

fn head_anchor(content: &str) -> String {
    anchor_n(content, PLACEHOLDER_HEAD_CHARS)
}

fn render_pinned_placeholder(b: &BlockRow) -> String {
    let time = format_pack_time(b.created_at);
    let bracket = match b.source.as_deref() {
        Some(src) if b.kind != "ref" => format!("{time}{SOURCE_MARKER}{src}"),
        _ => time,
    };
    let head = head_anchor(&b.content);
    let anchor = if head.is_empty() { String::new() } else { format!("{head} ") };
    format!("{PINNED_PREFIX}[{bracket}] {anchor}{PINNED_SEE_ABOVE}")
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
    ref_blocks: &RefBlocks,
    now_ms: i64,
) -> String {
    assemble_pack_omitting(thread_title, blocks, attachments, ref_titles, ref_blocks, now_ms, 0)
}

// v2.4 (C2): the budgeted variant drops the `omit` OLDEST blocks from the Full Record
// (their slot is one explicit omission line at the top of the section) while the
// skeleton and the complete Pinned Blocks section survive. Related Files & Links lists
// only the kept blocks' attachments — the pack must not point at content it omitted.
// omit == 0 is the plain pack; the golden test pins that path byte-for-byte.
fn assemble_pack_omitting(
    thread_title: &str,
    blocks: &[BlockRow],
    attachments: &[AttachmentRow],
    ref_titles: &std::collections::HashMap<String, String>,
    ref_blocks: &RefBlocks,
    now_ms: i64,
    omit: usize,
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
            out.extend(render_block(b, attachments, ref_titles, ref_blocks));
        }
    }

    let kept = &blocks[omit.min(blocks.len())..];

    out.push(String::new());
    out.push(SECTION_LOG.to_string());
    out.push(String::new());
    if omit > 0 {
        // Honest accounting (review findings): pinned blocks among the omitted slots
        // still render in full above, so only unpinned content counts as lost; the
        // figure is a cheap content+annotation char sum (it is labeled ~ anyway) — no
        // throwaway rendering. No offset/limit recipe either: under range≠all those
        // numbers would address the wrong blocks, and omit can exceed get_blocks' cap.
        let hidden = blocks[..omit].iter().filter(|b| !b.pinned).count();
        let pinned_omitted = omit - hidden;
        let omitted_chars: usize = blocks[..omit]
            .iter()
            .filter(|b| !b.pinned)
            .map(|b| {
                b.content.chars().count()
                    + b.annotation.as_deref().map(|a| a.chars().count()).unwrap_or(0)
            })
            .sum();
        let pinned_note = if pinned_omitted > 0 {
            format!("; {pinned_omitted} pinned shown in full above")
        } else {
            String::new()
        };
        out.push(format!(
            "[... {omit} oldest timeline entries omitted for budget (~{omitted_chars} \
             chars of unpinned content{pinned_note}) — page the thread's older blocks \
             with get_blocks, narrow range, or raise max_chars ...]"
        ));
    }
    if blocks.is_empty() {
        out.push(EMPTY_LOG_LINE.to_string());
    } else {
        for b in kept {
            if b.pinned {
                out.push(render_pinned_placeholder(b));
            } else {
                out.extend(render_block(b, attachments, ref_titles, ref_blocks));
            }
        }
    }

    // Pinned blocks render in full above even when their chronological slot was
    // omitted, so their attachments stay listed too.
    let kept_ids: HashSet<&str> = kept
        .iter()
        .map(|b| b.id.as_str())
        .chain(pinned.iter().map(|b| b.id.as_str()))
        .collect();
    let listed: Vec<&AttachmentRow> = attachments
        .iter()
        .filter(|a| kept_ids.contains(a.block_id.as_str()))
        .collect();
    if !listed.is_empty() {
        out.push(String::new());
        out.push(SECTION_FILES.to_string());
        out.push(String::new());
        for a in listed {
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

// The 「允许 AI 写入」 sub-toggle (§20.13, default OFF — separate consent from reading:
// a user happy to expose packs may still not want an external AI inserting rows).
fn mcp_write_enabled(dir: &std::path::Path) -> bool {
    let Ok(raw) = std::fs::read_to_string(dir.join("settings.json")) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    v.get("mcpWriteEnabled").and_then(Value::as_bool).unwrap_or(false)
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

fn list_threads_json(conn: &Connection, title_contains: Option<&str>) -> Result<String, String> {
    // R3 friction #1: "title → id" without pulling the whole list. Same matching
    // idiom as get_blocks' source_contains (instr + ASCII case-folding).
    if let Some(t) = title_contains {
        if t.trim().is_empty() {
            return Err("title_contains 不能为空串。".to_string());
        }
    }
    // v2.4 (6a): the per-row correlated subqueries scanned blocks once per thread —
    // O(threads × blocks). Two GROUP BY aggregates walk blocks/attachments once each.
    // Equivalence guards: blocks carry no soft-delete (thread/workspace filtering stays
    // in the outer WHERE); the per-attachment 8k inline cap and the
    // include_in_pack + extracted-text conditions live inside the aggregate.
    let mut stmt = conn
        .prepare(&format!(
            "SELECT t.id, t.title, t.status, t.updated_at, w.title,
                    COALESCE(bc.blocks, 0),
                    t.summary,
                    COALESCE(bc.pinned, 0),
                    COALESCE(bc.chars, 0) + COALESCE(ac.att_chars, 0)
             FROM threads t
             JOIN workspaces w ON w.id = t.workspace_id
             LEFT JOIN (SELECT thread_id,
                               COUNT(*) AS blocks,
                               SUM(pinned) AS pinned,
                               SUM(LENGTH(content) + COALESCE(LENGTH(annotation), 0)) AS chars
                          FROM blocks GROUP BY thread_id) bc ON bc.thread_id = t.id
             LEFT JOIN (SELECT b2.thread_id,
                               SUM(MIN(LENGTH(a.extracted_text), 8000)) AS att_chars
                          FROM attachments a JOIN blocks b2 ON b2.id = a.block_id
                         WHERE a.include_in_pack = 1 AND a.extracted_text IS NOT NULL
                         GROUP BY b2.thread_id) ac ON ac.thread_id = t.id
             WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL{title_clause}
             ORDER BY w.sort_order ASC, w.created_at ASC, t.updated_at DESC",
            title_clause = if title_contains.is_some() {
                " AND instr(lower(t.title), lower(?)) > 0"
            } else {
                ""
            }
        ))
        .map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::ToSql> = match &title_contains {
        Some(t) => vec![t],
        None => vec![],
    };
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |r| {
            Ok(json!({
                "thread_id": r.get::<_, String>(0)?,
                "title": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?,
                "updated_at": format_pack_time(r.get::<_, i64>(3)?),
                "workspace": r.get::<_, String>(4)?,
                "blocks": r.get::<_, i64>(5)?,
                // §20.13 v2: the one-liner serves "list with summaries" without a
                // heavyweight get_pack (and without a separate get_thread_meta tool).
                "summary": r.get::<_, Option<String>>(6)?,
                // v2.1 (field report B1): read-cost planning before a get_pack call.
                // approx_pack_chars = content + annotations + inlined attachment text
                // (per-attachment inline cap 8000 mirrored); the fixed pack skeleton
                // adds ~3k on top.
                "pinned": r.get::<_, i64>(7)?,
                "approx_pack_chars": r.get::<_, i64>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())
}

// §20.13 v2: keyword retrieval — "which thread does this belong to". Mirrors the GUI
// search (src/lib/search/query.ts, §9.10) exactly: ≥3 codepoints → phrase-quoted
// trigram FTS5 MATCH ranked by rank; 1–2 codepoints → LIKE scan ordered by recency
// (trigram cannot match shorter queries). Soft-deleted threads/workspaces excluded.
const SEARCH_COLS: &str = "b.id, b.thread_id, b.content, b.annotation, b.created_at,
                           t.title, w.title";
const SEARCH_DEFAULT_LIMIT: i64 = 20;
const SEARCH_MAX_LIMIT: i64 = 50;

// Candidates fetched before the Rust-side word-boundary filter (Latin queries) — the
// filter can only shrink the set, so scan a generous window. Applies to both the LIKE
// path and, since R3 BUG-1, the trigram path (FTS matches substrings by design).
const SEARCH_LIKE_SCAN_CAP: i64 = 200;

fn search_blocks_json(conn: &Connection, query: &str, limit: Option<i64>) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("query 不能为空。".to_string());
    }
    let limit = limit.unwrap_or(SEARCH_DEFAULT_LIMIT).clamp(1, SEARCH_MAX_LIMIT) as usize;
    let n_chars = query.chars().count();
    // Field reports A3 (R2) + BUG-1 (R3): a Latin query must match whole words — "AI"
    // must not hit "obtained", and "GRE" must not hit "degree" (trigram matches
    // substrings at ANY length; the word-boundary post-filter has to cover the FTS path
    // too). A query counts as Latin when it is pure ASCII with alphanumeric ends —
    // phrases with inner spaces/hyphens included. CJK stays substring — that's the
    // whole point of trigram.
    let boundary = query.is_ascii()
        && query.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && query.chars().last().is_some_and(|c| c.is_ascii_alphanumeric());

    struct Cand {
        block_id: String,
        thread_id: String,
        content: String,
        annotation: Option<String>,
        created_at: i64,
        thread_title: String,
        workspace: String,
        // v2.4 (6b): the boundary filter already locates the hit — carry its snippet
        // instead of recomputing at render time.
        snippet: Option<String>,
    }
    let map_row = |r: &rusqlite::Row| -> rusqlite::Result<Cand> {
        Ok(Cand {
            block_id: r.get(0)?,
            thread_id: r.get(1)?,
            content: r.get(2)?,
            annotation: r.get(3)?,
            created_at: r.get(4)?,
            thread_title: r.get(5)?,
            workspace: r.get(6)?,
            snippet: None,
        })
    };

    // Shared word-boundary post-filter (6b keeps the located snippet on the candidate).
    let boundary_filter = |rows: Vec<Cand>| -> Vec<Cand> {
        rows.into_iter()
            .filter_map(|mut c| {
                // Same precedence as the render step: content hit first, else the
                // annotation with the note: prefix.
                let snip = snippet_around(&c.content, query, true).or_else(|| {
                    c.annotation
                        .as_deref()
                        .and_then(|a| snippet_around(a, query, true))
                        .map(|s| format!("{NOTE_MARKER}{s}"))
                })?;
                c.snippet = Some(snip);
                Some(c)
            })
            .collect()
    };

    let (cands, total): (Vec<Cand>, i64) = if n_chars >= 3 {
        let phrase = format!("\"{}\"", query.replace('"', "\"\""));
        let where_fts = "FROM blocks_fts
                 JOIN blocks b ON b.rowid = blocks_fts.rowid
                 JOIN threads t ON t.id = b.thread_id
                 JOIN workspaces w ON w.id = t.workspace_id
                 WHERE blocks_fts MATCH ?1 AND t.deleted_at IS NULL AND w.deleted_at IS NULL";
        // Latin queries: rank-ordered scan window, then the word-boundary filter — the
        // raw FTS count would include substring hits ("GRE" in "degree"), so total is
        // the filtered count within the scan cap, mirroring the LIKE path.
        let fetch = if boundary { SEARCH_LIKE_SCAN_CAP } else { limit as i64 };
        let mut stmt = conn
            .prepare(&format!("SELECT {SEARCH_COLS} {where_fts} ORDER BY rank LIMIT ?2"))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![&phrase, fetch], |r| map_row(r))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if boundary {
            let rows = boundary_filter(rows);
            let total = rows.len() as i64; // within the scan cap
            (rows, total)
        } else {
            let total: i64 = conn
                .query_row(&format!("SELECT count(*) {where_fts}"), [&phrase], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            (rows, total)
        }
    } else {
        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {SEARCH_COLS} FROM blocks b
                 JOIN threads t ON t.id = b.thread_id
                 JOIN workspaces w ON w.id = t.workspace_id
                 WHERE (b.content LIKE ?1 ESCAPE '\\' OR b.annotation LIKE ?1 ESCAPE '\\')
                   AND t.deleted_at IS NULL AND w.deleted_at IS NULL
                 ORDER BY b.created_at DESC LIMIT ?2"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![format!("%{escaped}%"), SEARCH_LIKE_SCAN_CAP], |r| {
                map_row(r)
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let rows: Vec<Cand> = if boundary { boundary_filter(rows) } else { rows };
        let total = rows.len() as i64; // within the scan cap
        (rows, total)
    };

    let hits: Vec<Value> = cands
        .iter()
        .take(limit)
        .map(|c| {
            // Snippet from wherever the hit actually is; annotation-only matches used
            // to show an unrelated content head with no visible hit (field report A3).
            // The boundary path computed it during filtering (6b).
            let snippet = c
                .snippet
                .clone()
                .or_else(|| snippet_around(&c.content, query, boundary))
                .or_else(|| {
                    c.annotation
                        .as_deref()
                        .and_then(|a| snippet_around(a, query, boundary))
                        .map(|s| format!("{NOTE_MARKER}{s}"))
                })
                .unwrap_or_else(|| head_snippet(&c.content));
            json!({
                "block_id": c.block_id,
                "thread_id": c.thread_id,
                "snippet": snippet,
                "annotation": c.annotation,
                "created_at": format_pack_time(c.created_at),
                "thread_title": c.thread_title,
                "workspace": c.workspace,
            })
        })
        .collect();
    serde_json::to_string_pretty(&json!({
        "query": query,
        "total": total,
        "returned": hits.len(),
        "hits": hits,
    }))
    .map_err(|e| e.to_string())
}

// ±80 chars of context around the first case-insensitive hit, the hit itself wrapped
// in **…** so the caller can see WHY a row matched. Char-based scan — no UTF-8
// boundary risk; O(n·m) is fine at block sizes.
const SNIPPET_CONTEXT_CHARS: usize = 80;

fn snippet_around(text: &str, query: &str, boundary: bool) -> Option<String> {
    let hay: Vec<char> = text.chars().collect();
    let hay_lc: Vec<char> = text.to_lowercase().chars().collect();
    // to_lowercase can change length for a handful of scripts; bail to the caller's
    // fallback rather than risk misaligned indices.
    if hay.len() != hay_lc.len() {
        return None;
    }
    let needle: Vec<char> = query.to_lowercase().chars().collect();
    let i = find_hit(&hay_lc, &needle, boundary)?;
    let hit_end = i + needle.len();
    let start = i.saturating_sub(SNIPPET_CONTEXT_CHARS);
    let end = (hit_end + SNIPPET_CONTEXT_CHARS).min(hay.len());
    let mut s = String::new();
    if start > 0 {
        s.push('…');
    }
    s.extend(&hay[start..i]);
    s.push_str("**");
    s.extend(&hay[i..hit_end]);
    s.push_str("**");
    s.extend(&hay[hit_end..end]);
    if end < hay.len() {
        s.push('…');
    }
    Some(s)
}

fn head_snippet(text: &str) -> String {
    let hay: Vec<char> = text.chars().collect();
    let end = (2 * SNIPPET_CONTEXT_CHARS).min(hay.len());
    let mut s: String = hay[..end].iter().collect();
    if end < hay.len() {
        s.push('…');
    }
    s
}

// First case-insensitive occurrence of `needle` in `hay`; with `boundary`, both
// neighbors must be non-alphanumeric ("AI" hits "AI 模型" but not "obtained").
fn find_hit(hay: &[char], needle: &[char], boundary: bool) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }
    for i in 0..=(hay.len() - needle.len()) {
        if hay[i..i + needle.len()] != *needle {
            continue;
        }
        if boundary {
            let pre_ok = i == 0 || !hay[i - 1].is_ascii_alphanumeric();
            let post = i + needle.len();
            let post_ok = post >= hay.len() || !hay[post].is_ascii_alphanumeric();
            if !pre_ok || !post_ok {
                continue;
            }
        }
        return Some(i);
    }
    None
}

// Duplicate detection (Ocean 2026-07-09 #2): read-only by charter — Spool reports
// near-duplicate groups with their evidence and NEVER merges; merging is curation and
// stays with the user in the GUI (Principle 5). Similarity is character-trigram Jaccard
// over lowercased, whitespace-collapsed text: no new dependency, language-agnostic
// (CJK included), and exact re-captures score 1.0.
const SIMILAR_THRESHOLD: f64 = 0.6;
// Newest text blocks considered — bounds the O(n²) pairwise pass.
const SIMILAR_SCAN_CAP: usize = 1000;
const SIMILAR_DEFAULT_GROUPS: i64 = 10;
const SIMILAR_MAX_GROUPS: i64 = 30;

fn trigram_set(text: &str) -> HashSet<[char; 3]> {
    let norm: Vec<char> = text
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .collect();
    norm.windows(3).map(|w| [w[0], w[1], w[2]]).collect()
}

fn jaccard(a: &HashSet<[char; 3]>, b: &HashSet<[char; 3]>) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count();
    inter as f64 / (a.len() + b.len() - inter) as f64
}

fn find_similar_blocks_json(
    conn: &Connection,
    thread_id: Option<&str>,
    workspace_title: Option<&str>,
    max_groups: Option<i64>,
) -> Result<String, String> {
    let max_groups = max_groups.unwrap_or(SIMILAR_DEFAULT_GROUPS).clamp(1, SIMILAR_MAX_GROUPS) as usize;
    // R3 friction #5: the middle scope between whole-library and one thread.
    if thread_id.is_some() && workspace_title.is_some() {
        return Err(
            "thread_id 已限定单个项目——不要同时传 workspace_title;二选一。".to_string(),
        );
    }
    let ws_id: Option<String> = match workspace_title {
        Some(wt) => Some(resolve_workspace(conn, wt)?.0),
        None => None,
    };
    if let Some(tid) = thread_id {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM threads WHERE id = ?1 AND deleted_at IS NULL",
                [tid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err(format!("没有 id 为 {tid} 的项目 — 先用 list_threads 查看有效 id。"));
        }
    }

    struct Item {
        block_id: String,
        thread_id: String,
        content: String,
        created_at: i64,
        thread_title: String,
        workspace: String,
        // R2 field report C3: the curation-decision fields — "which copy is pinned /
        // annotated / longest" is what the user needs to pick the keeper.
        pinned: bool,
        has_annotation: bool,
        source: Option<String>,
    }
    // ref blocks are pointers, not content — only text blocks can be duplicates.
    let scope_clause = if thread_id.is_some() {
        "AND b.thread_id = ?1"
    } else if ws_id.is_some() {
        "AND w.id = ?1"
    } else {
        ""
    };
    let sql = format!(
        "SELECT b.id, b.thread_id, b.content, b.created_at, t.title, w.title,
                b.pinned, b.annotation IS NOT NULL, b.source
         FROM blocks b
         JOIN threads t ON t.id = b.thread_id
         JOIN workspaces w ON w.id = t.workspace_id
         WHERE b.kind = 'text' AND t.deleted_at IS NULL AND w.deleted_at IS NULL
           {scope_clause} ORDER BY b.created_at DESC LIMIT {SIMILAR_SCAN_CAP}",
    );
    let map_row = |r: &rusqlite::Row| -> rusqlite::Result<Item> {
        Ok(Item {
            block_id: r.get(0)?,
            thread_id: r.get(1)?,
            content: r.get(2)?,
            created_at: r.get(3)?,
            thread_title: r.get(4)?,
            workspace: r.get(5)?,
            pinned: r.get::<_, i64>(6)? == 1,
            has_annotation: r.get::<_, i64>(7)? == 1,
            source: r.get(8)?,
        })
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let scope_param: Option<&str> = thread_id.or(ws_id.as_deref());
    let items: Vec<Item> = match scope_param {
        Some(param) => stmt.query_map([param], map_row),
        None => stmt.query_map([], map_row),
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    let grams: Vec<HashSet<[char; 3]>> = items.iter().map(|i| trigram_set(&i.content)).collect();

    // Pair pass with size pruning (the MCP loop serves requests sequentially, so this
    // call must not stall it): J(A,B) ≤ |smaller|/|larger|, so in descending-size order
    // the inner loop can break as soon as the ratio falls under the threshold — most
    // non-duplicate pairs are never intersected. Matching pairs are recorded once and
    // reused for both grouping and the per-group best similarity.
    let mut order: Vec<usize> = (0..items.len()).collect();
    order.sort_by(|&a, &b| grams[b].len().cmp(&grams[a].len()));
    let mut matches: Vec<(usize, usize, f64)> = Vec::new();
    for oi in 0..order.len() {
        let i = order[oi];
        let li = grams[i].len();
        if li == 0 {
            break; // <3-char contents have no trigrams and can never match
        }
        for &j in &order[oi + 1..] {
            if (grams[j].len() as f64) < SIMILAR_THRESHOLD * li as f64 {
                break; // sorted descending: every later j is smaller still
            }
            let sim = jaccard(&grams[i], &grams[j]);
            if sim >= SIMILAR_THRESHOLD {
                matches.push((i, j, sim));
            }
        }
    }

    // Union-find over the matching pairs; near-duplicate chains collapse into one group.
    let mut parent: Vec<usize> = (0..items.len()).collect();
    fn root(parent: &mut Vec<usize>, mut i: usize) -> usize {
        while parent[i] != i {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        i
    }
    for &(i, j, _) in &matches {
        let (ri, rj) = (root(&mut parent, i), root(&mut parent, j));
        if ri != rj {
            parent[ri] = rj;
        }
    }
    let mut members: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();
    for i in 0..items.len() {
        members.entry(root(&mut parent, i)).or_default().push(i);
    }
    let mut best: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
    for &(i, _, sim) in &matches {
        let r = root(&mut parent, i);
        let e = best.entry(r).or_insert(0.0);
        if sim > *e {
            *e = sim;
        }
    }

    let mut groups: Vec<(f64, Vec<usize>)> = members
        .into_iter()
        .filter(|(_, m)| m.len() >= 2)
        .map(|(r, mut m)| {
            m.sort_by_key(|&i| items[i].created_at);
            (best.get(&r).copied().unwrap_or(0.0), m)
        })
        .collect();
    groups.sort_by(|a, b| b.0.total_cmp(&a.0));
    let total_groups = groups.len();

    let rendered: Vec<Value> = groups
        .iter()
        .take(max_groups)
        .map(|(sim, m)| {
            json!({
                "similarity": (sim * 100.0).round() / 100.0,
                "blocks": m.iter().map(|&i| {
                    let it = &items[i];
                    json!({
                        "block_id": it.block_id,
                        "thread_id": it.thread_id,
                        "thread_title": it.thread_title,
                        "workspace": it.workspace,
                        "preview": head_snippet(&it.content),
                        "created_at": format_pack_time(it.created_at),
                        "length": it.content.chars().count(),
                        "pinned": it.pinned,
                        "has_annotation": it.has_annotation,
                        "source": it.source,
                    })
                }).collect::<Vec<Value>>(),
            })
        })
        .collect();

    serde_json::to_string_pretty(&json!({
        "scanned_blocks": items.len(),
        // R2 C3: cap semantics made explicit — only the newest scan_cap text blocks
        // are considered; on a bigger library, scanned_blocks == scan_cap means older
        // blocks were not examined (scope with thread_id to go deeper).
        "scan_cap": SIMILAR_SCAN_CAP,
        "threshold": SIMILAR_THRESHOLD,
        "total_groups": total_groups,
        "groups": rendered,
        "note": "Spool 不提供合并——把发现讲给用户（用 preview 与 thread_title 指代，勿输出 id；pinned/has_annotation/length 是用户挑保留块的关键信息），由用户在应用里处置。",
    }))
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------
// §20.13 v2.4 (D3): get_digest — the cross-thread briefing ("我最近一周在忙什么").
// Deterministic assembly only (Constitution 4/5): mechanical selection rules — recency
// window, pinned-first, fixed quotas — all disclosed in the output itself; the server
// never judges what matters. Within one calendar day the same DB + same params yield
// byte-identical output (the window is midnight-aligned and the header carries the date,
// not the minute).
// ---------------------------------------------------------------------------------------

const DIGEST_DEFAULT_DAYS: i64 = 7;
const DIGEST_MAX_DAYS: i64 = 90;
const DIGEST_DEFAULT_MAX_CHARS: i64 = 20_000;
// Newest non-pinned window blocks rendered per thread; pinned ride outside the quota.
const DIGEST_THREAD_QUOTA: usize = 5;
// Per-block render cap — the digest is a breadth tool; depth belongs to get_pack.
const DIGEST_BLOCK_CHAR_CAP: usize = 600;
// Pinned anchor lines for threads without window activity. R3 friction #4: 80 read
// too short in the field — pins are user-curated core, give them most of a line.
const DIGEST_ANCHOR_CHARS: usize = 160;

// Local midnight of the calendar day `days_back` days before `now_ms`. Subtracting on
// tm_mday (mktime normalizes out-of-range fields, tm_isdst = -1 resolves DST) keeps the
// boundary at true local midnight even when a DST transition falls inside the window —
// fixed-86400s arithmetic would drift it by ±1h (review finding).
fn window_start_ms(now_ms: i64, days_back: i64) -> i64 {
    let mut tm = local_tm(now_ms);
    tm.tm_hour = 0;
    tm.tm_min = 0;
    tm.tm_sec = 0;
    tm.tm_mday -= days_back as libc::c_int;
    tm.tm_isdst = -1;
    let secs = unsafe { libc::mktime(&mut tm) };
    (secs as i64) * 1000
}

// One digest block entry: the shared header line capped at DIGEST_BLOCK_CHAR_CAP plus
// the note: sub-line. No attachments (breadth tool), no citation line.
fn digest_block_lines(
    b: &BlockRow,
    ref_titles: &std::collections::HashMap<String, String>,
) -> Vec<String> {
    let mut lines = vec![block_head_line(b, ref_titles, Some(DIGEST_BLOCK_CHAR_CAP))];
    if let Some(note) = block_note_line(b) {
        lines.push(note);
    }
    lines
}

fn get_digest_json(
    conn: &Connection,
    workspace_title: Option<&str>,
    since_days: Option<i64>,
    max_chars: Option<i64>,
    now_ms: i64,
) -> Result<String, String> {
    let days = since_days.unwrap_or(DIGEST_DEFAULT_DAYS).clamp(1, DIGEST_MAX_DAYS);
    let max_chars = max_chars.unwrap_or(DIGEST_DEFAULT_MAX_CHARS).max(0);
    let cutoff = window_start_ms(now_ms, days - 1);

    // Workspace scope — same name matching as create_thread; unknown name errors with
    // the live list.
    let ws_id: Option<String> = match workspace_title {
        None => None,
        Some(wt) => Some(resolve_workspace(conn, wt)?.0),
    };

    struct ThreadMeta {
        id: String,
        title: String,
        workspace: String,
        status: String,
        updated_at: i64,
        summary: Option<String>,
        total_blocks: i64,
    }
    let ws_clause = if ws_id.is_some() { "AND w.id = ?1" } else { "" };
    // Same GROUP BY aggregate as list_threads (6a) — no per-row correlated COUNT.
    let sql = format!(
        "SELECT t.id, t.title, w.title, t.status, t.updated_at, t.summary,
                COALESCE(bc.cnt, 0)
         FROM threads t
         JOIN workspaces w ON w.id = t.workspace_id
         LEFT JOIN (SELECT thread_id, COUNT(*) AS cnt FROM blocks GROUP BY thread_id) bc
                ON bc.thread_id = t.id
         WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL {ws_clause}
         ORDER BY t.updated_at DESC, t.id ASC"
    );
    let map_thread = |r: &rusqlite::Row| -> rusqlite::Result<ThreadMeta> {
        Ok(ThreadMeta {
            id: r.get(0)?,
            title: r.get(1)?,
            workspace: r.get(2)?,
            status: r.get(3)?,
            updated_at: r.get(4)?,
            summary: r.get(5)?,
            total_blocks: r.get(6)?,
        })
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let threads: Vec<ThreadMeta> = match &ws_id {
        Some(id) => stmt.query_map([id], map_thread),
        None => stmt.query_map([], map_thread),
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    // Every pinned or in-window block for the in-scope threads, chronological.
    let sql = format!(
        "SELECT b.thread_id, b.id, b.kind, b.content, b.annotation, b.ref_thread_id,
                b.ref_block_id, b.source, b.pinned, b.created_at
         FROM blocks b
         JOIN threads t ON t.id = b.thread_id
         JOIN workspaces w ON w.id = t.workspace_id
         WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL {ws_clause}
           AND (b.pinned = 1 OR b.created_at >= ?{})
         ORDER BY b.created_at ASC, b.rowid ASC",
        if ws_id.is_some() { 2 } else { 1 }
    );
    struct DigestRow {
        thread_id: String,
        block: BlockRow,
    }
    let map_block = |r: &rusqlite::Row| -> rusqlite::Result<DigestRow> {
        Ok(DigestRow {
            thread_id: r.get(0)?,
            block: BlockRow {
                id: r.get(1)?,
                kind: r.get(2)?,
                content: r.get(3)?,
                annotation: r.get(4)?,
                ref_thread_id: r.get(5)?,
                ref_block_id: r.get(6)?,
                source: r.get(7)?,
                pinned: r.get::<_, i64>(8)? == 1,
                created_at: r.get(9)?,
            },
        })
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: Vec<DigestRow> = match &ws_id {
        Some(id) => stmt.query_map(rusqlite::params![id, cutoff], map_block),
        None => stmt.query_map(rusqlite::params![cutoff], map_block),
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    let mut by_thread: std::collections::HashMap<&str, Vec<&BlockRow>> =
        std::collections::HashMap::new();
    for r in &rows {
        by_thread.entry(r.thread_id.as_str()).or_default().push(&r.block);
    }

    let ref_titles = load_ref_titles(conn)?;

    // Split: active threads (any block in window) vs pinned-only anchors.
    struct ActiveThread<'a> {
        meta: &'a ThreadMeta,
        latest_window: i64,
        pinned: Vec<&'a BlockRow>,
        window: Vec<&'a BlockRow>, // non-pinned, in-window, chronological
    }
    let mut active: Vec<ActiveThread> = Vec::new();
    let mut anchors: Vec<(&ThreadMeta, Vec<&BlockRow>)> = Vec::new();
    for meta in &threads {
        let Some(blocks) = by_thread.get(meta.id.as_str()) else { continue };
        let latest_window = blocks
            .iter()
            .filter(|b| b.created_at >= cutoff)
            .map(|b| b.created_at)
            .max();
        let pinned: Vec<&BlockRow> = blocks.iter().copied().filter(|b| b.pinned).collect();
        match latest_window {
            Some(latest) => {
                let window: Vec<&BlockRow> = blocks
                    .iter()
                    .copied()
                    .filter(|b| !b.pinned && b.created_at >= cutoff)
                    .collect();
                active.push(ActiveThread { meta, latest_window: latest, pinned, window });
            }
            None if !pinned.is_empty() => anchors.push((meta, pinned)),
            None => {}
        }
    }
    active.sort_by(|a, b| {
        b.latest_window
            .cmp(&a.latest_window)
            .then_with(|| a.meta.id.cmp(&b.meta.id))
    });
    // anchors keep the thread query's updated_at DESC order.

    let scope = match workspace_title {
        Some(wt) => format!("工作区「{}」", wt.trim()),
        None => "全部工作区".to_string(),
    };
    let mut out: Vec<String> = Vec::new();
    out.push(format!(
        "# Spool Digest: {scope} · 自 {}(近 {days} 天)",
        format_pack_date(cutoff)
    ));
    out.push(String::new());
    out.push(format!(
        "Generated by Spool on {}. 窗口内 {} 个项目有新块(共 {} 条在库)。选取规则:\
         每个项目最新 {DIGEST_THREAD_QUOTA} 块 + 全部置顶(置顶不占配额),单块截断于 \
         {DIGEST_BLOCK_CHAR_CAP} 字符;深读用 get_pack / get_blocks。",
        format_pack_date(now_ms),
        active.len(),
        threads.len()
    ));
    out.push(
        "Authority categories per get_pack's reading header; source labels preserved.".to_string(),
    );

    if active.is_empty() && anchors.is_empty() {
        out.push(String::new());
        out.push(format!(
            "窗口内没有新块,也没有置顶锚点 — 试更大的 since_days(当前 {days}),\
             或用 list_threads 查看全部项目。"
        ));
        return Ok(out.join("\n") + "\n");
    }

    // Budget accounting. Costs count chars + the joining newline per line. R3 BUG-3/4
    // rewrite: everything — section headers, per-thread fallback mentions, anchor
    // lines, the tail — is accounted, so output stays ≤ max_chars whenever the
    // mandatory floor (header + one mention per active thread + tail) itself fits;
    // and threads upgrade from mention to full chunk in ACTIVITY order, so a less
    // active thread can never render in full while a more active one is degraded.
    let cost = |lines: &[String]| -> i64 {
        lines.iter().map(|l| l.chars().count() as i64 + 1).sum()
    };
    let line_cost = |l: &str| -> i64 { l.chars().count() as i64 + 1 };
    let mut used = cost(&out);
    let unlimited = max_chars == 0;

    let quiet = threads.len() - active.len() - anchors.len();
    let tail_line = (quiet > 0).then(|| {
        format!("——另有 {quiet} 个项目无置顶且窗口内无活动(list_threads 查看全部)。")
    });
    // Fixed parts are charged into `used` up front — the tail, and (when the anchors
    // section will exist) its header plus a worst-case omitted-count note — so the
    // greedy passes below can only spend what is genuinely left. Emission later never
    // re-charges these.
    if let Some(l) = tail_line.as_deref() {
        used += line_cost(l) + 1; // + the blank line before it
    }
    if !anchors.is_empty() {
        used += 1 + line_cost("## 其余项目的置顶锚点(窗口内无新块)") + 1;
        used += line_cost("(+ 999 行置顶锚点未展开 — 预算所限)");
    }

    if !active.is_empty() {
        let header = vec![String::new(), "## 近期活跃".to_string()];
        used += cost(&header);
        out.extend(header);

        let chunk_of = |t: &ActiveThread| -> Vec<String> {
            let mut chunk: Vec<String> = Vec::new();
            chunk.push(String::new());
            chunk.push(format!(
                "### {} / {} — {} · {} 块 · 最后活动 {}",
                t.meta.workspace,
                if t.meta.title.is_empty() { "（无标题）" } else { &t.meta.title },
                t.meta.status,
                t.meta.total_blocks,
                format_pack_time(t.latest_window)
            ));
            if let Some(s) = t.meta.summary.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                chunk.push(format!("summary: {}", one_line(s)));
            }
            for b in &t.pinned {
                chunk.extend(digest_block_lines(b, &ref_titles));
            }
            let skip = t.window.len().saturating_sub(DIGEST_THREAD_QUOTA);
            for b in &t.window[skip..] {
                chunk.extend(digest_block_lines(b, &ref_titles));
            }
            if skip > 0 {
                chunk.push(format!(
                    "(+ {skip} more blocks in window — get_pack / get_blocks 读全量)"
                ));
            }
            chunk
        };
        // The "who was active" answer never drops a thread — its floor is one line.
        let fallback_of = |t: &ActiveThread| -> String {
            format!(
                "- {}(窗口内 {} 块,最后活动 {} — 预算所限未展开)",
                if t.meta.title.is_empty() { "（无标题）" } else { &t.meta.title },
                t.window.len() + t.pinned.iter().filter(|b| b.created_at >= cutoff).count(),
                format_pack_time(t.latest_window)
            )
        };

        let fallbacks: Vec<String> = active.iter().map(fallback_of).collect();
        // Pass 1: every active thread's mention is reserved up front.
        let mut reserved: i64 = fallbacks.iter().map(|f| line_cost(f)).sum();
        // Pass 2: upgrade mentions to full chunks as a strict PREFIX of the activity
        // order — the field test's complaint was a stale one-block thread rendering in
        // full while the most active thread sat degraded, so once one thread fails to
        // fit, everything less active stays a mention too (budget beyond that point
        // buys consistency, not filler).
        let mut upgraded: Vec<Option<Vec<String>>> = Vec::with_capacity(active.len());
        let mut upgrading = true;
        for (t, fallback) in active.iter().zip(&fallbacks) {
            if !upgrading {
                upgraded.push(None);
                continue;
            }
            let chunk = chunk_of(t);
            let c = cost(&chunk);
            let f = line_cost(fallback);
            if unlimited || used + reserved - f + c <= max_chars {
                reserved -= f;
                used += c;
                upgraded.push(Some(chunk));
            } else {
                upgrading = false;
                upgraded.push(None);
            }
        }
        used += reserved;
        for (rendered, fallback) in upgraded.into_iter().zip(fallbacks) {
            match rendered {
                Some(chunk) => out.extend(chunk),
                None => out.push(fallback),
            }
        }
    }

    if !anchors.is_empty() {
        // Header + worst-case omitted note were pre-charged above.
        out.push(String::new());
        out.push("## 其余项目的置顶锚点(窗口内无新块)".to_string());
        out.push(String::new());
        let mut omitted = 0usize;
        for (meta, pinned) in &anchors {
            for b in pinned {
                let line = format!(
                    "- {}: {PINNED_PREFIX}{}",
                    if meta.title.is_empty() { "（无标题）" } else { &meta.title },
                    anchor_n(&b.content, DIGEST_ANCHOR_CHARS)
                );
                let c = line_cost(&line);
                if unlimited || used + c <= max_chars {
                    used += c;
                    out.push(line);
                } else {
                    omitted += 1;
                }
            }
        }
        if omitted > 0 {
            out.push(format!("(+ {omitted} 行置顶锚点未展开 — 预算所限)"));
        }
    }

    if let Some(tail) = tail_line {
        out.push(String::new());
        out.push(tail);
    }

    Ok(out.join("\n") + "\n")
}

// §20.13 v2.1 (field report C1): block-level paging — the middle granularity between
// a search snippet and a full pack. Same data the pack renders, as JSON.
// R2 field report C1: `around_block_id` + `context` — center the page on a block (a
// search hit) instead of guessing offsets from timestamps.
const BLOCKS_DEFAULT_LIMIT: i64 = 20;
const BLOCKS_MAX_LIMIT: i64 = 50;
const BLOCKS_DEFAULT_CONTEXT: i64 = 3;

// v2.4 (C5): optional AND-combined page filters. Kept apart from the paging args so
// the filter SQL is built in exactly one place.
pub struct BlockFilters<'a> {
    pub pinned: Option<bool>,
    pub has_annotation: Option<bool>,
    pub source_contains: Option<&'a str>,
}

impl BlockFilters<'_> {
    fn is_empty(&self) -> bool {
        self.pinned.is_none() && self.has_annotation.is_none() && self.source_contains.is_none()
    }
    // WHERE tail + its bound params, positional `?` in appearance order so the same
    // tail serves both the COUNT and the page query. instr(lower(),lower()) over LIKE:
    // no wildcard escaping to get wrong, and ASCII case-folding matches how source
    // labels differ.
    fn sql(&self) -> (String, Vec<String>) {
        let mut clauses = String::new();
        let mut params: Vec<String> = Vec::new();
        if let Some(p) = self.pinned {
            clauses.push_str(if p { " AND pinned = 1" } else { " AND pinned = 0" });
        }
        if let Some(h) = self.has_annotation {
            clauses.push_str(if h {
                " AND annotation IS NOT NULL"
            } else {
                " AND annotation IS NULL"
            });
        }
        if let Some(s) = self.source_contains {
            clauses.push_str(" AND source IS NOT NULL AND instr(lower(source), lower(?)) > 0");
            params.push(s.to_string());
        }
        (clauses, params)
    }
}

fn get_blocks_json(
    conn: &Connection,
    thread_id: &str,
    offset: Option<i64>,
    limit: Option<i64>,
    around_block_id: Option<&str>,
    context: Option<i64>,
    filters: &BlockFilters,
) -> Result<String, String> {
    let (title, deleted): (String, Option<i64>) = conn
        .query_row(
            "SELECT title, deleted_at FROM threads WHERE id = ?1",
            [thread_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| format!("没有 id 为 {thread_id} 的项目 — 先用 list_threads 查看有效 id。"))?;
    if deleted.is_some() {
        return Err("该项目已被删除。".to_string());
    }
    if let Some(s) = filters.source_contains {
        if s.trim().is_empty() {
            return Err("source_contains 不能为空串。".to_string());
        }
    }
    // Centering wants the block's true neighborhood; a filtered page would present
    // non-adjacent rows as neighbors. Refuse the combination outright (C5).
    if around_block_id.is_some() && !filters.is_empty() {
        return Err(
            "around_block_id 与过滤参数不能同时使用 — 定位读取返回的是真实相邻块，\
             过滤会造成假邻接。去掉过滤条件，或改用 offset/limit 分页。"
                .to_string(),
        );
    }
    // Centering overrides offset/limit: position = rows sorted the same way the page
    // query sorts (created_at, then rowid as the deterministic tie-break).
    let (offset, limit, anchor_position) = if let Some(bid) = around_block_id {
        let position: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM blocks b, blocks t
                 WHERE t.id = ?1 AND t.thread_id = ?2 AND b.thread_id = ?2
                   AND (b.created_at < t.created_at
                        OR (b.created_at = t.created_at AND b.rowid < t.rowid))",
                rusqlite::params![bid, thread_id],
                |r| r.get(0),
            )
            .map_err(|_| format!("该项目里没有 id 为 {bid} 的块 — 用 search_blocks 的 block_id。"))?;
        // COUNT returns 0 both for "first block" and "block not in this thread" — tell
        // them apart explicitly.
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM blocks WHERE id = ?1 AND thread_id = ?2",
                rusqlite::params![bid, thread_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            // R3 BUG-8: when the block lives in ANOTHER thread, say which — the model
            // can self-correct in one step instead of hunting.
            let owner: Option<(String, String)> = conn
                .query_row(
                    "SELECT t.id, t.title FROM blocks b JOIN threads t ON t.id = b.thread_id
                     WHERE b.id = ?1 AND t.deleted_at IS NULL",
                    [bid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .ok();
            return Err(match owner {
                Some((owner_id, owner_title)) => format!(
                    "该项目里没有 id 为 {bid} 的块 — 它属于「{owner_title}」\
                     (thread_id: {owner_id});换用那个 thread_id 再调用。"
                ),
                None => format!("该项目里没有 id 为 {bid} 的块 — 用 search_blocks 的 block_id。"),
            });
        }
        let ctx = context.unwrap_or(BLOCKS_DEFAULT_CONTEXT).clamp(0, (BLOCKS_MAX_LIMIT - 1) / 2);
        ((position - ctx).max(0), 2 * ctx + 1, Some(position))
    } else {
        (
            offset.unwrap_or(0).max(0),
            limit.unwrap_or(BLOCKS_DEFAULT_LIMIT).clamp(1, BLOCKS_MAX_LIMIT),
            None,
        )
    };
    // total reflects the active filters (C5) — it is the page-able row count.
    let (fsql, fparams) = filters.sql();
    let mut count_params: Vec<&dyn rusqlite::ToSql> = vec![&thread_id];
    for s in &fparams {
        count_params.push(s);
    }
    let total: i64 = conn
        .query_row(
            &format!("SELECT count(*) FROM blocks WHERE thread_id = ?{fsql}"),
            rusqlite::params_from_iter(count_params),
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, kind, content, annotation, ref_thread_id, ref_block_id, source,
                    pinned, created_at
             FROM blocks WHERE thread_id = ?{fsql} ORDER BY created_at ASC, rowid ASC
             LIMIT ? OFFSET ?"
        ))
        .map_err(|e| e.to_string())?;
    let mut page_params: Vec<&dyn rusqlite::ToSql> = vec![&thread_id];
    for s in &fparams {
        page_params.push(s);
    }
    page_params.push(&limit);
    page_params.push(&offset);
    let mut rows = stmt
        .query_map(rusqlite::params_from_iter(page_params), |r| {
            Ok(json!({
                "block_id": r.get::<_, String>(0)?,
                "kind": r.get::<_, String>(1)?,
                "content": r.get::<_, String>(2)?,
                "annotation": r.get::<_, Option<String>>(3)?,
                "ref_thread_id": r.get::<_, Option<String>>(4)?,
                "ref_block_id": r.get::<_, Option<String>>(5)?,
                "source": r.get::<_, Option<String>>(6)?,
                "pinned": r.get::<_, i64>(7)? == 1,
                "created_at": format_pack_time(r.get::<_, i64>(8)?),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| e.to_string())?;

    // R3 BUG-5: rows carrying a citation resolve it inline — thread handle + title +
    // preview — so a consumer needs no second query; a dangling citation (citee later
    // deleted) is an explicit null instead of an absent field.
    {
        let mut cite_stmt = conn
            .prepare(
                "SELECT b.thread_id, t.title, b.content, b.created_at
                 FROM blocks b JOIN threads t ON t.id = b.thread_id
                 WHERE b.id = ?1 AND t.deleted_at IS NULL",
            )
            .map_err(|e| e.to_string())?;
        for row in &mut rows {
            let Some(rid) = row["ref_block_id"].as_str().map(String::from) else { continue };
            row["cited"] = cite_stmt
                .query_row([&rid], |r| {
                    Ok(json!({
                        "thread_id": r.get::<_, String>(0)?,
                        "thread_title": r.get::<_, String>(1)?,
                        "preview": head_anchor(&r.get::<_, String>(2)?),
                        "created_at": format_pack_time(r.get::<_, i64>(3)?),
                    }))
                })
                .unwrap_or(Value::Null);
        }
    }
    let mut out = json!({
        "thread_id": thread_id,
        "thread_title": title,
        "total": total,
        "offset": offset,
        "limit": limit,
        "blocks": rows,
    });
    if let Some(pos) = anchor_position {
        out["anchor_position"] = json!(pos);
    }
    // Echo active filters so a paging model can't lose track of what `total` counts.
    if !filters.is_empty() {
        let mut f = serde_json::Map::new();
        if let Some(p) = filters.pinned {
            f.insert("pinned".into(), json!(p));
        }
        if let Some(h) = filters.has_annotation {
            f.insert("has_annotation".into(), json!(h));
        }
        if let Some(s) = filters.source_contains {
            f.insert("source_contains".into(), json!(s));
        }
        out["filters"] = Value::Object(f);
    }
    serde_json::to_string_pretty(&out).map_err(|e| e.to_string())
}

// Pack text plus the counts the get_pack guard (P0-2/P2-7, 2026-07-09 field report)
// needs to say something actionable instead of an oversize or hollow pack — and, since
// v2.4 (C2), the raw parts so an over-budget pack can be re-assembled partially.
struct PackBuilt {
    text: String,
    total_blocks: usize,
    range_blocks: usize,
    pinned_blocks: usize,
    title: String,
    blocks: Vec<BlockRow>,
    attachments: Vec<AttachmentRow>,
    ref_titles: std::collections::HashMap<String, String>,
    ref_blocks: RefBlocks,
    now_ms: i64,
}

// R3 friction #2: the pack deliberately hides ids in its body (naming rule), which
// broke the "read a pack → cite a block" chain — the model had to re-search for the
// id it was looking at. include_ids=true appends this side-table AFTER the closing
// directive: one line per RENDERED block (omitted-unpinned blocks were not read, so
// they are not listed). Ids stay framed as tool parameters.
const SECTION_IDS: &str = "## Block IDs (tool parameters only — never show or store these)";

fn pack_id_table(blocks: &[BlockRow], omit: usize) -> String {
    let mut rows = String::new();
    for (i, b) in blocks.iter().enumerate() {
        if i < omit && !b.pinned {
            continue; // not rendered in the budgeted pack
        }
        rows.push_str(&format!(
            "- [{}] {} — {}\n",
            format_pack_time(b.created_at),
            anchor_n(&b.content, PLACEHOLDER_HEAD_CHARS),
            b.id
        ));
    }
    format!("\n---\n\n{SECTION_IDS}\n\n{rows}")
}

// v2.4 (C2): instead of stats-only, an over-budget pack keeps the skeleton + the full
// Pinned Blocks section and fills the Full Record from the NEWEST block backwards until
// max_chars; the omitted oldest blocks become one explicit line at the section top.
// Returns None when even the everything-omitted rendering (skeleton + pinned) is over
// budget — the caller falls back to the stats guard message. Binary search over the
// omit count: length decreases as omission grows (the omission line's digit count can
// wobble it by a char or two, which the verified-endpoints search absorbs).
fn budgeted_pack(built: &PackBuilt, max_chars: i64) -> Option<(String, usize)> {
    let n = built.blocks.len();
    let render = |omit: usize| {
        assemble_pack_omitting(
            &built.title,
            &built.blocks,
            &built.attachments,
            &built.ref_titles,
            &built.ref_blocks,
            built.now_ms,
            omit,
        )
    };
    let fits = |omit: usize| render(omit).chars().count() as i64 <= max_chars;
    if fits(0) {
        return Some((render(0), 0)); // the guard path never sends this, but keep it total
    }
    if !fits(n) {
        return None;
    }
    // Invariant: lo never fits (omit=0 is the over-budget full pack), hi always fits.
    let (mut lo, mut hi) = (0usize, n);
    while lo + 1 < hi {
        let mid = lo + (hi - lo) / 2;
        if fits(mid) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    Some((render(hi), hi))
}

// One get_pack call used to return 70k+ chars (field report A1) — over the tool-result
// budget of real clients, and a silently truncated pack is worse than none (the reading
// instructions sit at the top, the newest blocks at the bottom). Explicit max_chars=0
// opts back into unlimited.
const PACK_DEFAULT_MAX_CHARS: i64 = 50_000;

fn pack_guard_message(built: &PackBuilt, range: &str, max_chars: i64) -> Option<String> {
    if built.total_blocks == 0 {
        return Some("该项目还没有任何块。".to_string());
    }
    if built.range_blocks == 0 {
        return Some(format!(
            "range={range} 窗口内没有块 — 该项目共 {} 块(置顶 {} 块)。试 range=last30 / all,\
             或用 get_blocks 分页读取。",
            built.total_blocks, built.pinned_blocks
        ));
    }
    let chars = built.text.chars().count() as i64;
    if max_chars > 0 && chars > max_chars {
        return Some(format!(
            "pack 全文 {chars} 字符,超过 max_chars={max_chars}(默认 {PACK_DEFAULT_MAX_CHARS},\
             传 0 取全文)。该项目共 {} 块、置顶 {} 块。控制预算:range=pinned / last30,\
             或用 get_blocks(thread_id, offset, limit) 分页读取全文。",
            built.total_blocks, built.pinned_blocks
        ));
    }
    None
}

fn get_pack_text(conn: &Connection, thread_id: &str, range: &str) -> Result<String, String> {
    Ok(build_pack(conn, thread_id, range)?.text)
}

fn build_pack(conn: &Connection, thread_id: &str, range: &str) -> Result<PackBuilt, String> {
    let (title, deleted): (String, Option<i64>) = conn
        .query_row(
            "SELECT title, deleted_at FROM threads WHERE id = ?1",
            [thread_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| format!("没有 id 为 {thread_id} 的项目 — 先用 list_threads 查看有效 id。"))?;
    if deleted.is_some() {
        return Err("该项目已被删除。".to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, kind, content, annotation, ref_thread_id, ref_block_id, source,
                    pinned, created_at
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
                ref_block_id: r.get(5)?,
                source: r.get(6)?,
                pinned: r.get::<_, i64>(7)? == 1,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // D2: resolve the cited blocks (any thread — citations cross thread lines). Missing
    // rows simply stay out of the map; the renderer marks those citations as gone.
    let mut ref_blocks: RefBlocks = RefBlocks::new();
    {
        let mut cited: Vec<&str> = blocks
            .iter()
            .filter_map(|b| b.ref_block_id.as_deref())
            .collect();
        cited.sort_unstable();
        cited.dedup();
        let mut stmt = conn
            .prepare("SELECT content, created_at FROM blocks WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        for id in cited {
            if let Ok((content, created_at)) =
                stmt.query_row([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            {
                ref_blocks.insert(id.to_string(), (content, created_at));
            }
        }
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let total_blocks = blocks.len();
    let pinned_blocks = blocks.iter().filter(|b| b.pinned).count();
    let blocks = filter_blocks_for_range(blocks, range, now_ms);
    let range_blocks = blocks.len();

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

    let ref_titles = load_ref_titles(conn)?;

    Ok(PackBuilt {
        text: assemble_pack(&title, &blocks, &attachments, &ref_titles, &ref_blocks, now_ms),
        total_blocks,
        range_blocks,
        pinned_blocks,
        title,
        blocks,
        attachments,
        ref_titles,
        ref_blocks,
        now_ms,
    })
}

// §20.13 v2 resources probe: threads as MCP resources (spool://thread/<id>) so clients
// with native resource UX (@-mention in Claude Desktop) can pull a pack without a tool
// call. Listed newest-activity first; the pack text itself is served by resources/read.
const THREAD_URI_PREFIX: &str = "spool://thread/";

fn thread_resources(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.summary, w.title
             FROM threads t JOIN workspaces w ON w.id = t.workspace_id
             WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL
             ORDER BY t.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let id: String = r.get(0)?;
            let title: String = r.get(1)?;
            let summary: Option<String> = r.get(2)?;
            let workspace: String = r.get(3)?;
            Ok(json!({
                "uri": format!("{THREAD_URI_PREFIX}{id}"),
                "name": if title.is_empty() { "（无标题）".to_string() } else { title },
                "description": summary.filter(|s| !s.trim().is_empty()).unwrap_or(workspace),
                "mimeType": "text/plain",
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ---------------------------------------------------------------------------------------
// §20.13 write tools (2026-07-08) — create_thread / add_block
// ---------------------------------------------------------------------------------------
//
// Append-only by design: the MCP side may INSERT new threads/blocks (plus bump the
// parent thread's updated_at) and never UPDATEs or DELETEs user content — Principle 5
// (AI is a librarian, not an author) is enforced structurally. Every MCP-written block
// carries a source label naming the client ("Claude Desktop · MCP"), so pack category
// sorting treats AI-provided material as sourced quotes, never as the user's own
// sourceless writing. Writes are separately gated by mcpWriteEnabled (default OFF).

// Must stay in lockstep with the GUI's migration registry (src/lib/db/client.ts).
// Writing into a schema this binary doesn't know is how the 2026-05-29 wipe class of
// bugs happens — refuse instead.
const EXPECTED_SCHEMA_VERSION: i64 = 8;

// Name reported by the client at initialize (clientInfo.name); feeds the source label.
static CLIENT_NAME: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// nanoid-compatible 21-char id (same default url-safe alphabet as the GUI's nanoid).
// /dev/urandom instead of a rand crate — no new dependency; the alphabet has exactly
// 64 symbols so `byte & 0x3F` is bias-free.
fn new_id() -> Result<String, String> {
    const ALPHABET: &[u8; 64] =
        b"useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
    let mut bytes = [0u8; 21];
    use std::io::Read;
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| format!("随机源不可用: {e}"))?;
    Ok(bytes.iter().map(|b| ALPHABET[(b & 0x3F) as usize] as char).collect())
}

// Read-write connection for the write tools. Never creates the DB (the GUI owns
// creation/migration/seeding), takes a 2s busy timeout for WAL coexistence with the
// running GUI, and refuses any schema version it doesn't know.
fn open_db_rw(dir: &std::path::Path) -> Result<Connection, String> {
    let path = dir.join("spool.db");
    if !path.exists() {
        return Err("Spool 数据库不存在 — 请先启动一次 Spool 应用。".to_string());
    }
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("打开数据库失败: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_millis(2000))
        .map_err(|e| e.to_string())?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version != EXPECTED_SCHEMA_VERSION {
        return Err(format!(
            "数据库 schema 版本 {version} 与本工具支持的 {EXPECTED_SCHEMA_VERSION} 不符 — \
             请先把 Spool 应用与其 MCP 服务更新到同一版本。为安全起见拒绝写入。"
        ));
    }
    Ok(conn)
}

// Field report B7: prefer the human-readable clientInfo.title (MCP 2025-06 spec)
// over the machine slug; map the known slugs so GUI curation shows "Claude · MCP",
// not "local-agent-mode-… · MCP". Unknown slugs pass through untouched.
fn client_label_from_info(info: &Value) -> Option<String> {
    if let Some(t) = info
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(t.to_string());
    }
    let name = info
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    let lc = name.to_lowercase();
    // R2 field report C4: Claude's agent runtimes identify as "local-agent-mode-…"
    // with no human-readable title — map the known slug family like the others.
    Some(if lc.contains("claude") || lc.contains("local-agent-mode") {
        "Claude".to_string()
    } else if lc.contains("cursor") {
        "Cursor".to_string()
    } else {
        name.to_string()
    })
}

// Default source label for MCP-written blocks, e.g. "Claude Desktop · MCP".
fn mcp_source_label() -> String {
    match CLIENT_NAME.lock().unwrap().as_deref() {
        Some(name) if !name.trim().is_empty() => format!("{} · MCP", name.trim()),
        _ => "MCP".to_string(),
    }
}

// Resolve a user-supplied workspace name (case-insensitive) to (id, title), erroring
// with the live name list — shared by create_thread and get_digest so the two can
// never disagree on what a name resolves to.
fn resolve_workspace(conn: &Connection, wt: &str) -> Result<(String, String), String> {
    conn.query_row(
        "SELECT id, title FROM workspaces
         WHERE deleted_at IS NULL AND lower(title) = lower(?1)
         ORDER BY sort_order ASC LIMIT 1",
        [wt.trim()],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .map_err(|_| {
        let names: Vec<String> = conn
            .prepare(
                "SELECT title FROM workspaces WHERE deleted_at IS NULL
                 ORDER BY sort_order ASC",
            )
            .and_then(|mut s| {
                s.query_map([], |r| r.get::<_, String>(0)).and_then(|rows| rows.collect())
            })
            .unwrap_or_default();
        format!("没有名为「{wt}」的工作区。现有工作区: {names:?}。")
    })
}

// Thread-id → title map for rendering kind=ref blocks. All threads on purpose (even
// soft-deleted) — the renderers fall back to the ref block's own content snapshot only
// when the map misses entirely.
fn load_ref_titles(conn: &Connection) -> Result<std::collections::HashMap<String, String>, String> {
    let mut stmt = conn.prepare("SELECT id, title FROM threads").map_err(|e| e.to_string())?;
    let map = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    Ok(map)
}

fn create_thread_json(
    conn: &Connection,
    workspace_title: Option<&str>,
    title: &str,
    summary: Option<&str>,
) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title 不能为空。".to_string());
    }
    let (ws_id, ws_title): (String, String) = match workspace_title {
        Some(wt) => resolve_workspace(conn, wt)?,
        // Default target mirrors the GUI's ordering: the first workspace (收件箱 on a
        // fresh install).
        None => conn
            .query_row(
                "SELECT id, title FROM workspaces WHERE deleted_at IS NULL
                 ORDER BY sort_order ASC, created_at ASC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "没有任何工作区 — 请先在 Spool 里创建一个。".to_string())?,
    };
    let id = new_id()?;
    let now = now_ms();
    let summary = summary.map(str::trim).filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO threads (id, workspace_id, title, summary, summary_source, status,
                              is_capture_target, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', 0, ?6, ?6)",
        rusqlite::params![id, ws_id, title, summary, summary.map(|_| "mcp"), now],
    )
    .map_err(|e| format!("写入失败: {e}"))?;
    let mut out = json!({ "thread_id": id, "workspace": ws_title, "title": title });
    // R4 P2-1: the raw-id advisory covers every free-text write surface.
    let mut hits: Vec<(&str, String)> = Vec::new();
    if let Some(h) = suspect_raw_id(title) {
        hits.push(("title", h));
    }
    if let Some(h) = summary.and_then(suspect_raw_id) {
        hits.push(("summary", h));
    }
    if !hits.is_empty() {
        out["warning"] = json!(raw_id_warning(&hits));
    }
    Ok(out.to_string())
}

// The thread's "catalogue card" (§9.11): since the MCP-first pivot the app itself never
// generates summaries, so this is the AI path for keeping them fresh. Provenance guard:
// a summary the user wrote by hand (summary_source 'user', or legacy NULL under a
// non-empty summary) is never overwritten — the model is told to hand its suggestion to
// the user instead. Only an empty card or an MCP-written one may be (re)written here.
fn set_thread_summary_json(
    conn: &Connection,
    thread_id: &str,
    summary: &str,
) -> Result<String, String> {
    let summary = summary.trim();
    if summary.is_empty() {
        return Err("summary 不能为空 — 清空摘要只能由用户在 Spool 里操作。".to_string());
    }
    let (title, existing, source, deleted): (String, Option<String>, Option<String>, Option<i64>) =
        conn.query_row(
            "SELECT title, summary, summary_source, deleted_at FROM threads WHERE id = ?1",
            [thread_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| format!("没有 id 为 {thread_id} 的项目 — 先用 list_threads 查看有效 id。"))?;
    if deleted.is_some() {
        return Err("该项目已被删除。".to_string());
    }
    let has_summary = existing.as_deref().map(str::trim).is_some_and(|s| !s.is_empty());
    if has_summary && source.as_deref() != Some("mcp") {
        return Err(format!(
            "「{title}」的摘要是用户手写的，MCP 不得覆盖。请把你建议的摘要告诉用户，\
             由用户自己在 Spool 里修改（用户清空摘要后 MCP 方可再写）。"
        ));
    }
    let now = now_ms();
    conn.execute(
        "UPDATE threads SET summary = ?1, summary_source = 'mcp', updated_at = ?2 WHERE id = ?3",
        rusqlite::params![summary, now, thread_id],
    )
    .map_err(|e| format!("写入失败: {e}"))?;
    let mut out = json!({ "thread_id": thread_id, "title": title, "summary": summary });
    // R4 P2-1: the raw-id advisory covers every free-text write surface.
    if let Some(hit) = suspect_raw_id(summary) {
        out["warning"] = json!(raw_id_warning(&[("summary", hit)]));
    }
    Ok(out.to_string())
}

// v2.4 (D1/5b): a raw 21-char nanoid written into content/annotation surfaces in
// search snippets and packs forever — the naming hard rule forbids it. Detection is
// advisory only (warn, never refuse, never rewrite): an exactly-21-char run over the
// nanoid alphabet with non-alphabet neighbors, requiring both cases to keep ordinary
// 21-letter words (all-lowercase) out. False positives survive as a warning the writer
// can ignore.
// R5 P3-1: when several surfaces are dirty in one call, the advisory names each of
// them instead of only the first match. (R5 P3-2 — an id glued inside a longer
// same-alphabet token, e.g. behind a hyphenated prefix — stays undetected by design:
// '-' belongs to the nanoid alphabet, so splitting on it would break detection of
// real ids that contain hyphens. check_library shares the detector, keeping the
// tradeoff uniform and disclosed.)
fn raw_id_warning(hits: &[(&str, String)]) -> String {
    let list = hits
        .iter()
        .map(|(surface, hit)| format!("{surface}:「{hit}」"))
        .collect::<Vec<_>>()
        .join(";");
    format!(
        "文本中疑似包含内部 id({list})。请勿把内部 id 写进任何会展示的文本——\
         引用其他块请用 ref_block_id 参数,id 只应出现在工具参数里。本次已原样写入。"
    )
}

fn suspect_raw_id(text: &str) -> Option<String> {
    let is_id_char = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '-';
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if !is_id_char(chars[i]) {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && is_id_char(chars[i]) {
            i += 1;
        }
        let run = &chars[start..i];
        if run.len() == 21
            && run.iter().any(|c| c.is_ascii_uppercase())
            && run.iter().any(|c| c.is_ascii_lowercase())
        {
            return Some(run.iter().collect());
        }
    }
    None
}

fn add_block_json(
    conn: &mut Connection,
    thread_id: &str,
    content: &str,
    source: Option<&str>,
    annotation: Option<&str>,
    ref_block_id: Option<&str>,
) -> Result<String, String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("content 不能为空。".to_string());
    }
    let deleted: Option<i64> = conn
        .query_row("SELECT deleted_at FROM threads WHERE id = ?1", [thread_id], |r| r.get(0))
        .map_err(|_| format!("没有 id 为 {thread_id} 的项目 — 先用 list_threads 查看有效 id。"))?;
    if deleted.is_some() {
        return Err("该项目已被删除。".to_string());
    }
    // D2: a citation must point at a live block at write time (cross-thread allowed —
    // that is the point). It may dangle later if the citee is deleted; the pack
    // renderer says so instead of hiding it.
    let ref_block_id = ref_block_id.map(str::trim).filter(|s| !s.is_empty());
    if let Some(rid) = ref_block_id {
        let live: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM blocks b JOIN threads t ON t.id = b.thread_id
                 WHERE b.id = ?1 AND t.deleted_at IS NULL",
                [rid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if live == 0 {
            return Err(format!(
                "没有 id 为 {rid} 的可引用块(或其项目已删)— ref_block_id 应来自 \
                 search_blocks / get_blocks 的 block_id。"
            ));
        }
    }
    let id = new_id()?;
    let now = now_ms();
    // §20.13 v2.1 (P0-1, field report A4): the client label is an invariant, not a
    // default. A caller-supplied source used to replace it wholesale — letting AI
    // content masquerade as an authoritative artifact ("lecture.pdf" reads as 📖
    // Reference at consumption time). Custom detail now rides BEHIND the label.
    let source_detail = source.map(str::trim).filter(|s| !s.is_empty());
    let source = match source_detail {
        Some(detail) => format!("{} — {detail}", mcp_source_label()),
        None => mcp_source_label(),
    };
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO blocks (id, thread_id, kind, content, annotation, ref_block_id, source,
                             pinned, created_at)
         VALUES (?1, ?2, 'text', ?3, ?4, ?5, ?6, 0, ?7)",
        rusqlite::params![
            id,
            thread_id,
            content,
            annotation.map(str::trim),
            ref_block_id,
            source,
            now
        ],
    )
    .map_err(|e| format!("写入失败: {e}"))?;
    tx.execute(
        "UPDATE threads SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, thread_id],
    )
    .map_err(|e| format!("写入失败: {e}"))?;
    tx.commit().map_err(|e| e.to_string())?;
    let mut out = json!({ "block_id": id, "thread_id": thread_id, "source": source });
    // D1/5b: advisory only — the block was written verbatim above. R4 P2-1: the
    // caller-supplied source detail is a display surface too (packs, digest, GUI),
    // so it is scanned like content and annotation. R5 P3-1: every dirty surface is
    // named, not just the first match.
    let mut hits: Vec<(&str, String)> = Vec::new();
    if let Some(h) = suspect_raw_id(content) {
        hits.push(("content", h));
    }
    if let Some(h) = annotation.and_then(suspect_raw_id) {
        hits.push(("annotation", h));
    }
    if let Some(h) = source_detail.and_then(suspect_raw_id) {
        hits.push(("source", h));
    }
    if !hits.is_empty() {
        out["warning"] = json!(raw_id_warning(&hits));
    }
    Ok(out.to_string())
}

// ---------------------------------------------------------------------------------------
// check_library — 存量数据卫生 (2026-07-12): read-only hygiene audit closing the R4
// gap ("工具面已达标,差的最后一截在数据卫生"). Three mechanical detectors, in
// write-side parity where one exists:
//   D-URI — a spool:// URI sitting in visible text (pre-v2.4 MCP writers left these);
//   D-ID  — suspect_raw_id, the exact detector behind add_block's write warning;
//   D-REF — ref_block_id whose cited block is gone or its thread soft-deleted.
// Report only, disposal stays with the user: nothing is ever rewritten — the write
// warning is advisory (a client can ignore it), so dirt can re-enter and the audit
// must stay repeatable. Findings locate rows by thread title + preview; the offending
// fragment itself is quoted verbatim (it is the subject of the report, same precedent
// as raw_id_warning). User-written text (no source label) is reported FYI-only.
// ---------------------------------------------------------------------------------------

const HYGIENE_SECTION_CAP: usize = 50;

// D-URI fragment: the URI as it sits in the text — scheme plus the contiguous id/path
// run after it (ASCII, so byte indexing after find() is safe).
fn uri_fragment(text: &str) -> Option<String> {
    let start = text.find("spool://")?;
    let is_uri_char = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/';
    let tail: String =
        text[start + "spool://".len()..].chars().take_while(|&c| is_uri_char(c)).collect();
    Some(format!("spool://{tail}"))
}

// One finding per field; D-URI wins over D-ID (the URI names the same leak, more
// precisely — the raw-id run is part of it).
fn hygiene_fragment(text: &str) -> Option<String> {
    uri_fragment(text).or_else(|| suspect_raw_id(text))
}

// Where the fragment's id points, if anywhere live — the difference between a real
// pipeline leak and an id-shaped string. Same run rule as the detector.
fn resolve_fragment(conn: &Connection, fragment: &str) -> String {
    use rusqlite::OptionalExtension;
    let Some(id) = suspect_raw_id(fragment) else {
        return String::new();
    };
    let thread: Option<String> = conn
        .query_row(
            "SELECT title FROM threads WHERE id = ?1 AND deleted_at IS NULL",
            [&id],
            |r| r.get(0),
        )
        .optional()
        .unwrap_or(None);
    if let Some(title) = thread {
        return format!(" → 指向现存项目〈{title}〉");
    }
    let block: Option<(String, String)> = conn
        .query_row(
            "SELECT t.title, b.content FROM blocks b JOIN threads t ON t.id = b.thread_id
             WHERE b.id = ?1 AND t.deleted_at IS NULL",
            [&id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .unwrap_or(None);
    if let Some((title, content)) = block {
        return format!(" → 指向现存块(〈{title}〉:{})", head_anchor(&content));
    }
    " → 未指向现存对象".to_string()
}

fn check_library_json(conn: &Connection, now_ms: i64) -> Result<String, String> {
    // 署名家族 (mechanical): the enforced `· MCP` marker is the only proof of AI
    // authorship; a sourceless block is user-typed — report, never suggest edits.
    let family = |source: Option<&str>| -> (&'static str, &'static str, &'static str) {
        match source {
            Some(s) if s.contains("· MCP") => (
                "AI(MCP 署名)",
                "在 Spool 中点击该块的来源标签即可编辑(Spool 不代改)。",
                "在 Spool 中双击该块即可编辑正文/批注(Spool 不代改)。",
            ),
            Some(_) => (
                "捕捉来源",
                "来源采集内容,大概率为原文自带的 id 形状串——仅供知悉。",
                "来源采集内容,大概率为原文自带的 id 形状串——仅供知悉。",
            ),
            None => (
                "用户手写",
                "用户手写内容——仅供知悉,Spool 不建议也不会修改。",
                "用户手写内容——仅供知悉,Spool 不建议也不会修改。",
            ),
        }
    };

    // Sections 1 + 2 sources: every block in a live thread/workspace, deterministic
    // order (thread title, then chronology, rowid as tiebreak).
    struct AuditRow {
        thread_title: String,
        created_at: i64,
        content: String,
        annotation: Option<String>,
        source: Option<String>,
    }
    let mut stmt = conn
        .prepare(
            "SELECT t.title, b.created_at, b.content, b.annotation, b.source
             FROM blocks b
             JOIN threads t ON t.id = b.thread_id
             JOIN workspaces w ON w.id = t.workspace_id
             WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL
             ORDER BY t.title ASC, b.created_at ASC, b.rowid ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<AuditRow> = stmt
        .query_map([], |r| {
            Ok(AuditRow {
                thread_title: r.get(0)?,
                created_at: r.get(1)?,
                content: r.get(2)?,
                annotation: r.get(3)?,
                source: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let block_entry = |row: &AuditRow, field: &str, fragment: &str, disposal: &str| -> String {
        let (label, _, _) = family(row.source.as_deref());
        format!(
            "- 〈{}〉 · [{}] · 字段 {field} · 署名:{label}\n  片段:「{fragment}」{}\n  预览:{}\n  处置:{disposal}",
            row.thread_title,
            format_pack_time(row.created_at),
            resolve_fragment(conn, fragment),
            head_anchor(&row.content),
        )
    };

    let mut sec_source: Vec<String> = Vec::new(); // 1. source 标签卫生
    let mut sec_text: Vec<String> = Vec::new(); // 2. 正文/批注裸 id
    for row in &rows {
        let (_, fix_source, fix_text) = family(row.source.as_deref());
        if let Some(frag) = row.source.as_deref().and_then(hygiene_fragment) {
            sec_source.push(block_entry(row, "source", &frag, fix_source));
        }
        if let Some(frag) = hygiene_fragment(&row.content) {
            sec_text.push(block_entry(row, "content", &frag, fix_text));
        }
        if let Some(frag) = row.annotation.as_deref().and_then(hygiene_fragment) {
            sec_text.push(block_entry(row, "annotation", &frag, fix_text));
        }
    }

    // Extended surfaces of section 2: thread titles/summaries and workspace names all
    // render in digests/packs. Blocks first, then threads, then workspaces — mechanical.
    struct ThreadRow {
        title: String,
        summary: Option<String>,
        summary_source: Option<String>,
    }
    let mut stmt = conn
        .prepare(
            "SELECT t.title, t.summary, t.summary_source
             FROM threads t JOIN workspaces w ON w.id = t.workspace_id
             WHERE t.deleted_at IS NULL AND w.deleted_at IS NULL
             ORDER BY t.title ASC, t.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let threads: Vec<ThreadRow> = stmt
        .query_map([], |r| {
            Ok(ThreadRow { title: r.get(0)?, summary: r.get(1)?, summary_source: r.get(2)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for t in &threads {
        if let Some(frag) = hygiene_fragment(&t.title) {
            sec_text.push(format!(
                "- 项目标题〈{}〉\n  片段:「{frag}」{}\n  处置:标题无署名——仅供知悉,处置留给用户。",
                t.title,
                resolve_fragment(conn, &frag),
            ));
        }
        if let Some(frag) = t.summary.as_deref().and_then(hygiene_fragment) {
            let (label, disposal) = if t.summary_source.as_deref() == Some("mcp") {
                ("AI(MCP 署名)", "可在 Spool 项目头部编辑,或经用户同意用 set_thread_summary 重写(Spool 不代改)。")
            } else {
                ("用户手写", "用户手写摘要——仅供知悉,Spool 不建议也不会修改。")
            };
            sec_text.push(format!(
                "- 〈{}〉 · 字段 summary · 署名:{label}\n  片段:「{frag}」{}\n  处置:{disposal}",
                t.title,
                resolve_fragment(conn, &frag),
            ));
        }
    }
    let mut stmt = conn
        .prepare("SELECT title FROM workspaces WHERE deleted_at IS NULL ORDER BY title ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let workspaces: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for title in &workspaces {
        if let Some(frag) = hygiene_fragment(title) {
            sec_text.push(format!(
                "- 工作区名〈{title}〉\n  片段:「{frag}」{}\n  处置:仅供知悉,处置留给用户。",
                resolve_fragment(conn, &frag),
            ));
        }
    }

    // Section 3: citation integrity. The pack side already degrades a dangling ↩ line
    // to "(cited block no longer exists)" — this just makes it visible to the user.
    let mut stmt = conn
        .prepare(
            "SELECT t.title, b.created_at, b.content,
                    EXISTS(SELECT 1 FROM blocks c WHERE c.id = b.ref_block_id),
                    EXISTS(SELECT 1 FROM blocks c JOIN threads ct ON ct.id = c.thread_id
                           WHERE c.id = b.ref_block_id AND ct.deleted_at IS NULL)
             FROM blocks b
             JOIN threads t ON t.id = b.thread_id
             JOIN workspaces w ON w.id = t.workspace_id
             WHERE b.ref_block_id IS NOT NULL
               AND t.deleted_at IS NULL AND w.deleted_at IS NULL
             ORDER BY t.title ASC, b.created_at ASC, b.rowid ASC",
        )
        .map_err(|e| e.to_string())?;
    let citations: Vec<(String, i64, String, bool, bool)> = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut sec_refs: Vec<String> = Vec::new(); // 3. 引用完整性
    for (title, created_at, content, citee_exists, citee_live) in &citations {
        if *citee_live {
            continue;
        }
        // Two shapes of dangling: the citee row is gone (pack degrades the ↩ line to
        // "(cited block no longer exists)"), or only its thread is soft-deleted — the
        // row survives, so packs still inline its preview through the citation.
        let detail = if *citee_exists {
            "被引块所在项目已删除;其预览仍会经引用出现在 pack 中"
        } else {
            "被引块已不存在;pack 已自动降级为 \"(cited block no longer exists)\""
        };
        sec_refs.push(format!(
            "- 〈{title}〉 · [{}] · 引用方:「{}」\n  {detail}。仅供知悉——可删除该引用方块,或保持现状。",
            format_pack_time(*created_at),
            head_anchor(content),
        ));
    }

    let mut lines: Vec<String> = vec![
        format!("# Spool 库体检 — {}", format_pack_date(now_ms)),
        format!(
            "Scanned {} blocks / {} projects / {} workspaces. Findings: source 标签卫生 {} · 正文/批注裸 id {} · 引用完整性 {}。",
            rows.len(),
            threads.len(),
            workspaces.len(),
            sec_source.len(),
            sec_text.len(),
            sec_refs.len(),
        ),
        "规则(机械可验算):spool:// 子串;21 位混合大小写 nanoid 形串(与 add_block 写入警告同一检测器);ref_block_id 指向已消失的块。只读报告——Spool 不修改任何内容,处置留给用户。".to_string(),
        String::new(),
    ];
    let mut render_section = |no: usize, name: &str, entries: &[String]| {
        lines.push(format!("## {no}. {name}({})", entries.len()));
        if entries.is_empty() {
            lines.push("(无发现)".to_string());
        }
        for e in entries.iter().take(HYGIENE_SECTION_CAP) {
            lines.push(e.clone());
        }
        if entries.len() > HYGIENE_SECTION_CAP {
            lines.push(format!("(+{} more)", entries.len() - HYGIENE_SECTION_CAP));
        }
        lines.push(String::new());
    };
    render_section(1, "Source 标签卫生", &sec_source);
    render_section(2, "正文/批注裸 id", &sec_text);
    render_section(3, "引用完整性", &sec_refs);

    let total = sec_source.len() + sec_text.len() + sec_refs.len();
    lines.push(if total == 0 {
        "体检通过:未发现内部管线泄漏或悬空引用。".to_string()
    } else {
        format!(
            "体检未通过:共 {total} 处发现。处置留给用户——AI 署名条目可在 Spool 中直接编辑;用户手写条目仅供知悉。"
        )
    });
    Ok(lines.join("\n"))
}

// ---------------------------------------------------------------------------------------
// JSON-RPC / MCP loop
// ---------------------------------------------------------------------------------------

const RANGE_VALUES: [&str; 4] = ["all", "pinned", "last7", "last30"];

fn tools_descriptor() -> Value {
    json!([
        {
            "name": "list_threads",
            "description": "List every workspace and live project in Spool (思簿), with project ids, status, one-line summary, block/pinned counts, approx_pack_chars (content chars; the fixed pack skeleton adds ~3k) and last-updated times. Call this first — both to pick a project and to budget reads before get_pack. Pass title_contains to resolve a known title straight to its id. Ids are tool parameters only; when talking to the user, name projects by their titles.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title_contains": { "type": "string", "description": "Only projects whose title contains this text, case-insensitive — the title→id resolver." }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_digest",
            "description": "Cross-project briefing: what happened recently across the whole library (or one workspace) — answers 'what have I been working on'. Deterministic digest, newest-activity projects first: each active project shows its summary, ALL its pinned blocks, and its newest window blocks (quota 5, blocks truncated at 600 chars); projects without new blocks contribute one pinned-anchor line each. Same params + same data = same output within a day (the window is midnight-aligned). Use get_pack for depth on one project.",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace_title": { "type": "string", "description": "Optional: limit to one workspace (matched by name, case-insensitive). Omit for all workspaces." },
                    "since_days": { "type": "integer", "description": "Activity window in calendar days, default 7, max 90 (counts today)." },
                    "max_chars": { "type": "integer", "description": "Output budget in Unicode code points, default 20000; 0 = unlimited. Projects are expanded most-recent-activity-first until the budget is reached; the rest stay as one-line mentions — no project is silently dropped. Output stays within budget unless even one line per project cannot fit." }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_pack",
            "description": "Return Spool's paste-ready context briefing (the 'pack') for one project — the full project context a user would otherwise paste by hand. The text starts with reading instructions; follow them. Output is capped at 50,000 chars by default: an over-budget call returns a partial pack — reading header and Pinned Blocks complete, Full Record filled newest-first to the budget, with one line at the section top saying how many older blocks were omitted and how to read them (get_blocks paging, narrower range, or max_chars=0 for the full text).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Project id from list_threads." },
                    "range": {
                        "type": "string",
                        "enum": RANGE_VALUES,
                        "description": "Optional scope: all (default), pinned (user-marked core blocks only), last7 / last30 (blocks captured in the last N days)."
                    },
                    "max_chars": { "type": "integer", "description": "Output cap in Unicode code points (a JS .length count of the same text runs higher when astral chars are present). Default 50000; 0 = unlimited." },
                    "include_ids": { "type": "boolean", "description": "Append a Block IDs side-table (one line per rendered block) after the pack, for follow-up calls like add_block.ref_block_id or get_blocks.around_block_id. Rides outside max_chars. Ids stay tool parameters — never show or write them. Default false." }
                },
                "required": ["thread_id"],
                "additionalProperties": false
            }
        },
        {
            "name": "search_blocks",
            "description": "Keyword-search every block (content + user annotations) across all projects. Use this to find WHICH project a topic lives in — before pulling its full context with get_pack, or before filing something new with add_block. Returns {total, hits}: relevance-ranked, each hit carrying a snippet with the match wrapped in **…** plus block/project ids (ids are tool parameters only — cite hits to the user by snippet and thread_title). Latin/ASCII queries match whole words at any length (GRE never hits degree); CJK queries match substrings. Queries of 1-2 characters scan newest-first.",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Keyword or phrase." },
                    "limit": { "type": "integer", "description": "Max hits, default 20, cap 50." }
                },
                "required": ["query"],
                "additionalProperties": false
            }
        },
        {
            "name": "find_similar_blocks",
            "description": "Find groups of near-duplicate blocks (e.g. the same content captured twice) — across the whole library, one workspace, or one project. Read-only report: Spool never merges — describe each group to the user by its previews and project titles (never raw ids) and let them curate in the app. Groups are ranked by similarity (character-trigram overlap, threshold 0.6).",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Optional: only look inside this project (id from list_threads). Mutually exclusive with workspace_title." },
                    "workspace_title": { "type": "string", "description": "Optional: only look inside this workspace (matched by name, case-insensitive)." },
                    "max_groups": { "type": "integer", "description": "Max groups returned, default 10, cap 30." }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_blocks",
            "description": "Page through one project's blocks in chronological order, as JSON (full content, annotation, source, pinned, timestamps). The middle granularity between a search snippet and a full pack. To read around a search hit, pass its block_id as around_block_id (with optional context, default 3 each side) — this centers the page and returns anchor_position; offset/limit are ignored. Optional filters (pinned / has_annotation / source_contains) AND-combine and narrow the page + total; they cannot be combined with around_block_id.",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Project id from list_threads / search_blocks." },
                    "offset": { "type": "integer", "description": "Blocks to skip, default 0." },
                    "limit": { "type": "integer", "description": "Blocks to return, default 20, cap 50." },
                    "around_block_id": { "type": "string", "description": "Center the page on this block (e.g. a search_blocks hit). Overrides offset/limit." },
                    "context": { "type": "integer", "description": "With around_block_id: blocks each side, default 3, cap 24." },
                    "pinned": { "type": "boolean", "description": "Only pinned (true) or only unpinned (false) blocks." },
                    "has_annotation": { "type": "boolean", "description": "Only blocks with (true) / without (false) a user annotation." },
                    "source_contains": { "type": "string", "description": "Only blocks whose source label contains this text, case-insensitive (e.g. 'MCP', 'PDF'). User-typed blocks have no source and never match." }
                },
                "required": ["thread_id"],
                "additionalProperties": false
            }
        },
        {
            "name": "check_library",
            "description": "Library hygiene audit (库体检): mechanically scan every visible text surface — block content, annotations, source labels, project titles/summaries, workspace names — for internal-pipeline leaks (spool:// URIs and raw 21-char ids, the same detector behind add_block's write warning), plus citations whose cited block no longer exists. Read-only, deterministic report: findings are located by project title + preview and quote the offending fragment; Spool never rewrites anything — AI-authored rows are flagged as editable in the app, user-written text is reported FYI-only and must never be 'fixed'. Run when the user asks for a library checkup (体检).",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "create_thread",
            "description": "Create a new project in Spool. Use when the user asks to start tracking a new topic/project from this conversation. Requires the user to have enabled MCP writes in Spool's settings. Returns the new thread_id.",
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Project title, short and specific." },
                    "workspace_title": { "type": "string", "description": "Optional workspace to file it under (matched by name, case-insensitive). Omit for the user's default (first) workspace." },
                    "summary": { "type": "string", "description": "Optional one-line status summary." }
                },
                "required": ["title"],
                "additionalProperties": false
            }
        },
        {
            "name": "add_block",
            "description": "Append one text block to an existing project — e.g. a conclusion or key finding from this conversation the user wants kept. The block is attributed to this AI client via its source label (never pass yourself off as the user). Keep it to the ONE thing worth keeping; do not bulk-import chat logs. Requires MCP writes enabled in Spool's settings.",
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Project id from list_threads / create_thread." },
                    "content": { "type": "string", "description": "The block text." },
                    "annotation": { "type": "string", "description": "Optional short note shown as the block's annotation." },
                    "source": { "type": "string", "description": "Optional detail appended after the enforced '<client> · MCP' label (e.g. a paper id or URL the content came from). The client identity itself cannot be overridden." },
                    "ref_block_id": { "type": "string", "description": "Optional citation: the block_id (from search_blocks / get_blocks) this finding builds on. Renders in packs as an '↩ cites:' line with the cited block's preview. Use this instead of ever writing ids into content." }
                },
                "required": ["thread_id", "content"],
                "additionalProperties": false
            }
        },
        {
            "name": "set_thread_summary",
            "description": "Write or refresh a project's one-line status summary (its catalogue card, shown in Spool's project header and list_threads). Use after meaningful new material lands in a project. Only an empty summary or one previously written via MCP can be set — a summary the user wrote by hand is never overwritten; if the tool refuses, tell the user your suggested summary instead. Requires MCP writes enabled in Spool's settings.",
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "thread_id": { "type": "string", "description": "Project id from list_threads / create_thread." },
                    "summary": { "type": "string", "description": "The new one-line summary. Concise — one sentence describing where the project stands." }
                },
                "required": ["thread_id", "summary"],
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
        match name {
            "list_threads" => list_threads_json(
                &open_db(&dir)?,
                args.get("title_contains").and_then(Value::as_str),
            ),
            "get_digest" => get_digest_json(
                &open_db(&dir)?,
                args.get("workspace_title").and_then(Value::as_str),
                args.get("since_days").and_then(Value::as_i64),
                args.get("max_chars").and_then(Value::as_i64),
                now_ms(),
            ),
            "search_blocks" => {
                let query =
                    args.get("query").and_then(Value::as_str).ok_or("缺少 query 参数。")?;
                let limit = args.get("limit").and_then(Value::as_i64);
                search_blocks_json(&open_db(&dir)?, query, limit)
            }
            "check_library" => check_library_json(&open_db(&dir)?, now_ms()),
            "find_similar_blocks" => find_similar_blocks_json(
                &open_db(&dir)?,
                args.get("thread_id").and_then(Value::as_str),
                args.get("workspace_title").and_then(Value::as_str),
                args.get("max_groups").and_then(Value::as_i64),
            ),
            "get_blocks" => {
                let thread_id = args
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .ok_or("缺少 thread_id 参数。")?;
                get_blocks_json(
                    &open_db(&dir)?,
                    thread_id,
                    args.get("offset").and_then(Value::as_i64),
                    args.get("limit").and_then(Value::as_i64),
                    args.get("around_block_id").and_then(Value::as_str),
                    args.get("context").and_then(Value::as_i64),
                    &BlockFilters {
                        pinned: args.get("pinned").and_then(Value::as_bool),
                        has_annotation: args.get("has_annotation").and_then(Value::as_bool),
                        source_contains: args.get("source_contains").and_then(Value::as_str),
                    },
                )
            }
            "get_pack" => {
                let thread_id = args
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .ok_or("缺少 thread_id 参数。")?;
                let range = args.get("range").and_then(Value::as_str).unwrap_or("all");
                if !RANGE_VALUES.contains(&range) {
                    return Err(format!("range 必须是 {RANGE_VALUES:?} 之一。"));
                }
                let max_chars = args
                    .get("max_chars")
                    .and_then(Value::as_i64)
                    .unwrap_or(PACK_DEFAULT_MAX_CHARS);
                let include_ids =
                    args.get("include_ids").and_then(Value::as_bool).unwrap_or(false);
                let built = build_pack(&open_db(&dir)?, thread_id, range)?;
                // R3 friction #2: the id side-table covers rendered blocks only and
                // rides outside the max_chars accounting (bounded by what was shown).
                let with_ids = |text: String, omit: usize| {
                    if include_ids {
                        let table = pack_id_table(&built.blocks, omit);
                        format!("{text}{table}")
                    } else {
                        text
                    }
                };
                match pack_guard_message(&built, range, max_chars) {
                    None => Ok(with_ids(built.text.clone(), 0)),
                    Some(msg) => {
                        // C2: over budget (the only guard with content on hand) tries a
                        // partial render; empty thread / empty window keep their messages,
                        // as does the extreme where skeleton + pinned alone overflow.
                        if built.range_blocks > 0 {
                            match budgeted_pack(&built, max_chars) {
                                Some((text, omit)) => Ok(with_ids(text, omit)),
                                None => Ok(msg),
                            }
                        } else {
                            Ok(msg)
                        }
                    }
                }
            }
            "create_thread" | "add_block" | "set_thread_summary" => {
                if !mcp_write_enabled(&dir) {
                    return Err(
                        "Spool 未允许 MCP 写入。请在 Spool → 设置 → 通用 → 「MCP 服务」\
                         打开「允许 AI 写入」后重试。"
                            .to_string(),
                    );
                }
                let mut conn = open_db_rw(&dir)?;
                if name == "create_thread" {
                    create_thread_json(
                        &conn,
                        args.get("workspace_title").and_then(Value::as_str),
                        args.get("title").and_then(Value::as_str).ok_or("缺少 title 参数。")?,
                        args.get("summary").and_then(Value::as_str),
                    )
                } else if name == "set_thread_summary" {
                    set_thread_summary_json(
                        &conn,
                        args.get("thread_id")
                            .and_then(Value::as_str)
                            .ok_or("缺少 thread_id 参数。")?,
                        args.get("summary").and_then(Value::as_str).ok_or("缺少 summary 参数。")?,
                    )
                } else {
                    add_block_json(
                        &mut conn,
                        args.get("thread_id")
                            .and_then(Value::as_str)
                            .ok_or("缺少 thread_id 参数。")?,
                        args.get("content").and_then(Value::as_str).ok_or("缺少 content 参数。")?,
                        args.get("source").and_then(Value::as_str),
                        args.get("annotation").and_then(Value::as_str),
                        args.get("ref_block_id").and_then(Value::as_str),
                    )
                }
            }
            other => Err(format!("未知工具: {other}")),
        }
    };

    match run() {
        Ok(text) => tool_result_text(text, false),
        Err(msg) => tool_result_text(msg, true),
    }
}

// ---------------------------------------------------------------------------------------
// §20.12 one-click client configuration (2026-07-07). The copy-paste snippet flow proved
// error-prone in practice: Ocean's Claude Desktop entry pointed at the literal
// placeholder "…/target/release/填写你的完整执行文件名称", so every launch failed to
// spawn → "Server disconnected". These helpers write the entry for the two supported
// clients directly (with a .bak backup first), always pointing at the running binary.
// Pure fs + JSON logic — Tauri command wrappers live in lib.rs.
// ---------------------------------------------------------------------------------------

// Where a client keeps its MCP servers, and in what shape.
//
// `root` existing ≈ the client is installed (a file for the CLIs, a directory for the
// apps). `key` is the object the server entries live under — every client here uses
// `mcpServers` except VS Code (`servers`) and Codex (`mcp_servers`). `typed` writes an
// explicit `"type": "stdio"` in the entry: Claude Code's own `claude mcp add` writes it
// (verified 2026-07-31 against the real CLI) and VS Code's schema names it, while Claude
// Desktop and Cursor have only ever taken command/args — so they are left exactly as
// they were. `toml` switches the whole read/merge path to toml_edit (ChatGPT desktop /
// Codex CLI share ~/.codex/config.toml — the one non-JSON target, decision ① 2026-07-31).
struct ClientSpec {
    root: PathBuf,
    cfg: PathBuf,
    key: &'static str,
    typed: bool,
    toml: bool,
}

fn client_config_paths(client: &str) -> Result<ClientSpec, String> {
    let home = std::env::var("HOME").map_err(|e| format!("no HOME: {e}"))?;
    let home = PathBuf::from(home);
    let spec = match client {
        "claude" => {
            let root = home.join("Library/Application Support/Claude");
            let cfg = root.join("claude_desktop_config.json");
            ClientSpec { root, cfg, key: "mcpServers", typed: false, toml: false }
        }
        "cursor" => {
            let root = home.join(".cursor");
            let cfg = root.join("mcp.json");
            ClientSpec { root, cfg, key: "mcpServers", typed: false, toml: false }
        }
        // Claude Code (CLI). User scope = top-level `mcpServers` in ~/.claude.json,
        // i.e. what `claude mcp add --scope user` writes; available in every project.
        "claude-code" => {
            let cfg = home.join(".claude.json");
            ClientSpec { root: cfg.clone(), cfg, key: "mcpServers", typed: true, toml: false }
        }
        // VS Code (Copilot chat). User-profile mcp.json — servers available in every
        // workspace, the equivalent of "user scope" elsewhere.
        "vscode" => {
            let root = home.join("Library/Application Support/Code");
            let cfg = root.join("User/mcp.json");
            ClientSpec { root, cfg, key: "servers", typed: true, toml: false }
        }
        "windsurf" => {
            let root = home.join(".codeium/windsurf");
            let cfg = root.join("mcp_config.json");
            ClientSpec { root, cfg, key: "mcpServers", typed: false, toml: false }
        }
        // ChatGPT desktop / Codex CLI / Codex IDE extensions share this one file
        // (DESIGN_MCP_ONECLICK §2, sources checked 2026-07-31). `[mcp_servers.spool]`
        // with command/args — no explicit type field in their schema.
        "codex" => {
            let root = home.join(".codex");
            let cfg = root.join("config.toml");
            ClientSpec { root, cfg, key: "mcp_servers", typed: false, toml: true }
        }
        other => return Err(format!("unknown MCP client: {other}")),
    };
    Ok(spec)
}

// Read-only probe for the Settings UI badge:
//   not-installed — detection root missing
//   unconfigured  — no config file / no parseable spool entry
//   configured    — spool entry points at THIS running binary
//   stale         — spool entry exists but points elsewhere (old/dev/deleted build)
pub fn client_status(client: &str) -> Result<String, String> {
    let spec = client_config_paths(client)?;
    if !spec.root.exists() {
        return Ok("not-installed".into());
    }
    let Ok(raw) = std::fs::read_to_string(&spec.cfg) else {
        return Ok("unconfigured".into());
    };
    let cmd: Option<String> = if spec.toml {
        let Ok(doc) = raw.parse::<toml_edit::DocumentMut>() else {
            return Ok("unconfigured".into());
        };
        doc.get(spec.key)
            .and_then(|i| i.as_table_like())
            .and_then(|t| t.get("spool"))
            .and_then(|i| i.as_table_like())
            .and_then(|t| t.get("command"))
            .and_then(|i| i.as_str())
            .map(str::to_owned)
    } else {
        let Ok(v) = serde_json::from_str::<Value>(&raw) else {
            return Ok("unconfigured".into());
        };
        v.get(spec.key)
            .and_then(|m| m.get("spool"))
            .and_then(|s| s.get("command"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    match cmd {
        None => Ok("unconfigured".into()),
        Some(c) => {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            if PathBuf::from(c) == exe {
                Ok("configured".into())
            } else {
                Ok("stale".into())
            }
        }
    }
}

// Merge `mcpServers.spool = { command: <current_exe>, args: ["--mcp"] }` into the
// client's config, creating the file if needed. The rest of the config is preserved
// byte-for-value; an existing file is first copied to `<name>.bak`. An unparseable
// existing file is an error (merging is impossible; replacing could destroy the
// user's other server entries), never silently overwritten.
pub fn configure_client(client: &str) -> Result<String, String> {
    let ClientSpec { root, cfg, key, typed, toml } = client_config_paths(client)?;
    if !root.exists() {
        return Ok("not-installed".into());
    }
    if toml {
        return configure_client_toml(&cfg, key);
    }
    let mut v: Value = match std::fs::read_to_string(&cfg) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("现有配置文件无法解析（已保持原样）: {e}"))?,
        Err(_) => json!({}),
    };
    if !v.is_object() {
        return Err("现有配置文件不是 JSON 对象（已保持原样）".into());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;

    if cfg.exists() {
        let bak = cfg.with_extension("json.bak");
        std::fs::copy(&cfg, &bak).map_err(|e| format!("备份失败，未写入: {e}"))?;
    }

    let servers = v
        .as_object_mut()
        .expect("checked is_object above")
        .entry(key)
        .or_insert_with(|| json!({}));
    if !servers.is_object() {
        return Err(format!("现有配置的 {key} 不是对象（已保持原样）"));
    }
    let entry = if typed {
        json!({ "type": "stdio", "command": exe.to_string_lossy(), "args": ["--mcp"] })
    } else {
        json!({ "command": exe.to_string_lossy(), "args": ["--mcp"] })
    };
    servers
        .as_object_mut()
        .expect("checked above")
        .insert("spool".into(), entry);

    let pretty = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    std::fs::write(&cfg, pretty + "\n").map_err(|e| format!("写入失败: {e}"))?;
    Ok("written".into())
}

// The TOML twin of the JSON merge above, same contract: back up first, touch only
// `<key>.spool`, refuse to write over a file we cannot parse. toml_edit (not toml) on
// purpose — it round-trips the user's comments and formatting, so merging one table
// does not reshuffle their file.
fn configure_client_toml(cfg: &std::path::Path, key: &str) -> Result<String, String> {
    let mut doc: toml_edit::DocumentMut = match std::fs::read_to_string(cfg) {
        Ok(raw) => raw
            .parse()
            .map_err(|e| format!("现有配置文件无法解析（已保持原样）: {e}"))?,
        Err(_) => toml_edit::DocumentMut::new(),
    };
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;

    if cfg.exists() {
        let bak = cfg.with_extension("toml.bak");
        std::fs::copy(cfg, &bak).map_err(|e| format!("备份失败，未写入: {e}"))?;
    }

    let servers = doc.entry(key).or_insert(toml_edit::table());
    // Implicit parent → the output is a clean `[mcp_servers.spool]` section, not an
    // empty `[mcp_servers]` header floating above it.
    if let Some(t) = servers.as_table_mut() {
        t.set_implicit(true);
    }
    let Some(servers) = servers.as_table_like_mut() else {
        return Err(format!("现有配置的 {key} 不是表（已保持原样）"));
    };
    let mut entry = toml_edit::Table::new();
    entry.insert("command", toml_edit::value(exe.to_string_lossy().as_ref()));
    let mut args = toml_edit::Array::new();
    args.push("--mcp");
    entry.insert("args", toml_edit::value(args));
    servers.insert("spool", toml_edit::Item::Table(entry));

    std::fs::write(cfg, doc.to_string()).map_err(|e| format!("写入失败: {e}"))?;
    Ok("written".into())
}

// The §17 compress instruction, ported from src/lib/ai/prompts/compressPack.ts (a
// tunable prompt, not §12-locked). Sync discipline: if the TS prompt's rules change,
// mirror them here — the two should stay semantically identical, though this one is
// executed by the CLIENT's model (§20.13: borrow the third-party AI's capability),
// not by Spool's own router.
fn compress_prompt_text(pack_text: &str) -> String {
    format!(
        "你是一个上下文压缩工具。下面是一份由 Spool 生成的项目上下文简报,它太长了。把它压缩成一份更短但信息完整的版本,供粘贴给另一个 AI 使用。\n\n# 原始简报\n{pack_text}\n\n# 规则\n1. 完整保留文档骨架,以下部分一字不改地照抄:开头的 \"# Project Context\" 标题块、\"## How to Read This Context\" 整节、\"## Pinned Blocks\" 整节、\"## Related Files & Links\" 整节、\"## Output Language\" 整节,以及任何 \"---\" 之后的任务指令块\n2. 只压缩 \"## Full Record\" 一节:合并重复信息,压缩冗长的引用和文件提取内容,保留每条的 [时间戳 · from 来源] 格式\n3. \"## Full Record\" 里以下内容一字不改地保留:所有 note: 行(用户批注)、所有不带来源标注的条目(用户手写内容)、所有 ==...== 高亮片段\n4. 绝对不要添加原始简报里没有的信息,不要评论,不要总结陈词\n5. 压缩要克制:目标是去冗余,不是缩成提要。压缩版整体长度一般应在原文的四分之一到二分之一;拿不准该不该删的内容就保留\n6. 直接输出压缩后的完整简报——不要前言、解释或代码块标记"
    )
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
            // Remember who's connected — feeds the write tools' source label.
            if let Some(label) = params.get("clientInfo").and_then(client_label_from_info) {
                *CLIENT_NAME.lock().unwrap() = Some(label);
            }
            Ok(json!({
                "protocolVersion": proto,
                "capabilities": { "tools": {}, "prompts": {}, "resources": { "listChanged": true } },
                "serverInfo": { "name": "spool", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Spool (思簿) is the user's local context hub. HARD RULE first — naming: talk to the user in project/block titles only; raw ids (sbC2zgTo…) are tool parameters — never say them, never write them into content/annotations (add_block warns; cite blocks via ref_block_id instead). AUTHORITY (each pack opens with the full rules — this is the digest-sized version): 📖 Reference (institutional sources) = ground truth; 🧩 Synthesis (AI-written essays) = framing, not facts; 🔄 Process (chat traces) = read for the user's evolving questions; 💭 Personal (sourceless entries + note: lines) = the user's own intent, highest signal; ==spans== are user-highlighted. WORKFLOW: cross-project questions (\"最近在忙什么\") → get_digest first; its 📌 anchor lines are truncated pointers — full pinned text via get_blocks(pinned=true) or get_pack(range=pinned). Pick projects with list_threads (watch approx_pack_chars; title_contains resolves a title to its id); locate topics with search_blocks, then read around a hit with get_blocks(around_block_id=…) or filter pages (pinned / has_annotation / source_contains). find_similar_blocks only reports duplicates — merging is the user's curation. get_pack is one project's full briefing; over budget it keeps the header + pinned + newest blocks and says what it omitted; pass include_ids=true when you will cite or jump from what you read. WRITING (needs the user's consent toggles in Spool settings): ONE finding per add_block, with an annotation saying why it matters; cite the block it builds on via ref_block_id; create_thread only for a genuinely new topic; set_thread_summary refreshes the catalogue card — if refused (user-written), tell the user your suggestion instead of retrying. If you ever compress a pack: keep the skeleton, every note: line, sourceless entry and ==span== verbatim; dedupe only the Full Record; store via add_block, never as a replacement."
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools_descriptor() })),
        "tools/call" => Ok(handle_tool_call(params)),
        // §20.13 v2 resources probe: threads as native @-mentionable resources. When
        // the toggle is off (or the data dir is unreachable) answer an EMPTY list, not
        // an error — Claude Desktop probes this even for undeclared servers, and some
        // client builds surface errors to the user.
        "resources/list" => {
            let resources = (|| -> Option<Vec<Value>> {
                let dir = app_data_dir()?;
                if !mcp_enabled(&dir) {
                    return None;
                }
                thread_resources(&open_db(&dir).ok()?).ok()
            })()
            .unwrap_or_default();
            Ok(json!({ "resources": resources }))
        }
        "resources/read" => {
            let uri = params.get("uri").and_then(Value::as_str).unwrap_or("");
            let thread_id = uri
                .strip_prefix(THREAD_URI_PREFIX)
                .ok_or((-32602, format!("未知资源 uri: {uri}")))?;
            let text = (|| -> Result<String, String> {
                let dir = app_data_dir().ok_or("无法定位 Spool 数据目录。")?;
                if !mcp_enabled(&dir) {
                    return Err("Spool 的 MCP 服务未开启。".to_string());
                }
                get_pack_text(&open_db(&dir)?, thread_id, "all")
            })()
            .map_err(|e| (-32603, e))?;
            Ok(json!({
                "contents": [{ "uri": uri, "mimeType": "text/plain", "text": text }]
            }))
        }
        // §20.13: the compress prompt runs on the CLIENT's model — Spool provides the
        // §17 instruction + the pack, the connected AI does the compression.
        "prompts/list" => Ok(json!({
            "prompts": [{
                "name": "compress_pack",
                "description": "Compress one Spool project's context pack using this AI (keeps the skeleton and all user notes/highlights verbatim; deduplicates the Full Record).",
                "arguments": [
                    { "name": "thread_id", "description": "Project id from list_threads.", "required": true },
                    { "name": "range", "description": "all (default) / pinned / last7 / last30.", "required": false }
                ]
            }]
        })),
        "prompts/get" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            if name != "compress_pack" {
                return Err((-32602, format!("unknown prompt: {name}")));
            }
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            let thread_id = args
                .get("thread_id")
                .and_then(Value::as_str)
                .ok_or((-32602, "缺少 thread_id 参数。".to_string()))?;
            let range = args.get("range").and_then(Value::as_str).unwrap_or("all");
            if !RANGE_VALUES.contains(&range) {
                return Err((-32602, format!("range 必须是 {RANGE_VALUES:?} 之一。")));
            }
            let text = (|| -> Result<String, String> {
                let dir = app_data_dir().ok_or("无法定位 Spool 数据目录。")?;
                if !mcp_enabled(&dir) {
                    return Err("Spool 的 MCP 服务未开启。".to_string());
                }
                get_pack_text(&open_db(&dir)?, thread_id, range)
            })()
            .map_err(|e| (-32603, e))?;
            Ok(json!({
                "description": "Compress this Spool pack per the embedded rules.",
                "messages": [{
                    "role": "user",
                    "content": { "type": "text", "text": compress_prompt_text(&text) }
                }]
            }))
        }
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
        // §20.13 v2: a successful write changes the resources list (new thread) and
        // its ordering (new block / summary bumps updated_at) — tell listChanged-capable
        // clients.
        let tool = params.get("name").and_then(Value::as_str).unwrap_or("");
        if method == "tools/call"
            && matches!(tool, "create_thread" | "add_block" | "set_thread_summary")
            && response["result"]["isError"].as_bool() == Some(false)
        {
            let note =
                json!({ "jsonrpc": "2.0", "method": "notifications/resources/list_changed" });
            if writeln!(out, "{note}").and_then(|()| out.flush()).is_err() {
                break;
            }
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

    const NO_FILTERS: BlockFilters = BlockFilters {
        pinned: None,
        has_annotation: None,
        source_contains: None,
    };

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

    fn fixture_rows(
    ) -> (String, Vec<BlockRow>, Vec<AttachmentRow>, HashMap<String, String>, RefBlocks, i64)
    {
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
                ref_block_id: b["refBlockId"].as_str().map(String::from),
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
        let ref_blocks: RefBlocks = v["refBlocks"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, val)| {
                (
                    k.clone(),
                    (
                        val["content"].as_str().unwrap().to_string(),
                        val["createdAt"].as_i64().unwrap(),
                    ),
                )
            })
            .collect();
        (title, blocks, attachments, ref_titles, ref_blocks, now)
    }

    #[test]
    fn golden_pack_matches_fixture() {
        let (title, blocks, attachments, ref_titles, ref_blocks, now) = fixture_rows();
        let out = assemble_pack(&title, &blocks, &attachments, &ref_titles, &ref_blocks, now);
        assert_eq!(normalize_dates(&out), normalize_dates(EXPECTED));
    }

    #[test]
    fn range_filter_matches_ts_semantics() {
        let (_, blocks, _, _, _, now) = fixture_rows();
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

    // §20.13 write tools: exercise the pure write path against a scratch DB built
    // from the real schema (compile-time include, so schema drift breaks the test).
    #[test]
    fn write_tools_create_and_append() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-write-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let db = tmp.join("spool.db");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
             VALUES ('ws1', '收件箱', 0, 1, 1)",
            [],
        )
        .unwrap();
        drop(conn);

        // Version guard: an unknown schema refuses read-write access outright.
        let bad = tmp.join("bad");
        std::fs::create_dir_all(&bad).unwrap();
        let c = Connection::open(bad.join("spool.db")).unwrap();
        c.execute_batch("PRAGMA user_version = 99; CREATE TABLE x(y);").unwrap();
        drop(c);
        assert!(open_db_rw(&bad).unwrap_err().contains("schema"));

        let mut conn = open_db_rw(&tmp).unwrap();

        // create_thread: default workspace resolution + row shape.
        let out = create_thread_json(&conn, None, "MCP 写入测试", Some("一句摘要")).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let tid = v["thread_id"].as_str().unwrap().to_string();
        assert_eq!(tid.len(), 21);
        assert_eq!(v["workspace"], "收件箱");
        // unknown workspace errors and names the available ones
        let err = create_thread_json(&conn, Some("不存在"), "x", None).unwrap_err();
        assert!(err.contains("收件箱"));

        // add_block: appends attributed content and bumps the thread's updated_at.
        *CLIENT_NAME.lock().unwrap() = Some("TestClient".into());
        let before: i64 = conn
            .query_row("SELECT updated_at FROM threads WHERE id = ?1", [&tid], |r| r.get(0))
            .unwrap();
        let out = add_block_json(&mut conn, &tid, "  结论内容  ", None, Some("批注"), None).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["source"], "TestClient · MCP");
        let (content, source, annotation): (String, String, String) = conn
            .query_row(
                "SELECT content, source, annotation FROM blocks WHERE id = ?1",
                [v["block_id"].as_str().unwrap()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(content, "结论内容");
        assert_eq!(source, "TestClient · MCP");
        assert_eq!(annotation, "批注");
        let after: i64 = conn
            .query_row("SELECT updated_at FROM threads WHERE id = ?1", [&tid], |r| r.get(0))
            .unwrap();
        assert!(after >= before);
        // v2.1 (P0-1): a custom source is a suffix — the client label survives.
        let out =
            add_block_json(&mut conn, &tid, "引用内容", Some("lecture-11.pdf"), None, None).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["source"], "TestClient · MCP — lecture-11.pdf");
        // deleted / missing thread refuses
        assert!(add_block_json(&mut conn, "nope", "x", None, None, None).is_err());
        // empty content refuses
        assert!(add_block_json(&mut conn, &tid, "   ", None, None, None).is_err());

        // v2.4 (D2): ref_block_id — validated live at write time, stored, echoed by
        // get_blocks, and rendered as the ↩ cites line (live + dangling) in the pack.
        let cited: Value = serde_json::from_str(
            &add_block_json(&mut conn, &tid, "被引的原始结论", None, None, None).unwrap(),
        )
        .unwrap();
        let cited_id = cited["block_id"].as_str().unwrap().to_string();
        let citing: Value = serde_json::from_str(
            &add_block_json(&mut conn, &tid, "站在前一块上的新结论", None, None, Some(&cited_id))
                .unwrap(),
        )
        .unwrap();
        let stored: String = conn
            .query_row(
                "SELECT ref_block_id FROM blocks WHERE id = ?1",
                [citing["block_id"].as_str().unwrap()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, cited_id);
        let err =
            add_block_json(&mut conn, &tid, "引用不存在的块", None, None, Some("nope")).unwrap_err();
        assert!(err.contains("ref_block_id"), "{err}");
        let page: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &NO_FILTERS).unwrap(),
        )
        .unwrap();
        let citing_row = page["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|b| b["content"] == "站在前一块上的新结论")
            .unwrap();
        assert_eq!(citing_row["ref_block_id"].as_str().unwrap(), cited_id);
        // R3 BUG-5: the citation resolves inline — no second query needed.
        assert_eq!(citing_row["cited"]["thread_title"], "MCP 写入测试");
        assert!(citing_row["cited"]["preview"].as_str().unwrap().contains("被引的原始结论"));
        let pack = build_pack(&conn, &tid, "all").unwrap().text;
        assert!(pack.contains("↩ cites: ["), "{pack}");
        assert!(pack.contains("被引的原始结论"));
        // Dangling: hard-delete the citee, the line degrades explicitly.
        conn.execute("DELETE FROM blocks WHERE id = ?1", [&cited_id]).unwrap();
        let pack = build_pack(&conn, &tid, "all").unwrap().text;
        assert!(pack.contains("↩ cites: (cited block no longer exists)"), "{pack}");
        let page: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &NO_FILTERS).unwrap(),
        )
        .unwrap();
        let citing_row = page["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|b| b["content"] == "站在前一块上的新结论")
            .unwrap();
        assert!(citing_row["cited"].is_null(), "{citing_row}");
    }

    // The GUI migration registry (client.ts SCHEMA_VERSION) and this binary must agree
    // on the schema version — drift means the write tools refuse every request at
    // runtime. Parse the TS constant at compile time so tests catch it instead.
    #[test]
    fn schema_version_locked_to_gui() {
        let client_ts = include_str!("../../src/lib/db/client.ts");
        let line = client_ts
            .lines()
            .find(|l| l.trim_start().starts_with("const SCHEMA_VERSION = "))
            .expect("client.ts declares SCHEMA_VERSION");
        let n: i64 = line
            .split('=')
            .nth(1)
            .unwrap()
            .trim()
            .trim_end_matches(';')
            .parse()
            .expect("numeric SCHEMA_VERSION");
        assert_eq!(n, EXPECTED_SCHEMA_VERSION, "client.ts SCHEMA_VERSION drifted from mcp.rs");
    }

    // find_similar_blocks: trigram Jaccard grouping is read-only and skips ref blocks.
    #[test]
    fn find_similar_blocks_groups_duplicates() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-similar-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute_batch(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
               VALUES ('ws1', '收件箱', 0, 1, 1), ('ws2', '生活', 1, 1, 1);
             INSERT INTO threads (id, workspace_id, title, created_at, updated_at)
               VALUES ('t1', 'ws1', '未分类', 1, 1), ('t2', 'ws1', '别处', 1, 1),
                      ('t9', 'ws2', '菜谱', 1, 1);
             INSERT INTO blocks (id, thread_id, kind, content, pinned, created_at) VALUES
               ('c1', 't9', 'text', '西红柿炒蛋:先炒蛋后下西红柿,出锅前撒糖', 0, 7),
               ('c2', 't9', 'text', '西红柿炒蛋:先炒蛋后下西红柿,出锅前撒糖', 0, 8);
             INSERT INTO blocks (id, thread_id, kind, content, pinned, created_at) VALUES
               ('b1', 't1', 'text', 'GRE 填空题目里 mercurial 的意思是善变的', 0, 1),
               ('b2', 't1', 'text', 'GRE 填空题目里 mercurial 的意思是善变的', 0, 2),
               ('b3', 't1', 'text', 'GRE 填空题里 mercurial 的意思是：善变的。', 0, 3),
               ('b4', 't2', 'text', 'GRE 填空题目里 mercurial 的意思是善变的', 0, 4),
               ('b5', 't1', 'text', '完全不相关的一条：明天去图书馆借书', 0, 5),
               ('b6', 't1', 'ref',  'GRE 填空题目里 mercurial 的意思是善变的', 0, 6);",
        )
        .unwrap();

        let out = find_similar_blocks_json(&conn, None, None, None).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let groups = v["groups"].as_array().unwrap();
        assert_eq!(groups.len(), 2, "{out}");
        let gre_group = groups
            .iter()
            .find(|g| g["blocks"][0]["block_id"] == "b1")
            .expect("GRE group present");
        let ids: Vec<&str> = gre_group["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b["block_id"].as_str().unwrap())
            .collect();
        // The exact + near duplicates group together across threads; the unrelated
        // block and the ref-kind copy stay out.
        assert_eq!(ids, vec!["b1", "b2", "b3", "b4"]);
        assert!(gre_group["similarity"].as_f64().unwrap() > 0.99);

        // R3 friction #5: workspace scoping — 收件箱 sees only the GRE group, the
        // recipe pair stays in 生活; unknown name errors with the live list; passing
        // both scopes is refused.
        let scoped: Value = serde_json::from_str(
            &find_similar_blocks_json(&conn, None, Some("收件箱"), None).unwrap(),
        )
        .unwrap();
        assert_eq!(scoped["groups"].as_array().unwrap().len(), 1, "{scoped}");
        assert_eq!(scoped["groups"][0]["blocks"][0]["block_id"], "b1");
        let err = find_similar_blocks_json(&conn, None, Some("不存在"), None).unwrap_err();
        assert!(err.contains("收件箱") && err.contains("生活"), "{err}");
        let err = find_similar_blocks_json(&conn, Some("t1"), Some("收件箱"), None).unwrap_err();
        assert!(err.contains("二选一"), "{err}");

        // Thread scoping narrows the group to that thread's members.
        let out = find_similar_blocks_json(&conn, Some("t2"), None, None).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["groups"].as_array().unwrap().len(), 0);
        // Unknown thread errors.
        assert!(find_similar_blocks_json(&conn, Some("nope"), None, None).is_err());

        // R2 C1: around_block_id centers the page (t1 order: b1,b2,b3,b5,b6 → b3 at
        // position 2; context 1 → b2..b5) and reports the anchor position.
        let out = get_blocks_json(&conn, "t1", None, None, Some("b3"), Some(1), &NO_FILTERS).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["anchor_position"], 2);
        let ids: Vec<&str> = v["blocks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b["block_id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, vec!["b2", "b3", "b5"]);
        // A block from another thread is not silently treated as offset 0 — and the
        // error names the owning thread (R3 BUG-8) so the model can self-correct.
        let err =
            get_blocks_json(&conn, "t1", None, None, Some("b4"), None, &NO_FILTERS).unwrap_err();
        assert!(err.contains("别处"), "{err}");
        assert!(!err.contains("  "), "double-space artifact: {err}");
    }

    // set_thread_summary provenance guard: MCP may fill an empty card or refresh its
    // own, but never overwrite a user-written (or legacy provenance-less) summary.
    #[test]
    fn set_thread_summary_respects_provenance() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-summary-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
             VALUES ('ws1', '收件箱', 0, 1, 1)",
            [],
        )
        .unwrap();
        drop(conn);
        let conn = open_db_rw(&tmp).unwrap();

        // create_thread with a summary stamps provenance 'mcp'.
        let out = create_thread_json(&conn, None, "带摘要", Some("初始摘要")).unwrap();
        let tid = serde_json::from_str::<Value>(&out).unwrap()["thread_id"]
            .as_str()
            .unwrap()
            .to_string();
        let src: String = conn
            .query_row("SELECT summary_source FROM threads WHERE id = ?1", [&tid], |r| r.get(0))
            .unwrap();
        assert_eq!(src, "mcp");

        // MCP refreshing its own summary is fine.
        set_thread_summary_json(&conn, &tid, "更新的摘要").unwrap();
        let s: String = conn
            .query_row("SELECT summary FROM threads WHERE id = ?1", [&tid], |r| r.get(0))
            .unwrap();
        assert_eq!(s, "更新的摘要");

        // The GUI hand-edit path (updateThread) stamps 'user' — MCP must refuse.
        conn.execute(
            "UPDATE threads SET summary = '用户手写', summary_source = 'user' WHERE id = ?1",
            [&tid],
        )
        .unwrap();
        let err = set_thread_summary_json(&conn, &tid, "AI 想覆盖").unwrap_err();
        assert!(err.contains("不得覆盖"), "{err}");

        // A legacy non-empty summary without provenance is protected the same way…
        conn.execute(
            "UPDATE threads SET summary = '旧摘要', summary_source = NULL WHERE id = ?1",
            [&tid],
        )
        .unwrap();
        assert!(set_thread_summary_json(&conn, &tid, "x").is_err());

        // …but an emptied card is writable again (the user clearing it releases the lock).
        conn.execute(
            "UPDATE threads SET summary = NULL, summary_source = NULL WHERE id = ?1",
            [&tid],
        )
        .unwrap();
        set_thread_summary_json(&conn, &tid, "重新填卡").unwrap();

        // Empty summary / unknown thread refuse.
        assert!(set_thread_summary_json(&conn, &tid, "   ").is_err());
        assert!(set_thread_summary_json(&conn, "nope", "x").is_err());
    }

    // §20.13 v2: search (FTS + LIKE parity with §9.10) and the resources probe, on a
    // scratch DB seeded through the write tools (so the FTS triggers are exercised).
    #[test]
    fn search_blocks_and_thread_resources() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-search-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
             VALUES ('ws1', '收件箱', 0, 1, 1)",
            [],
        )
        .unwrap();
        drop(conn);
        let mut conn = open_db_rw(&tmp).unwrap();
        let out = create_thread_json(&conn, None, "检索目标", Some("摘要一句")).unwrap();
        let tid = serde_json::from_str::<Value>(&out).unwrap()["thread_id"]
            .as_str()
            .unwrap()
            .to_string();
        add_block_json(&mut conn, &tid, "量子退火的调参结论", Some("论文"), Some("再核对"), None)
            .unwrap();
        // Word-boundary fodder (v2.1, field report A3): "ai" inside a word must not
        // hit; standalone "AI" must.
        add_block_json(&mut conn, &tid, "the obtained results were stable", None, None, None).unwrap();
        add_block_json(&mut conn, &tid, "AI 分类器的结论", None, None, None).unwrap();

        // FTS path (≥3 codepoints): {total, hits} with a **marked** snippet.
        let res: Value =
            serde_json::from_str(&search_blocks_json(&conn, "调参结论", None).unwrap()).unwrap();
        assert_eq!(res["total"], 1);
        let hits = res["hits"].as_array().unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["thread_id"], tid.as_str());
        assert_eq!(hits[0]["thread_title"], "检索目标");
        assert!(hits[0]["snippet"].as_str().unwrap().contains("**调参结论**"));
        assert_eq!(hits[0]["annotation"], "再核对");

        // LIKE path (2 codepoints): annotation-only match snippets the annotation.
        let res: Value =
            serde_json::from_str(&search_blocks_json(&conn, "核对", None).unwrap()).unwrap();
        assert_eq!(res["total"], 1);
        assert!(res["hits"][0]["snippet"].as_str().unwrap().contains("note: "));
        assert!(res["hits"][0]["snippet"].as_str().unwrap().contains("**核对**"));

        // Short Latin query: word boundary required — "obtained" must not hit.
        let res: Value =
            serde_json::from_str(&search_blocks_json(&conn, "ai", None).unwrap()).unwrap();
        assert_eq!(res["total"], 1);
        assert!(res["hits"][0]["snippet"].as_str().unwrap().contains("**AI**"));


        // No hit → empty hits, not an error; blank query → error.
        let none: Value =
            serde_json::from_str(&search_blocks_json(&conn, "不存在的词", None).unwrap()).unwrap();
        assert_eq!(none["total"], 0);
        assert!(none["hits"].as_array().unwrap().is_empty());
        assert!(search_blocks_json(&conn, "  ", None).is_err());

        // get_blocks paging: chronological, total independent of the page size.
        let page: Value =
            serde_json::from_str(&get_blocks_json(&conn, &tid, None, Some(1), None, None, &NO_FILTERS).unwrap())
                .unwrap();
        assert_eq!(page["total"], 3);
        assert_eq!(page["blocks"].as_array().unwrap().len(), 1);
        assert_eq!(page["blocks"][0]["content"], "量子退火的调参结论");
        let page2: Value =
            serde_json::from_str(&get_blocks_json(&conn, &tid, Some(2), None, None, None, &NO_FILTERS).unwrap())
                .unwrap();
        assert_eq!(page2["blocks"][0]["content"], "AI 分类器的结论");
        assert!(get_blocks_json(&conn, "nope", None, None, None, None, &NO_FILTERS).is_err());

        // v2.4 (C5): page filters AND-combine, narrow `total`, echo back, and refuse
        // to mix with around_block_id.
        conn.execute("UPDATE blocks SET pinned = 1 WHERE content LIKE 'AI %'", []).unwrap();
        let f = |pinned, has_annotation, source_contains| BlockFilters {
            pinned,
            has_annotation,
            source_contains,
        };
        let pinned_only: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &f(Some(true), None, None))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(pinned_only["total"], 1);
        assert_eq!(pinned_only["blocks"][0]["content"], "AI 分类器的结论");
        assert_eq!(pinned_only["filters"]["pinned"], true);
        let annotated: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &f(None, Some(true), None))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(annotated["total"], 1);
        assert_eq!(annotated["blocks"][0]["annotation"], "再核对");
        // source_contains is case-insensitive and never matches sourceless rows.
        let by_source: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &f(None, None, Some("mcp")))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(by_source["total"], 3, "{by_source}"); // every block here is MCP-written
        let none_match: Value = serde_json::from_str(
            &get_blocks_json(&conn, &tid, None, None, None, None, &f(Some(true), Some(true), None))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(none_match["total"], 0);
        assert!(get_blocks_json(&conn, &tid, None, None, None, None, &f(None, None, Some("  ")))
            .is_err());
        let bid = pinned_only["blocks"][0]["block_id"].as_str().unwrap();
        let err = get_blocks_json(&conn, &tid, None, None, Some(bid), None, &f(Some(true), None, None))
            .unwrap_err();
        assert!(err.contains("不能同时使用"), "{err}");
        // Unfiltered responses carry no filters echo.
        assert!(page.get("filters").is_none());

        // list_threads carries the one-liner summary + read-budget fields (v2.1).
        let listed: Vec<Value> =
            serde_json::from_str(&list_threads_json(&conn, None).unwrap()).unwrap();
        assert_eq!(listed[0]["summary"], "摘要一句");
        // one pin: the C5 block pinned above
        assert_eq!(listed[0]["pinned"], 1);
        assert!(listed[0]["approx_pack_chars"].as_i64().unwrap() > 0);


        // R3 BUG-1: the boundary must hold on the trigram path too — a 3+ char Latin
        // word must not hit substrings ("GRE" inside "degree"), while the standalone
        // word still matches; CJK keeps substring semantics.
        add_block_json(&mut conn, &tid, "a degree of freedom in Great Deluge", None, None, None)
            .unwrap();
        add_block_json(&mut conn, &tid, "GRE 填空的高频词", None, None, None).unwrap();
        let res: Value =
            serde_json::from_str(&search_blocks_json(&conn, "GRE", None).unwrap()).unwrap();
        assert_eq!(res["total"], 1, "{res}");
        assert!(res["hits"][0]["snippet"].as_str().unwrap().contains("**GRE**"));
        let res: Value =
            serde_json::from_str(&search_blocks_json(&conn, "填空", None).unwrap()).unwrap();
        assert_eq!(res["total"], 1);

        // Resources probe: uri shape, summary as description.
        let res = thread_resources(&conn).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0]["uri"], format!("{THREAD_URI_PREFIX}{tid}"));
        assert_eq!(res[0]["name"], "检索目标");
        assert_eq!(res[0]["description"], "摘要一句");

        // Soft-deleted threads vanish from both search and resources.
        conn.execute("UPDATE threads SET deleted_at = 2 WHERE id = ?1", [&tid]).unwrap();
        let gone: Value =
            serde_json::from_str(&search_blocks_json(&conn, "调参结论", None).unwrap()).unwrap();
        assert_eq!(gone["total"], 0);
        assert!(thread_resources(&conn).unwrap().is_empty());
    }

    // v2.4 (6a): the GROUP BY rewrite of list_threads must keep the correlated-subquery
    // semantics — per-attachment 8k inline cap, include_in_pack/extracted-text gates,
    // zero rows for empty threads, soft-deleted threads/workspaces excluded.
    #[test]
    fn list_threads_aggregates_match_row_semantics() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-list-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        let long = "x".repeat(9000);
        conn.execute_batch(&format!(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
               VALUES ('ws1', '收件箱', 0, 1, 1), ('ws2', '已删空间', 1, 1, 1);
             UPDATE workspaces SET deleted_at = 2 WHERE id = 'ws2';
             INSERT INTO threads (id, workspace_id, title, created_at, updated_at) VALUES
               ('t1', 'ws1', '有料', 1, 9), ('t2', 'ws1', '空的', 1, 5),
               ('t3', 'ws1', '已删', 1, 3), ('t4', 'ws2', '空间已删', 1, 1);
             UPDATE threads SET deleted_at = 2 WHERE id = 't3';
             INSERT INTO blocks (id, thread_id, kind, content, annotation, pinned, created_at) VALUES
               ('b1', 't1', 'text', '12345', '批注九个字符啊啊啊', 1, 1),
               ('b2', 't1', 'text', '1234567890', NULL, 0, 2),
               ('b3', 't3', 'text', '不应计入', NULL, 0, 1);
             INSERT INTO attachments (id, block_id, kind, target, label, extracted_text,
                                      include_in_pack, created_at) VALUES
               ('a1', 'b1', 'file', '/x/a.pdf', 'a.pdf', '{long}', 1, 1),
               ('a2', 'b1', 'file', '/x/b.pdf', 'b.pdf', '弃权不内联', 0, 2),
               ('a3', 'b2', 'file', '/x/c.pdf', 'c.pdf', NULL, 1, 3);"
        ))
        .unwrap();

        let rows: Vec<Value> = serde_json::from_str(&list_threads_json(&conn, None).unwrap()).unwrap();
        let titles: Vec<&str> = rows.iter().map(|r| r["title"].as_str().unwrap()).collect();
        assert_eq!(titles, vec!["有料", "空的"], "soft-deleted rows leak: {titles:?}");
        let t1 = &rows[0];
        assert_eq!(t1["blocks"], 2);
        assert_eq!(t1["pinned"], 1);
        // chars = content(5) + annotation(9 chars) + content(10) + capped attachment(8000);
        // a2 is opted out, a3 has no text. LENGTH() counts chars on TEXT columns.
        assert_eq!(t1["approx_pack_chars"], 5 + 9 + 10 + 8000);
        let t2 = &rows[1];
        assert_eq!(t2["blocks"], 0);
        assert_eq!(t2["pinned"], 0);
        assert_eq!(t2["approx_pack_chars"], 0);

        // R3 friction #1: title_contains is the title→id resolver.
        let hit: Vec<Value> =
            serde_json::from_str(&list_threads_json(&conn, Some("有")).unwrap()).unwrap();
        assert_eq!(hit.len(), 1);
        assert_eq!(hit[0]["title"], "有料");
        let none: Vec<Value> =
            serde_json::from_str(&list_threads_json(&conn, Some("不存在")).unwrap()).unwrap();
        assert!(none.is_empty());
        assert!(list_threads_json(&conn, Some("  ")).is_err());
    }

    // §20.13 v2.1 (P0-2/P2-7): the get_pack guard's three mouths — empty thread,
    // empty range window, over budget — and its two pass-through cases.
    #[test]
    fn pack_guard_paths() {
        let mk = |total: usize, range: usize, pinned: usize, text: &str| PackBuilt {
            text: text.into(),
            total_blocks: total,
            range_blocks: range,
            pinned_blocks: pinned,
            title: String::new(),
            blocks: Vec::new(),
            attachments: Vec::new(),
            ref_titles: HashMap::new(),
            ref_blocks: RefBlocks::new(),
            now_ms: 0,
        };
        assert!(pack_guard_message(&mk(0, 0, 0, ""), "all", 100)
            .unwrap()
            .contains("还没有任何块"));
        let msg = pack_guard_message(&mk(12, 0, 2, ""), "last7", 100).unwrap();
        assert!(msg.contains("12") && msg.contains("last7"));
        let msg = pack_guard_message(&mk(3, 3, 1, "abcdefghij"), "all", 5).unwrap();
        assert!(msg.contains("max_chars=5"));
        assert!(pack_guard_message(&mk(3, 3, 1, "abcdefghij"), "all", 0).is_none());
        assert!(pack_guard_message(&mk(3, 3, 1, "abcdefghij"), "all", 100).is_none());
    }

    // v2.4 (D3): get_digest — deterministic cross-thread briefing. Fixed clock, seeded
    // DB: window split, pinned-outside-quota, newest-5 quota, anchor section, budget
    // degradation, workspace filter, empty state.
    #[test]
    fn get_digest_deterministic_briefing() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-digest-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        let now: i64 = 1_752_148_800_000; // 2026-07-10 около noon local; exact wall time irrelevant
        let day = 86_400_000i64;
        // t1: active (new blocks today + old pinned); t2: pinned only, no window
        // activity; t3: quiet entirely; t4: active in another workspace.
        conn.execute_batch(&format!(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
               VALUES ('ws1', '课程', 0, 1, 1), ('ws2', '生活', 1, 1, 1);
             INSERT INTO threads (id, workspace_id, title, summary, created_at, updated_at) VALUES
               ('t1', 'ws1', '算法课', '期末复习中', 1, {n1}),
               ('t2', 'ws1', '文献综述', NULL, 1, {n2}),
               ('t3', 'ws1', '沉睡脉络', NULL, 1, 100),
               ('t4', 'ws2', '健身计划', NULL, 1, {n3});
             INSERT INTO blocks (id, thread_id, kind, content, annotation, pinned, created_at) VALUES
               ('p1', 't1', 'text', '置顶:动态规划四要素', NULL, 1, {old}),
               ('w1', 't1', 'text', '窗口块一', NULL, 0, {w1}),
               ('w2', 't1', 'text', '窗口块二', '要复看', 0, {w2}),
               ('w3', 't1', 'text', '窗口块三', NULL, 0, {w3}),
               ('w4', 't1', 'text', '窗口块四', NULL, 0, {w4}),
               ('w5', 't1', 'text', '窗口块五', NULL, 0, {w5}),
               ('w6', 't1', 'text', '窗口块六(最旧,应被配额挤出)', NULL, 0, {w0}),
               ('p2', 't2', 'text', '置顶锚点:核心论点只此一条', NULL, 1, {old}),
               ('q1', 't3', 'text', '很久以前的块', NULL, 0, 100),
               ('g1', 't4', 'text', '今天的深蹲纪录', NULL, 0, {n3});",
            n1 = now, n2 = now - 2 * day, n3 = now - 1000, old = now - 30 * day,
            w0 = now - 6 * day, w1 = now - 5 * day, w2 = now - 4 * day,
            w3 = now - 3 * day, w4 = now - 2 * day, w5 = now - day,
        ))
        .unwrap();

        let d1 = get_digest_json(&conn, None, Some(7), None, now).unwrap();
        // Deterministic: same params, same clock, byte-identical.
        assert_eq!(d1, get_digest_json(&conn, None, Some(7), None, now).unwrap());
        // Both active threads present, newest activity first (t4's block is newer).
        let i_t4 = d1.find("生活 / 健身计划").unwrap();
        let i_t1 = d1.find("课程 / 算法课").unwrap();
        assert!(i_t4 < i_t1, "{d1}");
        assert!(d1.contains("summary: 期末复习中"));
        // Pinned rides outside the quota; quota keeps the newest 5 window blocks.
        assert!(d1.contains("📌 [") && d1.contains("置顶:动态规划四要素"));
        assert!(d1.contains("窗口块一") && d1.contains("窗口块五"));
        assert!(!d1.contains("窗口块六"), "quota should evict the oldest window block");
        assert!(d1.contains("(+ 1 more blocks in window"));
        assert!(d1.contains("note: 要复看"));
        // Pinned-only thread lands in the anchor section; fully quiet thread only in
        // the tail count.
        assert!(d1.contains("## 其余项目的置顶锚点"));
        assert!(d1.contains("- 文献综述: 📌 置顶锚点:核心论点只此一条"));
        assert!(!d1.contains("沉睡脉络"));
        assert!(d1.contains("另有 1 个项目无置顶且窗口内无活动"));

        // Workspace filter narrows scope; unknown workspace errors with the live list.
        let d_ws = get_digest_json(&conn, Some("课程"), Some(7), None, now).unwrap();
        assert!(d_ws.contains("算法课") && !d_ws.contains("健身计划"));
        let err = get_digest_json(&conn, Some("不存在"), None, None, now).unwrap_err();
        assert!(err.contains("课程") && err.contains("生活"));

        // Budget (R3 BUG-3/4): output stays within max_chars, no thread disappears,
        // and upgrades are a strict prefix of the activity order — when a budget only
        // fits the most active thread (健身计划, one small block), the bigger 算法课
        // must be the degraded one, never the other way round.
        let d_small = get_digest_json(&conn, None, Some(7), Some(600), now).unwrap();
        assert!(d_small.chars().count() <= 600, "{} chars", d_small.chars().count());
        assert!(d_small.contains("算法课") && d_small.contains("健身计划"));
        assert!(d_small.contains("预算所限"), "{d_small}");
        // Below the mandatory floor (header + one mention per thread + tail) the
        // floor itself is the output — nothing dropped, budget necessarily exceeded.
        let d_floor = get_digest_json(&conn, None, Some(7), Some(100), now).unwrap();
        assert!(d_floor.contains("算法课") && d_floor.contains("健身计划"));
        assert!(!d_floor.contains("### "), "floor must hold no full chunks: {d_floor}");
        for budget in [500i64, 700, 1000, 1500, 2500] {
            let d = get_digest_json(&conn, None, Some(7), Some(budget), now).unwrap();
            assert!(
                d.chars().count() as i64 <= budget,
                "budget {budget} → {} chars",
                d.chars().count()
            );
            assert!(d.contains("算法课") && d.contains("健身计划"), "thread dropped at {budget}");
            // Prefix property: if the more active 健身计划 is degraded, 算法课 must be too.
            let jsj_full = d.contains("### 生活 / 健身计划");
            let sfk_full = d.contains("### 课程 / 算法课");
            assert!(jsj_full || !sfk_full, "inversion at {budget}: {d}");
        }

        // Narrow window (since=1: today only): t4 wrote today and stays active; t1's
        // newest block is a day old, so it degrades to a pinned-anchor thread.
        let d_today = get_digest_json(&conn, None, Some(1), None, now).unwrap();
        assert!(d_today.contains("窗口内 1 个项目有新块"), "{d_today}");
        assert!(d_today.contains("- 算法课: 📌") && d_today.contains("- 文献综述: 📌"));
        assert!(!d_today.contains("窗口块五"));

        // Fully empty scope: no pins, no window → the actionable empty message.
        conn.execute_batch("DELETE FROM blocks; ").unwrap();
        let d_empty = get_digest_json(&conn, None, Some(7), None, now).unwrap();
        assert!(d_empty.contains("窗口内没有新块"), "{d_empty}");
    }

    // v2.4 (D1/5b): the raw-id write warning — advisory, never blocks the write.
    #[test]
    fn add_block_warns_on_suspect_raw_id() {
        // Shape checks on the detector itself.
        assert_eq!(
            suspect_raw_id("依据是 sbC2zgTo9dWyq_x1XPLNM 那条"),
            Some("sbC2zgTo9dWyq_x1XPLNM".to_string())
        );
        assert_eq!(suspect_raw_id("internationalisations"), None); // 21 lowercase letters
        assert_eq!(suspect_raw_id("sbC2zgTo9dWyq_x1XPLN"), None); // 20 chars
        assert_eq!(suspect_raw_id("sbC2zgTo9dWyq_x1XPLNM9"), None); // 22-char run
        assert_eq!(suspect_raw_id("词sbC2zgTo9dWyq_x1XPLNM词"), Some("sbC2zgTo9dWyq_x1XPLNM".into()));
        assert_eq!(suspect_raw_id(""), None);

        let tmp = std::env::temp_dir().join(format!("spool-mcp-warn-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
             VALUES ('ws1', '收件箱', 0, 1, 1)",
            [],
        )
        .unwrap();
        drop(conn);
        let mut conn = open_db_rw(&tmp).unwrap();
        let out = create_thread_json(&conn, None, "警告测试", None).unwrap();
        let tid = serde_json::from_str::<Value>(&out).unwrap()["thread_id"]
            .as_str()
            .unwrap()
            .to_string();

        // Clean content: no warning key at all.
        let v: Value = serde_json::from_str(
            &add_block_json(&mut conn, &tid, "普通结论,没有 id", None, None, None).unwrap(),
        )
        .unwrap();
        assert!(v.get("warning").is_none());

        // Suspect id in the annotation: still written verbatim, warning names the match.
        let v: Value = serde_json::from_str(
            &add_block_json(&mut conn, &tid, "结论", None, Some("对应 sbC2zgTo9dWyq_x1XPLNM"), None)
                .unwrap(),
        )
        .unwrap();
        assert!(v["warning"].as_str().unwrap().contains("sbC2zgTo9dWyq_x1XPLNM"));
        let stored: String = conn
            .query_row(
                "SELECT annotation FROM blocks WHERE id = ?1",
                [v["block_id"].as_str().unwrap()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, "对应 sbC2zgTo9dWyq_x1XPLNM");

        // R4 P2-1: every free-text write surface warns — the add_block source detail,
        // create_thread title/summary, set_thread_summary. Writes still land verbatim.
        let v: Value = serde_json::from_str(
            &add_block_json(&mut conn, &tid, "结论", Some("依据 spool://thread/sbC2zgTo9dWyq_x1XPLNM"), None, None)
                .unwrap(),
        )
        .unwrap();
        assert!(v["warning"].as_str().unwrap().contains("sbC2zgTo9dWyq_x1XPLNM"), "{v}");
        let v: Value = serde_json::from_str(
            &create_thread_json(&conn, None, "新题", Some("接 sbC2zgTo9dWyq_x1XPLNM 继续")).unwrap(),
        )
        .unwrap();
        assert!(v["warning"].as_str().unwrap().contains("sbC2zgTo9dWyq_x1XPLNM"));
        let clean: Value =
            serde_json::from_str(&create_thread_json(&conn, None, "干净标题", None).unwrap())
                .unwrap();
        assert!(clean.get("warning").is_none());
        let sid = clean["thread_id"].as_str().unwrap();
        let v: Value = serde_json::from_str(
            &set_thread_summary_json(&conn, sid, "总结见 sbC2zgTo9dWyq_x1XPLNM").unwrap(),
        )
        .unwrap();
        assert!(v["warning"].as_str().unwrap().contains("sbC2zgTo9dWyq_x1XPLNM"));

        // R5 P3-1: with several dirty surfaces in one call, the warning names each
        // surface with its own match instead of stopping at the first.
        let v: Value = serde_json::from_str(
            &add_block_json(
                &mut conn,
                &tid,
                "正文串 sbAAAAAAAAAAAAAAAAAAB",
                Some("来源串 sbCCCCCCCCCCCCCCCCCCd"),
                Some("批注串 sbBBBBBBBBBBBBBBBBBBc"),
                None,
            )
            .unwrap(),
        )
        .unwrap();
        let w = v["warning"].as_str().unwrap();
        assert!(w.contains("content:「sbAAAAAAAAAAAAAAAAAAB」"), "{w}");
        assert!(w.contains("annotation:「sbBBBBBBBBBBBBBBBBBBc」"), "{w}");
        assert!(w.contains("source:「sbCCCCCCCCCCCCCCCCCCd」"), "{w}");
    }

    // 存量数据卫生 (2026-07-12): check_library — read-only, deterministic, disposal
    // stays with the user; user-written text is FYI-only.
    #[test]
    fn check_library_reports_all_three_sections() {
        // D-URI fragment extraction: scheme + contiguous id/path run, nothing more.
        assert_eq!(
            uri_fragment("依据 spool://thread/sbC2zgTo9dWyq_x1XPLNM 那条"),
            Some("spool://thread/sbC2zgTo9dWyq_x1XPLNM".to_string())
        );
        assert_eq!(uri_fragment("没有 URI"), None);

        let tmp = std::env::temp_dir().join(format!("spool-mcp-hygiene-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute_batch(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
               VALUES ('ws1', '收件箱', 0, 1, 1);
             INSERT INTO threads (id, workspace_id, title, created_at, updated_at)
               VALUES ('sbC2zgTo9dWyq_x1XPLNM', 'ws1', '被指脉络', 1, 1),
                      ('t1', 'ws1', '实测', 1, 1),
                      ('t9', 'ws1', '已删', 1, 1);
             UPDATE threads SET deleted_at = 9 WHERE id = 't9';
             INSERT INTO blocks (id, thread_id, kind, content, annotation, source, pinned, created_at) VALUES
               -- 类 1: pre-v2.4 MCP source tail with a resolvable spool:// URI
               ('b1', 't1', 'text', '结论甲', NULL,
                'Claude · MCP · 依据 spool://thread/sbC2zgTo9dWyq_x1XPLNM', 0, 1),
               -- 类 2, AI-authored: raw id in the annotation
               ('b2', 't1', 'text', '结论乙', '对应 sbAAAAAAAAAAAAAAAAAAB', 'Claude · MCP', 0, 2),
               -- 类 2, user-typed (no source): report FYI-only, never suggest edits
               ('b3', 't1', 'text', '我自己记的 sbAAAAAAAAAAAAAAAAAAB', NULL, NULL, 0, 3),
               -- 类 2, captured source: likely an id-shaped string from the original page
               ('b4', 't1', 'text', '网页原文带 sbAAAAAAAAAAAAAAAAAAB 形状串', NULL, 'Safari', 0, 4),
               -- clean block: contributes to counts only
               ('b5', 't1', 'text', '干净的一条', NULL, NULL, 0, 5),
               -- dirty block inside a soft-deleted thread: excluded from the scan
               ('b9', 't9', 'text', '脏 spool://thread/sbC2zgTo9dWyq_x1XPLNM', NULL, NULL, 0, 6);",
        )
        .unwrap();

        // 类 3: a citation whose citee is later hard-deleted.
        conn.execute_batch(
            "INSERT INTO blocks (id, thread_id, kind, content, ref_block_id, pinned, created_at)
               VALUES ('b6', 't1', 'text', '站在消失块上的结论', 'gone_block_id_000000x', 0, 7);",
        )
        .unwrap();

        let now = 1_750_000_000_000;
        let report = check_library_json(&conn, now).unwrap();

        // Header counts: b9/t9 excluded, the citing block counted once.
        assert!(report.contains("6 blocks / 2 projects / 1 workspaces"), "{report}");
        assert!(
            report.contains("source 标签卫生 1 · 正文/批注裸 id 3 · 引用完整性 1"),
            "{report}"
        );

        // 类 1: fragment quoted, resolvable id annotated with the live thread's title.
        assert!(report.contains("「spool://thread/sbC2zgTo9dWyq_x1XPLNM」"), "{report}");
        assert!(report.contains("指向现存项目〈被指脉络〉"), "{report}");
        assert!(report.contains("点击该块的来源标签"), "{report}");

        // 类 2 wording per family: AI editable, user FYI-only, captured low-confidence.
        assert!(report.contains("双击该块即可编辑"), "{report}");
        assert!(report.contains("Spool 不建议也不会修改"), "{report}");
        assert!(report.contains("原文自带的 id 形状串"), "{report}");
        assert!(report.contains("未指向现存对象"), "{report}");

        // 类 3: dangling citation named by the citing block's preview, with the pack
        // degradation stated.
        assert!(report.contains("被引块已不存在"), "{report}");
        assert!(report.contains("站在消失块上的结论"), "{report}");

        // Soft-deleted thread's dirt never appears.
        assert!(!report.contains("已删"), "{report}");

        // Verdict + determinism: same library, same day → byte-identical output.
        assert!(report.contains("体检未通过:共 5 处发现"), "{report}");
        assert_eq!(report, check_library_json(&conn, now).unwrap());

        // Dangling ref via soft-deleted citee thread: reason names the thread deletion.
        conn.execute_batch(
            "INSERT INTO blocks (id, thread_id, kind, content, pinned, created_at)
               VALUES ('c1', 'sbC2zgTo9dWyq_x1XPLNM', 'text', '被引的原文', 0, 1);
             INSERT INTO blocks (id, thread_id, kind, content, ref_block_id, pinned, created_at)
               VALUES ('b7', 't1', 'text', '引用它', 'c1', 0, 8);",
        )
        .unwrap();
        let live = check_library_json(&conn, now).unwrap();
        assert!(live.contains("引用完整性 1"), "{live}"); // c1 alive: b7 is not a finding
        conn.execute("UPDATE threads SET deleted_at = 9 WHERE id = 'sbC2zgTo9dWyq_x1XPLNM'", [])
            .unwrap();
        let after = check_library_json(&conn, now).unwrap();
        assert!(after.contains("被引块所在项目已删除"), "{after}");
        assert!(after.contains("其预览仍会经引用出现在 pack 中"), "{after}");
    }

    #[test]
    fn check_library_clean_library_passes() {
        let tmp =
            std::env::temp_dir().join(format!("spool-mcp-hygiene-clean-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let conn = Connection::open(tmp.join("spool.db")).unwrap();
        conn.execute_batch(include_str!("../../src/lib/db/schema.sql")).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {EXPECTED_SCHEMA_VERSION};"))
            .unwrap();
        conn.execute_batch(
            "INSERT INTO workspaces (id, title, sort_order, created_at, updated_at)
               VALUES ('ws1', '收件箱', 0, 1, 1);
             INSERT INTO threads (id, workspace_id, title, created_at, updated_at)
               VALUES ('t1', 'ws1', '日常', 1, 1);
             INSERT INTO blocks (id, thread_id, kind, content, pinned, created_at)
               VALUES ('b1', 't1', 'text', '一条普通笔记,internationalisations 不算 id', 0, 1);",
        )
        .unwrap();
        let report = check_library_json(&conn, 1_750_000_000_000).unwrap();
        assert!(report.contains("体检通过:未发现内部管线泄漏或悬空引用。"), "{report}");
        assert!(report.contains("(无发现)"), "{report}");
    }

    // v2.4 (C2): over-budget packs render partially — skeleton + full Pinned Blocks,
    // Full Record filled newest-first, explicit omission line, attachments narrowed to
    // surviving blocks; deterministic; extreme budgets fall back to None.
    #[test]
    fn budgeted_pack_fills_newest_first() {
        let mk_block = |i: usize, pinned: bool| BlockRow {
            id: format!("b{i}"),
            kind: "text".into(),
            content: format!("块 {i}:{}", "内容".repeat(120)), // ~245 chars each
            annotation: None,
            ref_thread_id: None,
            ref_block_id: None,
            source: None,
            pinned,
            created_at: 1_750_000_000_000 + i as i64 * 60_000,
        };
        let blocks: Vec<BlockRow> =
            (0..20).map(|i| mk_block(i, i == 0)).collect(); // oldest block pinned
        let attachments = vec![
            AttachmentRow {
                block_id: "b1".into(), // oldest unpinned — will be omitted
                kind: "url".into(),
                target: "https://old.example".into(),
                label: "old".into(),
                extracted_text: None,
                extraction_kind: None,
                include_in_pack: false,
            },
            AttachmentRow {
                block_id: "b19".into(), // newest — must survive
                kind: "url".into(),
                target: "https://new.example".into(),
                label: "new".into(),
                extracted_text: None,
                extraction_kind: None,
                include_in_pack: false,
            },
        ];
        let built = PackBuilt {
            text: assemble_pack(
                "预算测试",
                &blocks,
                &attachments,
                &HashMap::new(),
                &RefBlocks::new(),
                1_750_001_000_000,
            ),
            total_blocks: 20,
            range_blocks: 20,
            pinned_blocks: 1,
            title: "预算测试".into(),
            blocks,
            attachments,
            ref_titles: HashMap::new(),
            ref_blocks: RefBlocks::new(),
            now_ms: 1_750_001_000_000,
        };
        let full_chars = built.text.chars().count() as i64;
        let budget = full_chars - 1000; // force a few omissions

        let (partial, omit) = budgeted_pack(&built, budget).expect("partial pack must fit");
        assert!(omit > 0);
        assert!(partial.chars().count() as i64 <= budget);
        // Deterministic.
        assert_eq!(partial, budgeted_pack(&built, budget).unwrap().0);
        // Omission line at the top of Full Record, naming count + the paging escape.
        let lines: Vec<&str> = partial.lines().collect();
        let log_idx = lines.iter().position(|l| *l == SECTION_LOG).unwrap();
        assert!(
            lines[log_idx + 2].starts_with("[... ")
                && lines[log_idx + 2].contains("oldest timeline entries omitted"),
            "{}",
            lines[log_idx + 2]
        );
        assert!(lines[log_idx + 2].contains("get_blocks"));
        // Newest block survives; the pinned oldest renders fully in Pinned Blocks even
        // though its chronological slot was omitted.
        assert!(partial.contains("块 19:"));
        assert!(partial.contains("块 0:"));
        assert!(!partial.contains("块 1:"), "oldest unpinned should be omitted");
        // Attachment narrowing: the omitted block's link is gone, the kept one stays.
        assert!(partial.contains("https://new.example"));
        assert!(!partial.contains("https://old.example"));
        // Extreme budget: even skeleton + pinned won't fit → None (caller keeps stats).
        assert!(budgeted_pack(&built, 100).is_none());
        // A budget the full text already fits is never reached via the guard, but the
        // search still answers with omit=0 == the plain pack.
        assert_eq!(budgeted_pack(&built, full_chars).unwrap().0, built.text);

        // R3 friction #2: the id side-table lists rendered blocks only — kept blocks
        // and the pinned-but-omitted one; omitted unpinned rows stay out.
        let table = pack_id_table(&built.blocks, omit);
        assert!(table.contains(SECTION_IDS));
        assert!(table.contains("— b19"), "{table}");
        assert!(table.contains("— b0"), "pinned survives omission: {table}");
        assert!(!table.contains("— b1\n"), "omitted unpinned must not list: {table}");
    }

    // One test on purpose: it redirects HOME to a temp dir, and env vars are
    // process-global across the parallel test harness. No other test reads HOME.
    #[test]
    fn one_click_client_config_status_merge_backup() {
        let tmp = std::env::temp_dir().join(format!("spool-mcp-cfg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("HOME", &tmp);

        // Client not installed: probe says so, configure refuses to invent dirs.
        assert_eq!(client_status("cursor").unwrap(), "not-installed");
        assert_eq!(configure_client("cursor").unwrap(), "not-installed");
        assert!(client_status("nonsense").is_err());

        // Fresh install: no config file → write creates it and points at this binary.
        std::fs::create_dir_all(tmp.join(".cursor")).unwrap();
        assert_eq!(client_status("cursor").unwrap(), "unconfigured");
        assert_eq!(configure_client("cursor").unwrap(), "written");
        assert_eq!(client_status("cursor").unwrap(), "configured");

        // Existing config with other servers + a stale spool path: merge keeps
        // everything else, updates spool, and writes a .bak of the old file first.
        let claude_dir = tmp.join("Library/Application Support/Claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        let cfg = claude_dir.join("claude_desktop_config.json");
        std::fs::write(
            &cfg,
            r#"{"mcpServers":{"other":{"command":"/bin/echo"},"spool":{"command":"/stale/path","args":["--mcp"]}},"preferences":{"keep":true}}"#,
        )
        .unwrap();
        assert_eq!(client_status("claude").unwrap(), "stale");
        assert_eq!(configure_client("claude").unwrap(), "written");
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(v["mcpServers"]["other"]["command"], "/bin/echo");
        assert_eq!(v["preferences"]["keep"], true);
        let exe = std::env::current_exe().unwrap();
        assert_eq!(
            v["mcpServers"]["spool"]["command"].as_str().unwrap(),
            exe.to_string_lossy()
        );
        let bak = claude_dir.join("claude_desktop_config.json.bak");
        assert!(std::fs::read_to_string(&bak).unwrap().contains("/stale/path"));

        // Unparseable existing config: refuse rather than clobber.
        std::fs::write(&cfg, "{broken").unwrap();
        assert!(configure_client("claude").is_err());
        assert_eq!(std::fs::read_to_string(&cfg).unwrap(), "{broken");

        // 2026-07-31: Claude Code (CLI). "Installed" is a FILE, not a directory, and the
        // entry carries an explicit type — matching what `claude mcp add --scope user`
        // writes. The rest of ~/.claude.json (onboarding state, per-project settings) is
        // the client's own bookkeeping and must survive untouched.
        assert_eq!(client_status("claude-code").unwrap(), "not-installed");
        let cc = tmp.join(".claude.json");
        std::fs::write(&cc, r#"{"numStartups":7,"projects":{"/tmp/x":{"allowedTools":[]}}}"#)
            .unwrap();
        assert_eq!(client_status("claude-code").unwrap(), "unconfigured");
        assert_eq!(configure_client("claude-code").unwrap(), "written");
        assert_eq!(client_status("claude-code").unwrap(), "configured");
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&cc).unwrap()).unwrap();
        assert_eq!(v["numStartups"], 7);
        assert_eq!(v["projects"]["/tmp/x"]["allowedTools"], json!([]));
        assert_eq!(v["mcpServers"]["spool"]["type"], "stdio");
        assert_eq!(v["mcpServers"]["spool"]["args"], json!(["--mcp"]));
        assert!(tmp.join(".claude.json.bak").exists());

        // VS Code keeps its servers under `servers`, not `mcpServers` — writing the
        // wrong key would leave the user with a config the client silently ignores.
        assert_eq!(client_status("vscode").unwrap(), "not-installed");
        let vsc = tmp.join("Library/Application Support/Code/User");
        std::fs::create_dir_all(&vsc).unwrap();
        assert_eq!(client_status("vscode").unwrap(), "unconfigured");
        assert_eq!(configure_client("vscode").unwrap(), "written");
        assert_eq!(client_status("vscode").unwrap(), "configured");
        let v: Value =
            serde_json::from_str(&std::fs::read_to_string(vsc.join("mcp.json")).unwrap()).unwrap();
        assert_eq!(v["servers"]["spool"]["type"], "stdio");
        assert!(v.get("mcpServers").is_none());

        // Windsurf: same shape as Claude Desktop, different path.
        assert_eq!(client_status("windsurf").unwrap(), "not-installed");
        std::fs::create_dir_all(tmp.join(".codeium/windsurf")).unwrap();
        assert_eq!(configure_client("windsurf").unwrap(), "written");
        assert_eq!(client_status("windsurf").unwrap(), "configured");

        // Codex (ChatGPT desktop / Codex CLI, decision ① 2026-07-31): the one TOML
        // target. Fresh write, then a merge that must keep the user's comments, other
        // tables and top-level keys byte-for-byte (that's why toml_edit, not toml).
        assert_eq!(client_status("codex").unwrap(), "not-installed");
        assert_eq!(configure_client("codex").unwrap(), "not-installed");
        std::fs::create_dir_all(tmp.join(".codex")).unwrap();
        assert_eq!(client_status("codex").unwrap(), "unconfigured");
        assert_eq!(configure_client("codex").unwrap(), "written");
        assert_eq!(client_status("codex").unwrap(), "configured");
        let codex_cfg = tmp.join(".codex/config.toml");
        let fresh = std::fs::read_to_string(&codex_cfg).unwrap();
        assert!(fresh.contains("[mcp_servers.spool]"), "{fresh}");
        std::fs::write(
            &codex_cfg,
            "# my settings\nmodel = \"o3\"\n\n[mcp_servers.other]\ncommand = \"/bin/echo\"\n\n[mcp_servers.spool]\ncommand = \"/stale/path\"\nargs = [\"--mcp\"]\n",
        )
        .unwrap();
        assert_eq!(client_status("codex").unwrap(), "stale");
        assert_eq!(configure_client("codex").unwrap(), "written");
        let merged = std::fs::read_to_string(&codex_cfg).unwrap();
        assert!(merged.contains("# my settings"), "{merged}");
        assert!(merged.contains("model = \"o3\""), "{merged}");
        assert!(merged.contains("[mcp_servers.other]"), "{merged}");
        let doc: toml_edit::DocumentMut = merged.parse().unwrap();
        assert_eq!(
            doc["mcp_servers"]["spool"]["command"].as_str().unwrap(),
            exe.to_string_lossy()
        );
        assert_eq!(doc["mcp_servers"]["spool"]["args"][0].as_str().unwrap(), "--mcp");
        assert!(std::fs::read_to_string(tmp.join(".codex/config.toml.bak"))
            .unwrap()
            .contains("/stale/path"));

        // Unparseable TOML: refuse rather than clobber, same as the JSON path.
        std::fs::write(&codex_cfg, "model = [broken").unwrap();
        assert!(configure_client("codex").is_err());
        assert_eq!(std::fs::read_to_string(&codex_cfg).unwrap(), "model = [broken");
    }
}
