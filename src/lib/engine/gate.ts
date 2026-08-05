// DESIGN_AI_ENGINE §1.1 — the render gate for the "让 AI 维护" menu group.
//
// Three conditions, all required: the Claude Code CLI was detected, the MCP service
// switch is on, and "允许 AI 写入" is on. The actions write blocks through the existing
// MCP surface, so without the write switch they cannot do the thing they promise —
// showing them would be an offer Spool can't keep.
//
// Any condition unmet: the group does not render at all. No greyed-out entries, no
// explanatory tooltip (§1.1 安静原则 — a feature that needs a CLI the user has never
// heard of should be invisible, not nagging). The Settings page is where the detection
// state is visible, and that is the only place it appears.

export interface EngineGateInput {
  /** Whether `claude` was found on this machine (Rust: ai_engine_status). */
  cliAvailable: boolean;
  mcpEnabled: boolean;
  mcpWriteEnabled: boolean;
  /** §1.4 user opt-out. Default true — meaningful only once the CLI is present. */
  actionsEnabled: boolean;
  /**
   * §1.2: whether THIS thread already has a task running or waiting.
   *
   * M1 read this as "anything is running anywhere", which was right when a second click
   * was simply refused. M2 has a queue, and a global lock would make it unreachable —
   * you could never line up a second project's tidy-up while the first ran. The rule that
   * survives is the one the queue is actually for: one task per thread, because two
   * distils of the same project produce two conclusions off the same material.
   */
  busyOnThisThread?: boolean;
}

export const canShowEngineActions = (g: EngineGateInput): boolean =>
  g.cliAvailable && g.mcpEnabled && g.mcpWriteEnabled && g.actionsEnabled;

// Visible but not clickable, so the user can see why nothing happens on a second click.
// Distinct from the hidden case above: hiding mid-run would make the menu jump.
export const engineActionsDisabled = (g: EngineGateInput): boolean =>
  g.busyOnThisThread === true;
