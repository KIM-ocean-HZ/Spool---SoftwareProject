import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { eventToAccelerator, formatAccelerator } from '@/lib/capture/shortcut';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/lib/i18n';

// The two global-shortcut recorders (PLAN_EN.md §9.12 / §19.1). Recording captures the
// next keydown; a valid chord is sent to the Rust `set_shortcuts` command, which
// re-registers it live, and only persisted once Rust confirms it registered.

type Field = 'capture' | 'search';

export default function ShortcutConfig() {
  const t = useT();
  const captureShortcut = useSettingsStore((s) => s.captureShortcut);
  const searchShortcut = useSettingsStore((s) => s.searchShortcut);
  const update = useSettingsStore((s) => s.update);

  const [recording, setRecording] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const field = recording;
    const handler = (e: KeyboardEvent) => {
      // Capture phase + stopPropagation: the chord is consumed here, never reaching
      // the app's own ⌘N / ⌘, listeners or the Settings-modal Esc handler.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        setError(null);
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) {
        setError(t('请按下 ⌘ / ⌃ / ⌥ 之一，再加一个普通键'));
        return;
      }
      const other = field === 'capture' ? searchShortcut : captureShortcut;
      if (accel === other) {
        setError(t('两个快捷键不能相同'));
        return;
      }
      const capture = field === 'capture' ? accel : captureShortcut;
      const search = field === 'search' ? accel : searchShortcut;
      void (async () => {
        try {
          await invoke('set_shortcuts', { capture, search });
          await update(
            field === 'capture' ? { captureShortcut: accel } : { searchShortcut: accel },
          );
          setError(null);
          setRecording(null);
        } catch (err) {
          setError(
            t('系统拒绝了该快捷键：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
          );
        }
      })();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, captureShortcut, searchShortcut, update]);

  // Unbind the capture shortcut (2026-07-08): capture is optional (double-tap ⌥ is
  // the trigger), so once recorded it must also be removable. Search stays mandatory —
  // no clear affordance there.
  const clearCapture = (): void => {
    setError(null);
    setRecording(null);
    void (async () => {
      try {
        await invoke('set_shortcuts', { capture: null, search: searchShortcut });
        await update({ captureShortcut: null });
      } catch (err) {
        setError(
          t('系统拒绝了该快捷键：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
        );
      }
    })();
  };

  const row = (field: Field, label: string, hint: string, accel: string | null) => {
    const isRec = recording === field;
    return (
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{label}</div>
          <div className="mt-0.5 text-xs text-muted">{hint}</div>
        </div>
        <div className="flex flex-none items-center gap-1">
          <button
            onClick={() => {
              setError(null);
              setRecording(isRec ? null : field);
            }}
            className={`min-w-[92px] flex-none rounded-md border px-3 py-1.5 text-center font-mono text-sm transition-colors ${
              isRec
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line-strong bg-paper text-ink hover:border-accent'
            }`}
          >
            {isRec ? t('按键中…') : accel ? formatAccelerator(accel) : t('未设置')}
          </button>
          {field === 'capture' && accel && !isRec && (
            <button
              onClick={clearCapture}
              aria-label={t('清除捕捉快捷键')}
              title={t('清除捕捉快捷键')}
              className="rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {row(
        'capture',
        t('捕捉快捷键'),
        t('可选 — 双击 ⌥ 之外的备用捕捉键'),
        captureShortcut,
      )}
      <div className="border-t border-line" />
      {row('search', t('搜索快捷键'), t('打开全文搜索'), searchShortcut)}
      {recording && !error && (
        <p className="mt-2 text-xs italic text-muted">{t('按下新的组合键，或按 Esc 取消')}</p>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--urgent)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
