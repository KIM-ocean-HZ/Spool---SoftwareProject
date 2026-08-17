// Moving a whole library between machines (DESIGN_LIBRARY_TRANSFER).
//
// Same split as pack.rs: this side only touches the filesystem, every decision about what
// a merge means lives in the frontend (lib/db/transfer.ts) where it can be unit-tested.
//
// Two halves:
//   export — VACUUM INTO a file the user picked. Copying spool.db byte-wise would drop
//            whatever is still in the -wal, so the copy goes through SQLite.
//   import — stage the user's file INSIDE the data dir first. The frontend then opens the
//            staged copy as a second database and runs the normal migration chain on it,
//            which is why it must be a copy: migrating writes, and the file the user
//            handed us is theirs.

use rusqlite::{Connection, OpenFlags};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// The import's landing pad, next to spool.db. Named so it is obvious in a directory
/// listing that it is neither the library nor one of the pre-migration snapshots.
const STAGING: &str = "spool.import-staging.db";

/// Where the SQL plugin actually opens `sqlite:spool.db` — see the `app_local_data_dir`
/// call in lib.rs's setup, which exists so the plugin finds the directory on first launch.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| format!("找不到数据目录：{e}"))
}

/// Both sidecars SQLite may have left beside a database file.
fn sidecars(db: &Path) -> [PathBuf; 2] {
    let mut wal = db.as_os_str().to_os_string();
    wal.push("-wal");
    let mut shm = db.as_os_str().to_os_string();
    shm.push("-shm");
    [PathBuf::from(wal), PathBuf::from(shm)]
}

/// True when two paths are the same file on disk, following symlinks. A path that cannot
/// be canonicalized (does not exist yet) is simply not the other one.
fn is_same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Write the whole library out to `dest` as a single self-contained file.
///
/// Returns the exported file's size in bytes.
#[tauri::command]
pub fn export_library(app: tauri::AppHandle, dest: String) -> Result<u64, String> {
    let dir = data_dir(&app)?;
    let source = dir.join("spool.db");
    if !source.exists() {
        return Err("这台机器上还没有库".into());
    }

    let dest_path = PathBuf::from(&dest);

    // ⚠️⚠️ THIS CHECK MUST STAY ABOVE THE remove_file BELOW. A user who steers the save
    // dialog into the data directory and accepts the name `spool.db` would otherwise have
    // their live library deleted by the very command meant to back it up — the 2026-05-29
    // class of accident. Nothing may be exported into the data directory, full stop.
    if dest_path.starts_with(&dir) {
        return Err("不能导出到 Spool 自己的数据目录里".into());
    }

    // The save dialog has already asked about replacing. VACUUM INTO refuses to write over
    // an existing file, so the answer has to be carried out here.
    if dest_path.exists() {
        fs::remove_file(&dest_path).map_err(|e| format!("替换不了已有的文件：{e}"))?;
    }

    // Read-only, exactly like the MCP server's connection: migrations run in the GUI and
    // an export must never be the thing that changes the library.
    let conn = Connection::open_with_flags(&source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("打开库失败：{e}"))?;
    // Quoted rather than bound: this mirrors the VACUUM INTO in lib/db/client.ts that has
    // been writing the pre-migration snapshots since v0.
    let quoted = dest.replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{quoted}'"))
        .map_err(|e| format!("写不出库文件：{e}"))?;

    fs::metadata(&dest_path).map(|m| m.len()).map_err(|e| format!("导出后读不到文件：{e}"))
}

/// Copy the file the user picked into the data dir so the frontend can open it as a second
/// database and migrate it. Returns nothing: the frontend opens it by its fixed name.
#[tauri::command]
pub fn stage_import_db(app: tauri::AppHandle, source: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let src = PathBuf::from(&source);
    if !src.is_file() {
        return Err(format!("文件不存在：{source}"));
    }
    // Importing the library that is open right now would merge it into itself: every id
    // collides, nothing changes, and the report says "0 项目" for reasons the user cannot
    // see. Refuse with the actual reason instead.
    if is_same_file(&src, &dir.join("spool.db")) {
        return Err("这就是这台机器上正在用的库".into());
    }

    let staged = dir.join(STAGING);
    // A previous import that crashed leaves all three files behind; a stale -wal beside a
    // fresh copy would make SQLite read someone else's half-written transaction.
    let _ = fs::remove_file(&staged);
    for s in sidecars(&staged) {
        let _ = fs::remove_file(s);
    }

    fs::copy(&src, &staged).map_err(|e| format!("拷不进来：{e}"))?;
    Ok(())
}

/// Delete the staged copy once the merge is done — or once it has failed.
#[tauri::command]
pub fn discard_import_staging(app: tauri::AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let staged = dir.join(STAGING);
    let _ = fs::remove_file(&staged);
    for s in sidecars(&staged) {
        let _ = fs::remove_file(s);
    }
    Ok(())
}

/// How many of these attachment targets do not exist on this machine.
///
/// One call for the whole list rather than one per file: after an import from another
/// machine the answer is usually "all of them", and that is a number the user is told
/// once (DESIGN_LIBRARY_TRANSFER §3.4), not a per-row state anything reads later.
#[tauri::command]
pub fn count_missing_targets(paths: Vec<String>) -> usize {
    paths.iter().filter(|p| !Path::new(p).exists()).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidecar_names_hang_off_the_database_name() {
        let [wal, shm] = sidecars(Path::new("/tmp/x/spool.import-staging.db"));
        assert_eq!(wal, PathBuf::from("/tmp/x/spool.import-staging.db-wal"));
        assert_eq!(shm, PathBuf::from("/tmp/x/spool.import-staging.db-shm"));
    }

    #[test]
    fn a_path_that_does_not_exist_is_not_the_live_library() {
        assert!(!is_same_file(Path::new("/tmp/nope-a"), Path::new("/tmp/nope-b")));
    }

    #[test]
    fn the_same_file_reached_two_ways_is_recognised() {
        let dir = std::env::temp_dir().join(format!("spool-transfer-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("spool.db");
        fs::write(&f, b"x").unwrap();
        assert!(is_same_file(&f, &dir.join(".").join("spool.db")));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Counting is what the user is told, so an empty list must report zero rather than
    /// "everything is missing".
    #[test]
    fn missing_targets_counts_only_what_is_gone() {
        let here = std::env::current_dir().unwrap().to_string_lossy().to_string();
        assert_eq!(count_missing_targets(vec![]), 0);
        assert_eq!(count_missing_targets(vec![here.clone()]), 0);
        assert_eq!(count_missing_targets(vec![here, "/nope/definitely/not".into()]), 1);
    }
}
