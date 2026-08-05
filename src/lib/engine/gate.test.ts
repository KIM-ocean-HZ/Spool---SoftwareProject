import { describe, expect, it } from 'vitest';
import { canShowEngineActions, engineActionsDisabled, type EngineGateInput } from './gate';

// DESIGN_AI_ENGINE §4: the render-condition matrix (detection × two switches × opt-out).
// This is the whole of "zero AI in the product itself" as the user experiences it — if
// the gate leaks, a machine without Claude Code shows a menu that cannot work.
const all: EngineGateInput = {
  cliAvailable: true,
  mcpEnabled: true,
  mcpWriteEnabled: true,
  actionsEnabled: true,
};

describe('engine action gate', () => {
  it('shows only when every condition holds', () => {
    expect(canShowEngineActions(all)).toBe(true);
  });

  it('hides when any single condition fails', () => {
    const keys: (keyof EngineGateInput)[] = [
      'cliAvailable',
      'mcpEnabled',
      'mcpWriteEnabled',
      'actionsEnabled',
    ];
    for (const k of keys) {
      expect(canShowEngineActions({ ...all, [k]: false }), `${k} must gate the group`).toBe(false);
    }
  });

  it('hides on a bare default library (nothing configured, no CLI)', () => {
    expect(
      canShowEngineActions({
        cliAvailable: false,
        mcpEnabled: false,
        mcpWriteEnabled: false,
        actionsEnabled: true,
      }),
    ).toBe(false);
  });

  // §1.1: read access alone is not enough. The actions exist to write a block back, so
  // the write switch is a precondition rather than something to degrade around.
  it('hides when MCP is on but writing is not', () => {
    expect(canShowEngineActions({ ...all, mcpWriteEnabled: false })).toBe(false);
  });

  // §1.2: a run in progress disables rather than hides — hiding would make the menu jump
  // under the user's cursor.
  it('disables while a run is in flight, without hiding', () => {
    const running = { ...all, running: true };
    expect(canShowEngineActions(running)).toBe(true);
    expect(engineActionsDisabled(running)).toBe(true);
    expect(engineActionsDisabled(all)).toBe(false);
  });
});
