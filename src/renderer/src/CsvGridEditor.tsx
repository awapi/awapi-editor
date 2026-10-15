import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  CSV_SEPARATORS,
  type CsvSeparator,
  detectCsvSeparator,
  parseCsv,
  serializeCsv,
  getColumnLetter,
  compareCsvValues,
  sortCsvGridByColumn,
} from './csv';
import type { ThemeColors } from './theme/ThemeContext';
import type { EolKind } from './lineEndings';

/** Height in pixels of each virtualized CSV body row. */
export const CSV_ROW_HEIGHT = 28;
/** Default viewport height (px) used before layout measurements or in JSDOM tests. */
const DEFAULT_VIEWPORT_HEIGHT = 600;
/** Extra rows rendered above and below the visible scroll window. */
const VIRTUAL_OVERSCAN_ROWS = 15;
/** Maximum number of undo history entries kept per CSV file. */
const MAX_UNDO_HISTORY = 100;

interface HistoryEntry {
  content: string;
  selectedCell: { row: number; col: number };
}

export interface CsvGridEditorProps {
  content: string;
  filename?: string | null;
  eol?: EolKind;
  onChange: (nextContent: string) => void;
  onSwitchToTextView?: () => void;
  onCursorChange?: (row: number, col: number) => void;
  colors: ThemeColors;
  themeMode: 'light' | 'dark';
}

interface SortState {
  colIndex: number;
  direction: 'asc' | 'desc';
}

const CsvGridEditor: React.FC<CsvGridEditorProps> = ({
  content,
  filename,
  eol = 'LF',
  onChange,
  onSwitchToTextView,
  onCursorChange,
  colors,
  themeMode,
}) => {
  const [separatorOverride, setSeparatorOverride] = useState<CsvSeparator | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(DEFAULT_VIEWPORT_HEIGHT);

  // Reset separator override and undo/redo history if the file changes
  useEffect(() => {
    setSeparatorOverride(null);
    setSortState(null);
    setUndoStack([]);
    setRedoStack([]);
    setScrollTop(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [filename]);

  // Measure the scroll viewport height and update on resize
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    return undefined;
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    if (target.clientHeight > 0 && target.clientHeight !== viewportHeight) {
      setViewportHeight(target.clientHeight);
    }
  }, [viewportHeight]);

  const detectedSeparator = useMemo(
    () => detectCsvSeparator(content, filename),
    [content, filename],
  );
  const activeSeparator: CsvSeparator = separatorOverride ?? detectedSeparator;

  const grid = useMemo(
    () => parseCsv(content, activeSeparator),
    [content, activeSeparator],
  );

  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 1;
  const eolSeq: '\n' | '\r\n' = eol === 'CRLF' ? '\r\n' : '\n';

  const commitGrid = (nextGrid: string[][], sep: CsvSeparator = activeSeparator) => {
    const serialized = serializeCsv(nextGrid, sep, eolSeq);
    if (serialized === content) return;
    setUndoStack(prev => {
      const next = [...prev, { content, selectedCell }];
      return next.length > MAX_UNDO_HISTORY ? next.slice(next.length - MAX_UNDO_HISTORY) : next;
    });
    setRedoStack([]);
    onChange(serialized);
  };

  const selectCell = useCallback((rowIndex: number, colIndex: number) => {
    setSelectedCell({ row: rowIndex, col: colIndex });
    onCursorChange?.(rowIndex + 1, colIndex + 1);
  }, [onCursorChange]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, { content, selectedCell }]);
    onChange(previous.content);
    selectCell(previous.selectedCell.row, previous.selectedCell.col);
  }, [undoStack, content, selectedCell, onChange, selectCell]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, { content, selectedCell }]);
    onChange(next.content);
    selectCell(next.selectedCell.row, next.selectedCell.col);
  }, [redoStack, content, selectedCell, onChange, selectCell]);

  // Global keyboard shortcuts for Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target && target.getAttribute?.('data-testid') === 'csv-search-input') {
        return;
      }

      const key = e.key.toLowerCase();
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
      if (key === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleUndo();
        }
      } else if (isRedo) {
        if (redoStack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleRedo();
        }
      }
    };

    const onBeforeInput = (e: InputEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.getAttribute?.('data-testid') === 'csv-search-input') {
        return;
      }
      if (e.inputType === 'historyUndo' && undoStack.length > 0) {
        e.preventDefault();
        handleUndo();
      } else if (e.inputType === 'historyRedo' && redoStack.length > 0) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeinput', onBeforeInput as EventListener, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
    };
  }, [undoStack.length, redoStack.length, handleUndo, handleRedo]);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const nextGrid = grid.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
        : row,
    );
    commitGrid(nextGrid);
  };

  const handleAddRowBelow = () => {
    const emptyRow = Array.from({ length: colCount }, () => '');
    const insertIdx = Math.min(grid.length, Math.max(0, selectedCell.row + 1));
    const nextGrid = [
      ...grid.slice(0, insertIdx),
      emptyRow,
      ...grid.slice(insertIdx),
    ];
    commitGrid(nextGrid);
    selectCell(insertIdx, selectedCell.col);
  };

  const handleDeleteSelectedRow = () => {
    if (grid.length <= 1) {
      commitGrid([Array.from({ length: colCount }, () => '')]);
      return;
    }
    const targetRow = Math.min(grid.length - 1, Math.max(0, selectedCell.row));
    const nextGrid = grid.filter((_, rIdx) => rIdx !== targetRow);
    commitGrid(nextGrid);
    selectCell(Math.min(nextGrid.length - 1, targetRow), selectedCell.col);
  };

  const handleAddColumnRight = () => {
    const insertCol = Math.min(colCount, Math.max(0, selectedCell.col + 1));
    const nextGrid = grid.map(row => [
      ...row.slice(0, insertCol),
      '',
      ...row.slice(insertCol),
    ]);
    commitGrid(nextGrid);
    selectCell(selectedCell.row, insertCol);
  };

  const handleDeleteSelectedColumn = () => {
    if (colCount <= 1) {
      commitGrid(grid.map(() => ['']));
      return;
    }
    const targetCol = Math.min(colCount - 1, Math.max(0, selectedCell.col));
    const nextGrid = grid.map(row => row.filter((_, cIdx) => cIdx !== targetCol));
    if (sortState) {
      if (sortState.colIndex === targetCol) setSortState(null);
      else if (sortState.colIndex > targetCol) {
        setSortState({ ...sortState, colIndex: sortState.colIndex - 1 });
      }
    }
    commitGrid(nextGrid);
    selectCell(selectedCell.row, Math.min(colCount - 2, targetCol));
  };

  const handleToggleColumnSort = (colIndex: number) => {
    setSortState(prev => {
      if (!prev || prev.colIndex !== colIndex) {
        return { colIndex, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { colIndex, direction: 'desc' };
      }
      return null;
    });
  };

  const handleApplySortToFile = () => {
    if (!sortState) return;
    const sorted = sortCsvGridByColumn(grid, sortState.colIndex, sortState.direction, hasHeader);
    commitGrid(sorted);
    setSortState(null);
  };

  const handleConvertSeparator = (newSep: CsvSeparator) => {
    setSeparatorOverride(newSep);
  };

  // Build visible data rows with original row indices so editing while filtered/sorted mutates the exact underlying row
  const dataRowIndices = useMemo(() => {
    const startRow = hasHeader && rowCount > 1 ? 1 : 0;
    const indices: number[] = [];
    for (let r = startRow; r < rowCount; r++) {
      indices.push(r);
    }

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? indices.filter(rIdx =>
          grid[rIdx].some(cell => (cell ?? '').toLowerCase().includes(q)),
        )
      : indices;

    if (!sortState) return filtered;

    const { colIndex, direction } = sortState;
    return [...filtered].sort((idxA, idxB) =>
      compareCsvValues(
        grid[idxA]?.[colIndex] ?? '',
        grid[idxB]?.[colIndex] ?? '',
        direction,
      ),
    );
  }, [grid, hasHeader, rowCount, searchQuery, sortState]);

  const totalDataRows = hasHeader && rowCount > 1 ? rowCount - 1 : rowCount;

  // Virtual window computation so large CSVs only render visible rows + overscan
  const totalVisibleRows = dataRowIndices.length;
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / CSV_ROW_HEIGHT));
  const rawStartIndex = Math.max(0, Math.floor(scrollTop / CSV_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS);
  const virtualStartIndex = Math.min(
    rawStartIndex,
    Math.max(0, totalVisibleRows - visibleRowCount),
  );
  const virtualEndIndex = Math.min(
    totalVisibleRows,
    virtualStartIndex + visibleRowCount + VIRTUAL_OVERSCAN_ROWS * 2,
  );
  const topSpacerHeight = virtualStartIndex * CSV_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalVisibleRows - virtualEndIndex) * CSV_ROW_HEIGHT);
  const windowedRowIndices = useMemo(
    () => dataRowIndices.slice(virtualStartIndex, virtualEndIndex),
    [dataRowIndices, virtualStartIndex, virtualEndIndex],
  );

  const borderColor = themeMode === 'light' ? '#d4d4d8' : '#38383d';
  const headerBg = themeMode === 'light' ? '#f3f4f6' : '#252528';
  const selectedHighlight = themeMode === 'light' ? 'rgba(0, 122, 204, 0.14)' : 'rgba(0, 122, 204, 0.26)';
  const zebraBg = themeMode === 'light' ? 'rgba(0,0,0,0.018)' : 'rgba(255,255,255,0.02)';

  return (
    <div
      data-testid="csv-grid-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: colors.background,
        color: colors.foreground,
        fontSize: '13px',
      }}
    >
      {/* Top CSV Banner / Toolbar */}
      <div
        data-testid="csv-grid-banner"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '6px 10px',
          backgroundColor: colors.tabBackground,
          borderBottom: `1px solid ${borderColor}`,
          flexShrink: 0,
        }}
      >
        {/* Left group: Search/Filter + Separator + Header checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <input
              data-testid="csv-search-input"
              type="text"
              placeholder="Filter rows..."
              aria-label="Filter CSV rows"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                padding: '4px 24px 4px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                border: `1px solid ${borderColor}`,
                backgroundColor: colors.background,
                color: colors.foreground,
                minWidth: '170px',
              }}
            />
            {searchQuery && (
              <button
                data-testid="csv-search-clear"
                aria-label="Clear CSV filter"
                title="Clear filter"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '4px',
                  background: 'transparent',
                  border: 'none',
                  color: colors.foreground,
                  opacity: 0.7,
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            )}
          </div>

          {searchQuery.trim() && (
            <span
              data-testid="csv-filter-count"
              style={{ fontSize: '11px', opacity: 0.75 }}
            >
              {dataRowIndices.length} / {totalDataRows} rows
            </span>
          )}

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              opacity: 0.9,
            }}
          >
            <span>Separator:</span>
            <select
              data-testid="csv-separator-select"
              aria-label="CSV Separator"
              value={activeSeparator}
              onChange={e => handleConvertSeparator(e.target.value as CsvSeparator)}
              style={{
                padding: '3px 6px',
                fontSize: '12px',
                borderRadius: '4px',
                border: `1px solid ${borderColor}`,
                backgroundColor: colors.background,
                color: colors.foreground,
                cursor: 'pointer',
              }}
            >
              {CSV_SEPARATORS.map(opt => (
                <option key={opt.shortLabel} value={opt.value}>
                  {opt.label}
                  {separatorOverride === null && opt.value === detectedSeparator ? ' (Auto)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              data-testid="csv-header-toggle"
              type="checkbox"
              checked={hasHeader}
              onChange={e => setHasHeader(e.target.checked)}
            />
            <span>Header row</span>
          </label>
        </div>

        {/* Right group: Row/Column editing actions + Sort controls + Raw Text switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {sortState && (
            <>
              <button
                data-testid="csv-apply-sort-button"
                onClick={handleApplySortToFile}
                title="Write the current visual sort order permanently into the CSV content"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: `1px solid ${colors.tabBorder}`,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  cursor: 'pointer',
                }}
              >
                Apply Sort
              </button>
              <button
                data-testid="csv-clear-sort-button"
                onClick={() => setSortState(null)}
                title="Reset column sort order"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: 'transparent',
                  color: colors.foreground,
                  cursor: 'pointer',
                }}
              >
                Clear Sort
              </button>
            </>
          )}

          <button
            data-testid="csv-undo-button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z / Cmd+Z)"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: undoStack.length > 0 ? 'pointer' : 'not-allowed',
              opacity: undoStack.length > 0 ? 1 : 0.45,
            }}
          >
            ↶ Undo
          </button>
          <button
            data-testid="csv-redo-button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y / Cmd+Shift+Z)"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: redoStack.length > 0 ? 'pointer' : 'not-allowed',
              opacity: redoStack.length > 0 ? 1 : 0.45,
            }}
          >
            ↷ Redo
          </button>
          <button
            data-testid="csv-add-row-button"
            onClick={handleAddRowBelow}
            title="Insert a new row below the selected row"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: 'pointer',
            }}
          >
            + Row
          </button>
          <button
            data-testid="csv-delete-row-button"
            onClick={handleDeleteSelectedRow}
            title="Delete the currently selected row"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: 'pointer',
            }}
          >
            - Row
          </button>
          <button
            data-testid="csv-add-col-button"
            onClick={handleAddColumnRight}
            title="Insert a new column to the right of the selected column"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: 'pointer',
            }}
          >
            + Col
          </button>
          <button
            data-testid="csv-delete-col-button"
            onClick={handleDeleteSelectedColumn}
            title="Delete the currently selected column"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: `1px solid ${borderColor}`,
              backgroundColor: colors.background,
              color: colors.foreground,
              cursor: 'pointer',
            }}
          >
            - Col
          </button>

          {onSwitchToTextView && (
            <button
              data-testid="csv-switch-to-text-button"
              onClick={onSwitchToTextView}
              title="Switch to Raw Text Editor"
              style={{
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: `1px solid ${colors.tabBorder}`,
                backgroundColor: colors.background,
                color: colors.foreground,
                cursor: 'pointer',
              }}
            >
              Raw Text
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Table Container */}
      <div
        ref={scrollContainerRef}
        data-testid="csv-scroll-container"
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto' }}
      >
        <table
          data-testid="csv-grid-table"
          style={{
            borderCollapse: 'collapse',
            width: 'max-content',
            minWidth: '100%',
            tableLayout: 'fixed',
          }}
        >
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: headerBg,
            }}
          >
            <tr>
              {/* Corner # cell */}
              <th
                style={{
                  width: '44px',
                  minWidth: '44px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  opacity: 0.65,
                  borderRight: `1px solid ${borderColor}`,
                  borderBottom: `1px solid ${borderColor}`,
                  backgroundColor: headerBg,
                  userSelect: 'none',
                }}
              >
                #
              </th>

              {Array.from({ length: colCount }, (_, colIndex) => {
                const isSorted = sortState?.colIndex === colIndex;
                const sortIndicator = isSorted
                  ? sortState?.direction === 'asc'
                    ? '▲'
                    : '▼'
                  : '⇅';
                const colLetter = getColumnLetter(colIndex);
                const headerValue = grid[0]?.[colIndex] ?? '';

                return (
                  <th
                    key={colIndex}
                    style={{
                      minWidth: '150px',
                      padding: 0,
                      borderRight: `1px solid ${borderColor}`,
                      borderBottom: `1px solid ${borderColor}`,
                      backgroundColor:
                        selectedCell.col === colIndex ? selectedHighlight : headerBg,
                      verticalAlign: 'middle',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '4px',
                        padding: '4px 6px',
                      }}
                    >
                      {hasHeader && rowCount > 1 ? (
                        <input
                          data-testid={`csv-header-input-${colIndex}`}
                          aria-label={`Column ${colLetter} header`}
                          value={headerValue}
                          placeholder={colLetter}
                          onFocus={() => selectCell(0, colIndex)}
                          onChange={e => handleCellChange(0, colIndex, e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: colors.foreground,
                            fontWeight: 600,
                            fontSize: '12px',
                          }}
                        />
                      ) : (
                        <span
                          data-testid={`csv-col-letter-${colIndex}`}
                          style={{
                            flex: 1,
                            textAlign: 'left',
                            fontWeight: 600,
                            fontSize: '12px',
                            opacity: 0.85,
                          }}
                        >
                          {colLetter}
                        </span>
                      )}

                      <button
                        data-testid={`csv-sort-col-${colIndex}`}
                        aria-label={`Sort column ${colLetter}`}
                        title={`Sort by column ${colLetter}`}
                        onClick={() => handleToggleColumnSort(colIndex)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: colors.foreground,
                          opacity: isSorted ? 1 : 0.45,
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          flexShrink: 0,
                        }}
                      >
                        {sortIndicator}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {dataRowIndices.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount + 1}
                  data-testid="csv-empty-filter-state"
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    opacity: 0.65,
                  }}
                >
                  No rows match &ldquo;{searchQuery}&rdquo;.
                </td>
              </tr>
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <tr aria-hidden="true" data-testid="csv-virtual-top-spacer">
                    <td
                      colSpan={colCount + 1}
                      style={{ height: `${topSpacerHeight}px`, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
                {windowedRowIndices.map((actualRowIdx, windowOffset) => {
                  const visualRowIdx = virtualStartIndex + windowOffset;
                  const row = grid[actualRowIdx] ?? [];
                  const displayRowNum = hasHeader && rowCount > 1 ? actualRowIdx : actualRowIdx + 1;
                  const isRowSelected = selectedCell.row === actualRowIdx;

                  return (
                    <tr
                      key={actualRowIdx}
                      style={{
                        height: `${CSV_ROW_HEIGHT}px`,
                        backgroundColor:
                          visualRowIdx % 2 === 1 ? zebraBg : 'transparent',
                      }}
                    >
                      {/* Row number gutter */}
                      <td
                        onClick={() => selectCell(actualRowIdx, 0)}
                        style={{
                          textAlign: 'center',
                          fontSize: '11px',
                          opacity: 0.65,
                          padding: '4px',
                          borderRight: `1px solid ${borderColor}`,
                          borderBottom: `1px solid ${borderColor}`,
                          backgroundColor: isRowSelected ? selectedHighlight : headerBg,
                          userSelect: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {displayRowNum}
                      </td>

                      {Array.from({ length: colCount }, (_, colIndex) => {
                        const cellValue = row[colIndex] ?? '';
                        const isCellSelected =
                          selectedCell.row === actualRowIdx &&
                          selectedCell.col === colIndex;

                        return (
                          <td
                            key={colIndex}
                            style={{
                              padding: 0,
                              borderRight: `1px solid ${borderColor}`,
                              borderBottom: `1px solid ${borderColor}`,
                              backgroundColor: isCellSelected
                                ? selectedHighlight
                                : 'transparent',
                            }}
                          >
                            <input
                              data-testid={`csv-cell-${actualRowIdx}-${colIndex}`}
                              aria-label={`Row ${displayRowNum} Column ${getColumnLetter(colIndex)}`}
                              value={cellValue}
                              onFocus={() => selectCell(actualRowIdx, colIndex)}
                              onChange={e =>
                                handleCellChange(actualRowIdx, colIndex, e.target.value)
                              }
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '5px 8px',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color: colors.foreground,
                                fontSize: '13px',
                                fontFamily: 'inherit',
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {bottomSpacerHeight > 0 && (
                  <tr aria-hidden="true" data-testid="csv-virtual-bottom-spacer">
                    <td
                      colSpan={colCount + 1}
                      style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CsvGridEditor;
