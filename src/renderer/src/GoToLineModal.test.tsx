import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';
import GoToLineModal, { parseGoToLineInput } from './GoToLineModal';

describe('GoToLineModal & parseGoToLineInput', () => {
  describe('parseGoToLineInput', () => {
    it('parses a plain line number and defaults column to 1', () => {
      expect(parseGoToLineInput('15', 100)).toEqual({ lineNumber: 15, column: 1 });
    });

    it('parses line:column syntax', () => {
      expect(parseGoToLineInput('12:8', 50)).toEqual({ lineNumber: 12, column: 8 });
    });

    it('clamps line numbers above maxLine to maxLine', () => {
      expect(parseGoToLineInput('999', 42)).toEqual({ lineNumber: 42, column: 1 });
    });

    it('returns null for empty, zero, negative, or non-numeric inputs', () => {
      expect(parseGoToLineInput('', 10)).toBeNull();
      expect(parseGoToLineInput('   ', 10)).toBeNull();
      expect(parseGoToLineInput('0', 10)).toBeNull();
      expect(parseGoToLineInput('-5', 10)).toBeNull();
      expect(parseGoToLineInput('abc', 10)).toBeNull();
    });
  });

  describe('GoToLineModal component', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <ThemeProvider>
          <GoToLineModal
            isOpen={false}
            currentLine={1}
            maxLine={10}
            onGoToLine={vi.fn()}
            onClose={vi.fn()}
          />
        </ThemeProvider>
      );
      expect(screen.queryByTestId('goto-line-modal')).toBeNull();
    });

    it('submits valid line number and closes', () => {
      const onGoToLine = vi.fn();
      const onClose = vi.fn();
      render(
        <ThemeProvider>
          <GoToLineModal
            isOpen={true}
            currentLine={3}
            maxLine={25}
            onGoToLine={onGoToLine}
            onClose={onClose}
          />
        </ThemeProvider>
      );

      const input = screen.getByTestId('goto-line-input') as HTMLInputElement;
      expect(input.value).toBe('3');

      fireEvent.change(input, { target: { value: '18:4' } });
      fireEvent.click(screen.getByTestId('goto-line-submit'));

      expect(onGoToLine).toHaveBeenCalledWith(18, 4);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows an error when submitting invalid input', () => {
      const onGoToLine = vi.fn();
      const onClose = vi.fn();
      render(
        <ThemeProvider>
          <GoToLineModal
            isOpen={true}
            currentLine={1}
            maxLine={20}
            onGoToLine={onGoToLine}
            onClose={onClose}
          />
        </ThemeProvider>
      );

      const input = screen.getByTestId('goto-line-input');
      fireEvent.change(input, { target: { value: 'not-a-line' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByTestId('goto-line-error')).toBeTruthy();
      expect(onGoToLine).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape or backdrop click', () => {
      const onClose = vi.fn();
      render(
        <ThemeProvider>
          <GoToLineModal
            isOpen={true}
            currentLine={1}
            maxLine={10}
            onGoToLine={vi.fn()}
            onClose={onClose}
          />
        </ThemeProvider>
      );

      const input = screen.getByTestId('goto-line-input');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('goto-line-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });
});
