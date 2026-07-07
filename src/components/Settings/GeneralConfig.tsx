import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { clearAllData } from '@/lib/db/client';
import { useSettingsStore } from '@/stores/settingsStore';

// General settings (PLAN_EN.md §9.12): launch at login, attachment auto-extraction,
// the §20.12 MCP toggle, and the destructive clear-all-data action behind an inline
// two-step confirmation.
export default function GeneralConfig() {
  const launchAtLogin = useSettingsStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
  const autoExtractAttachments = useSettingsStore((s) => s.autoExtractAttachments);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const language = useSettingsStore((s) => s.language);
  const update = useSettingsStore((s) => s.update);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  // §20.12: the client-config snippet points at the running binary so dev builds and
  // the installed .app both show a path that works. Resolved once, on demand.
  const [exePath, setExePath] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);

  useEffect(() => {
    if (!mcpEnabled || exePath !== null) return;
    void invoke<string>('mcp_exe_path')
      .then(setExePath)
      .catch((e) => console.warn('[settings] mcp_exe_path failed', e));
  }, [mcpEnabled, exePath]);

  const mcpSnippet =
    exePath === null
      ? ''
      : JSON.stringify(
          { mcpServers: { spool: { command: exePath, args: ['--mcp'] } } },
          null,
          2,
        );

  const copySnippet = async (): Promise<void> => {
    if (!mcpSnippet) return;
    try {
      await writeText(mcpSnippet);
      setSnippetCopied(true);
      setTimeout(() => setSnippetCopied(false), 1500);
    } catch (e) {
      console.error('[settings] copy mcp snippet failed', e);
    }
  };

  const handleClear = async (): Promise<void> => {
    setClearing(true);
    try {
      await clearAllData();
      // Every store is now stale; a reload re-hydrates them from the empty DB.
      window.location.reload();
    } catch (e) {
      console.error('[settings] clear all data failed', e);
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div>
      {/* Language switch (2026-07-07): zh is the product default; en flips every surface
          via lib/i18n. Rendered bilingually on purpose so it's findable in either. */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">语言 / Language</div>
          <div className="mt-0.5 text-xs text-muted">界面语言。切换立即生效。</div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => void update({ language: lang })}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                language === lang
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {lang === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">开机启动</div>
          <div className="mt-0.5 text-xs text-muted">登录时自动运行,捕捉快捷键随时可用</div>
        </div>
        <Toggle checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">自动提取附件文字内容</div>
          <div className="mt-0.5 text-xs text-muted">
            PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。
          </div>
        </div>
        <Toggle
          checked={autoExtractAttachments}
          onChange={(v) => void update({ autoExtractAttachments: v })}
        />
      </div>

      <div className="border-t border-line" />

      {/* §20.12 MCP local server (experimental, default OFF). The toggle gates the
          `spool --mcp` subprocess's tools; the snippet is what the user pastes into
          their AI client's MCP config. Read-only access, local only. */}
      <div className="py-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-ink">MCP 服务（实验）</div>
            <div className="mt-0.5 text-xs text-muted">
              让支持 MCP 的 AI 工具（Claude、Cursor 等）直接读取脉络打包——从「粘贴」到「零粘贴」。只读,仅本机。
            </div>
          </div>
          <Toggle checked={mcpEnabled} onChange={(v) => void update({ mcpEnabled: v })} />
        </div>
        {mcpEnabled && (
          <div className="mt-2 rounded-md border border-line bg-paper-2/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">粘贴到 AI 客户端的 MCP 配置里:</span>
              <button
                type="button"
                onClick={() => void copySnippet()}
                disabled={!mcpSnippet}
                className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:text-muted/50"
              >
                {snippetCopied ? '已复制' : '复制'}
              </button>
            </div>
            <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded bg-paper px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
              {mcpSnippet || '解析可执行路径…'}
            </pre>
          </div>
        )}
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">清除所有数据</div>
          <div className="mt-0.5 text-xs text-muted">删除全部工作区、脉络与信息块,不可恢复</div>
        </div>
        {confirming ? (
          <div className="flex flex-none items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={clearing}
              className="rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
            >
              {clearing ? '清除中…' : '确认清除'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong disabled:opacity-50"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex-none rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}
