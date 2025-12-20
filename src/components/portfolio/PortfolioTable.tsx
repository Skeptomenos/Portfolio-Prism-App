/**
 * Portfolio Table Component
 * 
 * TanStack Table implementation with glassmorphic styling.
 * Features: sorting, inline editing (click cell to edit).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { useAppStore } from '../../store/useAppStore';
import type { Position } from '../../types';

const styles = {
  container: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  tableWrapper: {
    overflowX: 'auto' as const,
    maxHeight: '500px',
    overflowY: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    position: 'sticky' as const,
    top: 0,
    background: 'rgba(15, 20, 32, 0.95)',
    backdropFilter: 'blur(10px)',
    padding: '12px 16px',
    textAlign: 'left' as const,
    color: '#94a3b8',
    fontWeight: 500,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  thSortable: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    transition: 'background 0.15s',
  },
  trHover: {
    background: 'rgba(255, 255, 255, 0.03)',
  },
  td: {
    padding: '12px 16px',
    color: '#f8fafc',
    whiteSpace: 'nowrap' as const,
  },
  tdEditable: {
    cursor: 'pointer',
  },
  input: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.5)',
    borderRadius: '4px',
    color: '#f8fafc',
    padding: '4px 8px',
    fontSize: '13px',
    width: '100%',
    outline: 'none',
  },
  positive: {
    color: '#10b981',
  },
  negative: {
    color: '#ef4444',
  },
  ticker: {
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  type: {
    background: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    color: '#64748b',
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: '16px',
    fontWeight: 500,
    marginBottom: '8px',
  },
};

const columnHelper = createColumnHelper<Position>();

interface EditingCell {
  rowIndex: number;
  columnId: string;
}

interface PortfolioTableProps {
  positions: Position[];
  onPositionUpdate?: (position: Position) => void;
}

export const PortfolioTable: React.FC<PortfolioTableProps> = ({
  positions,
  onPositionUpdate,
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const { setHasUnsavedChanges } = useAppStore();

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Format number
  const formatNumber = (value: number, decimals = 2) => {
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  // Handle cell click for editing
  const handleCellClick = useCallback((rowIndex: number, columnId: string, currentValue: string | number) => {
    setEditingCell({ rowIndex, columnId });
    setEditValue(String(currentValue));
  }, []);

  // Handle edit save
  const handleEditSave = useCallback((rowIndex: number, columnId: string) => {
    const position = positions[rowIndex];
    if (!position) return;

    // Create updated position
    const updatedPosition = { ...position };
    
    // Update the appropriate field
    switch (columnId) {
      case 'name':
        updatedPosition.name = editValue;
        break;
      case 'ticker':
        updatedPosition.ticker = editValue;
        break;
      case 'quantity':
        updatedPosition.quantity = parseFloat(editValue) || 0;
        break;
      case 'avgBuyPrice':
        updatedPosition.avgBuyPrice = parseFloat(editValue) || 0;
        break;
      case 'notes':
        updatedPosition.notes = editValue;
        break;
      case 'instrumentType':
        updatedPosition.instrumentType = editValue as Position['instrumentType'];
        break;
      case 'currency':
        updatedPosition.currency = editValue;
        break;
    }

    onPositionUpdate?.(updatedPosition);
    setHasUnsavedChanges(true);
    setEditingCell(null);
    setEditValue('');
  }, [positions, editValue, onPositionUpdate, setHasUnsavedChanges]);

  // Handle edit cancel
  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Handle key press in edit input
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, columnId: string) => {
    if (e.key === 'Enter') {
      handleEditSave(rowIndex, columnId);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  // Editable cell renderer
  const EditableCell = useCallback(({ rowIndex, columnId, value, isEditable = true }: {
    rowIndex: number;
    columnId: string;
    value: string | number;
    isEditable?: boolean;
  }) => {
    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleEditSave(rowIndex, columnId)}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, columnId)}
          style={styles.input}
          autoFocus
        />
      );
    }

    if (!isEditable) {
      return <span>{value}</span>;
    }

    return (
      <span
        style={styles.tdEditable}
        onClick={() => handleCellClick(rowIndex, columnId, value)}
        title="Click to edit"
      >
        {value || <span style={{ color: '#64748b' }}>—</span>}
      </span>
    );
  }, [editingCell, editValue, handleCellClick, handleEditSave, handleKeyDown]);

  // Define columns
  const columns = useMemo(() => [
    columnHelper.accessor('isin', {
      header: 'ISIN',
      cell: (info) => <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{info.getValue()}</span>,
      size: 120,
    }),
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info) => (
        <EditableCell 
          rowIndex={info.row.index} 
          columnId="name" 
          value={info.getValue()} 
        />
      ),
      size: 200,
    }),
    columnHelper.accessor('ticker', {
      header: 'Ticker',
      cell: (info) => {
        const value = info.getValue();
        if (editingCell?.rowIndex === info.row.index && editingCell?.columnId === 'ticker') {
          return (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleEditSave(info.row.index, 'ticker')}
              onKeyDown={(e) => handleKeyDown(e, info.row.index, 'ticker')}
              style={styles.input}
              autoFocus
            />
          );
        }
        return value ? (
          <span 
            style={styles.ticker} 
            onClick={() => handleCellClick(info.row.index, 'ticker', value)}
            title="Click to edit"
          >
            {value}
          </span>
        ) : (
          <span 
            style={{ color: '#64748b', cursor: 'pointer' }}
            onClick={() => handleCellClick(info.row.index, 'ticker', '')}
          >
            —
          </span>
        );
      },
      size: 80,
    }),
    columnHelper.accessor('instrumentType', {
      header: 'Type',
      cell: (info) => (
        <span style={styles.type}>{info.getValue()}</span>
      ),
      size: 80,
    }),
    columnHelper.accessor('quantity', {
      header: 'Qty',
      cell: (info) => (
        <EditableCell 
          rowIndex={info.row.index} 
          columnId="quantity" 
          value={formatNumber(info.getValue(), 4)} 
        />
      ),
      size: 80,
    }),
    columnHelper.accessor('avgBuyPrice', {
      header: 'Avg. Buy',
      cell: (info) => (
        <EditableCell 
          rowIndex={info.row.index} 
          columnId="avgBuyPrice" 
          value={formatCurrency(info.getValue())} 
        />
      ),
      size: 100,
    }),
    columnHelper.accessor('currentPrice', {
      header: 'Current',
      cell: (info) => formatCurrency(info.getValue()),
      size: 100,
    }),
    columnHelper.accessor('currentValue', {
      header: 'Value',
      cell: (info) => <strong>{formatCurrency(info.getValue())}</strong>,
      size: 100,
    }),
    columnHelper.accessor('pnlEur', {
      header: 'P&L',
      cell: (info) => {
        const value = info.getValue();
        return (
          <span style={value >= 0 ? styles.positive : styles.negative}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 100,
    }),
    columnHelper.accessor('pnlPercent', {
      header: 'P&L %',
      cell: (info) => {
        const value = info.getValue();
        return (
          <span style={value >= 0 ? styles.positive : styles.negative}>
            {formatPercent(value)}
          </span>
        );
      },
      size: 80,
    }),
    columnHelper.accessor('weight', {
      header: 'Weight',
      cell: (info) => `${info.getValue().toFixed(1)}%`,
      size: 70,
    }),
    columnHelper.accessor('notes', {
      header: 'Notes',
      cell: (info) => (
        <EditableCell 
          rowIndex={info.row.index} 
          columnId="notes" 
          value={info.getValue() || ''} 
        />
      ),
      size: 150,
    }),
  ], [EditableCell, editingCell, editValue, handleCellClick, handleEditSave, handleKeyDown]);

  const [columnVisibility] = useState({
    ticker: true,
  });

  const table = useReactTable({
    data: positions,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (positions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No positions</div>
          <p>Sync your portfolio to see your holdings here</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={styles.th}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div style={styles.thSortable}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' ↑',
                        desc: ' ↓',
                      }[header.column.getIsSorted() as string] ?? ''}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                style={styles.tr}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={styles.td}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PortfolioTable;
