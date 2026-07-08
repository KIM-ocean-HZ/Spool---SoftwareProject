import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { clearAllData } from '@/lib/db/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/lib/i18n';

// §20.12 one-click hookup (2026-07-07): per-client connection state shown as a badge.
// "written" is a UI-only refinement of "configured" — the entry now points at this
// binary, but the client reads its config at launch, so a restart note is the truth.
type McpClientStatus = 'not-installed' | 'unconfigured' | 'configured' | 'stale' | 'written';
type McpClient = 'claude' | 'cursor';
const MCP_CLIENTS: { key: McpClient; label: string }[] = [
  { key: 'claude', label: 'Claude Desktop' },
  { key: 'cursor', label: 'Cursor' },
];

// General settings (PLAN_EN.md §9.12): launch at login, attachment auto-extraction,
// the §20.12 MCP toggle, and the destructive clear-all-data action behind an inline
// two-step confirmation.
export default function GeneralConfig() {
  const t = useT();
  const launchAtLogin = useSettingsStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
  const autoExtractAttachments = useSettingsStore((s) => s.autoExtractAttachments);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const language = useSettingsStore((s) => s.language);
  const update = useSettingsStore((s) => s.update);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  // §20.12: the client-config snippet points at the running binary so dev builds and
  // the installed .app both show a path that works. Resolved once, on demand.
  const [exePath, setExePath] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [clientStatus, setClientStatus] = useState<Record<McpClient, McpClientStatus | null>>({
    claude: null,
    cursor: null,
  });
  const [connecting, setConnecting] = useState<McpClient | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<string>('mcp_exe_path')
      .then(setExePath)
      .catch((e) => console.warn('[settings] mcp_exe_path failed', e));
    for (const { key } of MCP_CLIENTS) {
      void invoke<McpClientStatus>('mcp_client_status', { client: key })
        .then((s) => setClientStatus((prev) => ({ ...prev, [key]: s })))
        .catch((e) => console.warn('[settings] mcp_client_status failed', e));
    }
  }, []);

  // One click does everything (§20.12 revision): flips the toggle on if needed, then
  // writes the client's config entry (Rust backs the file up to .bak first).
  const connectClient = async (client: McpClient): Promise<void> => {
    setConnecting(client);
    setConnectError(null);
    try {
      if (!mcpEnabled) await update({ mcpEnabled: true });
      const s = await invoke<McpClientStatus>('configure_mcp_client', { client });
      setClientStatus((prev) => ({ ...prev, [client]: s }));
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(null);
    }
  };

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
          <div className="mt-0.5 text-xs text-muted">{t('界面语言。切换立即生效。')}</div>
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
          <div className="text-sm text-ink">{t('开机启动')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('登录时自动运行,捕捉快捷键随时可用')}</div>
        </div>
        <Toggle checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('自动提取附件文字内容')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。')}
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
            <div className="text-sm text-ink">{t('MCP 服务（实验）')}</div>
            <div className="mt-0.5 text-xs text-muted">
              {t('让支持 MCP 的 AI 工具（Claude、Cursor 等）直接读取脉络打包——从「粘贴」到「零粘贴」。默认只读,仅本机。')}
            </div>
          </div>
          <Toggle checked={mcpEnabled} onChange={(v) => void update({ mcpEnabled: v })} />
        </div>
        {/* §20.13 write consent (2026-07-08): separate sub-toggle — reading packs and
            letting an external AI insert rows are different trust levels. The --mcp
            subprocess reads it straight from settings.json at each call. */}
        {mcpEnabled && (
          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm text-ink">{t('允许 AI 写入（实验）')}</div>
              <div className="mt-0.5 text-xs text-muted">
                {t('AI 可新建脉络、向脉络追加信息块。写入的块始终带来源标注（如 Claude · MCP），不会伪装成你写的。')}
              </div>
            </div>
            <Toggle
              checked={mcpWriteEnabled}
              onChange={(v) => void update({ mcpWriteEnabled: v })}
            />
          </div>
        )}
        {/* One-click hookup rows (2026-07-07). Visible even while the toggle is off —
            the button flips it on as part of the same click. */}
        <ul className="mt-2 space-y-1">
          {MCP_CLIENTS.map(({ key, label }) => {
            const s = clientStatus[key];
            const busy = connecting === key;
            const badge =
              s === 'configured'
                ? { text: t('✓ 已接入'), color: 'var(--status-active)' }
                : s === 'written'
                  ? { text: t('已写入 — 重启后生效'), color: 'var(--status-active)' }
                  : s === 'stale'
                    ? { text: t('路径已变'), color: 'var(--status-parked)' }
                    : s === 'not-installed'
                      ? { text: t('未检测到'), color: 'var(--muted)' }
                      : null;
            const showButton = s === 'unconfigured' || s === 'stale' || s === 'not-installed';
            return (
              <li key={key} className="flex items-center justify-between gap-3 py-1">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
                {badge && (
                  <span className="font-mono text-xs" style={{ color: badge.color }}>
                    {badge.text}
                  </span>
                )}
                {showButton && (
                  <button
                    type="button"
                    onClick={() => void connectClient(key)}
                    disabled={busy || s === 'not-installed'}
                    className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
                  >
                    {busy ? t('写入中…') : s === 'stale' ? t('更新配置') : t('一键接入')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {connectError && (
          <p className="mt-1 text-xs" style={{ color: 'var(--urgent)' }}>
            {connectError}
          </p>
        )}
        {exePath !== null && !exePath.startsWith('/Applications/') && (
          <p className="mt-1 text-[11px] text-muted">
            {t('当前是开发构建 — 安装正式版后需重新接入')}
          </p>
        )}
        {mcpEnabled && (
          <div className="mt-2 rounded-md border border-line bg-paper-2/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{t('高级：手动粘贴到其它 MCP 客户端的配置里')}</span>
              <button
                type="button"
                onClick={() => void copySnippet()}
                disabled={!mcpSnippet}
                className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:text-muted/50"
              >
                {snippetCopied ? t('已复制') : t('复制')}
              </button>
            </div>
            <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded bg-paper px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-2">
              {mcpSnippet || t('解析可执行路径…')}
            </pre>
          </div>
        )}
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('清除所有数据')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('删除全部工作区、脉络与信息块,不可恢复')}</div>
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
              {clearing ? t('清除中…') : t('确认清除')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong disabled:opacity-50"
            >
              {t('取消')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex-none rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
          >
            {t('清除')}
          </button>
        )}
      </div>
    </div>
  );
}
