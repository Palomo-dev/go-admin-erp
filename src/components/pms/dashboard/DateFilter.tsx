'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/utils/Utils';

export type DateRange = {
  from: Date;
  to: Date;
};

export type DatePreset = 'today' | 'yesterday' | '7days' | '20days' | '90days' | 'custom';

interface DateFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange, preset: DatePreset) => void;
}

const presets: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7days', label: 'Últimos 7 días' },
  { key: '20days', label: 'Últimos 20 días' },
  { key: '90days', label: 'Últimos 90 días' },
  { key: 'custom', label: 'Personalizado' },
];

export function getDateRangeFromPreset(preset: DatePreset): DateRange {
  const today = new Date();
  
  switch (preset) {
    case 'today':
      return { from: startOfDay(today), to: endOfDay(today) };
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    case '7days':
      return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) };
    case '20days':
      return { from: startOfDay(subDays(today, 19)), to: endOfDay(today) };
    case '90days':
      return { from: startOfDay(subDays(today, 89)), to: endOfDay(today) };
    default:
      return { from: startOfDay(today), to: endOfDay(today) };
  }
}

export function DateFilter({ dateRange, onDateRangeChange }: DateFilterProps) {
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
    const range = getDateRangeFromPreset(preset);
    onDateRangeChange(range, preset);
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setTempRange(range);
    
    if (range.from && range.to) {
      onDateRangeChange(
        { from: startOfDay(range.from), to: endOfDay(range.to) },
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
