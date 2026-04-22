import React, { useEffect, useRef, useState } from 'react';
import type { EolKind } from './lineEndings';
import { EOL_LABEL } from './lineEndings';

export interface LineEndingSelectorProps {
  /** Current line-ending kind for the active tab. */
  eol: EolKind;
  /** Invoked with the newly selected EOL. */
  onChange: (eol: EolKind) => void;
  /** Theme colors (mirrors LanguageSelector shape). */
  colors: {
    background: string;
    foreground: string;
    tabBackground: string;
    tabActiveBackground: string;
    tabHover: string;
  };
}

const OPTIONS: Array<{ id: EolKind; label: string; description: string }> = [
  { id: 'LF', label: 'LF', description: '\\n (Unix, macOS, Linux)' },
  { id: 'CRLF', label: 'CRLF', description: '\\r\\n (Windows)' },
];

/**
 * VS Code-style status bar line-ending selector. Shows the current EOL and
 * opens a small popover to switch between LF and CRLF.
 */
const LineEndingSelector: React.FC<LineEndingSelectorProps> = ({ eol, onChange, colors }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const handleSelect = (id: EolKind) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', marginLeft: 8 }}>
      <button
        data-testid="line-ending-selector-button"
        onClick={() => setOpen(prev => !prev)}
        title="Select End of Line Sequence"
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
        {EOL_LABEL[eol]}
      </button>

      {open && (
        <div
          data-testid="line-ending-selector-menu"
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            minWidth: '220px',
            backgroundColor: colors.background,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          {OPTIONS.map(opt => {
            const active = opt.id === eol;
            return (
              <div
                key={opt.id}
                role="option"
                aria-selected={active}
                data-testid={`line-ending-option-${opt.id}`}
                onClick={() => handleSelect(opt.id)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: colors.foreground,
                  backgroundColor: active ? colors.tabActiveBackground : 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.backgroundColor = colors.tabHover;
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{opt.label}</span>
                <span style={{ opacity: 0.6, fontSize: '11px' }}>{opt.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LineEndingSelector;
