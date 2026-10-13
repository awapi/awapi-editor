import React, { useEffect, useRef, useState } from 'react';
import type { EncodingKind } from '../../shared/encodings';
import { ENCODING_LABEL, ENCODING_OPTIONS } from '../../shared/encodings';

export type EncodingAction = 'reopen' | 'save';

export interface EncodingSelectorProps {
  /** Current character encoding for the active tab. */
  encoding: EncodingKind;
  /** Whether the tab is backed by a file on disk (required for "Reopen with Encoding"). */
  canReopen: boolean;
  /** Re-read the file from disk, decoding it with the chosen encoding. */
  onReopenWithEncoding: (encoding: EncodingKind) => void;
  /** Save the tab using the chosen encoding. */
  onSaveWithEncoding: (encoding: EncodingKind) => void;
  /** Theme colors (mirrors LineEndingSelector shape). */
  colors: {
    background: string;
    foreground: string;
    tabBackground: string;
    tabActiveBackground: string;
    tabHover: string;
  };
}

const ACTION_LABEL: Record<EncodingAction, string> = {
  reopen: 'Reopen with Encoding',
  save: 'Save with Encoding',
};

/**
 * Status-bar character encoding selector. Displays the current encoding
 * (`UTF-8`, `UTF-8 with BOM`, `UTF-16 LE`, `UTF-16 BE`, `ISO-8859-1`) and
 * opens a popover offering two actions, as in VS Code:
 * - **Reopen with Encoding** re-decodes the file on disk (fixes mis-detection);
 * - **Save with Encoding** writes the buffer in the chosen encoding.
 * Neither action rewrites the in-memory text on its own, so picking an
 * encoding can no longer silently replace characters.
 */
const EncodingSelector: React.FC<EncodingSelectorProps> = ({
  encoding,
  canReopen,
  onReopenWithEncoding,
  onSaveWithEncoding,
  colors,
}) => {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<EncodingAction | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const toggleOpen = () => {
    setAction(null);
    setOpen(prev => !prev);
  };

  const handleSelect = (id: EncodingKind) => {
    if (action === 'reopen') onReopenWithEncoding(id);
    else if (action === 'save') onSaveWithEncoding(id);
    setOpen(false);
    setAction(null);
  };

  const itemStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    padding: '6px 12px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontSize: '13px',
    color: colors.foreground,
    backgroundColor: active ? colors.tabActiveBackground : 'transparent',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  });

  const hoverHandlers = (active: boolean, disabled = false) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active && !disabled) e.currentTarget.style.backgroundColor = colors.tabHover;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active && !disabled) e.currentTarget.style.backgroundColor = 'transparent';
    },
  });

  return (
    <div ref={containerRef} style={{ position: 'relative', marginLeft: 8 }}>
      <button
        data-testid="encoding-selector-button"
        onClick={toggleOpen}
        title="Select Character Encoding"
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
        {ENCODING_LABEL[encoding] ?? ENCODING_LABEL['utf-8']}
      </button>

      {open && (
        <div
          data-testid="encoding-selector-menu"
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            minWidth: '270px',
            backgroundColor: colors.background,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          {action === null ? (
            <>
              {(['reopen', 'save'] as const).map(kind => {
                const disabled = kind === 'reopen' && !canReopen;
                return (
                  <div
                    key={kind}
                    role="option"
                    aria-selected={false}
                    aria-disabled={disabled || undefined}
                    data-testid={`encoding-action-${kind}`}
                    title={disabled ? 'Save the file first to reopen it with a different encoding' : undefined}
                    onClick={() => {
                      if (!disabled) setAction(kind);
                    }}
                    style={itemStyle(false, disabled)}
                    {...hoverHandlers(false, disabled)}
                  >
                    <span>{ACTION_LABEL[kind]}</span>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div
                data-testid="encoding-menu-header"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  opacity: 0.7,
                  color: colors.foreground,
                  borderBottom: `1px solid ${colors.tabHover}`,
                }}
              >
                {ACTION_LABEL[action]}
              </div>
              {ENCODING_OPTIONS.map(opt => {
                const active = opt.id === encoding;
                return (
                  <div
                    key={opt.id}
                    role="option"
                    aria-selected={active}
                    data-testid={`encoding-option-${opt.id}`}
                    onClick={() => handleSelect(opt.id)}
                    style={itemStyle(active)}
                    {...hoverHandlers(active)}
                  >
                    <span>{opt.label}</span>
                    <span style={{ opacity: 0.6, fontSize: '11px' }}>{opt.description}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EncodingSelector;
