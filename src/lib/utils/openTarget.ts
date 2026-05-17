import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

// Last path segment, handling both POSIX and Windows separators. Used to derive an
// attachment's default label (basename) from a file/folder target.
export const basename = (path: string): string => {
  const segs = path.split(/[/\\]/);
  return segs[segs.length - 1] || path;
};

// Open an attachment target (file / folder / URL) with the OS default application.
// The Rust `open_target` command rejects with a message when a file/folder target is
// missing or moved — callers should catch and surface that as a toast.
export const openTarget = async (target: string): Promise<void> => {
  await invoke('open_target', { target });
};

// Native file picker for the 📎 attach action. Returns absolute paths, or an empty
// array when the user cancels. Folders still arrive via Finder drag — the macOS open
// panel can't mix files and directories in one selection.
export const pickFiles = async (): Promise<string[]> => {
  const selection = await open({ multiple: true, directory: false });
  if (selection == null) return [];
  return Array.isArray(selection) ? selection : [selection];
};

// Classify a dropped filesystem path. Returns `true` for directories, `false` for
// regular files and for paths that no longer exist (so the caller still records the
// attachment as `file` rather than discarding the drop).
export const pathIsDir = async (path: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('path_is_dir', { path });
  } catch (e) {
    console.warn('[path_is_dir] failed', e);
    return false;
  }
};
