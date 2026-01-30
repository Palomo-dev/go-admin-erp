'use client';

import { Truck } from 'lucide-react';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({ 
  title = 'Transporte',
  subtitle = 'Panel de control operativo'
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
        <Truck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
