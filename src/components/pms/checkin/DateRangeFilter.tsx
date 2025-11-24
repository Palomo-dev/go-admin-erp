'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

export type DateRangePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CustomDateRange {
  from?: Date;
  to?: Date;
}

interface DateRangeFilterProps {
  preset: DateRangePreset;
  customDateRange?: CustomDateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomDateRangeChange: (range: CustomDateRange) => void;
}

export function DateRangeFilter({
  preset,
  customDateRange,
  onPresetChange,
  onCustomDateRangeChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Período:
        </span>
      </div>

      <Select value={preset} onValueChange={(value) => onPresetChange(value as DateRangePreset)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoy</SelectItem>
          <SelectItem value="yesterday">Ayer</SelectItem>
          <SelectItem value="last7days">Últimos 7 días</SelectItem>
          <SelectItem value="last30days">Último mes</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <DatePicker
            date={customDateRange?.from}
            onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, from: date })}
            className="w-[170px]"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">hasta</span>
          <DatePicker
            date={customDateRange?.to}
            onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, to: date })}
            className="w-[170px]"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Calcular el rango de fechas basado en el preset
 */
export function getDateRangeFromPreset(
  preset: DateRangePreset,
  customDateRange?: CustomDateRange
): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date = today;

  switch (preset) {
    case 'today':
      startDate = today;
      endDate = today;
      break;

    case 'yesterday':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 1);
      endDate = startDate;
      break;

    case 'last7days':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      endDate = today;
      break;

    case 'last30days':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 29);
      endDate = today;
      break;

    case 'custom':
      if (customDateRange?.from) {
        startDate = new Date(customDateRange.from);
        startDate.setHours(0, 0, 0, 0);
        
        if (customDateRange.to) {
          endDate = new Date(customDateRange.to);
          endDate.setHours(0, 0, 0, 0);
        } else {
          // Si solo hay fecha de inicio, usar la misma para fin
          endDate = startDate;
        }
      } else {
        startDate = today;
        endDate = today;
      }
      break;

    default:
      startDate = today;
      endDate = today;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Obtener texto descriptivo del rango de fechas
 */
export function getDateRangeLabel(preset: DateRangePreset, customDateRange?: CustomDateRange): string {
  const { startDate, endDate } = getDateRangeFromPreset(preset, customDateRange);

  if (startDate === endDate) {
    const date = new Date(startDate + 'T00:00:00');
    
    if (preset === 'today') {
      return 'Hoy';
    } else if (preset === 'yesterday') {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  return `${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
