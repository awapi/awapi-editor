import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CsvGridEditor from './CsvGridEditor';
import { defaultDark } from './theme/ThemeContext';

describe('CsvGridEditor', () => {
  const sampleCsv = 'Name,Score,City\nCharlie,10,Boston\nAlice,100,Austin\nBob,25,Seattle';

  it('renders header inputs and data cells from CSV content', () => {
    const onChange = vi.fn();
    render(
      <CsvGridEditor
        content={sampleCsv}
        filename="scores.csv"
        onChange={onChange}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    expect((screen.getByTestId('csv-header-input-0') as HTMLInputElement).value).toBe('Name');
    expect((screen.getByTestId('csv-header-input-1') as HTMLInputElement).value).toBe('Score');
    expect((screen.getByTestId('csv-cell-1-0') as HTMLInputElement).value).toBe('Charlie');
    expect((screen.getByTestId('csv-cell-2-1') as HTMLInputElement).value).toBe('100');
  });

  it('updates CSV content when a cell is edited', () => {
    const onChange = vi.fn();
    render(
      <CsvGridEditor
        content={sampleCsv}
        filename="scores.csv"
        onChange={onChange}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    const cell = screen.getByTestId('csv-cell-1-0');
    fireEvent.change(cell, { target: { value: 'Charles' } });

    expect(onChange).toHaveBeenCalledWith(
      'Name,Score,City\nCharles,10,Boston\nAlice,100,Austin\nBob,25,Seattle',
    );
  });

  it('filters visible rows using the banner search box and clears filter', () => {
    const onChange = vi.fn();
    render(
      <CsvGridEditor
        content={sampleCsv}
        filename="scores.csv"
        onChange={onChange}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    const searchInput = screen.getByTestId('csv-search-input');
    fireEvent.change(searchInput, { target: { value: 'austin' } });

    expect(screen.getByTestId('csv-filter-count').textContent).toBe('1 / 3 rows');
    expect((screen.getByTestId('csv-cell-2-0') as HTMLInputElement).value).toBe('Alice');
    expect(screen.queryByTestId('csv-cell-1-0')).toBeNull();

    fireEvent.click(screen.getByTestId('csv-search-clear'));
    expect(screen.getByTestId('csv-cell-1-0')).not.toBeNull();
  });

  it('sorts rows when clicking a column sort button and can apply sort to file', () => {
    const onChange = vi.fn();
    render(
      <CsvGridEditor
        content={sampleCsv}
        filename="scores.csv"
        onChange={onChange}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    // Click sort on column 1 (Score) -> ascending: Charlie (10), Bob (25), Alice (100)
    fireEvent.click(screen.getByTestId('csv-sort-col-1'));
    // Click again -> descending: Alice (100), Bob (25), Charlie (10)
    fireEvent.click(screen.getByTestId('csv-sort-col-1'));

    const applyBtn = screen.getByTestId('csv-apply-sort-button');
    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith(
      'Name,Score,City\nAlice,100,Austin\nBob,25,Seattle\nCharlie,10,Boston',
    );
  });

  it('supports adding and deleting rows and columns', () => {
    const StatefulWrapper: React.FC<{ onChange: (val: string) => void }> = ({ onChange }) => {
      const [val, setVal] = React.useState('A,B\n1,2');
      return (
        <CsvGridEditor
          content={val}
          filename="test.csv"
          onChange={next => {
            setVal(next);
            onChange(next);
          }}
          colors={defaultDark}
          themeMode="dark"
        />
      );
    };

    const onChange = vi.fn();
    render(<StatefulWrapper onChange={onChange} />);

    fireEvent.focus(screen.getByTestId('csv-cell-1-0'));
    fireEvent.click(screen.getByTestId('csv-add-row-button'));
    expect(onChange).toHaveBeenLastCalledWith('A,B\n1,2\n,');

    fireEvent.click(screen.getByTestId('csv-add-col-button'));
    expect(onChange).toHaveBeenLastCalledWith('A,,B\n1,,2\n,,');

    fireEvent.click(screen.getByTestId('csv-delete-col-button'));
    expect(onChange).toHaveBeenLastCalledWith('A,B\n1,2\n,');

    fireEvent.click(screen.getByTestId('csv-delete-row-button'));
    expect(onChange).toHaveBeenLastCalledWith('A,B\n1,2');
  });

  it('auto-detects semicolon separator and allows switching separator', () => {
    const onChange = vi.fn();
    render(
      <CsvGridEditor
        content={'Name;Age\nAlice;30'}
        filename="eu.csv"
        onChange={onChange}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    const select = screen.getByTestId('csv-separator-select') as HTMLSelectElement;
    expect(select.value).toBe(';');
    expect((screen.getByTestId('csv-cell-1-0') as HTMLInputElement).value).toBe('Alice');
    expect((screen.getByTestId('csv-cell-1-1') as HTMLInputElement).value).toBe('30');
  });

  it('invokes onSwitchToTextView when Raw Text button is clicked', () => {
    const onSwitch = vi.fn();
    render(
      <CsvGridEditor
        content={sampleCsv}
        filename="scores.csv"
        onChange={vi.fn()}
        onSwitchToTextView={onSwitch}
        colors={defaultDark}
        themeMode="dark"
      />,
    );

    fireEvent.click(screen.getByTestId('csv-switch-to-text-button'));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
