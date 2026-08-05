//! DESIGN_AI_ENGINE — the Claude Code engine slot (target v0.4.0, M1).
//!
//! One sentence: when the user already has the Claude Code CLI installed, Spool offers
//! "let AI maintain this thread"; behind it, `claude -p` runs headless with Spool's own
//! MCP server attached. The GUI curates, the CLI is the engine, MCP is the bus. Cost
//! rides on the user's existing Claude subscription — Spool never holds an API key.
//!
//! The three premises this module must not weaken (design §0):
//!   * **Zero AI in the product itself.** If `claude` is absent, every entry point stops
//!     rendering and Spool is complete without it. Detection failure is not an error
//!     state; it is the default state.
//!   * **Spool itself never goes online.** Egress happens inside the Claude Code process
//!     — a tool the user installed, logged into and trusts. The webview's CSP is not
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

fn allowed_tools() -> String {
    ALLOWED_TOOL_NAMES
        .iter()
        .map(|t| format!("mcp__{MCP_SERVER_NAME}__{t}"))
        .collect::<Vec<_>>()
        .join(",")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineStatus {
    /// Whether a usable `claude` was found. The GUI renders the maintenance actions only
    /// when this is true AND both MCP switches are on (§1.1).
    pub available: bool,
    /// Version string as the CLI reported it, for the settings status line.
    pub version: Option<String>,
    /// Absolute path we resolved, so the settings page can show what it actually found.
    pub path: Option<String>,
}

impl EngineStatus {
    fn missing() -> Self {
        Self { available: false, version: None, path: None }
    }
}

// `claude --version` prints something like "2.0.50 (Claude Code)". Keep the leading
// version token and drop the rest — the status line wants `claude 2.0.50 ✓`, and the
// parenthetical is noise. Deliberately lenient: an unparseable line still counts as
// available (the binary answered), because the version is cosmetic here. §2.1 leaves the
// minimum version to be set from real-world testing, so nothing is gated on it yet.
fn parse_version(out: &str) -> Option<String> {
    let first = out.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    Some(first.split_whitespace().next().unwrap_or(first).to_string())
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

// The PATH a GUI app inherits on macOS is the launchd one, not the shell's — a `claude`
// installed by npm/homebrew into ~/.local/bin or /opt/homebrew/bin is on the user's shell
// PATH and invisible here. So the probe checks the usual install locations directly as
// well, and reports the path it actually resolved (§1.4 shows it in the status line).
fn candidate_paths() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    if let Some(home) = dirs_home() {
        for rel in [".claude/local/claude", ".local/bin/claude", ".npm-global/bin/claude", "bin/claude"] {
            out.push(home.join(rel));
        }
    }
    for abs in ["/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude"] {
        out.push(std::path::PathBuf::from(abs));
    }
    out
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
}

/// §2.1: `which claude` first (honours a PATH the user did set for us), then the known
/// install locations. The first candidate that answers `--version` wins.
pub fn detect() -> EngineStatus {
    let mut tried: Vec<String> = Vec::new();
    let mut which = std::process::Command::new("/usr/bin/which");
    which.arg("claude");
    if let Ok(out) = output_with_timeout(which, PROBE_TIMEOUT, false) {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                tried.push(p);
            }
        }
    }
    for p in candidate_paths() {
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
                return EngineStatus {
                    available: true,
                    version: parse_version(&text),
                    path: Some(path),
                };
            }
        }
    }
    EngineStatus::missing()
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

/// The argv for one headless run, minus the binary itself. Split out from spawning so the
/// permission-critical parts (§2.4 probe 2: no tool outside the Spool whitelist can be
/// reached) are assertable in a unit test without a live CLI.
pub fn run_args(prompt: &str, config_path: &str, max_turns: u32) -> Vec<String> {
    vec![
        "-p".into(),
        prompt.into(),
        "--mcp-config".into(),
        config_path.into(),
        "--allowedTools".into(),
        allowed_tools(),
        "--output-format".into(),
        "json".into(),
        "--max-turns".into(),
        max_turns.to_string(),
    ]
}

/// `claude -p --output-format json` answers with an envelope carrying the final assistant
/// text plus run metadata. Only two things matter to Spool: did it fail, and what did it
/// say. Blocks it wrote are already in the database via MCP — this text is for the toast,
/// never a second write path.
#[derive(Debug, Clone, Deserialize)]
pub struct RunEnvelope {
    #[serde(default)]
    pub is_error: bool,
    #[serde(default)]
    pub result: String,
    #[serde(default)]
    pub num_turns: Option<u32>,
}

pub fn parse_run_output(stdout: &str) -> Result<RunEnvelope, String> {
    serde_json::from_str::<RunEnvelope>(stdout.trim())
        .map_err(|e| format!("could not read the CLI's JSON output: {e}"))
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
pub fn run_action(prompt: &str, timeout_secs: u64, max_turns: u32) -> Result<RunEnvelope, String> {
    // Serial, enforced HERE and not only in the queue that calls it. The queue lives in
    // one window's JS; a second window, or a hand-issued invoke, would otherwise start a
    // second run — and RUNNING_PGID holds exactly one process group, so the cancel button
    // would end up aimed at whichever run published last while the other kept billing.
    // (Found in the 2026-08-05 self-review: the TS queue was the only thing holding this.)
    if RUNNING_PGID.load(Ordering::SeqCst) != 0 {
        return Err("a maintenance run is already in flight".into());
    }
    let status = detect();
    let (Some(bin), true) = (status.path.as_deref(), status.available) else {
        return Err("Claude Code CLI not found".into());
    };
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let cfg_dir = std::env::temp_dir();
    // One file per process, which is also one per run given the guard above. It is
    // rewritten at the start of every run and deleted at the end, so a stale copy left by
    // a killed run is overwritten rather than inherited.
    let cfg_path = cfg_dir.join(format!("spool-mcp-{}.json", std::process::id()));
    std::fs::write(&cfg_path, mcp_config_json(&exe.to_string_lossy()))
        .map_err(|e| format!("could not write the MCP config: {e}"))?;

    let mut cmd = std::process::Command::new(bin);
    cmd.args(run_args(prompt, &cfg_path.to_string_lossy(), max_turns));
    // §2.2 minimal env: PATH and HOME only. HOME is not optional — the CLI's login state
    // lives under it, and without it every run fails as "not authenticated".
    cmd.env_clear();
    if let Some(path) = std::env::var_os("PATH") {
        cmd.env("PATH", path);
    }
    if let Some(home) = std::env::var_os("HOME") {
        cmd.env("HOME", home);
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
    if !out.status.success() {
        // §2.3: the CLI's own words are the most useful thing here (not logged in, over
        // quota, …), so pass them through instead of inventing a message.
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() { stdout.trim().to_string() } else { stderr });
    }
    let env = parse_run_output(&stdout)?;
    if env.is_error {
        return Err(if env.result.is_empty() { "the CLI reported a failure".into() } else { env.result });
    }
    Ok(env)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_parsing_keeps_the_number_and_tolerates_noise() {
        assert_eq!(parse_version("2.0.50 (Claude Code)"), Some("2.0.50".into()));
        assert_eq!(parse_version("  2.1.0\n"), Some("2.1.0".into()));
        // Unparseable but non-empty still yields something — availability is decided by
        // the binary answering, not by the shape of this string.
        assert_eq!(parse_version("weird"), Some("weird".into()));
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("   "), None);
    }

    #[test]
    fn missing_status_renders_nothing() {
        let s = EngineStatus::missing();
        assert!(!s.available);
        assert!(s.version.is_none() && s.path.is_none());
    }

    // §2.2 / §2.4 probe 2: the whitelist is the whole security story of this module, so
    // assert its shape rather than trusting the constant to stay put. A regression here
    // would hand a subprocess Bash on the user's machine.
    #[test]
    fn run_args_only_ever_allow_spool_tools() {
        let args = run_args("提炼一下", "/tmp/cfg.json", 12);
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

