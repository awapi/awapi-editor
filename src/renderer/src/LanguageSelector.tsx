import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SUPPORTED_LANGUAGES, getLanguageLabel } from './languages';

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
 * bottom of the editor that opens a popover list of supported languages.
 */
const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  languageId,
  inferred,
  onChange,
  colors,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sortedLanguages = useMemo(
    () => [...SUPPORTED_LANGUAGES].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

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
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            minWidth: '200px',
            maxHeight: '320px',
            overflowY: 'auto',
            backgroundColor: colors.background,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          {sortedLanguages.map(lang => {
            const active = lang.id === languageId;
            return (
              <div
                key={lang.id}
                role="option"
                aria-selected={active}
                data-testid={`language-option-${lang.id}`}
                onClick={() => handleSelect(lang.id)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: colors.foreground,
                  backgroundColor: active ? colors.tabActiveBackground : 'transparent',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.backgroundColor = colors.tabHover;
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {lang.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
