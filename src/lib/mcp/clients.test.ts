import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';

// The module talks to Tauri for everything except the strings it builds, so the two
// commands it calls are stubbed here and driven per test.
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));

const { askPrompt, readConnectedClients } = await import('./clients');

describe('askPrompt — addressing the server in each client’s own syntax', () => {
  // ⚠️ The point of this file. Every one of these strings is typed into somebody else's
  // chat box, where a wrong prefix does not fail loudly — it silently addresses something
  // else (a file called `spool`, an unknown slash command) and the user reads the answer
  // as Spool being broken. `HOW_TO_ADDRESS` is only allowed to grow by measurement, and
  // these cases are what pins the shapes it may take.
  it('mentions the server for ChatGPT / Codex, where @spool was measured to work', () => {
    const s = askPrompt('申请规划', 'codex');
    expect(s.startsWith('@spool ')).toBe(true);
    expect(s).toContain('申请规划');
  });

  it('hands over after naming the project, instead of asking one user’s question', () => {
    // 2026-08-12 (「这个提示词太长了…后文让用户自己写，每个用户的诉求不一样」). Every
    // non-slash form ends on a colon and stops: what follows is the user's, and a sentence
    // Spool wrote is a sentence they have to delete first.
    for (const client of ['codex', 'claude', 'cursor', undefined] as const) {
      const s = askPrompt('申请规划', client);
      expect(s.trimEnd()).toMatch(/[：:]$/);
      expect(s.length).toBeLessThan(40);
    }
  });

  it('runs the catch_up prompt for Claude Code, whose slash syntax is documented', () => {
    expect(askPrompt('申请规划', 'claude-code')).toBe('/mcp__spool__catch_up "申请规划"');
  });

  it('quotes the title as one argument and drops a quote that would end it early', () => {
    // Claude Code splits arguments on spaces, so the title has to survive as one token.
    expect(askPrompt('机器学习 课', 'claude-code')).toBe('/mcp__spool__catch_up "机器学习 课"');
    expect(askPrompt('他说"算了"', 'claude-code')).toBe('/mcp__spool__catch_up "他说算了"');
  });

  it('says nothing about the server in clients where no syntax has been verified', () => {
    // ⚠️ Not an oversight — @ means a FILE in these, so a prefix would send them hunting.
    for (const client of ['claude', 'cursor', 'vscode', 'windsurf'] as const) {
      const s = askPrompt('申请规划', client);
      expect(s).toContain('申请规划');
      expect(s.startsWith('@')).toBe(false);
      expect(s.startsWith('/')).toBe(false);
    }
    expect(askPrompt('申请规划')).toContain('申请规划');
  });

  it('never sends an empty name where a project title belongs', () => {
    // The placeholder itself is translated, so this compares against it rather than
    // against a word: an untitled project must still arrive as one non-empty token.
    expect(askPrompt('  ', 'claude-code')).toBe(`/mcp__spool__catch_up "${t('无标题')}"`);
    expect(askPrompt('  ', 'codex')).toContain(t('无标题'));
  });
});

describe('readConnectedClients — the two half-truths merged', () => {
  // ⚠️ Braces, not a bare arrow: `mockReset()` returns the mock, and a beforeEach that
  // returns a function has handed vitest a teardown — which it then calls, invoking the
  // stub with no arguments at all.
  beforeEach(() => {
    invoke.mockReset();
  });

  /** `mcp_client_status` answers per client; `mcp_clients_seen` answers once. */
  const stub = (
    statuses: Record<string, string>,
    seen: Record<string, { label: string; last_seen: number }>,
  ): void => {
    invoke.mockImplementation((cmd: string, args?: { client?: string }) => {
      if (cmd === 'mcp_clients_seen') return Promise.resolve(seen);
      if (cmd === 'mcp_client_status') {
        return Promise.resolve(statuses[args?.client ?? ''] ?? 'unconfigured');
      }
      throw new Error(`unexpected command ${cmd}`);
    });
  };

  it('lists a client that is configured but has never connected', async () => {
    // The normal state right after 一键接入, and the row is what tells the user to go use it.
    stub({ cursor: 'configured' }, {});
    const rows = await readConnectedClients();
    expect(rows.map((r) => r.key)).toEqual(['cursor']);
    expect(rows[0]?.lastSeen).toBeNull();
    expect(rows[0]?.addressable).toBe(true);
  });

  it('lists a client that has connected even with no entry in its config file', async () => {
    // Somebody added `spool` by hand. It is still a client that can be asked.
    stub({}, { codex: { label: 'Codex', last_seen: 10 } });
    const rows = await readConnectedClients();
    expect(rows.map((r) => r.key)).toEqual(['codex']);
    expect(rows[0]?.label).toBe('ChatGPT / Codex');
  });

  it('puts the most recently used client first, and the never-used ones last', async () => {
    stub(
      { cursor: 'configured', codex: 'configured', claude: 'written' },
      { codex: { label: 'Codex', last_seen: 200 }, claude: { label: 'Claude', last_seen: 100 } },
    );
    expect((await readConnectedClients()).map((r) => r.key)).toEqual([
      'codex',
      'claude',
      'cursor',
    ]);
  });

  it('keeps an unrecognised client visible, but not addressable', async () => {
    // There is no app to open and no config to read — but this row is the only place the
    // name a client reports for itself ever becomes visible (mcp.rs client_key_from_info).
    stub({}, { 'some-other-agent': { label: 'Weird Agent', last_seen: 5 } });
    const rows = await readConnectedClients();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('Weird Agent');
    expect(rows[0]?.addressable).toBe(false);
  });

  it('leaves out a client that is neither configured nor has ever connected', async () => {
    stub({ cursor: 'not-installed', vscode: 'stale' }, {});
    expect(await readConnectedClients()).toEqual([]);
  });
});
