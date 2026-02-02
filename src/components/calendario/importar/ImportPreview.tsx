'use client';

import { useMemo } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/Utils';
import { ParsedRow, ColumnMapping, TARGET_FIELDS } from './types';

interface ImportPreviewProps {
  rows: ParsedRow[];
  mappings: ColumnMapping[];
  maxPreviewRows?: number;
}

export function ImportPreview({
  rows,
  mappings,
  maxPreviewRows = 10,
}: ImportPreviewProps) {
  const stats = useMemo(() => {
    const valid = rows.filter(r => r.isValid).length;
    const invalid = rows.length - valid;
    return { valid, invalid, total: rows.length };
  }, [rows]);

  const previewRows = rows.slice(0, maxPreviewRows);
  const mappedFields = mappings.filter(m => m.targetField);

  return (
    <div className="space-y-4">
      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total de filas</p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.valid}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Válidas</p>
        </div>
        <div className={cn(
          "p-4 rounded-lg text-center",
          stats.invalid > 0
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-gray-50 dark:bg-gray-800/50"
        )}>
          <p className={cn(
            "text-2xl font-bold",
            stats.invalid > 0
              ? "text-red-600 dark:text-red-400"
              : "text-gray-400 dark:text-gray-500"
          )}>{stats.invalid}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Con errores</p>
        </div>
      </div>

      {/* Tabla de preview */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <ScrollArea className="max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 w-12">#</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 w-16">Estado</th>
                {mappedFields.map(mapping => (
                  <th
                    key={mapping.csvColumn}
                    className="px-3 py-2 text-left text-gray-600 dark:text-gray-300"
                  >
                    {TARGET_FIELDS.find(f => f.value === mapping.targetField)?.label || mapping.targetField}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr
                  key={row.rowNumber}
                  className={cn(
                    "border-t border-gray-100 dark:border-gray-800",
                    !row.isValid && "bg-red-50/50 dark:bg-red-900/10"
                  )}
                >
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {row.rowNumber}
                  </td>
                  <td className="px-3 py-2">
                    {row.isValid ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <div className="flex items-center gap-1">
                        <X className="h-4 w-4 text-red-500" />
                        <span className="text-xs text-red-500" title={row.errors.join(', ')}>
                          {row.errors.length}
                        </span>
                      </div>
                    )}
                  </td>
                  {mappedFields.map(mapping => (
                    <td
                      key={mapping.csvColumn}
                      className="px-3 py-2 text-gray-900 dark:text-white max-w-[200px] truncate"
                    >
                      {row.data[mapping.csvColumn] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {rows.length > maxPreviewRows && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Mostrando {maxPreviewRows} de {rows.length} filas
        </p>
      )}

      {/* Errores detallados */}
      {stats.invalid > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="font-medium text-red-700 dark:text-red-400">
              Filas con errores ({stats.invalid})
            </span>
          </div>
          <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
            {rows
              .filter(r => !r.isValid)
              .slice(0, 5)
              .map(row => (
                <li key={row.rowNumber}>
                  Fila {row.rowNumber}: {row.errors.join(', ')}
                </li>
              ))}
            {stats.invalid > 5 && (
              <li className="text-gray-500">...y {stats.invalid - 5} más</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
