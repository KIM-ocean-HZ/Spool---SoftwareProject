mod api_engine;
// 第二轮压缩实测台（WORKPLAN §9.6.3）。⚠️ 只在测试构建里存在 —— 发布出去的 Spool 里没有它。
#[cfg(test)]
mod compress_sweep;
mod capture;
#[cfg(target_os = "macos")]
mod double_tap;
// Windows peer of double_tap: the same double-tap-modifier gesture (Ctrl there, ⌥ on
// macOS), built on Raw Input instead of a CGEventTap. Cfg'd out everywhere else.
#[cfg(target_os = "windows")]
mod double_tap_win;
pub mod engine;
pub mod mcp;
pub mod overlay;
pub mod pack;
// Calendar time, split so that only the local-zone half needs the operating system —
// see the module header for why mcp.rs no longer calls libc directly.
mod systime;
pub mod transfer;
// The Windows syscalls that have no portable expression. Whole module is cfg'd out
// elsewhere, like double_tap is off Windows.
#[cfg(target_os = "windows")]
mod win32;

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
// ⚠️ `(async)` on a SYNCHRONOUS function, and it is the whole fix for Ocean's 2026-08-18 #3
// (「点设置的按钮和点 AI 引擎、第一次点右边栏展开时卡顿明显」).
//
// A plain `#[tauri::command]` runs on the MAIN thread, which on macOS is the UI thread —
// so every caller of this froze the window for as long as detection took. Detection is up
// to six subprocess spawns (`which` + `--version`, three engines), and the CLIs here are
// Node programs: measured 0.67s on this machine with all three installed, with a 5s
// per-probe ceiling behind it. The right rail probes when it first mounts and the engine
// settings page probes on every open, which is exactly the three places he named.
//
// `(async)` on a sync body puts it on the runtime's thread pool instead (tauri-macros:
// `sync_threadpool`). Nothing about the function changes — it touches no window and no
// menu, so it has no business on the main thread in the first place.
#[tauri::command(async)]
fn ai_engine_status(
    preferred: Option<String>,
    manual_path: Option<String>,
) -> engine::EngineStatus {
    engine::detect(
        preferred.as_deref().and_then(engine::EngineKind::parse),
        manual_path.as_deref(),
    )
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
    // The hand-typed CLI path from settings, if any — passed on the run for the same reason
    // the probe takes it: the engine the settings page found must be the engine that runs.
    manual_path: Option<String>,
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
        // §11.2-C: the headless wording. Nobody is at the screen for an engine-slot run, so
        // the prompt must not end by asking for a yes — the run card is where the user says it.
        let prompt = mcp::guidance_text_headless(&action, &args)?;
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
        // ⚠️ The check itself lives in `run_action` now that each engine has its own
        // catalogue — only the engine that actually runs knows which names are valid, and a
        // preference naming an uninstalled engine falls back to a different one (§7.4).
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
            manual_path.as_deref(),
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
// Same reason as `ai_engine_status` above: reads (and for `configure`, rewrites + backs up)
// several config files under the user's home. File IO is short but it is not free, and the
// MCP settings page fires two of these the moment it opens.
#[tauri::command(async)]
fn mcp_client_status(client: String) -> Result<String, String> {
    mcp::client_status(&client)
}

#[tauri::command(async)]
fn configure_mcp_client(client: String) -> Result<String, String> {
    mcp::configure_client(&client)
}

// §9.4 丙 (2026-08-11): when each client last actually connected. The badge beside it reads
// the client's config file, which only says an entry exists — this is the half that says
// somebody used it. Never fails: no file means nothing has ever connected.
#[tauri::command(async)]
fn mcp_clients_seen() -> serde_json::Value {
    mcp::clients_seen()
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
        "gemini" => "https://github.com/google-gemini/gemini-cli",
        other => return Err(format!("unknown MCP client: {other}")),
    };
    // Same opener the project-file rows use, so the URL takes the platform's registered
    // handler rather than a second hand-rolled route per OS. Windows needs this to work:
    // "MCP 接得上" is in the first release, and a client the user has not installed yet
    // starts with the download page.
    capture::open_default_handler(url).map_err(|e| e.to_string())
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
            capture::set_shortcut_recording,
            capture::set_capture_disabled,
            capture::set_close_hint_pending,
            capture::hide_main_window,
            capture::probe_browser_automation,
            capture::system_idle_ms,
            capture::show_break_reminder,
            capture::raise_main_window,
            overlay::overlay_db_reply,
            pack::write_pack_folder,
            transfer::export_library,
            transfer::stage_import_db,
            transfer::discard_import_staging,
            transfer::count_missing_targets,
            api_engine::compress_pack_via_api,
            api_engine::compress_cancel,
            api_engine::compress_sidecar_present,
            api_engine::compress_duplicate_probe,
            api_engine::api_key_save,
            api_engine::api_key_load,
            api_engine::api_key_present,
            ai_engine_status,
            ai_engine_run,
            ai_engine_cancel,
            mcp_exe_path,
            mcp_client_status,
            mcp_clients_seen,
            configure_mcp_client,
            open_mcp_client_page,
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
                        api.prevent_close();
                        // Windows only, and only the first time: ✕ is when 「Spool 去哪儿了」
                        // gets asked, so the first one is spent answering it and the window
                        // stays up until the card's button finishes the close. See
                        // capture.rs's CLOSE_HINT section for why the icon cannot simply be
                        // made visible instead.
                        #[cfg(target_os = "windows")]
                        let hinted = capture::consume_close_hint(window);
                        #[cfg(not(target_os = "windows"))]
                        let hinted = false;
                        if !hinted {
                            let _ = window.hide();
                        }
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
                            // …unless the user is recording a chord right now, in which case
                            // the registrations are DOWN on purpose (capture.rs
                            // set_shortcut_recording) and re-establishing them here would
                            // take the keys back out of the recorder's hands.
                            if cfg.recording.load(std::sync::atomic::Ordering::SeqCst) {
                                return;
                            }
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
            // Ensure the directory the SQL plugin will open `sqlite:spool.db` against
            // exists *before* it tries. Some Tauri 2 plugin-sql versions don't
            // auto-create the parent dir on first launch and the frontend hangs forever
            // on `Database.load(...)`.
            //
            // ⚠️ BOTH, because on macOS these are the same path and on Windows they are
            // not: config dir is Roaming AppData, local data dir is Local AppData. The
            // plugin resolves a relative sqlite URL against the CONFIG dir, so on Windows
            // the line below was creating a directory nothing would ever open — and the
            // failure mode is the worst one available: a first launch that hangs on a
            // blank window, on the platform where nobody has a terminal open to see why.
            // Creating a second empty directory is the whole cost of not finding that out
            // from Ocean.
            for dir in [app.path().app_config_dir(), app.path().app_local_data_dir()]
                .into_iter()
                .flatten()
            {
                let _ = std::fs::create_dir_all(&dir);
            }

            fit_main_window_to_work_area(app.handle());

            #[cfg(desktop)]
            {
                use tauri::tray::TrayIconBuilder;
                use tauri_plugin_global_shortcut::GlobalShortcutExt;

                // 捕捉总开关(2026-08-22)。⚠️ 顺序是死的:先把 settings.json 里那个值读回来,
                // 再建菜单和图标 —— 菜单里的勾和图标的深浅都是照着它画的,而 webview 还要
                // 一两秒才起得来。图标和菜单的两份说明搬进了 capture.rs(tray_image /
                // build_tray_menu),因为暂停开关一变还要照同样的规则再画一次。
                let capture_off = capture::load_capture_disabled();
                let initial_menu =
                    capture::build_tray_menu(app.handle(), "", &[], &Default::default())?;
                let icon = capture::tray_image(app.handle(), capture_off);
                let tray = TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .icon_as_template(cfg!(target_os = "macos"))
                    .tooltip("Spool · 思簿")
                    .menu(&initial_menu)
                    .on_menu_event(|app, event| {
                        capture::handle_menu_event(app, event.id.as_ref());
                    });
                // ⚠️ Windows convention, and on Windows it is not decoration: closing the
                // window only hides it, so the tray is the way back — and a Windows user
                // reaches for a LEFT click to get a window back (右键 is for the menu).
                // Tauri's default shows the menu on either button, which on Windows reads
                // as "the app is gone and the icon does nothing useful".
                // macOS keeps the default: a menu-bar item there opens its menu on click.
                #[cfg(not(target_os = "macos"))]
                let tray = tray.show_menu_on_left_click(false).on_tray_icon_event(
                    |tray, event| {
                        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            capture::show_main_window(tray.app_handle());
                        }
                    },
                );
                tray.build(app)?;

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
                    recording: std::sync::atomic::AtomicBool::new(false),
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

            // Windows: the same gesture, double-tap Ctrl, on its own Raw Input message
            // pump (double_tap_win.rs). No permission to preflight — Raw Input needs no
            // grant — so it either arms and logs it, or logs the OS error and leaves the
            // Settings capture chord as the way in.
            #[cfg(target_os = "windows")]
            double_tap_win::install(app.handle().clone());

            // The capture toast's own process (overlay.rs). Started here, not on the
            // first capture: a webview cold start on the hot path would blow the
            // <200ms keypress → toast budget.
            #[cfg(desktop)]
            overlay::spawn_helper(app.handle().clone());

            Ok(())
        })
        .build(context())
        .expect("error while building tauri application")
        // ⚠️ Ocean, Windows 验收 #13: clicking ✕ closed the whole app. On macOS an app with
        // no visible window keeps running by itself; everywhere else the event loop ends
        // when the last window goes, and the tray icon goes with it — which takes the only
        // way back to a hidden window AND the only way to quit, and leaves the shortcut
        // dead. `CloseRequested` above hides instead of closing, so this should not be
        // reachable; it is here because the cost of being wrong about that is the app
        // vanishing on the platform where the tray IS the app.
        //
        // `code.is_none()` is what keeps a real quit real: 退出 in the tray menu goes
        // through `app.exit(0)` and restart_app through `AppHandle::restart()`, and both
        // arrive here with a code — only an exit nobody asked for is prevented.
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}

// Open inside the screen the user actually has.
//
// Ocean, 2026-08-17 (2560×1600 laptop): 「打开之后底部一小部分被 windows 的程序坞挡住了」.
// The configured 1600×1000 is a LOGICAL size, and Windows laptops ship scaled — at 150%
// that display is 1706×1066 logical, of which the taskbar takes the bottom ~48. So the
// window is taller than the space it is allowed to occupy and the last rows land under the
// taskbar.
//
// ⚠️⚠️ **2026-08-21: this stopped being a Windows problem, and the gate came off.** It shipped
// as `#[cfg(target_os = "windows")]`, reasoned as "nothing on macOS reports this". That was
// true the day it was written — Ocean's Mac was on More Space (1800×1169), where 1600×1000
// fits. He moved to the default scaling (1512×982) and it does not: measured on the running
// app, the main window sat at (100, 51) at 1600×1000, i.e. **188pt off the right edge and
// 69pt off the bottom, with 55% of the right rail off-screen** — every launch, since nothing
// persists window state. The two most common Mac laptops (14" 1512×982, 13" Air 1470×956)
// both fail it. Full measurement in `docs/CHECK-DISPLAY-2026-08-21.md`.
//
// So the reason was never "Windows"; it was "the window is bigger than the work area", and
// that is platform-independent. `work_area()` is implemented on macOS too (NSScreen's
// `visibleFrame` — menu bar and Dock already excluded), so the body needs no per-OS branch.
//
// The work area is the taskbar/Dock-excluded rectangle of the monitor the window opened on —
// asking the OS for it is the only way to be right on every DPI, taskbar edge and monitor.
// Chrome (title bar + borders) is measured rather than assumed: `set_size` sets the INNER
// size, and the difference is what would otherwise still hang off the bottom.
//
// ⚠️ A window that already fits returns before touching anything, so on the displays this was
// never a problem on (15"/16" Macs, roomy externals) nothing moves — same size, same position.
fn fit_main_window_to_work_area(app: &tauri::AppHandle) {
    use tauri::{LogicalSize, PhysicalPosition, PhysicalSize};
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let (Ok(Some(monitor)), Ok(outer), Ok(inner)) =
        (win.current_monitor(), win.outer_size(), win.inner_size())
    else {
        return;
    };
    let work = *monitor.work_area();
    let chrome_w = outer.width.saturating_sub(inner.width);
    let chrome_h = outer.height.saturating_sub(inner.height);
    let max_w = work.size.width.saturating_sub(chrome_w);
    let max_h = work.size.height.saturating_sub(chrome_h);
    if inner.width <= max_w && inner.height <= max_h {
        return; // it already fits — leave the user's window exactly where it is
    }
    // The floor is the configured minimum (860×560 logical): a work area smaller than that
    // has no answer, and shrinking past it would just move the clipping inside the app.
    let scale = monitor.scale_factor();
    let min = LogicalSize::new(860.0, 560.0).to_physical::<u32>(scale);
    let w = inner.width.min(max_w).max(min.width);
    let h = inner.height.min(max_h).max(min.height);
    if win.set_size(PhysicalSize::new(w, h)).is_err() {
        return;
    }
    // ⚠️ Re-positioning is NOT cosmetic and not optional: a window shrunk to the work area's
    // width but left at its old x still hangs off the same edge (1600→1512 at x=100 is still
    // 100pt over). Centring is simply the position that is always inside, on every edge.
    // Re-read: the resize is what decides how much room is left to centre in.
    let Ok(outer) = win.outer_size() else { return };
    let x = work.position.x + ((work.size.width as i32 - outer.width as i32) / 2).max(0);
    let y = work.position.y + ((work.size.height as i32 - outer.height as i32) / 2).max(0);
    let _ = win.set_position(PhysicalPosition::new(x, y));
}
