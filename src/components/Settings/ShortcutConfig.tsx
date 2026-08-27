import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import {
  eventToAccelerator,
  formatAccelerator,
  reservedChordMeaning,
} from '@/lib/capture/shortcut';
import { IS_MAC } from '@/lib/platform';
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
  const captureDisabled = useSettingsStore((s) => s.captureDisabled);
  const setCaptureDisabled = useSettingsStore((s) => s.setCaptureDisabled);
  const update = useSettingsStore((s) => s.update);

  const [recording, setRecording] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ Ocean, Windows 验收 2026-08-18 #3: while this box is armed, EVERY global registration
  // has to come down — 「我在录制快捷键的时候点击原先的快捷键，spool 会调出捕捉操作」, and Ctrl+Z
  // ran the app's own undo instead of being refused. Neither is the recorder misbehaving: a
  // global hotkey is taken out of every program including this window, so the chord the user
  // is most likely to press here is the one that can never arrive as a keydown. Rust drops
  // capture / search / the toast-scoped undo for as long as this effect is mounted.
  useEffect(() => {
    if (!recording) return;
    const field = recording;
    void invoke('set_shortcut_recording', { active: true }).catch((e) =>
      console.warn('[shortcuts] suspending global shortcuts failed', e),
    );
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
      // Ocean, Windows 验收 #20. A global hotkey is taken out of every OTHER program too,
      // so a chord the whole system means something by cannot be accepted: binding Ctrl+Z
      // kills Undo in Word and the browser, and nothing on screen would ever point back
      // here. The refusal names the loss and the way out (add a second modifier).
      const reserved = reservedChordMeaning(accel);
      if (reserved) {
        setError(
          t('{chord} 是所有软件通用的「{what}」——绑成全局键，别的软件里就按不了了。再加一个 ⇧ 或 ⌥ 试试。', {
            chord: formatAccelerator(accel),
            what: t(reserved),
          }),
        );
        return;
      }
      const capture = field === 'capture' ? accel : captureShortcut;
      const search = field === 'search' ? accel : searchShortcut;
      void (async () => {
        try {
          await invoke('set_shortcuts', { capture, search });
          // Leave recording BEFORE persisting: the effect's cleanup is what hands the
          // registrations back, and `captureShortcut` is one of its deps — persisting first
          // would tear it down and re-arm it around a pair that is already live.
          setError(null);
          setRecording(null);
          await update(
            field === 'capture' ? { captureShortcut: accel } : { searchShortcut: accel },
          );
        } catch (err) {
          setError(
            t('系统拒绝了该快捷键：{msg}', { msg: err instanceof Error ? err.message : String(err) }),
          );
        }
      })();
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      void invoke('set_shortcut_recording', { active: false }).catch((e) =>
        console.warn('[shortcuts] restoring global shortcuts failed', e),
      );
    };
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
          {/* Clearing is safe on both platforms now: capture ships UNBOUND
              (DEFAULT_CAPTURE_ACCEL is null) and the built-in double-tap gesture still
              captures, so writing null just returns the row to its resting state rather than
              — as it once would off macOS — undoing itself back to a shipped default on the
              next launch. Only capture shows it; search stays mandatory. */}
          {field === 'capture' && accel && !isRec && (
            <button
              onClick={clearCapture}
              aria-label={t('清除捕捉快捷键')}
              title={t('清除捕捉快捷键')}
              className="rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* The built-in double-tap gesture is not configurable, so it has no recorder row —
          this note is its only mention in the UI.

          Both platforms now HAVE that gesture: double-tap ⌥ on macOS (double_tap.rs, with
          the copy-gate), double-tap Ctrl on Windows (double_tap_win.rs, no gate — no Claude
          Desktop collision to disambiguate). So the row below is a real backup on both, not
          the only door: the strings mirror each other rather than being key-cap-substituted,
          because the macOS one names the copy-gate and the Windows one does not. */}
      <p className="pt-1.5 text-xs leading-relaxed text-muted">
        {IS_MAC
          ? t('内置手势：⌘C 复制后 10 秒内双击 ⌥ 捕捉剪贴板，弹窗里可直接打字留一句想法。以下快捷键可自定义。')
          : t('内置手势：复制后双击 Ctrl 捕捉剪贴板，弹窗里可直接打字留一句想法。以下快捷键可自定义。')}
      </p>
      {/* 一键暂停（2026-08-22，Ocean）。⭐ 这一份是配套 —— 真正管用的那个入口在菜单栏的
          Spool 图标里，因为要关它的那个人此刻正在别的软件里。所以这行字要把那件事说出来。
          ⛔ 关掉的只有捕捉：MCP、主窗、休息提醒照常，它不是「退出 Spool」。 */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('暂停捕捉手势')}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted">
            {IS_MAC
              ? t('别的软件也要用 ⌥ 的时候，把它关掉，那个键就还给别人了。菜单栏的 Spool 图标里也有这个开关，人在别的软件里就能就地关。')
              : t('别的软件也要用 Ctrl 的时候，把它关掉，那个键就还给别人了。菜单栏的 Spool 图标里也有这个开关，人在别的软件里就能就地关。')}
          </div>
        </div>
        <Toggle checked={captureDisabled} onChange={(v) => void setCaptureDisabled(v)} />
      </div>
      <div className="border-t border-line" />
      {row(
        'capture',
        t('捕捉快捷键'),
        captureDisabled
          ? // 总开关关着的时候这个键也是停的（Rust 那侧记着但没注册）。不说出来，
            // 屏幕上就会剩一个写着键名、按下去却没反应的按钮。
            t('已随上面的开关一起暂停')
          : IS_MAC
            ? t('可选 — 双击 ⌥ 之外的备用捕捉键')
            : t('备用 — 双击 Ctrl 之外的捕捉键'),
        captureShortcut,
      )}
      <div className="border-t border-line" />
      {/* ⚠️ 这一行管的是**系统级**那个键（窗口没在前面时也能按）。窗口在前面的时候，查找
          是 ⌘F，和别的软件一样，它写死在窗口里、不占系统热键 —— 所以这行说明要把两件事
          都说清楚，不然用户会以为查找只有一个又长又怪的组合键。 */}
      {row(
        'search',
        t('搜索快捷键'),
        t('在别的软件里也能按，直接叫出 Spool 的搜索。窗口在最前面时，按 ⌘F 就行。'),
        searchShortcut,
      )}
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
