import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/lib/i18n';

// §20.12 one-click hookup (2026-07-07): per-client connection state shown as a badge.
// "written" is a UI-only refinement of "configured" — the entry now points at this
// binary, but the client reads its config at launch, so a restart note is the truth.
type McpClientStatus = 'not-installed' | 'unconfigured' | 'configured' | 'stale' | 'written';
// 2026-07-31 (Ocean): Claude Code promoted to a first-class one-click target, and the
// other popular clients that keep their MCP servers in a plain JSON file joined it —
// same one button, each written in that client's own shape (mcp.rs client_config_paths).
// Claude first, per "get the Claude path perfect before widening". Decision ① added
// ChatGPT desktop / Codex (one shared TOML file, merged via toml_edit). Clients that
// take their config through a GUI (Cherry Studio, DeepChat, …) can't be written from
// outside — they use the copy-snippet below (decision ②: that's enough for them).
type McpClient = 'claude' | 'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'codex';
const MCP_CLIENTS: { key: McpClient; label: string }[] = [
  { key: 'claude', label: 'Claude Desktop' },
  { key: 'claude-code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'vscode', label: 'VS Code' },
  { key: 'windsurf', label: 'Windsurf' },
  { key: 'codex', label: 'ChatGPT / Codex' },
];

// §20.12 MCP local server (experimental, default OFF). The toggle gates the
// `spool --mcp` subprocess's tools; the snippet is what the user pastes into their AI
// client's MCP config. Read-only access, local only. Split out of GeneralConfig into
// its own settings tab (任务三 #2, 2026-07-12): MCP is the product's core channel and
// was buried mid-scroll.
export default function McpConfig() {
  const t = useT();
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const update = useSettingsStore((s) => s.update);
  // §20.12: the client-config snippet points at the running binary so dev builds and
  // the installed .app both show a path that works. Resolved once, on demand.
  const [exePath, setExePath] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  // 任务二 B1 (2026-07-12): the user-facing scenario list, collapsed by default (§2.5).
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [clientStatus, setClientStatus] = useState<Record<McpClient, McpClientStatus | null>>({
    claude: null,
    'claude-code': null,
    cursor: null,
    vscode: null,
    windsurf: null,
    codex: null,
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

  // Ocean #3 (2026-07-09): a paste-ready briefing for the AI client (project
  // instructions or the top of a chat). The server's initialize instructions carry the
  // same rules, but not every client honours them — this puts the user in control.
  const copyUsagePrompt = async (): Promise<void> => {
    try {
      await writeText(
        t(
          '我用 Spool（思簿）管理项目上下文，你可以通过它的 MCP 工具直接读写：用 list_threads 了解我的项目；问我「最近在忙什么」这类跨脉络问题先用 get_digest；search_blocks 定位主题在哪条脉络；get_pack 读完整上下文（大脉络先看 approx_pack_chars，优先 range=pinned）。我让你「记住/归档」结论时，用 add_block 存进对应脉络；新课题用 create_thread；读完新材料可用 set_thread_summary 更新一句话摘要；find_similar_blocks 可以帮我找重复捕捉；我要「体检」时用 check_library 出只读报告。对我说话永远用脉络标题指代，绝不要输出内部 id。你写入的内容会自动带你的来源标签。',
        ),
      );
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1500);
    } catch (e) {
      console.error('[settings] copy usage prompt failed', e);
    }
  };

  return (
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
          const showButton = s === 'unconfigured' || s === 'stale';
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
                  disabled={busy}
                  className="flex-none rounded-md border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
                >
                  {busy ? t('写入中…') : s === 'stale' ? t('更新配置') : t('一键接入')}
                </button>
              )}
              {/* Decision ③ (2026-07-31): a missing client stays listed in gray and the
                  row tells you what to install — the button opens its official page. */}
              {s === 'not-installed' && (
                <button
                  type="button"
                  title={t('装好后这里就能一键接入')}
                  onClick={() => {
                    void invoke('open_mcp_client_page', { client: key }).catch((e) =>
                      console.warn('[settings] open client page failed', e),
                    );
                  }}
                  className="flex-none rounded-md border border-line bg-paper px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {t('去下载')}
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
      {/* Ocean #3: paste-ready usage briefing for the AI side. */}
      {mcpEnabled && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 text-xs text-muted">
            {t('接入后，把一段「怎么用 Spool 帮我」的提示粘给 AI，体验更顺')}
          </span>
          <button
            type="button"
            onClick={() => void copyUsagePrompt()}
            className="flex-none rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {promptCopied ? t('已复制') : t('复制使用提示')}
          </button>
        </div>
      )}
      {/* 任务二 B1 (2026-07-12): scenario phrases for the USER (the seeded MCP
          tutorial thread can never reach an existing library — 5/29 red line — so
          veterans get the same copy-paste lines here). Collapsed by default (§2.5). */}
      {mcpEnabled && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExamplesOpen((v) => !v)}
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            {examplesOpen ? '▾ ' : '▸ '}
            {t('示例用法：接入后可以对 AI 说什么')}
          </button>
          {examplesOpen && (
            <ul className="mt-1.5 space-y-1.5 pl-4 text-xs leading-relaxed text-ink-2">
              <li>
                {t('「帮我复习〈某条脉络〉，再考我两个问题」')}
                <span className="text-muted">{t('——读整条脉络（get_pack）')}</span>
              </li>
              <li>
                {t('「我最近一周在忙什么？」')}
                <span className="text-muted">{t('——跨脉络简报（get_digest）')}</span>
              </li>
              <li>
                {t('「把刚才这段结论存进〈某条脉络〉，批注一句为什么重要」')}
                <span className="text-muted">{t('——归档（add_block，需允许 AI 写入）')}</span>
              </li>
              <li>
                {t('「这个主题我记在哪条脉络？」')}
                <span className="text-muted">{t('——全库检索（search_blocks）')}</span>
              </li>
              <li>
                {t('「帮我看看有没有重复收藏的内容」')}
                <span className="text-muted">{t('——查重报告（find_similar_blocks）')}</span>
              </li>
              <li>
                {t('「给我的思簿做个体检」')}
                <span className="text-muted">{t('——数据卫生报告（check_library）')}</span>
              </li>
            </ul>
          )}
        </div>
      )}
      {mcpEnabled && (
        <div className="mt-2 rounded-md border border-line bg-paper-2/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              {t('你的 AI 工具不在上面？（Cherry Studio、DeepChat 等）复制这段配置，粘进它的 MCP 设置页')}
            </span>
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
  );
}
