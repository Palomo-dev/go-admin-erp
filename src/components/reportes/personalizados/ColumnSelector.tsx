'use client';

import { Columns3 } from 'lucide-react';
import type { ColumnDef } from './reportBuilderService';

interface ColumnSelectorProps {
  availableColumns: ColumnDef[];
  selectedColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

export function ColumnSelector({ availableColumns, selectedColumns, onColumnsChange }: ColumnSelectorProps) {
  const toggleColumn = (key: string) => {
    if (selectedColumns.includes(key)) {
      onColumnsChange(selectedColumns.filter((c) => c !== key));
    } else {
      onColumnsChange([...selectedColumns, key]);
    }
  };

  const selectAll = () => onColumnsChange(availableColumns.map((c) => c.key));
  const clearAll = () => onColumnsChange([]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Columns3 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">2. Columnas</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {selectedColumns.length}/{availableColumns.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">Todas</button>
          <button onClick={clearAll} className="text-[10px] text-gray-500 dark:text-gray-400 hover:underline">Ninguna</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableColumns.map((col) => {
          const isSelected = selectedColumns.includes(col.key);
          return (
            <button
              key={col.key}
              onClick={() => toggleColumn(col.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                isSelected
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600'
              }`}
            >
              {col.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
