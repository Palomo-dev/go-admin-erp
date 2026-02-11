'use client';

import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter, RotateCcw } from 'lucide-react';
import type { AuditoriaFilters as AuditoriaFiltersType } from './auditoriaReportService';

interface AuditoriaFiltersProps {
  filters: AuditoriaFiltersType;
  onFiltersChange: (filters: AuditoriaFiltersType) => void;
  isLoading: boolean;
}

export function AuditoriaFilters({
  filters, onFiltersChange, isLoading,
}: AuditoriaFiltersProps) {
  const handleChange = (key: keyof AuditoriaFiltersType, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(today.getDate() - 30);
    onFiltersChange({
      dateFrom: monthAgo.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0],
      module: null, action: null, userId: null,
    });
  };

  const hasActive = filters.module || filters.action;

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
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7">
            <RotateCcw className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        )}
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
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Módulo</label>
          <Select value={filters.module || 'all'} onValueChange={(v) => handleChange('module', v === 'all' ? null : v)} disabled={isLoading}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los módulos</SelectItem>
              <SelectItem value="ops">Operaciones</SelectItem>
              <SelectItem value="finance">Finanzas</SelectItem>
              <SelectItem value="products">Productos</SelectItem>
              <SelectItem value="roles">Roles</SelectItem>
              <SelectItem value="integration">Integraciones</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Acción</label>
          <Select value={filters.action || 'all'} onValueChange={(v) => handleChange('action', v === 'all' ? null : v)} disabled={isLoading}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="create">Crear</SelectItem>
              <SelectItem value="update">Actualizar</SelectItem>
              <SelectItem value="delete">Eliminar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
