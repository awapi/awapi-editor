import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SUPPORTED_LANGUAGES, getLanguageLabel, filterLanguages } from './languages';

export interface LanguageSelectorProps {
  /** Current effective language id (either explicit override or inferred). */
  languageId: string;
  /** Whether the current language was inferred from the filename. */
  inferred: boolean;
  /** Invoked with the newly selected language id. */
  onChange: (languageId: string) => void;
  /** Theme colors passed from App so the selector blends in. */
  colors: {
    background: string;
    foreground: string;
    tabBackground: string;
    tabActiveBackground: string;
    tabHover: string;
  };
}

/**
 * VS Code-style status bar language selector. Renders as a small button at the
 * bottom of the editor that opens a searchable popover list of supported languages.
 */
const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  languageId,
  inferred,
  onChange,
  colors,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const sortedLanguages = useMemo(
    () => [...SUPPORTED_LANGUAGES].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  const filteredLanguages = useMemo(
    () => filterLanguages(sortedLanguages, query),
    [sortedLanguages, query]
  );

  // Reset search state and focus the input whenever the popover opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const currentIndex = sortedLanguages.findIndex(l => l.id === languageId);
    setHighlightIndex(currentIndex >= 0 ? currentIndex : 0);
    searchRef.current?.focus();
  }, [open]); // Intentionally only re-run when the popover opens.

  // Keep the highlighted option in view while navigating with the keyboard.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlightIndex]);

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHighlightIndex(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (filteredLanguages.length > 0) {
          setHighlightIndex(i => (i + 1) % filteredLanguages.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (filteredLanguages.length > 0) {
          setHighlightIndex(i => (i - 1 + filteredLanguages.length) % filteredLanguages.length);
        }
        break;
      case 'Enter': {
        e.preventDefault();
        const lang = filteredLanguages[highlightIndex];
        if (lang) handleSelect(lang.id);
        break;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const label = getLanguageLabel(languageId);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        data-testid="language-selector-button"
        onClick={() => setOpen(prev => !prev)}
        title="Select Language Mode"
        style={{
          padding: '2px 10px',
          fontSize: '12px',
          cursor: 'pointer',
          borderRadius: '4px',
          border: `1px solid ${colors.tabHover}`,
          backgroundColor: open ? colors.tabActiveBackground : colors.tabBackground,
          color: colors.foreground,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        {inferred ? ' (auto)' : ''}
      </button>

      {open && (
        <div
          data-testid="language-selector-menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            minWidth: '200px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: colors.background,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          <div style={{ padding: '6px', borderBottom: `1px solid ${colors.tabHover}` }}>
            <input
              ref={searchRef}
              data-testid="language-selector-search"
              type="text"
              placeholder="Search languages..."
              aria-label="Search languages"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleSearchKeyDown}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '4px 8px',
                fontSize: '13px',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: colors.tabBackground,
                color: colors.foreground,
                outline: 'none',
              }}
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            data-testid="language-selector-list"
            style={{ maxHeight: '280px', overflowY: 'auto' }}
          >
            {filteredLanguages.map((lang, index) => {
              const active = lang.id === languageId;
              const highlighted = index === highlightIndex;
              return (
                <div
                  key={lang.id}
                  role="option"
                  aria-selected={active}
                  data-testid={`language-option-${lang.id}`}
                  data-highlighted={highlighted || undefined}
                  onClick={() => handleSelect(lang.id)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: highlighted
                      ? colors.tabHover
                      : active
                        ? colors.tabActiveBackground
                        : 'transparent',
                  }}
                >
                  {lang.label}
                </div>
              );
            })}
          </div>
          {filteredLanguages.length === 0 && (
            <div
              data-testid="language-selector-empty"
              style={{ padding: '6px 12px', fontSize: '13px', color: colors.foreground, opacity: 0.6 }}
            >
              No matching languages
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
