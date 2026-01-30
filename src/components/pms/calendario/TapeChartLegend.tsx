'use client';

import React from 'react';
import { cn } from '@/utils/Utils';

interface LegendItem {
  label: string;
  color: string;
  type: 'solid' | 'striped';
}

const legendItems: LegendItem[] = [
  { label: 'Confirmada', color: '#3b82f6', type: 'solid' },
  { label: 'Tentativa', color: '#f59e0b', type: 'solid' },
  { label: 'Check-in', color: '#22c55e', type: 'solid' },
  { label: 'Check-out', color: '#6b7280', type: 'solid' },
  { label: 'Mantenimiento', color: '#ef4444', type: 'striped' },
  { label: 'Bloqueo', color: '#8b5cf6', type: 'striped' },
];

export function TapeChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Leyenda:</span>
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div
            className={cn(
              'w-4 h-4 rounded',
              item.type === 'striped' && 'opacity-70'
            )}
            style={{ 
              backgroundColor: item.color,
              backgroundImage: item.type === 'striped' 
                ? 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px)'
                : undefined,
            }}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
