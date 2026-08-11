import { ChevronDown, ChevronRight, PanelRightClose } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { readClientsSeen, type ClientSeen } from '@/lib/mcp/clients';
import { formatRelative } from '@/lib/utils/time';
import { useSettingsStore } from '@/stores/settingsStore';

// DESIGN_MCP_INTENT_ROUTING §9.4 丙 — the top of the rail (2026-08-11, Ocean:「把正在使用的
// MCP 显示在右边栏 … MCP 才是主要的对话写入工具，放在最顶上」).
//
// The rail used to open with the CLI engine. That put the rarely-used thing first: the engine
// slot is reached by exactly one action (跟进), while MCP is how conversations actually write
// into the library. So the engine moved down beside 跟进 — the only thing that uses it — and
// this line took the top.
//
// ⚠️ The timestamp means LAST USED, not last connected. mcp.rs refreshes the row on every
// tool call (`touch_client_seen`), because connect-time alone would show a client that has
// been writing all day as hours idle — the opposite of what this line exists to say.
//
// ⚠️ It polls. A value read once at mount would be a clock that stopped, and this one claims
// to describe right now.
const REFRESH_MS = 20_000;

export default function McpBar({ onCollapse }: { onCollapse: () => void }): JSX.Element {
  const t = useT();
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const [seen, setSeen] = useState<Record<string, ClientSeen>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const read = (): void => void readClientsSeen().then(setSeen);
    read();
    const id = setInterval(read, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Newest first: the one at the top IS the answer to "which one is using Spool".
  const rows = Object.entries(seen).sort((a, b) => b[1].last_seen - a[1].last_seen);
  const newest = rows[0];

  const line = !mcpEnabled
    ? { text: t('MCP 没开'), dim: true }
    : newest
      ? {
          text: `${newest[1].label || newest[0]} · ${formatRelative(newest[1].last_seen)}`,
          dim: false,
        }
      : { text: t('还没有 AI 连过'), dim: true };

  return (
    <div className="flex-none border-b border-line">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={rows.length < 2}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] text-ink-2 transition-colors enabled:hover:bg-paper-2 disabled:cursor-default"
        >
          {/* The chevron appears only when there is a second client to reveal — a control
              that opens onto one row already on screen is a control that does nothing. */}
          {rows.length > 1 &&
            (open ? (
              <ChevronDown size={11} className="flex-none text-muted" />
            ) : (
              <ChevronRight size={11} className="flex-none text-muted" />
            ))}
          <span className={`truncate ${line.dim ? 'text-muted' : ''}`}>{line.text}</span>
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title={t('收起')}
          aria-label={t('收起')}
          className="flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <PanelRightClose size={13} />
        </button>
      </div>

      {open && rows.length > 1 && (
        <ul className="space-y-0.5 px-3 pb-2">
          {rows.slice(1).map(([key, v]) => (
            <li key={key} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-ink-2">{v.label || key}</span>
              <span className="flex-none font-mono text-muted">{formatRelative(v.last_seen)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
