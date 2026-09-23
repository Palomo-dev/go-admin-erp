'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Filter } from 'lucide-react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { sumarDiasAlDia, sumarMesesAlDia } from '@/lib/services/fiscalCalendar';

export interface ReportFiltersState {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month';
  vehicleType: string;
}

interface ReportesFiltersProps {
  filters: ReportFiltersState;
  onFiltersChange: (filters: ReportFiltersState) => void;
}

export function ReportesFilters({ filters, onFiltersChange }: ReportesFiltersProps) {
  // «Hoy» es el dia del parqueadero, no el del navegador ni el de UTC: el
  // servicio convierte estos dos dias en instantes con el offset de la misma
  // zona (`getDateRange`), asi que el rango tiene que salir de ella.
  const { getToday } = useFormatDate();

  // Función para establecer rangos predefinidos
  const setPresetRange = (preset: 'today' | 'week' | 'month' | 'year') => {
    const today = getToday();
    let startDate: string;

    switch (preset) {
      case 'today':
        startDate = today;
        break;
      case 'week':
        startDate = sumarDiasAlDia(today, -7);
        break;
      case 'month':
        // Un mes calendario atras, no 30 dias: `sumarMesesAlDia` recorta al
        // ultimo dia del mes en vez de desbordar (31 de marzo -> 28 de febrero).
        startDate = sumarMesesAlDia(today, -1);
        break;
      case 'year':
        startDate = sumarMesesAlDia(today, -12);
        break;
    }

    onFiltersChange({
      ...filters,
      startDate,
      endDate: today,
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-gray-900 dark:text-white">Filtros</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Fecha inicio */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Desde</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
              className="pl-10 dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        {/* Fecha fin */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Hasta</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
              className="pl-10 dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        {/* Agrupar por */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Agrupar por</Label>
          <Select
            value={filters.groupBy}
            onValueChange={(value: 'day' | 'week' | 'month') =>
              onFiltersChange({ ...filters, groupBy: value })
            }
          >
            <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tipo de vehículo */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Tipo Vehículo</Label>
          <Select
            value={filters.vehicleType}
            onValueChange={(value) => onFiltersChange({ ...filters, vehicleType: value })}
          >
            <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="car">Carro</SelectItem>
              <SelectItem value="motorcycle">Moto</SelectItem>
              <SelectItem value="bicycle">Bicicleta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rangos predefinidos */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Rango rápido</Label>
          <div className="flex gap-1">
            <button
              onClick={() => setPresetRange('today')}
              className="px-2 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={() => setPresetRange('week')}
              className="px-2 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 transition-colors"
            >
              7D
            </button>
            <button
              onClick={() => setPresetRange('month')}
              className="px-2 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 transition-colors"
            >
              30D
            </button>
            <button
              onClick={() => setPresetRange('year')}
              className="px-2 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 transition-colors"
            >
              1A
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportesFilters;
