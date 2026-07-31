'use client';

import { useThemeClasses } from '@/lib/theme';
import { Truck } from 'lucide-react';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({ 
  title = 'Transporte',
  subtitle = 'Panel de control operativo'
}: DashboardHeaderProps) {
  const { themeClass } = useThemeClasses();
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 sm:p-3 bg-blue-100 rounded-xl flex-shrink-0 ${themeClass("", "bg-blue-900/30")}`}>
        <Truck className={`h-6 w-6 sm:h-8 sm:w-8 text-blue-600 ${themeClass("", "text-blue-400")}`} />
      </div>
      <div className="min-w-0">
        <h1 className={`text-xl sm:text-2xl font-bold text-gray-900 ${themeClass("", "text-white")}`}>
          {title}
        </h1>
        <p className={`text-sm text-gray-500 ${themeClass("", "text-gray-400")}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}
