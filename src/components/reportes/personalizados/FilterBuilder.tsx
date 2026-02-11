'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Filter, Plus, X } from 'lucide-react';
import type { ColumnDef, ReportFilter } from './reportBuilderService';

interface FilterBuilderProps {
  availableColumns: ColumnDef[];
  filters: ReportFilter[];
  onFiltersChange: (filters: ReportFilter[]) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}

const OPERATORS = [
  { value: 'eq', label: '= Igual' },
  { value: 'neq', label: '≠ Diferente' },
  { value: 'gt', label: '> Mayor' },
  { value: 'gte', label: '≥ Mayor o igual' },
  { value: 'lt', label: '< Menor' },
  { value: 'lte', label: '≤ Menor o igual' },
  { value: 'like', label: '∼ Contiene' },
];

export function FilterBuilder({
  availableColumns, filters, onFiltersChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
}: FilterBuilderProps) {
  const addFilter = () => {
    onFiltersChange([...filters, { column: '', operator: 'eq', value: '' }]);
  };

  const removeFilter = (idx: number) => {
    onFiltersChange(filters.filter((_, i) => i !== idx));
  };

  const updateFilter = (idx: number, key: keyof ReportFilter, value: string) => {
    const updated = [...filters];
    updated[idx] = { ...updated[idx], [key]: value };
    onFiltersChange(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">3. Filtros</span>
        </div>
        <Button variant="ghost" size="sm" onClick={addFilter} className="text-xs h-7 text-blue-600 dark:text-blue-400">
          <Plus className="h-3 w-3 mr-1" /> Agregar filtro
        </Button>
      </div>

      {/* Rango de fechas obligatorio */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
          <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
          <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" />
        </div>
      </div>

      {/* Filtros dinámicos */}
      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={f.column || 'none'} onValueChange={(v) => updateFilter(idx, 'column', v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 flex-1">
                  <SelectValue placeholder="Columna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar...</SelectItem>
                  {availableColumns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={f.operator} onValueChange={(v) => updateFilter(idx, 'operator', v)}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={f.value} onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                placeholder="Valor" className="h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 flex-1" />
              <Button variant="ghost" size="sm" onClick={() => removeFilter(idx)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
