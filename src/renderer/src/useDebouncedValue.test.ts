import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 100));
    expect(result.current).toBe('a');
  });

  it('updates only after the value has been stable for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 100), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // The timer restarted on 'abc', so the old value is still returned.
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(result.current).toBe('abc');
  });

  it('does not schedule an update when the value returns to the debounced one', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 100), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    rerender({ value: 'a' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('a');
  });
});
