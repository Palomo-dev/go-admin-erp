'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter, RotateCcw } from 'lucide-react';
import type { VentasFilters as VentasFiltersType } from './ventasReportService';

interface VentasFiltersProps {
  filters: VentasFiltersType;
  onFiltersChange: (filters: VentasFiltersType) => void;
  branches: { id: number; name: string }[];
  sellers: { id: string; name: string }[];
  isLoading: boolean;
}

export function VentasFilters({
  filters,
  onFiltersChange,
  branches,
  sellers,
  isLoading,
}: VentasFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (key: keyof VentasFiltersType, value: string | number | null) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(today.getDate() - 30);
    onFiltersChange({
      dateFrom: monthAgo.toISOString().split('T')[0],
      dateTo: today.toISOString().split('T')[0],
      branchId: null,
      status: null,
      paymentStatus: null,
      userId: null,
    });
  };

  const hasActiveFilters = filters.branchId || filters.status || filters.paymentStatus || filters.userId;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros</span>
          {hasActiveFilters && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Activos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-7">
              <RotateCcw className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs h-7"
          >
            {expanded ? 'Menos filtros' : 'Más filtros'}
          </Button>
        </div>
      </div>

      {/* Fila principal: fechas + sucursal */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Sucursal</label>
          <Select
            value={filters.branchId?.toString() || 'all'}
            onValueChange={(v) => handleChange('branchId', v === 'all' ? null : Number(v))}
            disabled={isLoading}
          >
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Estado</label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => handleChange('status', v === 'all' ? null : v)}
            disabled={isLoading}
          >
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="completed">Completada</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fila expandida */}
      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Estado pago</label>
            <Select
              value={filters.paymentStatus || 'all'}
              onValueChange={(v) => handleChange('paymentStatus', v === 'all' ? null : v)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="partial">Parcial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Vendedor</label>
            <Select
              value={filters.userId || 'all'}
              onValueChange={(v) => handleChange('userId', v === 'all' ? null : v)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-9 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los vendedores</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
