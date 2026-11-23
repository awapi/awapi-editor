import React, { useRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPreviewScroll,
  getPreviewScroll,
  setPreviewScroll,
  usePreviewScrollRestore,
} from './usePreviewScrollRestore';

const Harness: React.FC<{ id: string; enabled?: boolean }> = ({ id, enabled = true }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  usePreviewScrollRestore(id, ref, enabled);
  return <div ref={ref} data-testid="body"><div>content</div></div>;
};

// jsdom doesn't lay out; emulate a scroller whose max scroll can grow later.
function mockScroller(el: HTMLElement, state: { max: number }) {
  let top = 0;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(v, state.max));
    },
  });
}

describe('usePreviewScrollRestore', () => {
  let resizeCallbacks: Array<() => void>;

  beforeEach(() => {
    resizeCallbacks = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resizeCallbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    clearPreviewScroll('a');
    clearPreviewScroll('b');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('stores scroll per key and clears it', () => {
    setPreviewScroll('a', 120);
    expect(getPreviewScroll('a')).toBe(120);
    expect(getPreviewScroll('b')).toBe(0);
    clearPreviewScroll('a');
    expect(getPreviewScroll('a')).toBe(0);
  });

  it('records scroll events and restores them on remount', () => {
    const first = render(<Harness id="a" />);
    const body = first.getByTestId('body');
    mockScroller(body, { max: 1000 });
    body.scrollTop = 400;
    fireEvent.scroll(body);
    expect(getPreviewScroll('a')).toBe(400);
    first.unmount();

    const second = render(<Harness id="a" />);
    expect(second.getByTestId('body').scrollTop).toBe(400);
  });

  it('keeps tabs independent', () => {
    setPreviewScroll('a', 300);
    setPreviewScroll('b', 50);
    const r = render(<Harness id="b" />);
    expect(r.getByTestId('body').scrollTop).toBe(50);
  });

  it('retries restoring when content grows after mount, without overwriting the saved value', () => {
    setPreviewScroll('a', 800);
    const state = { max: 100 };
    // Pre-install scroller via prototype so the layout effect sees it.
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (
      this: HTMLElement,
      v: number,
    ) {
      (this as unknown as { _t: number })._t = Math.max(0, Math.min(v, state.max));
    });
    const getSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return (this as unknown as { _t?: number })._t ?? 0;
      });

    const r = render(<Harness id="a" />);
    const body = r.getByTestId('body');
    expect(body.scrollTop).toBe(100);
    fireEvent.scroll(body); // clamped scroll event must not clobber the target
    expect(getPreviewScroll('a')).toBe(800);

    state.max = 2000;
    act(() => resizeCallbacks.forEach(cb => cb()));
    expect(body.scrollTop).toBe(800);

    spy.mockRestore();
    getSpy.mockRestore();
  });

  it('stops restoring once the user scrolls', () => {
    setPreviewScroll('a', 500);
    const r = render(<Harness id="a" />);
    const body = r.getByTestId('body');
    mockScroller(body, { max: 2000 });
    fireEvent.wheel(body);
    body.scrollTop = 20;
    fireEvent.scroll(body);
    expect(getPreviewScroll('a')).toBe(20);
    // Later content growth must not yank the user back to the old target.
    act(() => resizeCallbacks.forEach(cb => cb()));
    expect(body.scrollTop).toBe(20);
  });

  it('does nothing when disabled', () => {
    setPreviewScroll('a', 500);
    const r = render(<Harness id="a" enabled={false} />);
    const body = r.getByTestId('body');
    mockScroller(body, { max: 2000 });
    fireEvent.scroll(body);
    expect(getPreviewScroll('a')).toBe(500);
  });
});
