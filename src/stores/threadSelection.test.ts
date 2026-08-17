import { beforeEach, describe, expect, it } from 'vitest';
import { useThreadsStore } from './threadsStore';

// v23 sidebar multi-select (Ocean 2026-08-17「和 vscode 逻辑一样」). Only the click rules are
// exercised here — they are the part with edges, and the part a user notices instantly when
// it is wrong. The actions a selection feeds (moveMany / removeMany) go through the same
// per-row calls the single case already uses.
describe('clickRow (VS Code selection rules)', () => {
  const ordered = ['a', 'b', 'c', 'd'];
  const click = (id: string, mods: { meta?: boolean; shift?: boolean } = {}): void =>
    useThreadsStore
      .getState()
      .clickRow(id, ordered, { meta: mods.meta ?? false, shift: mods.shift ?? false });
  const selected = (): string[] => [...useThreadsStore.getState().selectedIds];

  beforeEach(() => {
    useThreadsStore.setState({
      selectedIds: new Set<string>(),
      selectionAnchorId: null,
      activeId: null,
      pinnedView: null,
    });
  });

  it('opens the project and selects only it on a plain click', () => {
    click('a');
    click('c');
    expect(selected()).toEqual(['c']);
    expect(useThreadsStore.getState().activeId).toBe('c');
  });

  it('adds and removes one row on ⌘-click', () => {
    click('a');
    click('c', { meta: true });
    expect(selected().sort()).toEqual(['a', 'c']);
    click('c', { meta: true });
    expect(selected()).toEqual(['a']);
  });

  // ⚠️ The reason ⌘ must not touch activeId: extending a selection while reading a project
  // would swap the main area out from under the user on every ⌘-click.
  it('leaves the open project alone while ⌘-clicking', () => {
    click('a');
    click('c', { meta: true });
    click('d', { meta: true });
    expect(useThreadsStore.getState().activeId).toBe('a');
  });

  it('selects the run between the anchor and the row on ⇧-click, in both directions', () => {
    click('b');
    click('d', { shift: true });
    expect(selected()).toEqual(['b', 'c', 'd']);

    click('d');
    click('b', { shift: true });
    expect(selected()).toEqual(['b', 'c', 'd']);
  });

  it('re-measures the run from the anchor, not from the last ⇧-click', () => {
    click('a');
    click('d', { shift: true });
    click('b', { shift: true });
    expect(selected()).toEqual(['a', 'b']);
  });

  it('moves the anchor to the last ⌘-clicked row', () => {
    click('a');
    click('c', { meta: true });
    click('d', { shift: true });
    expect(selected()).toEqual(['c', 'd']);
  });

  // ⇧ with nothing to measure from is just a click — never a silent no-op, and never a run
  // starting from whatever happened to be selected first.
  it('falls back to a plain click when there is no anchor', () => {
    click('c', { shift: true });
    expect(selected()).toEqual(['c']);
    expect(useThreadsStore.getState().activeId).toBe('c');
  });

  // ⚠️ The anchor can live in another list (最近 and a workspace draw the same project). A run
  // across two lists has no meaning, so the click becomes a fresh anchor rather than
  // selecting rows between two points the user cannot see as one column.
  it('starts over when the anchor is not in this list', () => {
    useThreadsStore.setState({ selectionAnchorId: 'z', selectedIds: new Set(['z']) });
    click('c', { shift: true });
    expect(selected()).toEqual(['c']);
  });
});
