'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/utils/Utils';
import type { OperatingHoursOptions } from '@/lib/utils/timezone';

/**
 * Aplica las horas de operación al inicio de un día.
 * Si no hay operatingHours, usa startOfDay (00:00:00.000).
 * Si hay start_time, ajusta la hora del Date resultante.
 */
function applyStartHours(date: Date, operatingHours?: OperatingHoursOptions | null): Date {
  if (!operatingHours?.start_time) return startOfDay(date);
  const [h, m] = operatingHours.start_time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}

/**
 * Aplica las horas de operación al fin de un día.
 * Si no hay operatingHours, usa endOfDay (23:59:59.999).
 * Si hay end_time, ajusta la hora. Si el día cruza medianoche
 * (end_time <= start_time), suma 1 día al end.
 */
function applyEndHours(date: Date, operatingHours?: OperatingHoursOptions | null): Date {
  if (!operatingHours?.end_time) return endOfDay(date);
  const [h, m] = operatingHours.end_time.split(':').map(Number);
  const result = new Date(date);
  // Si cruza medianoche (end <= start), el fin es el día siguiente
  if (operatingHours?.start_time && operatingHours.end_time <= operatingHours.start_time) {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(h, m, 59, 999);
  return result;
}

export type DateRange = {
  from: Date;
  to: Date;
};

export type DatePreset = 'today' | 'yesterday' | '7days' | '20days' | '90days' | 'custom';

interface DateFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange, preset: DatePreset) => void;
  operatingHours?: OperatingHoursOptions | null;
}

const presets: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7days', label: 'Últimos 7 días' },
  { key: '20days', label: 'Últimos 20 días' },
  { key: '90days', label: 'Últimos 90 días' },
  { key: 'custom', label: 'Personalizado' },
];

export function getDateRangeFromPreset(preset: DatePreset, operatingHours?: OperatingHoursOptions | null): DateRange {
  const today = new Date();

  switch (preset) {
    case 'today':
      return { from: applyStartHours(today, operatingHours), to: applyEndHours(today, operatingHours) };
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return { from: applyStartHours(yesterday, operatingHours), to: applyEndHours(yesterday, operatingHours) };
    case '7days':
      return { from: applyStartHours(subDays(today, 6), operatingHours), to: applyEndHours(today, operatingHours) };
    case '20days':
      return { from: applyStartHours(subDays(today, 19), operatingHours), to: applyEndHours(today, operatingHours) };
    case '90days':
      return { from: applyStartHours(subDays(today, 89), operatingHours), to: applyEndHours(today, operatingHours) };
    default:
      return { from: applyStartHours(today, operatingHours), to: applyEndHours(today, operatingHours) };
  }
}

export function DateFilter({ dateRange, onDateRangeChange, operatingHours }: DateFilterProps) {
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{ from?: Date; to?: Date }>({});

  const handlePresetClick = (preset: DatePreset) => {
    if (preset === 'custom') {
      setActivePreset('custom');
      setIsCalendarOpen(true);
      return;
    }

    setActivePreset(preset);
    const range = getDateRangeFromPreset(preset, operatingHours);
    onDateRangeChange(range, preset);
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setTempRange(range);
    
    if (range.from && range.to) {
      onDateRangeChange(
        { from: applyStartHours(range.from, operatingHours), to: applyEndHours(range.to, operatingHours) },
        'custom'
      );
      setIsCalendarOpen(false);
      setTempRange({});
    }
  };

  const getDisplayLabel = () => {
    if (activePreset === 'custom') {
      return `${format(dateRange.from, 'dd/MM/yy')} - ${format(dateRange.to, 'dd/MM/yy')}`;
    }
    return presets.find(p => p.key === activePreset)?.label || 'Hoy';
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1">
        {presets.slice(0, 5).map((preset) => (
          <Button
            key={preset.key}
            variant={activePreset === preset.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(preset.key)}
            className={cn(
              'text-xs h-8',
              activePreset === preset.key && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Custom date picker */}
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset === 'custom' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'text-xs h-8',
              activePreset === 'custom' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {activePreset === 'custom' ? getDisplayLabel() : 'Personalizado'}
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={tempRange.from ? tempRange : { from: dateRange.from, to: dateRange.to }}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            locale={es}
            disabled={(date) => date > new Date()}
          />
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Selecciona un rango de fechas
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
