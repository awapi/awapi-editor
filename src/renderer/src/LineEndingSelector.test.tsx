import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineEndingSelector from './LineEndingSelector';

const colors = {
  background: '#1e1e1e',
  foreground: '#ffffff',
  tabBackground: '#252526',
  tabActiveBackground: '#1e1e1e',
  tabHover: '#2d2d2d',
};

describe('LineEndingSelector', () => {
  it('renders the current EOL label', () => {
    render(<LineEndingSelector eol="LF" onChange={() => {}} colors={colors} />);
    expect(screen.getByTestId('line-ending-selector-button').textContent).toBe('LF');
  });

  it('renders CRLF when selected', () => {
    render(<LineEndingSelector eol="CRLF" onChange={() => {}} colors={colors} />);
    expect(screen.getByTestId('line-ending-selector-button').textContent).toBe('CRLF');
  });

  it('opens the menu on click and lists both options', () => {
    render(<LineEndingSelector eol="LF" onChange={() => {}} colors={colors} />);
    expect(screen.queryByTestId('line-ending-selector-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('line-ending-selector-button'));
    expect(screen.getByTestId('line-ending-selector-menu')).toBeDefined();
    expect(screen.getByTestId('line-ending-option-LF')).toBeDefined();
    expect(screen.getByTestId('line-ending-option-CRLF')).toBeDefined();
  });

  it('calls onChange with the selected EOL and closes the menu', () => {
    const onChange = vi.fn();
    render(<LineEndingSelector eol="LF" onChange={onChange} colors={colors} />);
    fireEvent.click(screen.getByTestId('line-ending-selector-button'));
    fireEvent.click(screen.getByTestId('line-ending-option-CRLF'));
    expect(onChange).toHaveBeenCalledWith('CRLF');
    expect(screen.queryByTestId('line-ending-selector-menu')).toBeNull();
  });

  it('closes the menu when clicking outside', () => {
    render(
      <div>
        <LineEndingSelector eol="LF" onChange={() => {}} colors={colors} />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByTestId('line-ending-selector-button'));
    expect(screen.getByTestId('line-ending-selector-menu')).toBeDefined();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('line-ending-selector-menu')).toBeNull();
  });
});
