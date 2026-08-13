'use client';

import { Calendar, CalendarDays, CalendarRange, CalendarClock, CalendarHeart } from 'lucide-react';
import type { PeriodoDashboard } from './inicioService';
import { cn } from '@/utils/Utils';

interface PeriodoSelectorProps {
  value: PeriodoDashboard;
  onChange: (periodo: PeriodoDashboard) => void;
}

const OPCIONES: { value: PeriodoDashboard; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'hoy', label: 'Hoy', icon: CalendarClock },
  { value: '7d', label: '7 días', icon: Calendar },
  { value: '30d', label: '30 días', icon: CalendarDays },
  { value: '90d', label: '90 días', icon: CalendarRange },
  { value: 'año', label: 'Año', icon: CalendarHeart },
];

export function PeriodoSelector({ value, onChange }: PeriodoSelectorProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {OPCIONES.map((opt) => {
        const Icon = opt.icon;
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            aria-pressed={isActive}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
