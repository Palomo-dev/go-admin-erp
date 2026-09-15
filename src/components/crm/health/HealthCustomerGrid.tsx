'use client';

import { HeartPulse } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import { HealthGauge } from './HealthGauge';
import { HealthAlerts } from './HealthAlerts';

/**
 * Cuadrícula de clientes monitoreados (F11): tarjetas como botones reales
 * (teclado + lector de pantalla), gauge pequeño y la primera alerta.
 */
export interface HealthCustomerGridProps {
  scores: HealthScoreResult[];
  loading: boolean;
  dimmed?: boolean;
  emptyText: string;
  onSelect: (customerId: string) => void;
  onRecalculate?: () => void;
}

export function HealthCustomerGrid({ scores, loading, dimmed, emptyText, onSelect }: HealthCustomerGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (scores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
          <HeartPulse className="h-6 w-6 text-gray-500" aria-hidden="true" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm">{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${dimmed ? 'opacity-60' : ''}`} aria-label="Clientes monitoreados">
      {scores.map((s) => {
        return (
          <li key={s.customer_id}>
            <button
              type="button"
              onClick={() => onSelect(s.customer_id)}
              aria-label={`Ver detalle de salud de ${s.customer_name}`}
              className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-[box-shadow,border-color] motion-reduce:transition-none"
            >
              <HealthGauge score={s.score} band={s.band} size="sm" />
              <span className="flex-1 min-w-0 block">
                <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{s.customer_name}</span>
                <span className="block mt-1"><HealthAlerts alerts={s.alerts ?? []} compact emptyText="Sin alertas" /></span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default HealthCustomerGrid;
