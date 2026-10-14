import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LanguageSelector from './LanguageSelector';

const colors = {
  background: '#1e1e1e',
  foreground: '#ffffff',
  tabBackground: '#252526',
  tabActiveBackground: '#1e1e1e',
  tabHover: '#2d2d2d',
};

describe('LanguageSelector', () => {
  it('renders the current language label', () => {
    render(
      <LanguageSelector languageId="json" inferred={false} onChange={() => {}} colors={colors} />
    );
    const btn = screen.getByTestId('language-selector-button');
    expect(btn.textContent).toBe('JSON');
  });

  it('appends "(auto)" when the language was inferred', () => {
    render(
      <LanguageSelector languageId="json" inferred={true} onChange={() => {}} colors={colors} />
    );
    expect(screen.getByTestId('language-selector-button').textContent).toBe('JSON (auto)');
  });

  it('opens the menu on click and lists languages', () => {
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
    );
    expect(screen.queryByTestId('language-selector-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('language-selector-button'));
    expect(screen.getByTestId('language-selector-menu')).toBeDefined();
    expect(screen.getByTestId('language-option-json')).toBeDefined();
    expect(screen.getByTestId('language-option-typescript')).toBeDefined();
  });

  it('calls onChange with selected id and closes the menu', () => {
    const onChange = vi.fn();
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={onChange} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    fireEvent.click(screen.getByTestId('language-option-python'));
    expect(onChange).toHaveBeenCalledWith('python');
    expect(screen.queryByTestId('language-selector-menu')).toBeNull();
  });

  it('closes the menu when clicking outside', () => {
    render(
      <div>
        <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    expect(screen.getByTestId('language-selector-menu')).toBeDefined();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('language-selector-menu')).toBeNull();
  });

  it('focuses the search input when the menu opens', () => {
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    expect(document.activeElement).toBe(screen.getByTestId('language-selector-search'));
  });

  it('filters the list based on the search query', () => {
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    fireEvent.change(screen.getByTestId('language-selector-search'), {
      target: { value: 'pyth' },
    });
    expect(screen.getByTestId('language-option-python')).toBeDefined();
    expect(screen.queryByTestId('language-option-json')).toBeNull();
    expect(screen.queryByTestId('language-selector-empty')).toBeNull();
  });

  it('shows an empty state when no languages match', () => {
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    fireEvent.change(screen.getByTestId('language-selector-search'), {
      target: { value: 'no-such-language' },
    });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByTestId('language-selector-empty')).toBeDefined();
  });

  it('selects the first filtered match on Enter', () => {
    const onChange = vi.fn();
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={onChange} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    const search = screen.getByTestId('language-selector-search');
    fireEvent.change(search, { target: { value: 'type' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('typescript');
    expect(screen.queryByTestId('language-selector-menu')).toBeNull();
  });

  it('navigates options with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={onChange} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    const search = screen.getByTestId('language-selector-search');
    fireEvent.change(search, { target: { value: 'script' } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(options[0].getAttribute('data-highlighted')).toBe('true');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('data-highlighted')).toBe('true');
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    const last = screen.getAllByRole('option')[options.length - 1];
    expect(last.getAttribute('data-highlighted')).toBe('true');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(last.getAttribute('data-testid')!.replace('language-option-', ''));
  });

  it('closes the menu on Escape without changing the language', () => {
    const onChange = vi.fn();
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={onChange} colors={colors} />
    );
    fireEvent.click(screen.getByTestId('language-selector-button'));
    fireEvent.keyDown(screen.getByTestId('language-selector-search'), { key: 'Escape' });
    expect(screen.queryByTestId('language-selector-menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the search query when the menu is reopened', () => {
    render(
      <LanguageSelector languageId="plaintext" inferred={true} onChange={() => {}} colors={colors} />
    );
    const btn = screen.getByTestId('language-selector-button');
    fireEvent.click(btn);
    fireEvent.change(screen.getByTestId('language-selector-search'), { target: { value: 'pyth' } });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect((screen.getByTestId('language-selector-search') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('language-option-json')).toBeDefined();
  });
});
