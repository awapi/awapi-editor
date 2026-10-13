import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';
import FindInTabsPanel, {
  searchInTabs,
  replaceAllInTabs,
  expandReplacement,
  MAX_FIND_IN_TABS_RESULTS,
  FIND_IN_TABS_DEBOUNCE_MS,
  type SearchableTab,
} from './FindInTabsPanel';

const SAMPLE_TABS: SearchableTab[] = [
  {
    id: 'tab-1',
    title: 'one.txt',
    filePath: '/tmp/one.txt',
    content: 'Hello world\nhello again\nGoodbye',
  },
  {
    id: 'tab-2',
    title: 'two.txt',
    filePath: '/tmp/two.txt',
    content: 'Another HELLO line\nNothing here',
  },
];

describe('FindInTabsPanel & searchInTabs / replaceAllInTabs', () => {
  describe('searchInTabs', () => {
    it('finds case-insensitive matches across all open tabs by default', () => {
      const { matches, error } = searchInTabs(SAMPLE_TABS, 'hello');
      expect(error).toBeUndefined();
      expect(matches).toHaveLength(3);
      expect(matches[0]).toMatchObject({
        tabId: 'tab-1',
        tabTitle: 'one.txt',
        lineNumber: 1,
        column: 1,
        matchText: 'Hello',
      });
      expect(matches[1]).toMatchObject({
        tabId: 'tab-1',
        lineNumber: 2,
        column: 1,
        matchText: 'hello',
      });
      expect(matches[2]).toMatchObject({
        tabId: 'tab-2',
        lineNumber: 1,
        column: 9,
        matchText: 'HELLO',
      });
    });

    it('respects caseSensitive and wholeWord options', () => {
      const caseRes = searchInTabs(SAMPLE_TABS, 'hello', { caseSensitive: true });
      expect(caseRes.matches).toHaveLength(1);
      expect(caseRes.matches[0].lineNumber).toBe(2);

      const wordRes = searchInTabs(
        [{ id: 't', title: 't', filePath: null, content: 'cat scatter cat' }],
        'cat',
        { wholeWord: true },
      );
      expect(wordRes.matches).toHaveLength(2);
      expect(wordRes.matches.map(m => m.column)).toEqual([1, 13]);
    });

    it('supports regex search and reports invalid regex errors safely', () => {
      const regexRes = searchInTabs(SAMPLE_TABS, '[Hh]ello', { useRegex: true, caseSensitive: true });
      expect(regexRes.matches).toHaveLength(2);

      const badRegex = searchInTabs(SAMPLE_TABS, '[unclosed', { useRegex: true });
      expect(badRegex.matches).toHaveLength(0);
      expect(badRegex.error).toBeTruthy();
    });
  });

  describe('searchInTabs result cap (CR-19)', () => {
    it('stops at maxMatches and reports truncation', () => {
      const tabs: SearchableTab[] = [
        { id: 'a', title: 'a', filePath: null, content: 'x x x' },
        { id: 'b', title: 'b', filePath: null, content: 'x\nx' },
      ];
      const capped = searchInTabs(tabs, 'x', {}, 4);
      expect(capped.matches).toHaveLength(4);
      expect(capped.truncated).toBe(true);
      expect(capped.matches.map(m => m.tabId)).toEqual(['a', 'a', 'a', 'b']);

      const exact = searchInTabs(tabs, 'x', {}, 5);
      expect(exact.matches).toHaveLength(5);
      expect(exact.truncated).toBeUndefined();
    });
  });

  describe('replaceAllInTabs', () => {
    it('replaces matches across tabs and returns replacement counts', () => {
      const result = replaceAllInTabs(SAMPLE_TABS, 'hello', 'hi');
      expect(result.totalReplacements).toBe(3);
      expect(result.updatedByTabId['tab-1'].content).toBe('hi world\nhi again\nGoodbye');
      expect(result.updatedByTabId['tab-1'].replacements).toBe(2);
      expect(result.updatedByTabId['tab-2'].content).toBe('Another hi line\nNothing here');
      expect(result.updatedByTabId['tab-2'].replacements).toBe(1);
    });

    const single = (content: string): SearchableTab[] => [
      { id: 't', title: 't', filePath: null, content },
    ];

    it('anchors ^ and $ to every line, matching the search results (CR-07)', () => {
      const tabs = single('foo 1\nfoo 2\nbar foo');
      expect(searchInTabs(tabs, '^foo', { useRegex: true }).matches).toHaveLength(2);
      const result = replaceAllInTabs(tabs, '^foo', 'X', { useRegex: true });
      expect(result.updatedByTabId.t).toEqual({ content: 'X 1\nX 2\nbar foo', replacements: 2 });

      const endResult = replaceAllInTabs(single('a;\nb;\nc'), ';$', '', { useRegex: true });
      expect(endResult.updatedByTabId.t.content).toBe('a\nb\nc');
    });

    it('supports lookarounds and \\b in regex replacements (CR-07)', () => {
      const lookahead = replaceAllInTabs(single('foobar foobaz'), 'foo(?=bar)', 'X', { useRegex: true });
      expect(lookahead.updatedByTabId.t).toEqual({ content: 'Xbar foobaz', replacements: 1 });

      const lookbehind = replaceAllInTabs(single('$5 and 5'), '(?<=\\$)\\d', '9', { useRegex: true });
      expect(lookbehind.updatedByTabId.t.content).toBe('$9 and 5');

      const wordBoundary = replaceAllInTabs(single('cat scatter cat'), '\\bcat\\b', 'dog', { useRegex: true });
      expect(wordBoundary.updatedByTabId.t).toEqual({ content: 'dog scatter dog', replacements: 2 });
    });

    it('expands capture groups, $& and named groups in regex mode (CR-07)', () => {
      const groups = replaceAllInTabs(single('John Smith'), '(\\w+) (\\w+)', '$2, $1', { useRegex: true });
      expect(groups.updatedByTabId.t.content).toBe('Smith, John');

      const whole = replaceAllInTabs(single('a b'), '\\w', '[$&]', { useRegex: true });
      expect(whole.updatedByTabId.t.content).toBe('[a] [b]');

      const named = replaceAllInTabs(
        single('2024-01-31'),
        '(?<y>\\d+)-(?<m>\\d+)-(?<d>\\d+)',
        '$<d>/$<m>/$<y>',
        { useRegex: true },
      );
      expect(named.updatedByTabId.t.content).toBe('31/01/2024');
    });

    it('inserts the replacement literally when regex mode is off (CR-07)', () => {
      const result = replaceAllInTabs(single('price: X'), 'X', '$1 $& $$');
      expect(result.updatedByTabId.t.content).toBe('price: $1 $& $$');
    });

    it('does not report tabs whose content would be unchanged (CR-07)', () => {
      const result = replaceAllInTabs(single('foo'), '^', 'X', { useRegex: true });
      expect(result.totalReplacements).toBe(0);
      expect(result.updatedByTabId).toEqual({});
    });
  });

  describe('expandReplacement', () => {
    it('follows String.prototype.replace substitution rules', () => {
      const subject = 'xxabcyy';
      const captures = ['a', 'b'];
      expect(expandReplacement('$$-$&-$`-$\'', 'abc', captures, 2, subject)).toBe('$-abc-xx-yy');
      expect(expandReplacement('$2$1', 'abc', captures, 2, subject)).toBe('ba');
      expect(expandReplacement('$3', 'abc', captures, 2, subject)).toBe('$3');
      expect(expandReplacement('$10', 'abc', ['a'], 2, subject)).toBe('a0');
      expect(expandReplacement('$0', 'abc', captures, 2, subject)).toBe('$0');
      expect(expandReplacement('$<n>', 'abc', [], 2, subject)).toBe('$<n>');
      expect(expandReplacement('$<n>', 'abc', ['a'], 2, subject, { n: 'N' })).toBe('N');
      expect(expandReplacement('$', 'abc', [], 2, subject)).toBe('$');
    });

    it('matches native replace output for a variety of templates', () => {
      const regex = /(\w)(\d)?/;
      const subject = 'a1 b';
      for (const template of ['$1$2', '$2|$1', '$$1', '$&!', '$`<>$\'', '$9', '$01', '$<x>']) {
        const native = subject.replace(regex, template);
        const m = regex.exec(subject)!;
        const expanded = expandReplacement(template, m[0], m.slice(1), m.index, subject);
        expect(subject.slice(0, m.index) + expanded + subject.slice(m.index + m[0].length)).toBe(native);
      }
    });
  });

  describe('FindInTabsPanel UI', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <ThemeProvider>
          <FindInTabsPanel
            isOpen={false}
            tabs={SAMPLE_TABS}
            onClose={vi.fn()}
            onSelectMatch={vi.fn()}
            onReplaceAllInTabs={vi.fn()}
          />
        </ThemeProvider>
      );
      expect(screen.queryByTestId('find-in-tabs-panel')).toBeNull();
    });

    it('displays grouped results and invokes onSelectMatch when a result is clicked', async () => {
      const onSelectMatch = vi.fn();
      render(
        <ThemeProvider>
          <FindInTabsPanel
            isOpen={true}
            tabs={SAMPLE_TABS}
            onClose={vi.fn()}
            onSelectMatch={onSelectMatch}
            onReplaceAllInTabs={vi.fn()}
          />
        </ThemeProvider>
      );

      const queryInput = screen.getByTestId('find-in-tabs-query');
      fireEvent.change(queryInput, { target: { value: 'hello' } });

      await waitFor(() =>
        expect(screen.getByTestId('find-in-tabs-summary').textContent).toContain('3 matches in 2 tabs'),
      );

      fireEvent.click(screen.getByTestId('find-in-tabs-match-tab-2-0'));
      expect(onSelectMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: 'tab-2',
          lineNumber: 1,
          column: 9,
        }),
      );
    });

    it('replaces all matches across open tabs when Replace All in Tabs is clicked', async () => {
      const onReplaceAllInTabs = vi.fn();
      render(
        <ThemeProvider>
          <FindInTabsPanel
            isOpen={true}
            tabs={SAMPLE_TABS}
            onClose={vi.fn()}
            onSelectMatch={vi.fn()}
            onReplaceAllInTabs={onReplaceAllInTabs}
          />
        </ThemeProvider>
      );

      fireEvent.change(screen.getByTestId('find-in-tabs-query'), { target: { value: 'hello' } });
      fireEvent.change(screen.getByTestId('find-in-tabs-replace'), { target: { value: 'hey' } });
      const replaceAll = screen.getByTestId('find-in-tabs-replace-all-btn') as HTMLButtonElement;
      // Disabled until the debounced search for the new query has run.
      expect(replaceAll.disabled).toBe(true);
      await waitFor(() => expect(replaceAll.disabled).toBe(false));
      fireEvent.click(replaceAll);

      expect(onReplaceAllInTabs).toHaveBeenCalledWith(
        expect.objectContaining({
          'tab-1': { content: 'hey world\nhey again\nGoodbye', replacements: 2 },
          'tab-2': { content: 'Another hey line\nNothing here', replacements: 1 },
        }),
      );
      expect(screen.getByTestId('find-in-tabs-status').textContent).toContain(
        'Replaced 3 occurrences across 2 tabs.',
      );
    });

    describe('performance (CR-19)', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      const renderPanel = (tabs: SearchableTab[]) => {
        const ui = (t: SearchableTab[]) => (
          <ThemeProvider>
            <FindInTabsPanel
              isOpen={true}
              tabs={t}
              onClose={vi.fn()}
              onSelectMatch={vi.fn()}
              onReplaceAllInTabs={vi.fn()}
            />
          </ThemeProvider>
        );
        const result = render(ui(tabs));
        return { ...result, rerenderWith: (t: SearchableTab[]) => result.rerender(ui(t)) };
      };

      it('debounces the query before searching', () => {
        vi.useFakeTimers();
        renderPanel(SAMPLE_TABS);

        fireEvent.change(screen.getByTestId('find-in-tabs-query'), { target: { value: 'hello' } });
        expect(screen.getByTestId('find-in-tabs-summary').textContent).not.toContain('matches');

        act(() => {
          vi.advanceTimersByTime(FIND_IN_TABS_DEBOUNCE_MS);
        });
        expect(screen.getByTestId('find-in-tabs-summary').textContent).toContain('3 matches in 2 tabs');
      });

      it('does not re-search tab content on re-renders with unchanged inputs', () => {
        vi.useFakeTimers();
        let contentReads = 0;
        const tab = {
          id: 'tab-1',
          title: 'one.txt',
          filePath: null,
          get content() {
            contentReads++;
            return 'hello';
          },
        };
        const tabs = [tab];
        const { rerenderWith } = renderPanel(tabs);
        fireEvent.change(screen.getByTestId('find-in-tabs-query'), { target: { value: 'hello' } });
        act(() => {
          vi.advanceTimersByTime(FIND_IN_TABS_DEBOUNCE_MS);
        });
        expect(screen.getByTestId('find-in-tabs-summary').textContent).toContain('1 match in 1 tab');
        const readsAfterSearch = contentReads;

        rerenderWith(tabs);
        rerenderWith(tabs);
        expect(contentReads).toBe(readsAfterSearch);
      });

      it('caps the listed results and tells the user', () => {
        vi.useFakeTimers();
        const many = Array.from({ length: MAX_FIND_IN_TABS_RESULTS + 5 }, () => 'x').join('\n');
        renderPanel([{ id: 'big', title: 'big.txt', filePath: null, content: many }]);

        fireEvent.change(screen.getByTestId('find-in-tabs-query'), { target: { value: 'x' } });
        act(() => {
          vi.advanceTimersByTime(FIND_IN_TABS_DEBOUNCE_MS);
        });

        expect(screen.getByTestId('find-in-tabs-summary').textContent).toBe(
          `${MAX_FIND_IN_TABS_RESULTS}+ matches (showing the first ${MAX_FIND_IN_TABS_RESULTS})`,
        );
        expect(screen.getByTestId('find-in-tabs-truncated')).toBeTruthy();
        expect(screen.getByTestId(`find-in-tabs-match-big-${MAX_FIND_IN_TABS_RESULTS - 1}`)).toBeTruthy();
        expect(screen.queryByTestId(`find-in-tabs-match-big-${MAX_FIND_IN_TABS_RESULTS}`)).toBeNull();
      });
    });
  });
});
