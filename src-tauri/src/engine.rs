//! DESIGN_AI_ENGINE — the local AI engine slot (target v0.4.0, M1–M3 + §7).
//!
//! One sentence: when the user already has an agent CLI installed, Spool offers "let AI
//! maintain this thread"; behind it that CLI runs headless with Spool's own MCP server
//! attached. The GUI curates, the CLI is the engine, MCP is the bus. Cost rides on the
//! subscription the user already has — Spool never holds an API key.
//!
//! §7 (2026-08-06) widened "the CLI" from one to an enumerated two — `claude` and
//! `codex` — because a user without a Claude subscription had no engine slot at all: the
//! menu group simply never rendered and they never learned it existed. Everything above
//! this layer is untouched by that widening (same three actions, same prompts, same
//! serial queue, same cancel, same activity fold); what varies is only how the process is
//! started and how its output is read.
//!
//! The three premises this module must not weaken (design §0):
//!   * **Zero AI in the product itself.** If no engine is present, every entry point stops
//!     rendering and Spool is complete without it. Detection failure is not an error
//!     state; it is the default state.
//!   * **Spool itself never goes online.** Egress happens inside the engine's process —
//!     a tool the user installed, logged into and trusts. The webview's CSP is not
//!     loosened; nothing here opens a socket.
//!   * **Constitution 5 holds.** Anything the AI writes goes through the EXISTING MCP
//!     write surface: source-labelled, append-only, and unable to touch what the user
//!     typed. This module adds no write path of its own — it only spawns a client that
//!     talks to the same `spool --mcp` server Claude Desktop talks to.
//!
//! M1 scope: detection + the settings section + one action ("distil a conclusion")
//! end-to-end, including cancel and timeout. That is the shortest path that proves the
//! pipe. M2 (here) adds the other two actions, a real cancel, and the serial queue that
//! keeps two runs from interleaving writes into one library.

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};

// §1.4 / §2.1: the CLI is looked up by name on PATH, then asked for its version. Both
// calls carry a short timeout — a hung `claude` must never hold the settings page.
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

// §1.4: the run budget. Default 5 minutes, and the user cannot raise it past 10 — an
// agentic loop with no ceiling is a runaway subscription bill, not a feature.
pub const DEFAULT_TIMEOUT_SECS: u64 = 300;
pub const MAX_TIMEOUT_SECS: u64 = 600;

/// The ceiling is a promise, so enforce it here rather than trusting the settings UI —
/// this value arrives from settings.json, which the user can edit by hand. 0/absent means
/// "unset", which resolves to the default rather than to "no limit".
pub fn clamp_timeout_secs(requested: u64) -> u64 {
    if requested == 0 {
        return DEFAULT_TIMEOUT_SECS;
    }
    requested.min(MAX_TIMEOUT_SECS)
}

// §2.2: only Spool's own MCP tools are allowed through. Bash, file and network tools are
// never on this list, and `--dangerously-skip-permissions` is never passed.
const MCP_SERVER_NAME: &str = "spool";

// ⚠️ Enumerated one by one, NOT `mcp__spool__*`. Verified against claude 2.0.50 on
// 2026-08-05: a wildcard in `--allowedTools` is not expanded, so every single call comes
// back in `permission_denials` and the run ends with the model politely asking the user to
// turn on a permission that is already on. Explicit names work. If a tool is added to
// mcp.rs it must be added here too, or the AI simply cannot reach it.
const ALLOWED_TOOL_NAMES: [&str; 14] = [
    "add_block",
    "check_library",
    "create_thread",
    "distill",
    "find_similar_blocks",
    "get_blocks",
    "get_digest",
    "get_pack",
    "list_threads",
    // Nothing here calls for it, and it is still listed: the list's job is "only Spool's
    // tools", not "only the tools this action needs". A denied call does not fail quietly —
    // it ends the run with the model asking for a permission that is already on (see the
    // wildcard note above) — and propose_blocks is the one write tool that writes nothing.
    "propose_blocks",
    "search_blocks",
    "set_thread_summary",
    "thread_health",
    "weekly_review",
];

// DESIGN_FOLLOW_UP §2.5-3: the ONE thing the follow-up run needs that the maintenance
// actions must never get. Reading the open web is granted per action, not once and for
// all: 去重 / 压缩 / 周回顾 work entirely off what is already in the library,
// and a tidy-up run with a browser attached is a strictly larger attack surface for
// nothing in return.
//
// Verified against claude 2.0.50 on 2026-08-06: these are the exact tool names (a run
// with them allowed searched the web and came back with `permission_denials: []`).
const WEB_TOOL_NAMES: [&str; 2] = ["WebSearch", "WebFetch"];

fn allowed_tools(web: bool) -> String {
    let mut names: Vec<String> = ALLOWED_TOOL_NAMES
        .iter()
        .map(|t| format!("mcp__{MCP_SERVER_NAME}__{t}"))
        .collect();
    if web {
        names.extend(WEB_TOOL_NAMES.iter().map(|t| (*t).to_string()));
    }
    names.join(",")
}

/// §7.2: an ENUMERATION, never "type your own command line". Two reasons, both load-bearing.
/// One, there is nothing to abstract — the flag names, the way MCP servers are handed over
/// and the shape of the output differ per CLI (see the two arg builders below), so a free
/// text box would hand the user the failure mode "you mistyped a flag and it silently ran
/// with no tools". Two, and worse: the tool whitelist below is enforced by the arguments
/// *we* assemble. A command line the user typed has no whitelist in it, and the whole
/// security story of this module is gone. Adding a third engine means writing code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    Claude,
    Codex,
    Gemini,
}

impl EngineKind {
    /// Preference order when several are installed (§7.4): `claude` first — more capable, and
    /// the users who already have an engine slot today are on it.
    ///
    /// ⚠️ **`gemini` is last on purpose, and that is a measurement (§7.8), not a ranking of
    /// the model.** Its free tier is 20 requests per model per day; two of the four actions
    /// cannot finish inside that. Putting it above either subscription engine would hand a
    /// user who has all three the one that runs out — the same mistake §7.4 corrected on
    /// 2026-08-06 when it stopped calling Codex free.
    pub const ALL: [EngineKind; 3] = [EngineKind::Claude, EngineKind::Codex, EngineKind::Gemini];

    pub fn as_str(self) -> &'static str {
        match self {
            EngineKind::Claude => "claude",
            EngineKind::Codex => "codex",
            EngineKind::Gemini => "gemini",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(EngineKind::Claude),
            "codex" => Some(EngineKind::Codex),
            "gemini" => Some(EngineKind::Gemini),
            _ => None,
        }
    }

    /// DESIGN_AI_ENGINE §7.8.5-2 — whether this engine may be offered the one action that
    /// reaches the open web. Gemini may not: 跟进 is the only multi-turn agentic action, and
    /// it is precisely the one measured to exhaust a whole day's free quota without
    /// finishing. A button that cannot succeed is worse than an absent one, so the action is
    /// withheld the same quiet way the whole group is withheld when no CLI is installed.
    pub fn supports_web(self) -> bool {
        !matches!(self, EngineKind::Gemini)
    }

    /// The executable's name on PATH, which is also what the candidate paths end in.
    fn binary(self) -> &'static str {
        self.as_str()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DetectedEngine {
    pub kind: EngineKind,
    /// Version string as the CLI reported it, for the settings status line.
    pub version: Option<String>,
    /// Absolute path we resolved, so the settings page can show what it actually found.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineStatus {
    /// Whether the SELECTED engine is usable. The GUI renders the maintenance actions only
    /// when this is true AND both MCP switches are on (§1.1).
    pub available: bool,
    /// Which engine a run would use right now — the user's pick when both are installed,
    /// otherwise whichever one was found.
    pub selected: Option<EngineKind>,
    /// The selected engine's version / path, kept flat because that is what the status
    /// line renders.
    pub version: Option<String>,
    pub path: Option<String>,
    /// Everything found on this machine. §7.4: the settings page offers a choice only when
    /// this holds more than one — a picker with a single option is a decision nobody asked
    /// the user to make.
    pub engines: Vec<DetectedEngine>,
}

impl EngineStatus {
    fn missing() -> Self {
        Self { available: false, selected: None, version: None, path: None, engines: Vec::new() }
    }
}

// `claude --version` prints "2.0.50 (Claude Code)"; `codex --version` prints
// "codex-cli 0.146.1". Keep the number and drop the rest — the status line wants
// `codex 0.146.1 ✓`, and the product name is already the word next to it.
//
// So: the first token that STARTS WITH A DIGIT, falling back to the first token when
// there is none. Taking token one unconditionally was right until 2026-08-06, when the
// real codex binary made the settings page read "codex codex-cli".
//
// Deliberately lenient: an unparseable line still counts as available (the binary
// answered), because the version is cosmetic here. §2.1 leaves the minimum version to be
// set from real-world testing, so nothing is gated on it yet.
fn parse_version(out: &str) -> Option<String> {
    let first = out.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    let mut tokens = first.split_whitespace();
    let head = tokens.clone().next().unwrap_or(first);
    Some(
        tokens
            .find(|t| t.starts_with(|c: char| c.is_ascii_digit()))
            .unwrap_or(head)
            .to_string(),
    )
}

// §1.2 cancel. The run is a Tauri command answering on a blocking thread, so the click
// that stops it arrives on a different thread entirely and has nothing but these two
// atomics to reach it by.
//
// The pid is the child's, which is also its process-GROUP id — spawn puts it in a fresh
// group (see run_action), so `kill(-pid)` takes the whole tree. That matters here more
// than usual: `claude` spawns MCP servers of its own, and killing only the parent would
// leave `spool --mcp` subprocesses holding the library.
static RUNNING_PGID: AtomicI32 = AtomicI32::new(0);
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// Ask the current run to stop. Returns false when nothing was running — which the caller
/// treats as success, not an error: the user pressed cancel on something that had already
/// finished, and there is nothing left to say.
pub fn request_cancel() -> bool {
    let pgid = RUNNING_PGID.load(Ordering::SeqCst);
    if pgid == 0 {
        return false;
    }
    CANCELLED.store(true, Ordering::SeqCst);
    kill_group(pgid);
    true
}

fn kill_group(pgid: i32) {
    #[cfg(unix)]
    unsafe {
        // SIGTERM first so the CLI can close its own children cleanly, then SIGKILL for
        // whatever ignored it. A stuck process here would hold a subscription-billed run
        // open, so the second signal is not optional.
        libc::kill(-pgid, libc::SIGTERM);
        std::thread::sleep(Duration::from_millis(150));
        libc::kill(-pgid, libc::SIGKILL);
    }
    #[cfg(not(unix))]
    {
        let _ = pgid;
    }
}

// A probe that must not outlive its budget. `Command::output()` blocks with no timeout of
// its own, so `which` and `--version` go through here: spawn, wait with a deadline, kill on
// expiry. Polling rather than a thread per call — these are sub-second in practice, and the
// settings page calls them on every refresh.
//
// ⚠️ A probe never publishes its process group. It used to take a `cancellable` flag and
// serve both callers; runs go through `stream_with_timeout` now, and keeping the flag would
// leave a probe able to overwrite the pid the cancel button aims at.
fn output_with_timeout(
    mut cmd: std::process::Command,
    budget: Duration,
) -> Result<std::process::Output, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Err(e) => return Err(e.to_string()),
            Ok(Some(_)) => return child.wait_with_output().map_err(|e| e.to_string()),
            Ok(None) => {
                if start.elapsed() >= budget {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("timed out after {}s", budget.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
}

/// What one finished child said. Not `std::process::Output`: an `ExitStatus` cannot be
/// constructed portably, and by this point the bytes have already been decoded once by the
/// line reader anyway.
struct RunOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

/// One long-running child, read **line by line while it runs**.
///
/// DESIGN_WORKBENCH §3.6 / §9.3 #4 — Ocean, having watched a run: 「等待中界面毫无变化」,
/// and then 「像 vscode 的 ai 插件，正在打字的效果」. That was structurally impossible before:
/// the old path handed the command to `Command::output()`, which returns when the process
/// is *done*, so there was nothing to show mid-run even in principle.
///
/// Both CLIs emit newline-delimited JSON, so both get progress from the same reader; what
/// differs is only how a line is read (see the two `parse_*_stream_line` functions).
///
/// Three things that look incidental and are not:
///   * **stderr is drained on its own thread.** A child whose stderr pipe fills blocks
///     forever, and `claude --verbose` is chatty. Draining stdout alone would deadlock the
///     very runs this is meant to make visible.
///   * **The full stdout is still accumulated.** The progress lines decorate the UI; the
///     answer is parsed from the accumulated text at the end, by the same parser as before.
///     That is the fallback §9.3 #4 asked for — if nothing recognisable streamed past, the
///     run is read exactly as it was read yesterday.
///   * **This is the one caller that publishes the process group**, so the cancel button
///     has something to aim at.
fn stream_with_timeout(
    mut cmd: std::process::Command,
    budget: Duration,
    on_line: Arc<dyn Fn(&str) + Send + Sync>,
) -> Result<RunOutput, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    CANCELLED.store(false, Ordering::SeqCst);
    RUNNING_PGID.store(child.id() as i32, Ordering::SeqCst);

    let stdout = child.stdout.take().ok_or("no stdout pipe")?;
    let stderr = child.stderr.take().ok_or("no stderr pipe")?;
    let out_buf = Arc::new(Mutex::new(String::new()));
    let err_buf = Arc::new(Mutex::new(String::new()));

    let reader_buf = Arc::clone(&out_buf);
    let reader = std::thread::spawn(move || {
        use std::io::BufRead;
        for line in std::io::BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            on_line(&line);
            if let Ok(mut b) = reader_buf.lock() {
                b.push_str(&line);
                b.push('\n');
            }
        }
    });
    let drain_buf = Arc::clone(&err_buf);
    let drain = std::thread::spawn(move || {
        use std::io::Read;
        let mut s = String::new();
        let _ = std::io::BufReader::new(stderr).read_to_string(&mut s);
        if let Ok(mut b) = drain_buf.lock() {
            *b = s;
        }
    });

    let start = std::time::Instant::now();
    let verdict = loop {
        match child.try_wait() {
            Err(e) => break Err(e.to_string()),
            Ok(Some(status)) => {
                // A cancelled child usually exits before this poll notices, so the flag —
                // not the exit status — is what decides the message.
                break if CANCELLED.load(Ordering::SeqCst) {
                    Err(CANCELLED_MARKER.to_string())
                } else {
                    Ok(status.success())
                };
            }
            Ok(None) => {
                if CANCELLED.load(Ordering::SeqCst) {
                    kill_group(child.id() as i32);
                    let _ = child.wait();
                    break Err(CANCELLED_MARKER.to_string());
                }
                if start.elapsed() >= budget {
                    kill_group(child.id() as i32);
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err(format!("timed out after {}s", budget.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    };
    // The published pid has to go down every path. A stale one aims the next cancel at a pid
    // the OS may since have handed to something else entirely.
    RUNNING_PGID.store(0, Ordering::SeqCst);
    CANCELLED.store(false, Ordering::SeqCst);
    // The pipes are closed now (the child is gone), so both readers are at EOF and joining
    // cannot hang. Joining rather than detaching is what makes the buffers safe to read.
    let _ = reader.join();
    let _ = drain.join();

    let success = verdict?;
    let stdout = out_buf.lock().map(|b| b.clone()).unwrap_or_default();
    let stderr = err_buf.lock().map(|b| b.clone()).unwrap_or_default();
    Ok(RunOutput { success, stdout, stderr })
}

/// The frontend distinguishes "the user stopped it" from "it broke" by this exact string;
/// a cancel is not an error to apologise for. Deliberately not translated — it is a wire
/// marker between two layers of Spool, never shown to anyone.
pub const CANCELLED_MARKER: &str = "spool:cancelled";

// The PATH a GUI app inherits on macOS is the launchd one, not the shell's — a CLI
// installed by npm/homebrew into ~/.local/bin or /opt/homebrew/bin is on the user's shell
// PATH and invisible here. So the probe checks the usual install locations directly as
// well, and reports the path it actually resolved (§1.4 shows it in the status line).
fn candidate_paths(kind: EngineKind) -> Vec<std::path::PathBuf> {
    let bin = kind.binary();
    let mut out = Vec::new();
    if let Some(home) = dirs_home() {
        if kind == EngineKind::Claude {
            out.push(home.join(".claude/local/claude"));
        }
        for rel in [".local/bin", ".npm-global/bin", "bin", ".bun/bin", ".volta/bin"] {
            out.push(home.join(rel).join(bin));
        }
        // ⚠️ nvm keeps one bin directory PER INSTALLED NODE VERSION, so there is no fixed
        // path to list — and this is not a corner case: on 2026-08-06 `npm i -g
        // @openai/codex` on the author's own machine landed in
        // ~/.nvm/versions/node/v24.11.0/bin/codex, which neither `which` (launchd PATH)
        // nor any static entry above would ever have found. Detection would have reported
        // "not installed" on the very machine it had just been installed on.
        if let Ok(entries) = std::fs::read_dir(home.join(".nvm/versions/node")) {
            for e in entries.flatten() {
                out.push(e.path().join("bin").join(bin));
            }
        }
    }
    for abs in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        out.push(std::path::PathBuf::from(abs).join(bin));
    }
    out
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
}

/// §2.1, per engine: `which <bin>` first (honours a PATH the user did set for us), then the
/// known install locations. The first candidate that answers `--version` wins.
fn detect_one(kind: EngineKind) -> Option<DetectedEngine> {
    let mut tried: Vec<String> = Vec::new();
    let mut which = std::process::Command::new("/usr/bin/which");
    which.arg(kind.binary());
    if let Ok(out) = output_with_timeout(which, PROBE_TIMEOUT) {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                tried.push(p);
            }
        }
    }
    for p in candidate_paths(kind) {
        if p.is_file() {
            tried.push(p.to_string_lossy().into_owned());
        }
    }
    for path in tried {
        let mut cmd = std::process::Command::new(&path);
        cmd.arg("--version");
        if let Ok(out) = output_with_timeout(cmd, PROBE_TIMEOUT) {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout).into_owned();
                return Some(DetectedEngine { kind, version: parse_version(&text), path });
            }
        }
    }
    None
}

/// §7.4: which engine a run uses. One found → that one, no question asked. Both found →
/// the user's pick from settings, defaulting to `claude`. A preference naming an engine
/// that is not installed falls back rather than failing: the user may have uninstalled it,
/// and refusing to run because a stale setting names a missing binary would be a dead end
/// with no way out except finding that setting.
pub fn select(engines: &[DetectedEngine], preferred: Option<EngineKind>) -> Option<&DetectedEngine> {
    preferred
        .and_then(|p| engines.iter().find(|e| e.kind == p))
        .or_else(|| EngineKind::ALL.iter().find_map(|k| engines.iter().find(|e| e.kind == *k)))
}

pub fn detect(preferred: Option<EngineKind>) -> EngineStatus {
    let engines: Vec<DetectedEngine> = EngineKind::ALL.iter().filter_map(|k| detect_one(*k)).collect();
    let Some(sel) = select(&engines, preferred) else {
        return EngineStatus::missing();
    };
    EngineStatus {
        available: true,
        selected: Some(sel.kind),
        version: sel.version.clone(),
        path: Some(sel.path.clone()),
        engines,
    }
}

// §2.2: the temporary --mcp-config. It registers Spool's own executable with `--mcp`,
// i.e. exactly the server Claude Desktop is pointed at by the one-click hookup — so
// "several processes on one library" is the model already in production, not a new risk
// surface opened here.
pub fn mcp_config_json(exe: &str) -> String {
    serde_json::json!({
        "mcpServers": { MCP_SERVER_NAME: { "command": exe, "args": ["--mcp"] } }
    })
    .to_string()
}

/// The models the user may pick, per engine (DESIGN_WORKBENCH §9.3 #3 — W3-c, promoted from
/// "可做" to "必做" by Ocean's 「切换模型没有选择权」).
///
/// ⚠️ **claude only, and that is a measurement, not an oversight.** §9.3 says in as many
/// words: 模型名要真机确认，别硬编码猜的.
///   * **claude** — `claude --help` documents the aliases itself ("Provide an alias for the
///     latest model (e.g. 'sonnet' or 'opus')"), and `--model haiku` was run for real on
///     2026-08-07: the envelope came back keyed `claude-haiku-4-5-20251001`. Aliases rather
///     than pinned ids on purpose — an alias follows the account's current model, a pinned
///     id rots the day Anthropic retires it.
///   * **codex** — deliberately absent. Its model list is a *server-fetched catalog*
///     (`model_catalog_json` / `supportedReasoningEfforts` in the 0.146.1 binary), and the
///     CLI does **not** validate `-c` values locally: a run with
///     `model_reasoning_effort="bogus-effort"` was accepted and echoed back in the banner
///     (probed 2026-08-07). So a guessed name would not fail fast — it would fail at the API
///     after the user waited. Filling this in needs one completing codex run, and that
///     account's quota is out until 2026-09-04.
pub const CLAUDE_MODELS: [&str; 3] = ["opus", "sonnet", "haiku"];

/// gemini's, measured 2026-08-10 by calling `generateContent` once per name with a real free
/// key. That probe is the whole reason this list is short: the CLI's own `ListModels` returns
/// **42** names, and several of them answer `404 … no longer available to new users`
/// (`gemini-2.5-flash`) or `429` on the free tier before a single token is spent
/// (`gemini-2.5-pro`, `gemini-2.0-flash`). Offering a name from the catalog would put a
/// picker entry in front of the user that cannot run.
///
/// ⚠️ **Full ids, not aliases** — the opposite of claude, and for the opposite reason: free
/// quota is metered **per model** (§7.8.4), so which one is selected is exactly what decides
/// whether today's runs are still possible. An alias that silently moves would move the
/// quota pool with it.
///
/// ⚠️ **The list rots.** Google retires these fast (2.5-flash was closed to new users within
/// a year). Re-probe before trusting it — the loop is in §7.8.
pub const GEMINI_MODELS: [&str; 4] = [
    "gemini-3-flash-preview",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
];

impl EngineKind {
    /// The model names this engine's picker may offer, and the list a hand-edited
    /// settings.json is checked against. Empty means "this engine has no verified catalog"
    /// — codex, whose names come from a server-fetched catalog it does not validate locally
    /// (see CLAUDE_MODELS' note), so Spool offers none rather than guessing.
    pub fn models(self) -> &'static [&'static str] {
        match self {
            EngineKind::Claude => &CLAUDE_MODELS,
            EngineKind::Gemini => &GEMINI_MODELS,
            EngineKind::Codex => &[],
        }
    }
}

/// How hard the claude engine thinks — DESIGN_WORKBENCH §9.13 (Ocean 2026-08-07:
/// 「Claude code 模型为什么没有 effort。加进去」).
///
/// ⚠️ **There is no `--effort` flag, and looking for one is why this looked impossible.**
/// `claude --help` on 2.0.50 lists no such option. The control exists, it is just not on the
/// command line — read out of the installed binary on 2026-08-07, the resolver is:
///
/// ```text
/// let T = process.env.CLAUDE_CODE_EFFORT_LEVEL;
/// if (T) { if (T === "unset") return; …; if (["low","medium","high"].includes(T)) return T }
/// ```
///
/// So: an **environment variable**, accepting exactly these three words (it also takes an
/// integer, which the same binary maps `low:45 / medium:75 / high:99` — the words are what
/// the CLI's own settings file offers, so the words are what Spool offers).
///
/// ⚠️ Anything it does not recognise is **ignored**, not rejected. That cuts both ways: a
/// typo cannot break a run, and a typo also cannot be detected — which is why the value is
/// filtered against this list before it is ever set, rather than trusted from settings.json.
///
/// ⚠️ **claude only.** codex has a reasoning-effort knob of its own
/// (`model_reasoning_effort`), and 2026-08-07 measured that it does *not* validate the value
/// locally — `"bogus-effort"` was accepted and echoed back in the banner, then would fail at
/// the API after the user had waited out a run. Same reason its model picker is absent.
pub const CLAUDE_EFFORTS: [&str; 3] = ["low", "medium", "high"];

/// The env var claude reads its effort level from, and the value to give it — or `None` when
/// the user has not picked one, in which case the variable is not set at all and the CLI's
/// own default stands. Split out from spawning so it is assertable without a live CLI.
pub fn claude_effort_env(effort: Option<&str>) -> Option<(&'static str, String)> {
    let e = effort?;
    CLAUDE_EFFORTS
        .contains(&e)
        .then(|| ("CLAUDE_CODE_EFFORT_LEVEL", e.to_string()))
}

/// The argv for one headless `claude` run, minus the binary itself. Split out from spawning
/// so the permission-critical parts (§2.4 probe 2: no tool outside the Spool whitelist can
/// be reached) are assertable in a unit test without a live CLI.
///
/// `model` is `None` for "whatever the account defaults to" — the flag is omitted entirely
/// rather than passed with a default of Spool's choosing.
///
/// The output format is `stream-json` rather than `json`, and that is a smaller change than
/// §9.3 #4 feared: the two formats end with the **same** `result` object (measured), so the
/// answer is still read by the parser that was already verified. What is new is only the
/// lines before it, which decorate the panel.
pub fn claude_args(
    prompt: &str,
    config_path: &str,
    max_turns: u32,
    web: bool,
    model: Option<&str>,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-p".into(),
        prompt.into(),
        "--mcp-config".into(),
        config_path.into(),
        // ⚠️ Without this, the run ALSO loads every MCP server in the user's own
        // ~/.claude config — verified 2026-08-07, where a probe run's `system/init` line
        // listed a second Spool library's tools that Spool never asked for. The whitelist
        // still denies them, so this was never a hole; it was a pile of tool definitions in
        // the context window of every run, billed to the user. codex has had the equivalent
        // (`--ignore-user-config`) since §7.3; this is claude's.
        "--strict-mcp-config".into(),
        "--allowedTools".into(),
        allowed_tools(web),
        "--output-format".into(),
        "stream-json".into(),
        // Not optional in the "nice to have" sense: `--print` with
        // `--output-format=stream-json` is refused outright without it ("requires
        // --verbose", measured 2026-08-07).
        "--verbose".into(),
        // Token-level deltas, i.e. the typing effect itself.
        "--include-partial-messages".into(),
        "--max-turns".into(),
        max_turns.to_string(),
    ];
    if let Some(m) = model {
        args.push("--model".into());
        args.push(m.into());
    }
    args
}

// §7.3 said this cell was "to be measured". Measured on 2026-08-06 against codex-cli
// 0.146.1, and the answer is better than the design feared.
//
// The worry was that codex reads a PERSISTENT config (~/.codex/config.toml) rather than a
// throwaway one, so pointing it at Spool's MCP server would also hand the run every other
// server the user has — on the author's own machine that meant a browser driver, a
// computer-use client and a node REPL. `--ignore-user-config` closes exactly that hole,
// and its help text is explicit that it is only the config that is skipped: "auth still
// uses CODEX_HOME". Verified both halves: a run with this flag never loaded the user's
// servers (the spool server was spawned with the argv and env WE passed, nothing else was),
// and it still authenticated far enough to reach OpenAI and come back with an
// account-level answer. So the boundary a temp `--mcp-config` gives claude is available
// here too; it is just spelled with `-c` overrides instead of a file.
//
// Two honest gaps to say out loud rather than paper over:
//   * **The shell tool cannot be removed.** `tools.shell` is not a config key (probed with
//     `--strict-config`, which rejects unknown fields). claude's `--allowedTools` denies
//     Bash outright; codex has no equivalent. The lever that does exist is
//     `--sandbox read-only`, which is passed below: model-run commands cannot write to the
//     user's disk. §7.3 asked for the degradation to be stated plainly if it could not be
//     closed — the settings page says it.
//   * **No `--max-turns` equivalent.** The run's only ceiling is the timeout, which is
//     enforced here anyway (clamp_timeout_secs + the kill).
fn codex_config_overrides(exe: &str, web: bool) -> Vec<String> {
    // TOML values, since `-c` parses the right-hand side as TOML. The tool list is the same
    // constant as claude's whitelist, spelled with bare names because that is what codex's
    // per-server `enabled_tools` takes (confirmed with `codex mcp get spool`, which echoed
    // the list back).
    let tools = ALLOWED_TOOL_NAMES
        .iter()
        .map(|t| format!("\"{t}\""))
        .collect::<Vec<_>>()
        .join(",");
    vec![
        // Headless means nobody is there to answer a prompt; without this the run can sit
        // waiting for an approval that will never come, inside a budget that is billing.
        "approval_policy=\"never\"".into(),
        // Stated either way rather than left to the CLI's default: whether this run can
        // reach the open web is Spool's decision to make, not a default's to drift.
        format!("tools.web_search={web}"),
        format!("mcp_servers.{MCP_SERVER_NAME}.command={}", toml_string(exe)),
        format!("mcp_servers.{MCP_SERVER_NAME}.args=[\"--mcp\"]"),
        format!("mcp_servers.{MCP_SERVER_NAME}.enabled_tools=[{tools}]"),
    ]
}

/// A TOML basic string. Paths come from `current_exe()` so quotes and backslashes are not
/// expected, but a mis-escaped value here would silently become a DIFFERENT command for the
/// agent to run, which is not a thing to leave to expectation.
fn toml_string(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

/// gemini's built-in tools, which unlike claude's are ON unless named here (§7.3). This is
/// the whole reason the gemini slot can honour §2.2's "nothing outside Spool's tools": the
/// list is a DENY list, so a tool the CLI adds in a future version is live until someone
/// notices — the opposite polarity from `ALLOWED_TOOL_NAMES`, and worth knowing when a
/// gemini upgrade lands.
///
/// ⚠️ `web_fetch` / `google_web_search` are deliberately absent: they are added back per
/// action by `gemini_settings_json`'s `web` flag, the same per-action grant claude gets
/// through `WEB_TOOL_NAMES`.
const GEMINI_EXCLUDED_TOOLS: [&str; 13] = [
    "run_shell_command",
    "write_file",
    "replace",
    "read_file",
    "read_many_files",
    "list_directory",
    "glob",
    "grep_search",
    "search_file_content",
    "invoke_agent",
    "save_memory",
    "list_mcp_resources",
    "read_mcp_resource",
];

/// gemini takes its MCP servers from a settings FILE in the working directory — there is no
/// `--mcp-config` and no `-c` override (§7.3). So Spool writes one into a throwaway directory
/// and runs the CLI with that directory as its cwd.
///
/// Three fields here are each load-bearing, and each fails SILENTLY if wrong:
///   * `trust: true` — an untrusted server is configured but never started.
///   * `includeTools` — the Spool-side whitelist, bare names (no `mcp_spool_` prefix).
///   * `tools.exclude` — the built-in file/shell tools, which are otherwise all live.
///
/// ⚠️ **`tools.exclude` is deprecated**: gemini 0.54.4 warns it "will be removed in 1.0.
/// Migrate to Policy Engine". When that lands this function must be rewritten, and until it
/// is, a gemini upgrade can silently restore the shell tool. Stated in §7.8.6 rather than
/// papered over.
pub fn gemini_settings_json(exe: &str, web: bool) -> String {
    let mut excluded: Vec<&str> = GEMINI_EXCLUDED_TOOLS.to_vec();
    if !web {
        excluded.push("google_web_search");
        excluded.push("web_fetch");
    }
    serde_json::json!({
        "tools": { "exclude": excluded },
        "mcpServers": {
            MCP_SERVER_NAME: {
                "command": exe,
                "args": ["--mcp"],
                "trust": true,
                "includeTools": ALLOWED_TOOL_NAMES,
            }
        }
    })
    .to_string()
}

/// The argv for one headless `gemini` run.
///
/// ⚠️ `--allowed-mcp-server-names` is not belt-and-braces here, it is the ONLY thing standing
/// between this run and every MCP server in the user's own `~/.gemini/settings.json`: gemini
/// has no `--strict-mcp-config` (claude) and no `--ignore-user-config` (codex), so those
/// servers ARE loaded and ARE started. Naming Spool's server keeps their tools out of the
/// model's hands, which is the half of the guarantee that can still be kept (§7.8.6).
///
/// ⚠️ No `--max-turns` equivalent exists (same as codex); the timeout is the only ceiling.
///
/// `model` is `None` for "whatever the CLI defaults to". ⚠️ Measured 2026-08-10: `-m` is a
/// request, not a pin — asking for `gemini-3.6-flash` produced a quota error naming
/// `gemini-3.5-flash`. So nothing downstream may assume the model that ran is the one asked
/// for; `RunUsage.model` is read back from the run's own stats for exactly this reason.
pub fn gemini_args(prompt: &str, model: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-p".into(),
        prompt.into(),
        // One JSON envelope, same shape of job as claude's `--output-format json`.
        "-o".into(),
        "json".into(),
        // Headless: nobody is present to approve a tool call. The blast radius is bounded by
        // the two whitelists in `gemini_settings_json`, not by this flag.
        "--approval-mode".into(),
        "yolo".into(),
        "--allowed-mcp-server-names".into(),
        MCP_SERVER_NAME.into(),
    ];
    if let Some(m) = model {
        args.push("-m".into());
        args.push(m.into());
    }
    args
}

/// The argv for one headless `codex` run. `exe` is Spool's own binary — codex takes its MCP
/// servers as config overrides, so there is no temp file on this path.
pub fn codex_args(prompt: &str, exe: &str, last_message_path: &str, web: bool) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "exec".into(),
        // Do not load ~/.codex/config.toml: the user's own MCP servers, plugins and model
        // choice stay out of this run. Auth is unaffected (see the note above).
        "--ignore-user-config".into(),
        // Spool runs from wherever the app was launched, which is not a git repo. Without
        // this codex refuses to start.
        "--skip-git-repo-check".into(),
        // The only sandbox lever codex offers, and the reason the missing shell whitelist
        // is a degradation rather than a hole: whatever the model runs cannot write.
        "--sandbox".into(),
        "read-only".into(),
        // Events as JSONL. The failure path is read from these — a `turn.failed` carries
        // the CLI's own words, which is what the toast should show ("you've hit your usage
        // limit", "not logged in") rather than something Spool invented.
        "--json".into(),
        // The final message goes to a file rather than being dug out of the event stream.
        // Deliberate: the failure shape is verified (a real run produced it), the success
        // shape is not, and guessing at an event schema to recover a string that only
        // decorates a toast would be the fragile half of this parser.
        "-o".into(),
        last_message_path.into(),
    ];
    for c in codex_config_overrides(exe, web) {
        args.push("-c".into());
        args.push(c);
    }
    // Positional, and last: everything above is a flag.
    args.push(prompt.into());
    args
}

/// §2.2 minimal env for a run. Everything else is cleared; these three are each load-bearing:
///
/// * `PATH` — the CLI shells out (it re-launches itself as its own MCP client).
/// * `HOME` — the CLI's config lives under it.
/// * `USER` — the login token is a macOS Keychain generic password whose **account** is the
///   username, and the CLI reads that name from `USER`. Without it the lookup misses, the
///   CLI falls through to "no key configured", and every run comes back
///   `Invalid API key · Please run /login` — which reads like the user is logged out when
///   they are not. Cost us a session on 2026-08-06; bisected one variable at a time, and
///   `LOGNAME` alone does **not** substitute.
///
/// `CODEX_HOME` joins them for codex: its credentials live in `$CODEX_HOME/auth.json`
/// (default `~/.codex`), so a user who moved it would be logged out here and nowhere else —
/// the same shape of bug `USER` just cost us, and one line to prevent. It is passed only
/// when the user actually set it; an empty default would point codex at nothing.
///
/// Split out from spawning so the list is assertable without a live CLI (same reason as the
/// arg builders) — nothing else fails this loudly for so small an omission.
/// `GEMINI_API_KEY` joins them for gemini — Google stopped free Google-account login for the
/// CLI in 2025-06, so a key is how the free tier is reached at all (§7.7). Passed through only
/// if the user actually set it; Spool never stores it, which is the entire point of shape A.
///
/// ⚠️ **And it is usually NOT set, which is fine.** Spool is launched from Finder, so it
/// inherits launchd's environment, not the user's shell — the same reason `candidate_paths`
/// exists. Measured 2026-08-10: with no `GEMINI_API_KEY` anywhere in the environment and a
/// working directory Spool had just created, gemini still authenticated by reading
/// **`~/.gemini/.env`**, its own config. That is the route to tell users about: the key lives
/// in the CLI's config, Spool passes nothing and sees nothing. The passthrough below is kept
/// for the user who really did export it.
pub fn run_env(kind: EngineKind) -> Vec<(&'static str, std::ffi::OsString)> {
    let mut keys: Vec<&'static str> = vec!["PATH", "HOME", "USER"];
    match kind {
        EngineKind::Codex => keys.push("CODEX_HOME"),
        EngineKind::Gemini => keys.push("GEMINI_API_KEY"),
        EngineKind::Claude => {}
    }
    let mut out: Vec<(&'static str, std::ffi::OsString)> = keys
        .into_iter()
        .filter_map(|k| std::env::var_os(k).map(|v| (k, v)))
        .collect();
    // ⚠️⚠️ Not optional, and the single most expensive thing to get wrong in this module:
    // without it gemini treats the working directory as untrusted and **silently disables
    // every MCP server** — the run completes, costs quota, and comes back having never seen
    // Spool at all. `--skip-trust` does NOT cover this (measured 2026-08-10: the model
    // answered "NO_MCP_TOOLS" with that flag set). The directory being trusted is one Spool
    // just created and wrote a single settings file into, so there is nothing here to trust
    // that Spool did not put there itself.
    if kind == EngineKind::Gemini {
        out.push(("GEMINI_CLI_TRUST_WORKSPACE", std::ffi::OsString::from("true")));
    }
    out
}

/// DESIGN_WORKBENCH §5 — what a run cost and which model spent it.
///
/// Ocean, 2026-08-06: "我在使用过程中对使用了什么模型花了多少额度毫不知情，但这不是免费的".
/// He was right, and the awkward part is that claude has been reporting all of it in the
/// same envelope Spool already parses — `RunEnvelope` simply named three fields, and serde
/// dropped the rest without a word.
///
/// ⚠️ **What is NOT here, and cannot be:** how much of the user's plan is left. Neither CLI
/// reports account-level remaining quota headlessly (claude's `/usage` is interactive). So
/// Spool can say "this run cost $0.03" and total up its own runs; it must never render
/// anything that reads as "you have N left".
///
/// Every field is optional and every parse is lenient by design: this decorates a card, and
/// a CLI that renames a field must not turn a successful run into a failed one.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RunUsage {
    /// The model the CLI actually used — not the one we asked for, which may have been
    /// overridden by a fallback.
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    /// Everything the run read, cache included. `usage.input_tokens` alone is the
    /// *uncached* remainder and reads as absurdly small (single digits against a 15k-token
    /// pack), which would be a more misleading number than none at all.
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

/// The `{"type":"result",…}` object a `claude -p` run ends with, carrying the final assistant
/// text plus run metadata. Identical under `--output-format json` and `stream-json` — in the
/// first it is the entire output, in the second it is the last line. Blocks the run wrote are
/// already in the database via MCP; this text is never a second write path, it is what the
/// user reads on the run card.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RunEnvelope {
    #[serde(default)]
    pub is_error: bool,
    #[serde(default)]
    pub result: String,
    #[serde(default)]
    pub num_turns: Option<u32>,
    /// Filled by `parse_usage` after the envelope is read, not by serde — the fields it
    /// comes from are spread across the envelope's top level and its `usage` object.
    #[serde(skip)]
    pub usage: RunUsage,
}

/// Pull cost and model out of claude's envelope.
///
/// ✅ **Confirmed against a live envelope on 2026-08-07** (a ~$0.02 haiku run — the open item
/// DESIGN_WORKBENCH §5 left for the next window). The nesting this function guessed at was
/// right: `total_cost_usd` sits at the top level, the three input counters under `usage`,
/// and `modelUsage` is keyed by the model id (`claude-haiku-4-5-20251001`).
///
/// Every lookup stays miss-tolerant anyway. The envelope's field names belong to the CLI,
/// and a rename must degrade a card to "花费未知", never turn a successful run into a failed
/// one.
fn parse_usage(v: &serde_json::Value) -> RunUsage {
    let u = v.get("usage");
    // Input arrives split across fresh / cache-write / cache-read; the sum is what the run
    // actually read. Absent fields contribute nothing rather than zeroing the total.
    let input = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
        .iter()
        .filter_map(|k| u?.get(k)?.as_u64())
        .reduce(|a, b| a + b);
    RunUsage {
        // modelUsage is keyed BY model name, so the key is the answer. One run, one model
        // in the ordinary case; a fallback would add a second and the first is still the
        // one that did the work.
        model: v
            .get("modelUsage")
            .and_then(serde_json::Value::as_object)
            .and_then(|m| m.keys().next().cloned()),
        cost_usd: v.get("total_cost_usd").and_then(serde_json::Value::as_f64),
        input_tokens: input,
        output_tokens: u.and_then(|u| u.get("output_tokens")?.as_u64()),
    }
}

/// What a codex run spent, read from its `turn.completed` event.
///
/// ✅ **Measured 2026-08-10 on the first codex run that ever completed** (the account's quota
/// was out from 2026-08-06 until then, which is why DESIGN_WORKBENCH §5 left this open). The
/// stream is four events — `thread.started`, `turn.started`, `item.completed`,
/// `turn.completed` — and the last one carries:
///
/// ```json
/// {"type":"turn.completed","usage":{"input_tokens":22691,"cached_input_tokens":11008,
///  "cache_write_input_tokens":0,"output_tokens":288,"reasoning_output_tokens":106}}
/// ```
///
/// ⚠️ **Two things are NOT in there, and this is now a measurement rather than a guess:**
///   * **No cost in dollars.** claude reports `total_cost_usd`; codex reports tokens only. So a
///     codex run card shows tokens and 花费未知 — never a fabricated 0, which would read as
///     "this run was free" on a subscription the user pays for.
///   * **No model name.** Nothing in any of the four events says which model ran, so
///     `RunUsage.model` stays `None` here. That is also why codex still has no model picker
///     (`EngineKind::models` is empty for it): Spool cannot even confirm afterwards which
///     model a run used, let alone validate a name before it.
///
/// Input is reported split; the sum is what the run actually read, matching how the claude
/// side already totals its three input counters.
pub fn parse_codex_usage(stdout: &str) -> RunUsage {
    let mut usage = RunUsage::default();
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) else { continue };
        if v.get("type").and_then(serde_json::Value::as_str) != Some("turn.completed") {
            continue;
        }
        let Some(u) = v.get("usage") else { continue };
        let get = |k: &str| u.get(k).and_then(serde_json::Value::as_u64);
        usage.input_tokens = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens"]
            .iter()
            .filter_map(|k| get(k))
            .reduce(|a, b| a + b);
        // Reasoning tokens are billed as output and are invisible in the answer, so leaving
        // them out would under-report what the run cost.
        usage.output_tokens = ["output_tokens", "reasoning_output_tokens"]
            .iter()
            .filter_map(|k| get(k))
            .reduce(|a, b| a + b);
    }
    usage
}

/// gemini's `-o json` envelope is `{session_id, response, stats}` — a different shape from
/// claude's, so it gets its own reader rather than a serde alias that would quietly accept
/// half of either.
///
/// Two things it does NOT carry, and neither is recoverable:
///   * **cost.** There is no `total_cost_usd`; the free tier has no per-run price and the
///     paid tier bills the key, not the CLI. A run card must therefore say 花费未知 rather
///     than invent a zero — "$0.00" would read as "this was free" on a key that is billed.
///   * **a reliable model name.** `stats.models` is keyed by the model that actually ran,
///     which is the honest answer and the reason it is read from here instead of echoing
///     back the `-m` we asked for (§7.8.4 — the two differ).
///
/// A failed run reports `{"error": {...}}` instead of `response`, and the CLI's own words are
/// the useful ones (over quota / bad key), so they are passed through unchanged.
pub fn parse_gemini_envelope(stdout: &str) -> Result<RunEnvelope, String> {
    let value: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("could not read the CLI's JSON output: {e}"))?;
    if let Some(err) = value.get("error") {
        let msg = err
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("the run failed without saying why");
        return Err(msg.to_string());
    }
    let models = value.get("stats").and_then(|s| s.get("models")).and_then(serde_json::Value::as_object);
    // Sum across models: a fallback (§7.8.4) means more than one may have spent tokens, and
    // the total is what the run actually cost the quota.
    let sum = |field: &str| -> Option<u64> {
        let m = models?;
        let total: u64 = m
            .values()
            .filter_map(|v| v.get("tokens")?.get(field)?.as_u64())
            .sum();
        Some(total)
    };
    Ok(RunEnvelope {
        is_error: false,
        result: value
            .get("response")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        num_turns: None,
        usage: RunUsage {
            // The model that spent the most is the one that did the work; a fallback's first
            // attempt typically errors with zero tokens (measured).
            model: models.and_then(|m| {
                m.iter()
                    .max_by_key(|(_, v)| {
                        v.get("tokens").and_then(|t| t.get("total")?.as_u64()).unwrap_or(0)
                    })
                    .map(|(k, _)| k.clone())
            }),
            cost_usd: None,
            input_tokens: sum("prompt"),
            output_tokens: sum("candidates"),
        },
    })
}

fn envelope_from_value(value: serde_json::Value) -> Result<RunEnvelope, String> {
    let mut env = serde_json::from_value::<RunEnvelope>(value.clone())
        .map_err(|e| format!("could not read the CLI's JSON output: {e}"))?;
    env.usage = parse_usage(&value);
    Ok(env)
}

/// What the UI shows while a run is still going (DESIGN_WORKBENCH §9.3 #4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Progress {
    /// Words the model is typing, as they arrive. This is the 「正在打字」 Ocean asked for.
    Delta { text: String },
    /// It reached for a tool. Named, because "reading the project" and "searching the web"
    /// are the two things a user most wants to know a run is doing.
    Tool { text: String },
}

/// One line of `claude --output-format stream-json`, read for what to show the user.
///
/// Line shapes below are verbatim from a real run on 2026-08-07 (haiku, no MCP, ~$0.02) —
/// §6.2-ter's rule is that a subprocess's shape does not count until it has been seen.
///   * `{"type":"stream_event","event":{"type":"content_block_delta",
///      "delta":{"type":"text_delta","text":"…"}}}`
///   * `{"type":"stream_event","event":{"type":"content_block_start",
///      "content_block":{"type":"tool_use","name":"…"}}}`
///
/// Anything else yields `None`. That is the whole error policy: this decorates a panel, and
/// a schema that grows a field must never be able to fail a run that is otherwise fine.
pub fn parse_claude_stream_line(line: &str) -> Option<Progress> {
    let v = serde_json::from_str::<serde_json::Value>(line.trim()).ok()?;
    if v.get("type")?.as_str()? != "stream_event" {
        return None;
    }
    let event = v.get("event")?;
    match event.get("type")?.as_str()? {
        "content_block_delta" => {
            let text = event.pointer("/delta/text")?.as_str()?;
            (!text.is_empty()).then(|| Progress::Delta { text: text.to_string() })
        }
        "content_block_start" => {
            let block = event.get("content_block")?;
            if block.get("type")?.as_str()? != "tool_use" {
                return None;
            }
            Some(Progress::Tool { text: block.get("name")?.as_str()?.to_string() })
        }
        _ => None,
    }
}

/// The answer, out of a streamed run.
///
/// The last `{"type":"result",…}` line is byte-for-byte the object `--output-format json`
/// returns on its own — measured, not assumed — so the verified parser reads it unchanged.
///
/// ⚠️ **And when it is not there, this retreats instead of failing.** §9.3 #4: 做成能回退的,
/// 解析失败退回今天的「攒完再读」, 别让一次运行整个失败. A run that produced words and then
/// tripped over its own envelope has still done the work the user paid for, so the assistant
/// text is stitched back together and handed over with no usage numbers rather than being
/// reported as a failure.
pub fn parse_claude_stream(stdout: &str) -> Result<RunEnvelope, String> {
    let mut fallback = String::new();
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
            continue;
        };
        match v.get("type").and_then(|t| t.as_str()) {
            // Keep going rather than returning: the last result line is the run's, and a
            // sub-agent's would come earlier.
            Some("result") => return envelope_from_value(v),
            Some("assistant") => {
                if let Some(blocks) = v.pointer("/message/content").and_then(|c| c.as_array()) {
                    for b in blocks {
                        if let Some(t) = b.get("text").and_then(|t| t.as_str()) {
                            fallback.push_str(t);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if fallback.trim().is_empty() {
        return Err("could not read the CLI's JSON output: no result line".into());
    }
    Ok(RunEnvelope {
        is_error: false,
        result: fallback,
        num_turns: None,
        usage: RunUsage::default(),
    })
}

/// `codex exec --json` answers with one JSON object per line, not one envelope. Only the
/// failure carries anything Spool must read: `{"type":"error","message":…}` and
/// `{"type":"turn.failed","error":{"message":…}}` — verified against a real run on
/// 2026-08-06, where the pair reported "You've hit your usage limit … try again at Sep 4th".
/// That sentence is the single most useful thing a failed run can hand the user, and it is
/// the CLI's to word, never ours.
///
/// The success text is NOT dug out of here (see `codex_args`): it is read from the
/// `-o` file. Lines that do not parse are skipped rather than failing the run — the event
/// schema belongs to codex and may grow, while what this function needs from it is one
/// error string.
pub fn parse_codex_error(stdout: &str) -> Option<String> {
    let mut last = None;
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
            continue;
        };
        let msg = match v.get("type").and_then(|t| t.as_str()) {
            Some("error") => v.get("message").and_then(|m| m.as_str()),
            Some("turn.failed") => v.pointer("/error/message").and_then(|m| m.as_str()),
            _ => None,
        };
        if let Some(m) = msg.map(str::trim).filter(|m| !m.is_empty()) {
            last = Some(m.to_string());
        }
    }
    last
}

/// One headless run, start to finish.
///
/// The prompt is not built here — it comes from mcp.rs, the same constant source the MCP
/// prompts use (§2.2), so the two can never drift. What this owns is the process: minimal
/// env, a temp config that is deleted whatever happens, a hard deadline, and a kill that
/// takes the whole process group with it.
///
/// Blocks the AI writes land through MCP while this runs; there is no rollback and none is
/// wanted (append-only, §2.3). A timeout or a cancel therefore means "stopped", not
/// "undone" — the caller says so in the toast.
///
/// Returns which engine ran alongside the envelope: the caller stores it on the run record
/// (DESIGN_WORKBENCH §4.1), and the answer is resolved HERE — a preference naming an engine
/// that is not installed falls back (§7.4), so what JS asked for is not what ran.
///
/// `on_progress` is called from the reader thread as the CLI talks (§9.3 #4). It fires only
/// for claude today: codex's success event names have never been seen on a completing run
/// (its quota is out until 2026-09-04), and inventing them would put a made-up caption under
/// a real run.
pub fn run_action(
    preferred: Option<EngineKind>,
    prompt: &str,
    timeout_secs: u64,
    max_turns: u32,
    web: bool,
    model: Option<&str>,
    effort: Option<&str>,
    on_progress: Arc<dyn Fn(Progress) + Send + Sync>,
) -> Result<(EngineKind, RunEnvelope), String> {
    // Serial, enforced HERE and not only in the queue that calls it. The queue lives in
    // one window's JS; a second window, or a hand-issued invoke, would otherwise start a
    // second run — and RUNNING_PGID holds exactly one process group, so the cancel button
    // would end up aimed at whichever run published last while the other kept billing.
    // (Found in the 2026-08-05 self-review: the TS queue was the only thing holding this.)
    if RUNNING_PGID.load(Ordering::SeqCst) != 0 {
        return Err("a maintenance run is already in flight".into());
    }
    let status = detect(preferred);
    let (Some(bin), Some(kind)) = (status.path.as_deref(), status.selected) else {
        return Err("no AI engine CLI found".into());
    };
    // §7.8.5-2. The UI already withholds 跟进 on an engine that cannot carry it, but the
    // resolution above can land on a DIFFERENT engine than the one the UI was looking at
    // (a preference naming an uninstalled engine falls back), so the refusal belongs here
    // too — this is the check that is true whatever the caller believed.
    if web && !kind.supports_web() {
        return Err(format!("{} cannot run the follow-up action", kind.as_str()));
    }
    // W3-c's filter, moved here from the caller now that there is more than one catalog: the
    // engine that RUNS decides which names are valid, and it is not always the one JS asked
    // for (`select` falls back when a preference names an uninstalled engine). A stale
    // `aiEngineModel` naming a claude alias must not reach gemini's `-m`.
    let model = model.filter(|m| kind.models().contains(m));
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir();
    // One file per process, which is also one per run given the guard above. Rewritten at
    // the start of every run and deleted at the end, so a stale copy left by a killed run
    // is overwritten rather than inherited.
    let cfg_path = tmp.join(format!("spool-mcp-{}.json", std::process::id()));
    // codex writes its final message here instead of Spool parsing it out of the event
    // stream; claude never touches it.
    let msg_path = tmp.join(format!("spool-engine-msg-{}.txt", std::process::id()));

    // gemini reads its MCP servers from `<cwd>/.gemini/settings.json` and nowhere else, so
    // this run gets a directory of its own. Same lifetime as cfg_path: rewritten per run,
    // removed on the way out down either path.
    let work_dir = tmp.join(format!("spool-gemini-{}", std::process::id()));

    let mut cmd = std::process::Command::new(bin);
    match kind {
        EngineKind::Claude => {
            std::fs::write(&cfg_path, mcp_config_json(&exe.to_string_lossy()))
                .map_err(|e| format!("could not write the MCP config: {e}"))?;
            cmd.args(claude_args(prompt, &cfg_path.to_string_lossy(), max_turns, web, model));
        }
        EngineKind::Codex => {
            // A leftover from a killed run would otherwise be read back as this run's
            // answer — the file is only written when the CLI has something to say.
            let _ = std::fs::remove_file(&msg_path);
            cmd.args(codex_args(prompt, &exe.to_string_lossy(), &msg_path.to_string_lossy(), web));
        }
        EngineKind::Gemini => {
            // Rebuilt from scratch: a settings file left by a killed run would otherwise
            // decide this run's tool whitelist.
            let _ = std::fs::remove_dir_all(&work_dir);
            std::fs::create_dir_all(work_dir.join(".gemini"))
                .map_err(|e| format!("could not prepare the engine's working directory: {e}"))?;
            std::fs::write(
                work_dir.join(".gemini/settings.json"),
                gemini_settings_json(&exe.to_string_lossy(), web),
            )
            .map_err(|e| format!("could not write the MCP config: {e}"))?;
            // ⚠️ The cwd IS the configuration on this path. Without it gemini reads whatever
            // directory Spool happened to be launched from.
            cmd.current_dir(&work_dir);
            cmd.args(gemini_args(prompt, model));
        }
    }
    cmd.env_clear();
    for (k, v) in run_env(kind) {
        cmd.env(k, v);
    }
    // §9.13 — effort rides in the environment because that is the only door claude 2.0.50
    // has for it (see CLAUDE_EFFORTS). Added AFTER run_env's minimal set on purpose: it is
    // not load-bearing, and a run must never fail because this could not be resolved.
    if kind == EngineKind::Claude {
        if let Some((k, v)) = claude_effort_env(effort) {
            cmd.env(k, v);
        }
    }
    // §2.2: its own process group, so a cancel or a timeout takes the CLI's children with
    // it. `claude` spawns MCP servers — one of them is another `spool --mcp` against the
    // user's library — and killing only the parent would strand them.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                // Between fork and exec: setpgid(0, 0) makes this child its own group
                // leader, so its pid doubles as the group id the kill aims at.
                if libc::setpgid(0, 0) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    // Only claude streams anything readable today, so only claude's lines are parsed. The
    // reader runs regardless — that is what keeps stderr drained and the answer accumulated.
    let watch: Arc<dyn Fn(&str) + Send + Sync> = match kind {
        EngineKind::Claude => Arc::new(move |line: &str| {
            if let Some(p) = parse_claude_stream_line(line) {
                on_progress(p);
            }
        }),
        EngineKind::Codex => Arc::new(|_: &str| {}),
        // `-o json` emits one object at the end, so there is nothing to narrate mid-run.
        // gemini does offer `-o stream-json`, and moving to it is a self-contained follow-up:
        // the envelope this parser reads would become the stream's last line, exactly as it
        // did for claude. Left out of this pass rather than guessed at (§7.6's rule).
        EngineKind::Gemini => Arc::new(|_: &str| {}),
    };
    let result =
        stream_with_timeout(cmd, Duration::from_secs(clamp_timeout_secs(timeout_secs)), watch);
    // Delete the config before returning down either path — it names an executable, and
    // leaving it in /tmp serves nothing.
    let _ = std::fs::remove_file(&cfg_path);
    let _ = std::fs::remove_dir_all(&work_dir);

    let out = result?;
    let stdout = out.stdout;
    let stderr = out.stderr.trim().to_string();
    let finish = |r: Result<(EngineKind, RunEnvelope), String>| {
        let _ = std::fs::remove_file(&msg_path);
        r
    };
    if !out.success {
        // §2.3: the CLI's own words are the most useful thing here (not logged in, over
        // quota, …), so pass them through instead of inventing a message. For codex those
        // words are in the event stream, not on stderr — stderr carries log noise.
        let said = match kind {
            EngineKind::Codex => parse_codex_error(&stdout),
            EngineKind::Claude => None,
            // gemini exits non-zero on quota exhaustion and still prints its envelope, whose
            // `error.message` is the sentence worth showing ("You have exhausted your daily
            // quota on this model"). stderr on that path is a node stack trace.
            EngineKind::Gemini => parse_gemini_envelope(&stdout).err(),
        };
        return finish(Err(said.unwrap_or_else(|| {
            if stderr.is_empty() { stdout.trim().to_string() } else { stderr }
        })));
    }
    match kind {
        EngineKind::Claude => {
            let env = parse_claude_stream(&stdout)?;
            if env.is_error {
                return Err(if env.result.is_empty() {
                    "the CLI reported a failure".into()
                } else {
                    env.result
                });
            }
            Ok((kind, env))
        }
        EngineKind::Codex => {
            // A zero exit that still reported an error in the stream is a failure — trust
            // what it said over what it returned.
            if let Some(said) = parse_codex_error(&stdout) {
                return finish(Err(said));
            }
            // The text is for the toast only; blocks the run wrote are already in the
            // database through MCP. An unwritten or empty file is therefore not an error —
            // "finished, nothing new" is a legitimate outcome and the caller counts the
            // blocks itself rather than believing this string.
            //
            // ✅ Measured 2026-08-10 on the first codex run that completed — see
            // `parse_codex_usage`. Tokens are real and reported; dollars and the model name
            // are not reported at all, so those stay None rather than being invented.
            let result = std::fs::read_to_string(&msg_path).unwrap_or_default().trim().to_string();
            finish(Ok((
                kind,
                RunEnvelope {
                    is_error: false,
                    result,
                    num_turns: None,
                    usage: parse_codex_usage(&stdout),
                },
            )))
        }
        // A zero exit can still carry `{"error":…}`, same as codex — parse_gemini_envelope
        // returns that as Err, so this one call covers both outcomes.
        EngineKind::Gemini => finish(parse_gemini_envelope(&stdout).map(|env| (kind, env))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `stream_with_timeout` publishes RUNNING_PGID — one global, because one machine runs
    /// one maintenance run at a time (run_action refuses a second outright). Test threads do
    /// not go through that guard, so two streaming tests in parallel clobber each other's
    /// pid and the cancel test finds nothing to cancel. Serialise them here rather than
    /// weakening the production invariant to suit the test runner.
    static STREAM_TESTS: Mutex<()> = Mutex::new(());
    fn one_run_at_a_time() -> std::sync::MutexGuard<'static, ()> {
        // A panicking test poisons the lock; the next one still deserves to run.
        STREAM_TESTS.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn version_parsing_keeps_the_number_and_tolerates_noise() {
        assert_eq!(parse_version("2.0.50 (Claude Code)"), Some("2.0.50".into()));
        assert_eq!(parse_version("  2.1.0\n"), Some("2.1.0".into()));
        // Real output of codex-cli 0.146.1 — the number is the SECOND token here, which is
        // why "take token one" is not enough.
        assert_eq!(parse_version("codex-cli 0.146.1"), Some("0.146.1".into()));
        // Unparseable but non-empty still yields something — availability is decided by
        // the binary answering, not by the shape of this string.
        assert_eq!(parse_version("weird"), Some("weird".into()));
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("   "), None);
    }

    // The env is cleared before the run, so anything missing from this list is missing at
    // the CLI. `USER` looks droppable and is not — see `run_env`.
    #[test]
    fn run_env_carries_the_three_load_bearing_vars() {
        for kind in EngineKind::ALL {
            let names: Vec<&str> = run_env(kind).into_iter().map(|(k, _)| k).collect();
            for k in ["PATH", "HOME", "USER"] {
                assert!(names.contains(&k), "{k} must be handed to {}", kind.as_str());
            }
        }
    }

    // §9.13. The effort level is the one setting whose wrong value produces NO error at all:
    // claude reads `CLAUDE_CODE_EFFORT_LEVEL`, accepts "low" / "medium" / "high", and
    // silently ignores everything else — so a broken value here would look exactly like a
    // working one, and only the bill would know. Hence a test on the filter rather than
    // trust in the caller.
    #[test]
    fn effort_reaches_claude_as_an_env_var_and_only_when_it_is_one_of_the_three() {
        for e in CLAUDE_EFFORTS {
            assert_eq!(
                claude_effort_env(Some(e)),
                Some(("CLAUDE_CODE_EFFORT_LEVEL", e.to_string())),
                "{e} is one of the CLI's own words and must be passed through",
            );
        }
        // No pick = the variable is never set, so the account's own default stands. That is
        // NOT the same as sending a default of Spool's choosing.
        assert_eq!(claude_effort_env(None), None);
        // Hand-edited settings.json, or a value from a future CLI we have not measured.
        // "unset" is claude's own opt-out keyword, but Spool has a real "don't set it"
        // (None), so passing the word through would be a second spelling of the same thing.
        for bad in ["", "xhigh", "max", "HIGH", "unset", "99"] {
            assert_eq!(claude_effort_env(Some(bad)), None, "{bad:?} must not be passed on");
        }
    }

    #[test]
    fn missing_status_renders_nothing() {
        let s = EngineStatus::missing();
        assert!(!s.available);
        assert!(s.version.is_none() && s.path.is_none() && s.selected.is_none());
        assert!(s.engines.is_empty());
    }

    // §7.4. The interesting case is the last one: a preference naming an engine that is not
    // installed must fall back, not dead-end — the user may have uninstalled it, and the
    // setting that names it is not something they would think to go and change.
    #[test]
    fn engine_selection_follows_the_user_then_the_default_order() {
        let claude =
            DetectedEngine { kind: EngineKind::Claude, version: None, path: "/c".into() };
        let codex = DetectedEngine { kind: EngineKind::Codex, version: None, path: "/x".into() };
        let both = vec![claude.clone(), codex.clone()];
        assert_eq!(select(&both, None).unwrap().kind, EngineKind::Claude);
        assert_eq!(select(&both, Some(EngineKind::Codex)).unwrap().kind, EngineKind::Codex);
        // Only one installed: it is used whatever the setting says.
        let only_codex = vec![codex];
        assert_eq!(select(&only_codex, None).unwrap().kind, EngineKind::Codex);
        assert_eq!(select(&only_codex, Some(EngineKind::Claude)).unwrap().kind, EngineKind::Codex);
        assert!(select(&[], Some(EngineKind::Claude)).is_none());
    }

    #[test]
    fn engine_kind_round_trips_through_the_wire_name() {
        for kind in EngineKind::ALL {
            assert_eq!(EngineKind::parse(kind.as_str()), Some(kind));
            // The name crosses to JS as a bare lowercase string; a rename on either side
            // would silently become "preference not recognised, fall back to claude".
            assert_eq!(serde_json::to_string(&kind).unwrap(), format!("\"{}\"", kind.as_str()));
        }
        // An engine Spool has no adapter for is not a preference, it is a typo (§7.2: adding
        // one means writing code, never configuration). `gemini` was this case until
        // 2026-08-10 and is now a real variant covered by the loop above.
        assert_eq!(EngineKind::parse("cursor"), None);
        assert_eq!(EngineKind::parse(""), None);
    }

    // The engine slot is invisible unless the CLI is found, so detection failing is the
    // same thing as the feature not existing. nvm is the case that broke: it keeps a bin
    // directory per node version, and `npm i -g` on this machine put codex inside one.
    #[test]
    fn candidate_paths_cover_the_version_managed_install_dirs() {
        let home = std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default());
        for kind in EngineKind::ALL {
            let paths = candidate_paths(kind);
            assert!(
                paths.iter().all(|p| p.file_name().unwrap() == kind.binary()),
                "every candidate must end in the binary's own name"
            );
            assert!(paths.iter().any(|p| p.starts_with(home.join(".local/bin"))));
            assert!(paths.iter().any(|p| p.starts_with("/opt/homebrew/bin")));
        }
    }

    // §2.2 / §2.4 probe 2: the whitelist is the whole security story of this module, so
    // assert its shape rather than trusting the constant to stay put. A regression here
    // would hand a subprocess Bash on the user's machine.
    #[test]
    fn run_args_only_ever_allow_spool_tools() {
        let args = claude_args("提炼一下", "/tmp/cfg.json", 12, false, None);
        let pos = |flag: &str| args.iter().position(|a| a == flag).expect(flag);
        let whitelist = &args[pos("--allowedTools") + 1];
        // ⚠️ No wildcard: claude 2.0.50 does not expand one, and a `*` here means every
        // call is denied at runtime (verified 2026-08-05). Names must be spelled out.
        assert!(!whitelist.contains('*'), "a wildcard is silently denied at runtime");
        let listed: Vec<&str> = whitelist.split(',').collect();
        assert_eq!(listed.len(), ALLOWED_TOOL_NAMES.len());
        // Every entry is one of Spool's own tools — nothing else can be reached.
        for tool in &listed {
            let bare = tool.strip_prefix("mcp__spool__").expect("only spool tools");
            assert!(ALLOWED_TOOL_NAMES.contains(&bare), "{bare} is not a Spool tool");
        }
        assert!(listed.contains(&"mcp__spool__distill"));
        assert_eq!(args[pos("--output-format") + 1], "stream-json");
        // stream-json is REFUSED under --print without this (measured 2026-08-07), so a
        // silent drop here would break every claude run.
        assert!(args.iter().any(|a| a == "--verbose"));
        assert!(args.iter().any(|a| a == "--include-partial-messages"));
        // Without this the run also loads the user's own MCP servers — billed context for
        // tools the whitelist then denies. codex's equivalent is --ignore-user-config.
        assert!(args.iter().any(|a| a == "--strict-mcp-config"));
        assert_eq!(args[pos("--max-turns") + 1], "12");
        assert_eq!(args[pos("--mcp-config") + 1], "/tmp/cfg.json");
        assert_eq!(args[pos("-p") + 1], "提炼一下");
        // W3-c. No pick means no flag at all — never a default of Spool's choosing, which
        // would silently override whatever the user's account is set to.
        assert!(!args.iter().any(|a| a == "--model"));
        let picked = claude_args("提炼一下", "/tmp/cfg.json", 12, false, Some("haiku"));
        assert_eq!(picked[picked.iter().position(|a| a == "--model").unwrap() + 1], "haiku");
        // The offered aliases, and only aliases: a pinned id rots when the model retires.
        for m in CLAUDE_MODELS {
            assert!(!m.contains('-'), "{m} looks like a pinned model id, not an alias");
        }
        // The escape hatches must never appear, whatever else gets added later.
        for forbidden in [
            "--dangerously-skip-permissions",
            "--allowedTools=Bash",
            "--permission-mode",
        ] {
            assert!(!args.iter().any(|a| a == forbidden), "{forbidden} must never be passed");
        }
        // Exactly one whitelist flag — a second one would silently widen the first.
        assert_eq!(args.iter().filter(|a| *a == "--allowedTools").count(), 1);
    }

    // §7.3, and the same job the test above does for claude. Every flag asserted here was
    // run against codex-cli 0.146.1 on 2026-08-06 — `--strict-config` rejects unknown
    // config keys, so the overrides below are known-good rather than plausible.
    #[test]
    fn codex_args_isolate_the_run_from_the_users_own_config() {
        let args = codex_args("提炼一下", "/Applications/Spool.app/Contents/MacOS/spool", "/tmp/m.txt", false);
        assert_eq!(args[0], "exec");
        // The prompt is positional and must stay last — anything after it would be read as
        // a subcommand, not a flag.
        assert_eq!(args.last().unwrap(), "提炼一下");
        let has = |f: &str| args.iter().any(|a| a == f);
        // THE boundary flag: without it the run inherits every MCP server, plugin and
        // browser driver in ~/.codex/config.toml. Auth survives it (verified).
        assert!(has("--ignore-user-config"), "the user's own config must not load");
        assert!(has("--skip-git-repo-check"), "Spool does not run from a git repo");
        // The only lever codex offers in place of a tool whitelist.
        let sandbox = args.iter().position(|a| a == "--sandbox").expect("--sandbox");
        assert_eq!(args[sandbox + 1], "read-only");
        assert!(has("--json"));
        let out = args.iter().position(|a| a == "-o").expect("-o");
        assert_eq!(args[out + 1], "/tmp/m.txt");

        let overrides: Vec<&String> = args
            .iter()
            .enumerate()
            .filter(|(i, _)| *i > 0 && args[i - 1] == "-c")
            .map(|(_, a)| a)
            .collect();
        assert!(overrides.iter().any(|o| o.as_str() == "approval_policy=\"never\""),
            "a headless run must never wait for an approval nobody can give");
        assert!(overrides
            .iter()
            .any(|o| o.starts_with("mcp_servers.spool.command=\"/Applications/Spool.app")));
        assert!(overrides.iter().any(|o| o.as_str() == "mcp_servers.spool.args=[\"--mcp\"]"));
        // The whitelist, same constant as claude's — a tool absent from it cannot be
        // reached, and one added to mcp.rs without being added there simply will not work.
        let tools = overrides
            .iter()
            .find(|o| o.starts_with("mcp_servers.spool.enabled_tools="))
            .expect("the tool allow list must be passed");
        for t in ALLOWED_TOOL_NAMES {
            assert!(tools.contains(&format!("\"{t}\"")), "{t} missing from enabled_tools");
        }
        assert_eq!(tools.matches('"').count(), ALLOWED_TOOL_NAMES.len() * 2);
        // The escape hatches, in this CLI's spelling.
        for forbidden in [
            "--dangerously-bypass-approvals-and-sandbox",
            "--dangerously-bypass-hook-trust",
            "--full-auto",
            "danger-full-access",
            "workspace-write",
        ] {
            assert!(!args.iter().any(|a| a == forbidden), "{forbidden} must never be passed");
        }
    }

    // Verbatim from the first codex run that ever completed (2026-08-10, the distill action
    // against a copy of the real library). Until that run, what codex reported about its own
    // spend was unknown and deliberately left unparsed — DESIGN_WORKBENCH §5's open item.
    #[test]
    fn codex_usage_is_read_from_the_turn_completed_event() {
        let stream = concat!(
            r#"{"type":"thread.started","thread_id":"019fdd7a"}"#,
            "\n",
            r#"{"type":"turn.started"}"#,
            "\n",
            r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"到今天为止…"}}"#,
            "\n",
            r#"{"type":"turn.completed","usage":{"input_tokens":22691,"cached_input_tokens":11008,"cache_write_input_tokens":0,"output_tokens":288,"reasoning_output_tokens":106}}"#,
        );
        let usage = parse_codex_usage(stream);
        // Input arrives split three ways; the sum is what the run actually read.
        assert_eq!(usage.input_tokens, Some(22691 + 11008));
        // Reasoning tokens bill as output and never appear in the answer — omitting them
        // would under-report the run.
        assert_eq!(usage.output_tokens, Some(288 + 106));
        // ⚠️ Measured absences, not oversights: codex reports neither dollars nor which model
        // ran. A zero here would read as "this run was free" on a paid subscription.
        assert_eq!(usage.cost_usd, None);
        assert_eq!(usage.model, None);
    }

    // A run that never reached `turn.completed` (cancelled, timed out, failed) must report
    // nothing rather than zeros — "0 tokens" and "not known" are different claims.
    #[test]
    fn codex_usage_is_absent_when_the_turn_did_not_complete() {
        let usage = parse_codex_usage(r#"{"type":"turn.started"}"#);
        assert_eq!(usage.input_tokens, None);
        assert_eq!(usage.output_tokens, None);
    }

    // §7.3's third column, and the same job the two tests above do. Every flag asserted here
    // was run against gemini-cli 0.54.4 on 2026-08-10 against a copy of a real library.
    #[test]
    fn gemini_args_name_the_one_server_that_may_be_reached() {
        let args = gemini_args("提炼一下", None);
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], "提炼一下");
        let has = |f: &str| args.iter().any(|a| a == f);
        let after = |f: &str| {
            let i = args.iter().position(|a| a == f).unwrap_or_else(|| panic!("{f} missing"));
            args[i + 1].clone()
        };
        assert_eq!(after("-o"), "json");
        // Headless: nobody can answer a prompt, so an approval mode that asks would hang
        // inside a budget that is billing.
        assert_eq!(after("--approval-mode"), "yolo");
        // ⚠️ THE boundary flag on this engine. gemini has no --strict-mcp-config and no
        // --ignore-user-config, so the user's own MCP servers ARE loaded and started; naming
        // ours is the only thing keeping their tools away from the model (§7.8.6).
        assert_eq!(after("--allowed-mcp-server-names"), MCP_SERVER_NAME);
        // No model unless asked: "whatever the account defaults to" is a choice Spool
        // declines to make for the user, same as claude.
        assert!(!has("-m"));
        assert_eq!(gemini_args("x", Some("gemini-3-flash-preview")).last().unwrap(), "gemini-3-flash-preview");
    }

    // The settings file IS the configuration on this engine — there is no --mcp-config to
    // pass, so everything security-relevant lives in these few fields.
    #[test]
    fn gemini_settings_carry_both_whitelists() {
        let v: serde_json::Value =
            serde_json::from_str(&gemini_settings_json("/Applications/Spool.app/x", false)).unwrap();
        let server = &v["mcpServers"][MCP_SERVER_NAME];
        assert_eq!(server["command"], "/Applications/Spool.app/x");
        assert_eq!(server["args"][0], "--mcp");
        // An untrusted server is configured and never started — silently, which is why this
        // is asserted rather than assumed.
        assert_eq!(server["trust"], true);
        let include = server["includeTools"].as_array().expect("includeTools");
        assert_eq!(include.len(), ALLOWED_TOOL_NAMES.len());
        for t in ALLOWED_TOOL_NAMES {
            assert!(include.iter().any(|x| x == t), "{t} missing from includeTools");
        }
        // ⚠️ Opposite polarity to claude's allow list: gemini's built-ins are ON unless
        // excluded, so the dangerous ones must be named one by one.
        let excluded: Vec<&str> =
            v["tools"]["exclude"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
        for t in ["run_shell_command", "write_file", "replace", "read_file"] {
            assert!(excluded.contains(&t), "{t} must not be reachable");
        }
        // Web tools are granted per action, exactly as claude's are.
        assert!(excluded.contains(&"google_web_search"), "no web unless the action gets it");
        let web: serde_json::Value =
            serde_json::from_str(&gemini_settings_json("/x", true)).unwrap();
        let web_excluded: Vec<&str> =
            web["tools"]["exclude"].as_array().unwrap().iter().map(|x| x.as_str().unwrap()).collect();
        assert!(!web_excluded.contains(&"google_web_search"));
        // …and the shell stays gone even then.
        assert!(web_excluded.contains(&"run_shell_command"));
    }

    // Without this variable gemini treats the working directory as untrusted and disables
    // every MCP server — the run still costs quota and comes back having never seen Spool.
    // Measured 2026-08-10; `--skip-trust` does not substitute.
    #[test]
    fn gemini_run_env_grants_workspace_trust() {
        let env = run_env(EngineKind::Gemini);
        assert!(
            env.iter().any(|(k, v)| *k == "GEMINI_CLI_TRUST_WORKSPACE" && v == "true"),
            "an untrusted workspace silently disables the MCP server",
        );
        // Not granted to the engines that have no such concept.
        for kind in [EngineKind::Claude, EngineKind::Codex] {
            assert!(!run_env(kind).iter().any(|(k, _)| *k == "GEMINI_CLI_TRUST_WORKSPACE"));
        }
    }

    // Verbatim shape from a successful run on 2026-08-10 (thread_health against a copy of
    // the real library). Trimmed to the fields the parser reads.
    #[test]
    fn gemini_envelope_reads_response_and_the_model_that_actually_ran() {
        let out = r#"{
          "session_id": "b69374f5",
          "response": "「升学」项目的体检结果出来了",
          "stats": { "models": {
            "gemini-3.1-pro-preview-customtools": {
              "tokens": {"prompt": 0, "candidates": 0, "total": 0}
            },
            "gemini-3-flash-preview": {
              "tokens": {"prompt": 25000, "candidates": 871, "total": 25871}
            }
          }}
        }"#;
        let env = parse_gemini_envelope(out).expect("a successful envelope");
        assert!(!env.is_error);
        assert_eq!(env.result, "「升学」项目的体检结果出来了");
        // ⚠️ The model that RAN, not the one asked for — `-m` is a request, not a pin, and a
        // fallback leaves the first model in the stats with zero tokens.
        assert_eq!(env.usage.model.as_deref(), Some("gemini-3-flash-preview"));
        assert_eq!(env.usage.input_tokens, Some(25000));
        assert_eq!(env.usage.output_tokens, Some(871));
        // No cost field exists on this CLI. None means the card says 花费未知; a zero would
        // read as "this run was free" on a key that may well be billed.
        assert_eq!(env.usage.cost_usd, None);
    }

    // Verbatim from the run that exhausted the day's quota. The CLI's sentence is the useful
    // one — Spool has nothing better to say than what Google just said.
    #[test]
    fn gemini_quota_failure_passes_the_clis_own_words_through() {
        let out = r#"{"session_id":"9cd68c95","error":{"type":"Error","message":"You have exhausted your daily quota on this model.","code":1}}"#;
        let err = parse_gemini_envelope(out).expect_err("an error envelope must not parse as success");
        assert_eq!(err, "You have exhausted your daily quota on this model.");
    }

    // §7.8.5-2: 跟进 is the only multi-turn agentic action and the one measured to burn a
    // whole day's free quota without finishing, so the gemini slot does not carry it.
    #[test]
    fn only_the_subscription_engines_carry_the_web_action() {
        assert!(EngineKind::Claude.supports_web());
        assert!(EngineKind::Codex.supports_web());
        assert!(!EngineKind::Gemini.supports_web());
    }

    // A path is interpolated into a TOML value, so it has to survive being one.
    #[test]
    fn codex_config_quotes_a_path_as_toml() {
        assert_eq!(toml_string("/Applications/Spool.app/x"), "\"/Applications/Spool.app/x\"");
        assert_eq!(toml_string(r#"/tmp/we"ird\path"#), r#""/tmp/we\"ird\\path""#);
    }

    // Verbatim from a real failed run on 2026-08-06 (the account was out of Codex quota).
    // The user reading that toast needs the CLI's sentence, not a Spool paraphrase.
    #[test]
    fn codex_failure_is_read_out_of_the_event_stream() {
        let stream = concat!(
            r#"{"type":"thread.started","thread_id":"019fd4c5"}"#,
            "\n",
            r#"{"type":"turn.started"}"#,
            "\n",
            r#"{"type":"error","message":"You've hit your usage limit."}"#,
            "\n",
            r#"{"type":"turn.failed","error":{"message":"You've hit your usage limit."}}"#,
            "\n",
        );
        assert_eq!(parse_codex_error(stream).as_deref(), Some("You've hit your usage limit."));
        // A run that said nothing wrong reports nothing wrong.
        assert_eq!(parse_codex_error(r#"{"type":"turn.started"}"#), None);
        // Half a line, or a schema that grew a field, must not fail the run: the success
        // text does not come from here.
        assert_eq!(parse_codex_error("not json\n{\"type\":\"turn.completed\"}"), None);
        assert_eq!(parse_codex_error(""), None);
    }

    // The config names Spool's own binary as the server. If this ever pointed elsewhere,
    // the CLI would be talking to something other than the user's library.
    #[test]
    fn mcp_config_registers_spool_itself() {
        let json = mcp_config_json("/Applications/Spool.app/Contents/MacOS/spool");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        let server = &v["mcpServers"]["spool"];
        assert_eq!(server["command"], "/Applications/Spool.app/Contents/MacOS/spool");
        assert_eq!(server["args"][0], "--mcp");
        assert_eq!(server["args"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn run_output_parsing_reports_success_and_failure() {
        let ok = parse_claude_stream(
            r#"{"type":"result","is_error":false,"result":"归档了 1 块","num_turns":3}"#,
        )
        .unwrap();
        assert!(!ok.is_error);
        assert_eq!(ok.result, "归档了 1 块");
        assert_eq!(ok.num_turns, Some(3));
        // Missing fields default rather than failing — the envelope's shape is the CLI's
        // to change, and a partial answer still tells us whether it errored.
        let sparse = parse_claude_stream(r#"{"type":"result","result":"done"}"#).unwrap();
        assert!(!sparse.is_error);
        // Garbage is a reported failure (§2.3 "输出解析失败"), never a silent success.
        assert!(parse_claude_stream("not json at all").is_err());
        assert!(parse_claude_stream("").is_err());
    }

    // W4 / §9.3 #4. Every line below is verbatim from a real `--output-format stream-json
    // --include-partial-messages` run on 2026-08-07 — §6.2-ter: a subprocess's shape does
    // not count until it has been seen.
    #[test]
    fn stream_lines_become_typing_and_tool_captions() {
        let delta = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1\n2"}},"session_id":"63d3"}"#;
        assert_eq!(
            parse_claude_stream_line(delta),
            Some(Progress::Delta { text: "1\n2".into() })
        );
        let tool = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"mcp__spool__get_pack"}}}"#;
        assert_eq!(
            parse_claude_stream_line(tool),
            Some(Progress::Tool { text: "mcp__spool__get_pack".into() })
        );
        // A text block opening is not a tool, and neither is thinking — the caption would
        // read as an action the run never took.
        let text_start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#;
        assert_eq!(parse_claude_stream_line(text_start), None);
        // Everything else is silence, including shapes that do not exist yet. This decorates
        // a panel; it must never be able to fail a run.
        for line in [
            r#"{"type":"system","subtype":"init","tools":[]}"#,
            r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}}"#,
            "half a line {",
            "",
        ] {
            assert_eq!(parse_claude_stream_line(line), None, "{line}");
        }
    }

    // The JS side reads these off a Tauri event, so the tag and field names are a wire
    // contract between two languages — exactly like EngineKind's lowercase name above, and
    // it fails the same silent way: a rename here does not break the build, it just makes
    // the panel stop typing.
    #[test]
    fn progress_crosses_to_js_as_a_tagged_object() {
        assert_eq!(
            serde_json::to_string(&Progress::Delta { text: "到今天".into() }).unwrap(),
            r#"{"kind":"delta","text":"到今天"}"#
        );
        assert_eq!(
            serde_json::to_string(&Progress::Tool { text: "mcp__spool__get_pack".into() }).unwrap(),
            r#"{"kind":"tool","text":"mcp__spool__get_pack"}"#
        );
    }

    // The measured shape: the LAST line of a streamed run is the same envelope
    // `--output-format json` returns on its own, cost and model included.
    #[test]
    fn a_streamed_run_is_read_from_its_result_line() {
        let stream = concat!(
            r#"{"type":"system","subtype":"init","session_id":"a"}"#,
            "\n",
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}"#,
            "\n",
            r#"{"type":"result","subtype":"success","is_error":false,"result":"OK","total_cost_usd":0.01897925,"usage":{"input_tokens":3,"cache_creation_input_tokens":15165,"cache_read_input_tokens":0,"output_tokens":4},"modelUsage":{"claude-haiku-4-5-20251001":{"costUSD":0.01897925}}}"#,
            "\n",
        );
        let env = parse_claude_stream(stream).unwrap();
        assert_eq!(env.result, "OK");
        assert_eq!(env.usage.cost_usd, Some(0.01897925));
        assert_eq!(env.usage.model.as_deref(), Some("claude-haiku-4-5-20251001"));
        assert_eq!(env.usage.input_tokens, Some(15_168));

        // ⚠️ The retreat §9.3 #4 asked for. A run whose envelope never arrived (killed
        // mid-write, a schema that moved) still did the work the user paid for, so its words
        // come back with the numbers unknown — NOT as a failed run.
        let truncated = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"到今天为止，"}]}}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"这个项目定下来的是……"}]}}"#,
            "\n",
        );
        let salvaged = parse_claude_stream(truncated).unwrap();
        assert_eq!(salvaged.result, "到今天为止，这个项目定下来的是……");
        assert_eq!(salvaged.usage, RunUsage::default());
    }

    // DESIGN_WORKBENCH §5. Ocean 2026-08-06: "对使用了什么模型花了多少额度毫不知情".
    // The numbers were already arriving and being dropped by a struct that named three
    // fields — so the thing to assert is that they survive, and that a CLI which renames or
    // drops them degrades to "unknown" instead of failing an otherwise successful run.
    #[test]
    fn usage_is_read_off_the_envelope_and_missing_fields_degrade_to_unknown() {
        // One line, because that is how it arrives: the envelope is the last LINE of the
        // stream, and a pretty-printed one would never be seen.
        let env = parse_claude_stream(
            r#"{"type":"result","is_error":false,"result":"ok","total_cost_usd":0.0312,"usage":{"input_tokens":4,"cache_creation_input_tokens":12000,"cache_read_input_tokens":3000,"output_tokens":517},"modelUsage":{"claude-opus-4-6":{"costUSD":0.0312}}}"#,
        )
        .unwrap();
        assert_eq!(env.usage.cost_usd, Some(0.0312));
        assert_eq!(env.usage.model.as_deref(), Some("claude-opus-4-6"));
        // Fresh + cache-write + cache-read. `input_tokens` alone would say 4, against a pack
        // of thousands — a number worse than none.
        assert_eq!(env.usage.input_tokens, Some(15_004));
        assert_eq!(env.usage.output_tokens, Some(517));

        // An envelope with none of it is still a good run; the card shows "—".
        let bare = parse_claude_stream(r#"{"type":"result","is_error":false,"result":"ok"}"#).unwrap();
        assert_eq!(bare.usage, RunUsage::default());
        assert_eq!(bare.result, "ok");

        // A partially-recognised shape yields what it can and None for the rest, never an
        // error — the envelope's fields belong to the CLI and may move.
        let partial = parse_claude_stream(
            r#"{"type":"result","result":"ok","usage":{"output_tokens":7},"modelUsage":{}}"#,
        )
        .unwrap();
        assert_eq!(partial.usage.output_tokens, Some(7));
        assert_eq!(partial.usage.input_tokens, None);
        assert_eq!(partial.usage.model, None);
        assert_eq!(partial.usage.cost_usd, None);
    }

    // §1.4: the ceiling exists so an agentic loop cannot run unbounded on the user's
    // subscription. Clamping is the enforcement point.
    #[test]
    fn timeout_is_clamped_to_the_documented_ceiling() {
        assert_eq!(clamp_timeout_secs(0), DEFAULT_TIMEOUT_SECS);
        assert_eq!(clamp_timeout_secs(120), 120);
        assert_eq!(clamp_timeout_secs(DEFAULT_TIMEOUT_SECS), DEFAULT_TIMEOUT_SECS);
        assert_eq!(clamp_timeout_secs(99_999), MAX_TIMEOUT_SECS);
        assert_eq!(clamp_timeout_secs(MAX_TIMEOUT_SECS), MAX_TIMEOUT_SECS);
    }

    // W4's whole point: lines have to arrive WHILE the child is alive. If they only landed
    // at exit this would compile, pass a shape test, and still leave the user staring at a
    // frozen panel for five minutes — 「等待中界面毫无变化」, unchanged.
    #[test]
    fn a_run_is_read_line_by_line_while_it_is_still_going() {
        let _serial = one_run_at_a_time();
        let seen: Arc<Mutex<Vec<(String, Duration)>>> = Arc::new(Mutex::new(Vec::new()));
        let started = std::time::Instant::now();
        let sink = Arc::clone(&seen);
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", "echo first; sleep 1; echo second"]);
        let out = stream_with_timeout(
            cmd,
            Duration::from_secs(10),
            Arc::new(move |line: &str| {
                sink.lock().unwrap().push((line.to_string(), started.elapsed()));
            }),
        )
        .unwrap();
        let lines = seen.lock().unwrap().clone();
        assert_eq!(lines.iter().map(|(l, _)| l.as_str()).collect::<Vec<_>>(), ["first", "second"]);
        assert!(lines[0].1 < Duration::from_millis(700), "the first line waited for exit");
        assert!(started.elapsed() >= Duration::from_secs(1), "the child did not actually run on");
        // Accumulated as well as streamed — the answer is still parsed from the whole text.
        assert_eq!(out.stdout, "first\nsecond\n");
        assert!(out.success);
    }

    // A child whose stderr pipe fills blocks forever, and `claude --verbose` is chatty. The
    // 200KB below is well past the 64KB pipe buffer: without a second draining thread this
    // test hangs rather than fails, which is what it would do to a real run.
    #[test]
    fn a_noisy_stderr_cannot_wedge_the_run() {
        let _serial = one_run_at_a_time();
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", "head -c 200000 /dev/zero | tr '\\0' 'x' >&2; echo done"]);
        let out = stream_with_timeout(cmd, Duration::from_secs(20), Arc::new(|_: &str| {})).unwrap();
        assert_eq!(out.stdout.trim(), "done");
        assert_eq!(out.stderr.len(), 200_000);
    }

    // A probe that never returns must not wedge the settings page.
    #[test]
    fn output_with_timeout_kills_a_hung_child() {
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", "sleep 30"]);
        let started = std::time::Instant::now();
        let err = output_with_timeout(cmd, Duration::from_millis(300)).unwrap_err();
        assert!(err.contains("timed out"), "{err}");
        assert!(started.elapsed() < Duration::from_secs(5), "the child was not killed promptly");
    }

    // §1.2 (M2): the pill is clickable, so a run has to actually stop — well inside its
    // own budget, and reported as a cancel rather than as a failure. A grandchild is in
    // the tree on purpose: `claude` spawns MCP servers, and killing only the process the
    // parent knows about would leave one of them holding the user's library open.
    #[test]
    #[cfg(unix)]
    fn a_run_can_be_cancelled_and_takes_its_children_with_it() {
        let _serial = one_run_at_a_time();
        use std::os::unix::process::CommandExt;
        let marker = std::env::temp_dir()
            .join(format!("spool-cancel-probe-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_file(&marker);
        let script = format!(
            // The grandchild outlives its parent unless the whole group is signalled, and
            // it is what writes the file. A file present at the end means the kill leaked.
            "( sleep 1; touch '{}' ) & sleep 30",
            marker.display()
        );
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", &script]);
        unsafe {
            cmd.pre_exec(|| {
                if libc::setpgid(0, 0) == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        // The cancel arrives from another thread, exactly as the Tauri command does.
        let stopper = std::thread::spawn(|| {
            // Long enough for the run to have published its pid, short enough that a
            // broken cancel is caught by the assertion below instead of by the budget.
            std::thread::sleep(Duration::from_millis(250));
            assert!(request_cancel(), "there was a run to cancel");
        });
        let started = std::time::Instant::now();
        let err = stream_with_timeout(cmd, Duration::from_secs(20), Arc::new(|_: &str| {}))
            .err()
            .expect("a cancelled run must not report success");
        stopper.join().unwrap();
        assert_eq!(err, CANCELLED_MARKER, "a cancel is not a failure to apologise for");
        assert!(started.elapsed() < Duration::from_secs(5), "the cancel did not take effect");
        // The published pid is cleared, so the next cancel cannot aim at a dead process.
        assert!(!request_cancel(), "nothing should still be registered as running");
        // Give the leaked grandchild every chance to prove it survived.
        std::thread::sleep(Duration::from_millis(1200));
        assert!(!marker.exists(), "a child of the cancelled run outlived the kill");
        let _ = std::fs::remove_file(&marker);
    }
}
