'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Bus } from 'lucide-react';
import {
  DateFilter,
  type DateRange,
  type DatePreset,
} from '@/components/pms/dashboard';

interface TransportHeaderProps {
  onRefresh: () => void;
  isLoading?: boolean;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange, preset: DatePreset) => void;
}

export function TransportHeader({ 
  onRefresh, 
  isLoading,
  dateRange,
  onDateRangeChange,
}: TransportHeaderProps) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Bus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Panel de Control Transporte
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {today}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={isLoading}
          className="self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>
      
      <DateFilter
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />
    </div>
  );
}
