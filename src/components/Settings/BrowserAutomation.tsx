import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

// macOS Automation permission surface (PLAN_EN.md §19.7). Per-browser status — first
// capture from a given browser triggers the system permission prompt; if the user
// denies it (then forgets), captures silently fall back to the app name and the user
// wonders why. This panel makes the state observable and gives a one-click re-test
// that re-fires the same osascript path the capture pipeline uses.

type Status = 'untested' | 'granted' | 'denied';

// Match the allowlist in src-tauri/src/capture.rs (browser_tab_title + probe).
const BROWSERS = [
  'Safari',
  'Google Chrome',
  'Microsoft Edge',
  'Brave Browser',
  'Arc',
] as const;
type Browser = (typeof BROWSERS)[number];

const statusBadge = (s: Status): { label: string; color: string } => {
  switch (s) {
    case 'granted':
      return { label: '✓ 已授权', color: 'var(--status-active)' };
    case 'denied':
      return { label: '✗ 未授权', color: 'var(--urgent)' };
    case 'untested':
    default:
      return { label: '⚪ 未测试', color: 'var(--muted)' };
  }
};

export default function BrowserAutomation() {
  const [status, setStatus] = useState<Record<Browser, Status>>(() =>
    Object.fromEntries(BROWSERS.map((b) => [b, 'untested'])) as Record<Browser, Status>,
  );
  const [testing, setTesting] = useState<Browser | null>(null);

  const probe = async (name: Browser): Promise<void> => {
    setTesting(name);
    try {
      await invoke('probe_browser_automation', { name });
      setStatus((s) => ({ ...s, [name]: 'granted' }));
    } catch {
      // Either the user denied at the prompt, the browser isn't installed, or it
      // isn't running. From Spool's POV the outcome is the same — captures from
      // that browser will fall back to the app name.
      setStatus((s) => ({ ...s, [name]: 'denied' }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        首次从浏览器捕捉时，macOS 会请求"自动化"权限。允许后，捕捉的来源会显示标签页标题；
        否则只会显示浏览器名。点击"测试"可重新触发该提示。
      </p>
      <ul className="space-y-1">
        {BROWSERS.map((b) => {
          const s = statusBadge(status[b]);
          const isTesting = testing === b;
          return (
            <li
              key={b}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{b}</span>
              <span className="font-mono text-xs" style={{ color: s.color }}>
                {s.label}
              </span>
              <button
                type="button"
                onClick={() => void probe(b)}
                disabled={isTesting}
                className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
              >
                {isTesting ? '测试中…' : '测试'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
