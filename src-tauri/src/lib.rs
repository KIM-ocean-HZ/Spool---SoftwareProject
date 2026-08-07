mod capture;
#[cfg(target_os = "macos")]
mod double_tap;
pub mod engine;
pub mod mcp;
pub mod overlay;

use tauri::Manager;

// §20.12: the Settings panel shows a copy-paste MCP client config pointing at THIS
// binary — resolved at runtime so dev builds and the installed .app both show a path
// that actually works.
#[tauri::command]
fn mcp_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

// DESIGN_AI_ENGINE §1.4 / §2.1: the settings status line and the render gate for the
// "let AI maintain" actions. Absent CLI is the default state, not an error — the caller
// simply renders nothing (§0).
//
// §7.4: `preferred` is the user's engine pick from settings, and it matters only when both
// CLIs are installed. An unrecognised name is treated as "no preference" rather than
// refused: this value crosses from JS, and the cost of being strict about it is a settings
// page that says no engine is available while one sits installed on the machine.
#[tauri::command]
fn ai_engine_status(preferred: Option<String>) -> engine::EngineStatus {
    engine::detect(preferred.as_deref().and_then(engine::EngineKind::parse))
}

/// What one finished run hands back to the GUI (DESIGN_WORKBENCH §4.1).
///
/// It used to be a bare `String`, and the frontend threw that string away for every action
/// but one — so a weekly review the AI had fully written was reported to the user as
/// "跑完了，没有新增块" (§1.1: the prompts say "say it to the user and store it only once
/// they agree", and nobody is there to agree in a headless run). The text is the product of
/// two of the three maintenance actions, so it travels as a named field now, beside what it
/// cost and which model spent it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineRunResult {
    /// The AI's final message — a conclusion, a review, a checkup report.
    result: String,
    /// Which engine actually ran. Resolved in Rust, because a preference naming an
    /// uninstalled engine falls back (DESIGN_AI_ENGINE §7.4).
    engine: String,
    usage: engine::RunUsage,
}

// DESIGN_AI_ENGINE §5 M2: all three actions. The prompt comes from mcp.rs's
// guidance_text — the same constant source as the MCP prompts of the same names (§2.2),
// never a copy, so re-wording one reaches both surfaces.
// Runs on a blocking thread: the CLI takes minutes, and the UI stays live throughout
// (§1.2 — no modal, the user can keep working or switch away).
/// DESIGN_WORKBENCH §9.3 #4 — what the rail shows while the run is still going.
///
/// One event name for the whole feature: the frontend appends deltas and swaps the caption
/// on a tool. Emitted from the reader thread, so it arrives while the CLI is still typing —
/// that is the entire difference from before, when the first thing the UI heard about a run
/// was that it had finished.
const PROGRESS_EVENT: &str = "engine:progress";

#[tauri::command]
async fn ai_engine_run(
    app: tauri::AppHandle,
    action: String,
    project: String,
    timeout_secs: u64,
    engine: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<EngineRunResult, String> {
    // An unknown name is refused outright rather than falling through to a default: a
    // typo that silently ran a different action against the user's library would be worse
    // than an error nobody sees.
    if !matches!(
        action.as_str(),
        "distill" | "thread_health" | "weekly_review" | "follow_up_brief" | "follow_up"
    ) {
        return Err(format!("unsupported action: {action}"));
    }
    // DESIGN_FOLLOW_UP §2.5-3: reaching the open web is granted to ONE action and nothing
    // else. Decided HERE, from the action name, rather than passed in from JS — a caller
    // that could ask for web access would be a caller that could ask for it while running
    // 去重. Note that drafting the brief does NOT get it: that job is "read this project
    // and say what about it needs outside evidence", which is answerable from the library
    // alone.
    let web = action == "follow_up";
    tauri::async_runtime::spawn_blocking(move || {
        // 周回顾 is the one action that is not about the thread it was started from —
        // it reads the whole library's digest (§1.1). Passing a project would not narrow
        // it, it would just be ignored, so it is not passed.
        let args = if action == "weekly_review" {
            serde_json::json!({})
        } else {
            serde_json::json!({ "project": project })
        };
        let prompt = mcp::guidance_text(&action, &args)?;
        // max_turns: the agentic loop needs a few turns (read the material, then write one
        // block); 12 is generous for that and still a hard stop. A follow-up spends turns
        // searching before it has anything to propose, so it gets more — still a ceiling,
        // just one that fits the job. Reaches claude only: codex has no equivalent flag,
        // so there the timeout is the whole ceiling (§7.3).
        let max_turns = if web { 24 } else { 12 };
        let preferred = engine.as_deref().and_then(engine::EngineKind::parse);
        // W3-c: an unrecognised model name is dropped rather than passed on. This value
        // crosses from settings.json, which the user edits by hand, and a typo reaching
        // `--model` would fail the run with a CLI error about a flag they never typed.
        let model = model.filter(|m| engine::CLAUDE_MODELS.contains(&m.as_str()));
        // §9.13, same rule as the model above and for the same reason — settings.json is
        // hand-editable. Unlike `--model`, a bad effort value would not even fail: claude
        // silently ignores anything outside its three words, so a typo would just quietly
        // not do what the user asked. Filtered here so the picker's promise is the truth.
        let effort = effort.filter(|e| engine::CLAUDE_EFFORTS.contains(&e.as_str()));
        let emit = std::sync::Arc::new(move |p: engine::Progress| {
            use tauri::Emitter;
            let _ = app.emit(PROGRESS_EVENT, p);
        });
        engine::run_action(
            preferred,
            &prompt,
            timeout_secs,
            max_turns,
            web,
            model.as_deref(),
            effort.as_deref(),
            emit,
        )
            .map(|(kind, env)| EngineRunResult {
                result: env.result,
                engine: kind.as_str().to_string(),
                usage: env.usage,
            })
    })
    .await
    .map_err(|e| e.to_string())?
}

// §1.2: the running pill is clickable, and this is what it calls. Returns whether there
// was anything to stop — a click that lands just after the run finished is not an error.
// Blocks the AI already wrote stay where they are (append-only, §2.3): stopping is not
// undoing, and the toast says so.
#[tauri::command]
fn ai_engine_cancel() -> bool {
    engine::request_cancel()
}

// §20.12 one-click MCP client hookup (2026-07-07) — see mcp.rs for the fs/JSON logic.
// Status probe for the Settings badge; write happens only on the user's button press.
#[tauri::command]
fn mcp_client_status(client: String) -> Result<String, String> {
    mcp::client_status(&client)
}

#[tauri::command]
fn configure_mcp_client(client: String) -> Result<String, String> {
    mcp::configure_client(&client)
}

// Double-tap ⌥ needs the Input Monitoring TCC grant (see double_tap.rs module doc):
// a listen-only tap without it only sees Spool's own events. The main window asks
// this at startup / on focus to drive the quiet onboarding banner.
#[tauri::command]
fn input_monitoring_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::input_monitoring_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// The suppression tap (double_tap.rs, 2026-07-29) needs the Accessibility grant to
// delete a consumed double-tap from the event stream — without it the gesture is
// shared and Claude Desktop's quick-entry pops alongside every capture.
#[tauri::command]
fn accessibility_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::accessibility_granted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// DESIGN_FIRST_RUN 拍板点 3 (2026-08-02): startup no longer fires the two TCC prompts,
// so this is the moment they happen — the user pressed "turn on capture". Returns the
// Input Monitoring grant; false is the normal answer (macOS shows its dialog and the
// user finishes in System Settings), which is why the banner keeps a settings route.
#[tauri::command]
fn request_capture_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        double_tap::request_capture_access()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

// Decision ③ (2026-07-31): clients that are not installed stay listed in gray, with a
// pointer to where to get them. Fixed key→URL table — no user input reaches `open`.
// URLs checked alive 2026-07-31; they are external facts, re-verify before editing.
#[tauri::command]
fn open_mcp_client_page(client: String) -> Result<(), String> {
    let url = match client.as_str() {
        "claude" => "https://claude.ai/download",
        "claude-code" => "https://claude.com/claude-code",
        "cursor" => "https://cursor.com",
        "vscode" => "https://code.visualstudio.com",
        "windsurf" => "https://windsurf.com",
        "codex" => "https://developers.openai.com/codex",
        other => return Err(format!("unknown MCP client: {other}")),
    };
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("macOS only".into())
    }
}

/// DESIGN_WORKBENCH §9.13 — bring a connected MCP client to the front.
///
/// Ocean 2026-08-07: 「MCP 对话有摩擦，项目管理刚好可以一键进行提问」, with three sketches of
/// what "one click" could mean. Two of them are not buildable and it matters why:
///
///   * *"a new chat window already open, tagged spool#project, waiting for the prompt"* —
///     nothing lets one app compose into another's chat box. There is no automation surface
///     for it in Claude Desktop, Cursor, or ChatGPT.
///   * *"a more convenient protocol between MCP and Spool"* — MCP is a server protocol: the
///     client calls us, we cannot call the client, and there is no "start a conversation"
///     verb in it.
///
/// The third one is real, and this is its second half: the JS side puts the question on the
/// clipboard, then this brings the app forward so the paste lands where the user is looking.
///
/// ⚠️ Returns `false` for `claude-code` rather than guessing a terminal. Claude Code is a
/// CLI, and which terminal it lives in (Terminal / iTerm / Ghostty / an editor pane) is not
/// knowable from here — focusing the wrong one is worse than focusing nothing, so the UI
/// says "paste it in your terminal" instead. Fixed key→app table; no user input reaches
/// `open`.
#[tauri::command]
fn focus_mcp_client(client: String) -> Result<bool, String> {
    let app = match client.as_str() {
        "claude" => "Claude",
        "cursor" => "Cursor",
        "vscode" => "Visual Studio Code",
        "windsurf" => "Windsurf",
        // One config file backs ChatGPT desktop and the Codex CLI (mcp.rs
        // client_config_paths). The desktop app is the one that can be focused.
        "codex" => "ChatGPT",
        "claude-code" => return Ok(false),
        other => return Err(format!("unknown MCP client: {other}")),
    };
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-a")
            .arg(app)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("could not bring {app} to the front"));
        }
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("macOS only".into())
    }
}

// §2.1 route A (2026-07-31): a fresh Input Monitoring grant never becomes visible to
// the already-running process — probe evidence: same signed binary, a new process
// preflights granted=1 while the pre-grant process polls 0 for 90+ minutes. So the
// tap can only come alive through a full relaunch; this gives the banner a one-click
// way to do it instead of narrating "tray icon → Quit → reopen".
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

// Opens System Settings directly at Privacy & Security → Input Monitoring, for the
// banner's "open settings" button. Fixed URL, no user input — no injection surface.
#[tauri::command]
fn open_input_monitoring_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("macOS only".into())
    }
}

// Single call site for `generate_context!`, which embeds the whole frontend bundle —
// invoking the macro once per entry point would embed it twice.
fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

// `spool --overlay`: the capture toast's own process (overlay.rs).
pub fn run_overlay() {
    overlay::run_helper(context());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance MUST be the first plugin: when a second Spool process is launched
    // (a stray `open -a Spool` / `tell application "Spool"`, an old bundle, a double-
    // click), it hands off to the already-running instance and exits BEFORE opening
    // sqlite:spool.db. That makes it impossible for two processes to contend for the DB —
    // the root of the "database is locked" + data-wipe incident (2026-05-29). The
    // callback just surfaces the existing window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            capture::show_main_window(app);
        }));
    }

    builder = builder
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            capture::get_foreground_app,
            capture::set_tray_targets,
            capture::open_target,
            capture::path_is_dir,
            capture::cursor_in_main_webview,
            capture::show_capture_overlay,
            capture::show_undo_overlay,
            capture::update_overlay_source,
            capture::show_capture_notice,
            capture::set_shortcuts,
            capture::probe_browser_automation,
            overlay::overlay_db_reply,
            ai_engine_status,
            ai_engine_run,
            ai_engine_cancel,
            mcp_exe_path,
            mcp_client_status,
            configure_mcp_client,
            open_mcp_client_page,
            focus_mcp_client,
            input_monitoring_granted,
            accessibility_granted,
            request_capture_access,
            open_input_monitoring_settings,
            restart_app,
        ]);

    #[cfg(desktop)]
    {
        use tauri::Emitter;
        use tauri_plugin_global_shortcut::ShortcutState;

        // Launch at login (§9.12). Desktop-only; the LaunchAgent backend on macOS.
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ));

        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Match against the *currently registered* accelerators (§19.1),
                    // which the user can re-bind at runtime — not the hard-coded
                    // defaults. try_state can only be None before setup() runs, which
                    // is before any shortcut is registered, so a press can't reach here.
                    let Some(cfg) = app.try_state::<capture::ShortcutConfig>() else {
                        return;
                    };
                    let capture_acc = *cfg.capture.lock().unwrap();
                    let search_acc = *cfg.search.lock().unwrap();
                    let undo_acc = *cfg.undo.lock().unwrap();
                    if Some(*shortcut) == undo_acc {
                        // §9.13 frictionless undo: registered only while the capture toast
                        // is up, so a press here means "undo the capture I just made" —
                        // works from any app without switching back to Spool.
                        if event.state() == ShortcutState::Pressed {
                            let _ = app.emit("undo-trigger", ());
                        }
                    } else if Some(*shortcut) == capture_acc {
                        // Log every state change (Pressed AND Released) so a missing
                        // capture can be triaged: if stderr shows neither, macOS dropped
                        // the keypress before us; if it shows Pressed but JS doesn't see
                        // [capture] trigger, the emit/listener path is the suspect.
                        eprintln!("[shortcut] capture state={:?}", event.state());
                        if event.state() == ShortcutState::Pressed {
                            // Payload `true` marks this as the user-bound capture shortcut
                            // (no default since 2026-07-07), distinguishing it from the
                            // double-tap ⌥ path (null payload) in the frontend's logs.
                            let _ = app.emit("capture-trigger", true);
                        }
                    } else if shortcut == &search_acc {
                        eprintln!("[shortcut] search state={:?}", event.state());
                        if event.state() == ShortcutState::Pressed {
                            // ⌘⇧F is system-global, so the main window may be hidden —
                            // surface it before the overlay (which lives inside it) opens.
                            capture::show_main_window(app);
                            let _ = app.emit("search-trigger", ());
                        }
                    }
                })
                .build(),
        );
    }

    builder
        .on_window_event(|window, event| {
            // Closing the main window hides it — the app stays resident in the tray so the
            // global shortcut keeps working.
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    // macOS sometimes silently invalidates registered global shortcuts after
                    // sleep/wake or Spaces switches — the OS keeps the registration record
                    // but never fires the handler. Re-checking on every main-window focus is
                    // cheap insurance: if the registration is still live, is_registered short-
                    // circuits and we do nothing; if it's been lost we re-establish.
                    #[cfg(desktop)]
                    tauri::WindowEvent::Focused(true) => {
                        use tauri_plugin_global_shortcut::GlobalShortcutExt;
                        let app = window.app_handle();
                        let gs = app.global_shortcut();
                        if let Some(cfg) = app.try_state::<capture::ShortcutConfig>() {
                            for acc in [
                                *cfg.capture.lock().unwrap(),
                                Some(*cfg.search.lock().unwrap()),
                            ]
                            .into_iter()
                            .flatten()
                            {
                                if !gs.is_registered(acc) {
                                    if let Err(e) = gs.register(acc) {
                                        eprintln!(
                                            "[shortcut] re-register on focus failed: {e}"
                                        );
                                    } else {
                                        eprintln!("[shortcut] re-registered on focus");
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .setup(|app| {
            // Ensure the AppLocalDataDir exists *before* the SQL plugin tries to open
            // `sqlite:spool.db` against it. Some Tauri 2 plugin-sql versions don't
            // auto-create the parent dir on first launch and the frontend hangs forever
            // on `Database.load(...)`.
            if let Ok(dir) = app.path().app_local_data_dir() {
                let _ = std::fs::create_dir_all(&dir);
            }

            #[cfg(desktop)]
            {
                use tauri::tray::TrayIconBuilder;
                use tauri_plugin_global_shortcut::GlobalShortcutExt;

                let initial_menu =
                    capture::build_tray_menu(app.handle(), "", &[], &Default::default())?;
                // 2026-07-13 (new logo): the app icon is now an opaque rounded square,
                // whose alpha mask templates into a solid blob — the menu bar gets its
                // own black-on-transparent thread mark (derived from the logo's small
                // tier) instead of the window icon. Shipped as raw RGBA (tray.rgba,
                // regenerate from tray.png) so no png-decode feature is pulled in.
                let icon = tauri::image::Image::new(
                    include_bytes!("../icons/tray.rgba"),
                    44,
                    44,
                );
                TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .icon_as_template(true)
                    .tooltip("Spool · 思簿")
                    .menu(&initial_menu)
                    .on_menu_event(|app, event| {
                        capture::handle_menu_event(app, event.id.as_ref());
                    })
                    .build(app)?;

                // Live shortcut config (§19.1): search starts at its platform default;
                // capture has NO default binding since 2026-07-07 (⌘⇧C retired —
                // double-tap ⌥ is the trigger; a user-bound shortcut from Settings is
                // re-applied via `set_shortcuts` once the frontend loads settings).
                // Registering search here means it works from the first launch
                // instant, before the webview is even ready.
                app.manage(capture::ShortcutConfig {
                    capture: std::sync::Mutex::new(None),
                    search: std::sync::Mutex::new(capture::search_accelerator()),
                    // §9.13: registered on demand while the capture toast is visible.
                    undo: std::sync::Mutex::new(None),
                });
                if let Err(e) = app
                    .global_shortcut()
                    .register(capture::search_accelerator())
                {
                    eprintln!("failed to register search shortcut: {e}");
                }
            }

            // macOS only: install the double-tap ⌥ listener on its own thread (it
            // runs CFRunLoopRun() which blocks). Missing Input Monitoring permission
            // is preflighted/prompted inside (see double_tap.rs module doc); the UI
            // shows an onboarding banner until the grant lands.
            #[cfg(target_os = "macos")]
            double_tap::install(app.handle().clone());

            // The capture toast's own process (overlay.rs). Started here, not on the
            // first capture: a webview cold start on the hot path would blow the
            // <200ms keypress → toast budget.
            #[cfg(desktop)]
            overlay::spawn_helper(app.handle().clone());

            Ok(())
        })
        .run(context())
        .expect("error while running tauri application");
}
