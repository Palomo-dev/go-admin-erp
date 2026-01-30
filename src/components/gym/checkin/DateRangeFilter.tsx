'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRangePreset, getDateRange } from '@/lib/services/gymCheckinService';

interface DateRangeFilterProps {
  preset: DateRangePreset;
  customFrom?: Date;
  customTo?: Date;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange: (from: Date, to: Date) => void;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7days', label: 'Últimos 7 días' },
  { value: '20days', label: 'Últimos 20 días' },
  { value: '90days', label: 'Últimos 90 días' },
];

export function DateRangeFilter({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomRangeChange,
}: DateRangeFilterProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(customFrom);
  const [tempTo, setTempTo] = useState<Date | undefined>(customTo);

  const handlePresetClick = (newPreset: DateRangePreset) => {
    if (newPreset === 'custom') {
      setIsCustomOpen(true);
    } else {
      onPresetChange(newPreset);
    }
  };

  const handleApplyCustom = () => {
    if (tempFrom && tempTo) {
      onCustomRangeChange(tempFrom, tempTo);
      onPresetChange('custom');
    }
    setIsCustomOpen(false);
  };

  const getDisplayLabel = () => {
    if (preset === 'custom' && customFrom && customTo) {
      return `${format(customFrom, 'dd/MM/yy')} - ${format(customTo, 'dd/MM/yy')}`;
    }
    return PRESETS.find(p => p.value === preset)?.label || 'Hoy';
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Botones de presets */}
      {PRESETS.map((p) => (
        <Button
          key={p.value}
          variant={preset === p.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick(p.value)}
          className={cn(
            preset === p.value
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
        >
          {p.label}
        </Button>
      ))}

      {/* Botón personalizado con popover */}
      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={preset === 'custom' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'min-w-[140px] justify-between',
              preset === 'custom'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {preset === 'custom' ? getDisplayLabel() : 'Personalizado'}
            </span>
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Desde
                </label>
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={setTempFrom}
                  locale={es}
                  disabled={(date) => date > new Date()}
                  className="rounded-md border"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Hasta
                </label>
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={setTempTo}
                  locale={es}
                  disabled={(date) => date > new Date() || (tempFrom ? date < tempFrom : false)}
                  className="rounded-md border"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCustomOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleApplyCustom}
                disabled={!tempFrom || !tempTo}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateRangeFilter;
