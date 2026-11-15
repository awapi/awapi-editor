import React, { useEffect, useRef } from 'react';
import type { PreviewFindMatch, PreviewFindOptions } from './previewFind';

export interface PreviewFindBarColors {
  background: string;
  foreground: string;
  border: string;
  muted: string;
  inputBackground: string;
  activeToggle: string;
  error: string;
}

export interface PreviewFindBarProps {
  query: string;
  options: PreviewFindOptions;
  matches: PreviewFindMatch[];
  activeIndex: number;
  truncated: boolean;
  error: string | null;
  showAll: boolean;
  /** Incremented by the parent to focus and select the query input. */
  focusRequest: number;
  colors: PreviewFindBarColors;
  onQueryChange: (query: string) => void;
  onToggleOption: (option: keyof PreviewFindOptions) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShowAll: () => void;
  onSelectMatch: (index: number) => void;
  onClose: () => void;
}

const OPTION_TOGGLES: Array<{ key: keyof PreviewFindOptions; label: string; title: string }> = [
  { key: 'matchCase', label: 'Aa', title: 'Match Case' },
  { key: 'wholeWord', label: 'ab', title: 'Match Whole Word' },
  { key: 'regex', label: '.*', title: 'Use Regular Expression' },
];

const PreviewFindBar: React.FC<PreviewFindBarProps> = ({
  query,
  options,
  matches,
  activeIndex,
  truncated,
  error,
  showAll,
  focusRequest,
  colors,
  onQueryChange,
  onToggleOption,
  onNext,
  onPrevious,
  onToggleShowAll,
  onSelectMatch,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  useEffect(() => {
    if (showAll && typeof activeItemRef.current?.scrollIntoView === 'function') {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [showAll, activeIndex]);

  const count = matches.length;
  const hasMatches = count > 0;
  const countLabel = error
    ? 'Invalid regex'
    : !query
      ? 'No results'
      : hasMatches
        ? `${activeIndex + 1} of ${count}${truncated ? '+' : ''}`
        : 'No results';

  const iconButton = (active = false): React.CSSProperties => ({
    minWidth: '24px',
    height: '22px',
    padding: '0 4px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${active ? colors.border : 'transparent'}`,
    borderRadius: '4px',
    backgroundColor: active ? colors.activeToggle : 'transparent',
    color: colors.foreground,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    flexShrink: 0,
  });

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.altKey) onToggleShowAll();
    else if (e.shiftKey) onPrevious();
    else onNext();
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        data-testid="preview-find-bar"
        role="search"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          padding: '4px 14px',
          backgroundColor: colors.background,
          borderBottom: `1px solid ${colors.border}`,
          fontSize: '12px',
          color: colors.foreground,
        }}
      >
        <input
          ref={inputRef}
          data-testid="preview-find-input"
          aria-label="Find in preview"
          placeholder="Find"
          value={query}
          spellCheck={false}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          style={{
            width: '220px',
            minWidth: 0,
            height: '22px',
            padding: '0 6px',
            border: `1px solid ${error ? colors.error : colors.border}`,
            borderRadius: '4px',
            backgroundColor: colors.inputBackground,
            color: colors.foreground,
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {OPTION_TOGGLES.map(toggle => (
          <button
            key={toggle.key}
            type="button"
            data-testid={`preview-find-option-${toggle.key}`}
            aria-label={toggle.title}
            aria-pressed={options[toggle.key]}
            title={toggle.title}
            onClick={() => onToggleOption(toggle.key)}
            style={iconButton(options[toggle.key])}
          >
            {toggle.label}
          </button>
        ))}
        <span
          data-testid="preview-find-count"
          role="status"
          title={error ?? undefined}
          style={{
            minWidth: '72px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            color: error || (query && !hasMatches) ? colors.error : colors.muted,
          }}
        >
          {countLabel}
        </span>
        <button
          type="button"
          data-testid="preview-find-previous"
          aria-label="Previous Match"
          title="Previous Match (Shift+Enter)"
          disabled={!hasMatches}
          onClick={onPrevious}
          style={{ ...iconButton(), opacity: hasMatches ? 1 : 0.4 }}
        >
          ↑
        </button>
        <button
          type="button"
          data-testid="preview-find-next"
          aria-label="Next Match"
          title="Next Match (Enter)"
          disabled={!hasMatches}
          onClick={onNext}
          style={{ ...iconButton(), opacity: hasMatches ? 1 : 0.4 }}
        >
          ↓
        </button>
        <button
          type="button"
          data-testid="preview-find-all"
          aria-label="Find All"
          aria-pressed={showAll}
          aria-expanded={showAll}
          title="Find All — list every match (Alt+Enter)"
          onClick={onToggleShowAll}
          style={{ ...iconButton(showAll), fontFamily: 'inherit', padding: '0 6px' }}
        >
          Find All
        </button>
        <button
          type="button"
          data-testid="preview-find-close"
          aria-label="Close Find"
          title="Close (Escape)"
          onClick={onClose}
          style={iconButton()}
        >
          ✕
        </button>
      </div>

      {showAll && (
        <div
          data-testid="preview-find-all-popup"
          role="dialog"
          aria-label="All matches"
          style={{
            position: 'absolute',
            top: '100%',
            right: '14px',
            zIndex: 20,
            width: 'min(520px, calc(100vw - 28px))',
            maxHeight: '50vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: colors.background,
            color: colors.foreground,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
            fontSize: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderBottom: `1px solid ${colors.border}`,
              fontWeight: 600,
            }}
          >
            <span data-testid="preview-find-all-summary">
              {hasMatches
                ? `${count}${truncated ? '+' : ''} ${count === 1 ? 'match' : 'matches'}${query ? ` for "${query}"` : ''}`
                : 'No matches'}
            </span>
            <button
              type="button"
              aria-label="Close Find All"
              title="Close (Escape)"
              onClick={onToggleShowAll}
              style={iconButton()}
            >
              ✕
            </button>
          </div>
          <div role="listbox" aria-label="Matches" style={{ overflowY: 'auto' }}>
            {matches.map((match, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={index}
                  ref={isActive ? activeItemRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-testid="preview-find-all-item"
                  onClick={() => onSelectMatch(index)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: '8px',
                    padding: '4px 10px',
                    border: 'none',
                    textAlign: 'left',
                    backgroundColor: isActive ? colors.activeToggle : 'transparent',
                    color: colors.foreground,
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: colors.muted, minWidth: '32px', textAlign: 'right', flexShrink: 0 }}>
                    {index + 1}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {match.before}
                    <mark
                      style={{
                        backgroundColor: 'rgba(255, 200, 0, 0.45)',
                        color: 'inherit',
                        borderRadius: '2px',
                      }}
                    >
                      {match.text}
                    </mark>
                    {match.after}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewFindBar;
