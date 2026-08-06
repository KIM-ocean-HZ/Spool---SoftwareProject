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
}

impl EngineKind {
    /// Preference order when both are installed (§7.4): `claude` first — more capable, and
    /// the users who already have an engine slot today are on it.
    pub const ALL: [EngineKind; 2] = [EngineKind::Claude, EngineKind::Codex];

    pub fn as_str(self) -> &'static str {
        match self {
            EngineKind::Claude => "claude",
            EngineKind::Codex => "codex",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(EngineKind::Claude),
            "codex" => Some(EngineKind::Codex),
            _ => None,
        }
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

// A child process that must not outlive its budget. `Command::output()` blocks with no
// timeout of its own, so probes go through here: spawn, wait with a deadline, kill on
// expiry. Polling rather than a thread per call — these are sub-second in practice, and
// the settings page calls them on every refresh.
//
// `cancellable` is what separates the two kinds of caller. A version probe is a 5-second
// affair nobody asks to stop; a run is minutes long, and while it is up its process group
// is published so request_cancel can reach it. Probes must NOT publish theirs — a probe
// racing a run would otherwise overwrite the pid the cancel button aims at.
fn output_with_timeout(
    mut cmd: std::process::Command,
    budget: Duration,
    cancellable: bool,
) -> Result<std::process::Output, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    if cancellable {
        CANCELLED.store(false, Ordering::SeqCst);
        RUNNING_PGID.store(child.id() as i32, Ordering::SeqCst);
    }
    // Whatever happens below — normal exit, timeout, cancel, an error reading the pipe —
    // the published pid has to go. A stale one aims the next cancel at a pid the OS may
    // have handed to something else entirely.
    let clear = || {
        if cancellable {
            RUNNING_PGID.store(0, Ordering::SeqCst);
        }
    };
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Err(e) => {
                clear();
                return Err(e.to_string());
            }
            Ok(Some(_)) => {
                clear();
                // A cancelled child usually exits before this poll notices, so the flag —
                // not the exit status — is what decides the message.
                if cancellable && CANCELLED.swap(false, Ordering::SeqCst) {
                    let _ = child.wait_with_output();
                    return Err(CANCELLED_MARKER.to_string());
                }
                return child.wait_with_output().map_err(|e| e.to_string());
            }
            Ok(None) => {
                if cancellable && CANCELLED.load(Ordering::SeqCst) {
                    kill_group(child.id() as i32);
                    let _ = child.wait();
                    clear();
                    CANCELLED.store(false, Ordering::SeqCst);
                    return Err(CANCELLED_MARKER.to_string());
                }
                if start.elapsed() >= budget {
                    if cancellable {
                        kill_group(child.id() as i32);
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                    clear();
                    return Err(format!("timed out after {}s", budget.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
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
    if let Ok(out) = output_with_timeout(which, PROBE_TIMEOUT, false) {
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
        if let Ok(out) = output_with_timeout(cmd, PROBE_TIMEOUT, false) {
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

/// The argv for one headless `claude` run, minus the binary itself. Split out from spawning
/// so the permission-critical parts (§2.4 probe 2: no tool outside the Spool whitelist can
/// be reached) are assertable in a unit test without a live CLI.
pub fn claude_args(prompt: &str, config_path: &str, max_turns: u32, web: bool) -> Vec<String> {
    vec![
        "-p".into(),
        prompt.into(),
        "--mcp-config".into(),
        config_path.into(),
        "--allowedTools".into(),
        allowed_tools(web),
        "--output-format".into(),
        "json".into(),
        "--max-turns".into(),
        max_turns.to_string(),
    ]
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
pub fn run_env(kind: EngineKind) -> Vec<(&'static str, std::ffi::OsString)> {
    let mut keys: Vec<&'static str> = vec!["PATH", "HOME", "USER"];
    if kind == EngineKind::Codex {
        keys.push("CODEX_HOME");
    }
    keys.into_iter()
        .filter_map(|k| std::env::var_os(k).map(|v| (k, v)))
        .collect()
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

/// `claude -p --output-format json` answers with an envelope carrying the final assistant
/// text plus run metadata. Blocks it wrote are already in the database via MCP — this text
/// is never a second write path; it is what the user reads on the run card.
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
/// ⚠️ **Measured only as far as "the field names exist".** `total_cost_usd`, `modelUsage`
/// and `cache_read_input_tokens` are all present as strings in the claude 2.0.50 binary
/// (checked 2026-08-06 without spending a model call), but the exact nesting has NOT been
/// confirmed against a live envelope — that costs a run, and DESIGN_AI_ENGINE §7.2 says a
/// table cell is not filled in until it has been. Hence: every lookup is a miss-tolerant
/// `Option`, and a shape we do not recognise yields `None` rather than an error. Confirm
/// against one real run before showing these numbers as authoritative.
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

pub fn parse_run_output(stdout: &str) -> Result<RunEnvelope, String> {
    let value = serde_json::from_str::<serde_json::Value>(stdout.trim())
        .map_err(|e| format!("could not read the CLI's JSON output: {e}"))?;
    let mut env = serde_json::from_value::<RunEnvelope>(value.clone())
        .map_err(|e| format!("could not read the CLI's JSON output: {e}"))?;
    env.usage = parse_usage(&value);
    Ok(env)
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
pub fn run_action(
    preferred: Option<EngineKind>,
    prompt: &str,
    timeout_secs: u64,
    max_turns: u32,
    web: bool,
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
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir();
    // One file per process, which is also one per run given the guard above. Rewritten at
    // the start of every run and deleted at the end, so a stale copy left by a killed run
    // is overwritten rather than inherited.
    let cfg_path = tmp.join(format!("spool-mcp-{}.json", std::process::id()));
    // codex writes its final message here instead of Spool parsing it out of the event
    // stream; claude never touches it.
    let msg_path = tmp.join(format!("spool-engine-msg-{}.txt", std::process::id()));

    let mut cmd = std::process::Command::new(bin);
    match kind {
        EngineKind::Claude => {
            std::fs::write(&cfg_path, mcp_config_json(&exe.to_string_lossy()))
                .map_err(|e| format!("could not write the MCP config: {e}"))?;
            cmd.args(claude_args(prompt, &cfg_path.to_string_lossy(), max_turns, web));
        }
        EngineKind::Codex => {
            // A leftover from a killed run would otherwise be read back as this run's
            // answer — the file is only written when the CLI has something to say.
            let _ = std::fs::remove_file(&msg_path);
            cmd.args(codex_args(prompt, &exe.to_string_lossy(), &msg_path.to_string_lossy(), web));
        }
    }
    cmd.env_clear();
    for (k, v) in run_env(kind) {
        cmd.env(k, v);
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
    let result =
        output_with_timeout(cmd, Duration::from_secs(clamp_timeout_secs(timeout_secs)), true);
    // Delete the config before returning down either path — it names an executable, and
    // leaving it in /tmp serves nothing.
    let _ = std::fs::remove_file(&cfg_path);

    let out = result?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let finish = |r: Result<(EngineKind, RunEnvelope), String>| {
        let _ = std::fs::remove_file(&msg_path);
        r
    };
    if !out.status.success() {
        // §2.3: the CLI's own words are the most useful thing here (not logged in, over
        // quota, …), so pass them through instead of inventing a message. For codex those
        // words are in the event stream, not on stderr — stderr carries log noise.
        let said = match kind {
            EngineKind::Codex => parse_codex_error(&stdout),
            EngineKind::Claude => None,
        };
        return finish(Err(said.unwrap_or_else(|| {
            if stderr.is_empty() { stdout.trim().to_string() } else { stderr }
        })));
    }
    match kind {
        EngineKind::Claude => {
            let env = parse_run_output(&stdout)?;
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
            // ⚠️ Usage is left empty here on purpose. Where codex reports cost in its event
            // stream — or whether it does — has NOT been measured, and inventing a field
            // name would put a fabricated number in front of the user. Finding out needs one
            // run that completes, and this account's codex quota is out until 2026-09-04
            // (DESIGN_WORKBENCH §5). Until then the card shows "—" for a codex run.
            let result = std::fs::read_to_string(&msg_path).unwrap_or_default().trim().to_string();
            finish(Ok((
                kind,
                RunEnvelope { is_error: false, result, num_turns: None, usage: RunUsage::default() },
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(EngineKind::parse("gemini"), None);
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
        let args = claude_args("提炼一下", "/tmp/cfg.json", 12, false);
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
        assert_eq!(args[pos("--output-format") + 1], "json");
        assert_eq!(args[pos("--max-turns") + 1], "12");
        assert_eq!(args[pos("--mcp-config") + 1], "/tmp/cfg.json");
        assert_eq!(args[pos("-p") + 1], "提炼一下");
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
        let ok = parse_run_output(r#"{"is_error":false,"result":"归档了 1 块","num_turns":3}"#)
            .unwrap();
        assert!(!ok.is_error);
        assert_eq!(ok.result, "归档了 1 块");
        assert_eq!(ok.num_turns, Some(3));
        // Missing fields default rather than failing — the envelope's shape is the CLI's
        // to change, and a partial answer still tells us whether it errored.
        let sparse = parse_run_output(r#"{"result":"done"}"#).unwrap();
        assert!(!sparse.is_error);
        // Garbage is a reported failure (§2.3 "输出解析失败"), never a silent success.
        assert!(parse_run_output("not json at all").is_err());
        assert!(parse_run_output("").is_err());
    }

    // DESIGN_WORKBENCH §5. Ocean 2026-08-06: "对使用了什么模型花了多少额度毫不知情".
    // The numbers were already arriving and being dropped by a struct that named three
    // fields — so the thing to assert is that they survive, and that a CLI which renames or
    // drops them degrades to "unknown" instead of failing an otherwise successful run.
    #[test]
    fn usage_is_read_off_the_envelope_and_missing_fields_degrade_to_unknown() {
        let env = parse_run_output(
            r#"{"is_error":false,"result":"ok","total_cost_usd":0.0312,
                "usage":{"input_tokens":4,"cache_creation_input_tokens":12000,
                         "cache_read_input_tokens":3000,"output_tokens":517},
                "modelUsage":{"claude-opus-4-6":{"costUSD":0.0312}}}"#,
        )
        .unwrap();
        assert_eq!(env.usage.cost_usd, Some(0.0312));
        assert_eq!(env.usage.model.as_deref(), Some("claude-opus-4-6"));
        // Fresh + cache-write + cache-read. `input_tokens` alone would say 4, against a pack
        // of thousands — a number worse than none.
        assert_eq!(env.usage.input_tokens, Some(15_004));
        assert_eq!(env.usage.output_tokens, Some(517));

        // An envelope with none of it is still a good run; the card shows "—".
        let bare = parse_run_output(r#"{"is_error":false,"result":"ok"}"#).unwrap();
        assert_eq!(bare.usage, RunUsage::default());
        assert_eq!(bare.result, "ok");

        // ⚠️ The exact nesting above is NOT confirmed against a live envelope (see
        // parse_usage). A partially-recognised shape must therefore yield what it can and
        // None for the rest, never an error.
        let partial =
            parse_run_output(r#"{"result":"ok","usage":{"output_tokens":7},"modelUsage":{}}"#)
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

    // A probe that never returns must not wedge the settings page.
    #[test]
    fn output_with_timeout_kills_a_hung_child() {
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", "sleep 30"]);
        let started = std::time::Instant::now();
        let err = output_with_timeout(cmd, Duration::from_millis(300), false).unwrap_err();
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
        let err = output_with_timeout(cmd, Duration::from_secs(20), true).unwrap_err();
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
