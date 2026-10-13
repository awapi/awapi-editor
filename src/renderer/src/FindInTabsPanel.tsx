import React, { useMemo, useState } from 'react';
import { useTheme } from './theme/ThemeContext';
import { useDebouncedValue } from './useDebouncedValue';

/** Delay before the query (and edited tab content) is searched. */
export const FIND_IN_TABS_DEBOUNCE_MS = 150;
/** Maximum number of matches collected and listed in the results panel. */
export const MAX_FIND_IN_TABS_RESULTS = 1000;

export interface SearchableTab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export interface TabSearchMatch {
  tabId: string;
  tabTitle: string;
  filePath: string | null;
  lineNumber: number;
  column: number;
  matchLength: number;
  lineText: string;
  matchText: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a global RegExp for the given query and search options.
 * Returns `{ regex: null, error }` when regex compilation fails or query is empty.
 */
export function buildSearchRegex(
  query: string,
  options: SearchOptions = {},
): { regex: RegExp | null; error?: string } {
  if (!query) return { regex: null };
  let source = options.useRegex ? query : escapeRegExp(query);
  if (options.wholeWord) {
    source = `\\b(?:${source})\\b`;
  }
  const flags = options.caseSensitive ? 'g' : 'gi';
  try {
    return { regex: new RegExp(source, flags) };
  } catch (err) {
    return { regex: null, error: (err as Error).message };
  }
}

/**
 * Searches across all provided tabs and returns every line/column match, up
 * to `maxMatches`. `truncated` is true when the search stopped at the limit.
 */
export function searchInTabs(
  tabs: SearchableTab[],
  query: string,
  options: SearchOptions = {},
  maxMatches = Infinity,
): { matches: TabSearchMatch[]; error?: string; truncated?: boolean } {
  const { regex, error } = buildSearchRegex(query, options);
  if (error) return { matches: [], error };
  if (!regex) return { matches: [] };

  const matches: TabSearchMatch[] = [];

  for (const tab of tabs) {
    const lines = tab.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(lineText)) !== null) {
        if (m[0].length === 0) {
          regex.lastIndex++;
          continue;
        }
        if (matches.length >= maxMatches) return { matches, truncated: true };
        matches.push({
          tabId: tab.id,
          tabTitle: tab.title,
          filePath: tab.filePath,
          lineNumber: i + 1,
          column: m.index + 1,
          matchLength: m[0].length,
          lineText,
          matchText: m[0],
        });
      }
    }
  }

  return { matches };
}

/**
 * Expands a JavaScript replacement template (`$$`, `$&`, `` $` ``, `$'`,
 * `$1`–`$99`, `$<name>`) for a single regex match, following the same rules
 * as `String.prototype.replace`.
 */
export function expandReplacement(
  template: string,
  match: string,
  captures: (string | undefined)[],
  position: number,
  subject: string,
  namedGroups?: Record<string, string | undefined>,
): string {
  let result = '';
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    const next = template[i + 1];
    if (ch !== '$' || next === undefined) {
      result += ch;
      continue;
    }
    if (next === '$') {
      result += '$';
      i++;
    } else if (next === '&') {
      result += match;
      i++;
    } else if (next === '`') {
      result += subject.slice(0, position);
      i++;
    } else if (next === "'") {
      result += subject.slice(position + match.length);
      i++;
    } else if (next >= '0' && next <= '9') {
      const twoDigit = template.slice(i + 1, i + 3);
      const twoIndex = /^\d\d$/.test(twoDigit) ? Number(twoDigit) : NaN;
      const oneIndex = Number(next);
      if (twoIndex >= 1 && twoIndex <= captures.length) {
        result += captures[twoIndex - 1] ?? '';
        i += 2;
      } else if (oneIndex >= 1 && oneIndex <= captures.length) {
        result += captures[oneIndex - 1] ?? '';
        i++;
      } else {
        result += ch;
      }
    } else if (next === '<' && namedGroups) {
      const close = template.indexOf('>', i + 2);
      if (close === -1) {
        result += ch;
      } else {
        result += namedGroups[template.slice(i + 2, close)] ?? '';
        i = close;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Replaces all occurrences of `query` with `replacement` across all provided
 * tabs. Returns the updated content per tab and the total replacement count.
 *
 * Matching runs line by line with the same regex as `searchInTabs`, so the
 * replaced occurrences are exactly the ones listed in the search results
 * (`^`/`$` anchor to each line, lookarounds and `\b` see the whole line).
 * In regex mode the replacement supports `$1`, `$&`, `$<name>`, etc.; in
 * literal mode it is inserted verbatim.
 */
export function replaceAllInTabs(
  tabs: SearchableTab[],
  query: string,
  replacement: string,
  options: SearchOptions = {},
): {
  updatedByTabId: Record<string, { content: string; replacements: number }>;
  totalReplacements: number;
  error?: string;
} {
  const { regex, error } = buildSearchRegex(query, options);
  if (error) return { updatedByTabId: {}, totalReplacements: 0, error };
  if (!regex) return { updatedByTabId: {}, totalReplacements: 0 };

  const updatedByTabId: Record<string, { content: string; replacements: number }> = {};
  let totalReplacements = 0;

  for (const tab of tabs) {
    let tabCount = 0;
    const nextContent = tab.content
      .split('\n')
      .map(line =>
        line.replace(regex, (...args: unknown[]) => {
          const matched = args[0] as string;
          // Empty matches are never listed by searchInTabs, so leave them alone.
          if (matched.length === 0) return matched;
          tabCount++;
          if (!options.useRegex) return replacement;
          const hasNamedGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
          const namedGroups = hasNamedGroups
            ? (args[args.length - 1] as Record<string, string | undefined>)
            : undefined;
          const tail = hasNamedGroups ? 3 : 2;
          const captures = args.slice(1, args.length - tail) as (string | undefined)[];
          const position = args[args.length - tail] as number;
          return expandReplacement(replacement, matched, captures, position, line, namedGroups);
        }),
      )
      .join('\n');

    if (tabCount > 0 && nextContent !== tab.content) {
      updatedByTabId[tab.id] = { content: nextContent, replacements: tabCount };
      totalReplacements += tabCount;
    }
  }

  return { updatedByTabId, totalReplacements };
}

interface FindInTabsPanelProps {
  isOpen: boolean;
  tabs: SearchableTab[];
  onClose: () => void;
  onSelectMatch: (match: TabSearchMatch) => void;
  onReplaceAllInTabs: (updatedByTabId: Record<string, { content: string; replacements: number }>) => void;
}

const FindInTabsPanel: React.FC<FindInTabsPanelProps> = ({
  isOpen,
  tabs,
  onClose,
  onSelectMatch,
  onReplaceAllInTabs,
}) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Search on debounced inputs so typing (in the query box or the editor)
  // doesn't re-scan every tab on each keystroke, and memoize so unrelated
  // App re-renders don't trigger a search at all.
  const searchQuery = useDebouncedValue(query, FIND_IN_TABS_DEBOUNCE_MS);
  const searchTabs = useDebouncedValue(tabs, FIND_IN_TABS_DEBOUNCE_MS);
  const searchPending = query !== searchQuery;

  const { matches, error, truncated } = useMemo(
    () =>
      isOpen
        ? searchInTabs(searchTabs, searchQuery, { caseSensitive, wholeWord, useRegex }, MAX_FIND_IN_TABS_RESULTS)
        : { matches: [] as TabSearchMatch[] },
    [isOpen, searchTabs, searchQuery, caseSensitive, wholeWord, useRegex],
  );

  const matchesByTab = useMemo(() => {
    const groups = new Map<string, { tabTitle: string; filePath: string | null; items: TabSearchMatch[] }>();
    for (const match of matches) {
      const existing = groups.get(match.tabId);
      if (existing) {
        existing.items.push(match);
      } else {
        groups.set(match.tabId, {
          tabTitle: match.tabTitle,
          filePath: match.filePath,
          items: [match],
        });
      }
    }
    return groups;
  }, [matches]);

  if (!isOpen) return null;

  const replaceAllDisabled = !query || searchPending || !!error || matches.length === 0;

  const handleReplaceAll = () => {
    if (replaceAllDisabled) return;
    const result = replaceAllInTabs(tabs, query, replacement, {
      caseSensitive,
      wholeWord,
      useRegex,
    });
    if (result.error) return;
    if (result.totalReplacements > 0) {
      onReplaceAllInTabs(result.updatedByTabId);
      const tabCount = Object.keys(result.updatedByTabId).length;
      setStatusMessage(
        `Replaced ${result.totalReplacements} occurrence${result.totalReplacements === 1 ? '' : 's'} across ${tabCount} tab${tabCount === 1 ? '' : 's'}.`,
      );
    } else {
      setStatusMessage('No matches found to replace.');
    }
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 7px',
    fontSize: '11px',
    fontFamily: 'monospace',
    borderRadius: '3px',
    cursor: 'pointer',
    border: `1px solid ${active ? colors.tabBorder : colors.tabHover}`,
    backgroundColor: active ? colors.tabBorder : colors.tabBackground,
    color: active ? '#fff' : colors.foreground,
  });

  return (
    <div
      data-testid="find-in-tabs-panel"
      role="region"
      aria-label="Find in All Open Tabs"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '240px',
        minHeight: '160px',
        maxHeight: '45vh',
        borderTop: `1px solid ${colors.tabHover}`,
        backgroundColor: colors.tabBackground,
        color: colors.foreground,
        flexShrink: 0,
      }}
    >
      {/* Header / controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: `1px solid ${colors.tabHover}`,
          backgroundColor: colors.background,
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, marginRight: '4px' }}>
          Find in Open Tabs
        </span>
        <input
          data-testid="find-in-tabs-query"
          autoFocus
          value={query}
          placeholder="Search in all open tabs…"
          onChange={e => {
            setQuery(e.target.value);
            if (statusMessage) setStatusMessage(null);
          }}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            minWidth: '180px',
            color: colors.foreground,
            backgroundColor: colors.tabBackground,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
          }}
        />
        <input
          data-testid="find-in-tabs-replace"
          value={replacement}
          placeholder="Replace with…"
          onChange={e => {
            setReplacement(e.target.value);
            if (statusMessage) setStatusMessage(null);
          }}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            minWidth: '150px',
            color: colors.foreground,
            backgroundColor: colors.tabBackground,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
          }}
        />
        <button
          data-testid="find-in-tabs-case-toggle"
          title="Match Case"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive(prev => !prev)}
          style={toggleBtnStyle(caseSensitive)}
        >
          Aa
        </button>
        <button
          data-testid="find-in-tabs-word-toggle"
          title="Match Whole Word"
          aria-pressed={wholeWord}
          onClick={() => setWholeWord(prev => !prev)}
          style={toggleBtnStyle(wholeWord)}
        >
          ab
        </button>
        <button
          data-testid="find-in-tabs-regex-toggle"
          title="Use Regular Expression"
          aria-pressed={useRegex}
          onClick={() => setUseRegex(prev => !prev)}
          style={toggleBtnStyle(useRegex)}
        >
          .*
        </button>
        <button
          data-testid="find-in-tabs-replace-all-btn"
          disabled={replaceAllDisabled}
          onClick={handleReplaceAll}
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            borderRadius: '4px',
            border: `1px solid ${colors.tabBorder}`,
            backgroundColor: colors.tabBorder,
            color: '#fff',
            cursor: replaceAllDisabled ? 'not-allowed' : 'pointer',
            opacity: replaceAllDisabled ? 0.5 : 1,
          }}
        >
          Replace All in Tabs
        </button>

        <span
          data-testid="find-in-tabs-summary"
          style={{ fontSize: '11px', opacity: 0.75, marginLeft: 'auto' }}
        >
          {error
            ? `Invalid regex: ${error}`
            : searchQuery
            ? truncated
              ? `${MAX_FIND_IN_TABS_RESULTS}+ matches (showing the first ${MAX_FIND_IN_TABS_RESULTS})`
              : `${matches.length} match${matches.length === 1 ? '' : 'es'} in ${matchesByTab.size} tab${matchesByTab.size === 1 ? '' : 's'}`
            : statusMessage ?? `Searching ${tabs.length} open tab${tabs.length === 1 ? '' : 's'}`}
        </span>

        <button
          data-testid="find-in-tabs-close-btn"
          aria-label="Close Find in Open Tabs"
          onClick={onClose}
          style={{
            padding: '2px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            border: `1px solid ${colors.tabHover}`,
            backgroundColor: 'transparent',
            color: colors.foreground,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      {/* Results list */}
      <div
        data-testid="find-in-tabs-results"
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '6px 12px',
          fontSize: '12px',
        }}
      >
        {statusMessage && (
          <div
            data-testid="find-in-tabs-status"
            style={{ marginBottom: '6px', fontSize: '12px', opacity: 0.85 }}
          >
            {statusMessage}
          </div>
        )}
        {!searchQuery && !statusMessage && (
          <div style={{ opacity: 0.6, padding: '8px 0' }}>
            Type a search query above to find matches across all open tabs.
          </div>
        )}
        {searchQuery && !error && matches.length === 0 && (
          <div data-testid="find-in-tabs-empty" style={{ opacity: 0.6, padding: '8px 0' }}>
            No matches found across open tabs.
          </div>
        )}
        {Array.from(matchesByTab.entries()).map(([tabId, group]) => (
          <div key={tabId} style={{ marginBottom: '8px' }} data-testid={`find-in-tabs-group-${tabId}`}>
            <div style={{ fontWeight: 600, marginBottom: '2px', opacity: 0.9 }}>
              {group.tabTitle}{' '}
              <span style={{ opacity: 0.6, fontWeight: 400 }}>
                ({group.items.length})
              </span>
            </div>
            {group.items.map((item, idx) => (
              <div
                key={`${item.lineNumber}:${item.column}:${idx}`}
                data-testid={`find-in-tabs-match-${tabId}-${idx}`}
                onClick={() => onSelectMatch(item)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ opacity: 0.6, minWidth: '56px', flexShrink: 0 }}>
                  {item.lineNumber}:{item.column}
                </span>
                <span
                  style={{
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.lineText}
                </span>
              </div>
            ))}
          </div>
        ))}
        {truncated && (
          <div data-testid="find-in-tabs-truncated" style={{ opacity: 0.7, padding: '4px 0' }}>
            Only the first {MAX_FIND_IN_TABS_RESULTS} matches are shown. Refine your search to narrow the results.
          </div>
        )}
      </div>
    </div>
  );
};

export default FindInTabsPanel;
