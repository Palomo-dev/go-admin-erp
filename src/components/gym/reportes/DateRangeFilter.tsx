'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

interface Preset {
  key: PresetKey;
  label: string;
  getRange: () => DateRange;
}

const presets: Preset[] = [
  {
    key: 'today',
    label: 'Hoy',
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { from: today, to: end };
    }
  },
  {
    key: 'yesterday',
    label: 'Ayer',
    getRange: () => {
      const yesterday = subDays(new Date(), 1);
      yesterday.setHours(0, 0, 0, 0);
      const end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
      return { from: yesterday, to: end };
    }
  },
  {
    key: 'last7',
    label: 'Últimos 7 días',
    getRange: () => {
      const from = subDays(new Date(), 6);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
  },
  {
    key: 'last30',
    label: 'Últimos 30 días',
    getRange: () => {
      const from = subDays(new Date(), 29);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
  },
  {
    key: 'last90',
    label: 'Últimos 90 días',
    getRange: () => {
      const from = subDays(new Date(), 89);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
  },
  {
    key: 'thisMonth',
    label: 'Este mes',
    getRange: () => {
      const from = startOfMonth(new Date());
      const to = endOfMonth(new Date());
      return { from, to };
    }
  },
  {
    key: 'lastMonth',
    label: 'Mes anterior',
    getRange: () => {
      const lastMonth = subMonths(new Date(), 1);
      const from = startOfMonth(lastMonth);
      const to = endOfMonth(lastMonth);
      return { from, to };
    }
  },
  {
    key: 'thisYear',
    label: 'Este año',
    getRange: () => {
      const from = startOfYear(new Date());
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
  },
];

export function DateRangeFilter({ dateRange, onDateRangeChange }: DateRangeFilterProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>('last30');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const handlePresetClick = (preset: Preset) => {
    setActivePreset(preset.key);
    onDateRangeChange(preset.getRange());
  };

  const formatDateRange = () => {
    if (!dateRange.from || !dateRange.to) return 'Seleccionar rango';
    if (format(dateRange.from, 'yyyy-MM-dd') === format(dateRange.to, 'yyyy-MM-dd')) {
      return format(dateRange.from, 'dd MMM yyyy', { locale: es });
    }
    return `${format(dateRange.from, 'dd MMM', { locale: es })} - ${format(dateRange.to, 'dd MMM yyyy', { locale: es })}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Botones de presets */}
      <div className="flex flex-wrap gap-1">
        {presets.slice(0, 5).map((preset) => (
          <Button
            key={preset.key}
            variant={activePreset === preset.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(preset)}
            className={cn(
              'h-8 px-3 text-xs',
              activePreset === preset.key && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Dropdown para más opciones */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
            Más...
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1">
            {presets.slice(5).map((preset) => (
              <Button
                key={preset.key}
                variant={activePreset === preset.key ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  handlePresetClick(preset);
                }}
                className="justify-start text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selector de rango personalizado */}
      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset === 'custom' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-8 px-3 text-xs gap-2',
              activePreset === 'custom' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {activePreset === 'custom' ? formatDateRange() : 'Personalizado'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3 border-b">
            <p className="text-sm font-medium">Seleccionar rango de fechas</p>
            <p className="text-xs text-gray-500">{formatDateRange()}</p>
          </div>
          <div className="flex">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range: { from?: Date; to?: Date } | undefined) => {
                if (range?.from && range?.to) {
                  setActivePreset('custom');
                  onDateRangeChange({ from: range.from, to: range.to });
                } else if (range?.from) {
                  onDateRangeChange({ from: range.from, to: range.from });
                }
              }}
              numberOfMonths={2}
              locale={es}
              className="rounded-md"
            />
          </div>
          <div className="p-3 border-t flex justify-end">
            <Button size="sm" onClick={() => setIsCustomOpen(false)}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
