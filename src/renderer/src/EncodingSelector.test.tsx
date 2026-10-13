import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EncodingSelector, { type EncodingSelectorProps } from './EncodingSelector';

const colors = {
  background: '#1e1e1e',
  foreground: '#ffffff',
  tabBackground: '#252526',
  tabActiveBackground: '#1e1e1e',
  tabHover: '#2d2d2d',
};

const renderSelector = (props: Partial<EncodingSelectorProps> = {}) => {
  const onReopenWithEncoding = vi.fn();
  const onSaveWithEncoding = vi.fn();
  const utils = render(
    <EncodingSelector
      encoding="utf-8"
      canReopen
      onReopenWithEncoding={onReopenWithEncoding}
      onSaveWithEncoding={onSaveWithEncoding}
      colors={colors}
      {...props}
    />,
  );
  return { ...utils, onReopenWithEncoding, onSaveWithEncoding };
};

describe('EncodingSelector', () => {
  it('renders the current encoding label', () => {
    renderSelector();
    expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8');
  });

  it('renders UTF-8 with BOM and UTF-16 LE labels when selected', () => {
    const { rerender } = renderSelector({ encoding: 'utf-8-bom' });
    expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8 with BOM');

    rerender(
      <EncodingSelector
        encoding="utf-16le"
        canReopen
        onReopenWithEncoding={() => {}}
        onSaveWithEncoding={() => {}}
        colors={colors}
      />,
    );
    expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-16 LE');
  });

  it('first offers Reopen with Encoding and Save with Encoding (CR-08)', () => {
    renderSelector();
    expect(screen.queryByTestId('encoding-selector-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    expect(screen.getByTestId('encoding-action-reopen').textContent).toBe('Reopen with Encoding');
    expect(screen.getByTestId('encoding-action-save').textContent).toBe('Save with Encoding');
    expect(screen.queryByTestId('encoding-option-utf-8')).toBeNull();
  });

  it('lists all supported encodings after choosing an action', () => {
    renderSelector();
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    fireEvent.click(screen.getByTestId('encoding-action-save'));
    expect(screen.getByTestId('encoding-menu-header').textContent).toBe('Save with Encoding');
    for (const id of ['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'iso-8859-1']) {
      expect(screen.getByTestId(`encoding-option-${id}`)).toBeDefined();
    }
    expect(screen.getByTestId('encoding-option-utf-8').getAttribute('aria-selected')).toBe('true');
  });

  it('calls onSaveWithEncoding with the selected encoding and closes the menu', () => {
    const { onSaveWithEncoding, onReopenWithEncoding } = renderSelector();
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    fireEvent.click(screen.getByTestId('encoding-action-save'));
    fireEvent.click(screen.getByTestId('encoding-option-iso-8859-1'));
    expect(onSaveWithEncoding).toHaveBeenCalledWith('iso-8859-1');
    expect(onReopenWithEncoding).not.toHaveBeenCalled();
    expect(screen.queryByTestId('encoding-selector-menu')).toBeNull();
  });

  it('calls onReopenWithEncoding with the selected encoding', () => {
    const { onSaveWithEncoding, onReopenWithEncoding } = renderSelector();
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    fireEvent.click(screen.getByTestId('encoding-action-reopen'));
    expect(screen.getByTestId('encoding-menu-header').textContent).toBe('Reopen with Encoding');
    fireEvent.click(screen.getByTestId('encoding-option-utf-16le'));
    expect(onReopenWithEncoding).toHaveBeenCalledWith('utf-16le');
    expect(onSaveWithEncoding).not.toHaveBeenCalled();
  });

  it('disables Reopen with Encoding for tabs without a file on disk', () => {
    renderSelector({ canReopen: false });
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    const reopen = screen.getByTestId('encoding-action-reopen');
    expect(reopen.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(reopen);
    expect(screen.queryByTestId('encoding-option-utf-8')).toBeNull();
    expect(screen.getByTestId('encoding-action-save').getAttribute('aria-disabled')).toBeNull();
  });

  it('returns to the action list when the menu is reopened', () => {
    renderSelector();
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    fireEvent.click(screen.getByTestId('encoding-action-save'));
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    expect(screen.getByTestId('encoding-action-save')).toBeDefined();
  });

  it('closes the menu when clicking outside', () => {
    render(
      <div>
        <EncodingSelector
          encoding="utf-8"
          canReopen
          onReopenWithEncoding={() => {}}
          onSaveWithEncoding={() => {}}
          colors={colors}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByTestId('encoding-selector-button'));
    expect(screen.getByTestId('encoding-selector-menu')).toBeDefined();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('encoding-selector-menu')).toBeNull();
  });
});
