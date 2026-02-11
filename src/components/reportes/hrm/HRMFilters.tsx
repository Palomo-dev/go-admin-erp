'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter, RotateCcw } from 'lucide-react';
import type { HRMFilters as HRMFiltersType } from './hrmReportService';

interface HRMFiltersProps {
  filters: HRMFiltersType;
  onFiltersChange: (filters: HRMFiltersType) => void;
  branches: { id: number; name: string }[];
  departments: { id: string; name: string }[];
  isLoading: boolean;
}

export function HRMFilters({
  filters, onFiltersChange, branches, departments, isLoading,
}: HRMFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (key: keyof HRMFiltersType, value: string | number | null) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(today.getDate() - 30);
    onFiltersChange({
      dateFrom: monthAgo.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0],
      branchId: null, departmentId: null,
    });
  };

  const hasActive = filters.branchId || filters.departmentId;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros</span>
          {hasActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Activos</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7">
              <RotateCcw className="h-3 w-3 mr-1" /> Limpiar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs h-7">
            {expanded ? 'Menos filtros' : 'Más filtros'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
          <Input type="date" value={filters.dateFrom} onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={isLoading} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
          <Input type="date" value={filters.dateTo} onChange={(e) => handleChange('dateTo', e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={isLoading} />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Sucursal</label>
          <Select value={filters.branchId?.toString() || 'all'} onValueChange={(v) => handleChange('branchId', v === 'all' ? null : Number(v))} disabled={isLoading}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Departamento</label>
          <Select value={filters.departmentId || 'all'} onValueChange={(v) => handleChange('departmentId', v === 'all' ? null : v)} disabled={isLoading}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
