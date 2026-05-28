// Collect-mode panel window (PLAN_EN.md §20.9).
//
// A dedicated third Tauri window (label "collect"), distinct from the capture overlay.
// Like the overlay it is borderless, transparent, always-on-top and non-activating
// (focus: false in tauri.conf.json + we never call set_focus, so it never steals the
// user's keyboard — §14.3). Its lifecycle differs from the overlay's: the panel is
// PERSISTENT (user-controlled close via Send/Discard from the frontend), not
// auto-dismissing. It is declared in tauri.conf.json and lives hidden for the life of
// the app; long-press ⌥ (detected in double_tap.rs, emitted as `collect-trigger`) asks
// the main window to show it, so the user never pays webview-creation cost on the
// trigger hot path (§16 quality bar: < 200ms after the 600ms hold threshold).
//
// Step 5a owns only the show / position / hide lifecycle. Staging + Send/Discard land in
// 5b; NSWorkspace window-following + undo integration in 5c.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime};

const COLLECT_LABEL: &str = "collect";
// Matches the capture overlay's width so the two windows feel like one family.
const COLLECT_WIDTH: u32 = 340;
// Initial height; the frontend refines it via resize_collect_panel once the panel's
// real content is measured (mirrors the overlay's ResizeObserver loop).
const COLLECT_INITIAL_HEIGHT: u32 = 132;
// Margin from the screen edges, in logical pixels — matches OVERLAY_SCREEN_MARGIN.
const COLLECT_SCREEN_MARGIN: i32 = 20;

// Anchor the collect panel at the BOTTOM-right of the active monitor (§20.9). The
// capture overlay deliberately uses top-right to dodge the dock for a transient toast;
// the persistent staging panel is specced bottom-right. We anchor the bottom edge, so
// the window height enters the math: growing the panel (resize_collect_panel) extends it
// upward while the bottom edge stays pinned above the margin.
fn position_collect_bottom_right<R: Runtime>(
    app: &AppHandle<R>,
    height: u32,
) -> Result<(), String> {
    let win = app
        .get_webview_window(COLLECT_LABEL)
        .ok_or_else(|| "collect window not found".to_string())?;
    let monitor =
        crate::capture::active_monitor(app).ok_or_else(|| "no monitor available".to_string())?;
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let m_left = mpos.x as f64 / scale;
    let m_top = mpos.y as f64 / scale;
    let m_width = msize.width as f64 / scale;
    let m_height = msize.height as f64 / scale;
    let target_x = m_left + m_width - COLLECT_WIDTH as f64 - COLLECT_SCREEN_MARGIN as f64;
    let target_y = m_top + m_height - height as f64 - COLLECT_SCREEN_MARGIN as f64;
    win.set_position(LogicalPosition::new(target_x, target_y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Show the collect panel over the user's active screen. Invoked by the main window's
// useCollect hook when Rust's `collect-trigger` (long-press ⌥) fires. Sequence mirrors
// show_capture_overlay: reset size → reposition → emit `collect:open` (so the panel UI
// resets to a fresh staging session) → show. We never set_focus, so the panel appears
// without becoming key and the user keeps typing in their source app (§14.3).
#[tauri::command]
pub fn open_collect_panel<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let win = app
        .get_webview_window(COLLECT_LABEL)
        .ok_or_else(|| "collect window not found".to_string())?;
    win.set_size(LogicalSize::new(
        COLLECT_WIDTH as f64,
        COLLECT_INITIAL_HEIGHT as f64,
    ))
    .map_err(|e| e.to_string())?;
    position_collect_bottom_right(&app, COLLECT_INITIAL_HEIGHT)?;
    app.emit_to(COLLECT_LABEL, "collect:open", ())
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    Ok(())
}

// Hide the collect panel (user Sent or Discarded from the frontend). The window is only
// destroyed on app quit; hiding keeps the webview warm for the next session.
#[tauri::command]
pub fn close_collect_panel<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(COLLECT_LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Resize the panel to its measured content height and re-anchor bottom-right (since the
// bottom edge is pinned, this grows/shrinks the panel upward). Width is fixed.
#[tauri::command]
pub fn resize_collect_panel<R: Runtime>(app: AppHandle<R>, height: u32) -> Result<(), String> {
    let win = app
        .get_webview_window(COLLECT_LABEL)
        .ok_or_else(|| "collect window not found".to_string())?;
    win.set_size(LogicalSize::new(COLLECT_WIDTH as f64, height as f64))
        .map_err(|e| e.to_string())?;
    position_collect_bottom_right(&app, height)?;
    Ok(())
}

// Relay a captured-while-collecting item into the collect panel's staging buffer. The
// main window invokes this from its capture-trigger handler when the panel is open AND
// the trigger was a ⌥ double-tap (not the ⌘⇧C escape hatch). Nothing touches the blocks
// table here — the item is transient in the panel's memory until Send.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectAppendPayload {
    pub text: String,
    pub source: Option<String>,
}

#[tauri::command]
pub fn append_collect_item<R: Runtime>(
    app: AppHandle<R>,
    payload: CollectAppendPayload,
) -> Result<(), String> {
    app.emit_to(COLLECT_LABEL, "collect:append", payload)
        .map_err(|e| e.to_string())?;
    Ok(())
}
