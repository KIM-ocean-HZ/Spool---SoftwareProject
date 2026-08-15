import { describe, expect, it, vi } from 'vitest';

// The module talks to Tauri for everything it reads, so that one command is stubbed here.
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { MCP_CLIENTS } = await import('./clients');

// ⚠️ 2026-08-15 — this file used to be mostly `askPrompt` (which syntax names Spool inside
// each client's chat box) and `readConnectedClients`. Both went with the addressing route;
// the measurements those tests were pinning are kept as prose in clients.ts's header, because
// the reason they existed — a wrong prefix fails SILENTLY in somebody else's chat box — is
// still the reason not to re-derive them from scratch.

describe('MCP_CLIENTS — what each row promises', () => {
  it('does not offer plain "ChatGPT" as a client Spool can be used from', () => {
    // 2026-08-12. The row read 「ChatGPT / Codex」 because one config file feeds both. The
    // file is shared; the capability is not — a hosted ChatGPT chat cannot connect to a
    // local stdio MCP server at all, which OpenAI documents and which was measured here the
    // same day (no local thread, no `spool --mcp`, no tool call in Spool's heartbeat). A row
    // that says ChatGPT sends the user to the one conversation where nothing will happen and
    // nothing will error. The word survives in the row's explanatory line, not in its name.
    const codex = MCP_CLIENTS.find((c) => c.key === 'codex');
    expect(codex?.label).toBe('Codex');
    expect(MCP_CLIENTS.some((c) => c.label.includes('ChatGPT'))).toBe(false);
  });
});
