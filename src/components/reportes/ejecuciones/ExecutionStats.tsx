'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, XCircle, Loader2, Clock, Database, Timer,
} from 'lucide-react';
import { ExecutionStats as Stats } from './executionReportService';

interface ExecutionStatsProps {
  data: Stats | null;
  isLoading: boolean;
}

const cards = [
  { key: 'total', label: 'Total', icon: Database, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { key: 'completed', label: 'Completados', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  { key: 'failed', label: 'Errores', icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  { key: 'running', label: 'Ejecutando', icon: Loader2, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { key: 'avgDuration', label: 'Duración prom.', icon: Timer, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', suffix: 'ms' },
  { key: 'totalRows', label: 'Filas totales', icon: Clock, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
] as const;

export function ExecutionStatsComponent({ data, isLoading }: ExecutionStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = data[card.key as keyof Stats] ?? 0;
        const suffix = 'suffix' in card ? card.suffix : '';
        return (
          <div
            key={card.key}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-lg ${card.bg}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {typeof value === 'number' ? value.toLocaleString('es-CO') : value}{suffix}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
