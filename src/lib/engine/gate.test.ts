import { describe, expect, it } from 'vitest';
import {
  canShowEngineActions,
  effectiveAutoRoute,
  engineActionsDisabled,
  type EngineGateInput,
} from './gate';

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

  // §1.2: a task already queued for THIS thread disables rather than hides — hiding
  // would make the menu jump under the user's cursor.
  it('disables while this thread already has a task, without hiding', () => {
    const busy = { ...all, busyOnThisThread: true };
    expect(canShowEngineActions(busy)).toBe(true);
    expect(engineActionsDisabled(busy)).toBe(true);
    expect(engineActionsDisabled(all)).toBe(false);
  });

  // M2: the lock is per thread, not global. A run on one project must not lock every
  // other project's menu, or the serial queue could never be filled.
  it('leaves another thread selectable while one is running', () => {
    expect(engineActionsDisabled({ ...all, busyOnThisThread: false })).toBe(false);
  });
});

describe('effectiveAutoRoute (W2)', () => {
  it('takes the road that was asked for when it is walkable', () => {
    expect(effectiveAutoRoute('cli', true, true)).toBe('cli');
    expect(effectiveAutoRoute('api', true, true)).toBe('api');
  });

  it('⭐ falls back rather than silently doing nothing', () => {
    // 打开了「每周自动回顾一次」却一次都不跑,是用户发现不了的那种坏。
    expect(effectiveAutoRoute('cli', false, true)).toBe('api');
    expect(effectiveAutoRoute('api', true, false)).toBe('cli');
  });

  it('两条都走不通就一条都不跑', () => {
    expect(effectiveAutoRoute('cli', false, false)).toBeNull();
    expect(effectiveAutoRoute('api', false, false)).toBeNull();
  });
});
