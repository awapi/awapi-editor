import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionPersistence, loadSession, SessionData } from './useSessionPersistence';

describe('useSessionPersistence', () => {
  let mockSaveSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSaveSession = vi.fn().mockResolvedValue(true);
    (window as any).electronAPI = { saveSession: mockSaveSession };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  it('does not save immediately on mount', () => {
    const tabs = [{ id: '1', title: 'Untitled', filePath: null, content: 'hello', isDirty: true }];
    renderHook(() => useSessionPersistence(tabs, '1'));
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('saves session after debounce delay', () => {
    const tabs = [{ id: '1', title: 'Untitled', filePath: null, content: 'hello', isDirty: true }];
    renderHook(() => useSessionPersistence(tabs, '1'));

    act(() => { vi.advanceTimersByTime(800); });

    expect(mockSaveSession).toHaveBeenCalledOnce();
    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.activeTabId).toBe('1');
    expect(call.tabs).toHaveLength(1);
    expect(call.tabs[0].content).toBe('hello');
    expect(call.tabs[0].isDirty).toBe(true);
  });

  it('stores content for unsaved files (no filePath)', () => {
    const tabs = [{ id: '1', title: 'Untitled', filePath: null, content: 'draft text', isDirty: false }];
    renderHook(() => useSessionPersistence(tabs, '1'));
    act(() => { vi.advanceTimersByTime(800); });

    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.tabs[0].content).toBe('draft text');
  });

  it('omits content for clean saved files to let restore re-read from disk', () => {
    const tabs = [{ id: '1', title: 'file.txt', filePath: '/home/user/file.txt', content: 'disk content', isDirty: false }];
    renderHook(() => useSessionPersistence(tabs, '1'));
    act(() => { vi.advanceTimersByTime(800); });

    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.tabs[0].content).toBe('');
    expect(call.tabs[0].filePath).toBe('/home/user/file.txt');
    expect(call.tabs[0].isDirty).toBe(false);
  });

  it('stores content for dirty saved files', () => {
    const tabs = [{ id: '1', title: 'file.txt', filePath: '/home/user/file.txt', content: 'modified', isDirty: true }];
    renderHook(() => useSessionPersistence(tabs, '1'));
    act(() => { vi.advanceTimersByTime(800); });

    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.tabs[0].content).toBe('modified');
  });

  it('debounces multiple rapid changes into a single save', () => {
    const { rerender } = renderHook(
      ({ tabs, active }: { tabs: typeof initialTabs; active: string }) =>
        useSessionPersistence(tabs, active),
      {
        initialProps: {
          tabs: [{ id: '1', title: 'T', filePath: null, content: 'a', isDirty: true }],
          active: '1',
        },
      }
    );

    act(() => { vi.advanceTimersByTime(400); });
    rerender({ tabs: [{ id: '1', title: 'T', filePath: null, content: 'ab', isDirty: true }], active: '1' });
    act(() => { vi.advanceTimersByTime(400); });
    rerender({ tabs: [{ id: '1', title: 'T', filePath: null, content: 'abc', isDirty: true }], active: '1' });
    act(() => { vi.advanceTimersByTime(800); });

    expect(mockSaveSession).toHaveBeenCalledOnce();
    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.tabs[0].content).toBe('abc');
  });

  it('handles multiple tabs correctly', () => {
    const tabs = [
      { id: '1', title: 'clean.txt', filePath: '/clean.txt', content: 'on disk', isDirty: false },
      { id: '2', title: 'dirty.txt', filePath: '/dirty.txt', content: 'unsaved edits', isDirty: true },
      { id: '3', title: 'Untitled', filePath: null, content: 'new file', isDirty: false },
    ];
    renderHook(() => useSessionPersistence(tabs, '2'));
    act(() => { vi.advanceTimersByTime(800); });

    const call = mockSaveSession.mock.calls[0][0] as SessionData;
    expect(call.activeTabId).toBe('2');
    expect(call.tabs[0].content).toBe('');          // clean → omitted
    expect(call.tabs[1].content).toBe('unsaved edits'); // dirty → stored
    expect(call.tabs[2].content).toBe('new file');      // no path → stored
  });

  it('does nothing when electronAPI is unavailable', () => {
    delete (window as any).electronAPI;
    const tabs = [{ id: '1', title: 'T', filePath: null, content: '', isDirty: false }];
    expect(() => {
      renderHook(() => useSessionPersistence(tabs, '1'));
      act(() => { vi.advanceTimersByTime(800); });
    }).not.toThrow();
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('does not save when enabled is false (popout mode)', () => {
    const tabs = [{ id: '1', title: 'Untitled', filePath: null, content: 'hello', isDirty: true }];
    renderHook(() => useSessionPersistence(tabs, '1', false));
    act(() => { vi.advanceTimersByTime(800); });
    expect(mockSaveSession).not.toHaveBeenCalled();
  });
});

// workaround: variable needed to satisfy TypeScript for destructured prop type
const initialTabs = [{ id: '1', title: 'T', filePath: null, content: 'a', isDirty: true }];

describe('loadSession', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  it('returns session data from electronAPI', async () => {
    const mockSession: SessionData = {
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', title: 'notes.txt', filePath: '/notes.txt', content: '', isDirty: false }],
    };
    (window as any).electronAPI = { loadSession: vi.fn().mockResolvedValue(mockSession) };

    const result = await loadSession();
    expect(result).toEqual(mockSession);
  });

  it('returns null when electronAPI is unavailable', async () => {
    const result = await loadSession();
    expect(result).toBeNull();
  });

  it('returns null when IPC throws', async () => {
    (window as any).electronAPI = {
      loadSession: vi.fn().mockRejectedValue(new Error('IPC error')),
    };

    const result = await loadSession();
    expect(result).toBeNull();
  });
});
