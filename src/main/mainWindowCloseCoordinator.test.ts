import { describe, it, expect, vi } from 'vitest';
import { createMainWindowCloseCoordinator } from './mainWindowCloseCoordinator';

function setup(dirty: number[], existing: number[] = dirty) {
  const alive = new Set(existing);
  const deps = {
    dirtyPopoutIds: vi.fn(() => dirty.filter((id) => alive.has(id))),
    promptPopoutClose: vi.fn((id: number) => alive.has(id)),
    finishMainClose: vi.fn(),
  };
  const coordinator = createMainWindowCloseCoordinator(deps);
  const close = (id: number) => {
    alive.delete(id);
    coordinator.popoutClosed(id);
  };
  return { deps, coordinator, close };
}

describe('mainWindowCloseCoordinator (CR-21)', () => {
  it('lets the main window close when no pop-out is dirty', () => {
    const { deps, coordinator } = setup([]);
    expect(coordinator.requestMainClose()).toBe(false);
    expect(deps.promptPopoutClose).not.toHaveBeenCalled();
    expect(coordinator.isClosing()).toBe(false);
  });

  it('prompts dirty pop-outs one at a time, then retries the main close', () => {
    const { deps, coordinator, close } = setup([2, 3]);

    expect(coordinator.requestMainClose()).toBe(true);
    expect(coordinator.isClosing()).toBe(true);
    expect(deps.promptPopoutClose).toHaveBeenCalledTimes(1);
    expect(deps.promptPopoutClose).toHaveBeenLastCalledWith(2);

    // A repeated close request while prompting is still prevented, without re-prompting.
    expect(coordinator.requestMainClose()).toBe(true);
    expect(deps.promptPopoutClose).toHaveBeenCalledTimes(1);

    close(2);
    expect(deps.promptPopoutClose).toHaveBeenLastCalledWith(3);
    expect(deps.finishMainClose).not.toHaveBeenCalled();

    close(3);
    expect(deps.finishMainClose).toHaveBeenCalledTimes(1);
    expect(coordinator.isClosing()).toBe(false);
  });

  it('keeps the main window open when the user cancels a prompt', () => {
    const { deps, coordinator, close } = setup([2, 3]);
    coordinator.requestMainClose();

    coordinator.popoutCloseCancelled(2);
    expect(coordinator.isClosing()).toBe(false);

    // Closing the pop-out later must not close the main window.
    close(2);
    expect(deps.finishMainClose).not.toHaveBeenCalled();
    expect(deps.promptPopoutClose).toHaveBeenCalledTimes(1);
  });

  it('aborts when a queued pop-out is cancelled, but ignores unrelated pop-outs', () => {
    const { coordinator } = setup([2, 3]);
    coordinator.requestMainClose();

    coordinator.popoutCloseCancelled(99);
    expect(coordinator.isClosing()).toBe(true);

    coordinator.popoutCloseCancelled(3);
    expect(coordinator.isClosing()).toBe(false);
  });

  it('drops queued pop-outs that close on their own', () => {
    const { deps, coordinator, close } = setup([2, 3]);
    coordinator.requestMainClose();

    close(3);
    expect(deps.promptPopoutClose).toHaveBeenCalledTimes(1);

    close(2);
    expect(deps.promptPopoutClose).not.toHaveBeenCalledWith(3);
    expect(deps.finishMainClose).toHaveBeenCalledTimes(1);
  });

  it('skips pop-outs that no longer exist and finishes when none are left', () => {
    const { deps, coordinator } = setup([2], []);
    deps.dirtyPopoutIds.mockReturnValue([2]);

    expect(coordinator.requestMainClose()).toBe(true);
    expect(deps.promptPopoutClose).toHaveBeenCalledWith(2);
    expect(deps.finishMainClose).toHaveBeenCalledTimes(1);
    expect(coordinator.isClosing()).toBe(false);
  });

  it('ignores pop-out events when no main close is pending', () => {
    const { deps, coordinator } = setup([2]);
    coordinator.popoutClosed(2);
    coordinator.popoutCloseCancelled(2);
    expect(deps.finishMainClose).not.toHaveBeenCalled();
    expect(coordinator.isClosing()).toBe(false);
  });
});
