import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from './theme/ThemeContext';

interface GoToLineModalProps {
  isOpen: boolean;
  currentLine: number;
  maxLine: number;
  onGoToLine: (lineNumber: number, column?: number) => void;
  onClose: () => void;
}

/**
 * Parses a "line" or "line:column" input string into 1-based line and column
 * numbers, clamped to `[1, maxLine]`. Returns `null` if the line portion is
 * not a valid positive integer.
 */
export function parseGoToLineInput(
  raw: string,
  maxLine: number,
): { lineNumber: number; column: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = /^(\d+)(?::(\d+))?$/.exec(trimmed);
  if (!match) return null;

  const parsedLine = parseInt(match[1], 10);
  if (!Number.isFinite(parsedLine) || parsedLine < 1) return null;

  const safeMax = Math.max(1, maxLine);
  const lineNumber = Math.min(Math.max(1, parsedLine), safeMax);

  const parsedCol = match[2] !== undefined ? parseInt(match[2], 10) : 1;
  const column = Number.isFinite(parsedCol) && parsedCol >= 1 ? parsedCol : 1;

  return { lineNumber, column };
}

const GoToLineModal: React.FC<GoToLineModalProps> = ({
  isOpen,
  currentLine,
  maxLine,
  onGoToLine,
  onClose,
}) => {
  const { colors } = useTheme();
  const [input, setInput] = useState(String(currentLine));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInput(String(currentLine));
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isOpen, currentLine]);

  if (!isOpen) return null;

  const safeMax = Math.max(1, maxLine);

  const handleSubmit = () => {
    const parsed = parseGoToLineInput(input, safeMax);
    if (!parsed) {
      setError(`Enter a valid line number between 1 and ${safeMax} (or line:column).`);
      return;
    }
    onGoToLine(parsed.lineNumber, parsed.column);
    onClose();
  };

  return (
    <div
      data-testid="goto-line-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        data-testid="goto-line-modal"
        role="dialog"
        aria-label="Go to Line"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: colors.background,
          color: colors.foreground,
          border: `1px solid ${colors.tabHover}`,
          borderRadius: '6px',
          padding: '20px 24px',
          minWidth: '340px',
          boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
          Go to Line / Column
        </div>
        <div
          data-testid="goto-line-range-hint"
          style={{ fontSize: '12px', opacity: 0.7, marginBottom: '10px' }}
        >
          Enter a line number between 1 and {safeMax} (optionally <code>line:column</code>)
        </div>
        <input
          ref={inputRef}
          data-testid="goto-line-input"
          autoFocus
          value={input}
          placeholder={`1..${safeMax}`}
          onChange={e => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '13px',
            color: colors.foreground,
            backgroundColor: colors.tabHover,
            border: `1px solid ${colors.tabHover}`,
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <div
            data-testid="goto-line-error"
            style={{ marginTop: '8px', fontSize: '12px', color: '#e06c75' }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button
            data-testid="goto-line-cancel"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              color: colors.foreground,
              backgroundColor: 'transparent',
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="goto-line-submit"
            onClick={handleSubmit}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              color: '#fff',
              backgroundColor: colors.tabBorder,
              border: `1px solid ${colors.tabBorder}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoToLineModal;
