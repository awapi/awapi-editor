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
});
