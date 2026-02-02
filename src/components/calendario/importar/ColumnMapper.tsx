'use client';

import { useMemo } from 'react';
import { ArrowRight, Check, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { ColumnMapping, TARGET_FIELDS, ImportableEvent } from './types';

interface ColumnMapperProps {
  csvColumns: string[];
  mappings: ColumnMapping[];
  onMappingChange: (csvColumn: string, targetField: keyof ImportableEvent | null) => void;
}

export function ColumnMapper({
  csvColumns,
  mappings,
  onMappingChange,
}: ColumnMapperProps) {
  const requiredFields = TARGET_FIELDS.filter(f => f.required);
  
  const mappedRequiredFields = useMemo(() => {
    return requiredFields.filter(field =>
      mappings.some(m => m.targetField === field.value)
    );
  }, [mappings, requiredFields]);

  const allRequiredMapped = mappedRequiredFields.length === requiredFields.length;

  return (
    <div className="space-y-4">
      {/* Indicador de campos requeridos */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        {allRequiredMapped ? (
          <Check className="h-5 w-5 text-green-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-orange-500" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Campos requeridos: {mappedRequiredFields.length}/{requiredFields.length}
        </span>
        <div className="flex gap-1 ml-2">
          {requiredFields.map(field => (
            <Badge
              key={field.value}
              variant={mappings.some(m => m.targetField === field.value) ? 'default' : 'secondary'}
              className={cn(
                'text-xs',
                mappings.some(m => m.targetField === field.value) && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              )}
            >
              {field.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Lista de mapeos */}
      <div className="space-y-2">
        {csvColumns.map((column) => {
          const currentMapping = mappings.find(m => m.csvColumn === column);
          const targetField = currentMapping?.targetField || null;
          
          return (
            <div
              key={column}
              className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              {/* Columna CSV */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {column}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Columna del archivo
                </p>
              </div>

              {/* Flecha */}
              <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />

              {/* Selector de campo destino */}
              <div className="w-48">
                <Select
                  value={targetField || 'none'}
                  onValueChange={(value) => 
                    onMappingChange(column, value === 'none' ? null : value as keyof ImportableEvent)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar campo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No importar</SelectItem>
                    {TARGET_FIELDS.map((field) => {
                      const isUsed = mappings.some(
                        m => m.targetField === field.value && m.csvColumn !== column
                      );
                      return (
                        <SelectItem
                          key={field.value}
                          value={field.value}
                          disabled={isUsed}
                        >
                          {field.label}
                          {field.required && ' *'}
                          {isUsed && ' (usado)'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
