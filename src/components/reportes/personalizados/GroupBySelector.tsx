'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BarChart3 } from 'lucide-react';
import type { ColumnDef } from './reportBuilderService';

interface GroupBySelectorProps {
  availableColumns: ColumnDef[];
  groupBy: string | null;
  metric: 'count' | 'sum' | 'avg' | null;
  metricColumn: string | null;
  onGroupByChange: (v: string | null) => void;
  onMetricChange: (v: 'count' | 'sum' | 'avg' | null) => void;
  onMetricColumnChange: (v: string | null) => void;
}

export function GroupBySelector({
  availableColumns, groupBy, metric, metricColumn,
  onGroupByChange, onMetricChange, onMetricColumnChange,
}: GroupBySelectorProps) {
  const aggregatableColumns = availableColumns.filter((c) => c.aggregatable);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">4. Agrupación y métrica (opcional)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Agrupar por</label>
          <Select value={groupBy || 'none'} onValueChange={(v) => onGroupByChange(v === 'none' ? null : v)}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Sin agrupación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin agrupación</SelectItem>
              {availableColumns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Métrica</label>
          <Select value={metric || 'none'} onValueChange={(v) => onMetricChange(v === 'none' ? null : v as any)} disabled={!groupBy}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna</SelectItem>
              <SelectItem value="count">Conteo</SelectItem>
              <SelectItem value="sum">Suma</SelectItem>
              <SelectItem value="avg">Promedio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Columna métrica</label>
          <Select value={metricColumn || 'none'} onValueChange={(v) => onMetricColumnChange(v === 'none' ? null : v)} disabled={!groupBy || !metric || metric === 'count'}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Seleccionar...</SelectItem>
              {aggregatableColumns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
