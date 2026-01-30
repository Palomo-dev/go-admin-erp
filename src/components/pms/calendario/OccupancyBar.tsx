'use client';

import React from 'react';
import { cn } from '@/utils/Utils';
import type { OccupancyData } from '@/lib/services/tapeChartService';

interface OccupancyBarProps {
  data: OccupancyData[];
  isLoading?: boolean;
}

export function OccupancyBar({ data, isLoading = false }: OccupancyBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Ocupación:</span>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0">Ocupación:</span>
      <div className="flex gap-0.5">
        {data.map((day) => {
          const getColor = (percentage: number) => {
            if (percentage >= 90) return 'bg-red-500';
            if (percentage >= 70) return 'bg-orange-500';
            if (percentage >= 50) return 'bg-yellow-500';
            if (percentage >= 30) return 'bg-blue-500';
            return 'bg-green-500';
          };

          return (
            <div
              key={day.date}
              className="flex flex-col items-center"
              title={`${day.date}: ${day.occupied}/${day.total} (${day.percentage}%)`}
            >
              <div className="w-8 h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden relative">
                <div
                  className={cn('absolute bottom-0 left-0 right-0 transition-all', getColor(day.percentage))}
                  style={{ height: `${day.percentage}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-400 mt-0.5">{day.percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
