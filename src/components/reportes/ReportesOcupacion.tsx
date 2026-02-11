'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Hotel, LogIn, LogOut, BedDouble } from 'lucide-react';
import type { OcupacionData } from './reportesService';

interface ReportesOcupacionProps {
  data: OcupacionData | null;
  isLoading: boolean;
}

export function ReportesOcupacion({ data, isLoading }: ReportesOcupacionProps) {
  if (isLoading) {
    return <Skeleton className="h-44 rounded-xl" />;
  }

  const items = [
    {
      label: 'Total Reservas',
      value: data?.total_reservas ?? 0,
      icon: Hotel,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Check-ins Hoy',
      value: data?.checkins_hoy ?? 0,
      icon: LogIn,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Check-outs Hoy',
      value: data?.checkouts_hoy ?? 0,
      icon: LogOut,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      label: 'Ocupación Actual',
      value: data?.ocupacion_actual ?? 0,
      icon: BedDouble,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <Hotel className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Ocupación Hotelera
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bg}`}>
                <Icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {item.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
