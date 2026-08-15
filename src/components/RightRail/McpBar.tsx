import { PanelRightClose } from 'lucide-react';
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

// ⚠️⚠️ **This row is a READOUT and nothing else. Do not make it a way in again.**
// 2026-08-12 it grew a fold that listed connected clients, and a click copied an opener
// addressed to Spool and brought that app forward (Ocean then: 「加上一个导航去客户端的快捷键」).
// Ocean removed it 2026-08-15, together with 项目管理's 「问 AI」 and the codex plugin — the
// whole 「帮用户去别的 AI 里点名 Spool」 route. What it actually bought was a sentence on the
// clipboard; what it cost was a surface promising Spool could hand work over, which is exactly
// the silent-failure shape the codex plugin was retired for. Removing the nav is what took
// `focus_mcp_client`, `askInClient` and HOW_TO_ADDRESS out with it.
export default function McpBar({
  onCollapse,
}: {
  onCollapse: () => void;
}): JSX.Element {
  const t = useT();
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const [seen, setSeen] = useState<Record<string, ClientSeen>>({});

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
        <span
          className={`min-w-0 flex-1 truncate px-1 py-0.5 text-[13px] ${
            line.dim ? 'text-muted' : 'text-ink-2'
          }`}
        >
          {line.text}
        </span>
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
    </div>
  );
}
